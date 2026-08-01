// Smoke test for how the vendored Stockfish assets are *served*. The engine
// itself is exercised by Vitest (lib/engine/*.test.ts); what can't be
// unit-tested is whether Next actually hands the browser a usable wasm file.
//
// The failure this exists to catch is silent: if middleware.ts's matcher stops
// excluding /engine/, every fetch of a 7 MB asset runs a Supabase getSession()
// round-trip and writes session cookies onto a cacheable file. Nothing breaks
// visibly — it just burns Supabase quota and latency for months.
//
// Start the dev server first, then run from apps/web:
//   npx tsx --env-file=.env.local scripts/verifyEngineAssets.ts [subdomain]

import { request } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SUBDOMAIN = process.argv[2] ?? "demo-academy";
const PORT = Number(process.env.WEB_PORT ?? 3000);
const HOST = `${SUBDOMAIN}.localhost:${PORT}`;

const WASM_PATH = "/engine/stockfish-18-lite-single.wasm";
const JS_PATH = "/engine/stockfish-18-lite-single.js";

// From apps/web/public/engine/README.md — the upstream stockfish@18.0.8 files.
const EXPECTED_SHA256: Record<string, string> = {
  [WASM_PATH]: "a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1",
  [JS_PATH]: "5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391",
};

type Response = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

// *.localhost doesn't resolve through the OS resolver on Windows, so connect
// to loopback and carry the tenant in the Host header — what middleware reads.
function get(path: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: PORT, path, method: "GET", headers: { host: HOST } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` -- ${detail}`}`);
}

async function main() {
  const reachable = await get("/login").then(
    (r) => r.status > 0,
    () => false
  );
  if (!reachable) throw new Error(`No server on ${PORT}. Start it with: npm run dev:web`);

  // 1. The files on disk are the upstream binaries, unmodified. This is the
  //    GPL provenance claim in public/engine/README.md, kept honest.
  for (const [path, expected] of Object.entries(EXPECTED_SHA256)) {
    const onDisk = await readFile(join(process.cwd(), "public", path.replace(/^\//, "")));
    const digest = createHash("sha256").update(onDisk).digest("hex");
    check(
      `${path} on disk matches the upstream digest`,
      digest === expected,
      `expected ${expected}, got ${digest}`
    );
  }

  // 2. The wasm is actually served, intact, with the right type.
  const wasm = await get(WASM_PATH);
  check(`${WASM_PATH} is served`, wasm.status === 200, `status=${wasm.status}`);
  check(
    `${WASM_PATH} has content-type application/wasm`,
    String(wasm.headers["content-type"] ?? "").includes("application/wasm"),
    `content-type=${wasm.headers["content-type"]}`
  );
  check(
    `${WASM_PATH} is served byte-identical`,
    createHash("sha256").update(wasm.body).digest("hex") === EXPECTED_SHA256[WASM_PATH],
    `served ${wasm.body.length} bytes`
  );

  // 3. THE assertion this script exists for. A set-cookie on a static asset
  //    means middleware ran on it — i.e. the matcher regressed.
  check(
    `${WASM_PATH} is not processed by middleware`,
    wasm.headers["set-cookie"] === undefined,
    `set-cookie=${JSON.stringify(wasm.headers["set-cookie"])}`
  );

  // 4. Version-pinned filename, so it should be cached forever. Only enforced
  //    in production builds — `next dev` deliberately serves no-store.
  const cacheControl = String(wasm.headers["cache-control"] ?? "");
  const isDev = cacheControl.includes("no-store");
  if (isDev) {
    console.log(`SKIP  ${WASM_PATH} immutable caching -- dev server sends "${cacheControl}"`);
  } else {
    check(
      `${WASM_PATH} is cached immutably`,
      cacheControl.includes("immutable"),
      `cache-control=${cacheControl}`
    );
  }

  // 5. The Emscripten glue must be reachable at the exact path the worker
  //    loads it from, or the engine 404s at runtime with no build-time signal.
  const js = await get(JS_PATH);
  check(`${JS_PATH} is served`, js.status === 200, `status=${js.status}`);
  check(
    `${JS_PATH} is not processed by middleware`,
    js.headers["set-cookie"] === undefined,
    `set-cookie=${JSON.stringify(js.headers["set-cookie"])}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exitCode = 1;
});
