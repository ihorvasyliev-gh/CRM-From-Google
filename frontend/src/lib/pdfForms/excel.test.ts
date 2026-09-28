import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { bestSheet, decodeText, findHeaderRow, readSheetFile, readWorkbook, sheetFrom, tableToSheet } from './excel';

/** A messy real-world workbook, built with exceljs */
async function messyWorkbook(): Promise<File> {
    const wb = new ExcelJS.Workbook();
    const notes = wb.addWorksheet('Read me');
    notes.addRow(['This export was made on 28/09/2026']);
    notes.addRow(['Ask Mary before sharing']);

    const reg = wb.addWorksheet('Registrations');
    reg.addRow(['Course registrations']);
    reg.addRow([]);
    reg.addRow(['Exported', new Date(Date.UTC(2026, 8, 28))]);
    reg.addRow(['Timestamp', 'First Name', 'Last Name', 'Date of Birth', 'Eircode']);
    reg.addRow([new Date(Date.UTC(2026, 8, 1)), 'Anna', 'Smith', new Date(Date.UTC(2003, 2, 3)), 'T12 T927']);
    reg.addRow([new Date(Date.UTC(2026, 8, 2)), 'Brian', 'Kelly', new Date(Date.UTC(1990, 6, 7)), { error: '#N/A' }]);
    const hidden = reg.addRow([new Date(Date.UTC(2026, 8, 3)), 'Ciara', 'Walsh', new Date(Date.UTC(1985, 0, 20)), 'T23 X1Y2']);
    hidden.hidden = true;
    reg.addRow(['Timestamp', 'First Name', 'Last Name', 'Date of Birth', 'Eircode']);
    reg.addRow([new Date(Date.UTC(2026, 8, 4)), 'Dara', 'Byrne', new Date(Date.UTC(1999, 11, 31)), 'P51 X768']);
    reg.addRow(['Total: 4']);

    const old = wb.addWorksheet('Old list', { state: 'hidden' });
    old.addRow(['First Name', 'Last Name', 'Date of Birth', 'Eircode', 'Timestamp']);
    for (let i = 0; i < 20; i++) old.addRow([`P${i}`, 'Old', '01/01/1970', 'X', '01/01/2020']);

    const buf = await wb.xlsx.writeBuffer();
    return new File([buf as ArrayBuffer], 'registrations.xlsx');
}

describe('reading messy spreadsheets', () => {
    it('keeps every sheet with data, and knows which are hidden', async () => {
        const book = await readWorkbook(await messyWorkbook());
        expect(book.sheets.map(s => [s.name, s.hidden])).toEqual([
            ['Read me', false],
            ['Registrations', false],
            ['Old list', true],
        ]);
    });

    it('finds the column names under a title, skips repeated names and totals, and reads dates', async () => {
        const book = await readWorkbook(await messyWorkbook());
        const sheet = sheetFrom(book, 1, ['First Name', 'Last Name', 'Date of Birth']);
        expect(sheet.headers).toEqual(['Timestamp', 'First Name', 'Last Name', 'Date of Birth', 'Eircode']);
        expect(sheet.rows.map(r => r[1])).toEqual(['Anna', 'Brian', 'Ciara', 'Dara']);
        expect(sheet.rows[0][3]).toBe('03/03/2003');
        expect(sheet.skippedRows).toBe(2);
        expect(sheet.rowNumbers).toEqual([5, 6, 7, 9]);
    });

    it('treats Excel errors as empty and remembers rows hidden by a filter', async () => {
        const book = await readWorkbook(await messyWorkbook());
        const sheet = sheetFrom(book, 1);
        expect(sheet.rows[1][4]).toBe('');
        expect(sheet.hiddenRows).toEqual([2]);
    });

    it('picks the visible sheet with the form’s columns over a hidden one with more rows', async () => {
        const book = await readWorkbook(await messyWorkbook());
        expect(bestSheet(book, ['First Name', 'Last Name', 'Date of Birth', 'Eircode'])).toBe(1);
        expect(bestSheet(book)).toBe(1);
        const sheet = await readSheetFile(await messyWorkbook(), ['First Name']);
        expect(sheet.sheetName).toBe('Registrations');
        expect(sheet.fileName).toBe('registrations.xlsx · Registrations');
    });
});

describe('findHeaderRow', () => {
    const table = [
        ['Registrations 2026'],
        ['Exported', '28/09/2026'],
        [],
        ['Name of Group', 'Contact Name', 'Email'],
        ['Shed', 'Pat Quinn', 'pat@x.ie'],
    ];

    it('skips titles and export dates', () => {
        expect(findHeaderRow(table)).toBe(3);
    });

    it('uses the form’s columns when it knows them', () => {
        const twoHeaders = [['Section A', 'Section B', 'Section C'], ...table.slice(3)];
        expect(findHeaderRow(twoHeaders, ['Contact Name', 'Email'])).toBe(1);
    });

    it('builds rows under the found column names', () => {
        const sheet = tableToSheet(table, 'x.csv');
        expect(sheet.rows).toEqual([['Shed', 'Pat Quinn', 'pat@x.ie']]);
        expect(sheet.rowNumbers).toEqual([5]);
    });
});

describe('decodeText', () => {
    it('reads UTF-8 and falls back to the Windows encoding Excel uses for CSV', () => {
        expect(decodeText(new TextEncoder().encode('Seán,Ó Briain'))).toBe('Seán,Ó Briain');
        // "Seán" in Windows-1252: á = 0xE1
        expect(decodeText(new Uint8Array([0x53, 0x65, 0xe1, 0x6e]))).toBe('Seán');
    });

    it('explains a password-protected file', async () => {
        const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        await expect(readWorkbook(new File([ole], 'locked.xlsx'))).rejects.toThrow(/password/);
    });
});
