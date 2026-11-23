import { describe, it, expect } from 'vitest';
import {
    addDaysISO,
    adminDisplayName,
    adminInitials,
    adminShortName,
    checklistProgress,
    computeTodoStats,
    filterTodos,
    formatDueLabel,
    getDueState,
    normalizeChecklist,
    selectDashboardTodos,
    sortTodos,
    type AdminProfile,
    type AdminTodo,
    type TodoFilterState,
} from './todos';

function makeTodo(overrides: Partial<AdminTodo> = {}): AdminTodo {
    return {
        id: 'todo-1',
        title: 'Book training room',
        description: '',
        category: 'booking',
        status: 'open',
        priority: 'normal',
        is_pinned: false,
        due_date: null,
        course_id: null,
        course_date: null,
        student_id: null,
        checklist: [],
        assignee_id: null,
        created_by: 'admin-1',
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

const PROFILES: AdminProfile[] = [
    { id: 'admin-1', email: 'ihor@ccp.ie', full_name: 'Ihor Vasyliev' },
    { id: 'admin-2', email: 'sarah.connor@ccp.ie', full_name: null },
];
const PROFILES_MAP = new Map(PROFILES.map(p => [p.id, p]));

describe('todos library helpers', () => {
    it('normalizes checklist items and ignores blank entries', () => {
        const items = normalizeChecklist([
            { id: 'a', text: '  Book venue  ', done: true },
            { text: '   ', done: false },
            { text: 'Confirm trainer', done: 0 },
            null,
            'invalid',
        ]);
        expect(items).toEqual([
            { id: 'a', text: 'Book venue', done: true },
            { id: 'item-2', text: 'Confirm trainer', done: false },
        ]);
        expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
    });

    it('formats admin names and initials with email fallback', () => {
        expect(adminDisplayName(PROFILES[0])).toBe('Ihor Vasyliev');
        expect(adminShortName(PROFILES[0])).toBe('Ihor');
        expect(adminInitials(PROFILES[0])).toBe('IV');

        expect(adminDisplayName(PROFILES[1])).toBe('sarah.connor');
        expect(adminInitials(PROFILES[1])).toBe('SC');

        expect(adminDisplayName(null)).toBe('Admin');
    });

    it('computes due states and labels relative to today', () => {
        const today = '2026-05-10';
        expect(addDaysISO(today, 1)).toBe('2026-05-11');
        expect(getDueState('2026-05-09', 'open', today)).toBe('overdue');
        expect(getDueState('2026-05-10', 'open', today)).toBe('today');
        expect(getDueState('2026-05-11', 'open', today)).toBe('tomorrow');
        expect(getDueState('2026-05-20', 'open', today)).toBe('upcoming');
        expect(getDueState('2026-05-09', 'done', today)).toBeNull();

        expect(formatDueLabel('2026-05-10', 'open', today)).toBe('Today');
        expect(formatDueLabel('2026-05-11', 'open', today)).toBe('Tomorrow');
        expect(formatDueLabel('2026-05-08', 'open', today)).toMatch(/^Overdue · /);
    });

    it('sorts active todos by pinned, overdue, priority, due date, in_progress, then newest', () => {
        const today = '2026-05-10';
        const items = [
            makeTodo({ id: 'normal-old', created_at: '2026-05-01T09:00:00Z' }),
            makeTodo({ id: 'normal-in-prog', status: 'in_progress', created_at: '2026-05-01T08:00:00Z' }),
            makeTodo({ id: 'urgent-item', priority: 'urgent' }),
            makeTodo({ id: 'overdue-item', due_date: '2026-05-08', priority: 'normal' }),
            makeTodo({ id: 'pinned-item', is_pinned: true, priority: 'normal' }),
            makeTodo({ id: 'due-soon', due_date: '2026-05-11', priority: 'normal' }),
        ];

        const sorted = sortTodos(items, 'active', today);
        expect(sorted.map(t => t.id)).toEqual([
            'pinned-item',
            'overdue-item',
            'urgent-item',
            'due-soon',
            'normal-in-prog',
            'normal-old',
        ]);
    });

    it('sorts done todos by completed_at descending', () => {
        const items = [
            makeTodo({ id: 'older', status: 'done', completed_at: '2026-05-08T10:00:00Z' }),
            makeTodo({ id: 'newer', status: 'done', completed_at: '2026-05-10T12:00:00Z' }),
        ];
        expect(sortTodos(items, 'done', '2026-05-10').map(t => t.id)).toEqual(['newer', 'older']);
    });

    it('filters by tab, category, assignee, focus, and search across linked entities & checklist', () => {
        const today = '2026-05-10';
        const todos = [
            makeTodo({
                id: 't1',
                title: 'Safe Pass room booking',
                category: 'booking',
                assignee_id: 'admin-1',
                status: 'in_progress',
                due_date: '2026-05-12',
                courses: { id: 'c1', name: 'Safe Pass' },
                checklist: [{ id: '1', text: 'Call hotel reception', done: false }],
            }),
            makeTodo({
                id: 't2',
                title: 'Call student about PPSN',
                category: 'student',
                assignee_id: null,
                students: { id: 's1', first_name: 'Olena', last_name: 'Koval' },
            }),
            makeTodo({
                id: 't3',
                title: 'Done note',
                status: 'done',
                completed_at: '2026-05-09T10:00:00Z',
            }),
        ];

        const base: TodoFilterState = {
            tab: 'active',
            search: '',
            category: 'all',
            assignee: 'all',
            focus: 'all',
        };

        expect(filterTodos(todos, base, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t1', 't2']);
        expect(filterTodos(todos, { ...base, tab: 'done' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t3']);
        expect(filterTodos(todos, { ...base, assignee: 'mine' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t1']);
        expect(filterTodos(todos, { ...base, assignee: 'unassigned' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t2']);
        expect(filterTodos(todos, { ...base, focus: 'in_progress' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t1']);
        expect(filterTodos(todos, { ...base, focus: 'due_soon' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t1']);
        expect(filterTodos(todos, { ...base, search: 'Olena' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t2']);
        expect(filterTodos(todos, { ...base, search: 'reception' }, 'admin-1', PROFILES_MAP, today).map(t => t.id)).toEqual(['t1']);
    });

    it('computes stats and selects top dashboard items', () => {
        const today = '2026-05-10';
        const todos = [
            makeTodo({ id: '1', is_pinned: true }),
            makeTodo({ id: '2', due_date: '2026-05-09', status: 'in_progress' }),
            makeTodo({ id: '3', due_date: '2026-05-10', priority: 'urgent' }),
            makeTodo({ id: '4', status: 'done' }),
        ];

        expect(computeTodoStats(todos, today)).toEqual({
            openCount: 3,
            inProgressCount: 1,
            overdueCount: 1,
            dueTodayCount: 1,
            urgentCount: 1,
            pinnedCount: 1,
            doneCount: 1,
        });

        expect(selectDashboardTodos(todos, today, 2).map(t => t.id)).toEqual(['1', '2']);
    });
});
