import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, buildStatusEmailBodyHtml, buildStatusEmailSubject, DEFAULT_CONFIG, UNSUBSCRIBE_FOOTER_TEXT, hasUnsubscribeText, convertRgbToHex, convertQuillClassesToInlineStyles, replaceColorSpansWithFontTags } from './appConfig';

describe('appConfig', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('getConfig', () => {
        it('returns default config when local storage is empty', () => {
            const config = getConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        it('returns merged config when valid data is in local storage', () => {
            localStorage.setItem('crm_app_config', JSON.stringify({ emailSubjectFormat: 'Custom Subject' }));
            const config = getConfig();
            expect(config.emailSubjectFormat).toBe('Custom Subject');
            expect(config.htmlEmailTemplate).toBe(DEFAULT_CONFIG.htmlEmailTemplate);
        });

        it('recovers corrupted htmlEmailTemplate if missing confirmation tags', () => {
            localStorage.setItem('crm_app_config', JSON.stringify({ htmlEmailTemplate: '{englishWarning}' }));
            const config = getConfig();
            expect(config.htmlEmailTemplate).toBe(DEFAULT_CONFIG.htmlEmailTemplate);
            expect(config.htmlEmailTemplate).toContain('{courseDetails}');
            expect(config.htmlEmailTemplate).toContain('{confirmationButton}');
        });
    });

    describe('setConfig', () => {
        it('persists changes to local storage and returns updated config', () => {
            const updated = setConfig({ emailSubjectFormat: 'Test Subject' });
            expect(updated.emailSubjectFormat).toBe('Test Subject');

            const stored = JSON.parse(localStorage.getItem('crm_app_config')!);
            expect(stored.emailSubjectFormat).toBe('Test Subject');
        });
    });

    describe('resetConfig', () => {
        it('clears local storage and returns defaults', () => {
            setConfig({ emailSubjectFormat: 'Custom Subject' });
            const result = resetConfig();
            expect(result).toEqual(DEFAULT_CONFIG);
            expect(localStorage.getItem('crm_app_config')).toBeNull();
        });
    });

    describe('buildEmailBodyHtml', () => {
        it('replaces all placeholders correctly', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20');
            expect(result).toContain('Python 101');
            expect(result).toContain('Oct 20');
        });

        it('includes standard confirmation button if provided and requiresEnglish is false', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm', undefined, 7, false);
            expect(result).toContain('https://example.com/confirm');
            expect(result).toContain('Confirm My Place');
            expect(result).not.toContain('Important note before you confirm:');
        });

        it('includes confident confirmation button and warning if requiresEnglish is true', () => {
            const result = buildEmailBodyHtml('Security Guarding', 'Oct 20', 'https://example.com/confirm', undefined, 7, true);
            expect(result).toContain('https://example.com/confirm');
            expect(result).toContain('I Am Confident in English — Confirm My Place');
            expect(result).toContain('Important note before you confirm:');
            expect(result).toContain('feel confident with your English');
        });

        it('always includes the limited places notice without the number of places', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm', undefined, 5, false);
            expect(result).toContain('Limited places');
            expect(result).not.toMatch(/\d+ places/);
            expect(result).toContain('5-day response window');
        });

        it('warns that unannounced no-shows may not be offered the course again', () => {
            const english = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm', undefined, 5, true);
            const standard = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm', undefined, 5, false);
            for (const result of [english, standard]) {
                expect(result).toContain("don't attend without letting us know in advance");
                expect(result).toContain('may not be offered a place on this course again');
            }
        });

        it('injects the limited places notice into custom templates without the placeholder', () => {
            setConfig({ htmlEmailTemplateStandard: '<p>Hi</p>{confirmationButton}' });
            const result = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm');
            expect(result).toContain('Limited places');
            expect(result.indexOf('Limited places')).toBeLessThan(result.indexOf('Confirm My Place'));
        });

        it('upgrades the old "Spaces are limited" sentence in saved templates', () => {
            localStorage.setItem('crm_app_config', JSON.stringify({
                htmlEmailTemplateStandard: '<p>Spaces are limited, so please confirm your attendance within <strong>{responseDays} days</strong> by clicking the button below or replying to this email.</p>{confirmationButton}',
            }));
            expect(getConfig().htmlEmailTemplateStandard).toContain('as soon as possible');
        });

        it('does not include confirmation block if no link provided', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20');
            expect(result).not.toContain('Confirm My Place');
            expect(result).not.toContain('I Feel Confident');
        });
    });

    describe('buildEmailBodyHtml multi-date', () => {
        it('lists every offered date and asks the student to choose', () => {
            const dates = ['Wed, 14 Oct 2026', 'Thu, 15 Oct 2026', 'Fri, 16 Oct 2026'];
            const result = buildEmailBodyHtml('Safe Pass', dates, 'https://example.com/c/abc', undefined, 7, false);
            for (const d of dates) expect(result).toContain(d);
            expect(result).toContain('Choose one of the dates');
            expect(result).toContain('Choose My Date');
            expect(result).not.toContain('Date &amp; Time');
        });

        it('keeps the single-date layout for one date', () => {
            const result = buildEmailBodyHtml('Safe Pass', ['Wed, 14 Oct 2026'], 'https://example.com/c/abc', undefined, 7, false);
            expect(result).toContain('Date &amp; Time');
            expect(result).toContain('Confirm My Place');
        });
    });

    describe('unsubscribe notice', () => {
        const count = (html: string, text: string) => html.split(text).length - 1;

        it('adds the notice to survey emails for graduates and outreach lists', () => {
            expect(count(buildStatusEmailBodyHtml('https://example.com/status'), UNSUBSCRIBE_FOOTER_TEXT)).toBe(1);
            expect(count(buildStatusEmailBodyHtml('https://example.com/status', undefined, 'outreach'), UNSUBSCRIBE_FOOTER_TEXT)).toBe(1);
        });

        it('does not repeat it in invitations that already mention it', () => {
            for (const requiresEnglish of [true, false]) {
                const html = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm', undefined, 7, requiresEnglish);
                expect(html).toContain('prefer not to receive future emails');
                expect(html).not.toContain(UNSUBSCRIBE_FOOTER_TEXT);
            }
        });

        it('adds it to custom invitation templates without such wording', () => {
            setConfig({ htmlEmailTemplateStandard: '<p>Hi</p>{confirmationButton}' });
            expect(buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm')).toContain(UNSUBSCRIBE_FOOTER_TEXT);
        });

        it('recognises common unsubscribe wording', () => {
            expect(hasUnsubscribeText('<p>To <b>unsubscribe</b>, reply STOP</p>')).toBe(true);
            expect(hasUnsubscribeText('<p>If you don&rsquo;t want to receive these emails…</p>')).toBe(true);
            expect(hasUnsubscribeText('<p>See you soon</p>')).toBe(false);
        });
    });

    describe('buildEmailSubject', () => {
        it('replaces courseName and date placeholders', () => {
            const result = buildEmailSubject('React Native', 'Nov 5');
            expect(result).toBe('You are Invited to join our React Native course which will take place on Nov 5');
        });

        it('uses custom formatting if configured', () => {
            setConfig({ emailSubjectFormat: '[{courseName}] Invitation for {date}' });
            const result = buildEmailSubject('React Native', 'Nov 5');
            expect(result).toBe('[React Native] Invitation for Nov 5');
        });
    });

    describe('convertRgbToHex', () => {
        it('converts rgb colors to hex format', () => {
            const html = '<span style="color: rgb(230, 0, 0);">text</span>';
            const expected = '<span style="color: #e60000;">text</span>';
            expect(convertRgbToHex(html)).toBe(expected);
        });

        it('converts rgba colors to hex format (ignoring alpha)', () => {
            const html = '<span style="background-color: rgba(0, 128, 255, 0.5);">text</span>';
            const expected = '<span style="background-color: #0080ff;">text</span>';
            expect(convertRgbToHex(html)).toBe(expected);
        });

        it('handles spaces within rgb declaration', () => {
            const html = 'rgb(  15,200 ,  80  )';
            const expected = '#0fc850';
            expect(convertRgbToHex(html)).toBe(expected);
        });

        it('ignores standard hex colors', () => {
            const html = 'color: #123456;';
            expect(convertRgbToHex(html)).toBe(html);
        });
    });

    describe('convertQuillClassesToInlineStyles', () => {
        it('converts basic ql-color classes to inline styles', () => {
            const html = '<span class="ql-color-red">text</span>';
            const expected = '<span style="color: #e60000;">text</span>';
            expect(convertQuillClassesToInlineStyles(html)).toBe(expected);
        });

        it('converts ql-bg classes and hex values', () => {
            const html = '<span class="ql-bg-ff9900">text</span>';
            const expected = '<span style="background-color: #ff9900;">text</span>';
            expect(convertQuillClassesToInlineStyles(html)).toBe(expected);
        });

        it('merges with existing style attributes', () => {
            const html = '<span style="font-weight: bold;" class="ql-color-blue ql-font-serif">text</span>';
            const expected = '<span style="font-weight: bold; color: #0066cc; font-family: Georgia, Times New Roman, serif;">text</span>';
            expect(convertQuillClassesToInlineStyles(html)).toBe(expected);
        });

        it('retains unrelated classes', () => {
            const html = '<span class="my-custom-class ql-size-large">text</span>';
            const expected = '<span class="my-custom-class" style="font-size: 1.5em;">text</span>';
            expect(convertQuillClassesToInlineStyles(html)).toBe(expected);
        });
    });

    describe('replaceColorSpansWithFontTags', () => {
        it('replaces color spans with font tags', () => {
            const html = '<span style="color: #e60000;">text</span>';
            const expected = '<font color="#e60000">text</font>';
            expect(replaceColorSpansWithFontTags(html)).toBe(expected);
        });

        it('replaces spans and preserves nested tags', () => {
            const html = '<span style="font-weight: bold; color: #ff9900;"><strong>bold text</strong></span>';
            const expected = '<font color="#ff9900"><strong>bold text</strong></font>';
            expect(replaceColorSpansWithFontTags(html)).toBe(expected);
        });

        it('does not match background-color as color', () => {
            const html = '<span style="background-color: #e60000;">text</span>';
            expect(replaceColorSpansWithFontTags(html)).toBe(html);
        });

        it('handles both color and background-color', () => {
            const html = '<span style="color: #ff0000; background-color: #ffff00;">text</span>';
            const expected = '<font color="#ff0000" style="background-color:#ffff00;">text</font>';
            expect(replaceColorSpansWithFontTags(html)).toBe(expected);
        });
    });

    describe('buildStatusEmailBodyHtml', () => {
        const link = 'https://crm.example.com/status';

        it('uses the invitation look: blue bulletproof button, questions card, no purple', () => {
            const html = buildStatusEmailBodyHtml(link);
            expect(html).toContain(`href="${link}"`);
            expect(html).toContain('bgcolor="#0284c7"');
            expect(html).toContain('What we will ask');
            expect(html).toContain('full-time or part-time');
            expect(html).toContain('reply to this email with your answers');
            expect(html).not.toMatch(/#7c3aed|#faf5ff/i);
            expect(html).not.toMatch(/\{status(Details|Button|Link)\}/);
        });

        it('replaces {statusLink} and drops {studentName} in custom templates', () => {
            const html = buildStatusEmailBodyHtml(link, {
                ...DEFAULT_CONFIG,
                statusEmailTemplate: '<p>Hi {studentName},</p><p>Go to {statusLink}</p>',
            });
            expect(html).toContain('<p>Hi,</p>');
            expect(html).toContain(`Go to ${link}`);
        });

        it('uses the outreach template for external lists, without mentioning a course', () => {
            const html = buildStatusEmailBodyHtml(`${link}?list=abc`, undefined, 'outreach');
            expect(html).toContain(`href="${link}?list=abc"`);
            expect(html).toContain('What we will ask');
            expect(html).not.toMatch(/completed a course/i);
            expect(buildStatusEmailSubject(undefined, 'outreach')).toBe(DEFAULT_CONFIG.outreachEmailSubjectFormat);
            expect(buildStatusEmailSubject()).toBe(DEFAULT_CONFIG.statusEmailSubjectFormat);
        });

        it('migrates the old Google Form status template to the new default', () => {
            localStorage.setItem('crm_app_config', JSON.stringify({
                statusEmailTemplate: '<p>Could you take 30 seconds to let us know?</p>{statusButton}',
                statusEmailSubjectFormat: 'Quick Status Update — How are things going?',
            }));
            const config = getConfig();
            expect(config.statusEmailTemplate).toBe(DEFAULT_CONFIG.statusEmailTemplate);
            expect(config.statusEmailSubjectFormat).toBe(DEFAULT_CONFIG.statusEmailSubjectFormat);
        });
    });
});
