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
