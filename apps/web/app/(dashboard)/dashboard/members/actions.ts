"use server";

import { z } from "zod";
import { RoleSchema, tenantUrl } from "@chessplay-clone/shared";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { getTenantById } from "../../../../repositories/tenantRepository";
import {
  createUserWithProfile,
  linkParentToStudent,
  unlinkParentFromStudent,
} from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const InviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  // Optional: an admin bulk-inviting a class may only have the addresses.
  // The empty string a blank input submits is normalized to null in the
  // repository, so it never reaches the column.
  displayName: z.string().max(80, "Name is too long").optional(),
  role: RoleSchema,
  timezone: z.string().min(1, "Timezone is required"),
});

export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can invite members" };
  }

  const parsed = InviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.role === "ACADEMY_ADMIN") {
    return { ok: false, error: "Additional admins aren't supported yet" };
  }

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) {
    return { ok: false, error: "Could not resolve this academy" };
  }

  // The invite email must point at *this tenant's* host. Sending the invitee
  // to the apex would leave the dashboard layout with no Tenant to resolve,
  // and it would bounce them to /signup instead of signing them in.
  const requestHeaders = headers();
  const callbackUrl = tenantUrl({
    host:
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "",
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "",
    subdomain: tenant.subdomain,
    path: "/auth/callback",
    protocol: requestHeaders.get("x-forwarded-proto") ?? undefined,
  });
  if (!callbackUrl) {
    return {
      ok: false,
      error:
        "Invites need a tenant subdomain — they can't be sent from this host. Use your academy's own URL.",
    };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    // must_set_password lands in user_metadata and gates the dashboard until
    // setPassword() clears it — see lib/auth/session.ts.
    { redirectTo: callbackUrl, data: { must_set_password: true } }
  );
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Could not send invite" };
  }

  try {
    await createUserWithProfile({
      tenantId: session.tenantId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      timezone: parsed.data.timezone,
      authProviderId: data.user.id,
    });
  } catch {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: "Could not finish inviting this member" };
  }

  revalidatePath("/dashboard/members");
  return { ok: true };
}

const LinkSchema = z.object({
  parentProfileId: z.string().min(1, "Select a parent"),
  studentProfileId: z.string().min(1, "Select a student"),
});

export async function linkParentStudent(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can link parents to students" };
  }

  const parsed = LinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await linkParentToStudent({
      tenantId: session.tenantId,
      parentProfileId: parsed.data.parentProfileId,
      studentProfileId: parsed.data.studentProfileId,
    });
  } catch (err) {
    // Distinguished from a generic failure because it is the one case the
    // admin can act on — and the one that would otherwise have granted a
    // parent access to another academy's child.
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That parent or student isn't part of your academy" };
    }
    return { ok: false, error: "Could not link this parent to this student" };
  }

  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function unlinkParentStudent(linkId: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can remove this link" };
  }

  const removed = await unlinkParentFromStudent({ tenantId: session.tenantId, linkId });
  if (!removed) return { ok: false, error: "That link no longer exists" };
  revalidatePath("/dashboard/members");
  return { ok: true };
}
