-- Family Finance — audit follow-up: same-household integrity, FX guards,
-- adjustment direction, last-owner protection, atomic bootstrap helper.
-- NON-DESTRUCTIVE: aborts if existing rows violate new invariants.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Preflight: abort if cross-household references already exist
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    WHERE a.household_id IS DISTINCT FROM t.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: transactions.account_id references an account from another household. Inspect and fix manually before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.household_members hm ON hm.id = t.owner_member_id
    WHERE t.owner_member_id IS NOT NULL
      AND hm.household_id IS DISTINCT FROM t.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: transactions.owner_member_id references a member from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transfers tr
    JOIN public.accounts a ON a.id = tr.from_account_id
    WHERE a.household_id IS DISTINCT FROM tr.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: transfers.from_account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transfers tr
    JOIN public.accounts a ON a.id = tr.to_account_id
    WHERE a.household_id IS DISTINCT FROM tr.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: transfers.to_account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transfers tr
    JOIN public.accounts fa ON fa.id = tr.from_account_id
    JOIN public.accounts ta ON ta.id = tr.to_account_id
    WHERE fa.currency IS DISTINCT FROM ta.currency
       OR tr.currency IS DISTINCT FROM fa.currency
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: transfers between different currencies (or currency mismatch) exist. FX is not supported yet.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.budgets b
    JOIN public.accounts a ON a.id = b.account_id
    WHERE b.account_id IS NOT NULL
      AND a.household_id IS DISTINCT FROM b.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: budgets.account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.budgets b
    JOIN public.household_members hm ON hm.id = b.member_id
    WHERE b.member_id IS NOT NULL
      AND hm.household_id IS DISTINCT FROM b.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: budgets.member_id references a member from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goals g
    JOIN public.accounts a ON a.id = g.account_id
    WHERE g.account_id IS NOT NULL
      AND a.household_id IS DISTINCT FROM g.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: goals.account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recurring_payments rp
    JOIN public.accounts a ON a.id = rp.account_id
    WHERE a.household_id IS DISTINCT FROM rp.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: recurring_payments.account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.income_sources i
    JOIN public.accounts a ON a.id = i.account_id
    WHERE a.household_id IS DISTINCT FROM i.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: income_sources.account_id references an account from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.income_sources i
    JOIN public.household_members hm ON hm.id = i.member_id
    WHERE hm.household_id IS DISTINCT FROM i.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: income_sources.member_id references a member from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.receipts r
    JOIN public.transactions t ON t.id = r.transaction_id
    WHERE t.household_id IS DISTINCT FROM r.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: receipts.transaction_id references a transaction from another household.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_settings hs
    JOIN public.accounts a ON a.id = hs.default_account_id
    WHERE hs.default_account_id IS NOT NULL
      AND a.household_id IS DISTINCT FROM hs.household_id
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: household_settings.default_account_id references another household.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Unique (id, household_id) to support composite FKs
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_id_household_id_key;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_id_household_id_key UNIQUE (id, household_id);

ALTER TABLE public.household_members
  DROP CONSTRAINT IF EXISTS household_members_id_household_id_key;
ALTER TABLE public.household_members
  ADD CONSTRAINT household_members_id_household_id_key UNIQUE (id, household_id);

