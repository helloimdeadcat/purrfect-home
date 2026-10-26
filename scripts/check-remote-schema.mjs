// Read-only check that the remote Supabase project has the latest migrations.
// Uses the REST API with the service-role key from .env.local; writes nothing.
// Usage: npm run check:remote
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  const file = path.join(import.meta.dirname, "..", ".env.local");
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

/** Probes: a column select or an RPC that only exists after a migration. */
const PROBES = [
  ["20261018180000 settings", "GET", "tags?select=is_active&limit=1"],
  ["20261018180000 settings", "GET", "transactions?select=income_source_id&limit=1"],
  ["20261026120000 stabilization", "POST", "rpc/current_user_auth_email"],
  ["20261026140000 notifications/audit", "GET", "notifications?select=link&limit=1"],
  ["20261026150000 safe-to-spend reserve", "GET", "household_settings?select=safe_to_spend_reserves&limit=1"],
  ["20261026150000 safe-to-spend reserve", "GET", "recurring_payments?select=is_mandatory&limit=1"],
  ["20261026160000 tasks & schedule", "GET", "tasks?select=id&limit=1"],
  ["20261026170000 habits", "GET", "habits?select=id&limit=1"],
  ["20261026180000 meal plans", "GET", "meal_plans?select=id&limit=1"],
];

let missing = 0;
for (const [migration, method, query] of PROBES) {
  const response = await fetch(`${base}/rest/v1/${query}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  const ok = response.ok;
  if (!ok) missing += 1;
  const detail = ok ? "" : ` — ${(await response.json().catch(() => ({}))).message ?? response.status}`;
  console.log(`${ok ? "OK     " : "MISSING"} ${migration}: ${query}${detail}`);
}

console.log(
  missing === 0
    ? "\nRemote schema is up to date. (Triggers/policies: see the checklist the bundle prints in the SQL Editor.)"
    : `\n${missing} check(s) failed — run supabase/pending/apply-pending-migrations.sql in the SQL Editor.`,
);
process.exit(missing === 0 ? 0 : 1);
