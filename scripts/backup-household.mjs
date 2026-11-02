#!/usr/bin/env node
/**
 * Offline household backup using the service-role key from .env.local.
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- --household=<uuid>
 *   npm run backup -- --out=./backups
 *
 * Writes JSON next to the project (or --out). Owners should prefer
 * Settings → download via /api/export/backup when logged in; this script is
 * for operators with the service role key.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const file = path.join(import.meta.dirname, "..", ".env.local");
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function safeFilePart(value) {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "household"
  );
}

const TABLES = [
  "household_settings",
  "household_members",
  "household_invitations",
  "accounts",
  "categories",
  "tags",
  "income_sources",
  "transactions",
  "transfers",
  "budgets",
  "goals",
  "goal_operations",
  "recurring_payments",
  "recurring_payment_occurrences",
  "receipts",
  "tasks",
  "task_completions",
  "habits",
  "foods",
  "meal_plans",
  "meal_plan_meals",
  "meal_plan_portions",
  "nutrition_targets",
  "notifications",
  "audit_logs",
];

async function fetchAll(supabase, table, householdId) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(table === "households" ? "id" : "household_id", householdId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

async function backupOne(supabase, household) {
  const tables = {
    households: [household],
  };
  for (const table of TABLES) {
    tables[table] = await fetchAll(supabase, table, household.id);
  }

  // Join tables without household_id
  const txIds = tables.transactions.map((t) => t.id);
  const tags = [];
  for (let i = 0; i < txIds.length; i += 100) {
    const chunk = txIds.slice(i, i + 100);
    if (chunk.length === 0) break;
    const { data, error } = await supabase
      .from("transaction_tags")
      .select("*")
      .in("transaction_id", chunk);
    if (error) throw new Error(`transaction_tags: ${error.message}`);
    tags.push(...(data ?? []));
  }
  tables.transaction_tags = tags;

  const habitIds = tables.habits.map((h) => h.id);
  const checkins = [];
  for (let i = 0; i < habitIds.length; i += 100) {
    const chunk = habitIds.slice(i, i + 100);
    if (chunk.length === 0) break;
    const { data, error } = await supabase
      .from("habit_checkins")
      .select("*")
      .in("habit_id", chunk);
    if (error) throw new Error(`habit_checkins: ${error.message}`);
    checkins.push(...(data ?? []));
  }
  tables.habit_checkins = checkins;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    householdId: household.id,
    householdName: household.name,
    note:
      "Purrfect Home household backup (service-role script). Receipt files stay in Storage.",
    tables,
  };
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const onlyId = arg("household");
const outDir = path.resolve(arg("out", path.join(import.meta.dirname, "..", "backups")));
mkdirSync(outDir, { recursive: true });

let households;
if (onlyId) {
  const { data, error } = await supabase
    .from("households")
    .select("id, name")
    .eq("id", onlyId)
    .maybeSingle();
  if (error || !data) {
    console.error(error?.message ?? `Household ${onlyId} not found`);
    process.exit(1);
  }
  households = [data];
} else {
  const { data, error } = await supabase.from("households").select("id, name").order("name");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  households = data ?? [];
}

if (households.length === 0) {
  console.log("No households to back up.");
  process.exit(0);
}

for (const household of households) {
  const backup = await backupOne(supabase, household);
  const day = backup.exportedAt.slice(0, 10);
  const file = path.join(
    outDir,
    `purrfect-home-backup-${safeFilePart(household.name)}-${day}.json`,
  );
  writeFileSync(file, JSON.stringify(backup, null, 2), "utf8");
  const counts = Object.fromEntries(
    Object.entries(backup.tables).map(([k, v]) => [k, v.length]),
  );
  console.log(`Wrote ${file}`);
  console.log("  rows:", JSON.stringify(counts));
}

console.log(`\nDone. ${households.length} household(s) → ${outDir}`);
