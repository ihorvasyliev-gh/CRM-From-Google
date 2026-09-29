import { describe, expect, it } from 'vitest';
import { autoMapTemplate, saysSelectOne } from './autoMap';
import { tableToSheet } from './excel';
import { applyOverrides, defaultNamePattern, planRows, safeFileName, templateColumns } from './plan';
import { matchColumns } from './source';
import { makeLayout } from './testLayout';
import { buildLayout } from './layout';
import { DEFAULT_SETTINGS, type ChoiceField, type TextField } from './types';

const sheet = tableToSheet(
    [
        ['Id', 'Name of Group', 'Contact Name', 'SICAP Target Groups', 'Contact again?'],
        ['', '', '', '', ''],
        ['1', 'Blackpool Men’s Shed', 'Patrick Quinn', 'Travellers;Refugees', 'Yes'],
        ['2', 'Blackpool Men’s Shed', 'Anna Smith', 'Company Limited by Guarantee', 'no'],
    ],
    'orgs.xlsx',
);

describe('tableToSheet', () => {
    it('finds the header row, skips empty rows and keeps spreadsheet row numbers', () => {
        expect(sheet.headers).toEqual(['Id', 'Name of Group', 'Contact Name', 'SICAP Target Groups', 'Contact again?']);
        expect(sheet.rows).toHaveLength(2);
        expect(sheet.rowNumbers).toEqual([3, 4]);
    });

    it('skips a title above the header and names blank / repeated headers', () => {
        const s = tableToSheet([['Report'], ['A', 'A', ''], ['1', '2', '3']], 'x.csv');
        expect(s.headers).toEqual(['A', 'A (2)', 'Column C']);
        expect(s.rows).toEqual([['1', '2', '3']]);
    });
});

describe('autoMapTemplate', () => {
    const layout = makeLayout();
    const fields = autoMapTemplate(layout, sheet);

    it('maps names, a group name and checkbox columns, and skips form-export ids', () => {
        const summary = fields.map(f => `${f.kind}:${f.name}<=${f.source}`);
        expect(summary).toContain('text:CO Name<={Name of Group}');
        expect(summary).toContain('text:First Name<={Contact Name|first}');
        expect(summary).toContain('text:Last Name<={Contact Name|last}');
        expect(summary.some(s => s.startsWith('choice:SICAP Target Groups'))).toBe(true);
        expect(fields.some(f => f.source === '{Id}')).toBe(false);
    });

    it('reads "(select one option)" from the PDF', () => {
        const choice = fields.find((f): f is ChoiceField => f.kind === 'choice')!;
        expect(choice.single).toBe(true);
        expect(saysSelectOne(layout.checkboxes.filter(c => c.label === 'Yes'), layout)).toBe(false);
    });

    it('does not guess which Yes / No question a column answers', () => {
        expect(fields.some(f => f.source === '{Contact again?}')).toBe(false);
    });
});

describe('planRows', () => {
    const layout = makeLayout();
    const fields = autoMapTemplate(layout, sheet);
    const columns = matchColumns(templateColumns(fields, DEFAULT_SETTINGS), sheet.headers);
    const plans = planRows(fields, DEFAULT_SETTINGS, sheet, columns, 'CO form');

    it('names files after the first text field and keeps names unique', () => {
        expect(plans.map(p => p.fileName)).toEqual(['Blackpool Men’s Shed.pdf', 'Blackpool Men’s Shed (2).pdf']);
        expect(plans[0].title).toBe('Blackpool Men’s Shed');
    });

    it('warns about extra answers for one-option questions and unknown answers', () => {
        expect(plans[0].notes.map(n => n.message)).toEqual(['The form allows one answer: “Travellers” is ticked, not “Refugees”']);
        expect(plans[1].notes[0].message).toMatch(/No box on the form for “Company Limited by Guarantee”/);
    });

    it('lets manual edits replace values and clear their warnings', () => {
        const choice = fields.find(f => f.kind === 'choice')!;
        const edited = applyOverrides(plans[1], { [choice.id]: { kind: 'choice', ticked: [] } });
        expect(edited.notes).toEqual([]);
        expect(edited.values[choice.id]).toEqual({ kind: 'choice', ticked: [] });
        const name = fields.find((f): f is TextField => f.kind === 'text')!;
        expect(plans[0].values[name.id]).toEqual({ kind: 'text', text: 'Blackpool Men’s Shed' });
    });

    it('makes file names safe', () => {
        expect(safeFileName('a/b:c*?"<>|d\u0001e')).toBe('a b c d e');
    });
});

