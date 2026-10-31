-- The roles Supabase provisions and our migrations GRANT to (the
-- custom_access_token_hook migration grants to supabase_auth_admin and revokes
-- from anon/authenticated). A plain Postgres — CI's service container, a local
-- throwaway — has none of them, so `prisma migrate deploy` stops at that
-- migration. Run this first on any non-Supabase database. Idempotent.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
