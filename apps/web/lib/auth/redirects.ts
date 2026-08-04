// Helpers shared by app/auth/callback/route.ts and the (auth) pages. Kept out
// of route.ts because Next.js only permits its own known exports there.

import { tenantApexHost } from "@chessplay-clone/shared";

/**
 * Pick the host an auth redirect should be built on, or `null` to leave the
 * request's own URL alone.
 *
 * `NextRequest.nextUrl` carries the origin the *server* is bound to, not the
 * one the browser asked for: behind a plain Node server that's the bind
 * address, so in dev every auth redirect came back as `localhost:3000` and
 * silently dropped the tenant subdomain. Landing on the apex means the
 * dashboard layout finds no Tenant and sends the person to /signup — "create
 * your academy", to someone whose academy already exists.
 *
 * The Host header is client-controlled, so a redirect built on it blindly is
 * an open redirect via host-header injection. `tenantApexHost` returning
 * non-null is the check that this is one of our own hosts; anything else is
 * refused rather than trusted.
 */
export function safeRedirectHost(
  hostHeader: string | null,
  forwardedHost: string | null,
  rootDomain: string
): string | null {
  const host = forwardedHost ?? hostHeader;
  if (!host) return null;
  return tenantApexHost(host, rootDomain) ? host : null;
}

export const DEFAULT_POST_AUTH_PATH = "/set-password";

/**
 * Sanitize a `?next=` value into a same-origin path.
 *
 * The callback URL is embedded in an email, so `next` is fully
 * attacker-controllable: without this, `?next=//evil.com` would render as a
 * protocol-relative URL and bounce a freshly-authenticated user off-site.
 */
export function safeNextPath(
  next: string | null,
  fallback: string = DEFAULT_POST_AUTH_PATH
): string {
  if (!next) return fallback;
  // Must be a rooted path, and not `//host` or `/\host` (both of which
  // browsers resolve as protocol-relative absolute URLs).
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// Auth failures are surfaced by redirecting to /login?error=<code>. Codes, not
// messages: a message in the query string would let anyone craft a login link
// that displays arbitrary text to the victim.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "That link is invalid or has already been used. Ask your academy admin to send a new invite.",
  expired_link:
    "That link has expired. Ask your academy admin to send a new invite.",
  signin_required: "Please sign in to continue.",
  // Deliberately doesn't name the academy the account does belong to. The
  // code-not-message rule above is what keeps this query string from being a
  // way to display attacker-chosen text, and a subdomain passed alongside it
  // would reopen exactly that.
  tenant_mismatch:
    "That account belongs to a different academy. Check the web address you're using, or ask your admin for your academy's sign-in link.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.invalid_link;
}
