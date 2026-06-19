import { createClient } from "@supabase/supabase-js";

// Credentials come from the environment — NEVER hardcode secrets in source.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Administrator";

if (!SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌  Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  // Sign in to get an authenticated session
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (authErr) {
    console.error("❌  Login failed:", authErr.message);
    process.exit(1);
  }

  console.log(`\n✅  Logged in as ${auth.user.id}\n`);

  // Check current profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (profileErr) {
    console.log("⚠️  No profile found. Creating one...\n");
    const { error: insertErr } = await supabase.from("profiles").insert({
      id: auth.user.id,
      full_name: ADMIN_NAME,
      role: "super_admin",
      is_active: true,
    });
    if (insertErr) {
      console.error("❌  Could not create profile:", insertErr.message);
      console.log("\n   RLS may be blocking this. You'll need to update it via the Supabase SQL editor.");
    } else {
      console.log("✅  Profile created with role: super_admin\n");
    }
    return;
  }

  console.log("   Current role:", profile.role);

  if (profile.role === "super_admin") {
    console.log("   Already super_admin — nothing to do!\n");
    return;
  }

  // Try to update role
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ role: "super_admin", is_active: true })
    .eq("id", auth.user.id);

  if (updateErr) {
    console.error("❌  Could not update role:", updateErr.message);
    console.log("\n   RLS may be blocking self-role-update. You'll need to update via SQL editor.");
  } else {
    console.log("✅  Role updated to super_admin!\n");
  }
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message || err);
  process.exit(1);
});
