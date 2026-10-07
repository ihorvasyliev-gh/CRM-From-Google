/**
 * Tests for types.ts utility functions.
 *
 * Covers:
 *   - cleanVariant: extracts the meaningful variant label from raw values
 */
import { describe, it, expect } from 'vitest';
import { ANY_VARIANT, cleanVariant, fullName, isAnyVariant, matchesVariant } from './types';

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

describe('fullName', () => {
    it('joins first and last name, leaving out a missing part', () => {
        expect(fullName({ first_name: 'Siobhán', last_name: "O'Brien" })).toBe("Siobhán O'Brien");
        expect(fullName({ first_name: 'Liam', last_name: null })).toBe('Liam');
        expect(fullName({ first_name: null, last_name: 'Murphy' })).toBe('Murphy');
    });

    it('is empty for no person or no name', () => {
        expect(fullName(null)).toBe('');
        expect(fullName(undefined)).toBe('');
        expect(fullName({})).toBe('');
    });
});

describe('Any language variant', () => {
    it('reads back unchanged through cleanVariant', () => {
        expect(cleanVariant('SafePass', ANY_VARIANT)).toBe(ANY_VARIANT);
        expect(isAnyVariant('SafePass', 'any language')).toBe(true);
        expect(isAnyVariant('SafePass', 'English')).toBe(false);
        expect(isAnyVariant('SafePass', null)).toBe(false);
    });

    it('matches its own variant under a language filter', () => {
        expect(matchesVariant('SafePass', 'Ukrainian', 'ukrainian')).toBe(true);
        expect(matchesVariant('SafePass', null, 'English')).toBe(true);
        expect(matchesVariant('SafePass', 'Ukrainian', 'English')).toBe(false);
    });

    it('shows "Any language" students under every language, and only them under "Any language"', () => {
        expect(matchesVariant('SafePass', ANY_VARIANT, 'English')).toBe(true);
        expect(matchesVariant('SafePass', ANY_VARIANT, 'Ukrainian')).toBe(true);
        expect(matchesVariant('SafePass', ANY_VARIANT, ANY_VARIANT)).toBe(true);
        expect(matchesVariant('SafePass', 'English', ANY_VARIANT)).toBe(false);
    });
});
