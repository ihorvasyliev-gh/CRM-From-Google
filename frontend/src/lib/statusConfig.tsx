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
        color: 'text-warning',
        bg: 'bg-warning/10',
        border: 'border-warning/20',
        pillBg: 'status-pill-requested',
        gradient: 'from-warning to-amber-500',
    },
    invited: {
        label: 'Invited',
        icon: <Send size={14} />,
        color: 'text-info',
        bg: 'bg-info/10',
        border: 'border-info/20',
        pillBg: 'status-pill-invited',
        gradient: 'from-info to-blue-500',
    },
    confirmed: {
        label: 'Confirmed',
        icon: <CheckCircle size={14} />,
        color: 'text-success',
        bg: 'bg-success/10',
        border: 'border-success/20',
        pillBg: 'status-pill-confirmed',
        gradient: 'from-success to-emerald-500',
    },
    completed: {
        label: 'Completed',
        icon: <GraduationCap size={14} />,
        color: 'text-brand-500',
        bg: 'bg-brand-500/10',
        border: 'border-brand-500/20',
        pillBg: 'status-pill-completed',
        gradient: 'from-brand-500 to-brand-400',
    },
    withdrawn: {
        label: 'Withdrawn',
        icon: <LogOut size={14} />,
        color: 'text-muted',
        bg: 'bg-muted/10',
        border: 'border-muted/20',
        pillBg: 'status-pill-withdrawn',
        gradient: 'from-muted to-surface-500',
    },
    rejected: {
        label: 'Rejected',
        icon: <Ban size={14} />,
        color: 'text-danger',
        bg: 'bg-danger/10',
        border: 'border-danger/20',
        pillBg: 'status-pill-rejected',
        gradient: 'from-danger to-red-500',
    },
};
