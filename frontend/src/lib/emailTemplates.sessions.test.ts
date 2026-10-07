import { describe, it, expect } from 'vitest';
import { buildEmailBodyHtml } from './emailTemplates';
import { weeklyDates, type CourseSession } from './courseSessions';

const session = (patch: Partial<CourseSession> = {}): CourseSession => ({
    date: '2026-10-01', start_time: null, end_time: null, location: null, days: null, ...patch,
});
const days = (first: string, n: number) => weeklyDates(first, n).map(date => ({ date }));
const build = (sessions: CourseSession[], link = 'https://x.ie/c/abc') =>
    buildEmailBodyHtml('Safe Pass', sessions.map(s => s.date), link, undefined, 7, false, 'invite', null, sessions);
/** Text of the email without tags, for readable assertions. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('buildEmailBodyHtml with course date schedules', () => {
    it('one day: the date, the time and the place', () => {
        const out = text(build([session({ start_time: '10:00', end_time: '14:00', location: 'Heron House' })]));
        expect(out).toMatch(/Date &amp; Time 🗓️ Thu,? 01 Oct 2026 🕙 10:00 – 14:00 📍 Heron House/);
        expect(out).not.toContain('Day 1');
        expect(out).not.toContain('Attendance on all');
    });

    it('several days: Day 1 highlighted, every day listed, attendance on all days required', () => {
        const html = build([session({ start_time: '10:00', end_time: '14:00', days: [...days('2026-10-01', 2), { date: '2026-10-12' }, { date: '2026-10-15' }] })]);
        const out = text(html);
        expect(out).toMatch(/Day 1 Thu,? 01 Oct 2026 Day 2 Thu,? 08 Oct 2026 Day 3 Mon,? 12 Oct 2026 Day 4 Thu,? 15 Oct 2026/);
        expect(out).toContain('🕙 10:00 – 14:00');
        expect(out).toContain('Attendance on all 4 days is required.');
        // Day 1 stands out (bold blue), the other days don't
        expect(html).toMatch(/font-size:15px;color:#0369a1;font-weight:bold;[^>]*>Thu,? 01 Oct 2026/);
        expect(html).toMatch(/font-size:14px;color:#0f172a;[^>]*>Thu,? 08 Oct 2026/);
        expect(out).toContain('Confirm My Place');
    });

    it('a day with its own time shows the time of every day', () => {
        const out = text(build([session({ start_time: '10:00', end_time: '14:00', days: [{ date: '2026-10-01' }, { date: '2026-10-08', end: '12:00' }] })]));
        expect(out).toMatch(/Day 1 Thu,? 01 Oct 2026 10:00 – 14:00 Day 2 Thu,? 08 Oct 2026 10:00 – 12:00/);
        expect(out).not.toContain('🕙');
    });

    it('a long weekly course is summed up', () => {
        const out = text(build([session({ date: '2026-10-07', start_time: '10:00', end_time: '14:00', days: days('2026-10-07', 8) })]));
        expect(out).toMatch(/🗓️ Starts Wed,? 07 Oct 2026 Every Wednesday for 8 weeks, until Wed,? 25 Nov 2026/);
        expect(out).not.toContain('Day 2');
        expect(out).toContain('Attendance on all 8 days is required.');
    });

    it('options of several days to choose from: Option 1 / Option 2, shared time and place once', () => {
        const october = session({ start_time: '10:00', end_time: '14:00', location: 'Heron House', days: [...days('2026-10-01', 2), { date: '2026-10-12' }, { date: '2026-10-15' }] });
        const november = session({ date: '2026-10-29', start_time: '10:00', end_time: '14:00', location: 'Heron House', days: [{ date: '2026-10-29' }, { date: '2026-11-02' }, { date: '2026-11-05' }, { date: '2026-11-12' }] });
        const out = text(build([october, november]));
        expect(out).toMatch(/Choose one of the options Option 1 Day 1 Thu,? 01 Oct 2026 .* Option 2 Day 1 Thu,? 29 Oct 2026 .*Day 4 Thu,? 12 Nov 2026/);
        expect(out.match(/Heron House/g)).toHaveLength(1);
        expect(out.match(/10:00 – 14:00/g)).toHaveLength(1);
        expect(out).toContain('You will pick your preferred option on the confirmation page.');
        expect(out).toContain('Attendance on all days of the option you choose is required.');
        expect(out).toContain('Choose My Date &amp; Confirm');
    });

    it('one-day dates to choose from keep the date list, with a different place under each', () => {
        const out = text(build([session({ location: 'Room 1' }), session({ date: '2026-10-02', location: 'Room 2' })]));
        expect(out).toMatch(/Choose one of the dates 🗓️ Thu,? 01 Oct 2026 📍 Room 1 🗓️ Fri,? 02 Oct 2026 📍 Room 2/);
        expect(out).not.toContain('Option 1');
        expect(out).toContain('You will pick your preferred date on the confirmation page.');
    });

    it('escapes the place', () => {
        const html = build([session({ location: '<b>Room</b> & Hall' })]);
        expect(html).toContain('&lt;b&gt;Room&lt;/b&gt; &amp; Hall');
        expect(html).not.toContain('<b>Room');
    });

    it('links the place to Google Maps, but not an online one', () => {
        const html = build([session({ location: 'Heron House, Blackpool' })]);
        expect(html).toContain('📍 <a href="https://www.google.com/maps/search/?api=1&amp;query=Heron%20House%2C%20Blackpool%2C%20Cork%2C%20Ireland" target="_blank"');
        expect(html).toMatch(/>Heron House, Blackpool<\/a>/);
        const online = build([session({ location: 'Online' })]);
        expect(online).toContain('📍 Online');
        expect(online).not.toContain('google.com/maps');
    });

    it('keeps the old date row when no schedule is given', () => {
        const html = buildEmailBodyHtml('Safe Pass', 'Thu, 01 Oct 2026', 'https://x.ie', undefined, 7, false, 'invite', null);
        expect(text(html)).toContain('Date &amp; Time 🗓️ Thu, 01 Oct 2026');
    });
});
