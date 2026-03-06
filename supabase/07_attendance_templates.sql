-- Attendance Templates Table (stores uploaded .docx template metadata for the attendance sheet)
create table attendance_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  storage_path text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table attendance_templates enable row level security;
create policy "Authenticated access" on attendance_templates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
