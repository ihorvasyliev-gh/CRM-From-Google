import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TodoSummaryCard from './TodoSummaryCard';
import type { AdminTodo } from '../../lib/todos';

const mockUpdate = vi.fn();
let mockState: { rows: AdminTodo[]; available: boolean } = { rows: [], available: true };

vi.mock('../../hooks/useTodos', () => ({
    TODOS_KEY: ['admin_todos'],
    useAdminTodos: () => ({
        data: mockState,
        isLoading: false,
    }),
    useUpdateTodo: () => ({
        mutateAsync: mockUpdate,
        isPending: false,
    }),
}));

function makeTodo(overrides: Partial<AdminTodo> = {}): AdminTodo {
    return {
        id: 't-1',
        title: 'Confirm Safe Pass venue',
        description: '',
        category: 'booking',
        status: 'open',
        priority: 'high',
        is_pinned: true,
        due_date: '2026-05-10',
        course_id: null,
        course_date: null,
        student_id: null,
        checklist: [],
        assignee_id: null,
        created_by: null,
        completed_by: null,
        completed_at: null,
        created_at: '2026-05-01T10:00:00Z',
        updated_at: '2026-05-01T10:00:00Z',
        courses: null,
        students: null,
        comment_count: 0,
        ...overrides,
    };
}

function renderCard(onNavigate = vi.fn()) {
    const qc = new QueryClient();
    return {
        onNavigate,
        ...render(
            <QueryClientProvider client={qc}>
                <TodoSummaryCard onNavigate={onNavigate} />
            </QueryClientProvider>,
        ),
    };
}

describe('TodoSummaryCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdate.mockResolvedValue(makeTodo({ status: 'done' }));
    });

    it('renders nothing when migration is not applied yet', () => {
        mockState = { rows: [], available: false };
        const { container } = renderCard();
        expect(container.firstChild).toBeNull();
    });

    it('renders clean empty state with quick Add button when no open tasks exist', () => {
        mockState = { rows: [makeTodo({ status: 'done' })], available: true };
        const { onNavigate } = renderCard();
        expect(screen.getByText('Team To-Do is clear')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Add/i }));
        expect(onNavigate).toHaveBeenCalledWith('todos', { newTodo: true });
    });

    it('renders active items, navigates to detail on click, and marks done on checkbox click', async () => {
        mockState = { rows: [makeTodo()], available: true };
        const { onNavigate } = renderCard();

        expect(screen.getByText('Confirm Safe Pass venue')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Confirm Safe Pass venue'));
        expect(onNavigate).toHaveBeenCalledWith('todos', { todoId: 't-1' });

        fireEvent.click(screen.getByRole('button', { name: 'Complete "Confirm Safe Pass venue"' }));
        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({ id: 't-1', patch: { status: 'done' } });
        });
    });
});
