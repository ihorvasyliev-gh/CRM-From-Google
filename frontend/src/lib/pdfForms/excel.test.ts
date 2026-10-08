import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { readXlsxLite } from './xlsxLite';
import { bestSheet, decodeText, findHeaderRow, readSheetFile, readWorkbook, sheetFrom, tableToSheet } from './excel';

/** A messy real-world workbook, built with exceljs (a dev dependency, for fixtures only) */
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

// ─── Files like "Active LDC LCGs": extracts without column names + the export they came from ───

const IRIS_HEADERS = ['Row Id', 'Token', 'Created', 'LCG ID', 'LCG Name', 'File Status', 'Lot', 'Date of Registration Meeting', 'LCG Type', 'LDC Staff member'];
const IRIS_ROWS = [
    ['a1', 't1', 'x', '66892', 'Cork Stroke Support Group', 'Open', 'Cork City (17-1)', new Date(Date.UTC(2018, 2, 28)), 'Health & wellbeing', 'Linda. McCarthy'],
    ['a2', 't2', 'x', '66894', 'Douglas Matters', 'Open', 'Cork City (17-1)', new Date(Date.UTC(2018, 1, 6)), 'Community/area focus', 'Linda. McCarthy'],
    ['a3', 't3', 'x', '66895', 'Mahon Family Resource Centre', 'Open', 'Cork City (17-1)', new Date(Date.UTC(2018, 0, 30)), 'Community/area focus', 'Linda. McCarthy'],
    ['a4', 't4', 'x', '71046', 'Shandon Men’s Shed', 'Open', 'Cork City (17-1)', new Date(Date.UTC(2023, 6, 8)), 'Community/area focus', 'Brenda. Barry'],
    ['a5', 't5', 'x', '71525', 'Dillons Cross Project', 'Open', 'Cork City (17-1)', new Date(Date.UTC(2023, 10, 6)), 'Target group focus', 'Brenda. Barry'],
];

