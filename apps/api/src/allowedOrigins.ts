// Which browser origins may open a Socket.io connection (and make CORS
// requests) to this API: the platform's root domain and its academy
// subdomains, plus any exact origins listed in API_ALLOWED_ORIGINS (a Vercel
// demo URL, say). *.localhost is allowed outside production.
//
// Auth is a bearer token in the socket handshake, not a cookie, so a foreign
// page can't ride a user's session either way. This narrows who can even try.

export type OriginPolicy = {
  rootDomain: string | undefined;
  extraOrigins: string[];
  allowLocalhost: boolean;
};

export function originPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): OriginPolicy {
  return {
    rootDomain: (env.ROOT_DOMAIN ?? env.NEXT_PUBLIC_ROOT_DOMAIN)?.trim().toLowerCase() || undefined,
    extraOrigins: (env.API_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean),
    allowLocalhost: env.NODE_ENV !== "production",
  };
}

/** True when nothing is configured: the caller decides how to fail. */
export function isUnconfigured(policy: OriginPolicy): boolean {
  return !policy.rootDomain && policy.extraOrigins.length === 0;
}

export function isAllowedOrigin(origin: string | undefined, policy: OriginPolicy): boolean {
  // No Origin header: not a browser (a server, curl, a health check). CORS
  // doesn't apply, and the socket still has to authenticate.
  if (!origin) return true;
  if (policy.extraOrigins.includes(origin)) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();

  if (policy.allowLocalhost && (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1")) {
    return true;
  }

  const root = policy.rootDomain;
  if (!root || url.protocol !== "https:") return false;
  return host === root || host.endsWith(`.${root}`);
}
