-- ===========================================================================
-- SQL SCRIPT: Update Manual Handling Attendance from MANUAL HANDLING 2026.xlsx
-- Generated: 2026-08-17 13:00:17
-- Policy: ONLY update existing students. No new student profiles are created.
-- Pure CTE: No temporary tables created (bypasses Supabase RLS warnings).
-- ===========================================================================

WITH raw_attendees (full_name, first_name, last_name, email, phone_digits, completed_date, sheet_source) AS (
    VALUES
    ('Thomas Healy', 'Thomas', 'Healy', '', '0851123991', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Swaleh Said', 'Swaleh', 'Said', '', '0857255190', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Kevin Chute', 'Kevin', 'Chute', '', '0871948625', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('James Jackson', 'James', 'Jackson', '', '0851182822', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Richard Sause', 'Richard', 'Sause', '', '0857779042', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Minodora Pit', 'Minodora', 'Pit', '', '0862423378', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Tommy Mannah', 'Tommy', 'Mannah', '', '0838017020', '2026-02-03'::date, 'Tues 3rd Feb 2026'),
    ('Lindemann Martin', 'Lindemann', 'Martin', 'u8093572782@gmail.com', '0833336364', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Karol Lewandowski', 'Karol', 'Lewandowski', '', '0831849618', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Kevin Twohig', 'Kevin', 'Twohig', '', '0852166760', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Robert Murray', 'Robert', 'Murray', '', '0876650244', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Abubakar Mohammed Sadiq', 'Abubakar', 'Mohammed Sadiq', 'babaozil2012@gmail.com', '', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Dominic Eboseluimen Eigbobo', 'Dominic', 'Eboseluimen Eigbobo', 'eigboboeboseluimen@gmail.com', '', '2026-02-10'::date, 'Tues 10th Feb 2026'),
    ('Abdallh Maher Motawe Alrai', 'Abdallh', 'Maher Motawe Alrai', 'bdallhmahr3@gmail.com', '', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Isatu Kamarakay', 'Isatu', 'Kamarakay', 'isatukamarakay21@gmail.com', '0838104820', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Lirio Pinto', 'Lirio', 'Pinto', '', '0899789812', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Alex Browne', 'Alex', 'Browne', '', '0858268471', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Wellington Edokpolor', 'Wellington', 'Edokpolor', 'edokpolor.wellington@gmail.com', '0899682124', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Nosarumen Daniel Awanbor', 'Nosarumen', 'Daniel Awanbor', 'dannyawanbor@gmail.com', '0858147342', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Mohamed Hassan Jama', 'Mohamed', 'Hassan Jama', '', '0852229587', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Melanie Meade', 'Melanie', 'Meade', '', '0863874870', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Derek Mostyn', 'Derek', 'Mostyn', '', '0879164240', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Dermot McNamara', 'Dermot', 'McNamara', '', '0852804087', '2026-02-24'::date, 'Tues 24th Feb 2026'),
    ('Shola Emmanuel Akinyemi', 'Shola', 'Emmanuel Akinyemi', 'akinyemimichael123@gmail.com', '0899434168', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Petr Cupanek', 'Petr', 'Cupanek', 'woodlad853@gmail.com', '0858367970', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('James Murphy', 'James', 'Murphy', '', '0871834404', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Jason O''Connell', 'Jason', 'O''Connell', 'jasonoconnell7@gmail.com', '0833807906', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Mohamed Hassan', 'Mohamed', 'Hassan', 'mohamedhassanali441@gmail.com', '', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Killian Buckley', 'Killian', 'Buckley', 'killian.buckley65@outlook.ie', '0877186463', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Anthony Neary', 'Anthony', 'Neary', '', '0872703620', '2026-03-03'::date, 'Tues 3rd Mar 2026'),
    ('Hilal Raham', 'Hilal', 'Raham', 'khanhilal244k@gmail.com', '0873830381', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('David Philpott', 'David', 'Philpott', '', '0851806119', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Damien Aherne', 'Damien', 'Aherne', '', '0830286021', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('William Dell', 'William', 'Dell', '', '0857162201', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Alan Fitzsimons', 'Alan', 'Fitzsimons', 'alanfitzsimons6@gmail.com', '0830537953', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Jason Lyons', 'Jason', 'Lyons', '', '0851986852', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Tyrone Meade', 'Tyrone', 'Meade', 'tyronemeade8@gmail.com', '0899883262', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Jonathan Dineen', 'Jonathan', 'Dineen', '', '0852178161', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Martin Daly', 'Martin', 'Daly', '', '0857205657', '2026-06-01'::date, 'LAES MH Referrals'),
    ('Sadam Hussein Ali', 'Sadam', 'Hussein Ali', 'sadaam0555@gmail.com', '0873829280', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Jayakanthan Rajasekar', 'Jayakanthan', 'Rajasekar', 'jayakanthan4u@gmail.com', '0899899087', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Saida Sheqow', 'Saida', 'Sheqow', 'saidogeedi4@gmail.com', '0852194124', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Guled Abdul Rashid Nuur', 'Guled', 'Abdul Rashid Nuur', 'uuledhanad12@gmail.com', '0851926172', '2026-03-10'::date, 'Tues 10th Mar 2026'),
    ('Paul O''Donovan', 'Paul', 'O''Donovan', 'paulodonovan3@gmail.com', '0857874930', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Slawomir Lubomir HADRYS', 'Slawomir', 'Lubomir HADRYS', '', '0833613875', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Elliot Peter Kelly', 'Elliot', 'Peter Kelly', '', '0857271238', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Gautham Karthik Iyer', 'Gautham', 'Karthik Iyer', 'iyergk@gmail.com', '0879938356', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Louisa Hogan', 'Louisa', 'Hogan', 'louisa198036@gmail.com', '0866665601', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Andrew Hennessy', 'Andrew', 'Hennessy', '', '', '2026-06-01'::date, 'LAES MH Referrals'),
    ('Abdul Manan Sheenwary', 'Abdul', 'Manan Sheenwary', '', '0830584952', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Alex Gahen', 'Alex', 'Gahen', '', '', '2026-06-01'::date, 'LAES MH Referrals'),
    ('Benard Okoro', 'Benard', 'Okoro', '', '0834759173', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Alhadi Mohammed Brema', 'Alhadi', 'Mohammed Brema', 'alhadibryma@gmail.com', '0858239519', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Peter Brolly', 'Peter', 'Brolly', '', '0830952987', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Martin Browne', 'Martin', 'Browne', '', '0857519449', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Anthony O''Sullivan', 'Anthony', 'O''Sullivan', '', '0858164855', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Suraj Singh', 'Suraj', 'Singh', '', '0872690897', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Craig Cooney', 'Craig', 'Cooney', '', '', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Festus Arekhandia', 'Festus', 'Arekhandia', 'festusfedias@gmail.com', '353833469782', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Precious Edobor', 'Precious', 'Edobor', 'edoborp9@gmail.com', '', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Michael Burke', 'Michael', 'Burke', '', '0830934505', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Abdirahman Mohamed', 'Abdirahman', 'Mohamed', 'adiyamaka@gmail.com', '0830938441', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Sofian A. Alladaa', 'Sofian', 'A. Alladaa', 'salladaa2005@gmail.com', '', '2026-04-14'::date, 'Tues 14th Apr 2026'),
    ('Kevin O''Connor', 'Kevin', 'O''Connor', 'kevoc88@hotmail.com', '0851937007', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Kenneth Maguire', 'Kenneth', 'Maguire', 'kennethmaguire66@gmail.com', '0830951892', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Cloudia Splane', 'Cloudia', 'Splane', '', '0857590663', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Ahmed Abdi Abdulkadir', 'Ahmed', 'Abdi Abdulkadir', '', '0899776558', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Mark O'' Sullivan', 'Mark', 'O'' Sullivan', '', '0860771302', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Kazeem Akinkunmi Babatunde', 'Kazeem', 'Akinkunmi Babatunde', 'babatundekazeemakin@gmail.com', '0899881414', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Alphonsus Evughaye', 'Alphonsus', 'Evughaye', 'alphonsusevus@gmail.com', '447459436200', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Faisal Boutala', 'Faisal', 'Boutala', '', '0899476408', '2026-04-28'::date, 'Tues 28th Apr 2026'),
    ('Anyanwu Scholarstica Nwakaego', 'Anyanwu', 'Scholarstica Nwakaego', 'anyanwuscholarstica@gmail.com', '0831054583', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Ali Ahmed Harun', 'Ali', 'Ahmed Harun', 'hilaac088@gmail.com', '0899597611', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Nathan Peachey', 'Nathan', 'Peachey', '', '0857591989', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Rory O''Dwyer', 'Rory', 'O''Dwyer', '', '0858340214', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Iro Scerbo', 'Iro', 'Scerbo', 'scerboiro@gmail.com', '0877109404', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Patrick O''Connell', 'Patrick', 'O''Connell', '', '0851086956', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Alinafe Chinamale', 'Alinafe', 'Chinamale', 'anfechinamale@gmail.com', '085742294', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Hua Wang', 'Hua', 'Wang', 'huawang208@gmail.com', '0831819077', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Craig O''Leary', 'Craig', 'O''Leary', 'craigoleary54@gmail.com', '0851431624', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Ahmed Omar Siyad', 'Ahmed', 'Omar Siyad', '', '0899480886', '2026-05-05'::date, 'Tues 5th May 2026'),
    ('Samira Yaasin Cali', 'Samira', 'Yaasin Cali', 'samiirayasin45@gmail.com', '0834164234', '2026-05-26'::date, 'Tues 26th May 2026'),
    ('Jonathan Flanagan', 'Jonathan', 'Flanagan', '', '0879496346', '2026-05-26'::date, 'Tues 26th May 2026'),
    ('Tresor Hemedy', 'Tresor', 'Hemedy', 'tresorjc5@gmail.com', '0892023750', '2026-05-26'::date, 'Tues 26th May 2026'),
    ('Ahmed Shalaby', 'Ahmed', 'Shalaby', 'ahmedsalimdublin@gmail.com', '', '2026-05-26'::date, 'Tues 26th May 2026'),
    ('Dermot McConville', 'Dermot', 'McConville', '', '0877939249', '2026-05-26'::date, 'Tues 26th May 2026'),
    ('Amanda Jacqueline Jellows', 'Amanda', 'Jacqueline Jellows', '', '0894078082', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Valerii Bykov', 'Valerii', 'Bykov', 'relow60@gmail.com', '0892124506', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Brooke Bailey', 'Brooke', 'Bailey', '', '0858649181', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Wendy Murphy', 'Wendy', 'Murphy', '', '0894356229', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Jason Hogan', 'Jason', 'Hogan', '', '0851774356', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Mohamed Yahya', 'Mohamed', 'Yahya', 'mohamedshaaci555@gmail.com', '0830924009', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Musse Hasan', 'Musse', 'Hasan', 'mussehasan269@gmail.com', '0830928524', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Bernard Ojodale Ajogwu', 'Bernard', 'Ojodale Ajogwu', 'tben8087@gmail.com', '0899699334', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Daryna Syrotkina', 'Daryna', 'Syrotkina', 'darina.borovik@gmail.com', '0857810588', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Syed Ali - SICAP Registered', 'Syed', 'Ali - SICAP Registered', '', '0852882055', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('David Lane', 'David', 'Lane', '', '0877786640', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Gints Leoke', 'Gints', 'Leoke', 'gintsleoke90@gmail.com', '0838387336', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Sean Higgins - SICAP Registered', 'Sean', 'Higgins - SICAP Registered', 'higginsrider@gmail.com', '0894517096', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Hennadii Mialuk', 'Hennadii', 'Mialuk', 'gennadiymialuk@gmail.com', '0857362489', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Naaji Hussen', 'Naaji', 'Hussen', 'naajihussein047@gmail.com', '0851078348', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Nuurdiin Mohamed', 'Nuurdiin', 'Mohamed', '', '0852228490', '2026-06-09'::date, 'Tues 9th Jun 2026'),
    ('Nora Jones', 'Nora', 'Jones', '', '0894106632', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Calum Heffernan', 'Calum', 'Heffernan', '', '0870554847', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Qasim Abdiaziz Omar', 'Qasim', 'Abdiaziz Omar', 'kaasimabdi3@gmail.com', '0899605472', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Najib Abdirahman Elmi', 'Najib', 'Abdirahman Elmi', '', '0852216740', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Cade Nuur Cabdiraxmaan', 'Cade', 'Nuur Cabdiraxmaan', 'cadenuurcabdiraxmaan@gmail.com', '0851892528', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Mohamed Hassan', 'Mohamed', 'Hassan', 'canacabe2555@gmail.com', '0899841087', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Victor Grincu', 'Victor', 'Grincu', '', '0894478111', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('David Burke', 'David', 'Burke', '', '0852227328', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Lynda Rodgers', 'Lynda', 'Rodgers', 'lynrodgers40@gmail.com', '0852858143', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Abdul Hadi Abubakar', 'Abdul', 'Hadi Abubakar', 'abdulhadiabubakar0244@gmai.com', '0899665801', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Adam Baba', 'Adam', 'Baba', '', '0851966669', '2026-06-25'::date, 'Thurs 25th Jun 2026'),
    ('Krzysztof Zygmunt', 'Krzysztof', 'Zygmunt', '', '0857809047', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Duale Shueb Ali', 'Duale', 'Shueb Ali', 'dshueb009@gmail.com', '0830635253', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Kevin McGrath', 'Kevin', 'McGrath', '', '0857550269', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Olamide Oyetoso', 'Olamide', 'Oyetoso', 'oyetosoolamide@yahoo.com', '0899895678', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Ajmal Khan', 'Ajmal', 'Khan', 'ak0674212@gmail.com', '0830919465', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Javed Ahmed Azami', 'Javed', 'Ahmed Azami', 'javedahmedazami@yahoo.com', '0831577562', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Mouli Raycharles', 'Mouli', 'Raycharles', 'raycharlesmouli@gmail.com', '0838429160', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Ismaheel Afolabi', 'Ismaheel', 'Afolabi', '', '0899667387', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Benjamin O''Reilly', 'Benjamin', 'O''Reilly', '', '0852699930', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Donal Lyons', 'Donal', 'Lyons', '', '0851880248', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('Gogita Ikaidze', 'Gogita', 'Ikaidze', '', '0872757567', '2026-07-07'::date, 'Tues 7th July 2026'),
    ('THOMAS BARRY WALLS', 'THOMAS', 'BARRY WALLS', '', '0892501066', '2026-07-21'::date, 'Tues 21st July 2026'),
    ('Sayid Ali Hussein', 'Sayid', 'Ali Hussein', '', '0830573283', '2026-07-21'::date, 'Tues 21st July 2026'),
    ('John McCarthy', 'John', 'McCarthy', '', '0833478269', '2026-07-21'::date, 'Tues 21st July 2026'),
    ('Christiano Lins Araruna', 'Christiano', 'Lins Araruna', 'christiano_l@yahoo.com', '0833884039', '2026-07-21'::date, 'Tues 21st July 2026'),
    ('Prezmyslaw Szafran', 'Prezmyslaw', 'Szafran', 'przemo.3216@gmail.com', '0851975418', '2026-08-11'::date, 'Tues 11th Aug 2026'),
    ('Michael Daniel O''Connell', 'Michael', 'Daniel O''Connell', 'mickoconnell766@gmail.com', '0857022119', '2026-08-11'::date, 'Tues 11th Aug 2026'),
    ('Thomas Anthony Healy', 'Thomas', 'Anthony Healy', '', '0860576967', '2026-08-11'::date, 'Tues 11th Aug 2026'),
    ('Maksym Ostapets', 'Maksym', 'Ostapets', 'klassymaxy@gmail.com', '0870386525', '2026-08-11'::date, 'Tues 11th Aug 2026')
),
mh_course AS (
    SELECT id FROM courses WHERE lower(trim(name)) = 'manual handling' LIMIT 1
),
matched_students AS (
    SELECT DISTINCT ON (s.id)
        s.id AS student_id,
        s.first_name AS db_first_name,
        s.last_name AS db_last_name,
        s.email AS db_email,
        s.phone AS db_phone,
        att.full_name AS excel_name,
        att.email AS excel_email,
        att.phone_digits AS excel_phone,
        att.completed_date,
        att.sheet_source,
        CASE 
            WHEN att.email <> '' AND lower(trim(s.email)) = lower(trim(att.email)) THEN 'Email match'
            WHEN length(att.phone_digits) >= 7 AND length(regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g')) >= 7 
                 AND right(regexp_replace(s.phone, '\D', '', 'g'), 7) = right(att.phone_digits, 7) THEN 'Phone match'
            WHEN att.first_name <> '' AND att.last_name <> '' 
                 AND lower(trim(s.first_name)) = lower(trim(att.first_name)) 
                 AND lower(trim(s.last_name)) = lower(trim(att.last_name)) THEN 'Exact Name match'
            WHEN att.first_name <> '' AND att.last_name <> '' 
                 AND lower(trim(s.first_name)) = lower(trim(att.last_name)) 
                 AND lower(trim(s.last_name)) = lower(trim(att.first_name)) THEN 'Flipped Name match'
            ELSE 'Other'
        END AS match_reason
    FROM raw_attendees att
    JOIN students s ON (
        (att.email <> '' AND lower(trim(s.email)) = lower(trim(att.email)))
        OR (length(att.phone_digits) >= 7 AND length(regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g')) >= 7 
            AND right(regexp_replace(s.phone, '\D', '', 'g'), 7) = right(att.phone_digits, 7))
        OR (att.first_name <> '' AND att.last_name <> '' 
            AND lower(trim(s.first_name)) = lower(trim(att.first_name)) 
            AND lower(trim(s.last_name)) = lower(trim(att.last_name)))
        OR (att.first_name <> '' AND att.last_name <> '' 
            AND lower(trim(s.first_name)) = lower(trim(att.last_name)) 
            AND lower(trim(s.last_name)) = lower(trim(att.first_name)))
    )
),
updated_enrollments AS (
    UPDATE enrollments e
    SET 
        status = 'completed',
        completed_date = m.completed_date,
        completed_at = COALESCE(e.completed_at, m.completed_date::timestamptz, now()),
        updated_at = now()
    FROM matched_students m, mh_course c
    WHERE e.student_id = m.student_id
      AND e.course_id = c.id
    RETURNING e.id AS updated_id
),
inserted_enrollments AS (
    INSERT INTO enrollments (student_id, course_id, status, completed_date, completed_at, updated_at)
    SELECT 
        m.student_id,
        c.id,
        'completed',
        m.completed_date,
        COALESCE(m.completed_date::timestamptz, now()),
        now()
    FROM matched_students m
    CROSS JOIN mh_course c
    WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e2 
        WHERE e2.student_id = m.student_id 
          AND e2.course_id = c.id
    )
    RETURNING id AS inserted_id
),
stats AS (
    SELECT 
        (SELECT count(*) FROM updated_enrollments) AS num_updated,
        (SELECT count(*) FROM inserted_enrollments) AS num_new_enrolled
)
SELECT 
    m.student_id,
    m.db_first_name || ' ' || m.db_last_name AS db_full_name,
    m.db_email,
    m.db_phone,
    m.excel_name,
    m.completed_date,
    m.sheet_source,
    m.match_reason,
    (SELECT num_updated FROM stats) AS total_enrollments_updated,
    (SELECT num_new_enrolled FROM stats) AS total_new_enrollments_created
FROM matched_students m
ORDER BY m.completed_date DESC, m.db_last_name ASC;
