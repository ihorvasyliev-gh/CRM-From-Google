import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseDelimitedText, readXlsxTable, splitFullName, tableToContacts, extractEmail } from './contactImport';

describe('contactImport', () => {
    describe('parseDelimitedText', () => {
        it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
            const csv = '\uFEFFName,Email\r\n"Smith, Anna","anna@x.ie"\r\n"Say ""hi""\nthere",b@x.ie\n';
            expect(parseDelimitedText(csv)).toEqual([
                ['Name', 'Email'],
                ['Smith, Anna', 'anna@x.ie'],
                ['Say "hi"\nthere', 'b@x.ie'],
            ]);
        });

        it('detects semicolon and tab separators', () => {
            expect(parseDelimitedText('First;Email\nAnna;a@x.ie')).toEqual([['First', 'Email'], ['Anna', 'a@x.ie']]);
            expect(parseDelimitedText('First\tEmail\nAnna\ta@x.ie')).toEqual([['First', 'Email'], ['Anna', 'a@x.ie']]);
        });
    });

    describe('tableToContacts', () => {
        it('finds columns by header, even below a title row', () => {
            const result = tableToContacts([
                ['Action 11 participants report'],
                [],
                ['IRIS ID', 'Surname', 'Forename', 'Mobile Phone', 'Email Address'],
                ['1001', 'Smith', 'Anna', '087 123 4567', ' Anna@Example.IE '],
                ['1002', 'Kovalenko', 'Olga', '', 'olga@example.ie'],
            ]);
            expect(result.rows).toEqual([
                { first_name: 'Anna', last_name: 'Smith', email: 'anna@example.ie', phone: '087 123 4567', external_ref: '1001' },
                { first_name: 'Olga', last_name: 'Kovalenko', email: 'olga@example.ie', phone: null, external_ref: '1002' },
            ]);
        });

        it('splits a full name column', () => {
            const result = tableToContacts([
                ['Participant Name', 'E-mail'],
                ['Anna Maria Smith', 'a@x.ie'],
                ['Kovalenko, Olga', 'o@x.ie'],
            ]);
            expect(result.rows.map(r => [r.first_name, r.last_name])).toEqual([
                ['Anna', 'Maria Smith'],
                ['Olga', 'Kovalenko'],
            ]);
        });

        it('counts duplicates and rows without email, and skips blank rows', () => {
            const result = tableToContacts([
                ['First Name', 'Email'],
                ['Anna', 'anna@x.ie'],
                ['Anna again', 'ANNA@x.ie'],
                ['No email', ''],
                ['Bad email', 'not-an-email'],
                ['', ''],
            ]);
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].first_name).toBe('Anna');
            expect(result.duplicatesInFile).toBe(1);
            expect(result.missingEmail).toBe(2);
        });

        it('throws a clear error when there is no email column', () => {
            expect(() => tableToContacts([['Name', 'Phone'], ['Anna', '087']])).toThrow(/Email/);
        });
    });

    it('extractEmail takes the address out of "Name <email>" and lists', () => {
        expect(extractEmail('Anna Smith <Anna@X.ie>')).toBe('anna@x.ie');
        expect(extractEmail('a@x.ie; b@y.ie')).toBe('a@x.ie');
        expect(extractEmail('n/a')).toBeNull();
    });

    it('splitFullName handles a single word', () => {
        expect(splitFullName('Anna')).toEqual({ first_name: 'Anna', last_name: '' });
    });

    it('reads an .xlsx file', async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Report');
        sheet.addRow(['First Name', 'Last Name', 'Email']);
        sheet.addRow(['Anna', 'Smith', { text: 'anna@x.ie', hyperlink: 'mailto:anna@x.ie' }]);
        sheet.addRow([12345, 'Number', 'n@x.ie']);
        const buffer = await workbook.xlsx.writeBuffer();

        const table = await readXlsxTable(buffer as ArrayBuffer);
        const result = tableToContacts(table);
        expect(result.rows.map(r => [r.first_name, r.last_name, r.email])).toEqual([
            ['Anna', 'Smith', 'anna@x.ie'],
            ['12345', 'Number', 'n@x.ie'],
        ]);
    });
});
