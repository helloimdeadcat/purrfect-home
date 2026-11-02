-- Russian texts written by the database.
--
-- The UI speaks Russian (informal «ты»); this migration makes the texts the
-- database writes itself match it:
--   * notification titles/messages from triggers (membership, recurring
--     payments, task assignment, habit streaks) + the member_label fallback;
--   * the household bootstrap defaults ('Наша семья', 'Наличные');
--   * the global default category templates (seed.sql rows) that the
--     bootstrap copies into every new household.
-- Function bodies are copied from their latest definitions; only text
-- literals change. RAISE EXCEPTION texts stay English on purpose — services
-- map them by exact value. The 'Superseded by schedule change' note is
-- matched by services/recurring-service.ts and stays as is.
--
-- Existing rows: untouched default categories and notification titles are
-- translated in place (see section 4). Re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Notification helpers and triggers
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
    'Кто-то'
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.household_members hm
    ON hm.household_id = p_household_id AND hm.user_id = p_user_id
  LEFT JOIN public.profiles p ON p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.member_label(uuid, uuid) FROM PUBLIC;

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
      'Новый участник семьи', v_name || ' теперь с вами в семье 🏡', '/app/family'
    FROM public.household_members hm
    WHERE hm.household_id = NEW.household_id
      AND hm.user_id <> NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.write_audit(NEW.household_id, 'member', NEW.id, 'member_role_changed',
        jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role));
      PERFORM public.notify_household(NEW.household_id, 'member_role_changed',
        'Твоя роль изменилась',
        'Теперь твоя роль: ' || CASE NEW.role
          WHEN 'owner' THEN 'владелец'
          WHEN 'admin' THEN 'админ'
          WHEN 'member' THEN 'участник'
          WHEN 'viewer' THEN 'наблюдатель'
          ELSE NEW.role
        END || '.', '/app/family', NEW.user_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.write_audit(OLD.household_id, 'member', OLD.id, 'member_removed',
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role), NULL);
    RETURN OLD;
  END IF;
END;
$$;

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
    CASE WHEN NEW.status = 'paid' THEN 'Регулярный платёж оплачен' ELSE 'Регулярный платёж пропущен' END,
    v_who || CASE WHEN NEW.status = 'paid' THEN ': оплачено ' ELSE ': пропущено ' END
      || coalesce('«' || v_payment.name || '»', 'платёж') || ' (' || to_char(v_amount, 'FM999999999990.00')
      || ' ' || coalesce(v_payment.currency, '') || ', срок ' || NEW.scheduled_date || ').',
    '/app/recurring');
  RETURN NEW;
END;
$$;

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
      CASE WHEN NEW.kind = 'event' THEN 'Новое в твоём расписании' ELSE 'Новое дело для тебя' END,
      public.member_label(NEW.household_id, auth.uid()) || ' добавляет тебе: ' || NEW.title
        || coalesce(' (' || to_char(NEW.start_date, 'YYYY-MM-DD') || ')', ''),
      CASE WHEN NEW.kind = 'event' THEN '/app/schedule' ELSE '/app/tasks' END,
      v_assignee
    );
  END IF;
  RETURN NEW;
