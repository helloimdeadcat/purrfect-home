-- Family Finance — pending migrations bundle (generated, do not edit).
-- Regenerate: node scripts/build-migration-bundle.mjs 20261018180000
--
-- Paste the whole file into Supabase → SQL Editor → Run. Every migration is
-- idempotent and wrapped in its own transaction, so re-running is safe.
-- The last statement prints a checklist: every row must show ok = true.
--
-- Included, in order:
--   20261018180000_settings_reference_data.sql
--   20261026120000_stabilization_security_integrity.sql
--   20261026130000_receipts_upload_delete.sql
--   20261026140000_notifications_audit_log.sql
--   20261026150000_safe_to_spend_reserve.sql
--   20261026160000_tasks_schedule.sql
--   20261026170000_habits.sql
--   20261026180000_meal_plans.sql

-- =====================================================================
-- 20261018180000_settings_reference_data.sql
-- =====================================================================
-- Phase 3A: soft-archive tags + optional income_source link on transactions.

BEGIN;

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS tags_household_active_idx
  ON public.tags (household_id, is_active);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS income_source_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_income_source_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_income_source_fkey
      FOREIGN KEY (income_source_id)
      REFERENCES public.income_sources (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_income_source_id_idx
  ON public.transactions (income_source_id);

COMMENT ON COLUMN public.tags.is_active IS
  'False = archived; transaction_tags links are preserved.';
COMMENT ON COLUMN public.transactions.income_source_id IS
  'Optional income source for income transactions; SET NULL on source delete.';

COMMIT;


-- =====================================================================
-- 20261026120000_stabilization_security_integrity.sql
-- =====================================================================
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


-- =====================================================================
-- 20261026130000_receipts_upload_delete.sql
-- =====================================================================
-- Phase 4A — receipts: uploader may delete their own receipt (row + file),
-- and receipt rows must reference a transaction and storage path of the same
-- household. Re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Same-household integrity for receipt rows
-- ---------------------------------------------------------------------------
-- receipts.transaction_id is a plain FK, so a crafted insert could attach a
-- row to another household's transaction id, or point storage_path into
-- another household's folder.
CREATE OR REPLACE FUNCTION public.enforce_receipt_household_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_household uuid;
BEGIN
  SELECT t.household_id INTO tx_household
  FROM public.transactions t
  WHERE t.id = NEW.transaction_id;

  IF NOT FOUND OR tx_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'transaction_id % does not belong to household %',
      NEW.transaction_id, NEW.household_id;
  END IF;

  IF public.storage_household_id(NEW.storage_path) IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'storage_path must live under the household folder';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipts_enforce_household ON public.receipts;
CREATE TRIGGER receipts_enforce_household
  BEFORE INSERT OR UPDATE OF transaction_id, household_id, storage_path
  ON public.receipts
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_receipt_household_match();

-- ---------------------------------------------------------------------------
-- 2) Delete: owners/admins, or the member who uploaded it
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS receipts_delete_admin ON public.receipts;
CREATE POLICY receipts_delete_admin
  ON public.receipts FOR DELETE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (
      public.has_household_role(household_id, ARRAY['member'])
      AND uploaded_by = auth.uid()
    )
  );

-- The app removes the file before the row, so the uploader check can look
-- the object up through its receipts row.
DROP POLICY IF EXISTS receipts_storage_delete_admin ON storage.objects;
CREATE POLICY receipts_storage_delete_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_household_id(name) IS NOT NULL
    AND (
      public.has_household_role(
        public.storage_household_id(name),
        ARRAY['owner', 'admin']
      )
      OR EXISTS (
        SELECT 1
        FROM public.receipts r
        WHERE r.storage_path = objects.name
          AND r.uploaded_by = auth.uid()
          AND public.has_household_role(r.household_id, ARRAY['member'])
      )
    )
  );

COMMIT;


