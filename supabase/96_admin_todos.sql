-- ============================================================
-- Migration 96: Shared Admin To-Do & Team Notes
--
-- Adds a shared workspace tab visible only to CRM admins
-- (public.is_app_admin()) for coordinating daily tasks, room &
-- trainer bookings, course preparation, student follow-ups and
-- pinned operational notes.
--
-- Creates:
--   * public.admin_todos          — tasks & notes with status,
--       category, priority, pin, due date, optional CRM links
--       (course + session date, student), sub-checklist JSONB,
--       assignee and completion audit fields.
--   * public.admin_todo_comments  — short handoff comments per
--       To-Do item.
--   * public.list_admin_profiles() — admin-only RPC returning
--       admin user ids, emails and staff full_name so avatars
--       and assignees show real names instead of raw emails.
--   * supabase_realtime publication entries for live multi-admin
--       updates without manual refresh.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Main table: admin_todos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_todos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 300),
    description  TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
    category     TEXT NOT NULL DEFAULT 'general'
                     CHECK (category IN ('general', 'booking', 'course', 'student', 'finance', 'note')),
    status       TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_progress', 'done')),
    priority     TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('normal', 'high', 'urgent')),
    is_pinned    BOOLEAN NOT NULL DEFAULT false,
    due_date     DATE,
    course_id    UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    course_date  DATE,
    student_id   UUID REFERENCES public.students(id) ON DELETE SET NULL,
    checklist    JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
    assignee_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by   UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_todos_active_order
    ON public.admin_todos (status, is_pinned DESC, due_date ASC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_todos_assignee
    ON public.admin_todos (assignee_id)
    WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_todos_course
    ON public.admin_todos (course_id)
    WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_todos_student
    ON public.admin_todos (student_id)
    WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_admin_todo()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_admin_todo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_admin_todo ON public.admin_todos;
CREATE TRIGGER trg_touch_admin_todo
    BEFORE UPDATE ON public.admin_todos
    FOR EACH ROW EXECUTE FUNCTION public.touch_admin_todo();

ALTER TABLE public.admin_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage admin todos" ON public.admin_todos;
CREATE POLICY "Admins manage admin todos" ON public.admin_todos
    FOR ALL USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.admin_todos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_todos TO authenticated;

-- ------------------------------------------------------------
-- 2. Comments table: admin_todo_comments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_todo_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    todo_id    UUID NOT NULL REFERENCES public.admin_todos(id) ON DELETE CASCADE,
    body       TEXT NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_todo_comments_todo_created
    ON public.admin_todo_comments (todo_id, created_at ASC);

ALTER TABLE public.admin_todo_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage admin todo comments" ON public.admin_todo_comments;
CREATE POLICY "Admins manage admin todo comments" ON public.admin_todo_comments
    FOR ALL USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.admin_todo_comments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_todo_comments TO authenticated;

-- ------------------------------------------------------------
-- 3. Admin profiles RPC (id, email, full_name from user_metadata)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS TABLE (
    id        UUID,
    email     TEXT,
    full_name TEXT
) AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can list admin profiles' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), '')::TEXT AS full_name
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND COALESCE(NULLIF(u.raw_app_meta_data ->> 'role', ''), 'admin') = 'admin'
    ORDER BY COALESCE(NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), ''), u.email) ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.list_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

-- ------------------------------------------------------------
-- 4. Publish tables to supabase_realtime for live multi-admin sync
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_todos;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_todo_comments;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- PostgREST picks up new tables and RPCs right away
NOTIFY pgrst, 'reload schema';
