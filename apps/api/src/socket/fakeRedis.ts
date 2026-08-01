// In-memory stand-in for ioredis, covering only the commands boardStore uses.
// Lets the socket handlers be tested against real BoardStore behavior —
// key naming, the start-position default, shared/ref separation — instead of a
// hand-stubbed store that would agree with whatever the handler happens to do.
//
// TTLs are accepted and ignored: nothing here tests expiry.
export function createFakeRedis() {
  const store = new Map<string, string>();

  return {
    store,

    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },

    async set(key: string, value: string, ..._rest: unknown[]): Promise<"OK"> {
      store.set(key, value);
      return "OK";
    },

    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },

    // Mirrors CAS_SCRIPT in boardStore.ts. Keep the two in step: if the Lua
    // changes, change this, and re-check against a real Redis via the
    // multi-instance step in the PR's verification notes.
    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      expected: string,
      next: string,
      startFen: string,
      _ttl: string
    ): Promise<number> {
      const current = store.get(key);
      if (current === undefined) {
        if (expected !== startFen) return 0;
      } else if (current !== expected) {
        return 0;
      }
      store.set(key, next);
      return 1;
    },
  };
}
