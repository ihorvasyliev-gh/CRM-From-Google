import type { ChangeEvent } from 'react';
import { describeDateRule, parseDateRule, type DateRule } from '../../lib/documentUtils';
import type { TemplateVariable } from '../../lib/types';
import { errorMessage } from '../../lib/errors';

export type { ShowToast } from '../../lib/toast';
export type { ConfirmDelete } from './types';

export const errorText = (err: unknown) => errorMessage(err);

/** onChange for a file input: hands over the picked file and resets the input, so the same file can be picked again. */
export const fileInputHandler = (handler: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handler(file);
    e.target.value = '';
};

/** A new date variable starts as "course date + 2 years". */
export const DEFAULT_DATE_RULE: DateRule = { base: 'courseDate', amount: 2, unit: 'years', format: 'long' };

/** What a variable prints: its text, or its date rule ("Course date + 2 years"). */
export function variableSummary(v: TemplateVariable): string {
    if (v.kind !== 'date') return v.var_value;
    const rule = parseDateRule(v.date_rule);
    return rule ? describeDateRule(rule) : 'Date (rule unreadable — edit it)';
}

/** Human-readable file size (e.g. "142 KB", "1.4 MB"). */
export function formatBytes(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact relative timestamp (e.g. "just now", "12m ago", "3h ago", "2d ago"). */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
    if (diffSec < 60) return 'just now';
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

export const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;
