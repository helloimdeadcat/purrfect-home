-- Family Finance — stabilization: membership hardening, goal history
-- integrity, profile email, receipt object overwrite, same-household income
-- sources, transaction/account currency match.
--
-- Guards that must not break SECURITY DEFINER RPCs (accept invite, goal
-- operations, recurring confirm) only fire for direct client statements:
-- inside a definer function current_user is the function owner, while a
-- PostgREST request from the app runs as 'authenticated'.
--
-- Re-runnable: every object is dropped/replaced idempotently.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) household_members: no direct client inserts except first-owner bootstrap
-- ---------------------------------------------------------------------------
-- Previously owners/admins could insert ANY user_id (any role) into their
-- household by calling PostgREST directly, bypassing the invitation flow and
-- its email binding. All legitimate inserts go through the bootstrap RPC or
-- the invitation RPC / server admin client.
DROP POLICY IF EXISTS household_members_insert_admin ON public.household_members;
CREATE POLICY household_members_insert_admin
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    role = 'owner'
    AND user_id = auth.uid()
    AND public.household_has_no_members(household_id)
  );

-- Members may edit their own row (display name). What they may change is
-- restricted by the guard trigger below.
DROP POLICY IF EXISTS household_members_update_self ON public.household_members;
CREATE POLICY household_members_update_self
  ON public.household_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_household_member_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.household_id IS DISTINCT FROM OLD.household_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'household_id and user_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Owners may set any role (last-owner trigger still applies).
    IF public.has_household_role(OLD.household_id, ARRAY['owner']) THEN
      RETURN NEW;
    END IF;
    -- Admins may only move other people between member and viewer.
    IF public.has_household_role(OLD.household_id, ARRAY['admin'])
       AND OLD.user_id IS DISTINCT FROM auth.uid()
       AND OLD.role IN ('member', 'viewer')
       AND NEW.role IN ('member', 'viewer') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not allowed to change this member''s role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_guard_update ON public.household_members;
CREATE TRIGGER household_members_guard_update
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_household_member_update();

-- ---------------------------------------------------------------------------
-- 2) Last-owner protection: allow the household itself to be deleted
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE from households removed member rows one by one and the
-- last owner row raised, so a household could never be deleted. During the
-- cascade the parent row is already gone, which is what we test for.
CREATE OR REPLACE FUNCTION public.enforce_last_owner_protection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owners_left integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN
      RETURN OLD;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.households h WHERE h.id = OLD.household_id) THEN
      RETURN OLD;
    END IF;
    SELECT count(*) INTO owners_left
    FROM public.household_members hm
    WHERE hm.household_id = OLD.household_id
      AND hm.role = 'owner'
      AND hm.id IS DISTINCT FROM OLD.id;
    IF owners_left < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of a household';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
    SELECT count(*) INTO owners_left
    FROM public.household_members hm
    WHERE hm.household_id = NEW.household_id
      AND hm.role = 'owner'
      AND hm.id IS DISTINCT FROM OLD.id;
    IF owners_left < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of a household';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Goal history: append-only through apply_goal_operation
-- ---------------------------------------------------------------------------
-- Direct inserts allowed forging balance_after; direct updates of
-- goals.current_amount bypassed the history entirely.
DROP POLICY IF EXISTS goal_operations_insert_via_membership ON public.goal_operations;

CREATE OR REPLACE FUNCTION public.guard_goal_current_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NEW.current_amount IS DISTINCT FROM OLD.current_amount THEN
    RAISE EXCEPTION 'Goal balance changes must go through goal operations'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_guard_current_amount ON public.goals;
CREATE TRIGGER goals_guard_current_amount
  BEFORE UPDATE OF current_amount ON public.goals
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_goal_current_amount();

-- The starting balance entry used to be inserted by the app; record it here
-- so clients need no INSERT rights on goal_operations at all.
CREATE OR REPLACE FUNCTION public.record_goal_initial_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_amount > 0 AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.goal_operations (
      goal_id, household_id, type, amount, balance_after, note, created_by
    )
    VALUES (
      NEW.id, NEW.household_id, 'initial', NEW.current_amount,
      NEW.current_amount, 'Starting balance', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_goal_initial_operation() FROM PUBLIC;

DROP TRIGGER IF EXISTS goals_record_initial_operation ON public.goals;
CREATE TRIGGER goals_record_initial_operation
  AFTER INSERT ON public.goals
  FOR EACH ROW
  EXECUTE PROCEDURE public.record_goal_initial_operation();

-- ---------------------------------------------------------------------------
-- 4) Profiles: email mirrors auth.users and cannot be spoofed
-- ---------------------------------------------------------------------------
-- A user could set another person's address on their own profile and confuse
-- the family list and the "already a member" invitation check.
-- Definer helper limited to the caller's own address (no lookup by id, so it
-- cannot be used to enumerate other users' emails).
CREATE OR REPLACE FUNCTION public.current_user_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email FROM auth.users u WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_auth_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_auth_email() TO authenticated;

