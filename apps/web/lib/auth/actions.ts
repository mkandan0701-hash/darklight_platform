"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@chessplay-clone/db";
import { RESERVED_SUBDOMAINS } from "@chessplay-clone/shared";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createUserWithProfile } from "../../repositories/userRepository";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const SignUpSchema = z.object({
  academyName: z.string().min(2, "Academy name is required"),
  subdomain: z
    .string()
    .min(3, "Subdomain must be at least 3 characters")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only")
    .refine((v) => !RESERVED_SUBDOMAINS.has(v), { message: "That subdomain is reserved" }),
  timezone: z.string().min(1, "Timezone is required"),
  adminEmail: z.string().email("Enter a valid email"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUpAcademy(
  formData: FormData
): Promise<ActionResult<{ subdomain: string }>> {
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { academyName, subdomain, timezone, adminEmail, adminPassword } = parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { subdomain } });
  if (existing) {
    return { ok: false, error: "That subdomain is already taken" };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    return { ok: false, error: authError?.message ?? "Could not create account" };
  }

  try {
    const tenant = await prisma.tenant.create({
      data: { name: academyName, subdomain, timezone },
    });
    await createUserWithProfile({
      tenantId: tenant.id,
      email: adminEmail,
      role: "ACADEMY_ADMIN",
      timezone,
      authProviderId: authUser.user.id,
    });
    return { ok: true, data: { subdomain } };
  } catch {
    // Postgres and Supabase Auth aren't in one transaction — roll back the
    // auth user on failure so signup can be retried cleanly from scratch.
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return {
      ok: false,
      error: "Could not finish setting up your academy. Please try again.",
    };
  }
}

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function login(formData: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: error.message };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
