"use server";

import { z } from "zod";
import { RoleSchema } from "@chessplay-clone/shared";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { createUserWithProfile } from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const InviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
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

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    parsed.data.email
  );
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Could not send invite" };
  }

  try {
    await createUserWithProfile({
      tenantId: session.tenantId,
      email: parsed.data.email,
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
