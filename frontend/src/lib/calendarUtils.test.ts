import { describe, it, expect } from 'vitest';
import { getGoogleCalendarUrl } from './calendarUtils';

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
