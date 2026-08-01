import IORedis, { type Redis } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ's blocking commands (BRPOPLPUSH et al) require an unbounded retry
// setting, and it insists on owning its connection. Everything else wants the
// default retry behavior, so the two must not share a client.
export function createBullConnection(): Redis {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
}

// General-purpose client: board state, and (duplicated) the Socket.io adapter's
// pub/sub pair. A client in subscriber mode can't run normal commands, which is
// the other reason this can't be the BullMQ connection.
export function createRedisClient(): Redis {
  return new IORedis(REDIS_URL);
}
