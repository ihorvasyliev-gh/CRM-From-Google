import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Route } from 'react-router-dom';
import ViewerCourses from './ViewerCourses';
import { supabase } from '../lib/supabase';
import { exportViewerRosterToExcel } from '../lib/excelExport';
import { renderViewer, isoFromToday } from './Viewer/testUtils';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

vi.mock('../lib/excelExport', () => ({
    exportViewerRosterToExcel: vi.fn().mockResolvedValue(undefined),
}));

const routes = (
    <>
        <Route path="/courses" element={<ViewerCourses />} />
        <Route path="/courses/:courseId" element={<ViewerCourses />} />
    </>
);

const TODAY = isoFromToday(0);
const NEXT_WEEK = isoFromToday(7);
const LAST_WEEK = isoFromToday(-7);

const mockCourses = [
    {
        id: 'course-1', name: 'First Aid Training', created_at: '2026-01-01T00:00:00Z',
        total_count: 6, requested_count: 3, invited_count: 1, confirmed_count: 2, completed_count: 0, rejected_count: 0, pending_approval_count: 1,
    },
    {
        id: 'course-2', name: 'Barista Skills', created_at: '2026-01-01T00:00:00Z',
        total_count: 2, requested_count: 2, invited_count: 0, confirmed_count: 0, completed_count: 0, rejected_count: 0, pending_approval_count: 0,
    },
];

const base = {
    course_variant: null, notes: null, invited_at: null, confirmed_at: null, completed_date: null, completed_at: null,
    pending_completion_date: null, completion_requested_at: null, completion_requested_by: null, completion_rejection_reason: null,
    completion_request_status: 'none', invited_date: null, confirmed_date: null, queue_position: null, is_priority: false,
};

