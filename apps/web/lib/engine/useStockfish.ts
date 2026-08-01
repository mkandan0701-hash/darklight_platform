"use client";

import { useEffect, useState } from "react";
import { StockfishEngine } from "./StockfishEngine";

export type EngineStatus = "loading" | "ready" | "error";

export type UseStockfish = {
  status: EngineStatus;
  engine: StockfishEngine | null;
  error: string | null;
};

/**
 * Boot a Stockfish worker for the lifetime of the calling component.
 *
 * Boots on mount rather than on first use: the user navigated to a board on
 * purpose, so the 7 MB download should start while they pick a colour, not
 * after they make their first move.
 *
 * The `cancelled` flag mirrors the async-connect pattern in
 * components/LiveBoard.tsx. Cleanup terminates the worker — React 18
 * StrictMode double-mounts in development, and without this the first engine
 * is orphaned and keeps burning a CPU core.
 */
export function useStockfish(): UseStockfish {
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [engine, setEngine] = useState<StockfishEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let booted: StockfishEngine | null = null;

    async function boot() {
      try {
        const created = await StockfishEngine.create();
        if (cancelled) {
          created.terminate();
          return;
        }
        booted = created;
        setEngine(created);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start the chess engine");
        setStatus("error");
      }
    }

    void boot();

    return () => {
      cancelled = true;
      booted?.terminate();
      setEngine(null);
    };
  }, []);

  return { status, engine, error };
}
