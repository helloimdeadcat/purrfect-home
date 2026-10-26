import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { getSupabasePublicEnv } from "./env";

/**
 * Server Supabase client (anon key + cookie session).
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export async function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh will be handled by proxy/middleware later.
        }
      },
    },
  });
}
