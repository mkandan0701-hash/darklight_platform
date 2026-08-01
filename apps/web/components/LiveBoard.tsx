"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { useElementWidth } from "../lib/useElementWidth";
import { tryMove } from "../lib/chess/tryMove";
import type { Role } from "@chessplay-clone/shared";

export function LiveBoard({
  liveSessionId,
  role,
}: {
  liveSessionId: string;
  role: Role;
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [refFen, setRefFen] = useState(new Chess().fen());
  const socketRef = useRef<Socket | null>(null);
  const isCoach = role === "COACH";
  const [sharedBoardRef, sharedBoardWidth] = useElementWidth<HTMLDivElement>(360);
  const [refBoardRef, refBoardWidth] = useElementWidth<HTMLDivElement>(360);

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
        socket.emit(
          "join-room",
          { liveSessionId, room: "shared" },
          (ok: boolean, joinError?: string) => {
            if (!ok) setError(joinError ?? "Could not join session");
          }
        );
        if (isCoach) {
          socket.emit(
            "join-room",
            { liveSessionId, room: "coach" },
            (ok: boolean, joinError?: string) => {
              if (!ok) setError(joinError ?? "Could not join reference board");
            }
          );
        }
      });

      socket.on("connect_error", (err: Error) => setError(err.message));
      socket.on("disconnect", () => setConnected(false));

      socket.on("game-state", ({ fen: nextFen }: { fen: string }) => {
        setFen(nextFen);
      });

      socket.on(
        "ref-board-move",
        (payload: { from: string; to: string; promotion?: string }) => {
          setRefFen((current) => {
            // Relayed from another client, so it can be illegal on this board
            // if the two have diverged — and an unguarded chess.js move()
            // would throw here, inside a setState updater.
            const game = new Chess(current);
            const move = tryMove(game, {
              from: payload.from,
              to: payload.to,
              promotion: payload.promotion ?? "q",
            });
            return move ? game.fen() : current;
          });
        }
      );
    }

    connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [liveSessionId, isCoach]);

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
      (ok: boolean, _fen?: string, moveError?: string) => {
        if (!ok) setError(moveError ?? "Illegal move");
      }
    );
    return true;
  }

  function handleRefDrop(sourceSquare: Square, targetSquare: Square): boolean {
    // The reference board isn't legality-checked server-side (it's the
    // coach's own prep board) — the server just relays the move back to the
    // coach room, including the sender, so `refFen` updates on receipt.
    socketRef.current?.emit("ref-board-move", {
      liveSessionId,
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    return true;
  }

  return (
    <div className="flex flex-wrap gap-8">
      <div className="w-full max-w-[420px] sm:w-auto">
        <h2 className="mb-2 text-sm font-medium text-slate">Shared board</h2>
        <div ref={sharedBoardRef} className="rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
          <Chessboard position={fen} onPieceDrop={handleSharedDrop} boardWidth={sharedBoardWidth} />
        </div>
      </div>
      {isCoach && (
        <div className="w-full max-w-[420px] sm:w-auto">
          <h2 className="mb-2 text-sm font-medium text-slate">
            Reference board <span className="font-mono text-xs text-gold">(coach only)</span>
          </h2>
          <div ref={refBoardRef} className="rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
            <Chessboard position={refFen} onPieceDrop={handleRefDrop} boardWidth={refBoardWidth} />
          </div>
        </div>
      )}
      <div className="w-full text-sm">
        {!connected && !error && <p className="text-slate">Connecting…</p>}
        {error && <p className="text-brick">{error}</p>}
      </div>
    </div>
  );
}