-- ---------------------------------------------------------------------------
-- 2) Composite foreign keys (same-household)
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_account_household_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_household_fkey
  FOREIGN KEY (account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE RESTRICT;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_owner_member_household_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_owner_member_household_fkey
  FOREIGN KEY (owner_member_id, household_id)
  REFERENCES public.household_members (id, household_id)
  ON DELETE SET NULL;

ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_from_account_household_fkey;
ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_from_account_household_fkey
  FOREIGN KEY (from_account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE RESTRICT;

ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_to_account_household_fkey;
ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_to_account_household_fkey
  FOREIGN KEY (to_account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE RESTRICT;

ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_account_household_fkey;
ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_account_household_fkey
  FOREIGN KEY (account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE SET NULL;

ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_member_household_fkey;
ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_member_household_fkey
  FOREIGN KEY (member_id, household_id)
  REFERENCES public.household_members (id, household_id)
  ON DELETE SET NULL;

ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_account_household_fkey;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_account_household_fkey
  FOREIGN KEY (account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE SET NULL;

ALTER TABLE public.recurring_payments
  DROP CONSTRAINT IF EXISTS recurring_payments_account_household_fkey;
ALTER TABLE public.recurring_payments
  ADD CONSTRAINT recurring_payments_account_household_fkey
  FOREIGN KEY (account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE RESTRICT;

ALTER TABLE public.income_sources
  DROP CONSTRAINT IF EXISTS income_sources_account_household_fkey;
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_account_household_fkey
  FOREIGN KEY (account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE RESTRICT;

ALTER TABLE public.income_sources
  DROP CONSTRAINT IF EXISTS income_sources_member_household_fkey;
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_member_household_fkey
  FOREIGN KEY (member_id, household_id)
  REFERENCES public.household_members (id, household_id)
  ON DELETE CASCADE;

ALTER TABLE public.household_settings
  DROP CONSTRAINT IF EXISTS household_settings_default_account_household_fkey;
ALTER TABLE public.household_settings
  ADD CONSTRAINT household_settings_default_account_household_fkey
  FOREIGN KEY (default_account_id, household_id)
  REFERENCES public.accounts (id, household_id)
  ON DELETE SET NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_id_household_id_key;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_id_household_id_key UNIQUE (id, household_id);

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_transaction_household_fkey;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_transaction_household_fkey
  FOREIGN KEY (transaction_id, household_id)
  REFERENCES public.transactions (id, household_id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 3) Category same-household OR global system (trigger — system cats have NULL household)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_category_household_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cat_household uuid;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.household_id INTO cat_household
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_id % does not exist', NEW.category_id;
  END IF;

  IF cat_household IS NOT NULL AND cat_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'category_id % does not belong to household %', NEW.category_id, NEW.household_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_enforce_category_household ON public.transactions;
CREATE TRIGGER transactions_enforce_category_household
  BEFORE INSERT OR UPDATE OF category_id, household_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_category_household_match();

DROP TRIGGER IF EXISTS budgets_enforce_category_household ON public.budgets;
CREATE TRIGGER budgets_enforce_category_household
  BEFORE INSERT OR UPDATE OF category_id, household_id
  ON public.budgets
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_category_household_match();

DROP TRIGGER IF EXISTS recurring_payments_enforce_category_household ON public.recurring_payments;
CREATE TRIGGER recurring_payments_enforce_category_household
  BEFORE INSERT OR UPDATE OF category_id, household_id
  ON public.recurring_payments
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_category_household_match();

CREATE OR REPLACE FUNCTION public.enforce_settings_default_category_household()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cat_household uuid;
BEGIN
  IF NEW.default_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.household_id INTO cat_household
  FROM public.categories c
  WHERE c.id = NEW.default_category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'default_category_id % does not exist', NEW.default_category_id;
  END IF;

  IF cat_household IS NOT NULL AND cat_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'default_category_id % does not belong to household %',
      NEW.default_category_id, NEW.household_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_settings_enforce_default_category ON public.household_settings;
CREATE TRIGGER household_settings_enforce_default_category
  BEFORE INSERT OR UPDATE OF default_category_id, household_id
  ON public.household_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_settings_default_category_household();

-- ---------------------------------------------------------------------------
-- 4) Transfers: same currency only (no FX yet)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_transfer_same_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  from_currency text;
  to_currency text;
BEGIN
  SELECT a.currency INTO from_currency
  FROM public.accounts a WHERE a.id = NEW.from_account_id;

  SELECT a.currency INTO to_currency
  FROM public.accounts a WHERE a.id = NEW.to_account_id;

  IF from_currency IS NULL OR to_currency IS NULL THEN
    RAISE EXCEPTION 'Transfer accounts must exist';
  END IF;

  IF from_currency IS DISTINCT FROM to_currency THEN
    RAISE EXCEPTION
      'Currency conversion is not implemented. Cannot transfer between % and %.',
      from_currency, to_currency;
  END IF;

  IF NEW.currency IS DISTINCT FROM from_currency THEN
    RAISE EXCEPTION
      'Transfer currency (%) must match account currency (%).',
      NEW.currency, from_currency;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transfers_enforce_same_currency ON public.transfers;
CREATE TRIGGER transfers_enforce_same_currency
  BEFORE INSERT OR UPDATE OF from_account_id, to_account_id, currency, household_id
  ON public.transfers
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_transfer_same_currency();

-- ---------------------------------------------------------------------------
-- 5) Adjustments: explicit direction (amount stays >= 0)
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS adjustment_direction text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_adjustment_direction_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_adjustment_direction_check
      CHECK (
        adjustment_direction IS NULL
        OR adjustment_direction IN ('increase', 'decrease')
      );
  END IF;
END $$;

-- Backfill existing adjustments as increases (matches previous always-add behavior)
UPDATE public.transactions
SET adjustment_direction = 'increase'
WHERE type = 'adjustment'
  AND adjustment_direction IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_adjustment_direction_required'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_adjustment_direction_required
      CHECK (
        (type = 'adjustment' AND adjustment_direction IS NOT NULL)
        OR (type <> 'adjustment' AND adjustment_direction IS NULL)
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Protect last owner (UPDATE role / DELETE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_last_owner_protection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owners_left integer;
  target_household uuid;
  old_role text;
  new_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_household := OLD.household_id;
    old_role := OLD.role;
    IF old_role <> 'owner' THEN
      RETURN OLD;
    END IF;
    SELECT count(*) INTO owners_left
    FROM public.household_members hm
    WHERE hm.household_id = target_household
      AND hm.role = 'owner'
      AND hm.id IS DISTINCT FROM OLD.id;
    IF owners_left < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of a household';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  target_household := NEW.household_id;
  old_role := OLD.role;
  new_role := NEW.role;

  IF old_role = 'owner' AND new_role IS DISTINCT FROM 'owner' THEN
    SELECT count(*) INTO owners_left
    FROM public.household_members hm
    WHERE hm.household_id = target_household
      AND hm.role = 'owner'
      AND hm.id IS DISTINCT FROM OLD.id;
    IF owners_left < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of a household';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_protect_last_owner ON public.household_members;
CREATE TRIGGER household_members_protect_last_owner
  BEFORE DELETE OR UPDATE OF role
  ON public.household_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_last_owner_protection();

-- ---------------------------------------------------------------------------
-- 7) Atomic first-household bootstrap (advisory lock; user may join more later)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_first_household_for_user(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_household_name text,
  p_currency text
)
RETURNS TABLE (household_id uuid, member_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_member_id uuid;
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'EUR'));
  v_household_name text := coalesce(nullif(trim(p_household_name), ''), 'Our Family');
  v_display_name text;
  v_existing public.household_members%ROWTYPE;
  cat record;
  id_map jsonb := '{}'::jsonb;
  new_cat_id uuid;
  parent_new_id uuid;
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    -- Allow service_role (auth.uid() null) OR the authenticated user themselves
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Not allowed to bootstrap another user';
    END IF;
  END IF;

  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    -- service_role connects as a role that bypasses RLS; still require explicit user id
    NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
  FROM public.household_members hm
  WHERE hm.user_id = p_user_id
  ORDER BY hm.joined_at ASC
  LIMIT 1;

  IF FOUND THEN
    household_id := v_existing.household_id;
    member_id := v_existing.id;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.profiles (id, email, first_name, last_name, currency)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, v_currency)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
        currency = EXCLUDED.currency,
        updated_at = timezone('utc', now());

  INSERT INTO public.households (name, base_currency)
  VALUES (v_household_name, v_currency)
  RETURNING id INTO v_household_id;

  v_display_name := nullif(trim(concat_ws(' ', p_first_name, p_last_name)), '');
  IF v_display_name IS NULL THEN
    v_display_name := p_email;
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role, display_name)
  VALUES (v_household_id, p_user_id, 'owner', v_display_name)
  RETURNING id INTO v_member_id;

  FOR cat IN
    SELECT c.*
    FROM public.categories c
    WHERE c.is_system = true AND c.household_id IS NULL
    ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.sort_order
  LOOP
    new_cat_id := gen_random_uuid();
    id_map := id_map || jsonb_build_object(cat.id::text, new_cat_id::text);
    parent_new_id := NULL;
    IF cat.parent_id IS NOT NULL THEN
      parent_new_id := (id_map ->> cat.parent_id::text)::uuid;
    END IF;

    INSERT INTO public.categories (
      id, household_id, name, icon, color, type, parent_id,
      is_system, sort_order, is_active
    ) VALUES (
      new_cat_id, v_household_id, cat.name, cat.icon, cat.color, cat.type,
      parent_new_id, false, cat.sort_order, cat.is_active
    );
  END LOOP;

  INSERT INTO public.household_settings (
    household_id, base_currency, timezone, week_starts_on, month_starts_on
  ) VALUES (
    v_household_id, v_currency, 'UTC', 1, 1
  );

  INSERT INTO public.accounts (
    household_id, owner_member_id, name, type, currency,
    initial_balance, is_shared, is_active, icon, color
  ) VALUES (
    v_household_id, v_member_id, 'Cash', 'cash', v_currency,
    0, true, true, 'wallet', '#22C55E'
  );

  household_id := v_household_id;
  member_id := v_member_id;
  created := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_household_for_user(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_household_for_user(uuid, text, text, text, text, text)
  TO authenticated, service_role;

COMMIT;
