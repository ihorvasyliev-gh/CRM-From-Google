/**
 * Tests for documentUtils.ts
 *
 * Covers:
 *   - buildPlaceholderData: maps enrollment fields to template placeholder keys
 *   - buildSheetPages: numbered slots and pagination for attendance sheets / labels
 *   - buildDocumentsArchive: renders real .docx templates (built in memory) into a ZIP
 */
import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import {
    buildPlaceholderData, templatesForCourse, coursePreset, buildSheetPages, buildDocumentsArchive, checkTemplate,
    safeFileName, describeDocxError, summarizeGeneration, validateVariableKey, groupSessions, defaultSessionKey,
    archiveFileName, isAbortError, PLACEHOLDER_KEYS,
} from './documentUtils';
import type { EnrollmentWithRelations } from './documentUtils';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeFullEnrollment(): EnrollmentWithRelations {
    return {
        id: 'enr-abc',
        student_id: 'stu-abc',
        course_id: 'crs-abc',
        status: 'invited',
        course_variant: 'English',
        notes: 'Some note',
        is_priority: false,
        invited_date: '2024-06-15',
        confirmed_date: '2024-06-15',
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        created_at: '2024-01-20T10:00:00Z',
        updated_at: '2024-01-20T10:00:00Z',
        students: {
            id: 'stu-abc',
            first_name: 'Olena',
            last_name: 'Kovalenko',
            email: 'olena@example.com',
            phone: '+353861234567',
            address: '12 Main Street',
            eircode: 'D01 AB12',
            dob: '1990-04-22',
            last_synced_at: null,
            created_at: '2024-01-01T00:00:00Z',
        },
        courses: {
            id: 'crs-abc',
            name: 'Python 101',
            created_at: '2024-01-01T00:00:00Z',
        },
    } as EnrollmentWithRelations;
}

// ─── buildPlaceholderData ────────────────────────────────────────────────────

describe('buildPlaceholderData', () => {
    it('maps student name fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.firstName).toBe('Olena');
        expect(data.lastName).toBe('Kovalenko');
        expect(data.fullName).toBe('Olena Kovalenko');
    });

    it('maps student contact fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.email).toBe('olena@example.com');
        expect(data.mobileNumber).toBe('+353861234567');
        expect(data.address).toBe('12 Main Street');
        expect(data.eircode).toBe('D01 AB12');
    });

    it('maps course fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.courseTitle).toBe('Python 101');
        // courseVariant = cleanVariant('Python 101', 'English') → 'English'
        expect(data.courseVariant).toBe('English');
        expect(data.courseId).toBe('crs-abc');
    });

    it('maps enrollment dates correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        // created_at = 2024-01-20 → registeredAt should be dd/mm/yyyy
        expect(data.registeredAt).toMatch(/20\/01\/2024/);
        // invitedAt = invited_date = 2024-06-15
        expect(data.invitedAt).toMatch(/15/);
    });

    it('resolves courseDate hierarchy (confirmed_date > invited_date > completed_date)', () => {
        const enr = makeFullEnrollment();
        enr.confirmed_date = '2026-08-27';
        enr.invited_date = '2026-08-20';
        enr.completed_date = null;
        expect(buildPlaceholderData(enr).courseDate).toMatch(/27\s+Aug\s+2026/i);

        enr.confirmed_date = null;
        enr.invited_date = '2026-08-20';
        expect(buildPlaceholderData(enr).courseDate).toMatch(/20\s+Aug\s+2026/i);

        enr.invited_date = null;
        enr.completed_date = '2026-09-01';
        expect(buildPlaceholderData(enr).courseDate).toMatch(/01\s+Sept?\s+2026/i);

        enr.completed_date = null;
        expect(buildPlaceholderData(enr).courseDate).toBe('');
    });


    it('isCompleted is "No" for non-completed status', () => {
        const enr = makeFullEnrollment();
        enr.status = 'invited';
        const data = buildPlaceholderData(enr);
        expect(data.isCompleted).toBe('No');
    });

    it('isCompleted is "Yes" for completed status', () => {
        const enr = makeFullEnrollment();
        enr.status = 'completed';
        enr.completed_date = '2024-09-01';
        const data = buildPlaceholderData(enr);
        expect(data.isCompleted).toBe('Yes');
    });

    it('enrollmentNotes maps to notes field', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.enrollmentNotes).toBe('Some note');
    });

    it('returns empty strings for null student', () => {
        const enr = makeFullEnrollment();
        enr.students = null;
        const data = buildPlaceholderData(enr);
        expect(data.firstName).toBe('');
        expect(data.lastName).toBe('');
        expect(data.fullName).toBe('');
        expect(data.email).toBe('');
    });

    it('returns empty strings for null course', () => {
        const enr = makeFullEnrollment();
        enr.courses = null;
        const data = buildPlaceholderData(enr);
        expect(data.courseTitle).toBe('');
        expect(data.courseId).toBe('');
    });

    it('isInvited is "Yes" when invited_date is set', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.isInvited).toBe('Yes');
    });

    it('isInvited is "No" when invited_date is null', () => {
        const enr = makeFullEnrollment();
        enr.invited_date = null;
        const data = buildPlaceholderData(enr);
        expect(data.isInvited).toBe('No');
    });

    it('enrollmentStatus capitalises the first letter', () => {
        const enr = makeFullEnrollment();
        enr.status = 'confirmed';
        const data = buildPlaceholderData(enr);
        expect(data.enrollmentStatus).toBe('Confirmed');
    });

    it('includes all expected placeholder keys', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        const requiredKeys = [
            'userId', 'firstName', 'lastName', 'fullName',
            'email', 'mobileNumber', 'address', 'eircode', 'dateOfBirth',
            'courseId', 'courseTitle', 'courseVariant',
            'registeredAt', 'courseRegistrationDate',
            'isCompleted', 'completedAt',
            'isInvited', 'invitedAt',
            'confirmedDate', 'courseDate',
            'enrollmentStatus', 'enrollmentNotes', 'today',
        ];
        for (const key of requiredKeys) {
            expect(data).toHaveProperty(key);
        }
    });
});

