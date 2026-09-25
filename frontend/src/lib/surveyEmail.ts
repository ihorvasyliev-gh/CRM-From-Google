// Survey email helpers shared by the Outcomes graduates table and the External lists.
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from './emailOptOut';

type ShowToast = (message: string, type: 'success' | 'error') => void;

/** Copies the selected addresses ("a; b"), leaving out people who unsubscribed from our emails. */
export async function copyOptedInEmails(emails: string[], showToast: ShowToast) {
    const all = [...new Set(emails.filter(Boolean))];
    if (all.length === 0) { showToast('No emails to copy', 'error'); return; }
    try {
        const optedOut = await fetchOptedOutEmails(all);
        const { allowed, skipped } = partitionByOptOut(all, e => e, optedOut);
        if (allowed.length === 0) { showToast('Everyone selected has unsubscribed from emails', 'error'); return; }
        await navigator.clipboard.writeText(allowed.join('; '));
        showToast(`${allowed.length} email(s) copied!${skippedNote(skipped.length)}`, 'success');
    } catch {
        showToast('Could not copy the emails', 'error');
    }
}

/** After recipients were marked pending: copy the survey email as rich HTML, report, open a BCC mailto. */
export async function copySurveyAndOpenMailto({ html, subject, emails, noun, skipped, showToast }: {
    html: string; subject: string; emails: string[]; noun: string; skipped: number; showToast: ShowToast;
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

    showToast(
        copied
            ? `Status requests sent to ${emails.length} ${noun}(s). Template copied!${skippedNote(skipped)}`
            : `Marked ${emails.length} ${noun}(s) as pending, but the email template could not be copied`,
        copied ? 'success' : 'error'
    );

    const bcc = [...new Set(emails.filter(Boolean))].map(encodeURIComponent).join(',');
    window.location.href = `mailto:?bcc=${bcc}&subject=${encodeURIComponent(subject)}`;
}
