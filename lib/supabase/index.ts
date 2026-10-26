export { createClient as createBrowserClient } from "./client";
export { createClient as createServerClient } from "./server";
// Intentionally NOT re-exporting createAdminClient — import from
// `@/lib/supabase/admin` only in trusted server modules.
export { RECEIPTS_BUCKET, buildReceiptStoragePath } from "./storage";