describe('templatesForCourse', () => {
    const tpls = [
        { id: 'a', is_active: true },
        { id: 'b', is_active: true },
        { id: 'c', is_active: true },
        { id: 'off', is_active: false },
    ];
    const ids = (picked?: string[] | null) => templatesForCourse(tpls, picked).map(t => t.id);

    it('uses only the templates picked for the course', () => {
        expect(ids(['a', 'c'])).toEqual(['a', 'c']);
    });

    it('uses all active templates when the course picked none (or only deleted ones)', () => {
        expect(ids([])).toEqual(['a', 'b', 'c']);
        expect(ids(null)).toEqual(['a', 'b', 'c']);
        expect(ids(['deleted'])).toEqual(['a', 'b', 'c']);
    });

    it('skips picked templates that were switched off', () => {
        expect(ids(['a', 'off'])).toEqual(['a']);
    });

    it('uses nothing, rather than every template, when all picked templates are switched off', () => {
        expect(ids(['off'])).toEqual([]);
        expect(coursePreset(tpls, ['off']).state).toBe('preset-off');
        expect(coursePreset(tpls, ['a']).state).toBe('preset');
        expect(coursePreset(tpls, []).state).toBe('all');
    });
});

describe('course dates', () => {
    const at = (confirmed_date: string | null, invited_date: string | null = null) => ({ confirmed_date, invited_date, completed_date: null });

    it('groups participants by the day they attend, earliest first, undated last', () => {
        const sessions = groupSessions([at('2026-10-08'), at(null), at('2026-10-01'), at('2026-10-08'), at(null, '2026-10-15')]);
        expect(sessions.map(s => [s.key, s.enrollments.length])).toEqual([['2026-10-01', 1], ['2026-10-08', 2], ['2026-10-15', 1], ['none', 1]]);
    });

    it('preselects the next upcoming date for confirmed people and the latest for completers', () => {
        const sessions = groupSessions([at('2026-09-01'), at('2026-10-01'), at('2026-11-01')]);
        expect(defaultSessionKey(sessions, 'confirmed', '2026-09-26')).toBe('2026-10-01');
        expect(defaultSessionKey(sessions, 'confirmed', '2026-12-01')).toBe('2026-11-01');
        expect(defaultSessionKey(sessions, 'completed', '2026-09-26')).toBe('2026-11-01');
        expect(defaultSessionKey(groupSessions([at(null)]), 'confirmed')).toBe('none');
        expect(defaultSessionKey([], 'confirmed')).toBeNull();
    });

    it('names the archive after the course, variants and dates in it', () => {
        const a = person('1', 'A', 'B');
        const b = { ...person('2', 'C', 'D'), course_variant: 'Python 101 (Ukrainian)', confirmed_date: '2024-06-22' };
        expect(archiveFileName([a])).toBe('Python 101 (English) 15 06 2024.zip');
        expect(archiveFileName([a, b], 'SAMPLE ')).toBe('SAMPLE Python 101 (English, Ukrainian) 15 06 2024 - 22 06 2024.zip');
    });
});

