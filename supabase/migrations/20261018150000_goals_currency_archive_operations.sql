-- Goals Phase 2: currency, archive flag, operation history, atomic apply RPC.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extend goals
-- ---------------------------------------------------------------------------
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Normalize any legacy zero targets before tightening the check
UPDATE public.goals SET target_amount = 0.01 WHERE target_amount <= 0;

ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_target_amount_check;
ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_target_amount_positive;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_target_amount_positive CHECK (target_amount > 0);

ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_current_amount_check;
ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_current_amount_nonneg;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_current_amount_nonneg CHECK (current_amount >= 0);

CREATE INDEX IF NOT EXISTS goals_household_archived_idx
  ON public.goals (household_id, is_archived);

-- Needed for composite FK from goal_operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_id_household_uidx'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_id_household_uidx UNIQUE (id, household_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- goal_operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goal_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  household_id uuid NOT NULL,
  type text NOT NULL
    CHECK (type IN ('initial', 'deposit', 'withdraw', 'adjust')),
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  balance_after numeric(15, 2) NOT NULL CHECK (balance_after >= 0),
  note text,
  operation_date date NOT NULL DEFAULT (timezone('utc', now()))::date,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT goal_operations_goal_household_fkey
    FOREIGN KEY (goal_id, household_id)
    REFERENCES public.goals (id, household_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS goal_operations_goal_id_idx
  ON public.goal_operations (goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS goal_operations_household_id_idx
  ON public.goal_operations (household_id);

ALTER TABLE public.goal_operations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_operations TO authenticated;
REVOKE ALL ON public.goal_operations FROM anon;

CREATE POLICY goal_operations_select_member
  ON public.goal_operations FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

-- Inserts go through SECURITY DEFINER RPC only (no direct client insert policy
-- that would allow forging balance_after). Members may still need INSERT for
-- service-role-free path via RPC as authenticated.
CREATE POLICY goal_operations_insert_via_membership
  ON public.goal_operations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

-- No UPDATE/DELETE for clients — history is append-only from the app

-- ---------------------------------------------------------------------------
-- Atomic apply: update goal balance + insert operation + completion flags
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_goal_operation(
  p_goal_id uuid,
  p_type text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_operation_date date DEFAULT NULL
)
RETURNS TABLE (
  goal_id uuid,
  current_amount numeric,
  is_completed boolean,
  operation_id uuid,
  balance_after numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal public.goals%ROWTYPE;
  v_delta numeric(15, 2);
  v_new_balance numeric(15, 2);
  v_op_id uuid;
  v_op_date date := coalesce(p_operation_date, (timezone('utc', now()))::date);
  v_amount numeric(15, 2) := round(coalesce(p_amount, 0), 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('deposit', 'withdraw', 'adjust') THEN
    RAISE EXCEPTION 'Invalid operation type' USING ERRCODE = '22023';
  END IF;

  IF v_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_goal
  FROM public.goals g
  WHERE g.id = p_goal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_household_role(v_goal.household_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_goal.is_archived THEN
    RAISE EXCEPTION 'Cannot modify an archived goal' USING ERRCODE = '22023';
  END IF;

  IF p_type = 'deposit' THEN
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Deposit amount must be greater than zero' USING ERRCODE = '22023';
    END IF;
    v_new_balance := round(v_goal.current_amount + v_amount, 2);
    v_delta := v_amount;
  ELSIF p_type = 'withdraw' THEN
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Withdraw amount must be greater than zero' USING ERRCODE = '22023';
    END IF;
    IF v_amount > v_goal.current_amount THEN
      RAISE EXCEPTION 'Insufficient goal balance' USING ERRCODE = '22023';
    END IF;
    v_new_balance := round(v_goal.current_amount - v_amount, 2);
    v_delta := v_amount;
  ELSE
    -- adjust: amount is the new absolute balance
    v_new_balance := v_amount;
    v_delta := v_amount;
  END IF;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Goal balance cannot be negative' USING ERRCODE = '22023';
  END IF;

  UPDATE public.goals g
  SET
    current_amount = v_new_balance,
    is_completed = (v_new_balance >= g.target_amount),
    updated_at = timezone('utc', now())
  WHERE g.id = v_goal.id;

  INSERT INTO public.goal_operations (
    goal_id, household_id, type, amount, balance_after, note, operation_date, created_by
  )
  VALUES (
    v_goal.id, v_goal.household_id, p_type, v_delta, v_new_balance,
    nullif(trim(p_note), ''), v_op_date, v_user_id
  )
  RETURNING id INTO v_op_id;

  goal_id := v_goal.id;
  current_amount := v_new_balance;
  is_completed := (v_new_balance >= v_goal.target_amount);
  operation_id := v_op_id;
  balance_after := v_new_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_goal_operation(uuid, text, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_goal_operation(uuid, text, numeric, text, date) TO authenticated;

COMMIT;
