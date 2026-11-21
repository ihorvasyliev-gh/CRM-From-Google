-- ============================================================
-- Migration 95: Cheque requisitions redesign (status, notes,
--               cheque reference, indexes & realtime sync)
--
-- Extends public.cheque_requisitions (from migration 88) with:
--   * status        ('draft' | 'ready' | 'paid', default 'ready')
--   * cheque_number (optional cheque / EFT payment reference)
--   * notes         (optional internal CRM note, never printed on the form)
--   * indexes for filtering by invoice_date and status
--   * supabase_realtime publication so multi-admin updates sync live
--
-- Backward-compatible: until this migration runs, the UI gracefully
-- stores status, chequeNumber and notes inside the existing `meta`
-- JSONB column and works with zero degradation.
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.cheque_requisitions') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cheque_requisitions' AND column_name = 'status'
        ) THEN
            ALTER TABLE public.cheque_requisitions
                ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'
                CHECK (status IN ('draft', 'ready', 'paid'));
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cheque_requisitions' AND column_name = 'cheque_number'
        ) THEN
            ALTER TABLE public.cheque_requisitions
                ADD COLUMN cheque_number TEXT NOT NULL DEFAULT '';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cheque_requisitions' AND column_name = 'notes'
        ) THEN
            ALTER TABLE public.cheque_requisitions
                ADD COLUMN notes TEXT NOT NULL DEFAULT '';
        END IF;

        CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_status
            ON public.cheque_requisitions (status);
        CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_invoice_date
            ON public.cheque_requisitions (invoice_date DESC NULLS LAST);

        -- Backfill status/cheque_number/notes from meta JSONB if saved before migration ran
        UPDATE public.cheque_requisitions
        SET
            status = CASE
                WHEN meta ->> 'status' IN ('draft', 'ready', 'paid') THEN meta ->> 'status'
                ELSE status
            END,
            cheque_number = COALESCE(NULLIF(cheque_number, ''), NULLIF(meta ->> 'chequeNumber', ''), ''),
            notes = COALESCE(NULLIF(notes, ''), NULLIF(meta ->> 'notes', ''), '')
        WHERE meta ? 'status' OR meta ? 'chequeNumber' OR meta ? 'notes';
    END IF;
END $$;

-- Publish cheque_requisitions to supabase_realtime for live multi-admin sync
DO $$
BEGIN
    IF to_regclass('public.cheque_requisitions') IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cheque_requisitions;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- PostgREST picks up new columns right away
NOTIFY pgrst, 'reload schema';
