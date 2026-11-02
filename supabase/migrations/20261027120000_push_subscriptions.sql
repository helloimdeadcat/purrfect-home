-- Web Push notifications on the phone.
--
--   * push_subscriptions: one row per browser/device push endpoint. A user
--     sees, adds and removes only their own rows; at most 5 devices per user
--     (the least recently used ones are dropped by a trigger).
--   * notifications.pushed_at: set once a notification was handed to the
--     push dispatcher. Existing rows are back-filled so old notifications are
--     never pushed. claim_notification_pushes() (service role only) marks a
--     batch pushed atomically and returns it, so two concurrent dispatchers
--     can never send the same notification twice.
-- Re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE
    CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 1024),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 256),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 128),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Keep at most 5 devices per user: drop the least recently used extras.
CREATE OR REPLACE FUNCTION public.cap_push_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.push_subscriptions ps
  WHERE ps.user_id = NEW.user_id
    AND ps.id IN (
      SELECT s.id
      FROM public.push_subscriptions s
      WHERE s.user_id = NEW.user_id
      ORDER BY greatest(s.created_at, coalesce(s.last_used_at, s.created_at)) DESC, s.id DESC
      OFFSET 5
    );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cap_push_subscriptions() FROM PUBLIC;

DROP TRIGGER IF EXISTS push_subscriptions_cap ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_cap
  AFTER INSERT OR UPDATE OF user_id ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.cap_push_subscriptions();

-- Save (or move) the caller's subscription. A browser endpoint belongs to
-- whoever subscribed last on that device, so an endpoint previously stored
-- for another account on a shared phone is re-assigned instead of failing
-- on the UNIQUE constraint (which RLS would hide from the caller).
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        created_at = now(),
        last_used_at = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) notifications.pushed_at
-- ---------------------------------------------------------------------------
-- Back-fill only when the column is created, so that re-running the
-- migration never swallows pushes that are legitimately pending.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'pushed_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN pushed_at timestamptz;
    -- Old notifications are never pushed.
    UPDATE public.notifications SET pushed_at = created_at;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS notifications_unpushed_idx
  ON public.notifications (household_id, created_at)
  WHERE pushed_at IS NULL;

-- Clients may still flip only is_read (pushed_at is dispatcher-owned).
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
    OR NEW.pushed_at IS DISTINCT FROM OLD.pushed_at
  ) THEN
    RAISE EXCEPTION 'Only is_read can be changed on a notification'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Claim a batch of fresh, not-yet-pushed notifications of one household.
-- Rows older than p_max_age are marked pushed without being returned (too
-- stale to buzz a phone about). FOR UPDATE SKIP LOCKED + UPDATE … RETURNING
-- makes concurrent dispatchers split the work instead of double-sending.
CREATE OR REPLACE FUNCTION public.claim_notification_pushes(
  p_household_id uuid,
  p_limit integer DEFAULT 20,
  p_max_age interval DEFAULT interval '1 hour'
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  title text,
  message text,
  link text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.notifications n
  SET pushed_at = now()
  WHERE n.household_id = p_household_id
    AND n.pushed_at IS NULL
    AND n.created_at < now() - p_max_age;

  RETURN QUERY
  WITH picked AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.household_id = p_household_id
      AND n.pushed_at IS NULL
    ORDER BY n.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notifications n
  SET pushed_at = now()
  FROM picked
  WHERE n.id = picked.id
  RETURNING n.id, n.user_id, n.type, n.title, n.message, n.link, n.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_pushes(uuid, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_pushes(uuid, integer, interval) TO service_role;

COMMIT;