// ─── Rendering real templates ────────────────────────────────────────────────

/** A minimal but valid .docx whose body is one paragraph per line. */
function makeDocx(...lines: string[]): ArrayBuffer {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    const body = lines.map(l => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`).join('');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
    return zip.generate({ type: 'arraybuffer' });
}

/** Text of every .docx in the archive, keyed by path. */
async function readArchive(blob: Blob): Promise<Record<string, string>> {
    const zip = new PizZip(await blob.arrayBuffer());
    const out: Record<string, string> = {};
    for (const name of Object.keys(zip.files)) {
        if (!name.endsWith('.docx')) { out[name] = ''; continue; }
        const xml = new PizZip(zip.file(name)!.asArrayBuffer()).file('word/document.xml')!.asText();
        out[name] = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('\n');
    }
    return out;
}

function person(id: string, first: string, last: string): EnrollmentWithRelations {
    const e = makeFullEnrollment();
    return { ...e, id, students: { ...e.students!, id: `s-${id}`, first_name: first, last_name: last } };
}

const files = (map: Record<string, ArrayBuffer>) => async (path: string) => {
    if (!map[path]) throw new Error('File not found');
    return map[path];
};

describe('buildSheetPages', () => {
    it('fills numbered slots alphabetically by surname and blanks the rest', () => {
        const [page] = buildSheetPages([person('1', 'Zoe', 'Byrne'), person('2', 'Adam', 'Walsh'), person('3', 'Mary', 'Ahern')], 34);
        expect(page.fullName1).toBe('Mary Ahern');
        expect(page.fullName2).toBe('Zoe Byrne');
        expect(page.fullName3).toBe('Adam Walsh');
        expect(page.fullName4).toBe('');
        expect(page.fullName34).toBe('');
        expect(page.fullName35).toBeUndefined();
        expect(page.participantCount).toBe('3');
        expect((page.students as unknown[]).length).toBe(3);
    });

    it('splits participants beyond the slot count onto extra pages', () => {
        const people = Array.from({ length: 30 }, (_, i) => person(String(i), `P${i}`, `Surname${String(i).padStart(2, '0')}`));
        const pages = buildSheetPages(people, 28);
        expect(pages).toHaveLength(2);
        expect(pages[1].firstName1).toBe('P28');
        expect(pages[1].firstName3).toBe('');
        expect(pages[1].page).toBe('2');
        expect(pages[1].pages).toBe('2');
        expect((pages[1].students as { n: string }[])[0].n).toBe('29');
    });

    it('keeps everyone on one page when slots is null (loop templates)', () => {
        const people = Array.from({ length: 50 }, (_, i) => person(String(i), 'A', `B${i}`));
        const pages = buildSheetPages(people, null);
        expect(pages).toHaveLength(1);
        expect((pages[0].students as unknown[]).length).toBe(50);
    });
});

describe('buildDocumentsArchive', () => {
    it('renders one document per student and fills placeholders and custom variables', async () => {
        const { blob, result } = await buildDocumentsArchive({
            enrollments: [person('1', 'Olena', 'Kovalenko'), person('2', 'Seán', 'Ó Briain')],
            templates: [{ name: 'Certificate.docx', storagePath: 'cert' }],
            customVariables: { Tutor: 'Jane Doe' },
            fetchTemplate: files({ cert: makeDocx('Awarded to {fullName}', 'Tutor: {Tutor}', 'Course: {courseTitle}') }),
        });
        expect(result.totalDocs).toBe(2);
        expect(result.successTemplates).toEqual(['Certificate.docx']);
        const docs = await readArchive(blob);
        expect(Object.keys(docs).sort()).toEqual(['Olena_Kovalenko.docx', 'Seán_Ó_Briain.docx']);
        expect(docs['Seán_Ó_Briain.docx']).toBe('Awarded to Seán Ó Briain\nTutor: Jane Doe\nCourse: Python 101');
    });

    it('does not overwrite students who share a name', async () => {
        const { blob } = await buildDocumentsArchive({
            enrollments: [person('1', 'John', 'Murphy'), person('2', 'John', 'Murphy')],
            templates: [{ name: 'a.docx', storagePath: 'a' }],
            fetchTemplate: files({ a: makeDocx('{fullName}') }),
        });
        expect(Object.keys(await readArchive(blob)).sort()).toEqual(['John_Murphy.docx', 'John_Murphy_2.docx']);
    });

    it('renders unknown placeholders blank and reports them', async () => {
        const { blob, result } = await buildDocumentsArchive({
            enrollments: [person('1', 'Olena', 'Kovalenko')],
            templates: [{ name: 'a.docx', storagePath: 'a' }],
            fetchTemplate: files({ a: makeDocx('Hi {firstName}{Tuter}!') }),
        });
        expect((await readArchive(blob))['Olena_Kovalenko.docx']).toBe('Hi Olena!');
        expect(result.unknownTags).toEqual([{ template: 'a.docx', tags: ['Tuter'] }]);
        expect(summarizeGeneration(result).type).toBe('info');
    });

    it('fails a broken template once with a readable reason, and keeps going', async () => {
        const { result } = await buildDocumentsArchive({
            enrollments: [person('1', 'A', 'B'), person('2', 'C', 'D')],
            templates: [{ name: 'broken.docx', storagePath: 'broken' }, { name: 'missing.docx', storagePath: 'nope' }, { name: 'ok.docx', storagePath: 'ok' }],
            fetchTemplate: files({ broken: makeDocx('Hi {firstName'), ok: makeDocx('{firstName}') }),
        });
        expect(result.failedTemplates).toEqual([
            { name: 'broken.docx', error: expect.stringContaining('unclosed') },
            { name: 'missing.docx', error: 'Download failed: File not found' },
        ]);
        expect(result.failedDocs).toEqual([]);
        expect(result.totalDocs).toBe(2);
        expect(summarizeGeneration(result).type).toBe('error');
    });

    it('paginates the attendance sheet and puts templates in subfolders', async () => {
        const people = Array.from({ length: 40 }, (_, i) => person(String(i), `P${i}`, `S${String(i).padStart(2, '0')}`));
        const progress: number[] = [];
        const { blob, result } = await buildDocumentsArchive({
            enrollments: people,
            templates: [{ name: 'One.docx', storagePath: 'a' }, { name: 'Two.docx', storagePath: 'a' }],
            attendanceTemplatePath: 'att',
            fetchTemplate: files({ a: makeDocx('{firstName}'), att: makeDocx('{courseTitle} p{page}/{pages}: {fullName1}') }),
            onProgress: done => progress.push(done),
        });
        const docs = await readArchive(blob);
        expect(docs['One/P0_S00.docx']).toBe('P0');
        expect(docs['Two/P0_S00.docx']).toBe('P0');
        expect(docs['Attendance_Sheet_1_of_2.docx']).toBe('Python 101 p1/2: P0 S00');
        expect(docs['Attendance_Sheet_2_of_2.docx']).toBe('Python 101 p2/2: P34 S34');
        expect(result.extras).toEqual([{ label: 'Attendance sheet', ok: true, files: 2 }]);
        expect(progress[progress.length - 1]).toBe(81);
    });

    it('keeps a {#students} loop attendance sheet on a single page', async () => {
        const people = Array.from({ length: 40 }, (_, i) => person(String(i), `P${i}`, `S${String(i).padStart(2, '0')}`));
        const { blob } = await buildDocumentsArchive({
            enrollments: people,
            templates: [],
            attendanceTemplatePath: 'att',
            fetchTemplate: files({ att: makeDocx('{#students}{n}. {fullName}', '{/students}') }),
        });
        const text = (await readArchive(blob))['Attendance_Sheet.docx'];
        expect(text).toContain('1. P0 S00');
        expect(text).toContain('40. P39 S39');
    });
});

describe('checkTemplate', () => {
    const blob = (buf: ArrayBuffer) => new Blob([buf]);

    it('accepts known placeholders and custom variables', async () => {
        expect(await checkTemplate(blob(makeDocx('{fullName} {today} {Tutor}')), 'document', { Tutor: 'x' })).toEqual({ unknownTags: [] });
    });

    it('lists unknown placeholders', async () => {
        expect(await checkTemplate(blob(makeDocx('{fullname} {firstName1}')), 'document')).toEqual({ unknownTags: ['firstName1', 'fullname'] });
        expect(await checkTemplate(blob(makeDocx('{firstName1} {phone34} {firstName35}')), 'attendance')).toEqual({ unknownTags: ['firstName35'] });
    });

    it('explains syntax errors', async () => {
        const res = await checkTemplate(blob(makeDocx('{{Tutor}}')), 'document');
        expect(res.error).toBeTruthy();
    });
});

describe('helpers', () => {
    it('safeFileName keeps accented and Cyrillic letters', () => {
        expect(safeFileName('Seán Ó Briain')).toBe('Seán_Ó_Briain');
        expect(safeFileName('Олена')).toBe('Олена');
        expect(safeFileName('a/b:c*')).toBe('abc');
        expect(safeFileName('???')).toBe('Unknown');
    });

    it('describeDocxError unwraps multi errors', () => {
        const err = Object.assign(new Error('Multi error'), {
            properties: { errors: [{ properties: { explanation: 'The tag "x" is unclosed' } }] },
        });
        expect(describeDocxError(err)).toBe('The tag "x" is unclosed');
        expect(describeDocxError(new Error('plain'))).toBe('plain');
    });

    it('validateVariableKey only allows tag-safe names', () => {
        expect(validateVariableKey('Tutor')).toBeNull();
        expect(validateVariableKey('venue_name')).toBeNull();
        expect(validateVariableKey('')).toBeTruthy();
        expect(validateVariableKey('{Tutor}')).toBeTruthy();
        expect(validateVariableKey('Tutor Name')).toBeTruthy();
    });

    it('the placeholder catalogue matches buildPlaceholderData', () => {
        expect(new Set(Object.keys(buildPlaceholderData(makeFullEnrollment())))).toEqual(PLACEHOLDER_KEYS);
    });
});

describe('placeholders', () => {
    it('offers {phone} as well as {mobileNumber} in documents', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.phone).toBe('+353861234567');
        expect(data.mobileNumber).toBe('+353861234567');
    });

    it('fills every per-person field in numbered slots and rows, and drops the always-empty {venue}', () => {
        const [page] = buildSheetPages([{ ...person('1', 'Olena', 'Kovalenko'), course_variant: 'Python 101 (Ukrainian)' }], 2);
        expect(page.mobileNumber1).toBe('+353861234567');
        expect(page.dateOfBirth1).toMatch(/22\s+Apr\s+1990/);
        expect(page.courseVariant1).toBe('Ukrainian');
        expect(page.courseVariant2).toBe('');
        expect(page).not.toHaveProperty('venue');
        expect((page.students as Record<string, string>[])[0].mobileNumber).toBe('+353861234567');
    });

    it('lists every variant and date of a mixed group on the sheet', () => {
        const [page] = buildSheetPages([
            person('1', 'A', 'A'),
            { ...person('2', 'B', 'B'), course_variant: 'Python 101 (Ukrainian)', confirmed_date: '2024-06-22' },
        ], null);
        expect(page.courseVariant).toBe('English, Ukrainian');
        expect(page.courseDate).toMatch(/15\s+Jun\s+2024, 22\s+Jun\s+2024/);
    });
});

describe('checkTemplate inside loops', () => {
    it('reports misspelled tags inside a {#students} row of an attendance sheet', async () => {
        const res = await checkTemplate(new Blob([makeDocx('{#students}{n}. {fulName}', '{/students}')]), 'attendance');
        expect(res).toEqual({ unknownTags: ['fulName'] });
    });
});

/** A .docx whose single paragraph holds a picture (drawing id 1) and a line of text. */
function makeDocxWithPicture(text: string): ArrayBuffer {
    const zip = new PizZip(makeDocx('x'));
    const drawing = '<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Logo"/></wp:inline></w:drawing></w:r>';
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
        + `<w:body><w:p>${drawing}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);
    return zip.generate({ type: 'arraybuffer' });
}

