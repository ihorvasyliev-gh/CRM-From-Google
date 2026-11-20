import { describe, it, expect } from 'vitest';
import { toggleOutcomeSelection, matchesOutcomeSearch } from './outcomeSelection';

describe('toggleOutcomeSelection', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e'];

    it('toggles a single row without mutating the input set', () => {
        const initial = new Set(['a']);
        const added = toggleOutcomeSelection(initial, 'c', ordered, 'a', false);
        expect(Array.from(initial)).toEqual(['a']);
        expect(Array.from(added)).toEqual(['a', 'c']);

        const removed = toggleOutcomeSelection(added, 'a', ordered, 'c', false);
        expect(Array.from(removed)).toEqual(['c']);
    });

    it('selects a forward range on Shift+click', () => {
        const prev = new Set(['b']);
        const next = toggleOutcomeSelection(prev, 'd', ordered, 'b', true);
        expect(Array.from(next).sort()).toEqual(['b', 'c', 'd']);
    });

    it('selects a backward range on Shift+click', () => {
        const prev = new Set(['d']);
        const next = toggleOutcomeSelection(prev, 'a', ordered, 'd', true);
        expect(Array.from(next).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('deselects the contiguous range when Shift+clicking an already-selected target', () => {
        const prev = new Set(['a', 'b', 'c', 'd', 'e']);
        const next = toggleOutcomeSelection(prev, 'd', ordered, 'b', true);
        expect(Array.from(next).sort()).toEqual(['a', 'e']);
    });

    it('falls back to single toggle when lastClickedId is null or outside the visible order', () => {
        const noAnchor = toggleOutcomeSelection(new Set<string>(), 'c', ordered, null, true);
        expect(Array.from(noAnchor)).toEqual(['c']);

        const missingAnchor = toggleOutcomeSelection(new Set(['a']), 'c', ordered, 'deleted-id', true);
        expect(Array.from(missingAnchor).sort()).toEqual(['a', 'c']);
    });
});

describe('matchesOutcomeSearch', () => {
    const graduate = {
        firstName: 'Olena',
        lastName: 'Shevchenko',
        email: 'olena.s@example.com',
        phone: '+353872890084',
        fieldOfWork: 'Hospitality',
        extra: ['Safe Pass', 'Manual Handling'],
    };

    const outreach = {
        firstName: 'Liam',
        lastName: 'Murphy',
        email: 'liam@irish.ie',
        phone: '085 782 3299',
        fieldOfWork: 'Construction',
        extra: ['IRIS-90421'],
    };

    it('matches everything when query is empty or whitespace', () => {
        expect(matchesOutcomeSearch(graduate, '')).toBe(true);
        expect(matchesOutcomeSearch(graduate, '   ')).toBe(true);
    });

    it('matches names, emails, field of work, and extra fields (courses and IRIS IDs)', () => {
        expect(matchesOutcomeSearch(graduate, 'olena shev')).toBe(true);
        expect(matchesOutcomeSearch(graduate, 'hospitality')).toBe(true);
        expect(matchesOutcomeSearch(graduate, 'safe pass')).toBe(true);
        expect(matchesOutcomeSearch(graduate, 'manual olena')).toBe(true);
        expect(matchesOutcomeSearch(outreach, 'IRIS-90421')).toBe(true);
        expect(matchesOutcomeSearch(outreach, 'liam 90421')).toBe(true);
    });

    it('matches normalized phone numbers with leading-zero Irish prefixes like 087', () => {
        expect(matchesOutcomeSearch(graduate, '087')).toBe(true);
        expect(matchesOutcomeSearch(graduate, '087 289')).toBe(true);
        expect(matchesOutcomeSearch(graduate, 'olena 087')).toBe(true);
        expect(matchesOutcomeSearch(graduate, '085')).toBe(false);
    });

    it('does not match phone digits when query word contains letters', () => {
        // "t23y2y" contains digits "232" which appear inside "085 782 3299", but must not match phone
        expect(matchesOutcomeSearch(outreach, 't23y2y')).toBe(false);
        expect(matchesOutcomeSearch(graduate, 'abc289')).toBe(false);
    });

    it('requires every word in a multi-word query to match', () => {
        expect(matchesOutcomeSearch(graduate, 'olena construction')).toBe(false);
        expect(matchesOutcomeSearch(outreach, 'liam 087')).toBe(false);
    });
});
