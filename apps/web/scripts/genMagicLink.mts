import { createSupabaseAdminClient } from "../lib/supabase/admin";

const email = process.argv[2];
const port = process.env.PORT ?? process.env.WEB_PORT ?? "3000";
const subdomain = process.argv[3] ?? "darklight";

if (!email) {
  console.error("Usage: tsx scripts/genMagicLink.mts <email> [subdomain]");
  process.exit(1);
}

const supabase = createSupabaseAdminClient();

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `http://${subdomain}.localhost:${port}/auth/callback` },
});

if (error || !data.properties?.hashed_token) {
  console.error("FAILED", error?.message);
  process.exit(1);
}

console.log(
  `http://${subdomain}.localhost:${port}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`
);
