import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG, type AppConfig } from './appConfig';
import {
    buildEmailBodyHtml,
    buildEmailSubject,
    buildStatusEmailSubject,
} from './emailTemplates';

function configWith(patch: Partial<AppConfig>): AppConfig {
    return { ...DEFAULT_CONFIG, ...patch };
}

describe('emailTemplates', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('buildEmailBodyHtml placeholders', () => {
        it('replaces {confirmationLink} with the confirmation URL when provided', () => {
            const link = 'https://crm.example.com/confirm?token=abc&course=1';
            const cfg = configWith({
                htmlEmailTemplateStandard: '<p>Please confirm here: {confirmationLink}</p>',
            });
            const html = buildEmailBodyHtml('Safe Pass', '15 Oct 2026', link, cfg, 7, false);
            expect(html).toContain(`Please confirm here: ${link}`);
            expect(html).not.toContain('{confirmationLink}');
        });

        it('replaces {confirmationLink} with an empty string when no link is provided', () => {
            const cfg = configWith({
                htmlEmailTemplateStandard: '<p>Link:{confirmationLink}!</p>',
            });
            const html = buildEmailBodyHtml('Safe Pass', '15 Oct 2026', undefined, cfg, 7, false);
            expect(html).toContain('<p>Link:!</p>');
            expect(html).not.toContain('{confirmationLink}');
            expect(html).not.toContain('Link:#!');
        });

        it('replaces {courseName} with the HTML-escaped course title', () => {
            const cfg = configWith({
                htmlEmailTemplateStandard: '<p>Welcome to {courseName}!</p>{confirmationButton}',
            });
            const html = buildEmailBodyHtml('Health & Safety <Level 1>', '15 Oct 2026', 'https://x.ie/c', cfg, 7, false);
            expect(html).toContain('Welcome to Health &amp; Safety &lt;Level 1&gt;!');
            expect(html).not.toContain('{courseName}');
            expect(html).not.toContain('<Level 1>');
        });

        it('replaces {date} with single or comma-joined multi-date strings (HTML-escaped)', () => {
            const cfg = configWith({
                htmlEmailTemplateStandard: '<p>Dates: {date}</p>{confirmationButton}',
            });

            const single = buildEmailBodyHtml('Safe Pass', 'Wed, 14 Oct 2026', 'https://x.ie/c', cfg);
            expect(single).toContain('Dates: Wed, 14 Oct 2026');
            expect(single).not.toContain('{date}');

            const multi = buildEmailBodyHtml(
                'Safe Pass',
                ['Wed, 14 Oct 2026', 'Thu, 15 Oct 2026', 'Fri <16> Oct'],
                'https://x.ie/c',
                cfg,
            );
            expect(multi).toContain('Dates: Wed, 14 Oct 2026, Thu, 15 Oct 2026, Fri &lt;16&gt; Oct');
            expect(multi).not.toContain('{date}');
        });

        it('strips stray {studentName} placeholders in invitations and reminders', () => {
            const cfg = configWith({
                htmlEmailTemplate: '<p>Hello {studentName}, welcome to {courseName}</p>{confirmationButton}',
                htmlEmailTemplateStandard: '<p>Hi {studentName}, see you on {date}</p>{confirmationButton}',
                reminderEmailTemplate: '<p>Dear {studentName}, reminder for {courseName}</p>',
                reminderTomorrowEmailTemplate: '<p>Hi {studentName}, tomorrow is {courseName}</p>',
            });

            const highEng = buildEmailBodyHtml('PSA', '15 Oct', 'https://x.ie/c', cfg, 7, true, 'invite');
            expect(highEng).toContain('<p>Hello, welcome to PSA</p>');
            expect(highEng).not.toContain('{studentName}');

            const std = buildEmailBodyHtml('IT', '15 Oct', 'https://x.ie/c', cfg, 7, false, 'invite');
            expect(std).toContain('<p>Hi, see you on 15 Oct</p>');
            expect(std).not.toContain('{studentName}');

            const reminder = buildEmailBodyHtml('IT', '15 Oct', undefined, cfg, undefined, false, 'reminder');
            expect(reminder).toContain('<p>Dear, reminder for IT</p>');
            expect(reminder).not.toContain('{studentName}');

            const tomorrow = buildEmailBodyHtml('IT', '15 Oct', undefined, cfg, undefined, false, 'reminder_tomorrow');
            expect(tomorrow).toContain('<p>Hi, tomorrow is IT</p>');
            expect(tomorrow).not.toContain('{studentName}');
        });

        it('handles $ characters in course title or confirmation link safely', () => {
            const cfg = configWith({
                htmlEmailTemplateStandard: '<p>{courseName} — {confirmationLink}</p>',
            });
            const html = buildEmailBodyHtml('Grant $100 & Aid', '15 Oct', 'https://x.ie/?p=$&', cfg);
            expect(html).toContain('Grant $100 &amp; Aid — https://x.ie/?p=$&');
        });
    });

    describe('buildEmailSubject fallbacks', () => {
        it('falls back to default subject when invite, reminder, or day-before subject is empty or whitespace', () => {
            for (const empty of ['', '   ', '\t\n']) {
                const cfg = configWith({
                    emailSubjectFormat: empty,
                    reminderEmailSubjectFormat: empty,
                    reminderTomorrowEmailSubjectFormat: empty,
                });

                expect(buildEmailSubject('Safe Pass', '15 Oct', cfg, 'invite')).toBe(
                    DEFAULT_CONFIG.emailSubjectFormat.replace('{courseName}', 'Safe Pass').replace('{date}', '15 Oct'),
                );
                expect(buildEmailSubject('Safe Pass', '15 Oct', cfg, 'reminder')).toBe(
                    DEFAULT_CONFIG.reminderEmailSubjectFormat.replace('{courseName}', 'Safe Pass').replace('{date}', '15 Oct'),
                );
                expect(buildEmailSubject('Safe Pass', '15 Oct', cfg, 'reminder_tomorrow')).toBe(
                    DEFAULT_CONFIG.reminderTomorrowEmailSubjectFormat.replace('{courseName}', 'Safe Pass').replace('{date}', '15 Oct'),
                );
            }
        });

        it('trims custom subjects and interpolates {courseName} and {date}', () => {
            const cfg = configWith({
                emailSubjectFormat: '  Invite: {courseName} ({date})  ',
            });
            expect(buildEmailSubject('Forklift $50', '20 Nov', cfg, 'invite')).toBe('Invite: Forklift $50 (20 Nov)');
        });
    });

    describe('buildStatusEmailSubject fallbacks', () => {
        it('falls back to default status and outreach subjects when empty or whitespace', () => {
            for (const empty of ['', '   ', '\n']) {
                const cfg = configWith({
                    statusEmailSubjectFormat: empty,
                    outreachEmailSubjectFormat: empty,
                });
                expect(buildStatusEmailSubject(cfg, 'graduates')).toBe(DEFAULT_CONFIG.statusEmailSubjectFormat);
                expect(buildStatusEmailSubject(cfg, 'outreach')).toBe(DEFAULT_CONFIG.outreachEmailSubjectFormat);
            }
        });

        it('returns trimmed custom status and outreach subjects when configured', () => {
            const cfg = configWith({
                statusEmailSubjectFormat: '  Quick check-in  ',
                outreachEmailSubjectFormat: '  Outreach check-in  ',
            });
            expect(buildStatusEmailSubject(cfg, 'graduates')).toBe('Quick check-in');
            expect(buildStatusEmailSubject(cfg, 'outreach')).toBe('Outreach check-in');
        });
    });
});
