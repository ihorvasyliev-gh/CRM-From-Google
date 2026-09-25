import type React from 'react';
import { Clock, CheckCircle, GraduationCap, Send, XCircle, LogOut, Home, Users, BookOpen, ListChecks } from 'lucide-react';

export const STATUS_META: Record<string, { label: string; icon: React.ReactElement; pill: string; bar: string; dot: string }> = {
    requested: { label: 'In queue', icon: <Clock size={12} />, pill: 'status-pill-requested', bar: 'bg-amber-400', dot: 'bg-amber-500' },
    invited: { label: 'Invited', icon: <Send size={12} />, pill: 'status-pill-invited', bar: 'bg-sky-500', dot: 'bg-sky-500' },
    confirmed: { label: 'Confirmed', icon: <CheckCircle size={12} />, pill: 'status-pill-confirmed', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
    completed: { label: 'Completed', icon: <GraduationCap size={12} />, pill: 'status-pill-completed', bar: 'bg-violet-500', dot: 'bg-violet-500' },
    rejected: { label: 'Rejected', icon: <XCircle size={12} />, pill: 'status-pill-rejected', bar: 'bg-red-500', dot: 'bg-red-500' },
    withdrawn: { label: 'Withdrawn', icon: <LogOut size={12} />, pill: 'status-pill-withdrawn', bar: 'bg-slate-400', dot: 'bg-slate-400' },
};

export const VIEWER_TABS = [
    { key: 'home', label: 'Home', icon: Home, shortcut: '1' },
    { key: 'students', label: 'Students', icon: Users, shortcut: '2' },
    { key: 'courses', label: 'Courses', icon: BookOpen, shortcut: '3' },
    { key: 'external-lists', label: 'External Lists', icon: ListChecks, shortcut: '4' },
] as const;

export type ViewerTab = typeof VIEWER_TABS[number]['key'];

/** Moves focus between sibling `[data-row]` elements with ↑ / ↓ / Home / End. */
export function handleRowArrowKeys(e: React.KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return false;
    const container = e.currentTarget.closest('[data-row-list]');
    if (!container) return false;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row]'));
    const idx = rows.indexOf(e.currentTarget);
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowDown') next = rows[idx + 1];
    else if (e.key === 'ArrowUp') next = rows[idx - 1];
    else if (e.key === 'Home') next = rows[0];
    else next = rows[rows.length - 1];
    if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView?.({ block: 'nearest' });
    }
    return true;
}