END;
$$;

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

  -- 7, 30, 100 and 365 all take the plural «дней».
  IF v_streak IN (7, 30, 100, 365) THEN
    PERFORM public.notify_household(
      NEW.household_id,
      'habit_streak',
      'Серия: ' || v_streak || ' дней подряд 🎉',
      public.member_label(NEW.household_id, auth.uid()) || ' держит «' || v_habit.title || '» уже '
        || v_streak || ' дней подряд. Поддержи!',
      '/app/habits'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Household bootstrap defaults (household name, cash account)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_first_household_for_user(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_household_name text,
  p_currency text
)
RETURNS TABLE (household_id uuid, member_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_member_id uuid;
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'EUR'));
  v_household_name text := coalesce(nullif(trim(p_household_name), ''), 'Наша семья');
  v_display_name text;
  v_existing public.household_members%ROWTYPE;
  cat record;
  id_map jsonb := '{}'::jsonb;
  new_cat_id uuid;
  parent_new_id uuid;
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    -- Allow service_role (auth.uid() null) OR the authenticated user themselves
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Not allowed to bootstrap another user';
    END IF;
  END IF;

  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    -- service_role connects as a role that bypasses RLS; still require explicit user id
    NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
  FROM public.household_members hm
  WHERE hm.user_id = p_user_id
  ORDER BY hm.joined_at ASC
  LIMIT 1;

  IF FOUND THEN
    household_id := v_existing.household_id;
    member_id := v_existing.id;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.profiles (id, email, first_name, last_name, currency)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, v_currency)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
        currency = EXCLUDED.currency,
        updated_at = timezone('utc', now());

  INSERT INTO public.households (name, base_currency)
  VALUES (v_household_name, v_currency)
  RETURNING id INTO v_household_id;

  v_display_name := nullif(trim(concat_ws(' ', p_first_name, p_last_name)), '');
  IF v_display_name IS NULL THEN
    v_display_name := p_email;
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role, display_name)
  VALUES (v_household_id, p_user_id, 'owner', v_display_name)
  RETURNING id INTO v_member_id;

  FOR cat IN
    SELECT c.*
    FROM public.categories c
    WHERE c.is_system = true AND c.household_id IS NULL
    ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.sort_order
  LOOP
    new_cat_id := gen_random_uuid();
    id_map := id_map || jsonb_build_object(cat.id::text, new_cat_id::text);
    parent_new_id := NULL;
    IF cat.parent_id IS NOT NULL THEN
      parent_new_id := (id_map ->> cat.parent_id::text)::uuid;
    END IF;

    INSERT INTO public.categories (
      id, household_id, name, icon, color, type, parent_id,
      is_system, sort_order, is_active
    ) VALUES (
      new_cat_id, v_household_id, cat.name, cat.icon, cat.color, cat.type,
      parent_new_id, false, cat.sort_order, cat.is_active
    );
  END LOOP;

  INSERT INTO public.household_settings (
    household_id, base_currency, timezone, week_starts_on, month_starts_on
  ) VALUES (
    v_household_id, v_currency, 'UTC', 1, 1
  );

  INSERT INTO public.accounts (
    household_id, owner_member_id, name, type, currency,
    initial_balance, is_shared, is_active, icon, color
  ) VALUES (
    v_household_id, v_member_id, 'Наличные', 'cash', v_currency,
    0, true, true, 'wallet', '#22C55E'
  );

  household_id := v_household_id;
  member_id := v_member_id;
  created := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_household_for_user(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_household_for_user(uuid, text, text, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Default categories. The bootstrap copies the global templates
--    (household_id IS NULL, is_system = true, from seed.sql), so translating
--    the templates translates every new household. Household copies are
--    renamed only while they still look untouched (exact English name, same
--    type and icon as the template) and the Russian name is still free.
-- ---------------------------------------------------------------------------
WITH russian_default_categories (name_en, name_ru, type, icon) AS (
  VALUES
  ('Housing', 'Жильё', 'expense', 'home'),
  ('Food', 'Еда', 'expense', 'utensils'),
  ('Transport', 'Транспорт', 'expense', 'car'),
  ('Health', 'Здоровье', 'expense', 'heart-pulse'),
  ('Shopping', 'Покупки', 'expense', 'shopping-bag'),
  ('Entertainment', 'Развлечения', 'expense', 'clapperboard'),
  ('Subscriptions', 'Подписки', 'expense', 'repeat'),
  ('Utilities', 'Коммуналка', 'expense', 'zap'),
  ('Insurance', 'Страховка', 'expense', 'shield'),
  ('Other Expense', 'Прочие расходы', 'expense', 'circle-ellipsis'),
  ('Groceries', 'Продукты', 'expense', 'shopping-cart'),
  ('Restaurants', 'Кафе и рестораны', 'expense', 'utensils-crossed'),
  ('Salary', 'Зарплата', 'income', 'briefcase'),
  ('Freelance', 'Фриланс', 'income', 'laptop'),
  ('Other Income', 'Прочие доходы', 'income', 'plus-circle')
),
candidates AS (
  SELECT DISTINCT ON (c.household_id, m.name_ru) c.id, m.name_ru
  FROM public.categories c
  JOIN russian_default_categories m
    ON c.name = m.name_en AND c.type = m.type AND c.icon = m.icon
  WHERE (
      (c.household_id IS NULL AND c.is_system = true)
      OR (c.household_id IS NOT NULL AND c.is_system = false)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.categories d
      WHERE d.household_id IS NOT DISTINCT FROM c.household_id
        AND lower(d.name) = lower(m.name_ru)
    )
  ORDER BY c.household_id, m.name_ru, c.created_at, c.id
)
UPDATE public.categories c
SET name = candidates.name_ru
FROM candidates
WHERE c.id = candidates.id;

-- ---------------------------------------------------------------------------
-- 4) Existing notifications. Fixed titles are mapped exactly; streak titles
--    and the two membership messages are rebuilt by pattern. Messages that
--    embed payment/task/habit names (recurring_*, task_assigned,
--    habit_streak) stay as they were written.
-- ---------------------------------------------------------------------------
UPDATE public.notifications n
SET title = CASE
    WHEN n.title = 'New family member' THEN 'Новый участник семьи'
    WHEN n.title = 'Your role changed' THEN 'Твоя роль изменилась'
    WHEN n.title = 'Recurring payment confirmed' THEN 'Регулярный платёж оплачен'
    WHEN n.title = 'Recurring payment skipped' THEN 'Регулярный платёж пропущен'
    WHEN n.title = 'Added to your schedule' THEN 'Новое в твоём расписании'
    WHEN n.title = 'New to-do for you' THEN 'Новое дело для тебя'
    WHEN n.title ~ '^Streak: [0-9]+ days 🎉$'
      THEN regexp_replace(n.title, '^Streak: ([0-9]+) days 🎉$', 'Серия: \1 дней подряд 🎉')
    ELSE n.title
  END,
  message = CASE
    WHEN n.type = 'member_joined' AND n.message ~ ' joined the household\.$'
      THEN regexp_replace(n.message, ' joined the household\.$', ' теперь с вами в семье 🏡')
    WHEN n.type = 'member_role_changed' AND n.message ~ '^Your role is now [a-z]+\.$'
      THEN 'Теперь твоя роль: ' || CASE substring(n.message FROM '^Your role is now ([a-z]+)\.$')
          WHEN 'owner' THEN 'владелец'
          WHEN 'admin' THEN 'админ'
          WHEN 'member' THEN 'участник'
          WHEN 'viewer' THEN 'наблюдатель'
          ELSE substring(n.message FROM '^Your role is now ([a-z]+)\.$')
        END || '.'
    ELSE n.message
  END
WHERE n.title IN (
    'New family member', 'Your role changed', 'Recurring payment confirmed',
    'Recurring payment skipped', 'Added to your schedule', 'New to-do for you'
  )
  OR n.title ~ '^Streak: [0-9]+ days 🎉$';

COMMIT;
