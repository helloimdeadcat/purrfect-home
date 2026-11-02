-- Shared household shopping checklist (manual items + optional meal imports).
-- Re-runnable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  note text CHECK (note IS NULL OR char_length(note) <= 240),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'meal_plan')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS shopping_items_household_open_idx
  ON public.shopping_items (household_id, is_done, sort_order, created_at);

DROP TRIGGER IF EXISTS shopping_items_set_updated_at ON public.shopping_items;
CREATE TRIGGER shopping_items_set_updated_at
  BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopping_items_select_member ON public.shopping_items;
CREATE POLICY shopping_items_select_member ON public.shopping_items
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS shopping_items_insert_member ON public.shopping_items;
CREATE POLICY shopping_items_insert_member ON public.shopping_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin', 'member'])
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS shopping_items_update_member ON public.shopping_items;
CREATE POLICY shopping_items_update_member ON public.shopping_items
  FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS shopping_items_delete_member ON public.shopping_items;
CREATE POLICY shopping_items_delete_member ON public.shopping_items
  FOR DELETE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin', 'member']));

COMMIT;
