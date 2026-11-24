import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Route } from 'react-router-dom';
import ViewerCourseRoster from './ViewerCourseRoster';
import { supabase } from '../../lib/supabase';
import { exportViewerRosterToExcel } from '../../lib/excelExport';
import { renderViewer, isoFromToday } from './testUtils';
import type { ViewerCourseRosterItem } from '../../lib/types';

vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

vi.mock('../../lib/excelExport', () => ({
    exportViewerRosterToExcel: vi.fn().mockResolvedValue(undefined),
}));

const TODAY = isoFromToday(0);
const NEXT_WEEK = isoFromToday(7);
const LAST_WEEK = isoFromToday(-7);

const mockCourses = [
    {
        id: 'course-1',
        name: 'Safe Pass',
        created_at: '2026-01-01T00:00:00Z',
        total_count: 7,
        requested_count: 3,
        invited_count: 1,
        confirmed_count: 2,
        completed_count: 1,
        rejected_count: 0,
        pending_approval_count: 1,
    },
];

function makeRosterItem(
    overrides: Partial<ViewerCourseRosterItem> & Pick<ViewerCourseRosterItem, 'enrollment_id' | 'student_id' | 'first_name' | 'last_name'>,
): ViewerCourseRosterItem {
    return {
        email: `${overrides.first_name.toLowerCase()}.${overrides.last_name.toLowerCase()}@example.com`,
        phone: null,
        status: 'requested',
        course_variant: null,
        notes: null,
        created_at: '2026-01-10T00:00:00Z',
        invited_date: null,
        invited_at: null,
        confirmed_date: null,
        confirmed_at: null,
        completed_date: null,
        completed_at: null,
        is_priority: false,
        queue_position: null,
        completion_request_status: 'none',
        pending_completion_date: null,
        completion_requested_at: null,
        completion_requested_by: null,
        completion_rejection_reason: null,
        ...overrides,
    };
}

const mockRoster: ViewerCourseRosterItem[] = [
    makeRosterItem({
        enrollment_id: 'en-3',
        student_id: 'st-3',
        first_name: 'Charlie',
        last_name: 'Brown',
        phone: '087 111 2223',
        status: 'requested',
        course_variant: 'English',
        queue_position: 3,
        created_at: '2026-01-03T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-1',
        student_id: 'st-1',
        first_name: 'Alice',
        last_name: 'Smith',
        phone: '0851234567',
        status: 'requested',
        course_variant: 'English',
        queue_position: 1,
        created_at: '2026-01-01T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-2',
        student_id: 'st-2',
        first_name: 'Bob',
        last_name: 'Jones',
        phone: '0869998888',
        status: 'requested',
        course_variant: 'Ukrainian',
        queue_position: 2,
        is_priority: true,
        created_at: '2026-01-02T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-4',
        student_id: 'st-4',
        first_name: 'Dana',
        last_name: 'White',
        status: 'confirmed',
        course_variant: 'English',
        invited_date: TODAY,
        confirmed_date: TODAY,
        created_at: '2025-12-01T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-5',
        student_id: 'st-5',
        first_name: 'Evan',
        last_name: 'Green',
        status: 'confirmed',
        course_variant: 'Ukrainian',
        confirmed_date: LAST_WEEK,
        completion_request_status: 'pending',
        created_at: '2025-11-01T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-6',
        student_id: 'st-6',
        first_name: 'Fiona',
        last_name: 'Black',
        status: 'invited',
        course_variant: 'English',
        invited_date: NEXT_WEEK,
        completion_request_status: 'rejected',
        completion_rejection_reason: 'Missing sign-in sheet',
        created_at: '2025-10-01T00:00:00Z',
    }),
    makeRosterItem({
        enrollment_id: 'en-7',
        student_id: 'st-7',
        first_name: 'Grace',
        last_name: 'Taylor',
        status: 'completed',
        course_variant: 'English',
        completed_date: LAST_WEEK,
        created_at: '2025-09-01T00:00:00Z',
    }),
];

function renderRoster(courseId = 'course-1', path = `/courses/${courseId}`) {
    return renderViewer(
        <Route path="/courses/:courseId" element={<ViewerCourseRoster courseId={courseId} />} />,
        path,
    );
}

