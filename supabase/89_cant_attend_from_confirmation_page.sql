-- ============================================================
-- Migration 89: "I can't attend" from the confirmation page
--
-- The confirmation page used to answer "Can't make it?" with a
-- pre-filled email to the organizer. That needs a mail app set up
-- on the phone (or does nothing on a computer with webmail), so
-- many people closed the page and their place stayed taken.
--
-- Now the page records the answer on the enrollment:
--   decline_reason = 'other_date'      -- keep me for a later date
--                  | 'not_interested'  -- no longer interested
--   declined_at    = when they told us
-- The enrollment board shows it on the card. Nothing else changes:
-- the status stays as it is and the organizer decides what to do,
-- so someone who only knows another person's email can't cancel
-- their place.
--
-- The mark clears itself when the organizer moves the card to
-- another status or sends a new invitation.
--
-- This is a new function, public_report_cant_attend(). The older
-- public_decline_enrollment() (migration 45) changed the status
-- itself, which is why migrations 53 and 64 closed it to the public;
-- it stays closed and unused.
--
-- Until this migration runs the page still offers the email.
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- If the RLS warning appears, choose "Run without RLS": this file
-- only adds two columns to a table that already has RLS.
-- ============================================================

ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS decline_reason TEXT,
    ADD COLUMN IF NOT EXISTS declined_at    TIMESTAMPTZ;

ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_decline_reason_check;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_decline_reason_check
    CHECK (decline_reason IS NULL OR decline_reason IN ('other_date', 'not_interested'));

-- ── The organizer acted on it: moved the card or invited again ──

CREATE OR REPLACE FUNCTION public.clear_enrollment_decline()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.invited_at IS DISTINCT FROM OLD.invited_at THEN
        NEW.decline_reason := NULL;
        NEW.declined_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- A trigger function: nobody needs to call it through the API (see migration 64)
REVOKE EXECUTE ON FUNCTION public.clear_enrollment_decline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_enrollment_decline ON public.enrollments;
CREATE TRIGGER trg_clear_enrollment_decline
    BEFORE UPDATE OF status, invited_at ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.clear_enrollment_decline();

-- ── Public RPC for the confirmation page ──
-- Marks the invitations and places on this course for the email (or
-- for the one person chosen when several people share the email).
-- Returns:
--   { success: true, first_name }                       recorded
--   { success: false, code: 'choose_person', people }   several people share the email
--   { success: false, code: 'not_found', message }      nothing to mark

CREATE OR REPLACE FUNCTION public.public_report_cant_attend(
    p_email TEXT,
    p_course_id UUID,
    p_reason TEXT,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_people     JSONB;
    v_first_name TEXT;
    v_count      INT := 0;
BEGIN
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid email address.');
    END IF;
    IF p_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;
    IF p_reason IS NULL OR p_reason NOT IN ('other_date', 'not_interested') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please choose one of the options.');
    END IF;

    -- People with this email who were invited to, or have a place on, this course
    v_people := (
        SELECT jsonb_agg(DISTINCT jsonb_build_object(
                   'student_id', s.id,
                   'first_name', s.first_name,
                   'last_name',  s.last_name))
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.course_id = p_course_id
          AND e.status IN ('invited', 'confirmed')
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    );

    IF v_people IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'not_found',
            'message', 'We could not find an invitation for this course with this email. Please check the address, or email the organizer.'
        );
    END IF;

    IF p_student_id IS NULL AND jsonb_array_length(v_people) > 1 THEN
        RETURN jsonb_build_object('success', false, 'code', 'choose_person', 'people', v_people);
    END IF;

    UPDATE enrollments e
    SET decline_reason = p_reason,
        declined_at    = now()
    FROM students s
    WHERE s.id = e.student_id
      AND e.course_id = p_course_id
      AND e.status IN ('invited', 'confirmed')
      AND lower(trim(s.email)) = lower(trim(p_email))
      AND (p_student_id IS NULL OR e.student_id = p_student_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;

    v_first_name := v_people -> 0 ->> 'first_name';
    RETURN jsonb_build_object('success', v_count > 0, 'first_name', v_first_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.public_report_cant_attend(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_report_cant_attend(TEXT, UUID, TEXT, UUID) TO anon, authenticated;
