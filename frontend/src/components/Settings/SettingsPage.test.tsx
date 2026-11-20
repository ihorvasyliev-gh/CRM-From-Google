import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../ui/Tooltip';
import SettingsPage from './SettingsPage';
import {
    DEFAULT_CONFIG,
    getConfig,
    saveConfig,
    resetEmailConfig,
    type AppConfig,
    type SaveConfigResult,
} from '../../lib/appConfig';

type ConfigListener = (config: AppConfig) => void;

const mockState = vi.hoisted(() => ({
    currentConfig: null as AppConfig | null,
    listeners: new Set<ConfigListener>(),
}));

function cloneDefaultConfig(): AppConfig {
    return {
        ...DEFAULT_CONFIG,
        excelColumns: DEFAULT_CONFIG.excelColumns.map(col => ({ ...col })),
        emailStyle: { ...DEFAULT_CONFIG.emailStyle },
    };
}

vi.mock('../../lib/appConfig', async importOriginal => {
    const actual = await importOriginal<typeof import('../../lib/appConfig')>();
    return {
        ...actual,
        getConfig: vi.fn(() => {
            const base = mockState.currentConfig ?? {
                ...actual.DEFAULT_CONFIG,
                excelColumns: actual.DEFAULT_CONFIG.excelColumns.map(col => ({ ...col })),
                emailStyle: { ...actual.DEFAULT_CONFIG.emailStyle },
            };
            return {
                ...base,
                excelColumns: base.excelColumns.map(col => ({ ...col })),
                emailStyle: { ...base.emailStyle },
            };
        }),
        onConfigUpdated: vi.fn((listener: ConfigListener) => {
            mockState.listeners.add(listener);
            return () => {
                mockState.listeners.delete(listener);
            };
        }),
        saveConfig: vi.fn(async (patch: Partial<AppConfig>): Promise<SaveConfigResult> => {
            const merged: AppConfig = {
                ...(mockState.currentConfig ?? actual.DEFAULT_CONFIG),
                ...patch,
                emailStyle: patch.emailStyle
                    ? { ...patch.emailStyle }
                    : { ...(mockState.currentConfig ?? actual.DEFAULT_CONFIG).emailStyle },
            };
            mockState.currentConfig = merged;
            return { config: merged, synced: true };
        }),
        resetEmailConfig: vi.fn(async (): Promise<SaveConfigResult> => {
            const reset: AppConfig = {
                ...actual.DEFAULT_CONFIG,
                excelColumns: actual.DEFAULT_CONFIG.excelColumns.map(col => ({ ...col })),
                emailStyle: { ...actual.DEFAULT_CONFIG.emailStyle },
            };
            mockState.currentConfig = reset;
            return { config: reset, synced: true };
        }),
    };
});

vi.mock('../../lib/supabase', () => {
    const createChain = () => {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: () => chain,
            order: () => chain,
            eq: () => chain,
            then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        });
        return chain;
    };
    return {
        supabase: {
            from: vi.fn(() => createChain()),
            rpc: vi.fn((name: string) => {
                if (name === 'list_app_users') {
                    return Promise.resolve({
                        data: [
                            {
                                id: 'u-admin',
                                email: 'admin@example.com',
                                role: 'admin',
                                created_at: '2025-01-01T00:00:00Z',
                                last_sign_in_at: '2026-01-01T00:00:00Z',
                            },
                        ],
                        error: null,
                    });
                }
                return Promise.resolve({ data: [], error: null });
            }),
            auth: {
                updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        },
    };
});

vi.mock('../../lib/emailOptOut', async importOriginal => {
    const actual = await importOriginal<typeof import('../../lib/emailOptOut')>();
    return {
        ...actual,
        listEmailOptOutsSafe: vi.fn().mockResolvedValue([]),
        listEmailOptOuts: vi.fn().mockResolvedValue([]),
        optOutEmail: vi.fn(),
        optInEmail: vi.fn(),
    };
});

