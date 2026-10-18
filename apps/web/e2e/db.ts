import { existsSync } from "node:fs";

// Direct DB reads for verifying what the UI claims, plus the one fixture the
// UI can't create (a class in the past, for attendance). Everything is
// scoped to the QA tenant.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export async function db() {
  const { prismaBase } = await import("@chessplay-clone/db");
  return prismaBase;
}