-- Must stay SECURITY INVOKER: current_user is only 'authenticated' when the
-- trigger runs in the client's own role.
CREATE OR REPLACE FUNCTION public.guard_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := coalesce(public.current_user_auth_email(), OLD.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_email ON public.profiles;
CREATE TRIGGER profiles_guard_email
  BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_profile_email();

-- ---------------------------------------------------------------------------
-- 5) Receipt objects: members cannot overwrite each other's files
-- ---------------------------------------------------------------------------
-- Uploads always use fresh object paths (no upsert), so ordinary members
-- never need UPDATE; owners/admins keep it for maintenance.
DROP POLICY IF EXISTS receipts_storage_update_member ON storage.objects;
CREATE POLICY receipts_storage_update_member
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin']
    )
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin']
    )
  );

-- ---------------------------------------------------------------------------
-- 6) transactions.income_source_id must belong to the same household
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_income_source_household_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_household uuid;
BEGIN
  IF NEW.income_source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.household_id INTO source_household
  FROM public.income_sources s
  WHERE s.id = NEW.income_source_id;

  IF NOT FOUND OR source_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'income_source_id % does not belong to household %',
      NEW.income_source_id, NEW.household_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_enforce_income_source_household ON public.transactions;
CREATE TRIGGER transactions_enforce_income_source_household
  BEFORE INSERT OR UPDATE OF income_source_id, household_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_income_source_household_match();

-- ---------------------------------------------------------------------------
-- 7) Transaction currency must equal its account's currency (no FX)
-- ---------------------------------------------------------------------------
-- Balances add amounts per account without looking at currency, while
-- analytics group by transaction currency; a mismatch made the two disagree.
-- Fires only on insert or when account/currency change, so legacy rows are
-- not rewritten.
CREATE OR REPLACE FUNCTION public.enforce_transaction_account_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_currency text;
BEGIN
  SELECT a.currency INTO account_currency
  FROM public.accounts a
  WHERE a.id = NEW.account_id;

  IF account_currency IS NULL THEN
    RAISE EXCEPTION 'Transaction account must exist';
  END IF;

  IF upper(NEW.currency) IS DISTINCT FROM upper(account_currency) THEN
    RAISE EXCEPTION
      'Transaction currency (%) must match account currency (%). Currency conversion is not implemented.',
      NEW.currency, account_currency;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_enforce_account_currency ON public.transactions;
CREATE TRIGGER transactions_enforce_account_currency
  BEFORE INSERT OR UPDATE OF account_id, currency
  ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_transaction_account_currency();

-- ---------------------------------------------------------------------------
-- 8) Recurring templates: store the anchor day for monthly/yearly schedules
-- ---------------------------------------------------------------------------
-- Without it, one short month (Feb 28) permanently pulled later dates
-- earlier. Backfill from start_date; see compute_next_recurring_due_date.
UPDATE public.recurring_payments
SET day_of_month = extract(day from start_date)::integer
WHERE frequency IN ('monthly', 'yearly')
  AND day_of_month IS NULL;

-- Yearly now keeps month + anchor day, clamped to month end, matching
-- lib/calculations/recurring-dates.ts (2028-02-29 → 2029-02-28 → 2032-02-29).
CREATE OR REPLACE FUNCTION public.compute_next_recurring_due_date(
  p_from date,
  p_frequency text,
  p_interval_days integer,
  p_day_of_month integer,
  p_weekday integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_next date;
  v_dom integer;
BEGIN
  IF p_frequency = 'daily' THEN
    RETURN p_from + 1;
  ELSIF p_frequency = 'weekly' THEN
    RETURN p_from + 7;
  ELSIF p_frequency = 'yearly' THEN
    v_next := make_date(extract(year from p_from)::integer + 1, extract(month from p_from)::integer, 1);
    v_dom := coalesce(p_day_of_month, extract(day from p_from)::integer);
    v_dom := LEAST(v_dom, extract(day from (v_next + INTERVAL '1 month - 1 day'))::integer);
    RETURN make_date(extract(year from v_next)::integer, extract(month from v_next)::integer, v_dom);
  ELSIF p_frequency = 'custom' THEN
    IF p_interval_days IS NULL OR p_interval_days < 1 THEN
      RAISE EXCEPTION 'interval_days required for custom frequency';
    END IF;
    RETURN p_from + p_interval_days;
  ELSIF p_frequency = 'monthly' THEN
    v_next := (date_trunc('month', p_from) + INTERVAL '1 month')::date;
    v_dom := coalesce(p_day_of_month, extract(day from p_from)::integer);
    v_dom := LEAST(v_dom, extract(day from (date_trunc('month', v_next) + INTERVAL '1 month - 1 day'))::integer);
    RETURN make_date(extract(year from v_next)::integer, extract(month from v_next)::integer, v_dom);
  ELSE
    RAISE EXCEPTION 'Unsupported frequency: %', p_frequency;
  END IF;
END;
$$;

COMMIT;
