-- Retention cleanup — keeps the Supabase Free tier (500 MB DB, 1 GB Storage)
-- from filling up with data nobody looks at any more. Called once a day by
-- the server cron through services/maintenance-service.ts (service role).
--
--   * cleanup_expired_data()            — row retention, returns counts;
--   * list_purgeable_receipt_files(n)   — receipt files the cron must remove
--     through the Storage API first (SQL cannot delete Storage objects
--     properly), after which the cron deletes the receipt rows itself;
--   * household_receipt_usage(id)       — cheap size/count for the upload
--     budget guard and the «Использование» card (RLS applies).
--
-- Real financial data is never touched: only transactions that were
-- soft-deleted long ago (and have no receipts or recurring links left) are
-- purged; accounts, goals, budgets and live transactions are not read here.
-- Re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Row retention
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notifications_read integer;
  v_notifications_old integer;
  v_audit integer;
  v_invitations integer;
  v_transactions integer;
BEGIN
  -- Read notifications are history after two months; anything older than
  -- half a year (read or not) is stale.
  DELETE FROM public.notifications
  WHERE is_read AND created_at < now() - interval '60 days';
  GET DIAGNOSTICS v_notifications_read = ROW_COUNT;

  DELETE FROM public.notifications
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_notifications_old = ROW_COUNT;

  -- The activity log is only shown to owners/admins as recent history;
  -- nothing references audit rows.
  DELETE FROM public.audit_logs
  WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- Finished invitations (revoked/expired, or pending past expiry) can't be
  -- used any more. Accepted ones stay as a record of who joined.
  DELETE FROM public.household_invitations
  WHERE (status IN ('revoked', 'expired') AND updated_at < now() - interval '30 days')
     OR (status = 'pending' AND expires_at < now() - interval '30 days');
  GET DIAGNOSTICS v_invitations = ROW_COUNT;

  -- Transactions soft-deleted more than 90 days ago. Rows that still have
  -- receipts wait until the cron has removed the files (a cascade would
  -- orphan them in Storage); rows still linked from a recurring occurrence
  -- are kept so payment history stays intact. The deletion itself remains
  -- in audit_logs (transaction_deleted) for a year.
  DELETE FROM public.transactions t
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.transaction_id = t.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.recurring_payment_occurrences o WHERE o.transaction_id = t.id
    );
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  RETURN jsonb_build_object(
    'notifications_read', v_notifications_read,
    'notifications_old', v_notifications_old,
    'audit_logs', v_audit,
    'invitations', v_invitations,
    'deleted_transactions', v_transactions
  );
END;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default privileges, so revoke from them explicitly, not just PUBLIC.
REVOKE ALL ON FUNCTION public.cleanup_expired_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_data() TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Receipt files to remove via the Storage API
-- ---------------------------------------------------------------------------
-- Returns (receipt_id, storage_path):
--   * receipts of transactions soft-deleted more than 30 days ago
--     (receipt_id set — the cron deletes the row after the file);
--   * objects in the receipts bucket without a receipts row, older than a
--     day (receipt_id NULL) — left behind by a failed upload cleanup or a
--     hard-deleted transaction/household.
-- plpgsql (late-bound) on purpose: storage.objects belongs to Supabase.
CREATE OR REPLACE FUNCTION public.list_purgeable_receipt_files(p_limit integer DEFAULT 100)
RETURNS TABLE (receipt_id uuid, storage_path text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
BEGIN
  RETURN QUERY
  SELECT r.id, r.storage_path
  FROM public.receipts r
  JOIN public.transactions t ON t.id = r.transaction_id
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < now() - interval '30 days'
  ORDER BY t.deleted_at
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT NULL::uuid, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'receipts'
    AND o.created_at < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.storage_path = o.name)
  ORDER BY o.created_at
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_purgeable_receipt_files(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_purgeable_receipt_files(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Household receipt usage (invoker rights: RLS limits it to members)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_receipt_usage(p_household_id uuid)
RETURNS TABLE (files bigint, bytes bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint, coalesce(sum(r.file_size), 0)::bigint
  FROM public.receipts r
  WHERE r.household_id = p_household_id;
$$;

REVOKE ALL ON FUNCTION public.household_receipt_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_receipt_usage(uuid) TO authenticated, service_role;

COMMIT;