-- =====================================================================
-- 20261026140000_notifications_audit_log.sql
-- =====================================================================
-- Phase 4B — in-app notifications and audit log.
--
-- Both are written exclusively by SECURITY DEFINER triggers, so clients can
-- neither forge nor erase them:
--   * notifications: a user reads their own and may only flip is_read;
--   * audit_logs: owners/admins read; nobody writes or edits from the client.
-- Audit payloads are explicit column whitelists — no token hashes, no notes,
-- no free-text financial details beyond what the event needs.
-- Re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tables: optional deep link + list index
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_household_created_idx
  ON public.audit_logs (household_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_member ON public.notifications;
DROP POLICY IF EXISTS audit_logs_insert_member ON public.audit_logs;

DROP POLICY IF EXISTS audit_logs_select_member ON public.audit_logs;
CREATE POLICY audit_logs_select_member
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- Only the read flag is user-editable.
CREATE OR REPLACE FUNCTION public.guard_notification_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.household_id IS DISTINCT FROM OLD.household_id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.link IS DISTINCT FROM OLD.link
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Only is_read can be changed on a notification'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_guard_update ON public.notifications;
CREATE TRIGGER notifications_guard_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_notification_update();

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_label(p_household_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(hm.display_name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    split_part(p.email, '@', 1),
    'Someone'
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.household_members hm
    ON hm.household_id = p_household_id AND hm.user_id = p_user_id
  LEFT JOIN public.profiles p ON p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.member_label(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.write_audit(
  p_household_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_old jsonb,
  p_new jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The household may be mid-cascade-delete; nothing to log then.
  IF NOT EXISTS (SELECT 1 FROM public.households h WHERE h.id = p_household_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (household_id, user_id, entity_type, entity_id, action, old_data, new_data)
  VALUES (p_household_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_old, p_new);
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit(uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC;

/** Notify every household member except the acting user. */
CREATE OR REPLACE FUNCTION public.notify_household(
  p_household_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text,
  p_only_user uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households h WHERE h.id = p_household_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, household_id, type, title, message, link)
  SELECT hm.user_id, p_household_id, p_type, p_title, p_message, p_link
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.user_id IS DISTINCT FROM auth.uid()
    AND (p_only_user IS NULL OR hm.user_id = p_only_user);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_household(uuid, text, text, text, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4) Membership events
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_household_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.household_id, 'member', NEW.id, 'member_joined',
      NULL, jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role));
    v_name := public.member_label(NEW.household_id, NEW.user_id);
    -- The joining user is not auth.uid() for admin-client inserts, so
    -- exclude them explicitly.
    INSERT INTO public.notifications (user_id, household_id, type, title, message, link)
    SELECT hm.user_id, NEW.household_id, 'member_joined',
      'New family member', v_name || ' joined the household.', '/app/family'
    FROM public.household_members hm
    WHERE hm.household_id = NEW.household_id
      AND hm.user_id <> NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.write_audit(NEW.household_id, 'member', NEW.id, 'member_role_changed',
        jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role));
      PERFORM public.notify_household(NEW.household_id, 'member_role_changed',
        'Your role changed', 'Your role is now ' || NEW.role || '.', '/app/family', NEW.user_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.write_audit(OLD.household_id, 'member', OLD.id, 'member_removed',
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role), NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS household_members_audit ON public.household_members;
CREATE TRIGGER household_members_audit
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.household_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_household_members();

-- ---------------------------------------------------------------------------
-- 5) Invitations (never log token_hash)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_household_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.household_id, 'invitation', NEW.id, 'invitation_created',
      NULL, jsonb_build_object('email', NEW.email, 'role', NEW.role, 'expires_at', NEW.expires_at));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(NEW.household_id, 'invitation', NEW.id, 'invitation_' || NEW.status,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'email', NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_invitations_audit ON public.household_invitations;
CREATE TRIGGER household_invitations_audit
  AFTER INSERT OR UPDATE OF status ON public.household_invitations
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_household_invitations();

-- ---------------------------------------------------------------------------
-- 6) Household settings
-- ---------------------------------------------------------------------------
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
    'default_category_id', OLD.default_category_id);
  v_new jsonb := jsonb_build_object(
    'timezone', NEW.timezone, 'week_starts_on', NEW.week_starts_on,
    'month_starts_on', NEW.month_starts_on, 'default_account_id', NEW.default_account_id,
    'default_category_id', NEW.default_category_id);
BEGIN
  IF v_old IS DISTINCT FROM v_new THEN
    PERFORM public.write_audit(NEW.household_id, 'household_settings', NEW.household_id,
      'settings_updated', v_old, v_new);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_settings_audit ON public.household_settings;
CREATE TRIGGER household_settings_audit
  AFTER UPDATE ON public.household_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_household_settings();

-- ---------------------------------------------------------------------------
-- 7) Accounts: create / currency / opening balance / (de)activation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.household_id, 'account', NEW.id, 'account_created', NULL,
      jsonb_build_object('name', NEW.name, 'currency', NEW.currency,
        'initial_balance', NEW.initial_balance));
  ELSIF (OLD.currency, OLD.initial_balance, OLD.is_active)
        IS DISTINCT FROM (NEW.currency, NEW.initial_balance, NEW.is_active) THEN
    PERFORM public.write_audit(NEW.household_id, 'account', NEW.id, 'account_updated',
      jsonb_build_object('currency', OLD.currency, 'initial_balance', OLD.initial_balance,
        'is_active', OLD.is_active),
      jsonb_build_object('currency', NEW.currency, 'initial_balance', NEW.initial_balance,
        'is_active', NEW.is_active));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_audit ON public.accounts;
