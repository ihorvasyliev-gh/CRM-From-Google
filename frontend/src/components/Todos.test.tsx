import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from './ui/Tooltip';
import Todos from './Todos';
import type { AdminProfile, AdminTodo } from '../lib/todos';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockClear = vi.fn();
const mockAddComment = vi.fn();
const mockDeleteComment = vi.fn();
const mockRefetch = vi.fn();

const mockProfiles: AdminProfile[] = [
    { id: 'admin-1', email: 'ihor@ccp.ie', full_name: 'Ihor Vasyliev' },
    { id: 'admin-2', email: 'kate@ccp.ie', full_name: 'Kate Murphy' },
];

let mockTodosState: { rows: AdminTodo[]; available: boolean } = { rows: [], available: true };

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'admin-1', email: 'ihor@ccp.ie', user_metadata: { full_name: 'Ihor Vasyliev' } },
        session: null,
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
    }),
}));

vi.mock('../lib/queries', () => ({
    fetchCourses: vi.fn().mockResolvedValue([
        { id: 'course-1', name: 'Safe Pass', created_at: '2026-01-01T00:00:00Z' },
    ]),
}));

vi.mock('../hooks/useCourseSessions', () => ({
    useCourseSessions: () => new Map(),
}));

vi.mock('../hooks/useTodos', () => ({
    TODOS_KEY: ['admin_todos'],
    useAdminTodos: () => ({
        data: mockTodosState,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: mockRefetch,
    }),
    useAdminProfiles: () => ({
        profiles: mockProfiles,
        byId: new Map(mockProfiles.map(p => [p.id, p])),
        isLoading: false,
    }),
    useCreateTodo: () => ({
        mutateAsync: mockCreate,
        isPending: false,
    }),
    useUpdateTodo: () => ({
        mutateAsync: mockUpdate,
        isPending: false,
    }),
    useDeleteTodo: () => ({
        mutateAsync: mockDelete,
        isPending: false,
    }),
    useClearCompletedTodos: () => ({
        mutateAsync: mockClear,
        isPending: false,
    }),
    useTodoComments: () => ({
        data: [
            {
                id: 'cmt-1',
                todo_id: 'todo-1',
                body: 'Trainer confirmed 9:30 start',
                created_by: 'admin-2',
                created_at: '2026-05-10T09:00:00Z',
            },
        ],
        isLoading: false,
    }),
    useAddTodoComment: () => ({
        mutateAsync: mockAddComment,
        isPending: false,
    }),
    useDeleteTodoComment: () => ({
        mutateAsync: mockDeleteComment,
        isPending: false,
    }),
}));

function makeTodo(overrides: Partial<AdminTodo> = {}): AdminTodo {
    return {
        id: 'todo-1',
        title: 'Booked room at Community Hall',
        description: 'Key pickup at reception',
        category: 'booking',
        status: 'open',
        priority: 'high',
        is_pinned: true,
        due_date: '2026-05-14',
        course_id: 'course-1',
        course_date: '2026-05-14',
        student_id: 'stu-1',
        checklist: [
            { id: 'c1', text: 'Book venue', done: true },
            { id: 'c2', text: 'Pay invoice', done: false },
        ],
        assignee_id: 'admin-1',
        created_by: 'admin-2',
        completed_by: null,
        completed_at: null,
        created_at: '2026-05-09T10:00:00Z',
        updated_at: '2026-05-09T10:00:00Z',
        courses: { id: 'course-1', name: 'Safe Pass' },
        students: { id: 'stu-1', first_name: 'Anna', last_name: 'Koval' },
        comment_count: 1,
        ...overrides,
    };
}

function renderTodos(props: React.ComponentProps<typeof Todos> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <TooltipProvider>
                <Todos {...props} />
            </TooltipProvider>
        </QueryClientProvider>,
    );
}

