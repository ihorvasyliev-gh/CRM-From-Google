import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import {
    fieldLabel, initialPerPerson, isBlankRow, newRow, parsePeople, pasteInto, personData, personFileBase, templateFields, uniqueNames,
} from './fields';
import { fillTemplate, fillTemplateForAll, templateTags } from '../documentRender';
import { makeWord, templateBase } from './output';

/** A minimal .docx whose body is one paragraph per line. */
function makeDocx(...lines: string[]): ArrayBuffer {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    const body = lines.map(l => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`).join('');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
    return zip.generate({ type: 'arraybuffer' });
}

const text = (bytes: ArrayBuffer | Blob) => (async () => {
    const buf = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes;
    const xml = new PizZip(buf).file('word/document.xml')!.asText();
    return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('|');
})();

describe('fieldLabel', () => {
    it('names the usual tags and spells out the rest', () => {
        expect(fieldLabel('firstName')).toBe('First name');
        expect(fieldLabel('expire')).toBe('Expiry date');
        expect(fieldLabel('courseMonth')).toBe('Course month');
        expect(fieldLabel('venue_name')).toBe('Venue name');
        expect(fieldLabel('PPSNumber')).toBe('Pps number');
    });
});

describe('templateFields', () => {
    it('works out the course month from the course date, and the expiry once a length is chosen', () => {
        const tags = ['firstName', 'courseDate', 'courseMonth', 'expire', 'certNo'];
        const own = templateFields(tags, initialPerPerson(tags));
        expect(own.shared).toEqual(['courseDate', 'expire', 'certNo']);
        expect(own.derived).toEqual(['courseMonth']);
        expect(own.numbered).toEqual(['certNo']);
        expect(own.validityMonths).toBeNull();

        const counted = templateFields(tags, initialPerPerson(tags), 24);
        expect(counted.shared).toEqual(['courseDate', 'certNo']);
        expect(counted.derived).toEqual(['courseMonth', 'expire']);
        const row = newRow({ firstName: 'Ann' });
        expect(personData(row, counted, { courseDate: '21/09/2026', certNo: 'C-01' }, 1)).toEqual({
            courseDate: '21/09/2026', certNo: 'C-02', firstName: 'Ann', courseMonth: 'September 2026', expire: '21/09/2028',
        });
    });

    it("counts the expiry from each person's own course date", () => {
        const tags = ['firstName', 'courseDate', 'expire'];
        const f = templateFields(tags, new Set([...initialPerPerson(tags), 'courseDate']), 12);
        expect(f.columns).toEqual(['firstName', 'courseDate']);
        expect(personData(newRow({ firstName: 'Ann', courseDate: '2/3/2026' }), f, {}).expire).toBe('02/03/2027');
    });

    it('asks for the course month when there is no course date', () => {
        const f = templateFields(['firstName', 'courseMonth', 'expire'], new Set(['firstName']), 36);
        expect(f.shared).toEqual(['courseMonth', 'expire']);
        expect(f.validityMonths).toBeNull();
    });

    const tags = ['firstName', 'lastName', 'fullName', 'courseDate', 'tutor'];

    it('asks names per person, the rest once, and makes the full name from the parts', () => {
        const f = templateFields(tags, initialPerPerson(tags));
        expect(f.columns).toEqual(['firstName', 'lastName']);
        expect(f.shared).toEqual(['courseDate', 'tutor']);
        expect(f.derived).toEqual(['fullName']);
    });

    it('moves a field switched to each person into the table', () => {
        const f = templateFields(tags, new Set([...initialPerPerson(tags), 'tutor']));
        expect(f.columns).toEqual(['firstName', 'lastName', 'tutor']);
        expect(f.shared).toEqual(['courseDate']);
    });

    it('asks the full name when the template has no first or last name', () => {
        const f = templateFields(['fullName', 'courseMonth'], initialPerPerson(['fullName', 'courseMonth']));
        expect(f.columns).toEqual(['fullName']);
        expect(f.derived).toEqual([]);
    });
});

describe('parsePeople', () => {
    const columns = ['firstName', 'lastName'];

    it('splits a plain line at the first space and keeps the rest as the surname', () => {
        expect(parsePeople("Hadgu Gebremikel\n\n  Seán   Ó Briain \r\nMadonna", columns)).toEqual([
            { firstName: 'Hadgu', lastName: 'Gebremikel' },
            { firstName: 'Seán', lastName: 'Ó Briain' },
            { firstName: 'Madonna' },
        ]);
    });

    it('takes Excel cells in column order', () => {
        expect(parsePeople('Mary Kate\tO\'Brien\tAnne\nJohn\tMurphy', [...columns, 'tutor'])).toEqual([
            { firstName: 'Mary Kate', lastName: "O'Brien", tutor: 'Anne' },
            { firstName: 'John', lastName: 'Murphy' },
        ]);
    });
});

describe('pasteInto', () => {
    it('fills the rows from the cell pasted into, adding rows as needed', () => {
        const rows = [newRow({ firstName: 'Keep', lastName: 'Me' }), newRow()];
        const next = pasteInto(rows, ['firstName', 'lastName'], 'Ann Lee\nBob Ray\nCy Doe', 1, 0);
        expect(next.map(r => r.values)).toEqual([
            { firstName: 'Keep', lastName: 'Me' },
            { firstName: 'Ann', lastName: 'Lee' },
            { firstName: 'Bob', lastName: 'Ray' },
            { firstName: 'Cy', lastName: 'Doe' },
        ]);
        expect(rows[1].values).toEqual({});
    });

    it('fills from a later column only', () => {
        const rows = [newRow({ firstName: 'A' }), newRow({ firstName: 'B' })];
        const next = pasteInto(rows, ['firstName', 'lastName'], 'Lee\nRay', 0, 1);
        expect(next.map(r => r.values)).toEqual([{ firstName: 'A', lastName: 'Lee' }, { firstName: 'B', lastName: 'Ray' }]);
    });
});

describe('a certificate for each person', () => {
    const tags = ['firstName', 'lastName', 'fullName', 'tutor'];
    const fields = templateFields(tags, initialPerPerson(tags));

    it('puts together the shared values, the person and the full name', () => {
        const row = newRow({ firstName: ' Mary ', lastName: "O'Brien" });
        expect(personData(row, fields, { tutor: 'Anne' })).toEqual({ tutor: 'Anne', firstName: 'Mary', lastName: "O'Brien", fullName: "Mary O'Brien" });
        expect(isBlankRow(newRow({ firstName: '  ' }), fields.columns)).toBe(true);
    });

    it('names the files after the people, once each', () => {
        const bases = ([{ firstName: 'Mary', lastName: 'Lee' }, { firstName: 'Mary', lastName: 'Lee' }, {}] as Record<string, string>[]).map((d, i) => personFileBase(d, fields.columns, i));
        expect(uniqueNames(bases)).toEqual(['Mary_Lee', 'Mary_Lee_2', 'Certificate_3']);
        expect(templateBase('MH Cert.DOCX')).toBe('MH Cert');
    });
});

describe('filling any template', () => {
    const template = makeDocx('Presented to {firstName} {lastName}', 'Signed: {tutor}', 'On {courseDate} by {tutor}');

    it('lists the tags in the order they first appear', async () => {
        expect(await templateTags(template)).toEqual(['firstName', 'lastName', 'tutor', 'courseDate']);
    });

    it('fails on a broken tag', async () => {
        await expect(templateTags(makeDocx('Hello {firstName'))).rejects.toBeTruthy();
    });

    it('fills one copy, leaving a missing value blank', async () => {
        expect(await text(await fillTemplate(template, { firstName: 'Mary', lastName: 'Lee', tutor: 'Anne' }))).toBe('Presented to Mary Lee|Signed: Anne|On  by Anne');
    });

    it('puts everyone in one file', async () => {
        const all = await text(await fillTemplateForAll(template, [{ firstName: 'A', lastName: 'B' }, { firstName: 'C', lastName: 'D' }]));
        expect(all).toContain('Presented to A B');
        expect(all).toContain('Presented to C D');
    });

    it('makes one Word file, or a ZIP with a file each', async () => {
        const people = [{ data: { firstName: 'Mary' }, fileBase: 'Mary' }, { data: { firstName: 'Seán' }, fileBase: 'Seán' }];
        const one = await makeWord(template, 'MH Cert.docx', people, true);
        expect(one.fileName).toBe('MH Cert - all.docx');
        const each = await makeWord(template, 'MH Cert.docx', people, false);
        expect(each.fileName).toBe('MH Cert.zip');
        expect(Object.keys(new PizZip(await each.blob.arrayBuffer()).files)).toEqual(['Mary.docx', 'Seán.docx']);
        const single = await makeWord(template, 'MH Cert.docx', people.slice(0, 1), true);
        expect(single.fileName).toBe('Mary.docx');
    });
});
