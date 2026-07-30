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
  },
};

module.exports = nextConfig;
