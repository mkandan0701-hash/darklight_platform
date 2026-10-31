/**
 * Bounds an enqueue so a sick Redis can't hang a server action.
 *
 * Measured, not assumed: with Redis unreachable, BullMQ's `add()` does not
 * reject — ioredis queues the command offline and retries the connection
 * forever, so the promise simply never settles. A try/catch cannot catch that.
 * Left unbounded it means a spinning form, then a retry, then duplicate work.
 *
 * The alternative fix — a `retryStrategy` that gives up — makes `add()` reject
 * quickly but stops ioredis reconnecting for good, so a two-second Redis
 * restart would disable queueing until the next deploy. Bounding the call
 * instead keeps reconnection intact: the connection heals on its own, and only
 * the calls made while it was down are lost.
 *
 * A timed-out promise is left dangling deliberately. It may settle later when
 * the connection recovers, enqueueing a job long after the fact — which is
 * precisely what the consumer-side staleness check exists to discard.
 */
export const ENQUEUE_TIMEOUT_MS = 2_000;

export class EnqueueTimeoutError extends Error {
  constructor(queueName: string) {
    super(`Timed out enqueueing to ${queueName} after ${ENQUEUE_TIMEOUT_MS}ms`);
    this.name = "EnqueueTimeoutError";
  }
}

export async function withEnqueueTimeout<T>(
  queueName: string,
  enqueue: Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      enqueue,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new EnqueueTimeoutError(queueName)), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
