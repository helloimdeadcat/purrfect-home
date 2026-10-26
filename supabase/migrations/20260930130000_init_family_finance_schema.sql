-- Family Finance — initial schema, indexes, RLS, and receipts storage bucket
-- Safe to apply on an empty Supabase project. Does not DROP existing objects.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  avatar_url text,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  display_name text,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS household_members_household_id_idx
  ON public.household_members (household_id);
CREATE INDEX IF NOT EXISTS household_members_user_id_idx
  ON public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  owner_member_id uuid REFERENCES public.household_members (id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('bank_account', 'credit_card', 'cash', 'savings', 'investment', 'other')),
  currency text NOT NULL DEFAULT 'EUR',
  initial_balance numeric(15, 2) NOT NULL DEFAULT 0,
  is_shared boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  color text,
  icon text,
  note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS accounts_household_id_idx
  ON public.accounts (household_id);
CREATE INDEX IF NOT EXISTS accounts_owner_member_id_idx
  ON public.accounts (owner_member_id);

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (nested; system rows may have household_id NULL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  type text NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  parent_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS categories_household_id_idx
  ON public.categories (household_id);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx
  ON public.categories (parent_id);

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recurring_payments (before transactions for FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  frequency text NOT NULL
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  day_of_month integer CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  weekday integer CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  start_date date NOT NULL,
  end_date date,
  next_due_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  auto_create boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS recurring_payments_household_id_idx
  ON public.recurring_payments (household_id);
CREATE INDEX IF NOT EXISTS recurring_payments_next_due_date_idx
  ON public.recurring_payments (next_due_date);
CREATE INDEX IF NOT EXISTS recurring_payments_account_id_idx
  ON public.recurring_payments (account_id);
CREATE INDEX IF NOT EXISTS recurring_payments_category_id_idx
  ON public.recurring_payments (category_id);

CREATE TRIGGER recurring_payments_set_updated_at
  BEFORE UPDATE ON public.recurring_payments
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions (soft delete via deleted_at)
-- Balance is derived: initial_balance +/- transactions/transfers — not stored here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  owner_member_id uuid REFERENCES public.household_members (id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'adjustment')),
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  transaction_date date NOT NULL,
  description text,
  merchant text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_payment_id uuid REFERENCES public.recurring_payments (id) ON DELETE SET NULL,
  is_necessary boolean NOT NULL DEFAULT true,
  is_confirmed boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS transactions_household_id_idx
  ON public.transactions (household_id);
CREATE INDEX IF NOT EXISTS transactions_transaction_date_idx
  ON public.transactions (transaction_date);
CREATE INDEX IF NOT EXISTS transactions_account_id_idx
  ON public.transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx
  ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_created_by_idx
  ON public.transactions (created_by);
CREATE INDEX IF NOT EXISTS transactions_household_id_transaction_date_idx
  ON public.transactions (household_id, transaction_date);
CREATE INDEX IF NOT EXISTS transactions_deleted_at_idx
  ON public.transactions (deleted_at);
CREATE INDEX IF NOT EXISTS transactions_owner_member_id_idx
  ON public.transactions (owner_member_id);
CREATE INDEX IF NOT EXISTS transactions_recurring_payment_id_idx
  ON public.transactions (recurring_payment_id);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transfers (not income/expense)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  to_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  transfer_date date NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS transfers_household_id_idx
  ON public.transfers (household_id);
CREATE INDEX IF NOT EXISTS transfers_from_account_id_idx
  ON public.transfers (from_account_id);
CREATE INDEX IF NOT EXISTS transfers_to_account_id_idx
  ON public.transfers (to_account_id);
CREATE INDEX IF NOT EXISTS transfers_transfer_date_idx
  ON public.transfers (transfer_date);
CREATE INDEX IF NOT EXISTS transfers_created_by_idx
  ON public.transfers (created_by);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  period_type text NOT NULL
    CHECK (period_type IN ('weekly', 'monthly', 'yearly', 'custom')),
  start_date date NOT NULL,
  end_date date,
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.household_members (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS budgets_household_id_idx
  ON public.budgets (household_id);
CREATE INDEX IF NOT EXISTS budgets_category_id_idx
  ON public.budgets (category_id);
CREATE INDEX IF NOT EXISTS budgets_account_id_idx
  ON public.budgets (account_id);
CREATE INDEX IF NOT EXISTS budgets_member_id_idx
  ON public.budgets (member_id);

CREATE TRIGGER budgets_set_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_amount numeric(15, 2) NOT NULL CHECK (target_amount >= 0),
  current_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date date,
  account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  icon text,
  color text,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS goals_household_id_idx
  ON public.goals (household_id);
CREATE INDEX IF NOT EXISTS goals_account_id_idx
  ON public.goals (account_id);

CREATE TRIGGER goals_set_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recurring_payment_occurrences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_payment_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_payment_id uuid NOT NULL
    REFERENCES public.recurring_payments (id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'skipped', 'overdue')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (recurring_payment_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS recurring_payment_occurrences_payment_id_idx
  ON public.recurring_payment_occurrences (recurring_payment_id);
CREATE INDEX IF NOT EXISTS recurring_payment_occurrences_scheduled_date_idx
  ON public.recurring_payment_occurrences (scheduled_date);
CREATE INDEX IF NOT EXISTS recurring_payment_occurrences_transaction_id_idx
  ON public.recurring_payment_occurrences (transaction_id);
CREATE INDEX IF NOT EXISTS recurring_payment_occurrences_status_idx
  ON public.recurring_payment_occurrences (status);

-- ---------------------------------------------------------------------------
-- income_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.household_members (id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  frequency text NOT NULL
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  next_date date NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS income_sources_household_id_idx
  ON public.income_sources (household_id);
CREATE INDEX IF NOT EXISTS income_sources_member_id_idx
  ON public.income_sources (member_id);
CREATE INDEX IF NOT EXISTS income_sources_account_id_idx
  ON public.income_sources (account_id);

CREATE TRIGGER income_sources_set_updated_at
  BEFORE UPDATE ON public.income_sources
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- receipts (files live in Storage; this table stores metadata)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size >= 0),
  uploaded_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS receipts_household_id_idx
  ON public.receipts (household_id);
CREATE INDEX IF NOT EXISTS receipts_transaction_id_idx
  ON public.receipts (transaction_id);
CREATE INDEX IF NOT EXISTS receipts_uploaded_by_idx
  ON public.receipts (uploaded_by);

-- ---------------------------------------------------------------------------
-- tags / transaction_tags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (household_id, name)
);

CREATE INDEX IF NOT EXISTS tags_household_id_idx
  ON public.tags (household_id);

CREATE TABLE IF NOT EXISTS public.transaction_tags (
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS transaction_tags_tag_id_idx
  ON public.transaction_tags (tag_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_household_id_idx
  ON public.notifications (household_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_is_read_idx
  ON public.notifications (user_id, is_read);

-- ---------------------------------------------------------------------------
-- household_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_settings (
  household_id uuid PRIMARY KEY REFERENCES public.households (id) ON DELETE CASCADE,
  base_currency text NOT NULL DEFAULT 'EUR',
  timezone text NOT NULL DEFAULT 'UTC',
  week_starts_on smallint NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  month_starts_on smallint NOT NULL DEFAULT 1 CHECK (month_starts_on BETWEEN 1 AND 28),
  default_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  default_category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS audit_logs_household_id_idx
  ON public.audit_logs (household_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER — avoid recursive policy checks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.household_role(p_household_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hm.role
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_household_role(
  p_household_id uuid,
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = auth.uid()
      AND hm.role = ANY (allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_household_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members me
    JOIN public.household_members other
      ON other.household_id = me.household_id
    WHERE me.user_id = auth.uid()
      AND other.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.household_has_no_members(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_household_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  folder text;
BEGIN
  folder := (storage.foldername(object_name))[1];
  IF folder IS NULL OR folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN folder::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.is_household_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_household_role(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_household_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_has_no_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_household_id(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_household_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_household_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_has_no_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_household_id(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_payment_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies: profiles
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_own_or_household
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_household_with(id));

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Policies: households
-- ---------------------------------------------------------------------------
CREATE POLICY households_select_member
  ON public.households FOR SELECT TO authenticated
  USING (public.is_household_member(id));

CREATE POLICY households_insert_authenticated
  ON public.households FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY households_update_admin
  ON public.households FOR UPDATE TO authenticated
  USING (public.has_household_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_household_role(id, ARRAY['owner', 'admin']));

CREATE POLICY households_delete_owner
  ON public.households FOR DELETE TO authenticated
  USING (public.has_household_role(id, ARRAY['owner']));

-- ---------------------------------------------------------------------------
-- Policies: household_members
-- ---------------------------------------------------------------------------
CREATE POLICY household_members_select_member
  ON public.household_members FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_members_insert_admin
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      -- Allow first owner bootstrap when creating a household
      role = 'owner'
      AND user_id = auth.uid()
      AND public.household_has_no_members(household_id)
    )
  );

CREATE POLICY household_members_update_admin
  ON public.household_members FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin']));

CREATE POLICY household_members_delete_admin
  ON public.household_members FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: accounts
-- ---------------------------------------------------------------------------
CREATE POLICY accounts_select_member
  ON public.accounts FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY accounts_insert_member
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY accounts_update_member
  ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY accounts_delete_admin
  ON public.accounts FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: categories
-- ---------------------------------------------------------------------------
CREATE POLICY categories_select_visible
  ON public.categories FOR SELECT TO authenticated
  USING (
    is_system = true
    OR household_id IS NULL
    OR public.is_household_member(household_id)
  );

CREATE POLICY categories_insert_member
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND household_id IS NOT NULL
    AND public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  );

CREATE POLICY categories_update_member
  ON public.categories FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND household_id IS NOT NULL
    AND public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  )
  WITH CHECK (
    is_system = false
    AND household_id IS NOT NULL
    AND public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
  );

CREATE POLICY categories_delete_admin
  ON public.categories FOR DELETE TO authenticated
  USING (
    is_system = false
    AND household_id IS NOT NULL
    AND public.has_household_role(household_id, ARRAY['owner', 'admin'])
  );

-- ---------------------------------------------------------------------------
-- Policies: transactions
-- ---------------------------------------------------------------------------
CREATE POLICY transactions_select_member
  ON public.transactions FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY transactions_insert_member
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

CREATE POLICY transactions_update_member
  ON public.transactions FOR UPDATE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      public.has_household_role(household_id, ARRAY['member'])
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      public.has_household_role(household_id, ARRAY['member'])
      AND created_by = auth.uid()
    )
  );

-- Hard DELETE restricted to owner/admin (prefer soft-delete via deleted_at)
CREATE POLICY transactions_delete_admin
  ON public.transactions FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: transfers
-- ---------------------------------------------------------------------------
CREATE POLICY transfers_select_member
  ON public.transfers FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY transfers_insert_member
  ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

CREATE POLICY transfers_update_admin
  ON public.transfers FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin']));

CREATE POLICY transfers_delete_admin
  ON public.transfers FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: budgets
-- ---------------------------------------------------------------------------
CREATE POLICY budgets_select_member
  ON public.budgets FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY budgets_insert_member
  ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY budgets_update_member
  ON public.budgets FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY budgets_delete_admin
  ON public.budgets FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: goals
-- ---------------------------------------------------------------------------
CREATE POLICY goals_select_member
  ON public.goals FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY goals_insert_member
  ON public.goals FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY goals_update_member
  ON public.goals FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY goals_delete_admin
  ON public.goals FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: recurring_payments
-- ---------------------------------------------------------------------------
CREATE POLICY recurring_payments_select_member
  ON public.recurring_payments FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY recurring_payments_insert_member
  ON public.recurring_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY recurring_payments_update_member
  ON public.recurring_payments FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY recurring_payments_delete_admin
  ON public.recurring_payments FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: recurring_payment_occurrences
-- ---------------------------------------------------------------------------
CREATE POLICY recurring_occurrences_select_member
  ON public.recurring_payment_occurrences FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recurring_payments rp
      WHERE rp.id = recurring_payment_id
        AND public.is_household_member(rp.household_id)
    )
  );

CREATE POLICY recurring_occurrences_insert_member
  ON public.recurring_payment_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recurring_payments rp
      WHERE rp.id = recurring_payment_id
        AND public.has_household_role(rp.household_id, ARRAY['owner', 'admin', 'member'])
    )
  );

CREATE POLICY recurring_occurrences_update_member
  ON public.recurring_payment_occurrences FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recurring_payments rp
      WHERE rp.id = recurring_payment_id
        AND public.has_household_role(rp.household_id, ARRAY['owner', 'admin', 'member'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recurring_payments rp
      WHERE rp.id = recurring_payment_id
        AND public.has_household_role(rp.household_id, ARRAY['owner', 'admin', 'member'])
    )
  );

CREATE POLICY recurring_occurrences_delete_admin
  ON public.recurring_payment_occurrences FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recurring_payments rp
      WHERE rp.id = recurring_payment_id
        AND public.has_household_role(rp.household_id, ARRAY['owner', 'admin'])
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: income_sources
-- ---------------------------------------------------------------------------
CREATE POLICY income_sources_select_member
  ON public.income_sources FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY income_sources_insert_member
  ON public.income_sources FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY income_sources_update_member
  ON public.income_sources FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY income_sources_delete_admin
  ON public.income_sources FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: receipts
-- ---------------------------------------------------------------------------
CREATE POLICY receipts_select_member
  ON public.receipts FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY receipts_insert_member
  ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND uploaded_by = auth.uid()
  );

CREATE POLICY receipts_update_member
  ON public.receipts FOR UPDATE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      public.has_household_role(household_id, ARRAY['member'])
      AND uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      public.has_household_role(household_id, ARRAY['member'])
      AND uploaded_by = auth.uid()
    )
  );

