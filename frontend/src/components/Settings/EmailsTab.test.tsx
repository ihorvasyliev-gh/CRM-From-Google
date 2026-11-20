import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '../ui/Tooltip';
import EmailsTab from './EmailsTab';
import { DEFAULT_CONFIG, EMAIL_CONFIG_KEYS, type AppConfig } from '../../lib/appConfig';
import { EMAIL_FONTS, normalizeEmailStyle } from '../../lib/emailFormat';
import type { SaveStatus } from './types';

vi.mock('../EmailEditor/EmailEditor', async () => {
    const React = await import('react');
    return {
        default: function MockEmailEditor({
            value,
            onChange,
            ariaLabel = 'Email body',
            ref,
        }: {
            value: string;
            onChange: (html: string) => void;
            ariaLabel?: string;
            ref?: React.Ref<{ insertTag: (tag: string, options?: { block?: boolean }) => void; focus: () => void }>;
        }) {
            React.useImperativeHandle(
                ref,
                () => ({
                    insertTag: (tag: string, options?: { block?: boolean }) => {
                        onChange(options?.block ? `${value}<p>${tag}</p>` : `${value}${tag}`);
                    },
                    focus: () => {},
                }),
                [value, onChange],
            );
            return (
                <textarea
                    aria-label={ariaLabel}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            );
        },
    };
});

function cloneConfig(overrides?: Partial<AppConfig>): AppConfig {
    return {
        ...DEFAULT_CONFIG,
        excelColumns: DEFAULT_CONFIG.excelColumns.map(col => ({ ...col })),
        emailStyle: { ...DEFAULT_CONFIG.emailStyle },
        ...overrides,
    };
}