describe('autoMapTemplate: office fields, dates, Eircode, free text', () => {
    const t = (x: number, y: number, str: string, w = str.length * 5.2) => ({ page: 0, x, y, str, w, h: 10.5 });
    const line = (x: number, y: number, w: number, h: number) => ({ page: 0, x, y, w, h });
    const layout = buildLayout(
        [{ w: 595, h: 842 }],
        [
            t(22, 800, 'LDC Staff Member'),
            t(22, 770, 'Date of Registration'),
            t(155, 770, '______/_______/20', 98),
            t(22, 700, 'CO Name'),
            t(22, 670, 'CO Address'),
            t(22, 600, 'Date your LCG was'),
            t(22, 588, 'established?'),
            t(171, 588, '_____/_________/________', 120),
            t(22, 480, 'Describe the social'),
            t(22, 466, 'inclusion remit of'),
        ],
        [
            // Staff row, CO name / address rows
            line(18, 790, 559, 0.5), line(18, 815, 559, 0.5), line(18, 790, 0.5, 25), line(140, 790, 0.5, 25), line(577, 790, 0.5, 25),
            line(18, 690, 559, 0.5), line(18, 715, 559, 0.5), line(18, 655, 559, 0.5),
            line(18, 655, 0.5, 60), line(108, 655, 0.5, 60), line(577, 655, 0.5, 60),
            // "Describe" block: tall label cell beside 4 ruled lines
            line(18, 400, 559, 0.5), line(18, 500, 559, 0.5), line(18, 400, 0.5, 100), line(140, 400, 0.5, 100), line(577, 400, 0.5, 100),
            ...[425, 450, 475].map(y => line(140, y, 437, 0.5)),
        ],
    );
    const sheet2 = tableToSheet(
        [
            ['Name of Group', 'Postal Address for Local Community Group', 'Eircode', 'How long has the group been in existence?', 'Please give a brief description of your activities'],
            ['Shed', '90 Great William O’Brien St', 'T23 TR7A', '2019', 'Group meetings, making garden furniture for the community and helping at the Christmas market.'],
        ],
        'orgs.csv',
    );
    const fields = autoMapTemplate(layout, sheet2);
    const by = (name: string) => fields.find(f => f.name === name) as TextField | undefined;

    it('fills the registration date with today and the staff member with the user', () => {
        expect(by('Date of Registration (day)')?.source).toBe('{today|dd}');
        expect(by('Date of Registration (year)')?.source).toBe('{today|yy}');
        expect(by('LDC Staff Member')?.source).toBe('{user}');
    });

    it('matches a date blank to a column about the same thing', () => {
        expect(by('Date your LCG was established? (year)')?.source).toBe('{How long has the group been in existence?|yyyy}');
    });

    it('adds the Eircode to the address when the form has no Eircode box', () => {
        expect(by('CO Address')?.source).toBe('{Postal Address for Local Community Group}, {Eircode|new}');
    });

    it('writes a long description between the rules of the "Describe" box', () => {
        const describe = fields.find((f): f is TextField => f.kind === 'text' && f.name.startsWith('Describe'))!;
        expect(describe.source).toBe('{Please give a brief description of your activities}');
        expect(describe.lines).toBe(4);
        expect(describe.rules).toHaveLength(3);
    });

    it('names a person\'s form "First Last"', () => {
        const people = tableToSheet([['First Name', 'Last Name'], ['Anna', 'Smith']], 'p.csv');
        const f: TextField[] = [
            { id: 'a', kind: 'text', name: 'First Name', source: '{First Name}', rect: { page: 0, x: 0, y: 0, w: 10, h: 10 }, fontSize: 10, multiline: false, align: 'left' },
            { id: 'b', kind: 'text', name: 'Last Name', source: '{Last Name}', rect: { page: 0, x: 0, y: 0, w: 10, h: 10 }, fontSize: 10, multiline: false, align: 'left' },
        ];
        const cols = matchColumns(templateColumns(f, DEFAULT_SETTINGS), people.headers);
        expect(planRows(f, DEFAULT_SETTINGS, people, cols, 'Individual')[0].fileName).toBe('Anna Smith.pdf');
    });
});

describe('what forms are named after', () => {
    const tf = (name: string, source: string): TextField => ({ id: name, kind: 'text', name, source, rect: { page: 0, x: 0, y: 0, w: 10, h: 10 }, fontSize: 10, multiline: false, align: 'left' });

    it('never uses a date or part of one, even when it comes first on the form', () => {
        const fields = [tf('Date of Registration (day)', '{Timestamp|dd}'), tf('Date of Registration (month)', '{Timestamp|mm}'), tf('First Name', '{First Name}'), tf('Last Name', '{Last Name}')];
        expect(defaultNamePattern(fields)).toBe('{First Name} {Last Name}');
        const people = tableToSheet([['Timestamp', 'First Name', 'Last Name'], ['08/01/2025', 'Sayed', 'Ghazanfar']], 'p.csv');
        const plan = planRows(fields, DEFAULT_SETTINGS, people, matchColumns(templateColumns(fields, DEFAULT_SETTINGS), people.headers), 'Individual')[0];
        expect(plan.title).toBe('Sayed Ghazanfar');
        expect(plan.fileName).toBe('Sayed Ghazanfar.pdf');
    });

    it('prefers a group’s name to its contact person', () => {
        expect(defaultNamePattern([tf('First Name', '{Contact Name|first}'), tf('Last Name', '{Contact Name|last}'), tf('CO Name', '{Name of Group}')])).toBe('{Name of Group}');
    });

    it('uses the name chosen for the form, for the file and the list alike', () => {
        const fields = [tf('First Name', '{First Name}'), tf('Email', '{Email}')];
        const people = tableToSheet([['First Name', 'Email'], ['Anna', 'anna@x.ie']], 'p.csv');
        const settings = { ...DEFAULT_SETTINGS, fileName: '{Email}' };
        const plan = planRows(fields, settings, people, matchColumns(templateColumns(fields, settings), people.headers), 'F')[0];
        expect(plan.title).toBe('anna@x.ie');
        expect(plan.fileName).toBe('anna@x.ie.pdf');
    });
});
