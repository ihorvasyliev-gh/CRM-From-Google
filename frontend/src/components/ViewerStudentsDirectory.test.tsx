import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Route } from 'react-router-dom';
import ViewerStudentsDirectory, { ViewerStudentDirectoryItem } from './ViewerStudentsDirectory';
import { supabase } from '../lib/supabase';
import { renderViewer } from './Viewer/testUtils';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

const routes = <Route path="/students" element={<ViewerStudentsDirectory />} />;

const mockCourses = [
    { id: 'c-1', name: 'Digital Skills', created_at: '2026-01-01', total_count: 10, requested_count: 2, invited_count: 2, confirmed_count: 3, completed_count: 3, rejected_count: 0, pending_approval_count: 0 },
    { id: 'c-2', name: 'Barista Training', created_at: '2026-01-01', total_count: 4, requested_count: 4, invited_count: 0, confirmed_count: 0, completed_count: 0, rejected_count: 0, pending_approval_count: 0 },
];

const student = (over: Partial<ViewerStudentDirectoryItem>): ViewerStudentDirectoryItem => ({
    student_id: 'st-1', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '0871234567', address: null, eircode: null, dob: null,
    created_at: '2026-01-10T10:00:00Z', primary_course_name: 'Digital Skills', primary_course_id: 'c-1', primary_status: 'confirmed',
    primary_course_variant: 'Digital Skills (Morning)', primary_queue_position: null, is_priority: false, total_enrollments: 1, notes_count: 0, total_count: 2,
    ...over,
});

const mockStudents = [
    student({ student_id: 'st-1', notes_count: 2, total_enrollments: 3 }),
    student({ student_id: 'st-2', first_name: 'John', last_name: 'Smith', email: 'john@example.com', phone: null, primary_course_name: 'Barista Training', primary_course_id: 'c-2', primary_status: 'requested', primary_course_variant: null, primary_queue_position: 4, is_priority: true }),
];

function setupRpc(students: ViewerStudentDirectoryItem[] | 'error' = mockStudents) {
    (supabase.rpc as any).mockImplementation((name: string) => {
        if (name === 'get_viewer_courses') return Promise.resolve({ data: mockCourses, error: null });
        if (name === 'get_viewer_students_directory') {
            return Promise.resolve(students === 'error' ? { data: null, error: { message: 'Database timeout' } } : { data: students, error: null });
        }
        return Promise.resolve({ data: null, error: null });
    });
}

const location = () => screen.getByTestId('location').textContent;
const lastDirectoryCall = () => {
    const calls = (supabase.rpc as any).mock.calls.filter((c: any[]) => c[0] === 'get_viewer_students_directory');
    return calls[calls.length - 1]?.[1];
};

