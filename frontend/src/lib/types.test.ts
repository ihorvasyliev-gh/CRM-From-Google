/**
 * Tests for types.ts utility functions.
 *
 * Covers:
 *   - cleanVariant: extracts the meaningful variant label from raw values
 */
import { describe, it, expect } from 'vitest';
import { cleanVariant } from './types';

describe('cleanVariant', () => {
    it('returns the variant as-is when it does not match the course name', () => {
        expect(cleanVariant('Python 101', 'English')).toBe('English');
        expect(cleanVariant('Python 101', 'Ukrainian')).toBe('Ukrainian');
    });

    it('strips the course name prefix from the variant', () => {
        expect(cleanVariant('ECDL', 'ECDL Ukrainian')).toBe('Ukrainian');
        expect(cleanVariant('Data Analysis', 'Data Analysis English')).toBe('English');
    });

    it('extracts text inside parentheses', () => {
        expect(cleanVariant('Course', 'Course (Advanced)')).toBe('Advanced');
        expect(cleanVariant('English', 'English (Level B1)')).toBe('Level b1');
    });

    it('defaults to "English" when variant is null', () => {
        expect(cleanVariant('Python 101', null)).toBe('English');
    });

    it('defaults to "English" when variant is undefined', () => {
        expect(cleanVariant('Python 101', undefined)).toBe('English');
    });

    it('defaults to "English" when variant is empty string', () => {
        expect(cleanVariant('Python 101', '')).toBe('English');
    });

    it('defaults to "English" when variant is whitespace only', () => {
        expect(cleanVariant('Python 101', '   ')).toBe('English');
    });

    it('capitalises the first letter of the result', () => {
        expect(cleanVariant('Python 101', 'english')).toBe('English');
        expect(cleanVariant('Python 101', 'ENGLISH')).toBe('English');
    });

    it('strips leading dashes/colons after removing course name prefix', () => {
        expect(cleanVariant('Python', 'Python - English')).toBe('English');
        expect(cleanVariant('Python', 'Python: English')).toBe('English');
    });

    it('is case-insensitive when matching the prefix', () => {
        expect(cleanVariant('ECDL', 'ecdl ukrainian')).toBe('Ukrainian');
    });

    it('handles course name that appears in the middle (no strip)', () => {
        // Does NOT start with the course name → no stripping
        const result = cleanVariant('Python', 'Advanced Python');
        expect(result).toBe('Advanced python');
    });
});
