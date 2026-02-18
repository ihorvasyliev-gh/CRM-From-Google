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
  created_at timestamptz default now(),
  unique(student_id, course_id) -- Prevent duplicate enrollments for the same course
);

-- Indexes for performance
create index idx_students_email on students(email);
create index idx_students_phone on students(phone); -- normalized phone
create index idx_courses_name on courses(name);

-- RLS Policies (Open for now as requested, but good practice to enable)
alter table students enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;

-- Allow all access for now (since "no login/password" phase)
create policy "Allow all access" on students for all using (true) with check (true);
create policy "Allow all access" on courses for all using (true) with check (true);
create policy "Allow all access" on enrollments for all using (true) with check (true);
