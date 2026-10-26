import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { getSupabasePublicEnv } from "./env";

/**
 * Browser Supabase client (anon key + user session).
 * Safe for Client Components only.
 */
export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
