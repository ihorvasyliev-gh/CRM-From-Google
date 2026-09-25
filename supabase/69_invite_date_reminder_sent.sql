-- ============================================================
-- Migration 69: Remember when attendance reminders were sent
--
-- The admin dashboard asks to send reminders for course dates in
-- the next 7 days until "I've sent it" is pressed; that stamps
-- invite_dates.reminder_sent_at for the course + date.
-- ============================================================
ALTER TABLE public.invite_dates
    ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
