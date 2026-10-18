// Server-side Stockfish, as a long-lived child process speaking UCI over
// stdio (CLAUDE.md §2: "Engine (server): Stockfish binary").
//
// A binary rather than the WASM build apps/web ships: this evaluates every
// position in a game, so it wants native speed and a process that outlives a
// single request. It is a deployment dependency — the container needs
// `stockfish` on PATH, or STOCKFISH_PATH pointing at it — which is exactly
// why analysis is queued (§3.7) and never blocks a request thread.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isBestMoveLine, parseScoreLine, type UciScore } from "./uci";

export interface Engine {
  /** Evaluation of `fen` in centipawns, from the side-to-move's perspective. */
  evaluate(fen: string, depth: number): Promise<UciScore | null>;
  quit(): Promise<void>;
}

export function stockfishPath(): string {
  return process.env.STOCKFISH_PATH ?? "stockfish";
}

export class StockfishEngine implements Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private onLine: ((line: string) => void) | null = null;

  constructor(binary: string = stockfishPath()) {
    this.proc = spawn(binary, [], { stdio: "pipe" });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.consume(chunk));
  }

  // Stdout arrives in arbitrary chunks, not whole lines — a score split
  // across two reads would otherwise parse as two unusable fragments.
  private consume(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      this.onLine?.(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private send(command: string) {
    this.proc.stdin.write(`${command}\n`);
  }

  /** Resolves when `predicate` sees the line that ends this command. */
  private until<T>(
    command: string,
    predicate: (line: string) => T | null,
    timeoutMs: number
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value: T | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.onLine = null;
        resolve(value);
      };

      // Without this a wedged engine would hang the worker forever, and BullMQ
      // would never get the chance to fail and retry the job.
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.onLine = null;
        reject(new Error(`Stockfish timed out after ${timeoutMs}ms on: ${command}`));
      }, timeoutMs);

      this.onLine = (line) => {
        const value = predicate(line);
        if (value !== null) finish(value);
      };
      this.send(command);
    });
  }

  async ready(timeoutMs = 10_000): Promise<void> {
    await this.until("uci", (line) => (line.trim() === "uciok" ? true : null), timeoutMs);
    await this.until("isready", (line) => (line.trim() === "readyok" ? true : null), timeoutMs);
  }

  async evaluate(fen: string, depth: number, timeoutMs = 60_000): Promise<UciScore | null> {
    this.send(`position fen ${fen}`);

    // Keep the deepest score seen: `bestmove` itself carries no evaluation,
    // so the last usable `info` line before it is the answer.
    let best: UciScore | null = null;
    await this.until(
      `go depth ${depth}`,
      (line) => {
        const score = parseScoreLine(line);
        if (score) best = score;
        return isBestMoveLine(line) ? true : null;
      },
      timeoutMs
    );
    return best;
  }

  async quit(): Promise<void> {
    this.send("quit");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.proc.kill("SIGKILL");
        resolve();
      }, 2000);
      this.proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
