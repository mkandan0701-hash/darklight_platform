"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { updateTenantBranding } from "../../../../repositories/tenantRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const BrandingSchema = z.object({
  logoUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1a1a1a")
    .optional()
    .or(z.literal("")),
});

export async function updateBrandingAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can update branding" };
  }

  const parsed = BrandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateTenantBranding(session.tenantId, {
    logoUrl: parsed.data.logoUrl || undefined,
    brandColor: parsed.data.brandColor || undefined,
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
