import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveSubdomain } from "@chessplay-clone/shared";

// Wave 1: refreshes the Supabase Auth session cookie on every request, and
// forwards the tenant subdomain (from the Host header, via resolveSubdomain)
// to Server Components via a request header — `headers()` in
// app/(dashboard)/layout.tsx reads it to resolve the Tenant. Actual `Tenant`
// lookup + role/tenant enforcement is done per-request in server
// components/actions (via packages/db), not here.
export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const resolved = resolveSubdomain(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "");
  const demoSubdomain = demoTenantSubdomain(host, resolved.type);

  // Always explicitly set-or-clear: never let an inbound client-supplied
  // x-tenant-subdomain header pass through unmodified.
  if (resolved.type === "tenant") {
    request.headers.set("x-tenant-subdomain", resolved.subdomain);
  } else if (demoSubdomain) {
    request.headers.set("x-tenant-subdomain", demoSubdomain);
  } else {
    request.headers.delete("x-tenant-subdomain");
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getSession();

  return response;
}

// Demo deployments: a bare *.vercel.app URL has no tenant subdomain, so every
// request there resolves to apex and /dashboard bounces to /signup. When
// DEMO_TENANT_SUBDOMAIN is set, those hosts are pinned to that one academy so
// a client demo works without wildcard DNS. Scoped to vercel.app hosts only:
// a real root domain never matches, so production tenancy is unchanged even
// if the variable is set there by mistake. Server-only on purpose — not
// NEXT_PUBLIC_, since nothing in the browser should be able to read or pick it.
function demoTenantSubdomain(host: string, resolvedType: string): string | null {
  const demo = process.env.DEMO_TENANT_SUBDOMAIN?.trim().toLowerCase();
  if (!demo || resolvedType !== "apex") return null;
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  return hostname.endsWith(".vercel.app") ? demo : null;
}

export const config = {
  // `engine/` holds the vendored Stockfish wasm. Without it here, every fetch
  // of a 7 MB static asset would run the Supabase getSession() refresh above
  // and write session cookies onto a cacheable file.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|engine/).*)"],
};
