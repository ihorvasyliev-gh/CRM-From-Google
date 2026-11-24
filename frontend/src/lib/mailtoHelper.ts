/**
 * Safe `mailto:` link construction and bulk-email fallback bus.
 *
 * Windows shell / Outlook desktop silently truncates or refuses `mailto:` URLs
 * longer than ~2000 characters. Keeping each URL <= 1800 chars ensures every
 * recipient is preserved, and overflowing sends open `<BulkEmailModal />` with
 * one-click Webmail copy and safe desktop batches.
 */

export const MAX_SAFE_MAILTO_LENGTH = 1800;

export interface BulkEmailPayload {
    emails: string[];
    subject: string;
    html: string;
    title?: string;
}

export interface OpenMailtoOptions {
    /** Always open the helper modal even if the mailto URL fits within the limit. */
    forceHelper?: boolean;
    /** Override the max safe mailto URL length (mainly for tests). */
    maxLength?: number;
}

export interface OpenMailtoResult {
    openedDirectly: boolean;
    batchCount: number;
}

type BulkEmailListener = (payload: BulkEmailPayload) => void;
const listeners = new Set<BulkEmailListener>();

/** Trims, removes empty entries, and deduplicates email addresses (case-insensitively, preserving first casing). */
export function normalizeEmails(emails: readonly (string | null | undefined)[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of emails) {
        const trimmed = (raw ?? '').trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
    }
    return result;
}

/** Builds a BCC `mailto:` URL with deduplicated, trimmed, URI-encoded recipients and subject. */
export function buildMailtoUrl(emails: readonly (string | null | undefined)[], subject: string): string {
    const unique = normalizeEmails(emails);
    const bcc = unique.map(e => encodeURIComponent(e)).join(',');
    return `mailto:?bcc=${bcc}&subject=${encodeURIComponent(subject)}`;
}

/**
 * Splits recipients into batches whose `mailto:` URL length stays <= `maxLength`.
 * Always places at least 1 email in each batch so no recipient is ever dropped.
 */
export function splitEmailBatches(
    emails: readonly (string | null | undefined)[],
    subject: string,
    maxLength = MAX_SAFE_MAILTO_LENGTH,
): string[][] {
    const unique = normalizeEmails(emails);
    if (unique.length === 0) return [];

    const batches: string[][] = [];
    let current: string[] = [];

    for (const email of unique) {
        const candidate = [...current, email];
        if (current.length > 0 && buildMailtoUrl(candidate, subject).length > maxLength) {
            batches.push(current);
            current = [email];
        } else {
            current = candidate;
        }
    }

    if (current.length > 0) {
        batches.push(current);
    }

    return batches;
}

/** Subscribes a listener (mounted by `<BulkEmailModal />`) to bulk-email helper requests. */
export function subscribeBulkEmail(listener: BulkEmailListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Opens the bulk-email helper modal with the given payload. */
export function openBulkEmailModal(payload: BulkEmailPayload): void {
    listeners.forEach(listener => listener(payload));
}

/** Default navigation launcher (spy-able in tests without redefining window.location). */
export const mailtoLauncher = {
    open(url: string): void {
        window.location.href = url;
    },
};

/**
 * Navigates directly to `mailto:` when the URL is within the safe length limit;
 * otherwise opens the bulk-email helper modal with Webmail quick-copy and safe batches.
 */
export function openMailtoOrHelper(
    payload: Omit<BulkEmailPayload, 'emails'> & { emails: readonly (string | null | undefined)[] },
    options?: OpenMailtoOptions,
): OpenMailtoResult {
    const emails = normalizeEmails(payload.emails);
    const maxLength = options?.maxLength ?? MAX_SAFE_MAILTO_LENGTH;
    const url = buildMailtoUrl(emails, payload.subject);

    if (url.length <= maxLength && !options?.forceHelper) {
        mailtoLauncher.open(url);
        return { openedDirectly: true, batchCount: 1 };
    }

    const batches = splitEmailBatches(emails, payload.subject, maxLength);
    openBulkEmailModal({
        ...payload,
        emails,
    });

    return {
        openedDirectly: false,
        batchCount: Math.max(1, batches.length),
    };
}
