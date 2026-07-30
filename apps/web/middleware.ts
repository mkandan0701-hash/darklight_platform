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

  // Always explicitly set-or-clear: never let an inbound client-supplied
  // x-tenant-subdomain header pass through unmodified.
  if (resolved.type === "tenant") {
    request.headers.set("x-tenant-subdomain", resolved.subdomain);
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
