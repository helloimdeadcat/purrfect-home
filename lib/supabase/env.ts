/**
 * Environment helpers for Supabase clients.
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */

function requiredPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and set your Supabase project values.`,
    );
  }
  return value;
}

export function getSupabasePublicEnv() {
  return {
    url: requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getSupabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (server-only).",
    );
  }
  return value;
}
