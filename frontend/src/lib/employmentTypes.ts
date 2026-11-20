// Employment types and outcome calculations shared across Outcomes, External Lists,
// the public /status form, StudentDetail, and Analytics.

import { normalizeEmail } from './emailOptOut';

export type EmploymentType = 'full_time' | 'part_time' | 'self_employed' | 'ce_tus';
export type OutcomeTrackingStatus = 'not_contacted' | 'pending' | 'responded';

export interface EmploymentTypeOption {
    value: EmploymentType;
    label: string;
    /** Lowercase wording for narrative sentences, e.g. "3 self-employed", "2 on CE / TUS" */
    narrativeLabel: string;
}

export const EMPLOYMENT_TYPES: readonly EmploymentTypeOption[] = [
    { value: 'full_time', label: 'Full-time', narrativeLabel: 'full-time' },
    { value: 'part_time', label: 'Part-time', narrativeLabel: 'part-time' },
    { value: 'self_employed', label: 'Self-employed', narrativeLabel: 'self-employed' },
    { value: 'ce_tus', label: 'CE / TUS', narrativeLabel: 'on CE / TUS' },
] as const;

const LABEL_BY_TYPE: Record<string, string> = Object.fromEntries(
    EMPLOYMENT_TYPES.map(t => [t.value, t.label]),
);

const RANK_BY_TYPE: Record<string, number> = Object.fromEntries(
    EMPLOYMENT_TYPES.map((t, i) => [t.value, i]),
);

/** Human-readable label for a stored employment_type value, or '' when unset / unknown. */
export function employmentTypeLabel(type: string | null | undefined): string {
    if (!type) return '';
    return LABEL_BY_TYPE[type] ?? '';
}

/** Sort rank among working rows: Full-time → Part-time → Self-employed → CE / TUS → unspecified. */
export function employmentTypeRank(type: string | null | undefined): number {
    if (type && type in RANK_BY_TYPE) return RANK_BY_TYPE[type];
    return EMPLOYMENT_TYPES.length;
}

export interface OutcomeRowLike {
    tracking_status: OutcomeTrackingStatus;
    is_working: boolean | null;
}

/**
 * Whether this row has a recorded employment answer — either currently responded, or
 * previously answered (e.g. "Not working") and currently pending a follow-up survey.
 */
export function hasOutcomeAnswer(row: OutcomeRowLike): boolean {
    return row.tracking_status === 'responded' || row.is_working !== null;
}

export function isWorkingOutcome(row: OutcomeRowLike): boolean {
    return hasOutcomeAnswer(row) && row.is_working === true;
}

export function isNotWorkingOutcome(row: OutcomeRowLike): boolean {
    return hasOutcomeAnswer(row) && row.is_working === false;
}

/** True when a previously "Not working" person was re-sent the survey and is awaiting a new reply. */
export function isResentNotWorking(row: OutcomeRowLike): boolean {
    return row.tracking_status === 'pending' && row.is_working === false;
}

export interface OutcomeStats {
    total: number;
    notContacted: number;
    pending: number;
    responded: number;
    /** Contacted at least once (pending + responded) */
    asked: number;
    /** Have an answer (responded, plus pending follow-ups that still hold a previous answer) */
    answered: number;
    working: number;
    notWorking: number;
    /** Pending rows that previously answered "Not working" */
    resentNotWorking: number;
    /** Percentage of contacted people who answered (null when nobody contacted yet) */
    responseRate: number | null;
    /** Percentage of answered people who are working (null when nobody answered yet) */
    employmentRate: number | null;
}

/** Consistent KPI figures shared by CRM Graduates and External Lists. */
export function computeOutcomeStats(rows: readonly OutcomeRowLike[]): OutcomeStats {
    let notContacted = 0;
    let pending = 0;
    let responded = 0;
    let answered = 0;
    let working = 0;
    let notWorking = 0;
    let resentNotWorking = 0;

    for (const row of rows) {
        if (row.tracking_status === 'not_contacted') notContacted++;
        else if (row.tracking_status === 'pending') pending++;
        else if (row.tracking_status === 'responded') responded++;

        if (isResentNotWorking(row)) resentNotWorking++;

        if (row.tracking_status !== 'not_contacted' && hasOutcomeAnswer(row)) {
            answered++;
            if (row.is_working === true) working++;
            else if (row.is_working === false) notWorking++;
        }
    }

    const asked = pending + responded;
    return {
        total: rows.length,
        notContacted,
        pending,
        responded,
        asked,
        answered,
        working,
        notWorking,
        resentNotWorking,
        responseRate: asked > 0 ? Math.round((answered / asked) * 100) : null,
        employmentRate: answered > 0 ? Math.round((working / answered) * 100) : null,
    };
}

export interface SurveyCandidate {
    email: string | null | undefined;
    tracking_status: OutcomeTrackingStatus;
    is_working: boolean | null;
}

export interface SurveyPartition<T> {
    allowed: T[];
    skippedWorking: T[];
    skippedOptedOut: T[];
    skippedNoEmail: T[];
}

/**
 * Splits selected rows before sending/marking a survey (or copying emails):
 * - People already confirmed as working are skipped when `skipWorking` is true.
 * - People without an email address are skipped.
 * - People on the unsubscribe list (`optedOut`) are skipped.
 */
export function partitionForSurvey<T>(
    items: readonly T[],
    getFields: (item: T) => SurveyCandidate,
    optedOut: ReadonlySet<string>,
    { skipWorking = true }: { skipWorking?: boolean } = {},
): SurveyPartition<T> {
    const allowed: T[] = [];
    const skippedWorking: T[] = [];
    const skippedOptedOut: T[] = [];
    const skippedNoEmail: T[] = [];

    for (const item of items) {
        const { email, tracking_status, is_working } = getFields(item);
        if (skipWorking && isWorkingOutcome({ tracking_status, is_working })) {
            skippedWorking.push(item);
            continue;
        }
        const normalized = normalizeEmail(email);
        if (!normalized) {
            skippedNoEmail.push(item);
            continue;
        }
        if (optedOut.has(normalized)) {
            skippedOptedOut.push(item);
            continue;
        }
        allowed.push(item);
    }

    return { allowed, skippedWorking, skippedOptedOut, skippedNoEmail };
}

/** Human-readable suffix for toasts, e.g. " · 4 already working, 1 unsubscribed skipped". */
export function formatSkippedSummary(counts: { working?: number; optedOut?: number; noEmail?: number }): string {
    const parts: string[] = [];
    if (counts.working && counts.working > 0) parts.push(`${counts.working} already working`);
    if (counts.optedOut && counts.optedOut > 0) parts.push(`${counts.optedOut} unsubscribed`);
    if (counts.noEmail && counts.noEmail > 0) parts.push(`${counts.noEmail} without email`);
    return parts.length > 0 ? ` · ${parts.join(', ')} skipped` : '';
}

/** Message shown when every selected person was skipped. */
export function formatAllSkippedMessage(
    counts: { working?: number; optedOut?: number; noEmail?: number },
    verb: 'sent' | 'copied' | 'updated' = 'sent',
): string {
    const reasons: string[] = [];
    if (counts.working && counts.working > 0) reasons.push('already working');
    if (counts.optedOut && counts.optedOut > 0) reasons.push('unsubscribed');
    if (counts.noEmail && counts.noEmail > 0) reasons.push('missing an email');
    if (reasons.length === 0) return 'No eligible recipients selected.';
    if (reasons.length === 1) return `Everyone selected is ${reasons[0]} — nothing was ${verb}.`;
    return `Everyone selected was skipped (${reasons.join(', ')}) — nothing was ${verb}.`;
}
