// Survey email helpers shared by the Outcomes graduates table and the External lists.
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from './emailOptOut';
import { openMailtoOrHelper } from './mailtoHelper';

import type { ShowToast, ToastData } from './toast';

/** Copies the selected addresses ("a; b"), leaving out people who unsubscribed from our emails. */
export async function copyOptedInEmails(
    emails: (string | null | undefined)[],
    showToast: ShowToast,
    options?: { skippedNoteText?: string },
) {
    const all = [...new Set(emails.map(e => (e ?? '').trim()).filter(Boolean))];
    if (all.length === 0) { showToast('No emails to copy', 'error'); return; }
    try {
        const optedOut = await fetchOptedOutEmails(all);
        const { allowed, skipped } = partitionByOptOut(all, e => e, optedOut);
        if (allowed.length === 0) { showToast('Everyone selected has unsubscribed from emails', 'error'); return; }
        await navigator.clipboard.writeText(allowed.join('; '));
        const note = options?.skippedNoteText ?? skippedNote(skipped.length);
        showToast(`${allowed.length} email(s) copied!${note}`, 'success');
    } catch {
        showToast('Could not copy the emails', 'error');
    }
}

/** Copies already-filtered eligible email addresses ("a; b") and reports an optional skipped summary. */
export async function copyEligibleEmails(
    emails: (string | null | undefined)[],
    showToast: ShowToast,
    skippedNoteText = '',
) {
    const unique = [...new Set(emails.map(e => (e ?? '').trim()).filter(Boolean))];
    if (unique.length === 0) { showToast('No emails to copy', 'error'); return; }
    try {
        await navigator.clipboard.writeText(unique.join('; '));
        showToast(`${unique.length} email(s) copied!${skippedNoteText}`, 'success');
    } catch {
        showToast('Could not copy the emails', 'error');
    }
}

/** After recipients were marked pending: copy the survey email as rich HTML, report, open a BCC mailto. */
export async function copySurveyAndOpenMailto({
    html,
    subject,
    emails,
    noun,
    skipped = 0,
    skippedNoteText,
    showToast,
    toastOptions,
}: {
    html: string;
    subject: string;
    emails: string[];
    noun: string;
    skipped?: number;
    skippedNoteText?: string;
    showToast: ShowToast;
    toastOptions?: Pick<ToastData, 'action' | 'duration'>;
}) {
    let copied = true;
    try {
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob(['Please view this email in an HTML-compatible client.'], { type: 'text/plain' }),
        })]);
    } catch (clipErr) {
        console.error('Clipboard write failed:', clipErr);
        copied = false;
    }

    const note = skippedNoteText ?? skippedNote(skipped);
    const { openedDirectly } = openMailtoOrHelper({
        emails,
        subject,
        html,
        title: subject,
    });

    if (!openedDirectly) {
        showToast(
            `Too many recipients for a single mailto link — opened batch & webmail helper${note}`,
            'info',
            toastOptions,
        );
    } else {
        showToast(
            copied
                ? `Status requests sent to ${emails.length} ${noun}(s). Template copied!${note}`
                : `Marked ${emails.length} ${noun}(s) as pending, but the email template could not be copied${note}`,
            copied ? 'success' : 'error',
            toastOptions,
        );
    }
}
