import {
    BookOpen,
    CalendarCheck2,
    CheckSquare,
    CircleDot,
    Clock,
    CheckCircle2,
    Flame,
    AlertTriangle,
    Receipt,
    StickyNote,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { TodoCategory, TodoPriority, TodoStatus } from '../../lib/todos';

export interface CategoryMeta {
    value: TodoCategory;
    label: string;
    shortLabel: string;
    icon: LucideIcon;
    pillCls: string;
    dotCls: string;
}

export const CATEGORY_META: Record<TodoCategory, CategoryMeta> = {
    general: {
        value: 'general',
        label: 'General',
        shortLabel: 'General',
        icon: CheckSquare,
        pillCls: 'bg-surface-elevated text-primary border-border-subtle',
        dotCls: 'bg-slate-400',
    },
    booking: {
        value: 'booking',
        label: 'Booking',
        shortLabel: 'Booking',
        icon: CalendarCheck2,
        pillCls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25',
        dotCls: 'bg-violet-500',
    },
    course: {
        value: 'course',
        label: 'Course',
        shortLabel: 'Course',
        icon: BookOpen,
        pillCls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/25',
        dotCls: 'bg-brand-500',
    },
    student: {
        value: 'student',
        label: 'Student',
        shortLabel: 'Student',
        icon: Users,
        pillCls: 'bg-info/10 text-status-invited border-info/25',
        dotCls: 'bg-info',
    },
    finance: {
        value: 'finance',
        label: 'Finance & Docs',
        shortLabel: 'Finance',
        icon: Receipt,
        pillCls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        dotCls: 'bg-emerald-500',
    },
    note: {
        value: 'note',
        label: 'Note',
        shortLabel: 'Note',
        icon: StickyNote,
        pillCls: 'bg-amber-500/10 text-status-requested border-amber-500/25',
        dotCls: 'bg-amber-500',
    },
};

export interface StatusMeta {
    value: TodoStatus;
    label: string;
    icon: LucideIcon;
    pillCls: string;
}

export const STATUS_META: Record<TodoStatus, StatusMeta> = {
    open: {
        value: 'open',
        label: 'Open',
        icon: CircleDot,
        pillCls: 'bg-surface-elevated text-muted border-border-subtle',
    },
    in_progress: {
        value: 'in_progress',
        label: 'In Progress',
        icon: Clock,
        pillCls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/25',
    },
    done: {
        value: 'done',
        label: 'Done',
        icon: CheckCircle2,
        pillCls: 'bg-success/10 text-status-confirmed border-success/25',
    },
};

export interface PriorityMeta {
    value: TodoPriority;
    label: string;
    icon?: LucideIcon;
    pillCls: string;
}

export const PRIORITY_META: Record<TodoPriority, PriorityMeta> = {
    normal: {
        value: 'normal',
        label: 'Normal',
        pillCls: 'bg-surface-elevated text-muted border-border-subtle',
    },
    high: {
        value: 'high',
        label: 'High',
        icon: AlertTriangle,
        pillCls: 'bg-warning/15 text-status-requested border-warning/30',
    },
    urgent: {
        value: 'urgent',
        label: 'Urgent',
        icon: Flame,
        pillCls: 'bg-danger/15 text-status-rejected border-danger/30',
    },
};

export function formatRelativeTimestamp(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(ms).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}
