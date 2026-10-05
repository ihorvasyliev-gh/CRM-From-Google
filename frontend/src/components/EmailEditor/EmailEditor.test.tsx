import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, act } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import EmailEditor, { type EmailEditorHandle } from './EmailEditor';
import { createEmailExtensions } from './extensions';
import { prepareEditorHtml, DEFAULT_EMAIL_STYLE } from '../../lib/emailFormat';
import { buildEmailBodyHtml, buildStatusEmailBodyHtml, convertRgbToHex, DEFAULT_CONFIG } from '../../lib/appConfig';

/** Load stored HTML into the editor and read back what it would save. */
function roundTrip(html: string): string {
    const editor = new Editor({ extensions: createEmailExtensions(), content: prepareEditorHtml(html) });
    const out = editor.getHTML();
    editor.destroy();
    return out;
}

/** Tag + normalised inline styles of every element: what decides how the email looks. */
function layout(html: string): string[] {
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const norm = (style: string) => style.split(';').map(d => d.trim()).filter(Boolean).map(d => {
        const i = d.indexOf(':');
        const prop = d.slice(0, i).trim().toLowerCase();
        let value = convertRgbToHex(d.slice(i + 1).trim()).replace(/["']/g, '').replace(/\b0px\b/g, '0').replace(/\s*,\s*/g, ',');
        if (prop === 'margin' || prop === 'padding') {
            const [t, r = t, b = t, l = r] = value.split(/\s+/);
            value = [t, r, b, l].join(' ');
        }
        return `${prop}:${value}`;
    }).sort().join(';');
    return Array.from(body.querySelectorAll('*')).map(el => `${el.tagName}[${norm(el.getAttribute('style') || '')}]${el.children.length ? '' : el.textContent?.trim()}`);
}

const QUILL = '<p>Hello,</p><p>We are <strong>delighted</strong>.</p><p><br></p><p>{courseDetails}</p><p>{capacityNotice}</p><p>{confirmationButton}</p><ul><li>One</li><li>Two<ul><li>Sub</li></ul></li></ul><p><span style="color: rgb(230, 0, 0);">red</span> <a href="https://example.ie" target="_blank">link</a></p>';

describe('EmailEditor round trip', () => {
    it('saves existing templates so the email looks the same', () => {
        const invites = [['htmlEmailTemplate', true, 'invite'], ['htmlEmailTemplateStandard', false, 'invite'], ['reminderEmailTemplate', false, 'reminder'], ['reminderTomorrowEmailTemplate', false, 'reminder_tomorrow']] as const;
        for (const [key, english, kind] of invites) {
            for (const tpl of [DEFAULT_CONFIG[key], QUILL]) {
                const build = (t: string) => buildEmailBodyHtml('Course', 'Wed, 7 Oct 2026', 'https://x.ie', { ...DEFAULT_CONFIG, [key]: t }, 7, english, kind);
                expect(layout(build(roundTrip(tpl)))).toEqual(layout(build(tpl)));
            }
        }
        for (const [key, audience] of [['statusEmailTemplate', 'graduates'], ['outreachEmailTemplate', 'outreach']] as const) {
            const build = (t: string) => buildStatusEmailBodyHtml('https://x.ie/s', { ...DEFAULT_CONFIG, [key]: t }, audience);
            expect(layout(build(roundTrip(DEFAULT_CONFIG[key])))).toEqual(layout(build(DEFAULT_CONFIG[key])));
        }
    });

    it('keeps placeholders on lines of their own', () => {
        const html = roundTrip(DEFAULT_CONFIG.htmlEmailTemplate);
        expect(html).toContain('<p>{courseDetails}</p><p>{englishWarning}</p><p>{capacityNotice}</p><p>{confirmationButton}</p>');
    });
});

describe('EmailEditor', () => {
    it('inserts a block tag on its own line and reports the edit', () => {
        const onChange = vi.fn();
        const ref = createRef<EmailEditorHandle>();
        render(<EmailEditor ref={ref} value="<p>Hello</p>" onChange={onChange} textStyle={DEFAULT_EMAIL_STYLE} />);
        expect(onChange).not.toHaveBeenCalled();
        act(() => ref.current!.insertTag('{courseDetails}', { block: true }));
        expect(onChange).toHaveBeenLastCalledWith('<p>Hello</p><p>{courseDetails}</p>');
        act(() => ref.current!.insertTag('{studentName}'));
        expect(onChange.mock.lastCall![0]).toContain('{studentName}');
    });

    it('shows a new value given from outside without reporting it as an edit', () => {
        const onChange = vi.fn();
        const { rerender, container } = render(<EmailEditor value="<p>One</p>" onChange={onChange} textStyle={DEFAULT_EMAIL_STYLE} />);
        rerender(<EmailEditor value="<p>Two</p>" onChange={onChange} textStyle={DEFAULT_EMAIL_STYLE} />);
        expect(container.querySelector('.email-editor-content')?.textContent).toBe('Two');
        expect(onChange).not.toHaveBeenCalled();
    });
});
