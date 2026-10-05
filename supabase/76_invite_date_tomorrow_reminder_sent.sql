-- ============================================================
-- Migration 76: Remember when the day-before reminder was sent
--
-- Next to the 7-day attendance reminder (migration 70), the admin
-- dashboard asks for a second reminder on the day before the course
-- until "I've sent it" is pressed; that stamps
-- invite_dates.reminder_tomorrow_sent_at for the course + date.
-- ============================================================
ALTER TABLE public.invite_dates
    ADD COLUMN IF NOT EXISTS reminder_tomorrow_sent_at timestamptz;
