import { describe, it, expect } from 'vitest';
import { buildIcsContent, getGoogleCalendarUrl } from './calendarUtils';

describe('calendarUtils', () => {
    it('generates a valid Google Calendar URL with correct parameters', () => {
        const urlString = getGoogleCalendarUrl({
            courseName: 'Safe Pass',
            courseDate: '2026-10-15',
        });

        const url = new URL(urlString);
        expect(url.hostname).toBe('calendar.google.com');
        expect(url.searchParams.get('action')).toBe('TEMPLATE');
        expect(url.searchParams.get('text')).toBe('Course: Safe Pass');
        expect(url.searchParams.get('dates')).toBe('20261015T093000/20261015T163000');
        expect(url.searchParams.get('location')).toContain('Cork City Partnership');
        expect(url.searchParams.get('details')).toContain('ivasyliev@partnershipcork.ie');
    });

    it('respects custom start and end times if provided', () => {
        const urlString = getGoogleCalendarUrl({
            courseName: 'Manual Handling',
            courseDate: '2026-11-20',
            startTime: '10:00',
            endTime: '14:00',
        });

        const url = new URL(urlString);
        expect(url.searchParams.get('dates')).toBe('20261120T100000/20261120T140000');
    });
});

describe('multi-day courses', () => {
    it('puts one event per day in the .ics file, with each day\'s own time', () => {
        const ics = buildIcsContent({
            courseName: 'Safe Pass',
            courseDate: '2026-10-01',
            startTime: '10:00',
            endTime: '14:00',
            location: 'Heron House, Blackpool; Room 2',
            days: [{ date: '2026-10-01' }, { date: '2026-10-08', endTime: '12:00' }],
        });
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(ics).toContain('DTSTART:20261001T100000');
        expect(ics).toContain('DTEND:20261001T140000');
        expect(ics).toContain('DTSTART:20261008T100000');
        expect(ics).toContain('DTEND:20261008T120000');
        expect(ics).toContain('SUMMARY:Course: Safe Pass (Day 2 of 2)');
        expect(ics).toContain('LOCATION:Heron House\\, Blackpool\\; Room 2');
    });

    it('keeps a one-day course as a single event', () => {
        const ics = buildIcsContent({ courseName: 'Safe Pass', courseDate: '2026-10-01' });
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
        expect(ics).toContain('DTSTART:20261001T093000');
        expect(ics).toContain('SUMMARY:Course: Safe Pass\r\n');
    });

    it('adds the day to the Google Calendar title', () => {
        const url = new URL(getGoogleCalendarUrl({ courseName: 'Safe Pass', courseDate: '2026-10-08', titleSuffix: 'Day 2 of 4' }));
        expect(url.searchParams.get('text')).toBe('Course: Safe Pass (Day 2 of 4)');
    });
});
