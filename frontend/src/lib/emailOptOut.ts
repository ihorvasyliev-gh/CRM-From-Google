// ─── Email opt-outs (unsubscribe list) ─────────────────────────
// People who asked not to receive emails. They stay in the database but are
// left out of every mailing: course invitations, outcome and outreach surveys.
// Table: email_opt_outs (migration 62).
import { supabase } from './supabase';

export interface EmailOptOut {
    email: string;
    note: string | null;
    opted_out_at: string;
}

export function normalizeEmail(email: string | null | undefined): string {
    return (email ?? '').trim().toLowerCase();
}

/** PostgREST / Postgres codes for "the table doesn't exist yet" (migration 62 not applied). */
function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01';
}

const CHUNK = 100;

/**
 * Which of these emails have unsubscribed? Returns normalized addresses.
 * Before migration 62 is applied nobody is treated as unsubscribed; any other
 * error is thrown so a mailing never silently ignores the list.
 */
export async function fetchOptedOutEmails(emails: (string | null | undefined)[]): Promise<Set<string>> {
    const unique = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
    const optedOut = new Set<string>();
    for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await supabase
            .from('email_opt_outs')
            .select('email')
            .in('email', unique.slice(i, i + CHUNK));
        if (error) {
            if (isMissingTable(error)) return optedOut;
            throw error;
        }
        (data ?? []).forEach((row: { email: string }) => optedOut.add(row.email));
    }
    return optedOut;
}

/** Split recipients into those we may email and those who unsubscribed. */
export function partitionByOptOut<T>(
    items: T[],
    getEmail: (item: T) => string | null | undefined,
    optedOut: Set<string>,
): { allowed: T[]; skipped: T[] } {
    const allowed: T[] = [];
    const skipped: T[] = [];
    for (const item of items) {
        (optedOut.has(normalizeEmail(getEmail(item))) ? skipped : allowed).push(item);
    }
    return { allowed, skipped };
}

/** Short note for toasts, e.g. " · 2 unsubscribed skipped". */
export function skippedNote(count: number): string {
    return count > 0 ? ` · ${count} unsubscribed skipped` : '';
}

export async function listEmailOptOuts(): Promise<EmailOptOut[]> {
    const { data, error } = await supabase
        .from('email_opt_outs')
        .select('email, note, opted_out_at')
        .order('opted_out_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmailOptOut[];
}

export interface OptOutResult {
    email: string;
    students: number;
    contacts: number;
}

export async function optOutEmail(email: string, note?: string): Promise<OptOutResult> {
    const { data, error } = await supabase.rpc('opt_out_email', { p_email: normalizeEmail(email), p_note: note?.trim() || null });
    if (error) throw error;
    return data as OptOutResult;
}

export async function optInEmail(email: string): Promise<void> {
    const { error } = await supabase.rpc('opt_in_email', { p_email: normalizeEmail(email) });
    if (error) throw error;
}
