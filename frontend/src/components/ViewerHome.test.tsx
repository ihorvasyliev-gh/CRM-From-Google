import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Route } from 'react-router-dom';
import ViewerHome from './ViewerHome';
import { supabase } from '../lib/supabase';
import { renderViewer, isoFromToday } from './Viewer/testUtils';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

const TODAY = isoFromToday(0);
const TOMORROW = isoFromToday(1);
const LATER = isoFromToday(30);

const courses = [
    { id: 'c-1', name: 'Manual Handling', created_at: '2026-01-01', total_count: 20, requested_count: 5, invited_count: 3, confirmed_count: 7, completed_count: 5, rejected_count: 0, pending_approval_count: 2 },
    { id: 'c-2', name: 'Safe Pass', created_at: '2026-01-01', total_count: 8, requested_count: 8, invited_count: 0, confirmed_count: 0, completed_count: 0, rejected_count: 0, pending_approval_count: 0 },
];
const upcoming = [
    { course_id: 'c-1', course_name: 'Manual Handling', course_date: TODAY, confirmed_count: 6, pending_count: 1, total_active_count: 7 },
    { course_id: 'c-2', course_name: 'Safe Pass', course_date: TOMORROW, confirmed_count: 4, pending_count: 0, total_active_count: 4 },
    { course_id: 'c-1', course_name: 'Manual Handling', course_date: LATER, confirmed_count: 2, pending_count: 3, total_active_count: 5 },
    // Nobody pending/confirmed/completed: not a session
    { course_id: 'c-2', course_name: 'Safe Pass', course_date: isoFromToday(3), confirmed_count: 0, pending_count: 0, completed_count: 0, total_active_count: 0 },
];

describe('ViewerHome', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        (supabase.rpc as any).mockImplementation((name: string) => {
            if (name === 'get_viewer_courses') return Promise.resolve({ data: courses, error: null });
            if (name === 'get_viewer_upcoming_courses') return Promise.resolve({ data: upcoming, error: null });
            return Promise.resolve({ data: null, error: null });
        });
    });

    const render = () => renderViewer(
        <>
            <Route path="/home" element={<ViewerHome />} />
            <Route path="*" element={null} />
        </>,
        '/home'
    );

    it('summarises the next two weeks', async () => {
        render();
        expect(await screen.findByText('Sessions · next 14 days')).toBeInTheDocument();
        // 2 sessions within 14 days, 10 confirmed (+1 awaiting reply), 13 in queues, 2 awaiting approval
        expect(await screen.findByText('+1 awaiting reply')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('13')).toBeInTheDocument();
    });

    it('groups upcoming sessions by day and opens the roster for that date', async () => {
        render();
        expect(await screen.findByText('Today')).toBeInTheDocument();
        expect(screen.getByText('Tomorrow')).toBeInTheDocument();
        expect(screen.getByText('Later')).toBeInTheDocument();
        expect(screen.queryByText('Next 7 days')).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: /Safe Pass/ })[0]);
        expect(screen.getByTestId('location').textContent).toBe(`/courses/c-2?date=${TOMORROW}`);
    });

    it('lists courses with completion requests awaiting approval', async () => {
        render();
        const item = await screen.findByRole('button', { name: /Manual Handling\s*2$/ });
        fireEvent.click(item);
        expect(screen.getByTestId('location').textContent).toBe('/courses/c-1?status=awaiting');
    });

    it('shows confirmed out of max places and marks full sessions red', async () => {
        (supabase.rpc as any).mockImplementation((name: string) => {
            if (name === 'get_viewer_courses') return Promise.resolve({ data: courses, error: null });
            if (name === 'get_viewer_upcoming_courses') return Promise.resolve({
                data: [
                    { course_id: 'c-1', course_name: 'Manual Handling', course_date: TOMORROW, confirmed_count: 12, pending_count: 3, max_capacity: 12, is_full: true },
                    { course_id: 'c-2', course_name: 'Safe Pass', course_date: LATER, confirmed_count: 5, pending_count: 2, max_capacity: 20, is_full: false },
                    { course_id: 'c-2', course_name: 'Safe Pass', course_date: isoFromToday(40), confirmed_count: 4, pending_count: 0, max_capacity: null, is_full: false },
                ],
                error: null,
            });
            return Promise.resolve({ data: null, error: null });
        });
        render();

        const full = await screen.findByTitle('Full — 12 places');
        expect(full).toHaveTextContent('12/12 full');
        expect(full).toHaveClass('status-pill-rejected');

        const open = screen.getByTitle('Confirmed of 20 places');
        expect(open).toHaveTextContent('5/20 confirmed');
        expect(open).toHaveClass('status-pill-confirmed');
        expect(screen.getAllByTitle('Invited, waiting for a reply').map(el => el.textContent)).toEqual(['3 pending', '2 pending']);

        // No limit set: just the confirmed count
        expect(screen.getByText('4', { selector: '[title="Confirmed"]' })).toBeInTheDocument();
    });

    it('shows the registration form link', async () => {
        render();
        expect((await screen.findAllByText('Registration Form')).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: /Open/ })[0]).toHaveAttribute('href', 'https://forms.gle/9U4DsSe5UYnsakJZ8');
    });

    it('shows pinned courses first when there are any', async () => {
        window.localStorage.setItem('viewer_pinned_courses', JSON.stringify(['c-2']));
        render();
        expect(await screen.findByText('Pinned courses')).toBeInTheDocument();
    });
});
