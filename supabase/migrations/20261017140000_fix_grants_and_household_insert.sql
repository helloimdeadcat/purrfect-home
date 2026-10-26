-- Fix: ensure authenticated role can use public tables, and household INSERT policy exists.
-- Safe / non-destructive.

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

DROP POLICY IF EXISTS households_insert_authenticated ON public.households;

CREATE POLICY households_insert_authenticated
  ON public.households FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
