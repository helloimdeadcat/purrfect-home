-- Recurring payments Phase 2: type/description/archive/interval + occurrence
-- overrides + atomic confirm/skip RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extend recurring_payments
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_payments
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'expense'
    CHECK (type IN ('expense', 'income'));

ALTER TABLE public.recurring_payments
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.recurring_payments
  ADD COLUMN IF NOT EXISTS interval_days integer
    CHECK (interval_days IS NULL OR interval_days > 0);

ALTER TABLE public.recurring_payments
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Amount must be positive for templates
ALTER TABLE public.recurring_payments
  DROP CONSTRAINT IF EXISTS recurring_payments_amount_check;
ALTER TABLE public.recurring_payments
  DROP CONSTRAINT IF EXISTS recurring_payments_amount_positive;
UPDATE public.recurring_payments SET amount = 0.01 WHERE amount <= 0;
ALTER TABLE public.recurring_payments
  ADD CONSTRAINT recurring_payments_amount_positive CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS recurring_payments_household_active_idx
  ON public.recurring_payments (household_id, is_active, is_archived);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_payments_id_household_uidx'
  ) THEN
    ALTER TABLE public.recurring_payments
      ADD CONSTRAINT recurring_payments_id_household_uidx UNIQUE (id, household_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Extend occurrences
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_payment_occurrences
  ADD COLUMN IF NOT EXISTS amount numeric(15, 2)
    CHECK (amount IS NULL OR amount > 0);

ALTER TABLE public.recurring_payment_occurrences
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.recurring_payment_occurrences
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.recurring_payment_occurrences
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.recurring_payment_occurrences
  ADD COLUMN IF NOT EXISTS household_id uuid;

-- Backfill household_id from parent template
UPDATE public.recurring_payment_occurrences o
SET household_id = rp.household_id
FROM public.recurring_payments rp
WHERE o.recurring_payment_id = rp.id
  AND o.household_id IS NULL;

ALTER TABLE public.recurring_payment_occurrences
  ALTER COLUMN household_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_occurrences_payment_household_fkey'
  ) THEN
    ALTER TABLE public.recurring_payment_occurrences
      ADD CONSTRAINT recurring_occurrences_payment_household_fkey
      FOREIGN KEY (recurring_payment_id, household_id)
      REFERENCES public.recurring_payments (id, household_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS recurring_occurrences_household_status_idx
  ON public.recurring_payment_occurrences (household_id, status, scheduled_date);

-- Tighten occurrence RLS to use household_id directly
DROP POLICY IF EXISTS recurring_occurrences_select_member ON public.recurring_payment_occurrences;
CREATE POLICY recurring_occurrences_select_member
  ON public.recurring_payment_occurrences FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS recurring_occurrences_insert_member ON public.recurring_payment_occurrences;
CREATE POLICY recurring_occurrences_insert_member
  ON public.recurring_payment_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  );

DROP POLICY IF EXISTS recurring_occurrences_update_member ON public.recurring_payment_occurrences;
CREATE POLICY recurring_occurrences_update_member
  ON public.recurring_payment_occurrences FOR UPDATE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  )
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  );

DROP POLICY IF EXISTS recurring_occurrences_delete_admin ON public.recurring_payment_occurrences;
CREATE POLICY recurring_occurrences_delete_admin
  ON public.recurring_payment_occurrences FOR DELETE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
  );

-- ---------------------------------------------------------------------------
-- Next due date helper (UTC calendar arithmetic)
-- ---------------------------------------------------------------------------
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
    RETURN (p_from + INTERVAL '1 year')::date;
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

