import { ReactNode } from 'react';
import { Clock, Send, CheckCircle, GraduationCap, LogOut, Ban } from 'lucide-react';

export const PIPELINE_STATUSES = ['requested', 'invited', 'confirmed', 'completed'] as const;
export const SECONDARY_STATUSES = ['withdrawn', 'rejected'] as const;
export const ALL_STATUSES = [...PIPELINE_STATUSES, ...SECONDARY_STATUSES] as const;

export const STATUS_CONFIG: Record<string, {
    label: string;
    icon: ReactNode;
    color: string;
    bg: string;
    border: string;
    pillBg: string;
    gradient: string;
}> = {
    requested: {
        label: 'Requested',
        icon: <Clock size={14} />,
        color: 'text-status-requested',
        bg: 'bg-warning/10',
        border: 'border-warning/30',
        pillBg: 'status-pill-requested',
        gradient: 'from-warning to-amber-500',
    },
    invited: {
        label: 'Invited',
        icon: <Send size={14} />,
        color: 'text-status-invited',
        bg: 'bg-info/10',
        border: 'border-info/30',
        pillBg: 'status-pill-invited',
        gradient: 'from-info to-blue-500',
    },
    confirmed: {
        label: 'Confirmed',
        icon: <CheckCircle size={14} />,
        color: 'text-status-confirmed',
        bg: 'bg-success/10',
        border: 'border-success/30',
        pillBg: 'status-pill-confirmed',
        gradient: 'from-success to-emerald-500',
    },
    completed: {
        label: 'Completed',
        icon: <GraduationCap size={14} />,
        color: 'text-status-completed',
        bg: 'bg-brand-500/10',
        border: 'border-brand-500/30',
        pillBg: 'status-pill-completed',
        gradient: 'from-brand-500 to-brand-400',
    },
    withdrawn: {
        label: 'Withdrawn',
        icon: <LogOut size={14} />,
        color: 'text-status-withdrawn',
        bg: 'bg-muted/10',
        border: 'border-muted/30',
        pillBg: 'status-pill-withdrawn',
        gradient: 'from-muted to-surface-500',
    },
    rejected: {
        label: 'Rejected',
        icon: <Ban size={14} />,
        color: 'text-status-rejected',
        bg: 'bg-danger/10',
        border: 'border-danger/30',
        pillBg: 'status-pill-rejected',
        gradient: 'from-danger to-red-500',
    },
};
