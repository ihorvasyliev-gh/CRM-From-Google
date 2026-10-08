import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { sheetName, styledTable, xlsxBlob } from './excelExport';
import { readXlsxLite } from './pdfForms/xlsxLite';

async function unzip(blob: Blob): Promise<PizZip> {
    return new PizZip(new Uint8Array(await blob.arrayBuffer()));
}

describe('excelExport', () => {
    it('writes a styled table that reads back cell for cell', async () => {
        const blob = await xlsxBlob([
            styledTable('Participants', ['First name', 'Course', 'Places'], [
                ['Anna', 'Barista Training', 12],
                ['Brian', null, 3],
            ]),
        ]);
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        const [sheet] = readXlsxLite(await blob.arrayBuffer());
        expect(sheet.name).toBe('Participants');
        expect(sheet.table).toEqual([
            ['First name', 'Course', 'Places'],
            ['Anna', 'Barista Training', '12'],
            ['Brian', '', '3'],
        ]);
    });

    it('adds header filter buttons, a frozen header and fitted column widths', async () => {
        const blob = await xlsxBlob([
            styledTable('Plain', ['A'], [['x']]),
            styledTable("Mary's list", ['Name', 'Email'], [['Anna', 'anna@example.ie']], { filter: true }),
        ]);
        const zip = await unzip(blob);
        const filtered = zip.file('xl/worksheets/sheet2.xml')!.asText();
        expect(filtered).toContain('<autoFilter ref="A1:B1"/>');
        expect(filtered.indexOf('<autoFilter')).toBeGreaterThan(filtered.indexOf('</sheetData>'));
        expect(filtered).toMatch(/<pane [^>]*ySplit="1"/);
        expect(filtered).toMatch(/<col [^>]*width="14"/);
        expect(zip.file('xl/worksheets/sheet1.xml')!.asText()).not.toContain('autoFilter');
        expect(zip.file('xl/workbook.xml')!.asText()).toContain(
            `<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Mary''s list'!$A$1:$B$1</definedName>`
        );
    });

    it('cleans tab names the way Excel needs them', () => {
        expect(sheetName('Q1/Q2: [draft]?')).toBe('Q1_Q2_ _draft__');
        expect(sheetName('A very long course name that goes on and on')).toHaveLength(31);
        expect(sheetName('   ', 'Roster')).toBe('Roster');
    });

    it('writes formula-looking answers as typed, in the Text format so editing never runs them', async () => {
        const blob = await xlsxBlob([styledTable('People', ['Name', 'Phone'], [['=HYPERLINK("x")', '+353871234567'], ['Anna', '0871234567']])]);
        const [sheet] = readXlsxLite(await blob.arrayBuffer());
        expect(sheet.table.slice(1)).toEqual([['=HYPERLINK("x")', '+353871234567'], ['Anna', '0871234567']]);

        const zip = await unzip(blob);
        const styles = zip.file('xl/styles.xml')!.asText();
        const xfs = [...styles.slice(styles.indexOf('<cellXfs')).matchAll(/<xf [^>]*>/g)].map(m => /numFmtId="(\d+)"/.exec(m[0])?.[1] ?? '0');
        const textFormats = new Set([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="@"/g)].map(m => m[1]).concat('49'));
        const styleOf = (ref: string) => Number(new RegExp(`<c r="${ref}"[^>]* s="(\\d+)"`).exec(zip.file('xl/worksheets/sheet1.xml')!.asText())?.[1]);
        expect(textFormats.has(xfs[styleOf('A2')])).toBe(true);
        expect(textFormats.has(xfs[styleOf('B2')])).toBe(true);
        expect(textFormats.has(xfs[styleOf('A3')])).toBe(false);
    });
});
