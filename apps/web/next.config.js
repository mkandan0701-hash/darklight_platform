const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@chessplay-clone/db", "@chessplay-clone/shared"],
  experimental: {
    // Pin the monorepo root explicitly — without this, Next's file tracing can
    // walk up past the repo root looking for lockfiles and hit permission-denied
    // system folders (observed on Windows: `C:\Users\<user>\Application Data`,
    // `C:\Users\<user>\Cookies`).
    outputFileTracingRoot: path.join(__dirname, "../.."),
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
