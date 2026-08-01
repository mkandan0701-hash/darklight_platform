import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { getTenantById } from "../../../../repositories/tenantRepository";
import { BrandingForm } from "./BrandingForm";
import { Card } from "../../../../components/ui/Card";
import { pageHeadingClass } from "../../../../components/ui/styles";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  requireRole(session, ["ACADEMY_ADMIN"]);
  const tenant = await getTenantById(session.tenantId);

  return (
    <div>
      <h1 className={pageHeadingClass}>Academy branding</h1>
      <p className="mt-1 text-sm text-slate">
        Your logo and color show up in the dashboard navigation for your whole academy.
      </p>
      <Card className="mt-4 max-w-sm">
        <BrandingForm
          defaultLogoUrl={tenant?.logoUrl ?? ""}
          defaultBrandColor={tenant?.brandColor ?? "#1F6D4C"}
        />
      </Card>
    </div>
  );
}