vi.mock('../../lib/pushNotifications', () => ({
    getPushStatus: vi.fn().mockResolvedValue({
        supported: true,
        permission: 'default',
        subscribed: false,
    }),
    subscribeUserToPush: vi.fn().mockResolvedValue(true),
    unsubscribeUserFromPush: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'u-admin',
            email: 'admin@example.com',
            user_metadata: { full_name: 'Admin User' },
        },
    }),
}));

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

function renderSettingsPage(initialEntry = '/settings') {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const onDarkModeChange = vi.fn();
    const onDensityChange = vi.fn();

    const utils = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter initialEntries={[initialEntry]}>
                    <SettingsPage
                        darkMode={false}
                        onDarkModeChange={onDarkModeChange}
                        density="comfortable"
                        onDensityChange={onDensityChange}
                    />
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>,
    );

    return { ...utils, onDarkModeChange, onDensityChange };
}

function getMainTabsList() {
    return screen.getByRole('tablist', { name: 'Settings sections' });
}

describe('SettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.listeners.clear();
        mockState.currentConfig = cloneDefaultConfig();
    });

    it('renders all 5 top-level tabs and defaults to General', async () => {
        renderSettingsPage();

        const tablist = getMainTabsList();
        const tabs = within(tablist).getAllByRole('tab');
        expect(tabs).toHaveLength(5);

        expect(within(tablist).getByRole('tab', { name: /^General/ })).toHaveAttribute('aria-selected', 'true');
        expect(within(tablist).getByRole('tab', { name: /^Emails/ })).toHaveAttribute('aria-selected', 'false');
        expect(within(tablist).getByRole('tab', { name: /^Certificates/ })).toHaveAttribute('aria-selected', 'false');
        expect(within(tablist).getByRole('tab', { name: /^Data & Hygiene/ })).toHaveAttribute('aria-selected', 'false');
        expect(within(tablist).getByRole('tab', { name: /^Users & Roles/ })).toHaveAttribute('aria-selected', 'false');

        expect(screen.getByText('Account & Profile')).toBeInTheDocument();
        expect(await screen.findByText('Off')).toBeInTheDocument();
        expect(getConfig).toHaveBeenCalled();
    });

    it('respects initial URL ?tab=emails and switches tabs on click', () => {
        renderSettingsPage('/settings?tab=emails');

        const tablist = getMainTabsList();
        expect(within(tablist).getByRole('tab', { name: /^Emails/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('region', { name: 'Email templates' })).toBeInTheDocument();

        fireEvent.click(within(tablist).getByRole('tab', { name: /^Certificates/ }));
        expect(within(tablist).getByRole('tab', { name: /^Certificates/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Word placeholder reference')).toBeInTheDocument();

        fireEvent.click(within(tablist).getByRole('tab', { name: /^Users & Roles/ }));
        expect(within(tablist).getByRole('tab', { name: /^Users & Roles/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('respects initial URL ?tab=data&sub=unsubscribed', async () => {
        renderSettingsPage('/settings?tab=data&sub=unsubscribed');

        const tablist = getMainTabsList();
        expect(within(tablist).getByRole('tab', { name: /^Data & Hygiene/ })).toHaveAttribute('aria-selected', 'true');

        const subTablist = screen.getByRole('tablist', { name: 'Data & Hygiene sections' });
        expect(within(subTablist).getByRole('tab', { name: /Unsubscribed Emails/ })).toHaveAttribute('aria-selected', 'true');
        expect(within(subTablist).getByRole('tab', { name: /Duplicate Profiles/ })).toHaveAttribute('aria-selected', 'false');
        expect(await screen.findByText('Unsubscribed emails')).toBeInTheDocument();
    });

    it('preserves unsaved email draft across tab switches and shows sr-only unsaved indicator on Emails tab', async () => {
        renderSettingsPage('/settings?tab=emails');

        const subjectInput = screen.getByLabelText('Email subject');
        fireEvent.change(subjectInput, { target: { value: 'Draft subject for {courseName}' } });

        const tablist = getMainTabsList();
        const emailsTab = within(tablist).getByRole('tab', { name: /Emails/ });
        expect(within(emailsTab).getByText(/Unsaved email changes/)).toBeInTheDocument();

        // Switch Emails → General
        fireEvent.click(within(tablist).getByRole('tab', { name: /^General/ }));
        expect(screen.getByText('Account & Profile')).toBeInTheDocument();
        expect(await screen.findByText('Off')).toBeInTheDocument();
        expect(within(within(tablist).getByRole('tab', { name: /Emails/ })).getByText(/Unsaved email changes/)).toBeInTheDocument();

        // Switch back to Emails — draft is still preserved
        fireEvent.click(within(tablist).getByRole('tab', { name: /Emails/ }));
        expect(screen.getByLabelText('Email subject')).toHaveValue('Draft subject for {courseName}');
    });

    it('reverts changes on Discard and saves changes via saveConfig', async () => {
        renderSettingsPage('/settings?tab=emails');

        const originalSubject = DEFAULT_CONFIG.emailSubjectFormat;
        const subjectInput = screen.getByLabelText('Email subject');

        // Edit then Discard
        fireEvent.change(subjectInput, { target: { value: 'Temporary edit' } });
        expect(subjectInput).toHaveValue('Temporary edit');

        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(screen.getByLabelText('Email subject')).toHaveValue(originalSubject);
        expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();

        // Edit then Save changes
        fireEvent.change(screen.getByLabelText('Email subject'), { target: { value: 'Saved subject {courseName}' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => {
            expect(saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    emailSubjectFormat: 'Saved subject {courseName}',
                }),
            );
        });

        expect(await screen.findByText('Saved & synced to your account')).toBeInTheDocument();
        expect(resetEmailConfig).not.toHaveBeenCalled();
    });

    it('shows error message and Retry sync when saveConfig fails to sync, then succeeds on retry', async () => {
        vi.mocked(saveConfig)
            .mockResolvedValueOnce({
                config: {
                    ...cloneDefaultConfig(),
                    emailSubjectFormat: 'Offline draft {courseName}',
                },
                synced: false,
                error: 'Offline',
            })
            .mockResolvedValueOnce({
                config: {
                    ...cloneDefaultConfig(),
                    emailSubjectFormat: 'Offline draft {courseName}',
                },
                synced: true,
            });

        renderSettingsPage('/settings?tab=emails');

        fireEvent.change(screen.getByLabelText('Email subject'), {
            target: { value: 'Offline draft {courseName}' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        expect(await screen.findByText('Offline')).toBeInTheDocument();
        const retryButton = screen.getByRole('button', { name: 'Retry sync' });
        expect(retryButton).toBeEnabled();

        fireEvent.click(retryButton);
        expect(await screen.findByText('Saved & synced to your account')).toBeInTheDocument();
        expect(saveConfig).toHaveBeenCalledTimes(2);
    });

    it('hydrates from onConfigUpdated when clean, and does not clobber an active unsaved draft', () => {
        renderSettingsPage('/settings?tab=emails');

        // Clean state: server hydration updates the subject
        const hydratedConfig: AppConfig = {
            ...cloneDefaultConfig(),
            emailSubjectFormat: 'Hydrated from server {courseName}',
        };
        act(() => {
            mockState.listeners.forEach(listener => listener(hydratedConfig));
        });
        expect(screen.getByLabelText('Email subject')).toHaveValue('Hydrated from server {courseName}');

        // Make an unsaved edit
        fireEvent.change(screen.getByLabelText('Email subject'), {
            target: { value: 'Local unsaved edit' },
        });
        expect(screen.getByLabelText('Email subject')).toHaveValue('Local unsaved edit');

        // Another server update arrives — must NOT clobber active draft
        const laterServerConfig: AppConfig = {
            ...cloneDefaultConfig(),
            emailSubjectFormat: 'Later server overwrite attempt',
        };
        act(() => {
            mockState.listeners.forEach(listener => listener(laterServerConfig));
        });
        expect(screen.getByLabelText('Email subject')).toHaveValue('Local unsaved edit');
    });
});
