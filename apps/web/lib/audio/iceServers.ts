// STUN lets each browser discover its own public address so two peers can
// connect directly. Media never touches our server.
//
// KNOWN GAP — STUN alone can't traverse symmetric NAT or a restrictive
// corporate firewall, which is realistically 10-20% of connections. That
// matters more here than for most products: the traffic is India<->US home
// and office networks. The fix is a TURN relay (coturn on Railway, or
// Cloudflare Calls), which costs money and is deliberately not in this step.
// When it lands, it belongs in this list alongside its credentials.
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

export function getIceServers(): RTCIceServer[] {
  return [{ urls: parseStunUrls(process.env.NEXT_PUBLIC_STUN_URLS) }];
}
