"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { useElementWidth } from "../lib/useElementWidth";
import { tryMove } from "../lib/chess/tryMove";
import { Badge } from "./ui/Badge";

/**
 * One board of a simultaneous exhibition.
 *
 * Deliberately thinner than LiveBoard: a simul board has no arrows, chat or
 * audio. The coach is walking between boards, so anything that needs their
 * sustained attention on one of them is the wrong feature here.
 */
export function SimulBoard({ simulBoardId }: { simulBoardId: string }) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [color, setColor] = useState<"w" | "b" | null>(null);
  const [boardIdx, setBoardIdx] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [boardWrapRef, boardWidth] = useElementWidth<HTMLDivElement>(360);

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
        // The ack carries the board's current position and which colour this
        // viewer plays, so joining mid-game starts from the real board.
        socket.emit(
          "join-simul-board",
          { simulBoardId },
          (
            ok: boolean,
            payload?: { fen: string; color: "w" | "b"; boardIdx: number },
            joinError?: string
          ) => {
            if (!ok || !payload) {
              setError(joinError ?? "Could not join this board");
              return;
            }
            setFen(payload.fen);
            setColor(payload.color);
            setBoardIdx(payload.boardIdx);
          }
        );
      });

      socket.on("disconnect", () => setConnected(false));
      socket.on("simul-board-state", (payload: { fen: string }) => setFen(payload.fen));
    }

    void connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [simulBoardId]);

  const onDrop = useCallback(
    (from: Square, to: Square) => {
      const socket = socketRef.current;
      if (!socket || !color) return false;

      // Local legality check for instant feedback; the server re-validates the
      // same move before anyone else sees it, and a rejection acks back with
      // the real position.
      const check = new Chess(fen);
      const move = tryMove(check, { from, to, promotion: "q" });
      if (!move) return false;

      setFen(check.fen());
      socket.emit(
        "simul-move",
        { simulBoardId, from, to, promotion: "q" },
        (ok: boolean, serverFen?: string, moveError?: string) => {
          if (!ok) {
            if (serverFen) setFen(serverFen);
            setError(moveError ?? "Move rejected");
            return;
          }
          setError(null);
        }
      );
      return true;
    },
    [color, fen, simulBoardId]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Badge tone={connected ? "success" : "muted"}>
          {connected ? "Connected" : "Connecting…"}
        </Badge>
        {boardIdx !== null && <Badge>Board {boardIdx}</Badge>}
        {color && (
          <span className="text-xs text-slate">
            You play {color === "w" ? "White" : "Black"}
          </span>
        )}
      </div>

      <div ref={boardWrapRef} className="max-w-xl">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          boardWidth={boardWidth || undefined}
          boardOrientation={color === "b" ? "black" : "white"}
        />
      </div>

      {error && <p className="mt-3 text-sm text-brick">{error}</p>}
    </div>
  );
}
