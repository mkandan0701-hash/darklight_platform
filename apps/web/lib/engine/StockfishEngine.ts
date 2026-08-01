import { type EngineInfo } from "./uci";
import { classifySearchLine } from "./searchProtocol";

// Thin wrapper over the Stockfish Web Worker. Deliberately thin: it touches
// Worker APIs so it can't run under Vitest's node environment, which is why
// all the parsing and level logic lives in uci.ts / difficulty.ts instead.
//
// Loaded by PLAIN STRING PATH on purpose. `new Worker(new URL(...))` makes
// Next's webpack worker loader try to bundle the Emscripten glue and resolve
// its .wasm sibling — it breaks the build, and it would pull GPL-3.0 engine
// code into our module graph. Webpack ignores string literals.
// See apps/web/public/engine/README.md.

export const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

/** How long to wait for the 7 MB wasm to download and initialise. */
const BOOT_TIMEOUT_MS = 60_000;

export type SearchRequest = {
  /** `setoption` commands applied before the search. */
  setup?: string[];
  /** A full `position ...` command — build it with `positionCommand()`. */
  position: string;
  /** A full `go ...` command. */
  go: string;
  /** Reject if no `bestmove` arrives within this window. */
  timeoutMs: number;
  /** Streamed parsed `info` lines — used by the analysis board. */
  onInfo?: (info: EngineInfo) => void;
};

export type SearchResult = {
  bestmove: string | null;
  ponder: string | null;
  /** The deepest `info` line seen during this search, if any. */
  info: EngineInfo | null;
  /**
   * True when a newer search or `newGame()` superseded this one. The caller
   * must ignore the result — it belongs to a position that is no longer on
   * the board.
   */
  superseded: boolean;
};

export class StockfishEngine {
  private readonly worker: Worker;
  private readonly listeners = new Set<(line: string) => void>();
  private terminated = false;
  /**
   * Bumped by every new search and by newGame(). A `bestmove` that arrives
   * after its generation has passed is dropped rather than answered — without
   * this, a slow search's reply lands in the *next* search's promise and the
   * engine plays a move from the previous position onto the new board.
   */
  private generation = 0;
  /** The search currently running, so a new one can drain it before starting. */
  private inFlight: Promise<SearchResult> | null = null;

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent) => {
      const line = typeof event.data === "string" ? event.data : String(event.data?.data ?? "");
      if (!line) return;
      for (const listener of [...this.listeners]) listener(line);
    };
  }

  static async create(url: string = ENGINE_URL): Promise<StockfishEngine> {
    const worker = new Worker(url);
    const engine = new StockfishEngine(worker);

    // A 404, a proxy stripping application/wasm, or a corrupt asset all land
    // here rather than as a rejected promise.
    const failure = new Promise<never>((_, reject) => {
      worker.onerror = (event) => {
        reject(new Error(event.message || "Engine failed to load"));
      };
    });

    try {
      await Promise.race([engine.boot(), failure]);
    } catch (err) {
      engine.terminate();
      throw err;
    }
    return engine;
  }

  private async boot(): Promise<void> {
    this.send("uci");
    await this.waitFor((line) => line.startsWith("uciok"), BOOT_TIMEOUT_MS, "uciok");
    // Single-threaded build; a small hash keeps mobile memory sane.
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 16");
    await this.ready();
  }

  /** Resolves once the engine has finished processing everything sent so far. */
  async ready(timeoutMs = BOOT_TIMEOUT_MS): Promise<void> {
    this.send("isready");
    await this.waitFor((line) => line.startsWith("readyok"), timeoutMs, "readyok");
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    what: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Engine timed out waiting for ${what}`));
      }, timeoutMs);
      const off = this.onLine((line) => {
        if (!predicate(line)) return;
        clearTimeout(timer);
        off();
        resolve();
      });
    });
  }

  onLine(callback: (line: string) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  send(command: string): void {
    // postMessage after terminate() throws in Firefox.
    if (this.terminated) return;
    this.worker.postMessage(command);
  }

  /**
   * Run one search, stopping and draining any search already running.
   *
   * The drain is not optional: UCI forbids sending `position` while the engine
   * is searching, so an analysis board that re-searches on every arrow-key
   * press would interleave commands into a running search and desync. Waiting
   * for the previous `bestmove` is the only safe way to re-issue.
   *
   * Always resolves — never rejects on a superseded search — so callers don't
   * have to handle a rejection for the ordinary "user moved on while I was
   * thinking" case. Check `superseded` before using the result.
   */
  async search(request: SearchRequest): Promise<SearchResult> {
    const previous = this.inFlight;
    if (previous) {
      this.generation++; // invalidate it before it can answer
      this.send("stop");
      await previous.catch(() => undefined);
    }

    const run = this.runSearch(request);
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private runSearch(request: SearchRequest): Promise<SearchResult> {
    const generation = ++this.generation;

    return new Promise<SearchResult>((resolve, reject) => {
      let best: EngineInfo | null = null;

      const finish = (result: SearchResult) => {
        clearTimeout(timer);
        off();
        resolve(result);
      };

      // Without this a wedged engine leaves the board locked forever, with a
      // page reload as the user's only way out.
      const timer = setTimeout(() => {
        off();
        this.send("stop");
        reject(new Error("Engine search timed out"));
      }, request.timeoutMs);

      const off = this.onLine((line) => {
        // The "superseded searches still wait for bestmove" rule lives in
        // classifySearchLine, where it is unit-testable. See its comment.
        const action = classifySearchLine(line, generation !== this.generation);

        switch (action.kind) {
          case "info":
            // Keep the deepest line; bounds aren't settled evaluations.
            if (
              action.info.bound === null &&
              (best === null || (action.info.depth ?? 0) >= (best.depth ?? 0))
            ) {
              best = action.info;
            }
            request.onInfo?.(action.info);
            return;
          case "done":
            finish({
              bestmove: action.bestmove,
              ponder: action.ponder,
              info: best,
              superseded: false,
            });
            return;
          case "abandon":
            finish({ bestmove: null, ponder: null, info: null, superseded: true });
            return;
          default:
            return;
        }
      });

      for (const command of request.setup ?? []) this.send(command);
      this.send(request.position);
      this.send(request.go);
    });
  }

  /** Clear the engine's transposition table and invalidate any in-flight search. */
  newGame(): void {
    this.generation++;
    this.send("stop");
    this.send("ucinewgame");
    this.send("isready");
  }

  /** Ask the engine to stop searching and report its best move so far. */
  stop(): void {
    this.send("stop");
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.generation++;
    this.listeners.clear();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }

  get isTerminated(): boolean {
    return this.terminated;
  }
}
