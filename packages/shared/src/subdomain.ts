export type SubdomainResolution =
  | { type: "apex" }
  | { type: "reserved"; subdomain: string }
  | { type: "tenant"; subdomain: string };

// Words that could plausibly become future infra subdomains (marketing site,
// API surface, internal tooling) — must never be claimable by a tenant.
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "mail",
  "static",
  "assets",
  "support",
  "help",
  "blog",
]);

function classify(label: string): SubdomainResolution {
  if (RESERVED_SUBDOMAINS.has(label)) return { type: "reserved", subdomain: label };
  return { type: "tenant", subdomain: label };
}

/**
 * Classify a Host header value against the configured production root
 * domain. Pure and side-effect-free — shared between apps/web/middleware.ts
 * (routing) and apps/web/lib/auth/actions.ts (signup validation) so the
 * reserved list lives in one place.
 */
export function resolveSubdomain(host: string, rootDomain: string): SubdomainResolution {
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  const root = rootDomain.toLowerCase().trim();

  if (!hostname) return { type: "apex" };

  // Local dev: bare `localhost` is apex; `*.localhost` mirrors browsers'
  // built-in *.localhost -> 127.0.0.1 resolution and is a tenant candidate.
  if (hostname === "localhost") return { type: "apex" };
  if (hostname.endsWith(".localhost")) {
    return classify(hostname.slice(0, -".localhost".length));
  }

  // Vercel preview deployments carry no reliable tenant signal in their
  // subdomain label (it's the deployment/project name) — always apex.
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) {
    return { type: "apex" };
  }

  if (!root) return { type: "apex" }; // root domain not configured yet

  if (hostname === root || hostname === `www.${root}`) {
    return { type: "apex" };
  }

  if (hostname.endsWith(`.${root}`)) {
    const label = hostname.slice(0, -(`.${root}`.length));
    // Multi-label prefixes (foo.bar.rootdomain.com) aren't a recognized
    // single tenant subdomain shape — treat conservatively as apex.
    if (!label || label.includes(".")) return { type: "apex" };
    return classify(label);
  }

  // Unrecognized host — never guess at a tenant.
  return { type: "apex" };
}
