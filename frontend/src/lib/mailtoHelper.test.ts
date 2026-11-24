import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import {
    MAX_SAFE_MAILTO_LENGTH,
    buildMailtoUrl,
    mailtoLauncher,
    normalizeEmails,
    openBulkEmailModal,
    openMailtoOrHelper,
    splitEmailBatches,
    subscribeBulkEmail,
} from './mailtoHelper';
import BulkEmailModal from '../components/BulkEmailModal';

function makeEmails(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `student.${String(i + 1).padStart(3, '0')}@example-training.ie`);
}

describe('mailtoHelper', () => {
    let hrefSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        hrefSpy = vi.spyOn(mailtoLauncher, 'open').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('normalizes, trims, and deduplicates emails case-insensitively', () => {
        expect(
            normalizeEmails(['  Alice@Example.com ', '', null, undefined, 'alice@example.com', 'bob+tag@example.com', '  ']),
        ).toEqual(['Alice@Example.com', 'bob+tag@example.com']);
    });

    it('buildMailtoUrl deduplicates, trims, and URI-encodes BCC and subject', () => {
        const url = buildMailtoUrl(
            [' a+1@test.ie ', 'A+1@test.ie', 'b@test.ie', ''],
            'Course Invitation: Safe Pass & First Aid',
        );
        expect(url).toBe(
            'mailto:?bcc=a%2B1%40test.ie,b%40test.ie&subject=Course%20Invitation%3A%20Safe%20Pass%20%26%20First%20Aid',
        );
    });

    it('splitEmailBatches returns empty array for empty input and single batch for short lists', () => {
        expect(splitEmailBatches([], 'Hello')).toEqual([]);
        expect(splitEmailBatches(['a@test.ie', 'b@test.ie'], 'Hello')).toEqual([['a@test.ie', 'b@test.ie']]);
    });

    it('splitEmailBatches splits large lists so every batch stays within maxLength', () => {
        const emails = makeEmails(90);
        const subject = 'Course Invitation — Safe Pass (14 May 2026)';
        const batches = splitEmailBatches(emails, subject, MAX_SAFE_MAILTO_LENGTH);

        expect(batches.length).toBeGreaterThan(1);
        expect(batches.flat()).toEqual(emails);
        for (const batch of batches) {
            expect(batch.length).toBeGreaterThan(0);
            expect(buildMailtoUrl(batch, subject).length).toBeLessThanOrEqual(MAX_SAFE_MAILTO_LENGTH);
        }
    });

    it('splitEmailBatches always keeps at least 1 email per batch even when a single email exceeds maxLength', () => {
        const longEmail = `${'a'.repeat(120)}@example.com`;
        const batches = splitEmailBatches([longEmail, 'short@example.com'], 'Subject', 50);
        expect(batches).toEqual([[longEmail], ['short@example.com']]);
    });

    it('openMailtoOrHelper opens mailto directly when URL is within MAX_SAFE_MAILTO_LENGTH', () => {
        const listener = vi.fn();
        const unsub = subscribeBulkEmail(listener);

        const result = openMailtoOrHelper({
            emails: ['one@test.ie', 'two@test.ie'],
            subject: 'Reminder',
            html: '<p>Hello</p>',
        });

        unsub();

        expect(result).toEqual({ openedDirectly: true, batchCount: 1 });
        expect(hrefSpy).toHaveBeenCalledTimes(1);
        expect(hrefSpy).toHaveBeenCalledWith(buildMailtoUrl(['one@test.ie', 'two@test.ie'], 'Reminder'));
        expect(listener).not.toHaveBeenCalled();
    });

    it('openMailtoOrHelper triggers BulkEmailModal subscriber when URL exceeds MAX_SAFE_MAILTO_LENGTH', () => {
        const emails = makeEmails(85);
        const listener = vi.fn();
        const unsub = subscribeBulkEmail(listener);

        const result = openMailtoOrHelper({
            emails: [...emails, emails[0]],
            subject: 'Course Invitation — Safe Pass',
            html: '<p>Welcome</p>',
            title: 'Safe Pass Invite',
        });

        unsub();

        expect(result.openedDirectly).toBe(false);
        expect(result.batchCount).toBeGreaterThan(1);
        expect(hrefSpy).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith({
            emails,
            subject: 'Course Invitation — Safe Pass',
            html: '<p>Welcome</p>',
            title: 'Safe Pass Invite',
        });
    });

    it('openMailtoOrHelper respects forceHelper even for short lists and safely handles zero subscribers', () => {
        const result = openMailtoOrHelper(
            {
                emails: ['one@test.ie'],
                subject: 'Short',
                html: '<p>Hi</p>',
            },
            { forceHelper: true },
        );

        expect(result).toEqual({ openedDirectly: false, batchCount: 1 });
        expect(hrefSpy).not.toHaveBeenCalled();
    });

    it('BulkEmailModal renders Webmail copy controls and safe desktop batches and tracks opened batches', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        const write = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText, write },
        });
        vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });

        render(createElement(BulkEmailModal));

        const emails = makeEmails(85);
        const subject = 'Safe Pass Invitation';
        const html = '<p>Hello students</p>';

        act(() => {
            openBulkEmailModal({ emails, subject, html, title: 'Bulk Invite' });
        });

        expect(await screen.findByText('Bulk Invite')).toBeInTheDocument();
        expect(screen.getByText(/85 recipients · \d+ safe batches/i)).toBeInTheDocument();

        // Copy all BCC
        fireEvent.click(screen.getByRole('button', { name: /Copy all BCC \(85\)/i }));
        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(emails.join('; '));
        });

        // Copy Subject
        fireEvent.click(screen.getByRole('button', { name: /Copy Subject/i }));
        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(subject);
        });

        // Copy HTML body
        fireEvent.click(screen.getByRole('button', { name: /Copy HTML body/i }));
        await waitFor(() => {
            expect(write).toHaveBeenCalledTimes(1);
        });

        // Open Batch 1 in Email App
        const openButtons = screen.getAllByRole('button', { name: /Open in Email App/i });
        expect(openButtons.length).toBeGreaterThan(1);
        fireEvent.click(openButtons[0]);

        expect(hrefSpy).toHaveBeenCalledTimes(1);
        const openedUrl = hrefSpy.mock.calls[0][0] as string;
        expect(openedUrl.startsWith('mailto:?bcc=')).toBe(true);
        expect(openedUrl.length).toBeLessThanOrEqual(MAX_SAFE_MAILTO_LENGTH);
        expect(screen.getByText(`1 / ${openButtons.length} opened`)).toBeInTheDocument();
    });
});
