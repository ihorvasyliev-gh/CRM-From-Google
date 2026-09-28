import { describe, expect, it } from 'vitest';
import { autoMapTemplate, saysSelectOne } from './autoMap';
import { tableToSheet } from './excel';
import { applyOverrides, planRows, safeFileName, templateColumns } from './plan';
import { matchColumns } from './source';
import { makeLayout } from './testLayout';
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
        expect(s.headers).toEqual(['A', 'A (2)', 'Column 3']);
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
        expect(plans[0].notes.map(n => n.message)).toEqual(['One option only: ticked "Travellers", left out "Refugees"']);
        expect(plans[1].notes[0].message).toMatch(/No box matches "Company Limited by Guarantee"/);
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
