import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, DEFAULT_CONFIG, convertRgbToHex, convertQuillClassesToInlineStyles } from './appConfig';

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

        it('includes confirmation link block if provided', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20', 'https://example.com/confirm');
            expect(result).toContain('https://example.com/confirm');
            expect(result).toContain('Confirm My Place');
        });

        it('does not include confirmation block if no link provided', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20');
            expect(result).not.toContain('Confirm My Place');
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
});
