-- AI usage quota shared by every server instance (the in-memory limiter
-- was per Vercel instance, so it did not really protect the free Gemini
-- quota). One row per AI request; take_ai_quota() checks the per-user
-- window and daily limits, records the hit and prunes rows older than two
-- days, so the table never grows past a few hundred rows.
-- Re-runnable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('assistant', 'receipt_scan')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

-- No policies: only take_ai_quota() (SECURITY DEFINER) touches the table.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.take_ai_quota(
  p_kind text,
  p_window_seconds integer,
  p_window_limit integer,
  p_daily_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_in_window integer;
  v_today integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('assistant', 'receipt_scan') THEN
    RAISE EXCEPTION 'Unknown AI usage kind' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent requests of the same user so two tabs cannot both
  -- squeeze past the limit.
  PERFORM pg_advisory_xact_lock(hashtext('ai_usage:' || v_user::text));

  DELETE FROM public.ai_usage
  WHERE user_id = v_user AND created_at < now() - interval '2 days';

  SELECT
    count(*) FILTER (WHERE created_at > now() - make_interval(secs => p_window_seconds)),
    count(*) FILTER (WHERE created_at > now() - interval '1 day')
  INTO v_in_window, v_today
  FROM public.ai_usage
  WHERE user_id = v_user;

  IF v_in_window >= p_window_limit OR v_today >= p_daily_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_usage (user_id, kind) VALUES (v_user, p_kind);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.take_ai_quota(text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_ai_quota(text, integer, integer, integer) TO authenticated;

COMMIT;
