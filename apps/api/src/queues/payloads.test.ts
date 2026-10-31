import { UnrecoverableError } from "bullmq";
import { describe, expect, it } from "vitest";
import { gameAnalysisJobSchema, studentSyncJobSchema } from "@chessplay-clone/shared";
import { parseJob } from "./payloads";

describe("parseJob", () => {
  it("returns the parsed payload", () => {
    expect(parseJob(gameAnalysisJobSchema, { tenantId: "t1", gameId: "g1" }, "game-analysis")).toEqual({
      tenantId: "t1",
      gameId: "g1",
    });
  });

  // Unrecoverable, so BullMQ fails it once instead of retrying a payload that
  // can never parse.
  it("fails a malformed payload for good", () => {
    expect(() => parseJob(gameAnalysisJobSchema, { gameId: "g1" }, "game-analysis")).toThrow(UnrecoverableError);
    expect(() => parseJob(gameAnalysisJobSchema, { tenantId: "t1", gameId: "g1", depth: 999 }, "game-analysis")).toThrow(
      /depth/
    );
  });

  it("strips a stale job's handle instead of trusting it", () => {
    const parsed = parseJob(studentSyncJobSchema, { tenantId: "t1", studentId: "s1", handle: "someone-else" }, "lichess-sync");
    expect(parsed).toEqual({ tenantId: "t1", studentId: "s1" });
  });
});