describe('combined file', () => {
    it('puts everyone into one file, page after page, with unique picture ids and no trailing page break', async () => {
        const { blob, result } = await buildDocumentsArchive({
            enrollments: [person('1', 'Zoe', 'Byrne'), person('2', 'Mary', 'Ahern')],
            templates: [{ name: 'Certificate.docx', storagePath: 'cert' }],
            customVariables: { Tutor: 'Jane' },
            combined: true,
            fetchTemplate: files({ cert: makeDocxWithPicture('{fullName} — {Tutor}') }),
        });
        const zip = new PizZip(await blob.arrayBuffer());
        expect(Object.keys(zip.files).sort()).toEqual(['Certificate_All.docx', 'Mary_Ahern.docx', 'Zoe_Byrne.docx']);
        const xml = new PizZip(zip.file('Certificate_All.docx')!.asArrayBuffer()).file('word/document.xml')!.asText();
        const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).filter(Boolean);
        expect(texts).toEqual(['Mary Ahern — Jane', 'Zoe Byrne — Jane']);
        expect(xml.match(/w:type="page"/g)).toHaveLength(1);
        expect([...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map(m => m[1])).toEqual(['1', '2']);
        // Page setup stays after the repeated content, once
        expect(xml.match(/<w:sectPr>/g)).toHaveLength(1);
        expect(xml.indexOf('<w:sectPr>')).toBeGreaterThan(xml.lastIndexOf('Zoe Byrne'));
        expect(result.extras).toEqual([{ label: 'Certificate.docx — all in one file', ok: true, files: 1 }]);
    });
});

