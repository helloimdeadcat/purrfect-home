-- Safe-to-Spend inputs: a per-currency cash reserve on household settings and
-- an "is mandatory" flag on recurring payments.
--
-- * safe_to_spend_reserves: {"EUR": "500.00", "USD": "0.00"} — one reserve
--   per currency because there is no FX. Values are validated by the app
--   (Zod) and by the CHECK below.
-- * is_mandatory defaults to true, so existing behaviour (every recurring
--   expense reduces Safe-to-Spend) is unchanged until a user opts out.
-- Re-runnable.

BEGIN;

ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS safe_to_spend_reserves jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Object of 3-letter currency → non-negative amount with ≤ 2 decimals.
CREATE OR REPLACE FUNCTION public.is_valid_reserve_map(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_value) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(p_value) AS e(code, amount)
      WHERE code !~ '^[A-Z]{3}$'
         OR jsonb_typeof(amount) <> 'string'
         OR (amount #>> '{}') !~ '^\d{1,13}(\.\d{1,2})?$'
    );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'household_settings_reserves_valid'
  ) THEN
    ALTER TABLE public.household_settings
      ADD CONSTRAINT household_settings_reserves_valid
      CHECK (public.is_valid_reserve_map(safe_to_spend_reserves));
  END IF;
END $$;

ALTER TABLE public.recurring_payments
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.household_settings.safe_to_spend_reserves IS
  'Per-currency cash reserve subtracted from Safe-to-Spend, e.g. {"EUR":"500.00"}';
COMMENT ON COLUMN public.recurring_payments.is_mandatory IS
  'Mandatory outflows reduce Safe-to-Spend; optional ones only affect the forecast balance';

-- Settings audit now records reserve changes too (replaces the 4B version).
CREATE OR REPLACE FUNCTION public.audit_household_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := jsonb_build_object(
    'timezone', OLD.timezone, 'week_starts_on', OLD.week_starts_on,
    'month_starts_on', OLD.month_starts_on, 'default_account_id', OLD.default_account_id,
    'default_category_id', OLD.default_category_id,
    'safe_to_spend_reserves', OLD.safe_to_spend_reserves);
  v_new jsonb := jsonb_build_object(
    'timezone', NEW.timezone, 'week_starts_on', NEW.week_starts_on,
    'month_starts_on', NEW.month_starts_on, 'default_account_id', NEW.default_account_id,
    'default_category_id', NEW.default_category_id,
    'safe_to_spend_reserves', NEW.safe_to_spend_reserves);
BEGIN
  IF v_old IS DISTINCT FROM v_new THEN
    PERFORM public.write_audit(NEW.household_id, 'household_settings', NEW.household_id,
      'settings_updated', v_old, v_new);
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
