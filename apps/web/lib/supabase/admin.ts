import { createClient } from "@supabase/supabase-js";

// Service-role client for admin-only operations (creating/inviting users).
// Never expose this key to the browser — server-only module.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
