import { createClient } from "@supabase/supabase-js";

// Credentials come from the environment — NEVER hardcode secrets in source.
// Usage (PowerShell):
//   $env:VITE_SUPABASE_URL="..."; $env:VITE_SUPABASE_PUBLISHABLE_KEY="...";
//   $env:SEED_ADMIN_EMAIL="..."; $env:SEED_ADMIN_PASSWORD="..."; node scripts/seed-admin.mjs
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
  console.log("\n🔧  Creating admin user via signUp...\n");

  const { data, error } = await supabase.auth.signUp({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    options: {
      data: {
        full_name: ADMIN_NAME,
        role: "super_admin",
      },
    },
  });

  if (error) {
    console.error("❌  Error:", error.message);
    process.exit(1);
  }

  if (data.user && data.user.identities?.length === 0) {
    console.log(`ℹ️  User already exists. Try logging in as ${ADMIN_EMAIL}.\n`);
    return;
  }

  if (data.session) {
    console.log("✅  User created and logged in immediately!\n");
    console.log(`   User ID:  ${data.user.id}`);
    console.log(`   Email:    ${ADMIN_EMAIL}\n`);

    // Try to update profile to super_admin
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ role: "super_admin", is_active: true })
      .eq("id", data.user.id);

    if (profileErr) {
      console.log("⚠️  Could not set role to super_admin automatically.");
      console.log("   Set it via the Supabase SQL editor: update public.profiles set role='super_admin' where email=...\n");
    } else {
      console.log("✅  Role set to super_admin.\n");
    }
  } else {
    console.log("📧  User created but email confirmation is required.");
    console.log(`   Check the inbox at ${ADMIN_EMAIL}, confirm, then log in.\n`);
  }
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message || err);
  process.exit(1);
});
