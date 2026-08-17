-- Migration 40: Clean up bogus "Email address" / contact info courses and their enrollments
-- Fixes issue where trailing email columns in Google Forms were created as courses in the database.

-- 1. Delete any enrollments referencing bogus non-course names
DELETE FROM enrollments
WHERE course_id IN (
    SELECT id FROM courses
    WHERE lower(name) LIKE '%email%'
       OR lower(name) LIKE '%e-mail%'
       OR lower(name) LIKE '%почта%'
       OR lower(name) LIKE '%address%'
       OR lower(name) LIKE '%phone%'
       OR lower(name) LIKE '%mobile%'
       OR lower(name) LIKE '%timestamp%'
       OR lower(name) LIKE '%dob%'
       OR lower(name) LIKE '%eircode%'
       OR name ILIKE 'Email address'
);

-- 2. Delete any student_flags referencing bogus courses
DELETE FROM student_flags
WHERE course_id IN (
    SELECT id FROM courses
    WHERE lower(name) LIKE '%email%'
       OR lower(name) LIKE '%e-mail%'
       OR lower(name) LIKE '%почта%'
       OR lower(name) LIKE '%address%'
       OR lower(name) LIKE '%phone%'
       OR lower(name) LIKE '%mobile%'
       OR lower(name) LIKE '%timestamp%'
       OR lower(name) LIKE '%dob%'
       OR lower(name) LIKE '%eircode%'
       OR name ILIKE 'Email address'
);

-- 3. Delete any confirmation_tokens referencing bogus courses
DELETE FROM confirmation_tokens
WHERE course_id IN (
    SELECT id FROM courses
    WHERE lower(name) LIKE '%email%'
       OR lower(name) LIKE '%e-mail%'
       OR lower(name) LIKE '%почта%'
       OR lower(name) LIKE '%address%'
       OR lower(name) LIKE '%phone%'
       OR lower(name) LIKE '%mobile%'
       OR lower(name) LIKE '%timestamp%'
       OR lower(name) LIKE '%dob%'
       OR lower(name) LIKE '%eircode%'
       OR name ILIKE 'Email address'
);

-- 4. Delete the bogus courses themselves
DELETE FROM courses
WHERE lower(name) LIKE '%email%'
   OR lower(name) LIKE '%e-mail%'
   OR lower(name) LIKE '%почта%'
   OR lower(name) LIKE '%address%'
   OR lower(name) LIKE '%phone%'
   OR lower(name) LIKE '%mobile%'
   OR lower(name) LIKE '%timestamp%'
   OR lower(name) LIKE '%dob%'
   OR lower(name) LIKE '%eircode%'
   OR name ILIKE 'Email address';
