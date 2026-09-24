// ─── Contact list import (IRIS exports, Excel/CSV, pasted rows) ─────
// Turns a spreadsheet into contacts for an outreach list. Columns are found
// by their header text, so the column order of the export does not matter.

export interface ImportedContact {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    external_ref: string | null;
}

export interface ParsedContacts {
    rows: ImportedContact[];
    /** Rows whose email already appeared earlier in the same file */
    duplicatesInFile: number;
    /** Non-empty rows without a usable email address */
    missingEmail: number;
}

type Field = 'email' | 'first_name' | 'last_name' | 'full_name' | 'phone' | 'external_ref';

const EMAIL_RE = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/;

/** How many rows from the top to scan for the header row (exports often start with a title). */
const HEADER_SCAN_ROWS = 15;

function normalizeHeader(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerField(raw: string): Field | null {
    const h = normalizeHeader(raw);
    if (!h) return null;
    if (h.includes('email')) return 'email';
    if (['firstname', 'forename', 'forenames', 'givenname', 'first'].includes(h)) return 'first_name';
    if (['lastname', 'surname', 'familyname', 'secondname', 'last'].includes(h)) return 'last_name';
    if (h.includes('phone') || h.includes('mobile') || ['tel', 'telephone', 'contactnumber'].includes(h)) return 'phone';
    if (h.startsWith('iris') || ['id', 'ref', 'reference', 'uniqueid', 'participantid', 'participantref', 'participantnumber', 'clientid', 'clientref', 'clientnumber'].includes(h)) {
        return 'external_ref';
    }
    if (['name', 'fullname', 'participant', 'participantname', 'client', 'clientname'].includes(h)) return 'full_name';
    return null;
}

/** Map of field → column index, taken from the first row that has an email header. */
function findHeader(table: string[][]): { headerRow: number; columns: Partial<Record<Field, number>> } | null {
    for (let r = 0; r < Math.min(table.length, HEADER_SCAN_ROWS); r++) {
        const columns: Partial<Record<Field, number>> = {};
        table[r].forEach((cell, c) => {
            const field = headerField(cell);
            if (field && columns[field] === undefined) columns[field] = c;
        });
        if (columns.email !== undefined) return { headerRow: r, columns };
    }
    return null;
}

/** "Smith, Anna" → Anna Smith; "Anna Maria Smith" → Anna / Maria Smith */
export function splitFullName(full: string): { first_name: string; last_name: string } {
    const value = full.trim().replace(/\s+/g, ' ');
    if (value.includes(',')) {
        const [last, ...rest] = value.split(',');
        return { first_name: rest.join(' ').trim(), last_name: last.trim() };
    }
    const [first = '', ...rest] = value.split(' ');
    return { first_name: first, last_name: rest.join(' ') };
}

export function extractEmail(value: string): string | null {
    const match = value.match(EMAIL_RE);
    return match ? match[0].toLowerCase() : null;
}

/** Turn a table of cells (first rows may be a title) into contacts. */
export function tableToContacts(table: string[][]): ParsedContacts {
    const header = findHeader(table);
    if (!header) {
        throw new Error('Could not find an "Email" column. Make sure the file has a header row with an Email column.');
    }

    const { headerRow, columns } = header;
    const cell = (row: string[], field: Field) => {
        const index = columns[field];
        return index === undefined ? '' : (row[index] ?? '').trim();
    };

    const seen = new Set<string>();
    const rows: ImportedContact[] = [];
    let duplicatesInFile = 0;
    let missingEmail = 0;

    for (const row of table.slice(headerRow + 1)) {
        if (row.every(value => !value || !value.trim())) continue;

        const email = extractEmail(cell(row, 'email'));
        if (!email) {
            missingEmail++;
            continue;
        }
        if (seen.has(email)) {
            duplicatesInFile++;
            continue;
        }
        seen.add(email);

        let firstName = cell(row, 'first_name');
        let lastName = cell(row, 'last_name');
        if (!firstName && !lastName && columns.full_name !== undefined) {
            ({ first_name: firstName, last_name: lastName } = splitFullName(cell(row, 'full_name')));
        }

        rows.push({
            first_name: firstName,
            last_name: lastName,
            email,
            phone: cell(row, 'phone') || null,
            external_ref: cell(row, 'external_ref') || null,
        });
    }

    return { rows, duplicatesInFile, missingEmail };
}

/** Parse CSV / TSV text (quoted fields, "" escapes, newlines inside quotes). */
export function parseDelimitedText(text: string): string[][] {
    const input = text.replace(/^\uFEFF/, '');
    const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
    const count = (ch: string) => firstLine.split(ch).length - 1;
    const delimiter = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';

    const table: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"' && field === '') {
            inQuotes = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && input[i + 1] === '\n') i++;
            row.push(field);
            table.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        table.push(row);
    }
    return table;
}

/** Read the first non-empty worksheet of an .xlsx file as text cells. */
export async function readXlsxTable(data: ArrayBuffer): Promise<string[][]> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);

    const sheet = workbook.worksheets.find(ws => ws.rowCount > 0);
    if (!sheet) return [];

    const table: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
            cells.push(row.getCell(c).text ?? '');
        }
        table.push(cells);
    }
    return table;
}

export async function parseContactsFile(file: File): Promise<ParsedContacts> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) {
        return tableToContacts(await readXlsxTable(await file.arrayBuffer()));
    }
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        return tableToContacts(parseDelimitedText(await file.text()));
    }
    if (name.endsWith('.xls')) {
        throw new Error('Old .xls files are not supported. Open the file in Excel and save it as .xlsx or .csv.');
    }
    throw new Error('Please choose an .xlsx or .csv file.');
}