CREATE TRIGGER accounts_audit
  AFTER INSERT OR UPDATE OF currency, initial_balance, is_active ON public.accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_accounts();

-- ---------------------------------------------------------------------------
-- 8) Transactions: deletion only (everyday edits would flood the log)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_transaction_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.write_audit(NEW.household_id, 'transaction', NEW.id, 'transaction_deleted',
      jsonb_build_object('type', NEW.type, 'amount', NEW.amount, 'currency', NEW.currency,
        'transaction_date', NEW.transaction_date, 'created_by', NEW.created_by),
      NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_audit_delete ON public.transactions;
CREATE TRIGGER transactions_audit_delete
  AFTER UPDATE OF deleted_at ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_transaction_delete();

-- ---------------------------------------------------------------------------
-- 9) Recurring payments confirmed / skipped → audit + notify the others
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_recurring_occurrence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.recurring_payments%ROWTYPE;
  v_who text;
  v_amount numeric;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('paid', 'skipped') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_payment FROM public.recurring_payments rp WHERE rp.id = NEW.recurring_payment_id;
  v_amount := coalesce(NEW.amount, v_payment.amount);

  PERFORM public.write_audit(NEW.household_id, 'recurring_occurrence', NEW.id,
    'recurring_' || NEW.status,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status, 'payment', v_payment.name,
      'scheduled_date', NEW.scheduled_date, 'amount', v_amount, 'currency', v_payment.currency));

  -- Schedule edits mark old slots skipped in bulk; don't notify for those.
  IF NEW.status = 'skipped' AND NEW.notes = 'Superseded by schedule change' THEN
    RETURN NEW;
  END IF;

  v_who := public.member_label(NEW.household_id, auth.uid());
  PERFORM public.notify_household(NEW.household_id, 'recurring_' || NEW.status,
    CASE WHEN NEW.status = 'paid' THEN 'Recurring payment confirmed' ELSE 'Recurring payment skipped' END,
    v_who || CASE WHEN NEW.status = 'paid' THEN ' confirmed ' ELSE ' skipped ' END
      || coalesce(v_payment.name, 'a payment') || ' (' || to_char(v_amount, 'FM999999999990.00')
      || ' ' || coalesce(v_payment.currency, '') || ', due ' || NEW.scheduled_date || ').',
    '/app/recurring');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_occurrences_audit ON public.recurring_payment_occurrences;
CREATE TRIGGER recurring_occurrences_audit
  AFTER UPDATE OF status ON public.recurring_payment_occurrences
  FOR EACH ROW
  EXECUTE PROCEDURE public.audit_recurring_occurrence();

COMMIT;


-- =====================================================================
-- 20261026150000_safe_to_spend_reserve.sql
-- =====================================================================
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


