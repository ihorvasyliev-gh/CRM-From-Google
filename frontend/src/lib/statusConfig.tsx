import { ReactNode } from 'react';
import { Clock, Send, CheckCircle, GraduationCap, LogOut, Ban } from 'lucide-react';

export const PIPELINE_STATUSES = ['requested', 'invited', 'confirmed', 'completed'] as const;
export const SECONDARY_STATUSES = ['withdrawn', 'rejected'] as const;
export const ALL_STATUSES = [...PIPELINE_STATUSES, ...SECONDARY_STATUSES] as const;

/**
 * STATUS COLOR MAP
 * ─────────────────────────────────────────────────────────────────
 *  requested  → 🟡 Amber   — "waiting / pending"
 *  invited    → 🔵 Sky     — "outreach sent / in dialogue"
 *  confirmed  → 🟢 Emerald — "approved / confirmed"
 *  completed  → 🟣 Violet  — "graduated / milestone achieved"
 *  withdrawn  → ⚫ Slate   — "inactive / dropped"
 *  rejected   → 🔴 Red     — "declined / blocked"
 * ─────────────────────────────────────────────────────────────────
 * CSS utility classes (bg, border, text) come from index.css
 * so a single source of truth governs every component.
 */
export const STATUS_CONFIG: Record<string, {
    label: string;
    icon: ReactNode;
    color: string;     // text colour class  (text-status-*)
    bg: string;        // background class   (bg-<token>/10)
    border: string;    // border class       (border-<token>/30)
    pillBg: string;    // pill utility class (status-pill-*)
    gradient: string;  // gradient for column top-bar
}> = {
    // ── 🟡 Requested ────────────────────────────────────────────
    requested: {
        label:    'Requested',
        icon:     <Clock size={14} />,
        color:    'text-status-requested',
        bg:       'bg-warning/10',
        border:   'border-warning/30',
        pillBg:   'status-pill-requested',
        gradient: 'from-amber-500 to-amber-400',
    },
    // ── 🔵 Invited ──────────────────────────────────────────────
    invited: {
        label:    'Invited',
        icon:     <Send size={14} />,
        color:    'text-status-invited',
        bg:       'bg-info/10',
        border:   'border-info/30',
        pillBg:   'status-pill-invited',
        gradient: 'from-sky-500 to-sky-400',
    },
    // ── 🟢 Confirmed ────────────────────────────────────────────
    confirmed: {
        label:    'Confirmed',
        icon:     <CheckCircle size={14} />,
        color:    'text-status-confirmed',
        bg:       'bg-success/10',
        border:   'border-success/30',
        pillBg:   'status-pill-confirmed',
        gradient: 'from-emerald-500 to-emerald-400',
    },
    // ── 🟣 Completed ────────────────────────────────────────────
    completed: {
        label:    'Completed',
        icon:     <GraduationCap size={14} />,
        color:    'text-status-completed',
        bg:       'bg-[oklch(var(--status-completed)/0.10)]',
        border:   'border-[oklch(var(--status-completed)/0.30)]',
        pillBg:   'status-pill-completed',
        gradient: 'from-violet-500 to-violet-400',
    },
    // ── ⚫ Withdrawn ─────────────────────────────────────────────
    withdrawn: {
        label:    'Withdrawn',
        icon:     <LogOut size={14} />,
        color:    'text-status-withdrawn',
        bg:       'bg-muted/10',
        border:   'border-muted/20',
        pillBg:   'status-pill-withdrawn',
        gradient: 'from-slate-400 to-slate-300',
    },
    // ── 🔴 Rejected ─────────────────────────────────────────────
    rejected: {
        label:    'Rejected',
        icon:     <Ban size={14} />,
        color:    'text-status-rejected',
        bg:       'bg-danger/10',
        border:   'border-danger/30',
        pillBg:   'status-pill-rejected',
        gradient: 'from-rose-500 to-rose-400',
    },
};
