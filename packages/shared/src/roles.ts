import { z } from "zod";

export const RoleSchema = z.enum([
  "ACADEMY_ADMIN",
  "COACH",
  "STUDENT",
  "PARENT",
]);
export type Role = z.infer<typeof RoleSchema>;

export const PlanTierSchema = z.enum([
  "STARTER",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

// Mirrors `AuthedSession` shape decoded from the Supabase Auth JWT on both
// apps/web (server actions) and apps/api (Socket.io/Express middleware).
export const AuthedSessionSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  role: RoleSchema,
});
export type AuthedSession = z.infer<typeof AuthedSessionSchema>;
