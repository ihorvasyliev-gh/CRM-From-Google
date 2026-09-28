import { describe, expect, it } from 'vitest';
import { evaluateSource, matchColumns, parseLooseDate, parsePlaceholders, placeholderFor, sourceColumns } from './source';

const headers = ['Id', 'Name of Group', 'Contact Name', 'Mobile Number\n', 'Email Address', 'Established'];

describe('placeholders', () => {
    it('parses columns and filters', () => {
        expect(parsePlaceholders('{Contact Name|first} {Date|dd|upper} and {today}')).toEqual([
            { column: 'Contact Name', filters: ['first'] },
            { column: 'Date', filters: ['dd', 'upper'] },
            { column: 'today', filters: [] },
        ]);
        expect(sourceColumns('{A} {A|first} {today} {row}')).toEqual(['A']);
    });

    it('builds placeholders that survive braces and pipes in headers', () => {
        expect(placeholderFor('Name {x} | y', ['first'])).toBe('{Name x y|first}');
    });
});

describe('matchColumns', () => {
    it('matches exact names ignoring case and punctuation', () => {
        const m = matchColumns(['mobile number', 'EMAIL ADDRESS'], headers);
        expect(m.get('mobile number')).toMatchObject({ index: 3, how: 'exact' });
        expect(m.get('EMAIL ADDRESS')).toMatchObject({ index: 4, how: 'exact' });
    });

    it('uses saved aliases, then the most similar unused column', () => {
        const m = matchColumns(['Organisation name', 'Mobile', 'E-mail'], headers, { 'Organisation name': ['Name of Group'] });
        expect(m.get('Organisation name')).toMatchObject({ index: 1, how: 'saved' });
        expect(m.get('Mobile')).toMatchObject({ index: 3, how: 'similar' });
        expect(m.get('E-mail')).toMatchObject({ index: 4, how: 'similar' });
    });

    it('reports missing columns and honours manual picks', () => {
        const m = matchColumns(['Eircode', 'Contact Name'], headers, {}, { 'Contact Name': -1 });
        expect(m.get('Eircode')).toMatchObject({ index: null, how: 'missing' });
        expect(m.get('Contact Name')).toMatchObject({ index: null, how: 'missing' });
        const picked = matchColumns(['Eircode'], headers, {}, { Eircode: 5 });
        expect(picked.get('Eircode')).toMatchObject({ index: 5, how: 'chosen' });
    });

    it('does not give one column to two different fields', () => {
        const m = matchColumns(['Mobile Phone', 'Mobile Number Two'], ['Mobile Number']);
        const indexes = [...m.values()].map(x => x.index).filter(i => i !== null);
        expect(indexes).toHaveLength(1);
    });
});

describe('evaluateSource', () => {
    const row = ['5', 'Blackpool Men’s Shed', 'Smith, Anna', '873633788', 'a@b.ie', 'since 2019'];
    const columns = matchColumns(['Name of Group', 'Contact Name', 'Mobile Number', 'Established', 'Email Address'], headers);
    const ev = (source: string) => evaluateSource(source, { row, columns, rowNumber: 3, today: new Date(2026, 8, 28) });

    it('fills placeholders and fixed text', () => {
        expect(ev('{Name of Group}')).toBe('Blackpool Men’s Shed');
        expect(ev('Group: {Name of Group} (row {row})')).toBe('Group: Blackpool Men’s Shed (row 3)');
        expect(ev('{Missing column}')).toBe('');
        expect(ev('{today}')).toBe('28/09/2026');
    });

    it('splits names, restores phone zeros and changes case', () => {
        expect(ev('{Contact Name|first}')).toBe('Anna');
        expect(ev('{Contact Name|last}')).toBe('Smith');
        expect(ev('{Mobile Number|phone}')).toBe('0873633788');
        expect(ev('{Email Address|upper}')).toBe('A@B.IE');
    });

    it('reads dates out of free text', () => {
        expect(ev('{Established|dd}/{Established|mm}/{Established|yyyy}')).toBe('01/01/2019');
        expect(ev('{today|yy}')).toBe('26');
    });
});

describe('parseLooseDate', () => {
    const today = new Date(2026, 0, 1);
    it.each([
        ['03/04/2021', { d: 3, m: 4, y: 2021 }],
        ['2021-04-03T00:00:00Z', { d: 3, m: 4, y: 2021 }],
        ['3.4.99', { d: 3, m: 4, y: 1999 }],
        ['September 2025', { d: 1, m: 9, y: 2025 }],
        ['12 Sept 2024', { d: 12, m: 9, y: 2024 }],
        ['The group has been active since 2023.', { d: 1, m: 1, y: 2023 }],
        ['25 Years', { d: 1, m: 1, y: 2001 }],
    ])('%s', (value, expected) => {
        expect(parseLooseDate(value, today)).toEqual(expected);
    });

    it('returns null when there is no date', () => {
        expect(parseLooseDate('not sure', today)).toBeNull();
    });
});
