import { describe, it, expect } from 'vitest';
import { DEFAULT_EMAIL_STYLE, inlineEmailStyles, normalizeEmailStyle, prepareEditorHtml, lineHeightPx } from './emailFormat';
import { DEFAULT_CONFIG } from './appConfig';

describe('emailFormat', () => {
    describe('normalizeEmailStyle', () => {
        it('defaults to the look emails always had (Arial 15px / 23px)', () => {
            expect(normalizeEmailStyle(undefined)).toEqual(DEFAULT_EMAIL_STYLE);
            expect(DEFAULT_EMAIL_STYLE.fontSize).toBe(15);
            expect(lineHeightPx(DEFAULT_EMAIL_STYLE)).toBe(23);
        });

        it('drops invalid values and double quotes in the font stack', () => {
            const s = normalizeEmailStyle({ fontSize: 500, textColor: 'red; x', lineHeight: -1, fontFamily: '"Trebuchet MS", sans-serif' });
            expect(s.fontSize).toBe(DEFAULT_EMAIL_STYLE.fontSize);
            expect(s.textColor).toBe(DEFAULT_EMAIL_STYLE.textColor);
            expect(s.lineHeight).toBe(DEFAULT_EMAIL_STYLE.lineHeight);
            expect(s.fontFamily).toBe("'Trebuchet MS', sans-serif");
        });
    });

    describe('prepareEditorHtml', () => {
        it('gives each bare placeholder line its own paragraph', () => {
            const html = prepareEditorHtml('<p>Hi</p>\n{courseDetails}\n{confirmationButton}\n<p>Bye</p>');
            expect(html).toBe('<p>Hi</p><p>{courseDetails}</p><p>{confirmationButton}</p><p>Bye</p>');
        });

        it('turns Quill blank lines into empty paragraphs', () => {
            expect(prepareEditorHtml('<p>a</p><p><br></p><p>b</p>')).toBe('<p>a</p><p></p><p>b</p>');
        });

        it('turns Quill classes into the inline styles emails always used', () => {
            expect(prepareEditorHtml('<p><span class="ql-color-red ql-size-large">x</span></p>'))
                .toBe('<p><span style="color:#e60000;font-size:1.5em;">x</span></p>');
        });
    });

    describe('inlineEmailStyles', () => {
        it('leaves existing templates untouched', () => {
            for (const key of ['htmlEmailTemplate', 'htmlEmailTemplateStandard', 'reminderEmailTemplate', 'reminderTomorrowEmailTemplate', 'statusEmailTemplate', 'outreachEmailTemplate'] as const) {
                expect(inlineEmailStyles(DEFAULT_CONFIG[key], DEFAULT_EMAIL_STYLE)).toBe(DEFAULT_CONFIG[key]);
            }
            const quill = '<p>Hello,</p><p><br></p><ul><li>One</li><li>Two</li></ul><p><span style="color: rgb(230, 0, 0);">red</span></p>';
            expect(inlineEmailStyles(quill, DEFAULT_EMAIL_STYLE)).toBe(quill);
        });

        it('unwraps the editor\'s <p> inside list items, keeping the item style', () => {
            const out = inlineEmailStyles('<ul><li style="margin-bottom:4px;"><p>One</p></li><li><p style="text-align: center">Two</p><ul><li><p>Sub</p></li></ul></li></ul>', DEFAULT_EMAIL_STYLE);
            expect(out).toBe('<ul><li style="margin-bottom:4px;">One</li><li style="text-align:center;">Two<ul><li>Sub</li></ul></li></ul>');
        });

        it('keeps blank lines typed in the editor', () => {
            expect(inlineEmailStyles('<p>a</p><p></p><p>b</p>', DEFAULT_EMAIL_STYLE)).toBe('<p>a</p><p><br></p><p>b</p>');
        });

        it('inlines borders and the email font into tables', () => {
            const out = inlineEmailStyles('<table style="min-width: 50px"><colgroup><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th></tr><tr><td colspan="1" rowspan="1"><p>1</p></td></tr></tbody></table>', DEFAULT_EMAIL_STYLE);
            expect(out).not.toContain('colgroup');
            expect(out).not.toContain('min-width');
            expect(out).toContain('width="100%"');
            expect(out).toMatch(/<th style="[^"]*border:1px solid #cbd5e1;[^"]*font-size:15px;[^"]*background-color:#f1f5f9;/);
            expect(out).toContain('<p style="margin:0;">1</p>');
        });

        it('sizes headings from the base text size', () => {
            const out = inlineEmailStyles('<h1>A</h1><h2 style="text-align: center">B</h2>', { ...DEFAULT_EMAIL_STYLE, fontSize: 20 });
            expect(out).toContain('font-size:35px;');
            expect(out).toMatch(/<h2 style="text-align:center;margin:16px 0 8px 0;font-size:28px;/);
        });

        it('switches the default templates\' Arial to a newly chosen email font', () => {
            const georgia = { ...DEFAULT_EMAIL_STYLE, fontFamily: "Georgia, 'Times New Roman', serif" };
            const out = inlineEmailStyles(DEFAULT_CONFIG.htmlEmailTemplate, georgia);
            expect(out).not.toContain('-apple-system');
            expect(out).toContain("font-family:Georgia, 'Times New Roman', serif;");
            // Sizes and colours set on the paragraphs stay
            expect(out).toContain('font-size:16px');
            expect(out).toContain('line-height:24px');
            expect(out).toContain('color:#1e293b');
        });

        it('shifts legacy default template font sizes and recomputes line-height while preserving visual hierarchy', () => {
            // Default base is 15px; +3px shifts 16->19, 15->18, 14->17, 13->16
            const larger = { ...DEFAULT_EMAIL_STYLE, fontSize: 18 };
            const out = inlineEmailStyles(DEFAULT_CONFIG.statusEmailTemplate, larger);
            expect(out).toContain('font-size:19px;line-height:29px;');
            expect(out).toContain('font-size:18px;line-height:27px;');
            expect(out).toContain('font-size:16px;line-height:24px;');

            // Clamps small shifts to >= 10px (delta = -5: 16->11, 15->10, 14->10, 13->10)
            const smaller = { ...DEFAULT_EMAIL_STYLE, fontSize: 10 };
            const smallOut = inlineEmailStyles(DEFAULT_CONFIG.statusEmailTemplate, smaller);
            expect(smallOut).toContain('font-size:11px;line-height:17px;');
            expect(smallOut).toContain('font-size:10px;line-height:15px;');
            expect(smallOut).not.toMatch(/font-size:[0-9]px/);
        });

        it('updates line-height on default templates when only lineHeight changes', () => {
            const airy = { ...DEFAULT_EMAIL_STYLE, lineHeight: 2 };
            const out = inlineEmailStyles(DEFAULT_CONFIG.htmlEmailTemplate, airy);
            expect(out).toContain('font-size:16px;line-height:32px;');
            expect(out).toContain('font-size:15px;line-height:30px;');
            expect(out).toContain('font-size:14px;line-height:28px;');
        });

        it('replaces legacy primary body text colour while keeping muted notes and custom spans intact', () => {
            const darkText = { ...DEFAULT_EMAIL_STYLE, textColor: '#0f172a' };
            const html = `${DEFAULT_CONFIG.htmlEmailTemplate}<p style="font-size:16px;line-height:24px;color:rgb(30, 41, 59);font-family:Arial,-apple-system,sans-serif;">RGB <span style="color:#e60000;">alert</span></p>`;
            const out = inlineEmailStyles(html, darkText);
            expect(out).toContain('color:#0f172a;');
            expect(out).not.toContain('color:#1e293b');
            expect(out).not.toContain('rgb(30, 41, 59)');
            // Muted secondary/list colours and explicit custom user span stay untouched
            expect(out).toContain('color:#475569;');
            expect(out).toContain('color:#64748b;');
            expect(out).toContain('<span style="color:#e60000;">alert</span>');
        });
    });
});
