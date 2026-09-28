import { describe, expect, it } from 'vitest';
import { readSheetFile } from './excel';
import { clearWinner, rankTemplates } from './pick';
import { DEFAULT_SETTINGS, type FormField, type PdfFormTemplate } from './types';

const text = (source: string): FormField => ({ id: source, kind: 'text', name: source, source, rect: { page: 0, x: 0, y: 0, w: 10, h: 10 }, fontSize: 10, multiline: false, align: 'left' });
const template = (id: string, sources: string[]): PdfFormTemplate => ({
    id,
    name: id,
    description: null,
    pdf_path: `${id}.pdf`,
    pdf_name: `${id}.pdf`,
    revision: 1,
    fields: sources.map(text),
    column_aliases: {},
    settings: DEFAULT_SETTINGS,
    created_at: '',
    updated_at: '',
});

const co = template('CO', ['{Name of Group}', '{Contact Name|first}', '{Postal Address}', '{Eircode}']);
const person = template('Individual', ['{First Name}', '{Last Name}', '{Date of Birth|dd}', '{Eircode}']);

describe('choosing the form for a spreadsheet', () => {
    it('ranks forms by how many of their columns the spreadsheet has', () => {
        const fits = rankTemplates([co, person], ['Timestamp', 'First Name', 'Last Name', 'Date of Birth', 'Eircode']);
        expect(fits.map(f => [f.template.id, f.found, f.total])).toEqual([
            ['Individual', 4, 4],
            ['CO', 1, 4],
        ]);
        expect(clearWinner(fits)?.id).toBe('Individual');
    });

    it('asks when two forms fit about as well, or none fits', () => {
        expect(clearWinner(rankTemplates([co, person], ['Eircode', 'Name of Group', 'First Name']))).toBeNull();
        expect(clearWinner(rankTemplates([co, person], ['Colour']))).toBeNull();
    });

    it('opens the only form when the spreadsheet fits it', () => {
        expect(clearWinner(rankTemplates([co], ['Name of Group', 'Contact Name', 'Postal Address', 'Eircode']))?.id).toBe('CO');
    });
});

describe('readSheetFile', () => {
    it('explains how to convert an old .xls file', async () => {
        await expect(readSheetFile(new File(['x'], 'people.xls'))).rejects.toThrow(/Save As/);
    });

    it('reads a CSV file', async () => {
        const sheet = await readSheetFile(new File(['First Name,Last Name\nAnna,Smith\n'], 'people.csv'));
        expect(sheet.rows).toEqual([['Anna', 'Smith']]);
    });
});
