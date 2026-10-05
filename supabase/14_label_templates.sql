-- Label Templates Table (stores uploaded .docx template metadata for address label stickers)
create table if not exists label_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  storage_path text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Safe to re-run: schema.sql already creates this table and its policy on a fresh install,
-- and an existing policy (possibly tightened by a later migration) is never replaced.
alter table label_templates enable row level security;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'label_templates' AND policyname = 'Authenticated access') THEN
        CREATE POLICY "Authenticated access" ON label_templates
            for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
    END IF;
END $$;
