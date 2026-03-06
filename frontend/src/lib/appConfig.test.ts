import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, DEFAULT_CONFIG } from './appConfig';

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
            localStorage.setItem('crm_app_config', JSON.stringify({ dateFormat: 'ISO' }));
            const config = getConfig();
            expect(config.dateFormat).toBe('ISO');
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
            setConfig({ dateFormat: 'ISO' });
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
            expect(result).toContain('Confirm Participation');
        });

        it('does not include confirmation block if no link provided', () => {
            const result = buildEmailBodyHtml('Python 101', 'Oct 20');
            expect(result).not.toContain('Confirm Participation');
        });
    });

    describe('buildEmailSubject', () => {
        it('replaces courseName and date placeholders', () => {
            const result = buildEmailSubject('React Native', 'Nov 5');
            expect(result).toBe('React Native — Nov 5');
        });

        it('uses custom formatting if configured', () => {
            setConfig({ emailSubjectFormat: '[{courseName}] Invitation for {date}' });
            const result = buildEmailSubject('React Native', 'Nov 5');
            expect(result).toBe('[React Native] Invitation for Nov 5');
        });
    });
});
