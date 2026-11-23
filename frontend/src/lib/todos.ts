import { todayISO } from './dateUtils';

export const TODO_CATEGORIES = ['general', 'booking', 'course', 'student', 'finance', 'note'] as const;
export type TodoCategory = typeof TODO_CATEGORIES[number];

export const TODO_STATUSES = ['open', 'in_progress', 'done'] as const;
export type TodoStatus = typeof TODO_STATUSES[number];

export const TODO_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type TodoPriority = typeof TODO_PRIORITIES[number];

export interface TodoChecklistItem {
    id: string;
    text: string;
    done: boolean;
}

export interface AdminProfile {
    id: string;
    email: string;
    full_name: string | null;
}

export interface TodoLinkedCourse {
    id: string;
    name: string;
}

export interface TodoLinkedStudent {
    id: string;
    first_name: string;
    last_name: string;
}

export interface AdminTodo {
    id: string;
    title: string;
    description: string;
    category: TodoCategory;
    status: TodoStatus;
    priority: TodoPriority;
    is_pinned: boolean;
    due_date: string | null;
    course_id: string | null;
    course_date: string | null;
    student_id: string | null;
    checklist: TodoChecklistItem[];
    assignee_id: string | null;
    created_by: string | null;
    completed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    courses?: TodoLinkedCourse | null;
    students?: TodoLinkedStudent | null;
    comment_count: number;
}

export interface AdminTodoComment {
    id: string;
    todo_id: string;
    body: string;
    created_by: string | null;
    created_at: string;
}

export interface TodoTemplate {
    id: string;
    label: string;
    description: string;
    category: TodoCategory;
    priority: TodoPriority;
    defaultTitle: string;
    checklist: string[];
}

export const TODO_TEMPLATES: readonly TodoTemplate[] = [
    {
        id: 'course-booking',
        label: 'Course Booking Checklist',
        description: 'End-to-end setup for an upcoming course run',
        category: 'booking',
        priority: 'high',
        defaultTitle: 'Course setup & bookings — ',
        checklist: [
            'Book venue / room',
            'Confirm trainer & dates',
            'Arrange catering / refreshments',
            'Send student invitations',
            'Submit cheque requisition / invoice',
            'Print attendance sheet & SICAP forms',
        ],
    },
    {
        id: 'venue-trainer',
        label: 'Venue / Trainer Booking',
        description: 'Record who booked a room, trainer or equipment',
        category: 'booking',
        priority: 'normal',
        defaultTitle: 'Booked venue / trainer for ',
        checklist: [
            'Confirmation email received',
            'Time & address added to course session',
            'Quote / invoice requested',
        ],
    },
    {
        id: 'student-followup',
        label: 'Student Follow-Up',
        description: 'Call back, collect docs or confirm attendance',
        category: 'student',
        priority: 'normal',
        defaultTitle: 'Follow up with student — ',
        checklist: [
            'Call / email student',
            'Update enrollment or outcome in CRM',
        ],
    },
    {
        id: 'sicap-finance',
        label: 'SICAP / Invoice Prep',
        description: 'Track supplier invoice, quotes & cheque requisition',
        category: 'finance',
        priority: 'normal',
        defaultTitle: 'Invoice & cheque requisition — ',
        checklist: [
            'Verify supplier invoice details',
            'Check 3-quote threshold if needed',
            'Create cheque requisition in CRM',
            'Mark paid once cheque / EFT clears',
        ],
    },
];

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | null;

export interface TodoFilterState {
    tab: 'active' | 'done';
    search: string;
    category: 'all' | TodoCategory;
    assignee: 'all' | 'mine' | 'unassigned' | string;
    focus: 'all' | 'in_progress' | 'due_soon' | 'pinned';
}

export function normalizeChecklist(raw: unknown): TodoChecklistItem[] {
    if (!Array.isArray(raw)) return [];
    const items: TodoChecklistItem[] = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        const text = typeof rec.text === 'string' ? rec.text.trim() : '';
        if (!text) continue;
        const id = typeof rec.id === 'string' && rec.id ? rec.id : `item-${i}`;
        items.push({ id, text, done: Boolean(rec.done) });
    }
    return items;
}

export function createChecklistItem(text: string): TodoChecklistItem {
    const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, text: text.trim(), done: false };
}

export function checklistProgress(items: readonly TodoChecklistItem[]): { done: number; total: number } {
    let done = 0;
    for (const item of items) {
        if (item.done) done++;
    }
    return { done, total: items.length };
}

export function adminDisplayName(profile: AdminProfile | null | undefined): string {
    if (!profile) return 'Admin';
    const name = profile.full_name?.trim();
    if (name) return name;
    const local = profile.email.split('@')[0]?.trim();
    return local || profile.email || 'Admin';
}

export function adminShortName(profile: AdminProfile | null | undefined): string {
    const full = adminDisplayName(profile);
    return full.split(/\s+/)[0] || full;
}

export function adminInitials(profile: AdminProfile | null | undefined): string {
    const label = adminDisplayName(profile);
    const parts = label.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return label.slice(0, 2).toUpperCase() || 'AD';
}

export function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function getDueState(dueDate: string | null | undefined, status: TodoStatus, today = todayISO()): DueState {
    if (!dueDate || status === 'done') return null;
    const key = dueDate.slice(0, 10);
    if (key < today) return 'overdue';
    if (key === today) return 'today';
    if (key === addDaysISO(today, 1)) return 'tomorrow';
    return 'upcoming';
}