async function irisWorkbook(mutate?: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    // A staff member's extract: no column names, three empty rows above, the same columns as the export
    const staff = wb.addWorksheet('Michelle Keane');
    staff.addRow([]);
    staff.addRow([]);
    staff.addRow([]);
    staff.addRow(IRIS_ROWS[0]);
    staff.addRow(IRIS_ROWS[1]);
    staff.addRow(IRIS_ROWS[2]);
    const other = wb.addWorksheet('Veronica Byrne');
    other.addRow(IRIS_ROWS[3]);
    other.addRow(IRIS_ROWS[4]);
    // The export itself, with column names
    const iris = wb.addWorksheet('Active LDC LCGs');
    iris.addRow(IRIS_HEADERS);
    iris.addRow([]);
    IRIS_ROWS.forEach(r => iris.addRow(r));
    mutate?.(wb);
    return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const asFile = (bytes: Uint8Array, name = 'Active LDC LCGs.xlsx') => new File([bytes as BlobPart], name);

describe('sheets without column names', () => {
    it('borrows the names of the sheet the answers came from', async () => {
        const book = await readWorkbook(asFile(await irisWorkbook()));
        const sheet = sheetFrom(book, 0);
        expect(sheet.headers.slice(3, 6)).toEqual(['LCG ID', 'LCG Name', 'File Status']);
        expect(sheet.rows).toHaveLength(3);
        expect(sheet.rows[0][4]).toBe('Cork Stroke Support Group');
        // Excel's row numbers, so people can find the row
        expect(sheet.rowNumbers).toEqual([4, 5, 6]);
        expect(sheet.namesFrom).toEqual({ kind: 'sheet', sheet: 'Active LDC LCGs', auto: true });
        expect(sheetFrom(book, 1).rows).toHaveLength(2);
    });

    it('leaves a sheet that has its own column names alone', async () => {
        const book = await readWorkbook(asFile(await irisWorkbook()));
        const sheet = sheetFrom(book, 2);
        expect(sheet.headers).toEqual(IRIS_HEADERS);
        expect(sheet.rows).toHaveLength(5);
        expect(sheet.namesFrom).toEqual({ kind: 'row', row: 1, auto: true });
    });

    it('also works when a sheet repeats the export’s names above its answers', async () => {
        const bytes = await irisWorkbook(wb => wb.getWorksheet('Michelle Keane')!.spliceRows(4, 0, IRIS_HEADERS));
        const book = await readWorkbook(asFile(bytes));
        const sheet = sheetFrom(book, 0);
        expect(sheet.headers).toEqual(IRIS_HEADERS);
        expect(sheet.rows).toHaveLength(3);
    });

    it('can be told where the names are', async () => {
        const book = await readWorkbook(asFile(await irisWorkbook()));
        expect(sheetFrom(book, 0, [], { kind: 'sheet', sheet: 2 }).headers[4]).toBe('LCG Name');
        const letters = sheetFrom(book, 0, [], { kind: 'none' });
        expect(letters.headers.slice(3, 6)).toEqual(['Column D', 'Column E', 'Column F']);
        expect(letters.rows).toHaveLength(3);
        expect(letters.namesFrom).toEqual({ kind: 'none' });
        const fromRow = sheetFrom(book, 2, [], { kind: 'row', row: 3 });
        expect(fromRow.headers[4]).toBe('Cork Stroke Support Group');
        expect(fromRow.rows).toHaveLength(4);
    });

    it('uses the borrowed names to pick the sheet that fits a form', async () => {
        const book = await readWorkbook(asFile(await irisWorkbook()));
        expect(bestSheet(book, ['LCG Name', 'LDC Staff member'])).toBe(2);
    });

    it('does not invent names for a lone headerless sheet: columns get their letters', () => {
        const sheet = tableToSheet([['5468738a', 'Cork Stroke', 'Open'], ['7f36fab6', 'Douglas', 'Open']], 'x.csv', { names: [] });
        expect(sheet.headers).toEqual(['Column A', 'Column B', 'Column C']);
        expect(sheet.rows).toHaveLength(2);
        expect(sheet.rowNumbers).toEqual([1, 2]);
    });
});

describe('files a strict reader rejects but Excel opens', () => {
    async function brokenStyles(): Promise<Uint8Array> {
        const PizZip = (await import('pizzip')).default;
        const zip = new PizZip(await irisWorkbook());
        // Damaged styles: Excel repairs this silently (exceljs used to throw on it)
        zip.file('xl/styles.xml', '<styleSheet><cellXfs><xf numFmtId="14"></cellXfs>');
        return zip.generate({ type: 'uint8array' });
    }

    it('reads every sheet despite damaged styles', async () => {
        const book = await readWorkbook(asFile(await brokenStyles()));
        expect(book.sheets.map(s => s.name)).toEqual(['Michelle Keane', 'Veronica Byrne', 'Active LDC LCGs']);
        expect(sheetFrom(book, 2).headers).toEqual(IRIS_HEADERS);
        expect(sheetFrom(book, 2).rows[1][4]).toBe('Douglas Matters');
        expect(sheetFrom(book, 0).rows).toHaveLength(3);
    });

    it('reads tables, data-validation messages and dates', async () => {
        const bytes = await irisWorkbook(wb => {
            const ws = wb.getWorksheet('Active LDC LCGs')!;
            for (let r = 3; r <= 7; r++) {
                ws.getCell(`E${r}`).dataValidation = { type: 'textLength', operator: 'lessThanOrEqual', formulae: [100], showInputMessage: true, promptTitle: 'Text (required)', prompt: 'Maximum Length: 100 characters.' };
            }
        });
        const lite = readXlsxLite(bytes);
        const iris = lite.find(s => s.name === 'Active LDC LCGs')!;
        expect(iris.table[0]).toEqual(IRIS_HEADERS);
        expect(iris.table[2][7]).toBe('28/03/2018');
        expect(iris.table[2][3]).toBe('66892');
        const book = await readWorkbook(asFile(bytes));
        expect(book.sheets[2].table.slice(0, 3)).toEqual(iris.table.slice(0, 3));
    });

    it('reads a sheet that is formatted to the very last row without hanging', async () => {
        const bytes = await irisWorkbook(wb => {
            const ws = wb.getWorksheet('Active LDC LCGs')!;
            ws.getCell('XFD1048576').style = { font: { bold: true } };
        });
        const book = await readWorkbook(asFile(bytes));
        expect(sheetFrom(book, 2).rows).toHaveLength(5);
    });

    it('says so when the file is not a workbook at all', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(readWorkbook(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'x.xlsx'))).rejects.toThrow(/could not be opened/);
        errors.mockRestore();
    });
});

describe('a workbook like the IRIS export: validations down to the last row', () => {
    /** Adds what Excel writes for "validate the whole column": ranges down to row 1,048,576 */
    async function withWholeColumnValidations(): Promise<Uint8Array> {
        const PizZip = (await import('pizzip')).default;
        const zip = new PizZip(await irisWorkbook(wb => wb.addWorksheet('hiddenSheet', { state: 'veryHidden' }).addRow(['Open', 'Closed'])));
        const path = 'xl/worksheets/sheet3.xml';
        const xml = zip.file(path)!.asText();
        const validations = '<dataValidations count="2">'
            + '<dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showInputMessage="1" promptTitle="Text (required)" prompt="Maximum Length: 100 characters." sqref="C3:C1048576"><formula1>100</formula1></dataValidation>'
            + '<dataValidation type="list" allowBlank="1" sqref="D3:E1048576 AF3:AH1048576 Z3:Z1048576"><formula1>"Open,Closed"</formula1></dataValidation>'
            + '</dataValidations>';
        zip.file(path, xml.replace('</sheetData>', `</sheetData>${validations}`));
        return zip.generate({ type: 'uint8array' });
    }

    it('opens the file at once, with every sheet, and leaves out the very hidden one', async () => {
        const started = Date.now();
        const book = await readWorkbook(asFile(await withWholeColumnValidations()));
        expect(Date.now() - started).toBeLessThan(5000);
        expect(book.sheets.map(s => s.name)).toEqual(['Michelle Keane', 'Veronica Byrne', 'Active LDC LCGs']);
        expect(sheetFrom(book, 2).rows).toHaveLength(5);
        expect(sheetFrom(book, 0).headers[4]).toBe('LCG Name');
    });
});