CREATE POLICY receipts_delete_admin
  ON public.receipts FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: tags
-- ---------------------------------------------------------------------------
CREATE POLICY tags_select_member
  ON public.tags FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY tags_insert_member
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY tags_update_member
  ON public.tags FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

CREATE POLICY tags_delete_admin
  ON public.tags FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Policies: transaction_tags
-- ---------------------------------------------------------------------------
CREATE POLICY transaction_tags_select_member
  ON public.transaction_tags FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND public.is_household_member(t.household_id)
    )
  );

CREATE POLICY transaction_tags_insert_member
  ON public.transaction_tags FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND public.has_household_role(t.household_id, ARRAY['owner', 'admin', 'member'])
    )
  );

CREATE POLICY transaction_tags_delete_member
  ON public.transaction_tags FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND public.has_household_role(t.household_id, ARRAY['owner', 'admin', 'member'])
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: notifications
-- ---------------------------------------------------------------------------
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_insert_member
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id)
    AND (
      user_id = auth.uid()
      OR public.has_household_role(household_id, ARRAY['owner', 'admin'])
    )
  );

CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own
  ON public.notifications FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_household_role(household_id, ARRAY['owner', 'admin'])
  );

-- ---------------------------------------------------------------------------
-- Policies: household_settings
-- ---------------------------------------------------------------------------
CREATE POLICY household_settings_select_member
  ON public.household_settings FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_settings_insert_admin
  ON public.household_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin']));

CREATE POLICY household_settings_update_admin
  ON public.household_settings FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin']));

CREATE POLICY household_settings_delete_owner
  ON public.household_settings FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner']));

-- ---------------------------------------------------------------------------
-- Policies: audit_logs (append-mostly; members can read)
-- ---------------------------------------------------------------------------
CREATE POLICY audit_logs_select_member
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY audit_logs_insert_member
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- No UPDATE/DELETE policies — audit logs are immutable for clients

-- ---------------------------------------------------------------------------
-- Storage: receipts bucket
-- Path convention: {household_id}/{transaction_id}/{filename}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY receipts_storage_select_member
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.is_household_member(public.storage_household_id(name))
  );

CREATE POLICY receipts_storage_insert_member
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin', 'member']
    )
  );

CREATE POLICY receipts_storage_update_member
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin', 'member']
    )
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin', 'member']
    )
  );

CREATE POLICY receipts_storage_delete_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND public.has_household_role(
      public.storage_household_id(name),
      ARRAY['owner', 'admin']
    )
  );

COMMIT;