export function formatShortDueDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(y, m - 1, d);
    const currentYear = new Date().getFullYear();
    return dt.toLocaleDateString('en-IE', {
        day: 'numeric',
        month: 'short',
        ...(y !== currentYear ? { year: 'numeric' } : {}),
    });
}

export function formatDueLabel(dueDate: string | null | undefined, status: TodoStatus, today = todayISO()): string {
    if (!dueDate) return '';
    const state = getDueState(dueDate, status, today);
    if (state === 'today') return 'Today';
    if (state === 'tomorrow') return 'Tomorrow';
    const short = formatShortDueDate(dueDate);
    if (state === 'overdue') return `Overdue · ${short}`;
    return short;
}

const PRIORITY_RANK: Record<TodoPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
};

const STATUS_ACTIVE_RANK: Record<TodoStatus, number> = {
    in_progress: 0,
    open: 1,
    done: 2,
};

export function sortTodos(todos: readonly AdminTodo[], tab: 'active' | 'done', today = todayISO()): AdminTodo[] {
    const copy = [...todos];
    if (tab === 'done') {
        copy.sort((a, b) => {
            const aTime = a.completed_at ?? a.updated_at;
            const bTime = b.completed_at ?? b.updated_at;
            return bTime.localeCompare(aTime);
        });
        return copy;
    }

    copy.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

        const aOverdue = getDueState(a.due_date, a.status, today) === 'overdue' ? 0 : 1;
        const bOverdue = getDueState(b.due_date, b.status, today) === 'overdue' ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;

        const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pDiff !== 0) return pDiff;

        if (a.due_date && b.due_date && a.due_date !== b.due_date) {
            return a.due_date.localeCompare(b.due_date);
        }
        if (a.due_date !== b.due_date) return a.due_date ? -1 : 1;

        const sDiff = STATUS_ACTIVE_RANK[a.status] - STATUS_ACTIVE_RANK[b.status];
        if (sDiff !== 0) return sDiff;

        return b.created_at.localeCompare(a.created_at);
    });
    return copy;
}

export function filterTodos(
    todos: readonly AdminTodo[],
    filters: TodoFilterState,
    currentUserId: string | undefined,
    profilesById: ReadonlyMap<string, AdminProfile>,
    today = todayISO(),
): AdminTodo[] {
    const q = filters.search.trim().toLowerCase();
    const weekCutoff = addDaysISO(today, 7);

    const matched = todos.filter(todo => {
        const isDone = todo.status === 'done';
        if (filters.tab === 'active' && isDone) return false;
        if (filters.tab === 'done' && !isDone) return false;

        if (filters.category !== 'all' && todo.category !== filters.category) return false;

        if (filters.assignee === 'mine') {
            if (!currentUserId || todo.assignee_id !== currentUserId) return false;
        } else if (filters.assignee === 'unassigned') {
            if (todo.assignee_id !== null) return false;
        } else if (filters.assignee !== 'all') {
            if (todo.assignee_id !== filters.assignee) return false;
        }

        if (filters.tab === 'active') {
            if (filters.focus === 'in_progress' && todo.status !== 'in_progress') return false;
            if (filters.focus === 'pinned' && !todo.is_pinned) return false;
            if (filters.focus === 'due_soon') {
                if (!todo.due_date || todo.due_date.slice(0, 10) > weekCutoff) return false;
            }
        }

        if (q) {
            const studentText = todo.students ? `${todo.students.first_name} ${todo.students.last_name}` : '';
            const courseText = todo.courses?.name ?? '';
            const assigneeText = todo.assignee_id ? adminDisplayName(profilesById.get(todo.assignee_id)) : '';
            const authorText = todo.created_by ? adminDisplayName(profilesById.get(todo.created_by)) : '';
            const checklistText = todo.checklist.map(c => c.text).join(' ');
            const haystack = `${todo.title} ${todo.description} ${courseText} ${studentText} ${assigneeText} ${authorText} ${checklistText}`.toLowerCase();
            const terms = q.split(/\s+/).filter(Boolean);
            if (!terms.every(term => haystack.includes(term))) return false;
        }

        return true;
    });

    return sortTodos(matched, filters.tab, today);
}

export interface TodoBadgeStats {
    openCount: number;
    inProgressCount: number;
    overdueCount: number;
    dueTodayCount: number;
    urgentCount: number;
    pinnedCount: number;
    doneCount: number;
}

export function computeTodoStats(todos: readonly AdminTodo[], today = todayISO()): TodoBadgeStats {
    let openCount = 0;
    let inProgressCount = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let urgentCount = 0;
    let pinnedCount = 0;
    let doneCount = 0;

    for (const todo of todos) {
        if (todo.status === 'done') {
            doneCount++;
            continue;
        }
        openCount++;
        if (todo.status === 'in_progress') inProgressCount++;
        if (todo.is_pinned) pinnedCount++;
        if (todo.priority === 'urgent') urgentCount++;
        const due = getDueState(todo.due_date, todo.status, today);
        if (due === 'overdue') overdueCount++;
        else if (due === 'today') dueTodayCount++;
    }

    return { openCount, inProgressCount, overdueCount, dueTodayCount, urgentCount, pinnedCount, doneCount };
}

/** Top active items for the Dashboard card: pinned, overdue, due today, urgent, then newest. */
export function selectDashboardTodos(todos: readonly AdminTodo[], today = todayISO(), limit = 5): AdminTodo[] {
    const active = todos.filter(t => t.status !== 'done');
    return sortTodos(active, 'active', today).slice(0, limit);
}
