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
