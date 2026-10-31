import Link from "next/link";
import { headers } from "next/headers";
import { getTenantBySubdomain } from "../../repositories/tenantRepository";
import { CburnettPiece, PIECE_BOX } from "../chess/cburnett";
import { BOARD } from "../art/palette";

const PLATFORM_NAME = "Chess Academy Platform";

// On an academy's own subdomain the auth pages wear that academy's name and
// logo — an invited parent should see "Sharma Chess Academy", not our product
// name, on the page their coach's email sent them to. On the apex (signup,
// marketing) it falls back to the platform mark.
//
// The subdomain comes from x-tenant-subdomain, which middleware.ts always
// sets-or-clears, so a client can't spoof it.
export async function AuthBrand({ linked = true }: { linked?: boolean }) {
  const subdomain = headers().get("x-tenant-subdomain");
  const tenant = subdomain ? await getTenantBySubdomain(subdomain) : null;

  const name = tenant?.name ?? PLATFORM_NAME;

  const mark = (
    <span className="inline-flex min-w-0 items-center gap-3">
      {tenant?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, not a static asset
        <img
          src={tenant.logoUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-ink/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
          // Same fallback AppShell uses; brandColor is validated on save.
          style={{ backgroundColor: tenant?.brandColor ?? BOARD }}
        >
          <svg viewBox={`0 0 ${PIECE_BOX} ${PIECE_BOX}`} className="h-7 w-7" focusable="false">
            <CburnettPiece kind="n" isWhite />
          </svg>
        </span>
      )}
      <span className="truncate font-display text-lg font-bold tracking-tight text-ink">{name}</span>
    </span>
  );

  return linked ? (
    <Link
      href="/"
      className="inline-flex max-w-full rounded-xl focus-visible:outline-offset-4"
    >
      {mark}
    </Link>
  ) : (
    <div className="inline-flex max-w-full">{mark}</div>
  );
}
