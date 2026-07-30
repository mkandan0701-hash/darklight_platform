import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { getTenantById } from "../../../../repositories/tenantRepository";
import { BrandingForm } from "./BrandingForm";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  requireRole(session, ["ACADEMY_ADMIN"]);
  const tenant = await getTenantById(session.tenantId);

  return (
    <div>
      <h1 className="text-lg font-semibold">Academy branding</h1>
      <div className="mt-4">
        <BrandingForm
          defaultLogoUrl={tenant?.logoUrl ?? ""}
          defaultBrandColor={tenant?.brandColor ?? "#111111"}
        />
      </div>
    </div>
  );
}
