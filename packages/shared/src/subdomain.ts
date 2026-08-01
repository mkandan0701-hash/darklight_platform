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

function splitHostPort(host: string): { hostname: string; port: string } {
  const [hostname = "", port] = host.split(":");
  return { hostname: hostname.toLowerCase(), port: port ? `:${port}` : "" };
}

/**
 * Given any Host header value, return the apex host (root domain + port) that
 * tenant subdomains hang off, or `null` if this host can't carry them.
 *
 * `academy1.chessplayclone.com` -> `chessplayclone.com`
 * `academy1.localhost:3000`     -> `localhost:3000`
 * `chessplayclone.com`          -> `chessplayclone.com`
 * `my-app-abc123.vercel.app`    -> null (preview deploys have no tenant DNS)
 */
export function tenantApexHost(host: string, rootDomain: string): string | null {
  const { hostname, port } = splitHostPort(host);
  const root = rootDomain.toLowerCase().trim();
  if (!hostname) return null;

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return `localhost${port}`;
  }

  // Preview deployments are a single fixed hostname — there is no
  // `{tenant}.` form of them to point an invitee at.
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) return null;

  if (!root) return null;
  if (hostname === root || hostname.endsWith(`.${root}`)) return `${root}${port}`;

  return null;
}

/**
 * Build an absolute URL on a *specific tenant's* host, deriving the apex from
 * the host of the current request so the same code produces
 * `http://academy1.localhost:3000/...` in dev and
 * `https://academy1.chessplayclone.com/...` in production.
 *
 * Needed because Supabase Auth email links (invites, password resets) are
 * opened in a fresh browser context — the link itself has to name the tenant's
 * host, or the recipient lands on the apex where no `Tenant` resolves.
 *
 * Returns `null` when the current host can't carry tenant subdomains.
 */
export function tenantUrl(input: {
  host: string;
  rootDomain: string;
  subdomain: string;
  path: string;
  protocol?: string;
}): string | null {
  const apex = tenantApexHost(input.host, input.rootDomain);
  if (!apex || !input.subdomain) return null;

  // A chained proxy can send `x-forwarded-proto: https,http` — take the
  // outermost hop, and tolerate a trailing colon (`location.protocol` form).
  const forwarded = input.protocol?.split(",")[0]?.trim().replace(/:$/, "");
  const protocol = forwarded || (apex.startsWith("localhost") ? "http" : "https");
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;

  return `${protocol}://${input.subdomain}.${apex}${path}`;
}
