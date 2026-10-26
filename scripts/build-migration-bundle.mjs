// Concatenates migrations from a given timestamp onward into one file that
// can be pasted into the Supabase SQL Editor and run once, followed by a
// verification query listing every object those migrations create.
//
// Usage: node scripts/build-migration-bundle.mjs [fromTimestamp]
//   default fromTimestamp: 20261018180000 (first migration not yet on remote)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const from = process.argv[2] ?? "20261018180000";

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= from)
  .sort();

if (files.length === 0) {
  console.error(`No migrations at or after ${from}`);
  process.exit(1);
}

/** [kind, schema.object, how to check] — keep in sync with the migrations. */
export const EXPECTED = [
  ["column", "public.tags.is_active"],
  ["column", "public.transactions.income_source_id"],
  ["column", "public.notifications.link"],
  ["column", "public.household_settings.safe_to_spend_reserves"],
  ["column", "public.recurring_payments.is_mandatory"],
  ["function", "public.is_valid_reserve_map"],
  ["column", "public.tasks.repeat_kind"],
  ["column", "public.task_completions.occurrence_date"],
  ["trigger", "tasks_notify_assignment"],
  ["trigger", "tasks_enforce_assignee_household"],
  ["column", "public.habits.frequency"],
  ["column", "public.habit_checkins.value"],
  ["trigger", "habit_checkins_enforce_rules"],
  ["trigger", "habit_checkins_notify_milestone"],
  ["column", "public.foods.kcal"],
  ["column", "public.meal_plan_portions.grams"],
  ["column", "public.nutrition_targets.kcal"],
  ["trigger", "meal_plan_portions_enforce_member"],
  ["policy", "meal_plan_portions_write_member"],
  ["function", "public.guard_household_member_update"],
  ["function", "public.guard_goal_current_amount"],
  ["function", "public.record_goal_initial_operation"],
  ["function", "public.current_user_auth_email"],
  ["function", "public.guard_profile_email"],
  ["function", "public.enforce_income_source_household_match"],
  ["function", "public.enforce_transaction_account_currency"],
  ["function", "public.enforce_receipt_household_match"],
  ["function", "public.write_audit"],
  ["function", "public.notify_household"],
  ["trigger", "household_members_guard_update"],
  ["trigger", "goals_guard_current_amount"],
  ["trigger", "goals_record_initial_operation"],
  ["trigger", "profiles_guard_email"],
  ["trigger", "transactions_enforce_income_source_household"],
  ["trigger", "transactions_enforce_account_currency"],
  ["trigger", "receipts_enforce_household"],
  ["trigger", "household_members_audit"],
  ["trigger", "recurring_occurrences_audit"],
  ["policy", "household_members_update_self"],
  ["no_policy", "goal_operations_insert_via_membership"],
  ["no_policy", "notifications_insert_member"],
  ["no_policy", "audit_logs_insert_member"],
];

function checkSql([kind, name]) {
  const label = `'${kind}: ${name}'`;
  switch (kind) {
    case "column": {
      const [schema, table, column] = name.split(".");
      return `SELECT ${label}, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' AND column_name = '${column}')`;
    }
    case "function": {
      const [schema, fn] = name.split(".");
      return `SELECT ${label}, EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${schema}' AND p.proname = '${fn}')`;
    }
    case "trigger":
      return `SELECT ${label}, EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND NOT tgisinternal)`;
    case "policy":
      return `SELECT ${label}, EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '${name}')`;
    case "no_policy":
      return `SELECT ${label}, NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '${name}')`;
    default:
      throw new Error(`unknown kind ${kind}`);
  }
}

export const VERIFY_SQL = `SELECT check_name, ok FROM (\n  ${EXPECTED.map(checkSql).join("\n  UNION ALL ")}\n) AS checks(check_name, ok)\nORDER BY ok, check_name;\n`;

const header = `-- Family Finance — pending migrations bundle (generated, do not edit).
-- Regenerate: node scripts/build-migration-bundle.mjs ${from}
--
-- Paste the whole file into Supabase → SQL Editor → Run. Every migration is
-- idempotent and wrapped in its own transaction, so re-running is safe.
-- The last statement prints a checklist: every row must show ok = true.
--
-- Included, in order:
${files.map((f) => `--   ${f}`).join("\n")}
`;

const body = files
  .map((f) => `\n-- =====================================================================\n-- ${f}\n-- =====================================================================\n${readFileSync(path.join(migrationsDir, f), "utf8")}`)
  .join("\n");

const outDir = path.join(root, "supabase", "pending");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "apply-pending-migrations.sql");
writeFileSync(out, `${header}${body}\n-- Verification\n${VERIFY_SQL}`);
console.log(`wrote ${path.relative(root, out)} (${files.length} migrations)`);
