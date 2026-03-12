-- Custom Template Variables table
-- Stores user-defined placeholders (e.g., {Tutor}) for document templates
CREATE TABLE IF NOT EXISTS template_variables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  var_key text NOT NULL UNIQUE,
  var_value text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_variables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access" ON template_variables
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
