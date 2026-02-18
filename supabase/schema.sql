-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Students Table
create table students (
  id uuid primary key default uuid_generate_v4(),
  first_name text,
  last_name text,
  email text unique,
  phone text,
  address text,
  eircode text,
  dob date,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Courses Table (Dynamic)
create table courses (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Enrollments Table
create table enrollments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  status text default 'requested', -- requested, invited, confirmed, rejected
  course_variant text, -- e.g., "Ukrainian", "English"
  notes text, -- admin notes
  confirmed_date date, -- date when the place was confirmed
  created_at timestamptz default now(),
  unique(student_id, course_id, course_variant) -- Allow same student in same course with different variants
);

-- Indexes for performance
create index idx_students_email on students(email);
create index idx_students_phone on students(phone); -- normalized phone
create index idx_courses_name on courses(name);

-- RLS Policies (Only authenticated users can access data)
alter table students enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;

-- Authenticated users only (service role key used by Google Apps Script bypasses RLS)
create policy "Authenticated access" on students for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated access" on courses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated access" on enrollments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- MIGRATION (run these if tables already exist):
-- ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS notes text;
-- ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS confirmed_date date;
-- ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_course_id_key;
-- ALTER TABLE enrollments ADD CONSTRAINT enrollments_student_id_course_id_course_variant_key UNIQUE (student_id, course_id, course_variant);
-- ============================================================
