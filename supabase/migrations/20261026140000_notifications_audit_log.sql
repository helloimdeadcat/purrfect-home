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
