-- Supabase Auth "Custom Access Token" hook: stamps tenant_id/role claims onto
-- every JWT Supabase Auth issues, sourced from the authoritative "User" row.
-- apps/api/src/auth/verifySession.ts requires these as top-level claims and
-- treats a missing claim as "deny" -- this function must never fabricate a
-- claim for a user it can't positively resolve.
--
-- Manual step required after this migration is applied (not automatable --
-- no Supabase Management API token available): register this function as
-- the project's Custom Access Token hook in the Supabase Dashboard, under
-- Authentication -> Hooks -> Custom Access Token -> select
-- "custom_access_token_hook" (schema public).

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  matched_tenant_id text;
  matched_role text;
BEGIN
  SELECT "tenantId", "role"::text
    INTO matched_tenant_id, matched_role
    FROM public."User"
   WHERE "authProviderId" = (event ->> 'user_id')
     AND "deletedAt" IS NULL
   LIMIT 1;

  claims := event -> 'claims';

  IF matched_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(matched_tenant_id));
    claims := jsonb_set(claims, '{role}', to_jsonb(matched_role));
    event := jsonb_set(event, '{claims}', claims);
  END IF;

  -- No matching (or soft-deleted) User: return event unchanged, i.e. no
  -- tenant_id/role claims -- verifySupabaseJwt() correctly treats that as deny.
  RETURN event;
END;
$$;

-- Lock down: only the role Supabase Auth uses internally to invoke hooks may
-- execute this. It must NOT be callable by regular authenticated/anon users --
-- SECURITY DEFINER means it runs with the privileges of its owner, and it can
-- resolve any user's tenant_id/role by user_id, so exposing EXECUTE broadly
-- would be an authorization bypass in its own right.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
