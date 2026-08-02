// STUN lets each browser discover its own public address so two peers can
// connect directly. Media never touches our server.
//
// STUN alone can't traverse symmetric NAT or a restrictive corporate
// firewall — realistically 10-20% of connections, and this product's traffic
// is India<->US home and office networks. TURN relays those cases; its
// credentials are minted server-side in ./actions.ts, because a relay
// password in a NEXT_PUBLIC_ variable would let any visitor use the relay at
// our expense.
//
// This module is imported by client code, so it must never pull in
// ./turnCredentials (node:crypto) — that would break the browser bundle.

/** Structural stand-in for RTCIceServer, so server code needs no DOM lib. */
export type IceServer = {
  urls: string[] | string;
  username?: string;
  credential?: string;
};

const DEFAULT_STUN = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

export function parseStunUrls(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_STUN;
  const urls = raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return urls.length > 0 ? urls : DEFAULT_STUN;
}

/**
 * What the client falls back to if it can't reach the server action.
 * Degraded audio beats no audio — this is the behaviour the product had
 * before TURN existed.
 */
export function stunOnlyIceServers(): IceServer[] {
  return [{ urls: parseStunUrls(process.env.NEXT_PUBLIC_STUN_URLS) }];
}