function areEmailConfigsEqual(a: AppConfig, b: AppConfig): boolean {
    for (const key of EMAIL_CONFIG_KEYS) {
        if (key === 'emailStyle') {
            const sa = normalizeEmailStyle(a.emailStyle);
            const sb = normalizeEmailStyle(b.emailStyle);
            if (
                sa.fontFamily !== sb.fontFamily ||
                sa.fontSize !== sb.fontSize ||
                sa.textColor !== sb.textColor ||
                sa.lineHeight !== sb.lineHeight
            ) {
                return false;
            }
        } else if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

function EmailsTabHarness({
    initialConfig,
    onSaveSpy = vi.fn().mockResolvedValue(undefined),
    onResetAllSpy = vi.fn().mockResolvedValue(undefined),
    saveStatus = 'idle',
    saveError = null,
}: {
    initialConfig?: AppConfig;
    onSaveSpy?: () => Promise<void>;
    onResetAllSpy?: () => Promise<void>;
    saveStatus?: SaveStatus;
    saveError?: string | null;
}) {
    const [savedConfig] = useState<AppConfig>(() => initialConfig ?? cloneConfig());
    const [config, setConfig] = useState<AppConfig>(() => initialConfig ?? cloneConfig());
    const [touched, setTouched] = useState(false);

    const hasChanges = touched && !areEmailConfigsEqual(config, savedConfig);

    return (
        <TooltipProvider>
            <EmailsTab
                config={config}
                savedConfig={savedConfig}
                hasChanges={hasChanges}
                saving={false}
                saveStatus={saveStatus}
                saveError={saveError}
                onChangeConfig={updater => {
                    setTouched(true);
                    setConfig(updater);
                }}
                onSave={onSaveSpy}
                onDiscard={() => {
                    setConfig(savedConfig);
                    setTouched(false);
                }}
                onResetAll={onResetAllSpy}
            />
        </TooltipProvider>
    );
}

describe('EmailsTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('expands Style & branding via Customise, updates font/size/colour/CCP logo switch, and updates summary pills', () => {
        render(<EmailsTabHarness />);

        const styleSection = screen.getByRole('region', { name: 'Email style and branding' });
        expect(within(styleSection).getByText('Arial')).toBeInTheDocument();
        expect(within(styleSection).getByText('15px')).toBeInTheDocument();
        expect(within(styleSection).getByText('1.5×')).toBeInTheDocument();
        expect(within(styleSection).getByText('#1e293b')).toBeInTheDocument();
        expect(within(styleSection).getByText('CCP Logo: Off')).toBeInTheDocument();

        const customiseBtn = within(styleSection).getByRole('button', { name: 'Customise' });
        expect(customiseBtn).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(customiseBtn);
        expect(within(styleSection).getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true');

        // Update font, size, text colour, and CCP logo switch
        const georgiaFont = EMAIL_FONTS.find(f => f.label === 'Georgia')!;
        fireEvent.change(within(styleSection).getByLabelText('Font'), { target: { value: georgiaFont.value } });
        fireEvent.change(within(styleSection).getByLabelText('Size'), { target: { value: '18' } });
        fireEvent.click(within(styleSection).getByRole('button', { name: /Deep Navy \(#1e3a5f\)/ }));
        fireEvent.click(within(styleSection).getByRole('switch', { name: /Include Cork City Partnership logo banner/i }));

        // Collapse again so summary pills are unambiguously asserted
        fireEvent.click(within(styleSection).getByRole('button', { name: 'Done' }));

        expect(within(styleSection).getByText('Georgia')).toBeInTheDocument();
        expect(within(styleSection).getByText('18px')).toBeInTheDocument();
        expect(within(styleSection).getByText('#1e3a5f')).toBeInTheDocument();
        expect(within(styleSection).getByText('CCP Logo: On')).toBeInTheDocument();
    });

    it('switches cleanly across all 6 templates in Invitations, Reminders, and Surveys', () => {
        render(<EmailsTabHarness />);

        expect(screen.getByText('Invitations')).toBeInTheDocument();
        expect(screen.getByText('Reminders')).toBeInTheDocument();
        expect(screen.getByText('Outcomes Surveys')).toBeInTheDocument();

        const tablist = screen.getByRole('tablist', { name: 'Email template selector' });
        expect(within(tablist).getAllByRole('tab')).toHaveLength(6);

        const templateSequence = [
            { label: 'High English', subject: DEFAULT_CONFIG.emailSubjectFormat },
            { label: 'Standard', subject: DEFAULT_CONFIG.emailSubjectFormat },
            { label: 'General reminder', subject: DEFAULT_CONFIG.reminderEmailSubjectFormat },
            { label: 'Day before', subject: DEFAULT_CONFIG.reminderTomorrowEmailSubjectFormat },
            { label: 'CRM graduates', subject: DEFAULT_CONFIG.statusEmailSubjectFormat },
            { label: 'External lists', subject: DEFAULT_CONFIG.outreachEmailSubjectFormat },
        ];

        for (const tpl of templateSequence) {
            const tab = within(tablist).getByRole('tab', { name: new RegExp(`^${tpl.label}`) });
            fireEvent.click(tab);
            expect(tab).toHaveAttribute('aria-selected', 'true');
            expect(screen.getByLabelText(`${tpl.label} email body`)).toBeInTheDocument();
            expect(screen.getByLabelText('Email subject')).toHaveValue(tpl.subject);
        }
    });

    it('shows calm info note on Reminder tabs instead of confirmation validation', () => {
        render(<EmailsTabHarness />);

        const tablist = screen.getByRole('tablist', { name: 'Email template selector' });

        for (const label of ['General reminder', 'Day before']) {
            fireEvent.click(within(tablist).getByRole('tab', { name: new RegExp(`^${label}`) }));
            expect(screen.getByText(/no confirmation button is needed/i)).toBeInTheDocument();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.queryByText(/Missing confirmation action/i)).not.toBeInTheDocument();

            // Editing reminder body without any button tag still keeps Save enabled with no alert
            fireEvent.change(screen.getByLabelText(`${label} email body`), {
                target: { value: '<p>See you soon!</p>' },
            });
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
        }
    });

    it('does not show {studentName} placeholder chip in Invitation templates', () => {
        render(<EmailsTabHarness />);

        const tablist = screen.getByRole('tablist', { name: 'Email template selector' });

        // High English (default active)
        expect(screen.queryByText('{studentName}')).not.toBeInTheDocument();
        expect(screen.getByText('{englishWarning}')).toBeInTheDocument();
        expect(screen.getByText('{confirmationButton}')).toBeInTheDocument();

        // Standard invitation
        fireEvent.click(within(tablist).getByRole('tab', { name: /^Standard/ }));
        expect(screen.queryByText('{studentName}')).not.toBeInTheDocument();
        expect(screen.queryByText('{englishWarning}')).not.toBeInTheDocument();
        expect(screen.getByText('{confirmationButton}')).toBeInTheDocument();
    });

    it('validates missing {confirmationButton} on High English, names it in the save bar across tabs, jumps back on click, and restores via 1-click Add button', () => {
        render(<EmailsTabHarness />);

        const tablist = screen.getByRole('tablist', { name: 'Email template selector' });

        // Remove {confirmationButton} from High English
        fireEvent.change(screen.getByLabelText('High English email body'), {
            target: { value: '<p>Hello, please attend our course.</p>' },
        });

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Missing confirmation action/i);
        expect(within(alert).getByRole('button', { name: 'Add button' })).toBeInTheDocument();

        // Save changes is disabled and save bar names High English
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
        const saveBar = screen.getByRole('status');
        expect(saveBar).toHaveTextContent(/Fix template warnings to save/i);
        expect(within(saveBar).getByRole('button', { name: 'High English' })).toBeInTheDocument();

        // Switch to another template tab — save bar still disables Save and names High English
        fireEvent.click(within(tablist).getByRole('tab', { name: /^General reminder/ }));
        expect(within(tablist).getByRole('tab', { name: /^General reminder/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

        const jumpBackBtn = within(screen.getByRole('status')).getByRole('button', { name: 'High English' });
        fireEvent.click(jumpBackBtn);

        // Clicking High English in the save bar jumps back to the High English tab
        expect(within(tablist).getByRole('tab', { name: /^High English/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('alert')).toBeInTheDocument();

        // Clicking 1-click Add button inserts {confirmationButton} and re-enables Save changes
        fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Add button' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText(/Ready to send — confirmation action is included/i)).toBeInTheDocument();
        expect(screen.getByLabelText('High English email body')).toHaveValue(
            '<p>Hello, please attend our course.</p><p>{confirmationButton}</p>',
        );
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    it('toggles Desktop / Mobile preview viewport header and shows Multi-date only on invite tabs', () => {
        render(<EmailsTabHarness />);

        const desktopBtn = screen.getByRole('button', { name: 'Desktop' });
        const mobileBtn = screen.getByRole('button', { name: 'Mobile' });

        expect(desktopBtn).toHaveAttribute('aria-pressed', 'true');
        expect(mobileBtn).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('375px')).not.toBeInTheDocument();

        fireEvent.click(mobileBtn);
        expect(mobileBtn).toHaveAttribute('aria-pressed', 'true');
        expect(desktopBtn).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByText('Mobile inbox')).toBeInTheDocument();
        expect(screen.getByText('375px')).toBeInTheDocument();

        fireEvent.click(desktopBtn);
        expect(screen.queryByText('375px')).not.toBeInTheDocument();

        // Multi-date toggle appears only on invite tabs
        const tablist = screen.getByRole('tablist', { name: 'Email template selector' });
        expect(screen.getByLabelText('Multi-date')).toBeInTheDocument();

        fireEvent.click(within(tablist).getByRole('tab', { name: /^Standard/ }));
        expect(screen.getByLabelText('Multi-date')).toBeInTheDocument();

        for (const nonInviteLabel of ['General reminder', 'Day before', 'CRM graduates', 'External lists']) {
            fireEvent.click(within(tablist).getByRole('tab', { name: new RegExp(`^${nonInviteLabel}`) }));
            expect(screen.queryByLabelText('Multi-date')).not.toBeInTheDocument();
        }
    });

    it('restores active template via Reset template dialog and calls onResetAll via Reset all dialog', async () => {
        const onResetAllSpy = vi.fn().mockResolvedValue(undefined);
        render(<EmailsTabHarness onResetAllSpy={onResetAllSpy} />);

        // Reset template starts disabled when template matches defaults
        expect(screen.getByRole('button', { name: 'Reset template' })).toBeDisabled();

        // Modify High English subject and body
        fireEvent.change(screen.getByLabelText('Email subject'), {
            target: { value: 'Custom invitation subject' },
        });
        fireEvent.change(screen.getByLabelText('High English email body'), {
            target: { value: '<p>Custom body {confirmationButton}</p>' },
        });

        const resetTemplateBtn = screen.getByRole('button', { name: 'Reset template' });
        expect(resetTemplateBtn).toBeEnabled();
        fireEvent.click(resetTemplateBtn);

        const templateDialog = screen.getByRole('alertdialog');
        expect(within(templateDialog).getByText('Reset "High English" template?')).toBeInTheDocument();
        fireEvent.click(within(templateDialog).getByRole('button', { name: 'Reset template' }));

        expect(screen.getByLabelText('Email subject')).toHaveValue(DEFAULT_CONFIG.emailSubjectFormat);
        expect(screen.getByLabelText('High English email body')).toHaveValue(DEFAULT_CONFIG.htmlEmailTemplate);

        // Reset all dialog invokes onResetAll
        fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
        const resetAllDialog = screen.getByRole('alertdialog');
        expect(within(resetAllDialog).getByText('Reset all email settings?')).toBeInTheDocument();

        fireEvent.click(within(resetAllDialog).getByRole('button', { name: 'Reset all' }));
        await waitFor(() => {
            expect(onResetAllSpy).toHaveBeenCalledTimes(1);
        });
    });
});