-- =====================================================================
-- 20261026160000_tasks_schedule.sql
-- =====================================================================
-- Shared to-dos and schedule ("who does what").
--
-- One table for both: a task without a time is a to-do, with a time it is a
-- schedule event. Repeats: none | daily (every N days) | weekly (ISO weekdays,
-- every N weeks) | monthly (day of month, every N months), optional end date.
-- Expansion into dates happens in the app (lib/calculations/task-schedule.ts).
--
-- Completion: one-offs use tasks.completed_at; repeating tasks record each
-- ticked-off occurrence date in task_completions.
-- Re-runnable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  -- NULL = for both partners ("together").
  assignee_member_id uuid REFERENCES public.household_members (id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'event')),
  start_date date,
  start_time time,
  end_time time,
  repeat_kind text NOT NULL DEFAULT 'none'
    CHECK (repeat_kind IN ('none', 'daily', 'weekly', 'monthly')),
  repeat_interval smallint NOT NULL DEFAULT 1 CHECK (repeat_interval BETWEEN 1 AND 52),
  repeat_weekdays smallint[],
  repeat_day_of_month smallint CHECK (repeat_day_of_month IS NULL OR repeat_day_of_month BETWEEN 1 AND 31),
  repeat_until date,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Nullable so deleting a user account keeps the shared task (insert policy
  -- still requires created_by = auth.uid()).
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT tasks_id_household_uidx UNIQUE (id, household_id),
  -- Repeating tasks need a start date to anchor the rhythm.
  CONSTRAINT tasks_repeat_needs_start CHECK (repeat_kind = 'none' OR start_date IS NOT NULL),
  CONSTRAINT tasks_weekly_needs_days CHECK (
    repeat_kind <> 'weekly'
    OR (repeat_weekdays IS NOT NULL AND cardinality(repeat_weekdays) BETWEEN 1 AND 7
        AND repeat_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])
  ),
  CONSTRAINT tasks_monthly_needs_day CHECK (repeat_kind <> 'monthly' OR repeat_day_of_month IS NOT NULL),
  CONSTRAINT tasks_until_after_start CHECK (repeat_until IS NULL OR start_date IS NULL OR repeat_until >= start_date),
  -- Events have a start time; times need a date; end after start.
  CONSTRAINT tasks_event_needs_time CHECK (kind <> 'event' OR (start_date IS NOT NULL AND start_time IS NOT NULL)),
  CONSTRAINT tasks_time_needs_date CHECK (start_time IS NULL OR start_date IS NOT NULL),
  CONSTRAINT tasks_end_after_start CHECK (end_time IS NULL OR (start_time IS NOT NULL AND end_time > start_time)),
  -- completed_at is only for one-offs.
  CONSTRAINT tasks_completed_only_one_off CHECK (completed_at IS NULL OR repeat_kind = 'none')
);

CREATE INDEX IF NOT EXISTS tasks_household_idx ON public.tasks (household_id, is_archived);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_member_id);

CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  household_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  completed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT task_completions_task_household_fkey
    FOREIGN KEY (task_id, household_id) REFERENCES public.tasks (id, household_id) ON DELETE CASCADE,
  CONSTRAINT task_completions_unique UNIQUE (task_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS task_completions_household_date_idx
  ON public.task_completions (household_id, occurrence_date);

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Integrity: assignee must be a member of the same household
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_task_assignee_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignee_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.id = NEW.assignee_member_id AND hm.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'assignee_member_id % is not a member of household %',
      NEW.assignee_member_id, NEW.household_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enforce_assignee_household ON public.tasks;
CREATE TRIGGER tasks_enforce_assignee_household
  BEFORE INSERT OR UPDATE OF assignee_member_id, household_id ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_task_assignee_household();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.task_completions TO authenticated;
REVOKE ALL ON public.tasks, public.task_completions FROM anon;

DROP POLICY IF EXISTS tasks_select_member ON public.tasks;
CREATE POLICY tasks_select_member ON public.tasks FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS tasks_insert_member ON public.tasks;
CREATE POLICY tasks_insert_member ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

-- Partners share chores: any writing member may edit or tick off any task.
DROP POLICY IF EXISTS tasks_update_member ON public.tasks;
CREATE POLICY tasks_update_member ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS tasks_delete_member ON public.tasks;
CREATE POLICY tasks_delete_member ON public.tasks FOR DELETE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (public.has_household_role(household_id, ARRAY['member']) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS task_completions_select_member ON public.task_completions;
CREATE POLICY task_completions_select_member ON public.task_completions FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS task_completions_insert_member ON public.task_completions;
CREATE POLICY task_completions_insert_member ON public.task_completions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND completed_by = auth.uid()
  );

DROP POLICY IF EXISTS task_completions_delete_member ON public.task_completions;
CREATE POLICY task_completions_delete_member ON public.task_completions FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

-- ---------------------------------------------------------------------------
-- Notify a partner when something is assigned to them by the other one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignee uuid;
BEGIN
  IF NEW.assignee_member_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.assignee_member_id IS NOT DISTINCT FROM OLD.assignee_member_id) THEN
    RETURN NEW;
  END IF;

  SELECT hm.user_id INTO v_assignee
  FROM public.household_members hm WHERE hm.id = NEW.assignee_member_id;

  IF v_assignee IS NOT NULL AND v_assignee IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify_household(
      NEW.household_id,
      'task_assigned',
      CASE WHEN NEW.kind = 'event' THEN 'Added to your schedule' ELSE 'New to-do for you' END,
      public.member_label(NEW.household_id, auth.uid()) || ' assigned you: ' || NEW.title
        || coalesce(' (' || to_char(NEW.start_date, 'YYYY-MM-DD') || ')', ''),
      CASE WHEN NEW.kind = 'event' THEN '/app/schedule' ELSE '/app/tasks' END,
      v_assignee
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_notify_assignment ON public.tasks;
CREATE TRIGGER tasks_notify_assignment
  AFTER INSERT OR UPDATE OF assignee_member_id ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_task_assignment();

COMMIT;


-- =====================================================================
-- 20261026170000_habits.sql
-- =====================================================================
-- Habit tracker for both partners.
--
-- A habit belongs to one member (owner_member_id) or to everyone in the
-- household (NULL — each partner tracks it separately). Goal: a simple check
-- or an amount per day (target + unit). Frequency: daily | days (ISO weekdays)
-- | per_week (N times a week, any days).
--
-- Check-ins are personal: you can only record your own, only for habits you
-- take part in, never in the future and at most 7 days back.
-- Streak milestones (7/30/100/365 days, daily habits) notify the partner.
-- Re-runnable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  emoji text CHECK (emoji IS NULL OR char_length(emoji) <= 8),
  -- NULL = for everyone (each member tracks their own check-ins).
  owner_member_id uuid REFERENCES public.household_members (id) ON DELETE CASCADE,
  goal_kind text NOT NULL DEFAULT 'check' CHECK (goal_kind IN ('check', 'count')),
  target numeric(10, 2) NOT NULL DEFAULT 1 CHECK (target > 0),
  unit text CHECK (unit IS NULL OR char_length(unit) <= 20),
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'days', 'per_week')),
  weekdays smallint[],
  times_per_week smallint CHECK (times_per_week IS NULL OR times_per_week BETWEEN 1 AND 7),
  start_date date NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT habits_id_household_uidx UNIQUE (id, household_id),
  CONSTRAINT habits_check_target_is_one CHECK (goal_kind <> 'check' OR target = 1),
  CONSTRAINT habits_days_need_weekdays CHECK (
    frequency <> 'days'
    OR (weekdays IS NOT NULL AND cardinality(weekdays) BETWEEN 1 AND 7
        AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])
  ),
  CONSTRAINT habits_per_week_needs_times CHECK (frequency <> 'per_week' OR times_per_week IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS habits_household_idx ON public.habits (household_id, is_archived);

CREATE TABLE IF NOT EXISTS public.habit_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL,
  household_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.household_members (id) ON DELETE CASCADE,
  checkin_date date NOT NULL,
  value numeric(10, 2) NOT NULL CHECK (value > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT habit_checkins_habit_household_fkey
    FOREIGN KEY (habit_id, household_id) REFERENCES public.habits (id, household_id) ON DELETE CASCADE,
  CONSTRAINT habit_checkins_unique UNIQUE (habit_id, member_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS habit_checkins_household_date_idx
  ON public.habit_checkins (household_id, checkin_date);

DROP TRIGGER IF EXISTS habits_set_updated_at ON public.habits;
CREATE TRIGGER habits_set_updated_at
  BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS habit_checkins_set_updated_at ON public.habit_checkins;
CREATE TRIGGER habit_checkins_set_updated_at
  BEFORE UPDATE ON public.habit_checkins FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_habit_owner_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.id = NEW.owner_member_id AND hm.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'owner_member_id % is not a member of household %', NEW.owner_member_id, NEW.household_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habits_enforce_owner_household ON public.habits;
CREATE TRIGGER habits_enforce_owner_household
  BEFORE INSERT OR UPDATE OF owner_member_id, household_id ON public.habits
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_habit_owner_household();

-- Check-ins: same household member, a participant of the habit, and for
-- direct client writes: only yourself, not in the future, ≤ 7 days back
-- (in the household's timezone).
CREATE OR REPLACE FUNCTION public.enforce_habit_checkin_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_member_user uuid;
  v_today date;
BEGIN
  SELECT h.owner_member_id INTO v_owner
  FROM public.habits h WHERE h.id = NEW.habit_id AND h.household_id = NEW.household_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habit not found in household';
  END IF;

  SELECT hm.user_id INTO v_member_user
  FROM public.household_members hm
  WHERE hm.id = NEW.member_id AND hm.household_id = NEW.household_id;
  IF v_member_user IS NULL THEN
    RAISE EXCEPTION 'member_id % is not a member of this household', NEW.member_id;
  END IF;

  IF v_owner IS NOT NULL AND v_owner <> NEW.member_id THEN
    RAISE EXCEPTION 'This habit belongs to another member';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF v_member_user <> auth.uid() THEN
      RAISE EXCEPTION 'You can only check in your own habits' USING ERRCODE = '42501';
    END IF;
    SELECT (timezone(coalesce(nullif(s.timezone, ''), 'UTC'), now()))::date INTO v_today
    FROM public.household_settings s WHERE s.household_id = NEW.household_id;
    v_today := coalesce(v_today, (timezone('utc', now()))::date);
    IF NEW.checkin_date > v_today OR NEW.checkin_date < v_today - 7 THEN
      RAISE EXCEPTION 'Check-ins are allowed for today and the last 7 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habit_checkins_enforce_rules ON public.habit_checkins;
CREATE TRIGGER habit_checkins_enforce_rules
  BEFORE INSERT OR UPDATE ON public.habit_checkins
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_habit_checkin_rules();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_checkins ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits, public.habit_checkins TO authenticated;
REVOKE ALL ON public.habits, public.habit_checkins FROM anon;

DROP POLICY IF EXISTS habits_select_member ON public.habits;
CREATE POLICY habits_select_member ON public.habits FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS habits_insert_member ON public.habits;
CREATE POLICY habits_insert_member ON public.habits FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS habits_update_member ON public.habits;
CREATE POLICY habits_update_member ON public.habits FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS habits_delete_member ON public.habits;
CREATE POLICY habits_delete_member ON public.habits FOR DELETE TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    OR (public.has_household_role(household_id, ARRAY['member']) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS habit_checkins_select_member ON public.habit_checkins;
CREATE POLICY habit_checkins_select_member ON public.habit_checkins FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS habit_checkins_write_own ON public.habit_checkins;
CREATE POLICY habit_checkins_write_own ON public.habit_checkins FOR ALL TO authenticated
  USING (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.id = member_id AND hm.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.id = member_id AND hm.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Streak milestone cheer for the partner (daily habits)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_habit_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_habit public.habits%ROWTYPE;
  v_streak integer := 0;
  v_day date := NEW.checkin_date;
BEGIN
  SELECT * INTO v_habit FROM public.habits h WHERE h.id = NEW.habit_id;
  IF v_habit.frequency <> 'daily' OR NEW.value < v_habit.target THEN
    RETURN NEW;
  END IF;
  -- Updating today's amount again (2.5 L after 2 L) must not cheer twice.
  IF TG_OP = 'UPDATE' AND OLD.value >= v_habit.target THEN
    RETURN NEW;
  END IF;
  -- Only count a streak that ends on the day just checked in.
  WHILE v_streak < 366 AND EXISTS (
    SELECT 1 FROM public.habit_checkins c
    WHERE c.habit_id = NEW.habit_id AND c.member_id = NEW.member_id
      AND c.checkin_date = v_day AND c.value >= v_habit.target
  ) LOOP
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  END LOOP;

  IF v_streak IN (7, 30, 100, 365) THEN
    PERFORM public.notify_household(
      NEW.household_id,
      'habit_streak',
      'Streak: ' || v_streak || ' days 🎉',
      public.member_label(NEW.household_id, auth.uid()) || ' kept "' || v_habit.title || '" for '
        || v_streak || ' days in a row. Send some love!',
      '/app/habits'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habit_checkins_notify_milestone ON public.habit_checkins;
CREATE TRIGGER habit_checkins_notify_milestone
  AFTER INSERT OR UPDATE OF value ON public.habit_checkins
  FOR EACH ROW EXECUTE PROCEDURE public.notify_habit_milestone();

COMMIT;


-- =====================================================================
-- 20261026180000_meal_plans.sql
-- =====================================================================
-- Meal plans: a household food catalogue (per-100 g values), a weekly plan
-- of meals by weekday and slot, per-person grams for each food, and
-- per-person daily nutrition targets. Everything is editable by writing
-- members; one active plan per household.
-- Re-runnable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  -- How the gram amount is meant: dry / raw / package / drained / edible / shelled.
  weigh_mode text CHECK (weigh_mode IS NULL OR weigh_mode IN ('dry', 'raw', 'package', 'drained', 'edible', 'shelled')),
  shopping_category text NOT NULL DEFAULT 'other'
    CHECK (shopping_category IN ('meat_fish', 'dairy', 'grains', 'vegetables', 'fruit', 'fats', 'other')),
  kcal numeric(7, 2) NOT NULL DEFAULT 0 CHECK (kcal BETWEEN 0 AND 950),
  protein numeric(6, 2) NOT NULL DEFAULT 0 CHECK (protein BETWEEN 0 AND 100),
  fat numeric(6, 2) NOT NULL DEFAULT 0 CHECK (fat BETWEEN 0 AND 100),
  carbs numeric(6, 2) NOT NULL DEFAULT 0 CHECK (carbs BETWEEN 0 AND 100),
  fiber numeric(6, 2) NOT NULL DEFAULT 0 CHECK (fiber BETWEEN 0 AND 100),
  grams_per_piece numeric(7, 2) CHECK (grams_per_piece IS NULL OR grams_per_piece > 0),
  piece_label text CHECK (piece_label IS NULL OR char_length(piece_label) <= 20),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT foods_id_household_uidx UNIQUE (id, household_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS foods_household_name_uidx
  ON public.foods (household_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 8000),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT meal_plans_id_household_uidx UNIQUE (id, household_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_one_active_uidx
  ON public.meal_plans (household_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.meal_plan_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  household_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  slot text NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  position smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT meal_plan_meals_id_household_uidx UNIQUE (id, household_id),
  CONSTRAINT meal_plan_meals_plan_household_fkey
    FOREIGN KEY (plan_id, household_id) REFERENCES public.meal_plans (id, household_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS meal_plan_meals_plan_idx ON public.meal_plan_meals (plan_id, weekday);

CREATE TABLE IF NOT EXISTS public.meal_plan_portions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL,
  household_id uuid NOT NULL,
  food_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.household_members (id) ON DELETE CASCADE,
  grams numeric(7, 1) NOT NULL CHECK (grams > 0 AND grams <= 5000),
  CONSTRAINT meal_plan_portions_meal_household_fkey
    FOREIGN KEY (meal_id, household_id) REFERENCES public.meal_plan_meals (id, household_id) ON DELETE CASCADE,
  -- A food used in a plan cannot be deleted from the catalogue.
  CONSTRAINT meal_plan_portions_food_household_fkey
    FOREIGN KEY (food_id, household_id) REFERENCES public.foods (id, household_id) ON DELETE RESTRICT,
  CONSTRAINT meal_plan_portions_unique UNIQUE (meal_id, food_id, member_id)
);

CREATE INDEX IF NOT EXISTS meal_plan_portions_meal_idx ON public.meal_plan_portions (meal_id);
CREATE INDEX IF NOT EXISTS meal_plan_portions_food_idx ON public.meal_plan_portions (food_id);

CREATE TABLE IF NOT EXISTS public.nutrition_targets (
  member_id uuid PRIMARY KEY REFERENCES public.household_members (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  kcal integer CHECK (kcal IS NULL OR kcal BETWEEN 500 AND 6000),
  protein_min integer CHECK (protein_min IS NULL OR protein_min BETWEEN 0 AND 500),
  protein_max integer CHECK (protein_max IS NULL OR protein_max BETWEEN 0 AND 500),
  fat_min integer CHECK (fat_min IS NULL OR fat_min BETWEEN 0 AND 400),
  fat_max integer CHECK (fat_max IS NULL OR fat_max BETWEEN 0 AND 400),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT nutrition_targets_protein_order CHECK (protein_min IS NULL OR protein_max IS NULL OR protein_min <= protein_max),
  CONSTRAINT nutrition_targets_fat_order CHECK (fat_min IS NULL OR fat_max IS NULL OR fat_min <= fat_max)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['foods', 'meal_plans', 'meal_plan_meals', 'nutrition_targets'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

-- Portions and targets must point at a member of the same household.
CREATE OR REPLACE FUNCTION public.enforce_member_household_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.id = NEW.member_id AND hm.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'member_id % is not a member of household %', NEW.member_id, NEW.household_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meal_plan_portions_enforce_member ON public.meal_plan_portions;
CREATE TRIGGER meal_plan_portions_enforce_member
  BEFORE INSERT OR UPDATE OF member_id, household_id ON public.meal_plan_portions
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_member_household_match();

DROP TRIGGER IF EXISTS nutrition_targets_enforce_member ON public.nutrition_targets;
CREATE TRIGGER nutrition_targets_enforce_member
  BEFORE INSERT OR UPDATE OF member_id, household_id ON public.nutrition_targets
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_member_household_match();

-- ---------------------------------------------------------------------------
-- RLS: household members read; writing members edit (shared plan).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['foods', 'meal_plans', 'meal_plan_meals', 'meal_plan_portions', 'nutrition_targets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_member', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_household_member(household_id))',
      t || '_select_member', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_member', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.has_household_role(household_id, ARRAY[''owner'', ''admin'', ''member'']))
         WITH CHECK (public.has_household_role(household_id, ARRAY[''owner'', ''admin'', ''member'']))',
      t || '_write_member', t);
  END LOOP;
END $$;

COMMIT;

-- Verification
SELECT check_name, ok FROM (
  SELECT 'column: public.tags.is_active', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tags' AND column_name = 'is_active')
  UNION ALL SELECT 'column: public.transactions.income_source_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'income_source_id')
  UNION ALL SELECT 'column: public.notifications.link', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'link')
  UNION ALL SELECT 'column: public.household_settings.safe_to_spend_reserves', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'household_settings' AND column_name = 'safe_to_spend_reserves')
  UNION ALL SELECT 'column: public.recurring_payments.is_mandatory', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'recurring_payments' AND column_name = 'is_mandatory')
  UNION ALL SELECT 'function: public.is_valid_reserve_map', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_valid_reserve_map')
  UNION ALL SELECT 'column: public.tasks.repeat_kind', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'repeat_kind')
  UNION ALL SELECT 'column: public.task_completions.occurrence_date', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_completions' AND column_name = 'occurrence_date')
  UNION ALL SELECT 'trigger: tasks_notify_assignment', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_notify_assignment' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: tasks_enforce_assignee_household', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_enforce_assignee_household' AND NOT tgisinternal)
  UNION ALL SELECT 'column: public.habits.frequency', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habits' AND column_name = 'frequency')
  UNION ALL SELECT 'column: public.habit_checkins.value', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_checkins' AND column_name = 'value')
  UNION ALL SELECT 'trigger: habit_checkins_enforce_rules', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'habit_checkins_enforce_rules' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: habit_checkins_notify_milestone', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'habit_checkins_notify_milestone' AND NOT tgisinternal)
  UNION ALL SELECT 'column: public.foods.kcal', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'kcal')
  UNION ALL SELECT 'column: public.meal_plan_portions.grams', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meal_plan_portions' AND column_name = 'grams')
  UNION ALL SELECT 'column: public.nutrition_targets.kcal', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'nutrition_targets' AND column_name = 'kcal')
  UNION ALL SELECT 'trigger: meal_plan_portions_enforce_member', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'meal_plan_portions_enforce_member' AND NOT tgisinternal)
  UNION ALL SELECT 'policy: meal_plan_portions_write_member', EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'meal_plan_portions_write_member')
  UNION ALL SELECT 'function: public.guard_household_member_update', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'guard_household_member_update')
  UNION ALL SELECT 'function: public.guard_goal_current_amount', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'guard_goal_current_amount')
  UNION ALL SELECT 'function: public.record_goal_initial_operation', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'record_goal_initial_operation')
  UNION ALL SELECT 'function: public.current_user_auth_email', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'current_user_auth_email')
  UNION ALL SELECT 'function: public.guard_profile_email', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'guard_profile_email')
  UNION ALL SELECT 'function: public.enforce_income_source_household_match', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'enforce_income_source_household_match')
  UNION ALL SELECT 'function: public.enforce_transaction_account_currency', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'enforce_transaction_account_currency')
  UNION ALL SELECT 'function: public.enforce_receipt_household_match', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'enforce_receipt_household_match')
  UNION ALL SELECT 'function: public.write_audit', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'write_audit')
  UNION ALL SELECT 'function: public.notify_household', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'notify_household')
  UNION ALL SELECT 'trigger: household_members_guard_update', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'household_members_guard_update' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: goals_guard_current_amount', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'goals_guard_current_amount' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: goals_record_initial_operation', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'goals_record_initial_operation' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: profiles_guard_email', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_guard_email' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: transactions_enforce_income_source_household', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_enforce_income_source_household' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: transactions_enforce_account_currency', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_enforce_account_currency' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: receipts_enforce_household', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'receipts_enforce_household' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: household_members_audit', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'household_members_audit' AND NOT tgisinternal)
  UNION ALL SELECT 'trigger: recurring_occurrences_audit', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'recurring_occurrences_audit' AND NOT tgisinternal)
  UNION ALL SELECT 'policy: household_members_update_self', EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'household_members_update_self')
  UNION ALL SELECT 'no_policy: goal_operations_insert_via_membership', NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goal_operations_insert_via_membership')
  UNION ALL SELECT 'no_policy: notifications_insert_member', NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_member')
  UNION ALL SELECT 'no_policy: audit_logs_insert_member', NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_insert_member')
) AS checks(check_name, ok)
ORDER BY ok, check_name;