describe('ViewerStudentsDirectory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupRpc();
    });

    it('renders search and filter controls', async () => {
        renderViewer(routes, '/students');

        expect(screen.getByRole('searchbox', { name: 'Search students' })).toBeInTheDocument();
        expect(screen.getByRole('tablist', { name: 'Status filter' })).toBeInTheDocument();
        expect(screen.getByLabelText('Course filter')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Priority/ })).toBeInTheDocument();
        expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
        expect(await screen.findByRole('option', { name: 'Digital Skills' })).toBeInTheDocument();
    });

    it('lists students with course, status, queue, priority, notes and registration date', async () => {
        renderViewer(routes, '/students');

        const rows = await screen.findAllByTestId('student-row');
        expect(rows).toHaveLength(2);
        expect(screen.getByText('2 students')).toBeInTheDocument();

        const jane = rows[0];
        expect(within(jane).getByText('Jane Doe')).toBeInTheDocument();
        expect(within(jane).getAllByText('Confirmed').length).toBeGreaterThan(0);
        expect(within(jane).getByText('Morning')).toBeInTheDocument();
        expect(within(jane).getByText('+2 more')).toBeInTheDocument();
        expect(within(jane).getByTitle('2 notes')).toBeInTheDocument();
        expect(within(jane).getByText('10/01/2026')).toBeInTheDocument();

        const john = rows[1];
        expect(within(john).getByLabelText('Priority')).toBeInTheDocument();
        expect(within(john).getAllByText('#4').length).toBeGreaterThan(0);
    });

    it('keeps filters in the URL and passes them to the RPC', async () => {
        renderViewer(routes, '/students');
        await screen.findAllByTestId('student-row');

        fireEvent.click(screen.getByRole('tab', { name: /In queue/ }));
        fireEvent.change(screen.getByLabelText('Course filter'), { target: { value: 'c-2' } });
        fireEvent.click(screen.getByRole('button', { name: /Priority/ }));
        fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name_asc' } });

        expect(location()).toBe('/students?status=requested&course=c-2&priority=1&sort=name_asc');
        await waitFor(() => {
            expect(lastDirectoryCall()).toEqual({
                p_search: null, p_course_id: 'c-2', p_status: 'requested', p_priority_only: true, p_sort_by: 'name_asc', p_limit: 50, p_offset: 0,
            });
        });
    });

    it('restores filters from the URL on load', async () => {
        renderViewer(routes, '/students?q=jane&status=confirmed&page=2');
        await waitFor(() => {
            expect(lastDirectoryCall()).toEqual(expect.objectContaining({ p_search: 'jane', p_status: 'confirmed', p_offset: 50 }));
        });
        expect(screen.getByRole('searchbox', { name: 'Search students' })).toHaveValue('jane');
    });

    it('debounces the search and resets to page 1', async () => {
        renderViewer(routes, '/students?page=3');
        await screen.findAllByTestId('student-row');

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'Smith' } });
        await waitFor(() => expect(location()).toBe('/students?q=Smith'));
        await waitFor(() => expect(lastDirectoryCall()).toEqual(expect.objectContaining({ p_search: 'Smith', p_offset: 0 })));
    });

    it('clears the search with the X button', async () => {
        renderViewer(routes, '/students?q=jane');
        const input = screen.getByRole('searchbox', { name: 'Search students' });
        expect(input).toHaveValue('jane');

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(input).toHaveValue('');
        expect(location()).toBe('/students');
    });

    it('opens the student drawer via ?student= on row click and Enter', async () => {
        renderViewer(routes, '/students');
        const rows = await screen.findAllByTestId('student-row');

        fireEvent.click(rows[1]);
        expect(location()).toBe('/students?student=st-2');

        rows[0].focus();
        fireEvent.keyDown(rows[0], { key: 'Enter' });
        expect(location()).toBe('/students?student=st-1');
    });

    it('moves focus between rows with the arrow keys', async () => {
        renderViewer(routes, '/students');
        const rows = await screen.findAllByTestId('student-row');

        rows[0].focus();
        fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(rows[1]);
    });

    it('shows filter chips and resets every filter', async () => {
        renderViewer(routes, '/students?status=invited&priority=1');
        await screen.findAllByTestId('student-row');

        expect(screen.getByText('Invited', { selector: 'span.inline-flex' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
        expect(location()).toBe('/students');
    });

    it('renders an empty state that can reset filters', async () => {
        setupRpc([]);
        renderViewer(routes, '/students?status=completed');

        expect(await screen.findByText('No students match these filters')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Reset filters' }).slice(-1)[0]);
        expect(location()).toBe('/students');
    });

    it('paginates with a range summary', async () => {
        setupRpc(mockStudents.map(s => ({ ...s, total_count: 120 })));
        renderViewer(routes, '/students');
        await screen.findAllByTestId('student-row');

        expect(screen.getByText('1–50')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        expect(location()).toBe('/students?page=2');
        await waitFor(() => expect(lastDirectoryCall()).toEqual(expect.objectContaining({ p_offset: 50 })));
        expect(await screen.findByText('51–100')).toBeInTheDocument();
    });

    it('shows an error card and retries', async () => {
        setupRpc('error');
        renderViewer(routes, '/students');

        expect(await screen.findByText('Failed to load students')).toBeInTheDocument();
        expect(screen.getByText('Database timeout')).toBeInTheDocument();

        setupRpc();
        fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
        expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    });

    it('does not render a variant badge for students without course or variant', async () => {
        setupRpc([student({ primary_course_name: null, primary_course_id: null, primary_status: null, primary_course_variant: null })]);
        renderViewer(routes, '/students');

        const row = await screen.findByTestId('student-row');
        expect(within(row).getByText('No course')).toBeInTheDocument();
        expect(within(row).queryByText('Morning')).not.toBeInTheDocument();
    });
});
