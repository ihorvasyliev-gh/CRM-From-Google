import type { ChangeEvent } from 'react';
import type { ToastData } from '../Toast';
import { describeDateRule, parseDateRule, type DateRule } from '../../lib/documentUtils';
import type { TemplateVariable } from '../../lib/types';

export type ShowToast = (message: string, type: ToastData['type'], duration?: number) => void;

/** Asks for confirmation before a destructive action (template / variable deletion). */
export type ConfirmDelete = (request: { title: string; message: string; run: () => Promise<unknown> }) => void;

export const errorText = (err: unknown) =>
    err instanceof Error ? err.message : (err as { message?: string } | null)?.message || 'Unknown error';

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
