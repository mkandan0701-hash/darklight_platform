# Stockfish (vendored, unmodified)

Chess engine used client-side by `/dashboard/play` and the analysis board.

| | |
|---|---|
| Package | [`stockfish`](https://www.npmjs.com/package/stockfish) (nmrugg) |
| Version | **18.0.8** |
| Upstream | https://github.com/nmrugg/stockfish.js |
| Licence | **GPL-3.0** — full text in [`COPYING.txt`](./COPYING.txt) |
| Build | `stockfish-18-lite-single` — single-threaded, NNUE net embedded in the `.wasm` |

**These files are unmodified upstream binaries.** They were downloaded from
unpkg and their SHA-256 digests verified against the integrity hashes npm
publishes for the package:

| File | Bytes | SHA-256 |
|---|---|---|
| `stockfish-18-lite-single.js` | 21,429 | `5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391` |
| `stockfish-18-lite-single.wasm` | 7,295,411 | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |
| `COPYING.txt` | 35,821 | `0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b` |

To re-verify or upgrade:

```sh
curl -sL -o stockfish-18-lite-single.js   https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js
curl -sL -o stockfish-18-lite-single.wasm https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm
curl -sL -o COPYING.txt                   https://unpkg.com/stockfish@18.0.8/Copying.txt
sha256sum *
```

## Why these files are committed rather than installed

`npm install stockfish` pulls **~251 MB** (the package ships nine engine builds,
one of which is a 113 MB `.wasm`) to obtain the 7.3 MB we actually use. That
cost would be paid on every `npm ci`, every CI run and every Vercel build. A
build-time download instead would make deploys fail closed on a network blip.

## Why the single-threaded build

The multi-threaded builds need `SharedArrayBuffer`, which requires
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
require-corp` across the app. `components/dashboard/DashboardNav.tsx` renders
**tenant-supplied external logo URLs**, and COEP `require-corp` would break every
one of them unless each tenant's CDN sets `Cross-Origin-Resource-Policy` — which
we don't control. Single-threaded removes that whole class of problem, at a
strength difference no academy user can observe.

**Do not add COOP/COEP headers to `next.config.js`.**

## GPL-3.0 boundary

The engine runs in a **separate Web Worker**, communicating only via the
standardized UCI text protocol over `postMessage` — the arm's-length separation
that keeps it a distinct program rather than a derivative work. Three rules keep
that true:

1. Serve the binaries unmodified; never patch the engine.
2. Load via a **plain string path** (`new Worker("/engine/stockfish-18-lite-single.js")`),
   never `new Worker(new URL(...))` — the latter pulls the engine into the
   webpack graph.
3. Never import engine internals.

Attribution is rendered in the footer of `/dashboard/play`.

This is standard industry practice (Lichess, Chess.com), not legal advice.
