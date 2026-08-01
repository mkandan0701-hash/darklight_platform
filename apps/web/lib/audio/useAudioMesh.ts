"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  acceptOfferAndAnswer,
  createAudioPeerConnection,
  createOffer,
  describeMediaError,
  type AudioSignal,
} from "./peerConnection";
import {
  isAtCapacity,
  participantsReducer,
  shouldInitiateTo,
  type Participant,
} from "./participants";

export type AudioStatus = "idle" | "connecting" | "live";

export type RemoteAudio = { peerId: string; stream: MediaStream };

// A full-mesh WebRTC audio call over the live session's Socket.io connection.
// The server only brokers signalling — media flows browser to browser.
export function useAudioMesh({
  socketRef,
  liveSessionId,
  socketConnected,
}: {
  socketRef: React.MutableRefObject<Socket | null>;
  liveSessionId: string;
  socketConnected: boolean;
}) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [participants, dispatch] = useReducer(participantsReducer, []);
  const [remoteAudio, setRemoteAudio] = useState<RemoteAudio[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const myPeerIdRef = useRef<string | null>(null);
  // Candidates can arrive before the offer that gives us a remote
  // description; addIceCandidate would throw, so they queue until then.
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());

  const emitSignal = useCallback(
    (toPeerId: string, signal: AudioSignal) => {
      socketRef.current?.emit("audio-signal", {
        liveSessionId,
        toPeerId,
        signal,
      });
    },
    [liveSessionId, socketRef]
  );

  const closePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemoteAudio((current) => current.filter((entry) => entry.peerId !== peerId));
  }, []);

  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnection | null => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const localStream = localStreamRef.current;
      if (!localStream) return null;

      const pc = createAudioPeerConnection({
        localStream,
        onSignal: (signal) => emitSignal(peerId, signal),
        onTrack: (stream) => {
          setRemoteAudio((current) =>
            current.some((entry) => entry.peerId === peerId)
              ? current.map((entry) => (entry.peerId === peerId ? { peerId, stream } : entry))
              : [...current, { peerId, stream }]
          );
        },
        onConnectedChange: (connected) =>
          dispatch({ type: "connection-state", peerId, connected }),
      });
      peersRef.current.set(peerId, pc);
      return pc;
    },
    [emitSignal]
  );

  const leave = useCallback(() => {
    socketRef.current?.emit("audio-leave", { liveSessionId });
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    myPeerIdRef.current = null;
    dispatch({ type: "reset" });
    setRemoteAudio([]);
    setStatus("idle");
  }, [closePeer, liveSessionId, socketRef]);

  const join = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || status !== "idle") return;

    setError(null);
    setStatus("connecting");
    try {
      // Deliberately user-initiated: this is the browser's mic permission
      // prompt, and nobody should find themselves live without asking.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicEnabled(true);
    } catch (err) {
      setError(describeMediaError(err));
      setStatus("idle");
      return;
    }

    socket.emit(
      "audio-join",
      { liveSessionId },
      (ok: boolean, peerId?: string, joinError?: string) => {
        if (!ok || !peerId) {
          setError(joinError ?? "Could not join audio");
          leave();
          return;
        }
        myPeerIdRef.current = peerId;
        setStatus("live");
      }
    );
  }, [leave, liveSessionId, socketRef, status]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    // Disabling the track keeps the connection up and sends silence, which is
    // what a mute button should do — renegotiating would drop the call.
    const next = !stream.getAudioTracks().every((track) => track.enabled);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }, []);

  // Signalling listeners. Bound once the socket is live and torn down with it.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketConnected) return;

    async function onPeerJoined({
      peerId,
      userId,
      name,
    }: {
      peerId: string;
      userId: string;
      name: string;
    }) {
      if (!shouldInitiateTo(myPeerIdRef.current, peerId)) return;
      dispatch({ type: "joined", peerId, userId, name });

      // We were already here, so we open the connection; the newcomer waits.
      const pc = ensurePeer(peerId);
      if (!pc) return;
      const offer = await createOffer(pc);
      emitSignal(peerId, { kind: "description", description: offer });
    }

    async function onSignal({
      fromPeerId,
      signal,
    }: {
      fromPeerId: string;
      signal: AudioSignal;
    }) {
      const pc = ensurePeer(fromPeerId);
      if (!pc) return;

      if (signal.kind === "candidate") {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal.candidate).catch(() => {
            // A candidate that arrives after the pair has already settled is
            // routine, not an error worth surfacing to a coach mid-lesson.
          });
        } else {
          const queued = pendingCandidatesRef.current.get(fromPeerId) ?? [];
          queued.push(signal.candidate);
          pendingCandidatesRef.current.set(fromPeerId, queued);
        }
        return;
      }

      const { description } = signal;
      if (description.type === "offer") {
        const answer = await acceptOfferAndAnswer(pc, description);
        emitSignal(fromPeerId, { kind: "description", description: answer });
      } else if (description.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
      }

      const queued = pendingCandidatesRef.current.get(fromPeerId);
      if (queued) {
        for (const candidate of queued) {
          await pc.addIceCandidate(candidate).catch(() => {});
        }
        pendingCandidatesRef.current.delete(fromPeerId);
      }
    }

    function onPeerLeft({ peerId }: { peerId: string }) {
      closePeer(peerId);
      dispatch({ type: "left", peerId });
    }

    socket.on("audio-peer-joined", onPeerJoined);
    socket.on("audio-signal", onSignal);
    socket.on("audio-peer-left", onPeerLeft);
    return () => {
      socket.off("audio-peer-joined", onPeerJoined);
      socket.off("audio-signal", onSignal);
      socket.off("audio-peer-left", onPeerLeft);
    };
  }, [closePeer, emitSignal, ensurePeer, socketConnected, socketRef]);

  // Release the microphone if the page unmounts mid-call, so the browser's
  // recording indicator doesn't linger.
  useEffect(() => {
    return () => {
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    status,
    participants: participants as Participant[],
    remoteAudio,
    micEnabled,
    error,
    atCapacity: isAtCapacity(participants.length),
    join,
    leave,
    toggleMic,
  };
}