REVOKE ALL ON FUNCTION public.compute_next_recurring_due_date(date, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_next_recurring_due_date(date, text, integer, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Confirm occurrence → transaction (atomic, concurrency-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_recurring_occurrence(
  p_occurrence_id uuid,
  p_amount numeric DEFAULT NULL,
  p_transaction_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  occurrence_id uuid,
  transaction_id uuid,
  next_due_date date,
  next_occurrence_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_occ public.recurring_payment_occurrences%ROWTYPE;
  v_rp public.recurring_payments%ROWTYPE;
  v_account_currency text;
  v_amount numeric(15, 2);
  v_tx_date date;
  v_tx_id uuid;
  v_next date;
  v_next_occ_id uuid;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_occ
  FROM public.recurring_payment_occurrences o
  WHERE o.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found' USING ERRCODE = '22023';
  END IF;

  IF v_occ.status IN ('paid', 'skipped') THEN
    RAISE EXCEPTION 'Occurrence already processed' USING ERRCODE = '22023';
  END IF;

  IF v_occ.status NOT IN ('pending', 'overdue') THEN
    RAISE EXCEPTION 'Occurrence cannot be confirmed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rp
  FROM public.recurring_payments rp
  WHERE rp.id = v_occ.recurring_payment_id
  FOR UPDATE;

  IF NOT public.has_household_role(v_rp.household_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_rp.is_archived THEN
    RAISE EXCEPTION 'Cannot confirm an archived recurring payment' USING ERRCODE = '22023';
  END IF;

  SELECT a.currency INTO v_account_currency
  FROM public.accounts a
  WHERE a.id = v_rp.account_id
    AND a.household_id = v_rp.household_id
    AND a.is_active = true;

  IF v_account_currency IS NULL THEN
    RAISE EXCEPTION 'Account not found or inactive' USING ERRCODE = '22023';
  END IF;

  IF upper(v_rp.currency) IS DISTINCT FROM upper(v_account_currency) THEN
    RAISE EXCEPTION 'Currency mismatch between template and account' USING ERRCODE = '22023';
  END IF;

  v_amount := round(coalesce(p_amount, v_occ.amount, v_rp.amount), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  v_tx_date := coalesce(p_transaction_date, v_occ.scheduled_date, (timezone('utc', now()))::date);

  SELECT hm.id INTO v_member_id
  FROM public.household_members hm
  WHERE hm.household_id = v_rp.household_id
    AND hm.user_id = v_user_id
  LIMIT 1;

  INSERT INTO public.transactions (
    household_id, account_id, category_id, created_by, owner_member_id,
    type, amount, currency, transaction_date, description,
    is_recurring, recurring_payment_id, is_necessary, is_confirmed, notes
  )
  VALUES (
    v_rp.household_id, v_rp.account_id, v_rp.category_id, v_user_id, v_member_id,
    v_rp.type, v_amount, v_rp.currency, v_tx_date, v_rp.name,
    true, v_rp.id, true, true, nullif(trim(coalesce(p_notes, '')), '')
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.recurring_payment_occurrences
  SET
    status = 'paid',
    transaction_id = v_tx_id,
    amount = v_amount,
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    processed_at = timezone('utc', now()),
    processed_by = v_user_id
  WHERE id = v_occ.id
    AND status IN ('pending', 'overdue');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence already processed' USING ERRCODE = '22023';
  END IF;

  v_next := public.compute_next_recurring_due_date(
    v_occ.scheduled_date,
    v_rp.frequency,
    v_rp.interval_days,
    v_rp.day_of_month,
    v_rp.weekday
  );

  IF v_rp.end_date IS NOT NULL AND v_next > v_rp.end_date THEN
    UPDATE public.recurring_payments
    SET next_due_date = v_occ.scheduled_date,
        is_active = false,
        updated_at = timezone('utc', now())
    WHERE id = v_rp.id;

    occurrence_id := v_occ.id;
    transaction_id := v_tx_id;
    next_due_date := v_occ.scheduled_date;
    next_occurrence_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.recurring_payments
  SET next_due_date = v_next,
      updated_at = timezone('utc', now())
  WHERE id = v_rp.id;

  INSERT INTO public.recurring_payment_occurrences (
    recurring_payment_id, household_id, scheduled_date, status
  )
  VALUES (v_rp.id, v_rp.household_id, v_next, 'pending')
  ON CONFLICT (recurring_payment_id, scheduled_date) DO NOTHING
  RETURNING id INTO v_next_occ_id;

  IF v_next_occ_id IS NULL THEN
    SELECT o.id INTO v_next_occ_id
    FROM public.recurring_payment_occurrences o
    WHERE o.recurring_payment_id = v_rp.id
      AND o.scheduled_date = v_next;
  END IF;

  occurrence_id := v_occ.id;
  transaction_id := v_tx_id;
  next_due_date := v_next;
  next_occurrence_id := v_next_occ_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_recurring_occurrence(uuid, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_recurring_occurrence(uuid, numeric, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Skip occurrence (atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.skip_recurring_occurrence(
  p_occurrence_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  occurrence_id uuid,
  next_due_date date,
  next_occurrence_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_occ public.recurring_payment_occurrences%ROWTYPE;
  v_rp public.recurring_payments%ROWTYPE;
  v_next date;
  v_next_occ_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_occ
  FROM public.recurring_payment_occurrences o
  WHERE o.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found' USING ERRCODE = '22023';
  END IF;

  IF v_occ.status IN ('paid', 'skipped') THEN
    RAISE EXCEPTION 'Occurrence already processed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rp
  FROM public.recurring_payments rp
  WHERE rp.id = v_occ.recurring_payment_id
  FOR UPDATE;

  IF NOT public.has_household_role(v_rp.household_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recurring_payment_occurrences
  SET
    status = 'skipped',
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    processed_at = timezone('utc', now()),
    processed_by = v_user_id
  WHERE id = v_occ.id
    AND status IN ('pending', 'overdue');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence already processed' USING ERRCODE = '22023';
  END IF;

  v_next := public.compute_next_recurring_due_date(
    v_occ.scheduled_date,
    v_rp.frequency,
    v_rp.interval_days,
    v_rp.day_of_month,
    v_rp.weekday
  );

  IF v_rp.end_date IS NOT NULL AND v_next > v_rp.end_date THEN
    UPDATE public.recurring_payments
    SET is_active = false, updated_at = timezone('utc', now())
    WHERE id = v_rp.id;

    occurrence_id := v_occ.id;
    next_due_date := v_occ.scheduled_date;
    next_occurrence_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.recurring_payments
  SET next_due_date = v_next, updated_at = timezone('utc', now())
  WHERE id = v_rp.id;

  INSERT INTO public.recurring_payment_occurrences (
    recurring_payment_id, household_id, scheduled_date, status
  )
  VALUES (v_rp.id, v_rp.household_id, v_next, 'pending')
  ON CONFLICT (recurring_payment_id, scheduled_date) DO NOTHING
  RETURNING id INTO v_next_occ_id;

  IF v_next_occ_id IS NULL THEN
    SELECT o.id INTO v_next_occ_id
    FROM public.recurring_payment_occurrences o
    WHERE o.recurring_payment_id = v_rp.id
      AND o.scheduled_date = v_next;
  END IF;

  occurrence_id := v_occ.id;
  next_due_date := v_next;
  next_occurrence_id := v_next_occ_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_recurring_occurrence(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_recurring_occurrence(uuid, text) TO authenticated;

COMMIT;
