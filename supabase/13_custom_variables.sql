-- Custom Template Variables table
-- Stores user-defined placeholders (e.g., {Tutor}) for document templates
CREATE TABLE IF NOT EXISTS template_variables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  var_key text NOT NULL UNIQUE,
  var_value text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Safe to re-run: schema.sql already creates this table and its policy on a fresh install,
-- and an existing policy (possibly tightened by a later migration) is never replaced.
ALTER TABLE template_variables ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'template_variables' AND policyname = 'Authenticated access') THEN
        CREATE POLICY "Authenticated access" ON template_variables
            FOR ALL USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;
