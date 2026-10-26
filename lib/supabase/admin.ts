import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "./env";

/**
 * Admin Supabase client with service role.
 * SERVER ONLY — bypasses RLS. Never import from Client Components.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
