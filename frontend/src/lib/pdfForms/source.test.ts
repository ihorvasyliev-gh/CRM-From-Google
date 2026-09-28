import { describe, expect, it } from 'vitest';
import { describeSource, evaluateSource, matchColumns, parseLooseDate, parsePlaceholders, placeholderFor, simpleSource, sourceColumns, summarizeSource, unreadableDates } from './source';

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

describe('new behaviour for forms filled from registration spreadsheets', () => {
    const headers2 = ['Postal Address', 'Eircode', 'Date of Birth'];
    const cols = matchColumns(['Postal Address', 'Eircode', 'Date of Birth'], headers2);
    const ev = (source: string, row: string[]) => evaluateSource(source, { row, columns: cols, rowNumber: 2, today: new Date(2026, 8, 28), user: 'Anna Staff' });

    it('prints the signed-in person for {user}', () => {
        expect(ev('{user}', [])).toBe('Anna Staff');
    });

    it('adds a value only when the text before it does not have it yet', () => {
        expect(ev('{Postal Address}, {Eircode|new}', ['1a Glenfields Park, Cork', 'T23 PW68'])).toBe('1a Glenfields Park, Cork, T23 PW68');
        expect(ev('{Postal Address}, {Eircode|new}', ['Unit 7, T12EP46, Cork', 'T12 EP46'])).toBe('Unit 7, T12EP46, Cork');
    });

    it('drops separators left by empty values', () => {
        expect(ev('{Postal Address}, {Eircode}', ['', 'T23 PW68'])).toBe('T23 PW68');
        expect(ev('{Postal Address}, {Eircode}', ['Cork', ''])).toBe('Cork');
    });

    it('refuses impossible dates instead of guessing', () => {
        expect(parseLooseDate('11/19/0001')).toBeNull();
        expect(parseLooseDate('31/02/2001')).toBeNull();
        expect(parseLooseDate('8/16/0079')).toBeNull();
        expect(ev('{Date of Birth|dd}', ['', '', '11/19/0001'])).toBe('');
    });

    it('lists values a date filter could not read', () => {
        expect(unreadableDates('{Date of Birth|dd}/{Date of Birth|mm}', { row: ['', '', '11/19/0001'], columns: cols, rowNumber: 2 })).toEqual(['11/19/0001']);
        expect(unreadableDates('{Date of Birth|dd}', { row: ['', '', '03/03/2003'], columns: cols, rowNumber: 2 })).toEqual([]);
    });
});

describe('plain-language descriptions of a value', () => {
    it('describes columns, today / your name and fixed text', () => {
        expect(summarizeSource('{Contact Name|first}')).toBe('Contact Name (first name)');
        expect(summarizeSource('{today|dd}')).toBe("Today's date (day)");
        expect(summarizeSource('{user}')).toBe('Your name');
        expect(summarizeSource('{Postal Address}, {Eircode|new}')).toBe('Postal Address + Eircode (if not already there)');
        expect(summarizeSource('Local community group')).toBe('Always “Local community group”');
        expect(summarizeSource('')).toBe('No value yet');
    });

    it('splits a value into chips', () => {
        expect(describeSource('Dear {First Name|upper}!')).toEqual([
            { kind: 'text', label: 'Dear' },
            { kind: 'column', label: 'First Name', detail: 'capitals' },
            { kind: 'text', label: '!' },
        ]);
    });

    it('tells simple values (for the point-and-click editor) from combined ones', () => {
        expect(simpleSource('')).toEqual({ kind: 'empty' });
        expect(simpleSource('{Email}')).toEqual({ kind: 'column', column: 'Email', filter: '' });
        expect(simpleSource('{Date of Birth|dd}')).toEqual({ kind: 'column', column: 'Date of Birth', filter: 'dd' });
        expect(simpleSource('Cork')).toEqual({ kind: 'fixed', text: 'Cork' });
        expect(simpleSource('{A}, {B}')).toEqual({ kind: 'combined' });
        expect(simpleSource('{A|first|upper}')).toEqual({ kind: 'combined' });
    });
});
