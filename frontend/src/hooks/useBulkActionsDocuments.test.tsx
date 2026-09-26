/**
 * "Generate Docs" on the enrollment board: the selection is re-read, the course preset,
 * sheets, Excel columns and custom variables (text and date) go into one archive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBulkActions } from './useBulkActions';
import type { EnrollmentRow } from './useEnrollments';
import * as docs from '../lib/documentUtils';

const courseQuery = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({ select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: () => courseQuery(id) }) }) })),
    },
}));

vi.mock('../lib/documentUtils', async importOriginal => {
    const actual = await importOriginal<typeof docs>();
    return {
        ...actual,
        refreshParticipants: vi.fn(),
        fetchDocumentTemplates: vi.fn(),
        fetchSingleTemplate: vi.fn(),
        fetchTemplateVariables: vi.fn(),
        fetchExcelColumns: vi.fn(),
        generateDocumentsArchive: vi.fn(),
    };
});

const row = (id: string, courseId: string): EnrollmentRow => ({
    id, student_id: `s-${id}`, course_id: courseId, status: 'confirmed', course_variant: null, notes: null, is_priority: false,
    invited_date: null, confirmed_date: '2026-10-01', completed_date: null, invited_at: null, confirmed_at: null, completed_at: null,
    response_days: 7, created_at: '2026-01-01', updated_at: '2026-01-01',
    students: { id: `s-${id}`, first_name: 'P', last_name: id, email: '', phone: '', address: null, eircode: null, dob: null } as never,
    courses: { id: courseId, name: 'Python 101', created_at: '2026-01-01' },
} as EnrollmentRow);

const templates = [
    { id: 't1', name: 'Certificate.docx', storage_path: 'cert', is_active: true, created_at: '', updated_at: '' },
    { id: 't2', name: 'Letter.docx', storage_path: 'letter', is_active: true, created_at: '', updated_at: '' },
];
const emptyResult = { totalTemplates: 1, successTemplates: ['Certificate.docx'], failedTemplates: [], totalDocs: 1, failedDocs: [], extras: [], unknownTags: [], skipped: [] };

function setup(enrollments: EnrollmentRow[]) {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const showToast = vi.fn();
    const hook = renderHook(() => useBulkActions({
        enrollments, setEnrollments: vi.fn(), showToast, openInviteModal: vi.fn(), openConfirmModal: vi.fn(),
    }), { wrapper });
    act(() => enrollments.forEach(e => hook.result.current.toggleSelect(e.id)));
    return { hook, showToast };
}

describe('Generate Docs on the board', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(docs.refreshParticipants).mockImplementation(async selected => ({ people: selected, skipped: [] }));
        vi.mocked(docs.fetchDocumentTemplates).mockResolvedValue(templates);
        vi.mocked(docs.fetchSingleTemplate).mockImplementation(async kind => kind === 'attendance' ? { ...templates[0], id: 'a', storage_path: 'att' } : null);
        vi.mocked(docs.fetchTemplateVariables).mockResolvedValue([
            { id: 'v1', var_key: 'Tutor', var_value: 'Jane', created_at: '' },
            { id: 'v2', var_key: 'expire', var_value: '', kind: 'date', date_rule: { base: 'courseDate', amount: 2, unit: 'years', format: 'long' }, created_at: '' },
        ]);
        vi.mocked(docs.fetchExcelColumns).mockResolvedValue({ columns: [{ header: 'Name', placeholder: 'fullName' }], shared: true });
        vi.mocked(docs.generateDocumentsArchive).mockResolvedValue(emptyResult);
        courseQuery.mockResolvedValue({ data: { template_ids: ['t1'] } });
    });

    it('uses the course preset, sheets, Excel columns and text and date variables', async () => {
        const { hook, showToast } = setup([row('1', 'c1'), row('2', 'c1')]);
        await act(() => hook.result.current.handleGenerateDocuments());

        const [name, options] = vi.mocked(docs.generateDocumentsArchive).mock.calls[0];
        expect(name).toBe('Python 101 (English) 01 10 2026.zip');
        expect(options.templates).toEqual([{ name: 'Certificate.docx', storagePath: 'cert' }]);
        expect(options.attendanceTemplatePath).toBe('att');
        expect(options.labelTemplatePath).toBeUndefined();
        expect(options.customVariables).toEqual({ Tutor: 'Jane' });
        expect(options.dateVariables).toEqual([{ key: 'expire', rule: { base: 'courseDate', amount: 2, unit: 'years', format: 'long' } }]);
        expect(options.excelColumns).toEqual([{ header: 'Name', placeholder: 'fullName' }]);
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Generated'), 'success', undefined);
        expect(hook.result.current.selectedIds.size).toBe(0);
    });

    it('ignores course presets when the selection spans several courses', async () => {
        const { hook } = setup([row('1', 'c1'), row('2', 'c2')]);
        await act(() => hook.result.current.handleGenerateDocuments());
        expect(courseQuery).not.toHaveBeenCalled();
        expect(vi.mocked(docs.generateDocumentsArchive).mock.calls[0][1].templates).toHaveLength(2);
    });
});
