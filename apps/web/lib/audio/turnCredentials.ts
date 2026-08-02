import { createHmac } from "node:crypto";

// TURN credentials for the coturn `use-auth-secret` scheme (the "TURN REST
// API" convention most relays implement).
//
// The shared secret never reaches the browser. Instead the server hands out a
// username that encodes an expiry and a credential that is an HMAC of it, so
// the relay can verify the pair without any per-user state and a leaked
// credential stops working within minutes.
//
// Server-only: this imports node:crypto and reads a secret that must never be
// bundled into client code.

export type TurnCredential = {
  username: string;
  credential: string;
  expiresAtUnix: number;
};

export const DEFAULT_TURN_TTL_SECONDS = 60 * 60;

export function mintTurnCredential(params: {
  secret: string;
  userId: string;
  ttlSeconds?: number;
  now?: Date;
}): TurnCredential {
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TURN_TTL_SECONDS;
  const nowUnix = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const expiresAtUnix = nowUnix + ttlSeconds;

  // The relay parses the expiry back out of the username, so the separator
  // matters and the userId must not contain one.
  const username = `${expiresAtUnix}:${sanitizeUserId(params.userId)}`;
  const credential = createHmac("sha1", params.secret).update(username).digest("base64");

  return { username, credential, expiresAtUnix };
}

// A colon in the userId would shift where the relay thinks the expiry ends,
// letting a crafted id change the effective lifetime of the credential.
function sanitizeUserId(userId: string): string {
  return userId.replace(/:/g, "_");
}

/** Comma-separated `turn:`/`turns:` URLs. Empty when TURN isn't configured. */
export function parseTurnUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}
