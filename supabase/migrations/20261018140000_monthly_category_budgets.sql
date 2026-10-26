-- Monthly category budgets: uniqueness + clarity for Phase 2 budgets UI.
-- Reuses existing public.budgets table (no duplicate schema).

BEGIN;

-- One active monthly budget per category per household month start.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_household_category_month_uidx
  ON public.budgets (household_id, category_id, start_date)
  WHERE is_active = true
    AND period_type = 'monthly'
    AND category_id IS NOT NULL;

COMMENT ON INDEX public.budgets_household_category_month_uidx IS
  'Ensures a household has at most one active monthly budget per category for a given month start_date.';

COMMIT;
