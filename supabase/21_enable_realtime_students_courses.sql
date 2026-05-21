-- Enable Realtime for the `students`, `courses`, and `student_flags` tables
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table courses;
alter publication supabase_realtime add table student_flags;
