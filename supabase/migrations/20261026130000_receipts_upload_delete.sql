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