describe('Todos page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreate.mockResolvedValue(makeTodo({ id: 'todo-new' }));
        mockUpdate.mockResolvedValue(makeTodo());
        mockDelete.mockResolvedValue('todo-1');
        mockClear.mockResolvedValue(1);
        mockAddComment.mockResolvedValue({ id: 'cmt-2', todo_id: 'todo-1', body: 'Done!', created_by: 'admin-1', created_at: new Date().toISOString() });
        mockTodosState = {
            available: true,
            rows: [
                makeTodo(),
                makeTodo({
                    id: 'todo-2',
                    title: 'Order catering for Barista',
                    category: 'course',
                    is_pinned: false,
                    assignee_id: 'admin-2',
                    courses: null,
                    students: null,
                    checklist: [],
                    comment_count: 0,
                }),
                makeTodo({
                    id: 'todo-3',
                    title: 'Sent SICAP report',
                    category: 'finance',
                    status: 'done',
                    is_pinned: false,
                    completed_by: 'admin-1',
                    completed_at: '2026-05-08T14:00:00Z',
                    courses: null,
                    students: null,
                    checklist: [],
                    comment_count: 0,
                }),
            ],
        };
    });

    it('renders pinned and active items and switches to Done history tab', () => {
        renderTodos();
        expect(screen.getByText('Booked room at Community Hall')).toBeInTheDocument();
        expect(screen.getByText('Order catering for Barista')).toBeInTheDocument();
        expect(screen.queryByText('Sent SICAP report')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Done/i }));
        expect(screen.getByText('Sent SICAP report')).toBeInTheDocument();
        expect(screen.queryByText('Booked room at Community Hall')).not.toBeInTheDocument();
    });

    it('creates a new to-do via the Quick Add bar and supports templates', async () => {
        renderTodos();

        fireEvent.click(screen.getByRole('button', { name: /Templates/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /Course Booking Checklist/i }));

        const input = screen.getByLabelText('New to-do title') as HTMLInputElement;
        expect(input.value).toContain('Course setup & bookings');
        fireEvent.change(input, { target: { value: 'Safe Pass June booking' } });
        fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

        await waitFor(() => {
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Safe Pass June booking',
                    category: 'booking',
                    priority: 'high',
                }),
            );
        });
        expect(mockCreate.mock.calls[0][0].checklist.length).toBeGreaterThan(3);
    });

    it('toggles completion, in-progress status, and navigates on linked course/student pills', async () => {
        const onNavigate = vi.fn();
        const onOpenStudentDetail = vi.fn();
        renderTodos({ onNavigate, onOpenStudentDetail });

        fireEvent.click(screen.getByRole('button', { name: /Safe Pass/i }));
        expect(onNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'course-1', courseDate: '2026-05-14' });

        fireEvent.click(screen.getByRole('button', { name: /Anna Koval/i }));
        expect(onOpenStudentDetail).toHaveBeenCalledWith('stu-1');

        fireEvent.click(screen.getByRole('button', { name: 'Mark "Booked room at Community Hall" as done' }));
        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({ id: 'todo-1', patch: { status: 'done' } });
        });
    });

    it('opens detail modal, displays comments, and posts a new comment', async () => {
        renderTodos();
        fireEvent.click(screen.getByText('Booked room at Community Hall'));

        expect(await screen.findByText('To-Do Details')).toBeInTheDocument();
        expect(screen.getByText('Trainer confirmed 9:30 start')).toBeInTheDocument();

        const commentBox = screen.getByPlaceholderText(/Write an update or handoff note/i);
        fireEvent.change(commentBox, { target: { value: 'Keys collected!' } });
        fireEvent.click(screen.getByRole('button', { name: /Post/i }));

        await waitFor(() => {
            expect(mockAddComment).toHaveBeenCalledWith({ todoId: 'todo-1', body: 'Keys collected!' });
        });
    });

    it('filters by assignee "Assigned to me"', () => {
        renderTodos();
        fireEvent.change(screen.getByLabelText('Filter by assignee'), { target: { value: 'mine' } });
        expect(screen.getByText('Booked room at Community Hall')).toBeInTheDocument();
        expect(screen.queryByText('Order catering for Barista')).not.toBeInTheDocument();
    });

    it('shows migration notice when table is not yet created', () => {
        mockTodosState = { rows: [], available: false };
        renderTodos();
        expect(screen.getByText('Database migration required')).toBeInTheDocument();
        expect(screen.getByText(/96_admin_todos\.sql/)).toBeInTheDocument();
    });
});
