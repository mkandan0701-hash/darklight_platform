import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { safeNextPath, safeRedirectHost } from "../../../lib/auth/redirects";

// Landing point for every Supabase Auth email link (invite, password
// recovery, email change). Two link shapes are accepted:
//
//   ?token_hash=...&type=invite   -> verifyOtp
//     What our invite emails actually use. Supabase's *default* template
//     ({{ .ConfirmationURL }}) sends the session back in the URL *fragment*,
//     which a server can never read — so the invite template is configured to
//     use {{ .TokenHash }} instead. See README "Supabase Auth console setup".
//
//   ?code=...                     -> exchangeCodeForSession
//     The PKCE shape, used by browser-initiated flows (OAuth, and magic links
//     requested client-side). Handled here so those work without a second
//     callback route.
//
// On success the session cookie is written and the user continues to `next`
// (default /set-password); on failure they land on /login with an error code.

const EmailOtpTypeSchema = z.enum([
  "invite",
  "recovery",
  "signup",
  "magiclink",
  "email_change",
  "email",
]);

function redirectTo(request: NextRequest, pathname: string, search = "") {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;

  // Keeps the tenant subdomain the invitee arrived on — the dashboard layout
  // resolves the Tenant from that host. nextUrl alone does NOT: it reports the
  // server's own origin, so this used to redirect every invitee to the apex.
  const host = safeRedirectHost(
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ""
  );
  if (host) {
    url.host = host;
    // Same chained-proxy shape tenantUrl() handles: take the outermost hop.
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) url.protocol = proto;
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));

  // Supabase reports its own verification failures as query params rather
  // than a non-2xx response.
  const supabaseError = params.get("error_code") ?? params.get("error");
  if (supabaseError) {
    const code = supabaseError.includes("expired") ? "expired_link" : "invalid_link";
    return redirectTo(request, "/login", `?error=${code}`);
  }

  const supabase = createSupabaseServerClient();

  const tokenHash = params.get("token_hash");
  const parsedType = EmailOtpTypeSchema.safeParse(params.get("type"));
  if (tokenHash && parsedType.success) {
    const { error } = await supabase.auth.verifyOtp({
      type: parsedType.data,
      token_hash: tokenHash,
    });
    if (error) {
      return redirectTo(request, "/login", "?error=invalid_link");
    }
    return redirectTo(request, next);
  }

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectTo(request, "/login", "?error=invalid_link");
    }
    return redirectTo(request, next);
  }

  return redirectTo(request, "/login", "?error=invalid_link");
}
