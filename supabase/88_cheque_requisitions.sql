-- ============================================================
-- Migration 88: Cheque requisitions (history and supplier memory)
--
-- Admin → Cheque Reqs reads a supplier invoice in the browser and
-- fills in the SICAP cheque requisition. Each requisition that is
-- downloaded is kept here, so that:
--   * it can be opened or downloaded again later;
--   * the next invoice from the same supplier starts with the
--     payee name, address, quote contact, SICAP action number and
--     description wording used last time;
--   * the page warns about an invoice that already has a
--     requisition, and when payments to one supplier in a year
--     reach €5,000 excl. VAT (three quotations needed).
--
-- The invoice file itself is never uploaded: only the values on
-- the requisition (form) and a few facts read from the invoice
-- (meta: invoice number and dates, amount excl. VAT, supplier VAT
-- number / IBAN / email domain, the item and date the description
-- was built from).
--
-- Admins only. Until this migration runs the page still works:
-- requisitions are made and downloaded, just not remembered.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cheque_requisitions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_name  TEXT NOT NULL DEFAULT '',
    invoice_number TEXT,
    invoice_date   DATE,
    -- Payment amount (what the cheque is for)
    amount         NUMERIC(12, 2),
    -- Excluding VAT, for the €5,000-a-year single quotation limit
    net_amount     NUMERIC(12, 2),
    -- Every value printed on the requisition
    form           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(form) = 'object'),
    -- What was read from the invoice besides the form
    meta           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
    created_by     UUID DEFAULT auth.uid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_created_at ON public.cheque_requisitions (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_cheque_requisition()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_cheque_requisition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_cheque_requisition ON public.cheque_requisitions;
CREATE TRIGGER trg_touch_cheque_requisition
    BEFORE UPDATE ON public.cheque_requisitions
    FOR EACH ROW EXECUTE FUNCTION public.touch_cheque_requisition();

ALTER TABLE public.cheque_requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage cheque requisitions" ON public.cheque_requisitions;
CREATE POLICY "Admins manage cheque requisitions" ON public.cheque_requisitions
    FOR ALL USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.cheque_requisitions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheque_requisitions TO authenticated;
