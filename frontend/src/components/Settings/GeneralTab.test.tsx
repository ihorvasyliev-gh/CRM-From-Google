import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneralTab from './GeneralTab';
import {
    getPushStatus,
    subscribeUserToPush,
    unsubscribeUserFromPush,
} from '../../lib/pushNotifications';
import { supabase } from '../../lib/supabase';

const authState = vi.hoisted(() => ({
    user: {
        id: 'u-admin',
        email: 'jane.doe@example.com',
        user_metadata: { full_name: 'Jane Doe' } as Record<string, unknown>,
    } as { id: string; email?: string; user_metadata?: Record<string, unknown> } | null,
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: authState.user }),
}));

vi.mock('../../lib/pushNotifications', () => ({
    getPushStatus: vi.fn(),
    subscribeUserToPush: vi.fn(),
    unsubscribeUserFromPush: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
    },
}));

function renderGeneralTab(overrides?: {
    darkMode?: boolean;
    density?: 'comfortable' | 'compact';
}) {
    const onDarkModeChange = vi.fn();
    const onDensityChange = vi.fn();

    const utils = render(
        <GeneralTab
            darkMode={overrides?.darkMode ?? false}
            onDarkModeChange={onDarkModeChange}
            density={overrides?.density ?? 'comfortable'}
            onDensityChange={onDensityChange}
        />,
    );

    return { ...utils, onDarkModeChange, onDensityChange };
}

describe('GeneralTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authState.user = {
            id: 'u-admin',
            email: 'jane.doe@example.com',
            user_metadata: { full_name: 'Jane Doe' },
        };
        vi.mocked(getPushStatus).mockResolvedValue({
            supported: true,
            permission: 'default',
            subscribed: false,
        });
        vi.mocked(subscribeUserToPush).mockResolvedValue(true);
        vi.mocked(unsubscribeUserFromPush).mockResolvedValue(true);
    });

    it('displays user initials, email, Admin badge, and StaffNameField with live {staffName} preview', async () => {
        renderGeneralTab();

        expect(screen.getByText('JD')).toBeInTheDocument();
        expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
        expect(screen.getByText('Admin')).toBeInTheDocument();
        expect(screen.getByText('{staffName}')).toBeInTheDocument();

        const nameInput = screen.getByLabelText('Your name on documents');
        expect(nameInput).toHaveValue('Jane Doe');

        const saveButton = screen.getByRole('button', { name: 'Save' });
        expect(saveButton).toBeDisabled();

        // Typing updates the live Word & PDF preview pill and enables Save
        fireEvent.change(nameInput, { target: { value: 'Ihor Vasyliev' } });
        expect(screen.getByText('Ihor Vasyliev')).toBeInTheDocument();
        expect(screen.getByText('(unsaved)')).toBeInTheDocument();
        expect(saveButton).toBeEnabled();

        fireEvent.click(saveButton);
        await waitFor(() => {
            expect(supabase.auth.updateUser).toHaveBeenCalledWith({
                data: { full_name: 'Ihor Vasyliev' },
            });
        });
    });

    it('theme selector cards call onDarkModeChange and reflect aria-pressed', async () => {
        const { onDarkModeChange, rerender } = renderGeneralTab({ darkMode: false });
        await screen.findByText('Off');

        const lightCard = screen.getByRole('button', { name: /^Light/ });
        const darkCard = screen.getByRole('button', { name: /^Dark/ });

        expect(lightCard).toHaveAttribute('aria-pressed', 'true');
        expect(darkCard).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(darkCard);
        expect(onDarkModeChange).toHaveBeenCalledWith(true);

        rerender(
            <GeneralTab
                darkMode={true}
                onDarkModeChange={onDarkModeChange}
                density="comfortable"
                onDensityChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /^Dark/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /^Light/ })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: /^Light/ }));
        expect(onDarkModeChange).toHaveBeenCalledWith(false);
    });

    it('interface density cards call onDensityChange and reflect aria-pressed', async () => {
        const { onDensityChange, rerender } = renderGeneralTab({ density: 'comfortable' });
        await screen.findByText('Off');

        const comfortableCard = screen.getByRole('button', { name: /^Comfortable/ });
        const compactCard = screen.getByRole('button', { name: /^Compact/ });

        expect(comfortableCard).toHaveAttribute('aria-pressed', 'true');
        expect(compactCard).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(compactCard);
        expect(onDensityChange).toHaveBeenCalledWith('compact');

        rerender(
            <GeneralTab
                darkMode={false}
                onDarkModeChange={vi.fn()}
                density="compact"
                onDensityChange={onDensityChange}
            />,
        );

        expect(screen.getByRole('button', { name: /^Compact/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /^Comfortable/ })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: /^Comfortable/ }));
        expect(onDensityChange).toHaveBeenCalledWith('comfortable');
    });

    describe('Browser Notifications states', () => {
        it('Off state: enables notifications via subscribeUserToPush and updates badge to Enabled', async () => {
            vi.mocked(getPushStatus)
                .mockResolvedValueOnce({ supported: true, permission: 'default', subscribed: false })
                .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: true });

            renderGeneralTab();

            expect(await screen.findByText('Off')).toBeInTheDocument();
            const enableBtn = screen.getByRole('button', { name: 'Enable notifications' });
            expect(enableBtn).toBeEnabled();

            fireEvent.click(enableBtn);

            await waitFor(() => {
                expect(subscribeUserToPush).toHaveBeenCalledWith('u-admin');
            });
            expect(await screen.findByText('Enabled')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Disable on this device' })).toBeInTheDocument();
        });

        it('Enabled state: disables notifications via unsubscribeUserFromPush and updates badge to Off', async () => {
            vi.mocked(getPushStatus)
                .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: true })
                .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: false });

            renderGeneralTab();

            expect(await screen.findByText('Enabled')).toBeInTheDocument();
            const disableBtn = screen.getByRole('button', { name: 'Disable on this device' });
            fireEvent.click(disableBtn);

            await waitFor(() => {
                expect(unsubscribeUserFromPush).toHaveBeenCalledWith('u-admin');
            });
            expect(await screen.findByText('Off')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeInTheDocument();
        });

        it('Blocked state: shows Blocked in browser badge and site settings instructions', async () => {
            vi.mocked(getPushStatus).mockResolvedValue({
                supported: true,
                permission: 'denied',
                subscribed: false,
            });

            renderGeneralTab();

            expect(await screen.findByText('Blocked in browser')).toBeInTheDocument();
            expect(screen.getByText(/Notifications are blocked in your browser's site settings/i)).toBeInTheDocument();
            expect(screen.getByText(/set Notifications to Allow for this site/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument();
        });

        it('Unsupported state: shows Not supported badge', async () => {
            vi.mocked(getPushStatus).mockResolvedValue({
                supported: false,
                permission: 'unsupported',
                subscribed: false,
            });

            renderGeneralTab();

            expect(await screen.findByText('Not supported')).toBeInTheDocument();
            expect(screen.getByText(/Web Push notifications are not supported in this browser/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument();
        });
    });
});
