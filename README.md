# Purrfect Home

A cozy home organiser for couples (repo folder: `family-finance`).

- **Money:** accounts and balances, transactions with receipts, transfers,
  monthly budgets, goals, recurring payments, a payment calendar, analytics,
  a cash-flow forecast with Safe-to-Spend, CSV export.
- **Home:** a shared to-do list and weekly schedule with per-partner colours
  and repeats (daily, weekdays, weekly on chosen days, monthly).
- **Habits:** personal or shared habits (tick or amount, e.g. 2 L water),
  every day / chosen days / N× a week, streaks and partner cheers.
- **Meals:** a weekly plan (same dishes, per-person grams), food catalogue
  with per-100 g macros, daily totals vs targets, shopping list → to-do,
  one-click import of the household's 7-day plan (`lib/meals/seven-day-plan.ts`).
- **Everywhere:** in-app notifications and an activity log.

- **Assistant ✨:** a chat (Google Gemini free tier by default, any
  OpenAI-compatible endpoint works) that reads your meals, to-dos, habits and
  balances, suggests recipes from a meal's foods, and proposes changes as
  cards — nothing is written until you tap Apply. Optional: set `AI_API_KEY`
  (free key at https://aistudio.google.com/apikey); `AI_BASE_URL` / `AI_MODEL`
  override the defaults. Chat history stays in the browser tab.

Stack: Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4 +
shadcn/ui, Supabase (Auth, Postgres with RLS, Storage), Zod 4, Recharts,
Vitest. Installable as a PWA.

## Setup

```bash
npm install --legacy-peer-deps   # recharts peer ranges
cp .env.example .env.local       # fill in Supabase URL + keys
npm run dev                      # http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is used for first-household
bootstrap, invitation acceptance fallbacks and one orphaned-upload cleanup;
regular requests run as the signed-in user under RLS. Set `APP_URL` in
production so invitation links never depend on the request's Host header.

## Database

Migrations live in `supabase/migrations/` and must be applied in filename
order (`npx supabase db push`, or the SQL editor file by file). Every
migration is idempotent.

| Migration | Purpose |
|-----------|---------|
| `20260930130000_init_family_finance_schema` | Core schema, RLS, receipts bucket |
| `20261017140000_fix_grants_and_household_insert` | Grants |
| `20261017150000_audit_security_integrity_fixes` | Same-household FKs, transfer currency, last-owner guard |
| `20261018120000_household_invitations` / `…130000_fix_invite_digest_search_path` | Invitations |
| `20261018140000_monthly_category_budgets` | Monthly budgets |
| `20261018150000_goals_currency_archive_operations` | Goal history + atomic RPC |
| `20261018160000_recurring_payments_confirm` | Recurring confirm / skip RPCs |
| `20261018180000_settings_reference_data` | Tags `is_active`, `transactions.income_source_id` |
| `20261026120000_stabilization_security_integrity` | Membership hardening, goal/profile guards, currency + income-source integrity, recurring anchor day |
| `20261026130000_receipts_upload_delete` | Receipt integrity, uploader may delete |
| `20261026140000_notifications_audit_log` | Trigger-written notifications and audit log |
| `20261026150000_safe_to_spend_reserve` | Per-currency Safe-to-Spend reserve, optional recurring payments |
| `20261026160000_tasks_schedule` | Shared to-dos / schedule with repeats, per-occurrence completion, assignment notifications |
| `20261026170000_habits` | Habits + personal check-ins (own only, ≤ 7 days back), streak milestone cheers |
| `20261026180000_meal_plans` | Foods, one active meal plan, meals by weekday/slot, per-person portions, nutrition targets |

### Applying pending migrations to the remote project

`supabase/pending/apply-pending-migrations.sql` bundles every migration not
yet on the remote project (regenerate with `npm run db:bundle`). Paste it into
Supabase → SQL Editor → Run; the final result table must show `ok = true` on
every row. Then run `npm run check:remote` (read-only REST probe). The bundle
is tested against the pre-bundle schema in `supabase/tests/pending-bundle.pglite.test.ts`.

## Checks

```bash
npx tsc --noEmit   # after `npm run build` once (generates route types)
npm run lint
npm test           # includes supabase/tests: all migrations on in-process Postgres (PGlite)
npm run build
```

`supabase/tests/schema.pglite.test.ts` applies every migration to PGlite with
Supabase stand-ins and exercises RLS policies, triggers and RPCs as real
users — add a case there whenever a migration changes security behaviour.

## Financial rules

- Money is `numeric(15,2)`, handled as strings with integer-cent arithmetic.
- No FX: totals are always per currency; a transaction's currency equals its
  account's; transfers only between same-currency accounts.
- Transfers are not household income or expense. Soft-deleted transactions
  are excluded everywhere.
- Actuals (transactions) are never mixed with planned (recurring) or forecast
  amounts. Safe-to-Spend = balance − upcoming mandatory outflows − reserve
  (reserve is 0 until configurable); income never raises it.
- "Today", current month and overdue use the household timezone.
- Aggregates page through PostgREST's 1000-row limit (`lib/supabase/fetch-all.ts`).