const mockRoster = [
    { ...base, enrollment_id: 'en-3', student_id: 'st-3', first_name: 'Charlie', last_name: 'Brown', email: 'charlie@example.com', phone: '0871112223', status: 'requested', queue_position: 3, created_at: '2026-01-03T00:00:00Z' },
    { ...base, enrollment_id: 'en-1', student_id: 'st-1', first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', phone: '111', status: 'requested', queue_position: 1, created_at: '2026-01-01T00:00:00Z' },
    { ...base, enrollment_id: 'en-2', student_id: 'st-2', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com', phone: '222', status: 'requested', queue_position: 2, is_priority: true, created_at: '2026-01-02T00:00:00Z' },
    { ...base, enrollment_id: 'en-4', student_id: 'st-4', first_name: 'Dana', last_name: 'White', email: 'dana@example.com', phone: null, status: 'confirmed', invited_date: TODAY, confirmed_date: TODAY, created_at: '2025-12-01T00:00:00Z' },
    { ...base, enrollment_id: 'en-5', student_id: 'st-5', first_name: 'Evan', last_name: 'Green', email: 'evan@example.com', phone: null, status: 'confirmed', confirmed_date: LAST_WEEK, completion_request_status: 'pending', created_at: '2025-11-01T00:00:00Z' },
    { ...base, enrollment_id: 'en-6', student_id: 'st-6', first_name: 'Fiona', last_name: 'Black', email: 'fiona@example.com', phone: null, status: 'invited', invited_date: NEXT_WEEK, completion_request_status: 'rejected', completion_rejection_reason: 'No attendance sheet', created_at: '2025-10-01T00:00:00Z' },
];

function setupRpc({ coursesError = false }: { coursesError?: boolean } = {}) {
    (supabase.rpc as any).mockImplementation((name: string) => {
        if (name === 'get_viewer_courses') {
            return Promise.resolve(coursesError ? { data: null, error: { message: 'Permission denied' } } : { data: mockCourses, error: null });
        }
        if (name === 'get_viewer_upcoming_courses') {
            return Promise.resolve({ data: [{ course_id: 'course-1', course_name: 'First Aid Training', course_date: TODAY, confirmed_count: 1, pending_count: 0, total_active_count: 1 }], error: null });
        }
        if (name === 'get_viewer_course_roster') return Promise.resolve({ data: mockRoster, error: null });
        return Promise.resolve({ data: null, error: null });
    });
}

const rowNames = () => screen.getAllByTestId('roster-row').map(r => within(r).getAllByText(/\w+ \w+/)[0].textContent);
const location = () => screen.getByTestId('location').textContent;

describe('ViewerCourses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        setupRpc();
    });

    describe('catalog', () => {
        it('lists courses with status counts, next session and awaiting badge', async () => {
            renderViewer(routes, '/courses');

            expect(await screen.findByText('First Aid Training')).toBeInTheDocument();
            expect(screen.getByText('Barista Skills')).toBeInTheDocument();
            expect(screen.getByText('2 courses · 8 enrollments · 1 awaiting approval')).toBeInTheDocument();
            expect(screen.getByText('1 awaiting')).toBeInTheDocument();
            expect(await screen.findByText('· Today')).toBeInTheDocument();
            expect(screen.getByText('No upcoming session')).toBeInTheDocument();
        });

        it('opens a course roster on click and returns via the back link', async () => {
            renderViewer(routes, '/courses');

            fireEvent.click(await screen.findByRole('link', { name: 'Open First Aid Training' }));
            expect(location()).toBe('/courses/course-1');
            expect(await screen.findByRole('heading', { name: 'First Aid Training' })).toBeInTheDocument();

            fireEvent.click(screen.getByRole('link', { name: /All courses/ }));
            expect(location()).toBe('/courses');
            expect(await screen.findByPlaceholderText('Search courses…')).toBeInTheDocument();
        });

        it('opens the roster pre-filtered when a status count is clicked', async () => {
            renderViewer(routes, '/courses');
            const card = await screen.findByRole('link', { name: 'Open First Aid Training' });

            fireEvent.click(within(card).getByTitle('Show in queue students'));
            expect(location()).toBe('/courses/course-1?status=requested');
        });

        it('filters by search, shows an empty state and opens the only match on Enter', async () => {
            renderViewer(routes, '/courses');
            await screen.findByText('First Aid Training');
            const input = screen.getByPlaceholderText('Search courses…');

            fireEvent.change(input, { target: { value: 'zzz' } });
            expect(await screen.findByText('No courses found')).toBeInTheDocument();
            fireEvent.click(screen.getByText('Clear search'));
            expect(screen.getByText('Barista Skills')).toBeInTheDocument();

            fireEvent.change(input, { target: { value: 'barista' } });
            expect(screen.queryByText('First Aid Training')).not.toBeInTheDocument();
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(location()).toBe('/courses/course-2');
        });

        it('pins a course to the top and remembers it', async () => {
            renderViewer(routes, '/courses');
            fireEvent.click(await screen.findByRole('button', { name: 'Pin Barista Skills' }));

            expect(screen.getByText('Pinned')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Unpin Barista Skills' })).toBeInTheDocument();
            expect(JSON.parse(window.localStorage.getItem('viewer_pinned_courses') || '[]')).toEqual(['course-2']);
        });

        it('shows an error state and retries', async () => {
            setupRpc({ coursesError: true });
            renderViewer(routes, '/courses');

            expect(await screen.findByText('Failed to load courses')).toBeInTheDocument();
            expect(screen.getByText('Permission denied')).toBeInTheDocument();

            setupRpc();
            fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
            expect(await screen.findByText('First Aid Training')).toBeInTheDocument();
        });
    });

    describe('roster', () => {
        it('loads the whole roster once and orders it by status, priority and queue', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');

            expect(supabase.rpc).toHaveBeenCalledWith('get_viewer_course_roster', { p_course_id: 'course-1', p_status: null, p_search: null });
            // confirmed (oldest first) → invited → queue (priority first, then queue position)
            expect(rowNames()).toEqual(['Evan Green', 'Dana White', 'Fiona Black', 'Bob Jones', 'Alice Smith', 'Charlie Brown']);
        });

        it('switches status tabs instantly and keeps the tab in the URL', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');

            fireEvent.click(screen.getByRole('tab', { name: /In queue/ }));
            expect(location()).toBe('/courses/course-1?status=requested');
            expect(rowNames()).toEqual(['Bob Jones', 'Alice Smith', 'Charlie Brown']);
            expect(supabase.rpc).toHaveBeenCalledTimes(3); // courses + upcoming + roster: no refetch per tab

            fireEvent.click(screen.getByRole('tab', { name: /Awaiting approval/ }));
            expect(rowNames()).toEqual(['Evan Green']);
        });

        it('searches by name, email and phone digits', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');
            const input = screen.getByRole('searchbox', { name: 'Search students in this course' });

            fireEvent.change(input, { target: { value: 'alice' } });
            expect(rowNames()).toEqual(['Alice Smith']);

            fireEvent.change(input, { target: { value: '111 222' } });
            expect(rowNames()).toEqual(['Charlie Brown']);

            fireEvent.keyDown(input, { key: 'Escape' });
            expect(screen.getAllByTestId('roster-row')).toHaveLength(6);
        });

        it('sorts by name', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');

            fireEvent.change(screen.getAllByLabelText('Sort')[0], { target: { value: 'name' } });
            expect(rowNames()).toEqual(['Fiona Black', 'Charlie Brown', 'Evan Green', 'Bob Jones', 'Alice Smith', 'Dana White']);
        });

        it('filters by course date chips and hides past dates until asked', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');
            const dates = screen.getByRole('group', { name: 'Course dates' });

            expect(within(dates).getByRole('button', { name: /Today/ })).toBeInTheDocument();
            fireEvent.click(within(dates).getByRole('button', { name: '+1 past' }));
            expect(location()).toContain('past=1');

            fireEvent.click(within(dates).getByRole('button', { name: /Today/ }));
            expect(location()).toContain(`date=${TODAY}`);
            expect(rowNames()).toEqual(['Dana White']);
        });

        it('applies a deep-linked date (e.g. from Home) on load', async () => {
            renderViewer(routes, `/courses/course-1?date=${NEXT_WEEK}`);
            await screen.findByText('Fiona Black');
            expect(rowNames()).toEqual(['Fiona Black']);
            expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 of 6');
        });

        it('surfaces declined completion requests', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');

            expect(screen.getByText(/No attendance sheet/)).toBeInTheDocument();
            fireEvent.click(screen.getByText(/declined by an admin/));
            expect(location()).toContain('status=declined');
            expect(rowNames()).toEqual(['Fiona Black']);
        });

        it('copies email with one click', async () => {
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { clipboard: { writeText } });
            renderViewer(routes, '/courses/course-1');

            fireEvent.click(await screen.findByText('alice@example.com'));
            expect(writeText).toHaveBeenCalledWith('alice@example.com');
            expect(await screen.findByText('Email copied')).toBeInTheDocument();
            // copying never opens the student
            expect(location()).toBe('/courses/course-1');
        });

        it('opens the student drawer (via ?student=) when a row is clicked', async () => {
            renderViewer(routes, '/courses/course-1');
            fireEvent.click(await screen.findByText('Bob Jones'));
            expect(location()).toBe('/courses/course-1?student=st-2');
        });

        it('selects rows (incl. shift-click ranges) and runs bulk actions', async () => {
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { clipboard: { writeText } });
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Bob Jones');

            fireEvent.click(screen.getByRole('checkbox', { name: 'Select Evan Green' }));
            fireEvent.click(screen.getByRole('checkbox', { name: 'Select Fiona Black' }), { shiftKey: true });
            const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
            expect(bar).toHaveTextContent('3 selected');

            fireEvent.click(within(bar).getByRole('button', { name: /Emails/ }));
            expect(writeText).toHaveBeenCalledWith('evan@example.com, dana@example.com, fiona@example.com');

            fireEvent.click(within(bar).getByRole('button', { name: /Export/ }));
            await waitFor(() => expect(exportViewerRosterToExcel).toHaveBeenCalledTimes(1));
            const args = (exportViewerRosterToExcel as any).mock.calls[0][0];
            expect(args.items.map((i: any) => i.enrollment_id)).toEqual(['en-5', 'en-4', 'en-6']);
            expect(args.courseName).toBe('First Aid Training');

            // Evan is already awaiting approval → only 2 of 3 can be requested
            fireEvent.click(within(bar).getByRole('button', { name: /Mark completed \(2\)/ }));
            const dialog = await screen.findByRole('dialog', { name: 'Request completion' });
            expect(within(dialog).getByText('Dana White')).toBeInTheDocument();
            expect(within(dialog).queryByText('Evan Green')).not.toBeInTheDocument();

            fireEvent.click(within(dialog).getByRole('button', { name: /Submit request/ }));
            await waitFor(() => {
                expect(supabase.rpc).toHaveBeenCalledWith('request_course_completion', expect.objectContaining({ p_enrollment_ids: ['en-4', 'en-6'] }));
            });
            await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument());
        });

        it('select-all toggles every visible row and Escape clears the selection', async () => {
            renderViewer(routes, '/courses/course-1?status=requested');
            await screen.findByText('Bob Jones');

            fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
            expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toHaveTextContent('3 selected');

            fireEvent.keyDown(window, { key: 'Escape' });
            expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
        });

        it('requests completion for a single student with the course day preselected', async () => {
            renderViewer(routes, '/courses/course-1');
            await screen.findByText('Dana White');

            fireEvent.click(screen.getByRole('button', { name: 'Mark Dana White completed' }));
            expect(await screen.findByLabelText('Completion date')).toHaveValue(TODAY);
        });

        it('shows a not-found state for an unknown course', async () => {
            (supabase.rpc as any).mockImplementation((name: string) => {
                if (name === 'get_viewer_courses') return Promise.resolve({ data: mockCourses, error: null });
                return Promise.resolve({ data: [], error: null });
            });
            renderViewer(routes, '/courses/nope');
            expect(await screen.findByText('Course not found')).toBeInTheDocument();
        });
    });
});