describe('cancelling', () => {
    it('stops the run with an AbortError', async () => {
        const controller = new AbortController();
        const run = buildDocumentsArchive({
            enrollments: [person('1', 'A', 'B'), person('2', 'C', 'D'), person('3', 'E', 'F')],
            templates: [{ name: 'a.docx', storagePath: 'a' }],
            fetchTemplate: files({ a: makeDocx('{fullName}') }),
            signal: controller.signal,
            onProgress: done => { if (done === 1) controller.abort(); },
        });
        const err = await run.catch(e => e);
        expect(isAbortError(err)).toBe(true);
    });
});

describe('Participants.xlsx', () => {
    it('never lets a value start a formula', async () => {
        const evil = { ...person('1', '=HYPERLINK("http://x")', 'Smith') };
        const { blob, result } = await buildDocumentsArchive({
            enrollments: [evil],
            templates: [],
            excelColumns: [{ header: 'First Name', placeholder: 'firstName' }],
            fetchTemplate: files({}),
        });
        expect(result.extras).toEqual([{ label: 'Participants.xlsx', ok: true, files: 1 }]);
        const xlsx = new PizZip(new PizZip(await blob.arrayBuffer()).file('Participants.xlsx')!.asArrayBuffer());
        const strings = (xlsx.file('xl/sharedStrings.xml')?.asText() ?? xlsx.file('xl/worksheets/sheet1.xml')!.asText()).replace(/&apos;/g, "'");
        expect(strings).toContain(`'=HYPERLINK`);
        expect(xlsx.file('xl/worksheets/sheet1.xml')!.asText()).not.toContain('<f>');
    });
});
