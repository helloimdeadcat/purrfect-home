-- Household invitations with hashed tokens and atomic accept RPC.

BEGIN;

CREATE TABLE IF NOT EXISTS public.household_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('member')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL)
    OR (status <> 'accepted' AND accepted_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS household_invitations_household_id_idx
  ON public.household_invitations (household_id);
CREATE INDEX IF NOT EXISTS household_invitations_email_idx
  ON public.household_invitations (lower(email));
CREATE INDEX IF NOT EXISTS household_invitations_status_idx
  ON public.household_invitations (status);
CREATE UNIQUE INDEX IF NOT EXISTS household_invitations_pending_email_household_uidx
  ON public.household_invitations (household_id, lower(email))
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS household_invitations_set_updated_at ON public.household_invitations;
CREATE TRIGGER household_invitations_set_updated_at
  BEFORE UPDATE ON public.household_invitations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_invitations TO authenticated;
REVOKE ALL ON public.household_invitations FROM anon;

-- Members can see invitations for their household (status, email, expiry — no token)
CREATE POLICY household_invitations_select_member
  ON public.household_invitations FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_invitations_insert_admin
  ON public.household_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_household_role(household_id, ARRAY['owner', 'admin'])
    AND invited_by = auth.uid()
    AND role = 'member'
  );

CREATE POLICY household_invitations_update_admin
  ON public.household_invitations FOR UPDATE TO authenticated
  USING (public.has_household_role(household_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_household_role(household_id, ARRAY['owner', 'admin']));

-- No DELETE policy for clients — revoke via status update

CREATE OR REPLACE FUNCTION public.accept_household_invitation(p_token text)
RETURNS TABLE (
  household_id uuid,
  member_id uuid,
  already_member boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_hash text;
  v_inv public.household_invitations%ROWTYPE;
  v_member_id uuid;
  v_existing_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 20 THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  -- pgcrypto on Supabase lives in extensions schema
  v_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex');

  SELECT * INTO v_inv
  FROM public.household_invitations hi
  WHERE hi.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  IF v_inv.status = 'accepted' THEN
    SELECT hm.id INTO v_existing_id
    FROM public.household_members hm
    WHERE hm.household_id = v_inv.household_id
      AND hm.user_id = v_user_id;

    IF v_existing_id IS NOT NULL THEN
      household_id := v_inv.household_id;
      member_id := v_existing_id;
      already_member := true;
      RETURN NEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Invitation already used' USING ERRCODE = '22023';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid' USING ERRCODE = '22023';
  END IF;

  IF v_inv.expires_at <= timezone('utc', now()) THEN
    UPDATE public.household_invitations
    SET status = 'expired', updated_at = timezone('utc', now())
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation expired' USING ERRCODE = '22023';
  END IF;

  IF lower(trim(v_inv.email)) IS DISTINCT FROM lower(trim(v_email)) THEN
    -- Generic message: do not reveal whether the invite exists for another email
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  IF v_inv.role <> 'member' THEN
    RAISE EXCEPTION 'Invalid invitation role' USING ERRCODE = '22023';
  END IF;

  SELECT hm.id INTO v_existing_id
  FROM public.household_members hm
  WHERE hm.household_id = v_inv.household_id
    AND hm.user_id = v_user_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.household_invitations
    SET status = 'accepted',
        accepted_at = timezone('utc', now()),
        accepted_by = v_user_id,
        updated_at = timezone('utc', now())
    WHERE id = v_inv.id
      AND status = 'pending';

    household_id := v_inv.household_id;
    member_id := v_existing_id;
    already_member := true;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.household_members (
    household_id, user_id, role, display_name
  )
  VALUES (
    v_inv.household_id,
    v_user_id,
    'member',
    split_part(v_email, '@', 1)
  )
  RETURNING id INTO v_member_id;

  UPDATE public.household_invitations
  SET status = 'accepted',
      accepted_at = timezone('utc', now()),
      accepted_by = v_user_id,
      updated_at = timezone('utc', now())
  WHERE id = v_inv.id
    AND status = 'pending';

  IF NOT FOUND THEN
    -- Concurrent accept won the race
    RAISE EXCEPTION 'Invitation already used' USING ERRCODE = '22023';
  END IF;

  -- Ensure profile exists for email visibility among household members
  INSERT INTO public.profiles (id, email)
  VALUES (v_user_id, v_email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = timezone('utc', now());

  household_id := v_inv.household_id;
  member_id := v_member_id;
  already_member := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_household_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(text) TO authenticated;

-- Preview helper for authenticated invitees (no token hash leakage)
CREATE OR REPLACE FUNCTION public.preview_household_invitation(p_token text)
RETURNS TABLE (
  is_valid boolean,
  household_name text,
  invited_email text,
  expires_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_inv public.household_invitations%ROWTYPE;
  v_name text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 20 THEN
    is_valid := false;
    household_name := NULL;
    invited_email := NULL;
    expires_at := NULL;
    status := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex');

  SELECT * INTO v_inv
  FROM public.household_invitations hi
  WHERE hi.token_hash = v_hash;

  IF NOT FOUND THEN
    is_valid := false;
    household_name := NULL;
    invited_email := NULL;
    expires_at := NULL;
    status := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT h.name INTO v_name
  FROM public.households h
  WHERE h.id = v_inv.household_id;

  IF v_inv.status = 'pending' AND v_inv.expires_at <= timezone('utc', now()) THEN
    is_valid := false;
    household_name := v_name;
    invited_email := lower(v_inv.email);
    expires_at := v_inv.expires_at;
    status := 'expired';
    RETURN NEXT;
    RETURN;
  END IF;

  is_valid := (v_inv.status = 'pending');
  household_name := v_name;
  invited_email := lower(v_inv.email);
  expires_at := v_inv.expires_at;
  status := v_inv.status;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_household_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_household_invitation(text) TO anon, authenticated;

COMMIT;
