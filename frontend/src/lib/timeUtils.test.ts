import { describe, it, expect } from 'vitest';
import { formatDuration, minutesOf, parseTimeText, timeOf, timeSlots } from './timeUtils';

describe('parseTimeText', () => {
    it.each([
        ['9', '09:00'],
        ['09', '09:00'],
        ['930', '09:30'],
        ['0930', '09:30'],
        ['9:30', '09:30'],
        ['9.30', '09:30'],
        ['9h30', '09:30'],
        ['14', '14:00'],
        ['1400', '14:00'],
        ['14:05', '14:05'],
        ['9am', '09:00'],
        ['2pm', '14:00'],
        ['2:30 pm', '14:30'],
        ['12am', '00:00'],
        ['12pm', '12:00'],
        [' 10:00 ', '10:00'],
    ])('%s → %s', (text, expected) => {
        expect(parseTimeText(text)).toBe(expected);
    });

    it.each(['', 'abc', '24', '25:00', '9:60', '13pm', '0am', '9:3', '12345'])('rejects %s', text => {
        expect(parseTimeText(text)).toBeNull();
    });
});

describe('time helpers', () => {
    it('converts between "HH:MM" and minutes', () => {
        expect(minutesOf('10:30')).toBe(630);
        expect(timeOf(630)).toBe('10:30');
        expect(timeOf(0)).toBe('00:00');
    });

    it('lists the day in 15-minute steps', () => {
        const slots = timeSlots(15);
        expect(slots).toHaveLength(96);
        expect(slots.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
        expect(slots[slots.length - 1]).toBe('23:45');
    });

    it('formats durations', () => {
        expect(formatDuration(30)).toBe('30 min');
        expect(formatDuration(60)).toBe('1 h');
        expect(formatDuration(90)).toBe('1 h 30 min');
        expect(formatDuration(240)).toBe('4 h');
    });
});
