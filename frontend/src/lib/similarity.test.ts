import { describe, it, expect } from 'vitest';
import { normalizeName, levenshteinDistance, normalizePhone, areNamesSimilar } from './similarity';

describe('similarity', () => {
    describe('normalizeName', () => {
        it('normalizes simple names correctly', () => {
            expect(normalizeName('John')).toBe('john');
            expect(normalizeName('  Jane-Doe  ')).toBe('janedoe');
        });

        it('handles accents and diacritics', () => {
            expect(normalizeName('Renée')).toBe('renee');
            expect(normalizeName('José')).toBe('jose');
        });

        it('handles Cyrillic names (Russian/Ukrainian)', () => {
            expect(normalizeName('Иван')).toBe('иван');
            expect(normalizeName('Олександр')).toBe('олександр');
            expect(normalizeName('Ігор')).toBe('ігор');
        });

        it('returns empty string for null/empty values', () => {
            expect(normalizeName('')).toBe('');
        });
    });

    describe('levenshteinDistance', () => {
        it('calculates exact matches as 0', () => {
            expect(levenshteinDistance('hello', 'hello')).toBe(0);
        });

        it('calculates single edits correctly', () => {
            expect(levenshteinDistance('kitten', 'sitten')).toBe(1);
            expect(levenshteinDistance('kitten', 'sittin')).toBe(2);
            expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
        });

        it('handles empty inputs', () => {
            expect(levenshteinDistance('', 'abc')).toBe(3);
            expect(levenshteinDistance('abc', '')).toBe(3);
            expect(levenshteinDistance('', '')).toBe(0);
        });
    });

    describe('normalizePhone', () => {
        it('keeps only the last 9 digits', () => {
            expect(normalizePhone('+353 (87) 123 4567')).toBe('871234567');
            expect(normalizePhone('0871234567')).toBe('871234567');
            expect(normalizePhone('12345')).toBe('12345');
            expect(normalizePhone(null)).toBe('');
        });
    });

    describe('areNamesSimilar', () => {
        it('returns true for exact matches', () => {
            expect(areNamesSimilar('John', 'Doe', 'John', 'Doe')).toBe(true);
        });

        it('returns true for minor typos', () => {
            expect(areNamesSimilar('Ivan', 'Vasiliev', 'Iwan', 'Vasiliev')).toBe(true); // "Ivan" vs "Iwan" (dist = 1)
            expect(areNamesSimilar('Ihor', 'Vasyliev', 'Igor', 'Vasiliev')).toBe(true); // "Ihor" vs "Igor" (dist=1), "Vasyliev" vs "Vasiliev" (dist=1)
        });

        it('returns true for swapped first and last names', () => {
            expect(areNamesSimilar('John', 'Doe', 'Doe', 'John')).toBe(true);
            expect(areNamesSimilar('Ivan', 'Vasiliev', 'Vasiliev', 'Iwan')).toBe(true);
        });

        it('returns false for completely different names', () => {
            expect(areNamesSimilar('John', 'Doe', 'Jane', 'Smith')).toBe(false);
            expect(areNamesSimilar('Ivan', 'Vasiliev', 'Ihor', 'Shevchenko')).toBe(false);
        });
    });
});
