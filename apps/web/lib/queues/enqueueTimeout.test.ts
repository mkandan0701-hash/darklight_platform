import { describe, expect, it, vi } from "vitest";
import {
  ENQUEUE_TIMEOUT_MS,
  EnqueueTimeoutError,
  withEnqueueTimeout,
} from "./enqueueTimeout";

describe("withEnqueueTimeout", () => {
  it("passes a prompt enqueue straight through", async () => {
    await expect(withEnqueueTimeout("q", Promise.resolve("job_1"))).resolves.toBe("job_1");
  });

  it("propagates a real enqueue failure unchanged", async () => {
    await expect(
      withEnqueueTimeout("q", Promise.reject(new Error("ECONNREFUSED")))
    ).rejects.toThrow("ECONNREFUSED");
  });

  // The case that motivated this: with Redis unreachable, BullMQ's add() never
  // settles at all. A plain try/catch around it waits forever, so a server
  // action would hang rather than fail.
  it("rejects a promise that never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = withEnqueueTimeout("tournament-events", new Promise(() => {}));
      const assertion = expect(pending).rejects.toBeInstanceOf(EnqueueTimeoutError);
      await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the queue it gave up on", async () => {
    vi.useFakeTimers();
    try {
      const pending = withEnqueueTimeout("tournament-events", new Promise(() => {}));
      const assertion = expect(pending).rejects.toThrow(/tournament-events/);
      await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  // Otherwise a pending timer keeps the event loop alive after every enqueue.
  it("clears its timer once the enqueue wins", async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.spyOn(globalThis, "clearTimeout");
      await withEnqueueTimeout("q", Promise.resolve("ok"));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
