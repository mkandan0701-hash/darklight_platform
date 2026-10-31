const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@chessplay-clone/db", "@chessplay-clone/shared"],
  // Output file tracing walks the dependency graph to work out which files a
  // serverless function actually needs. On Windows it globs the user profile
  // (`C:\Users\<user>`), hits the deny-all junctions Windows keeps there
  // (`Application Data`, `Cookies`), and glob's strict mode aborts the build:
  //
  //   glob error [Error: EPERM: operation not permitted, scandir
  //   'C:\Users\Admin\Application Data']
  //
  // Confirmed by instrumenting fs.readdir: the caller is
  // next/dist/compiled/@vercel/nft, not application code, and it reproduces on
  // an unmodified checkout. outputFileTracingRoot below does not prevent it —
  // nft reaches the home directory by another route.
  //
  // Tracing only exists to prune the deployment bundle, and Vercel builds on
  // Linux where those junctions don't exist, so disabling it *only* on Windows
  // makes local production builds work without changing what ships. Do not
  // make this unconditional: on Vercel it is what keeps the bundle small.
  //
  // Note this is a top-level key. outputFileTracingRoot lives under
  // `experimental` in Next 14; these two are deliberately not in the same place.
  outputFileTracing: process.platform !== "win32",
  experimental: {
    // Pin the monorepo root explicitly — without this, Next's file tracing can
    // walk up past the repo root looking for lockfiles and hit permission-denied
    // system folders (observed on Windows: `C:\Users\<user>\Application Data`,
    // `C:\Users\<user>\Cookies`).
    outputFileTracingRoot: path.join(__dirname, "../.."),
    // Prisma's query engine is a native .node file that tracing can't see:
    // transpilePackages inlines the generated client into webpack chunks, so
    // Prisma loses its own __dirname and only probes fixed paths — one of
    // which is apps/web/generated/client. scripts/vercelBuild.mjs copies the
    // engine there before `next build`; this ships it with every function.
    // Without it every DB-backed page 500s on Vercel with "could not locate
    // the Query Engine for runtime rhel-openssl-3.0.x".
    outputFileTracingIncludes: {
      "/**": ["./generated/client/**/*"],
    },
    serverActions: {
      // Coaches can upload multi-game PGN puzzle sets larger than the 1MB default.
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        // The Stockfish build is version-pinned in its filename, so it can be
        // cached forever. Vercel otherwise serves public/ as must-revalidate,
        // which would re-check 7 MB on every visit to /dashboard/play.
        //
        // Deliberately NOT setting COOP/COEP here: cross-origin isolation
        // would break tenant-supplied external logo URLs, and the
        // single-threaded engine build doesn't need SharedArrayBuffer.
        // See apps/web/public/engine/README.md.
        source: "/engine/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
