"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { useElementWidth } from "../lib/useElementWidth";
import { tryMove } from "../lib/chess/tryMove";
import { formatTimeInZone } from "../lib/time";
import { useAudioMesh } from "../lib/audio/useAudioMesh";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { fieldInputClass } from "./ui/Field";
import { sectionHeadingClass } from "./ui/styles";
import type { Role } from "@chessplay-clone/shared";

type Arrow = { from: string; to: string; authorRole: Role };

type ChatMessage = {
  id: string;
  body: string;
  authorUserId: string;
  authorRole: Role;
  authorName: string;
  sentAtUtc: string;
};

// react-chessboard takes CSS colours, not Tailwind classes, so these are the
// literal theme values from tailwind.config.ts.
const COACH_ARROW = "#C9A227";
const STUDENT_ARROW = "#1F6D4C";

export function LiveBoard({
  liveSessionId,
  role,
  timezone,
}: {
  liveSessionId: string;
  role: Role;
  timezone: string;
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [refFen, setRefFen] = useState(new Chess().fen());
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [arrowStart, setArrowStart] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [refFenDraft, setRefFenDraft] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const isCoach = role === "COACH";
  const [sharedBoardRef, sharedBoardWidth] = useElementWidth<HTMLDivElement>(360);
  const [refBoardRef, refBoardWidth] = useElementWidth<HTMLDivElement>(360);
  const audio = useAudioMesh({ socketRef, liveSessionId, socketConnected: connected });

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession) {
        setError("Not signed in");
        return;
      }
      if (cancelled) return;

      const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
        auth: { token: authSession.access_token },
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        // The ack carries the room's current position, so a client joining
        // mid-lesson starts from the real board rather than a fresh one.
        socket.emit(
          "join-room",
          { liveSessionId, room: "shared" },
          (ok: boolean, currentFen?: string, joinError?: string) => {
            if (!ok) setError(joinError ?? "Could not join session");
            else if (currentFen) setFen(currentFen);
          }
        );
        if (isCoach) {
          socket.emit(
            "join-room",
            { liveSessionId, room: "coach" },
            (ok: boolean, currentFen?: string, joinError?: string) => {
              if (!ok) setError(joinError ?? "Could not join reference board");
              else if (currentFen) setRefFen(currentFen);
            }
          );
        }
      });

      socket.on("connect_error", (err: Error) => setError(err.message));
      socket.on("disconnect", () => setConnected(false));

      socket.on("game-state", ({ fen: nextFen }: { fen: string }) => {
        setFen(nextFen);
      });

      // The server is authoritative for the reference board too now, so this
      // is a whole position rather than a move to replay locally.
      socket.on("ref-board-state", ({ fen: nextFen }: { fen: string }) => {
        setRefFen(nextFen);
      });

      socket.on("draw-arrow", (arrow: Arrow) => {
        setArrows((current) => [...current, arrow]);
      });
      socket.on("clear-arrows", () => setArrows([]));
      socket.on("flip-board", () => setFlipped((current) => !current));
      socket.on("chat-message", (message: ChatMessage) => {
        setMessages((current) => [...current, message]);
      });
    }

    connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [liveSessionId, isCoach]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function handleSharedDrop(sourceSquare: Square, targetSquare: Square): boolean {
    // Local legality check for instant UI feedback; the server's `game-state`
    // broadcast remains the authoritative source of truth for `fen`.
    const check = new Chess(fen);
    const move = tryMove(check, { from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    setFen(check.fen());
    socketRef.current?.emit(
      "move",
      { liveSessionId, from: sourceSquare, to: targetSquare, promotion: "q" },
      (ok: boolean, serverFen?: string, moveError?: string) => {
        // On rejection the server hands back the real position — including
        // when we lost a race to a simultaneous move — so snap to it rather
        // than leaving the optimistic one on screen.
        if (!ok) {
          if (serverFen) setFen(serverFen);
          setError(moveError ?? "Illegal move");
        }
      }
    );
    return true;
  }

  function handleRefDrop(sourceSquare: Square, targetSquare: Square): boolean {
    socketRef.current?.emit(
      "ref-board-move",
      { liveSessionId, from: sourceSquare, to: targetSquare, promotion: "q" },
      (ok: boolean, moveError?: string) => {
        if (!ok) setError(moveError ?? "Illegal move on the reference board");
      }
    );
    return true;
  }

  // Two right-clicks rather than a right-drag: the first marks the origin, the
  // second completes the arrow. react-chessboard's own arrow drawing is local
  // to one browser, and these have to reach the room.
  const handleSquareRightClick = useCallback(
    (square: Square) => {
      setArrowStart((start) => {
        if (!start) return square;
        if (start !== square) {
          socketRef.current?.emit("draw-arrow", {
            liveSessionId,
            from: start,
            to: square,
          });
        }
        return null;
      });
    },
    [liveSessionId]
  );

  function sendChat() {
    const body = draft.trim();
    if (!body) return;
    socketRef.current?.emit("chat-message", { liveSessionId, body }, (ok: boolean) => {
      if (!ok) setError("Message could not be sent");
    });
    setDraft("");
  }

  function loadRefBoard() {
    const candidate = refFenDraft.trim();
    if (!candidate) return;
    socketRef.current?.emit(
      "ref-board-load",
      { liveSessionId, fen: candidate },
      (ok: boolean, loadError?: string) => {
        if (!ok) setError(loadError ?? "Could not load that position");
        else setRefFenDraft("");
      }
    );
  }

  const customArrows = arrows.map(
    (arrow) =>
      [
        arrow.from as Square,
        arrow.to as Square,
        arrow.authorRole === "COACH" ? COACH_ARROW : STUDENT_ARROW,
      ] as [Square, Square, string]
  );

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
        {audio.status === "idle" ? (
          <Button type="button" onClick={audio.join} disabled={!connected}>
            Join audio
          </Button>
        ) : (
          <>
            <Button variant="secondary" type="button" onClick={audio.leave}>
              Leave audio
            </Button>
            <Button
              variant={audio.micEnabled ? "secondary" : "destructive"}
              type="button"
              onClick={audio.toggleMic}
              aria-pressed={!audio.micEnabled}
            >
              {audio.micEnabled ? "Mute" : "Unmute"}
            </Button>
          </>
        )}

        {audio.status === "connecting" && <span className="text-xs text-slate">Connecting…</span>}
        {audio.status === "live" && audio.participants.length === 0 && (
          <span className="text-xs text-slate">You&rsquo;re the only one on audio.</span>
        )}
        {audio.participants.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {audio.participants.map((participant) => (
              <li key={participant.peerId}>
                <Badge tone={participant.connected ? "success" : "muted"}>
                  {participant.name}
                  {!participant.connected && " (connecting…)"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {audio.atCapacity && (
          <span className="text-xs text-brick">
            Audio is full. Everyone connects to everyone, so it&rsquo;s capped for call quality.
          </span>
        )}
        {audio.error && <span className="text-xs text-brick">{audio.error}</span>}

        {/* Remote audio is played, never rendered — the participant chips above
            are the visible surface. */}
        {audio.remoteAudio.map((entry) => (
          <audio
            key={entry.peerId}
            autoPlay
            ref={(element) => {
              if (element && element.srcObject !== entry.stream) {
                element.srcObject = entry.stream;
              }
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-[420px] sm:w-auto">
        <h2 className={`${sectionHeadingClass} mb-2 text-sm`}>Shared board</h2>
        <div
          ref={sharedBoardRef}
          className="rounded-xl border border-ink/10 bg-white p-3 shadow-sm"
        >
          <Chessboard
            position={fen}
            onPieceDrop={handleSharedDrop}
            onSquareRightClick={handleSquareRightClick}
            boardWidth={sharedBoardWidth}
            boardOrientation={flipped ? "black" : "white"}
            customArrows={customArrows}
            areArrowsAllowed={false}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              // A coach flips the room; a student flips only their own view, so
              // looking from the other side doesn't drag everyone along.
              if (isCoach) socketRef.current?.emit("flip-board", { liveSessionId });
              else setFlipped((current) => !current);
            }}
          >
            Flip board
          </Button>
          {isCoach && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => socketRef.current?.emit("clear-arrows", { liveSessionId })}
            >
              Clear arrows
            </Button>
          )}
          <p className="text-xs text-slate">
            {arrowStart
              ? `Arrow from ${arrowStart} — right-click the target square`
              : "Right-click two squares to draw an arrow"}
          </p>
        </div>
      </div>

      {isCoach && (
        <div className="w-full max-w-[420px] sm:w-auto">
          <h2 className={`${sectionHeadingClass} mb-2 text-sm`}>
            Reference board <span className="font-mono text-xs text-gold">(coach only)</span>
          </h2>
          <div
            ref={refBoardRef}
            className="rounded-xl border border-ink/10 bg-white p-3 shadow-sm"
          >
            <Chessboard
              position={refFen}
              onPieceDrop={handleRefDrop}
              boardWidth={refBoardWidth}
              areArrowsAllowed={false}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className={`${fieldInputClass} min-w-0 flex-1 font-mono text-xs`}
                value={refFenDraft}
                onChange={(event) => setRefFenDraft(event.target.value)}
                placeholder="Paste a FEN to set up your prep position"
                aria-label="Reference board FEN"
              />
              <Button variant="secondary" type="button" onClick={loadRefBoard}>
                Load
              </Button>
            </div>
            <Button
              variant="secondary"
              type="button"
              className="self-start"
              onClick={() => socketRef.current?.emit("ref-board-clear", { liveSessionId })}
            >
              Reset to start
            </Button>
            <p className="text-xs text-slate">
              Saved to this session — it will still be here if you close the tab.
            </p>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-[420px] flex-col sm:w-72">
        <h2 className={`${sectionHeadingClass} mb-2 text-sm`}>Chat</h2>
        <div className="flex h-[320px] flex-col gap-2 overflow-y-auto rounded-xl border border-ink/10 bg-white p-3 text-sm shadow-sm">
          {messages.length === 0 && (
            <p className="text-xs text-slate">No messages yet.</p>
          )}
          {messages.map((message) => (
            <div key={message.id}>
              <p className="text-xs text-slate">
                <span
                  className={
                    message.authorRole === "COACH" ? "font-medium text-gold" : "font-medium"
                  }
                >
                  {message.authorName}
                </span>{" "}
                {/* Rendered in this viewer's zone, not the sender's. */}
                {formatTimeInZone(message.sentAtUtc, timezone)}
              </p>
              <p className="text-ink">{message.body}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}
        >
          <input
            className={`${fieldInputClass} min-w-0 flex-1`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder="Message the class"
            aria-label="Chat message"
          />
          <Button type="submit">Send</Button>
        </form>
      </div>

      <div className="w-full text-sm">
        {!connected && !error && <p className="text-slate">Connecting…</p>}
        {error && <p className="text-brick">{error}</p>}
      </div>
    </div>
  );
}