function setupRpc({
    courses = mockCourses,
    roster = mockRoster,
    rosterError = null,
    rangeCalls,
}: {
    courses?: typeof mockCourses;
    roster?: ViewerCourseRosterItem[];
    rosterError?: { message: string } | null;
    rangeCalls?: Array<[number, number]>;
} = {}) {
    vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
        if (name === 'get_viewer_courses') {
            return Promise.resolve({ data: courses, error: null });
        }
        if (name === 'get_viewer_upcoming_courses') {
            return Promise.resolve({
                data: [
                    {
                        course_id: 'course-1',
                        course_name: 'Safe Pass',
                        course_date: TODAY,
                        confirmed_count: 1,
                        pending_count: 0,
                        completed_count: 0,
                        total_active_count: 1,
                    },
                ],
                error: null,
            });
        }
        if (name === 'get_viewer_course_roster') {
            return {
                range: (from: number, to: number) => {
                    rangeCalls?.push([from, to]);
                    if (rosterError) return Promise.resolve({ data: null, error: rosterError });
                    return Promise.resolve({ data: roster.slice(from, to + 1), error: null });
                },
            };
        }
        return Promise.resolve({ data: null, error: null });
    }) as never);
}

const rowNames = () =>
    screen.getAllByTestId('roster-row').map(r => within(r).getAllByText(/\w+ \w+/)[0].textContent);
const locationText = () => screen.getByTestId('location').textContent;

