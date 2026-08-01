import { getIceServers } from "./iceServers";

export type AudioSignal =
  | { kind: "description"; description: RTCSessionDescriptionInit }
  | { kind: "candidate"; candidate: RTCIceCandidateInit };

// One peer connection per remote participant (a mesh). Audio only — no video
// track is ever requested or added, per claude.md §9: Wave 2 is audio-first
// and video is post-Wave-4.
export function createAudioPeerConnection(params: {
  localStream: MediaStream;
  onSignal: (signal: AudioSignal) => void;
  onTrack: (stream: MediaStream) => void;
  onConnectedChange: (connected: boolean) => void;
}): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: getIceServers() });

  for (const track of params.localStream.getAudioTracks()) {
    pc.addTrack(track, params.localStream);
  }

  pc.onicecandidate = (event) => {
    // A null candidate marks the end of gathering; there's nothing to relay.
    if (event.candidate) {
      params.onSignal({ kind: "candidate", candidate: event.candidate.toJSON() });
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) params.onTrack(stream);
  };

  pc.onconnectionstatechange = () => {
    params.onConnectedChange(pc.connectionState === "connected");
  };

  return pc;
}

export async function createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function acceptOfferAndAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

// Maps the browser's getUserMedia failures onto something a coach mid-lesson
// can act on. The raw DOMException names are useless in the UI.
export function describeMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was blocked. Allow it in your browser's address bar, then rejoin.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone found. Plug one in or select one in your system settings, then rejoin.";
    case "NotReadableError":
      return "Your microphone is in use by another app. Close it and rejoin.";
    default:
      return "Could not start audio. Check your microphone and try again.";
  }
}
