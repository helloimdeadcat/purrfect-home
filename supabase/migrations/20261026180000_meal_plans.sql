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