describe('ViewerCourseRoster', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        setupRpc();
    });

    it('renders course details, status tabs, declined banner, and default ordered roster', async () => {
        renderRoster();

        expect(await screen.findByRole('heading', { name: 'Safe Pass' })).toBeInTheDocument();
        await screen.findByText('Bob Jones');

        expect(supabase.rpc).toHaveBeenCalledWith('get_viewer_course_roster', {
            p_course_id: 'course-1',
            p_status: null,
            p_search: null,
        });
        // Order: confirmed (oldest first) -> invited -> requested (priority first, then queue_position) -> completed
        expect(rowNames()).toEqual([
            'Evan Green',
            'Dana White',
            'Fiona Black',
            'Bob Jones',
            'Alice Smith',
            'Charlie Brown',
            'Grace Taylor',
        ]);
        expect(screen.getByText(/Missing sign-in sheet/)).toBeInTheDocument();
        expect(screen.getByText(/declined by an admin/)).toBeInTheDocument();
    });

    it('shows Course not found empty state when course does not exist and roster is empty', async () => {
        setupRpc({ courses: [], roster: [] });
        renderRoster('missing-course');

        expect(await screen.findByText('Course not found')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /All courses/ })).toBeInTheDocument();
    });

    it('shows error state when roster fetch fails and retries on click', async () => {
        setupRpc({ rosterError: { message: 'Database unavailable' } });
        renderRoster();

        expect(await screen.findByText('Failed to load roster')).toBeInTheDocument();
        expect(screen.getByText('Database unavailable')).toBeInTheDocument();

        setupRpc();
        fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
        expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    });

    it('filters by status tabs without refetching and syncs status to URL', async () => {
        renderRoster();
        await screen.findByText('Bob Jones');
        const initialRpcCount = vi.mocked(supabase.rpc).mock.calls.length;

        fireEvent.click(screen.getByRole('tab', { name: /Confirmed/ }));
        expect(locationText()).toBe('/courses/course-1?status=confirmed');
        expect(rowNames()).toEqual(['Evan Green', 'Dana White']);

        fireEvent.click(screen.getByRole('tab', { name: /In queue/ }));
        expect(locationText()).toBe('/courses/course-1?status=requested');
        expect(rowNames()).toEqual(['Bob Jones', 'Alice Smith', 'Charlie Brown']);

        fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
        expect(locationText()).toBe('/courses/course-1?status=completed');
        expect(rowNames()).toEqual(['Grace Taylor']);

        fireEvent.click(screen.getByRole('tab', { name: /Awaiting approval/ }));
        expect(locationText()).toBe('/courses/course-1?status=awaiting');
        expect(rowNames()).toEqual(['Evan Green']);

        fireEvent.click(screen.getByRole('tab', { name: /Declined/ }));
        expect(locationText()).toBe('/courses/course-1?status=declined');
        expect(rowNames()).toEqual(['Fiona Black']);

        // Client-side tab filtering never triggers extra RPC calls
        expect(vi.mocked(supabase.rpc).mock.calls.length).toBe(initialRpcCount);
    });

    it('filters by search across name, email, and phone digits, and clears filters from empty state', async () => {
        renderRoster();
        await screen.findByText('Alice Smith');
        const searchInput = screen.getByRole('searchbox', { name: 'Search students in this course' });

        // Name match
        fireEvent.change(searchInput, { target: { value: 'dana white' } });
        expect(rowNames()).toEqual(['Dana White']);

        // Email match
        fireEvent.change(searchInput, { target: { value: 'grace.taylor@' } });
        expect(rowNames()).toEqual(['Grace Taylor']);

        // Phone digit match ignoring spaces
        fireEvent.change(searchInput, { target: { value: '1112223' } });
        expect(rowNames()).toEqual(['Charlie Brown']);

        // No match -> empty state -> Clear filters restores full roster
        fireEvent.change(searchInput, { target: { value: 'nonexistent-person' } });
        expect(screen.getByText('No students match')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
        expect(screen.getAllByTestId('roster-row')).toHaveLength(7);
    });

    it('filters by stream, date chips (including past dates), and sorts by name', async () => {
        renderRoster();
        await screen.findByText('Alice Smith');

        // Filter by stream (course variant)
        fireEvent.change(screen.getAllByLabelText('Stream')[0], { target: { value: 'Ukrainian' } });
        expect(locationText()).toContain('stream=Ukrainian');
        expect(rowNames()).toEqual(['Evan Green', 'Bob Jones']);

        // Clear filters
        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        expect(screen.getAllByTestId('roster-row')).toHaveLength(7);

        // Reveal past date chip and filter by Today
        const dateGroup = screen.getByRole('group', { name: 'Course dates' });
        fireEvent.click(within(dateGroup).getByRole('button', { name: '+1 past' }));
        expect(locationText()).toContain('past=1');

        fireEvent.click(within(dateGroup).getByRole('button', { name: /Today/ }));
        expect(locationText()).toContain(`date=${TODAY}`);
        expect(rowNames()).toEqual(['Dana White']);

        // Clear date and sort by Name A-Z
        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        fireEvent.change(screen.getAllByLabelText('Sort')[0], { target: { value: 'name' } });
        expect(rowNames()).toEqual([
            'Fiona Black',
            'Charlie Brown',
            'Evan Green',
            'Bob Jones',
            'Alice Smith',
            'Grace Taylor',
            'Dana White',
        ]);
    });

    it('paginates get_viewer_course_roster across more than 1000 rows using range()', async () => {
        const rangeCalls: Array<[number, number]> = [];
        const largeRoster: ViewerCourseRosterItem[] = Array.from({ length: 1250 }, (_, i) => {
            const isSecondPage = i >= 1000;
            const isLast = i === 1249;
            return makeRosterItem({
                enrollment_id: `en-big-${i}`,
                student_id: `st-big-${i}`,
                first_name: isLast ? 'Zara' : `Student${i}`,
                last_name: isLast ? 'PageTwo' : `Row${String(i).padStart(4, '0')}`,
                status: isSecondPage ? 'completed' : 'requested',
                queue_position: isSecondPage ? null : i + 1,
                completed_date: isSecondPage ? LAST_WEEK : null,
                created_at: '2026-01-01T00:00:00Z',
            });
        });

        setupRpc({
            courses: [
                {
                    ...mockCourses[0],
                    total_count: 1250,
                    requested_count: 1000,
                    completed_count: 250,
                },
            ],
            roster: largeRoster,
            rangeCalls,
        });

        // Start on ?status=completed so DOM stays fast while fetchAllPages reads all 1250 rows across both pages
        renderRoster('course-1', '/courses/course-1?status=completed');

        expect(await screen.findByText('Zara PageTwo')).toBeInTheDocument();

        // Verify PostgREST pagination requests covered both page 0 and page 1
        expect(rangeCalls).toContainEqual([0, 999]);
        expect(rangeCalls).toContainEqual([1000, 1999]);

        // Tab badges reflect the full concatenated roster across all pages
        expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('1250');
        expect(screen.getByRole('tab', { name: /In queue/ })).toHaveTextContent('1000');
        expect(screen.getByRole('tab', { name: /Completed/ })).toHaveTextContent('250');

        // Searching finds a student from page 2 (index 1249)
        const searchInput = screen.getByRole('searchbox', { name: 'Search students in this course' });
        fireEvent.change(searchInput, { target: { value: 'Zara PageTwo' } });
        expect(rowNames()).toEqual(['Zara PageTwo']);
    });

    it('supports row selection and exports selected students to Excel', async () => {
        renderRoster();
        await screen.findByText('Dana White');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Select Dana White' }));
        const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
        expect(within(toolbar).getByText('1 selected')).toBeInTheDocument();

        fireEvent.click(within(toolbar).getByRole('button', { name: 'Export' }));
        await waitFor(() =>
            expect(exportViewerRosterToExcel).toHaveBeenCalledWith(
                expect.objectContaining({
                    courseName: 'Safe Pass',
                    items: [expect.objectContaining({ enrollment_id: 'en-4' })],
                }),
            ),
        );

        fireEvent.click(within(toolbar).getByRole('button', { name: 'Clear selection' }));
        expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });
});
