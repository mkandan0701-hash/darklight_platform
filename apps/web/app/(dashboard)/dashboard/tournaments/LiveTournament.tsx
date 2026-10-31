"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { Badge } from "../../../../components/ui/Badge";

/**
 * Keeps the tournament page current while someone is watching it.
 *
 * The socket carries only word that something changed — never pairings, names
 * or scores. Acting on it means re-rendering the server component, so the
 * standings a spectator sees come back through the same tenant-scoped,
 * role-aware read path as a normal page load. Nothing here is authoritative;
 * losing the connection costs liveness, not correctness, and a reload still
 * shows the truth.
 */
export function LiveTournament({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      // Not signed in is not a state worth reporting here — the page around
      // this component only renders for an authenticated viewer at all.
      if (!authSession || cancelled) return;

      const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
        auth: { token: authSession.access_token },
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        // Re-emitted on every connect, not just the first: after a reconnect
        // the server has no memory of this socket's rooms.
        socket.emit("join-tournament", { tournamentId }, (ok: boolean) => {
          setConnected(ok);
        });
      });

      socket.on("disconnect", () => setConnected(false));

      socket.on("tournament-updated", () => {
        // Coalesced: an organiser entering a round's worth of results fires one
        // re-render, not one per result. router.refresh() re-runs the server
        // component, so the round that lands is whatever is true when it does.
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => router.refresh(), 400);
      });
    }

    void connect();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [tournamentId, router]);

  return connected ? (
    <Badge tone="success" title="Pairings and results update here as they are published">
      Live
    </Badge>
  ) : (
    <Badge tone="muted" title="Showing the page as loaded — reload for the latest">
      Not live
    </Badge>
  );
}
