-- ============================================================
-- Migration 74: Date custom variables
--
-- A custom variable can now be a date worked out for each
-- participant when documents are generated, e.g. {expire} =
-- course date + 2 years. The rule is stored as
--   { "base":   "courseDate" | "completedAt" | "today",
--     "amount": 2,
--     "unit":   "days" | "months" | "years",
--     "format": "long" | "dmy" }
-- Text variables keep using var_value.
-- ============================================================
ALTER TABLE public.template_variables
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS date_rule JSONB;

ALTER TABLE public.template_variables DROP CONSTRAINT IF EXISTS template_variables_kind_check;
ALTER TABLE public.template_variables ADD CONSTRAINT template_variables_kind_check CHECK (
    kind = 'text'
    -- COALESCE: a missing rule makes the checks NULL, which CHECK would let through
    OR COALESCE(
        kind = 'date'
        AND jsonb_typeof(date_rule) = 'object'
        AND date_rule ->> 'base' IN ('courseDate', 'completedAt', 'today')
        AND date_rule ->> 'unit' IN ('days', 'months', 'years')
        AND jsonb_typeof(date_rule -> 'amount') = 'number',
        false
    )
);
