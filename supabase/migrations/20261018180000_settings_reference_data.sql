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
