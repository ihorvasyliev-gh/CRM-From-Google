-- Attendance Templates Table (stores uploaded .docx template metadata for the attendance sheet)
create table if not exists attendance_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  storage_path text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Safe to re-run: schema.sql already creates this table and its policy on a fresh install,
-- and an existing policy (possibly tightened by a later migration) is never replaced.
alter table attendance_templates enable row level security;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance_templates' AND policyname = 'Authenticated access') THEN
        CREATE POLICY "Authenticated access" ON attendance_templates
            for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
    END IF;
END $$;
