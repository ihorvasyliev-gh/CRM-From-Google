import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LoginPage from './LoginPage';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

describe('LoginPage Security Hardening & Lockout', () => {
    const mockSignIn = vi.fn();

    beforeEach(() => {
        vi.mocked(useAuth).mockReturnValue({
            signIn: mockSignIn,
            session: null,
            user: null,
            loading: false,
            signOut: vi.fn(),
        });
        localStorage.clear();
        vi.useFakeTimers();
        mockSignIn.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const performLogin = async (email = 'name@partnershipcork.ie', password = 'password') => {
        const emailInput = screen.getByPlaceholderText('name@partnershipcork.ie');
        const passwordInput = screen.getByPlaceholderText('••••••••');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        fireEvent.change(emailInput, { target: { value: email } });
        fireEvent.change(passwordInput, { target: { value: password } });

        fireEvent.click(submitBtn);
    };

    it('renders the login form with email, password inputs and submit button', () => {
        render(<LoginPage />);
        expect(screen.getByPlaceholderText('name@partnershipcork.ie')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('allows typing into email and password inputs', () => {
        render(<LoginPage />);
        const emailInput = screen.getByPlaceholderText('name@partnershipcork.ie') as HTMLInputElement;
        const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;

        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });

        expect(emailInput.value).toBe('test@example.com');
        expect(passwordInput.value).toBe('password123');
    });

    it('shows error message on a standard failed login attempt without lockout', async () => {
        mockSignIn.mockResolvedValue({ error: new Error('Invalid credentials') });
        render(<LoginPage />);

        const emailInput = screen.getByPlaceholderText('name@partnershipcork.ie');
        const passwordInput = screen.getByPlaceholderText('••••••••');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        await act(async () => {
            await performLogin('test@example.com', 'wrong-pass');
        });

        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        expect(emailInput).not.toBeDisabled();
        expect(passwordInput).not.toBeDisabled();
        expect(submitBtn).not.toBeDisabled();
    });

    it('locks out after 3 consecutive failed login attempts', async () => {
        mockSignIn.mockResolvedValue({ error: new Error('Invalid credentials') });
        render(<LoginPage />);

        const emailInput = screen.getByPlaceholderText('name@partnershipcork.ie');
        const passwordInput = screen.getByPlaceholderText('••••••••');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        // 1st failure
        await act(async () => {
            await performLogin();
        });
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();

        // 2nd failure
        await act(async () => {
            await performLogin();
        });
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();

        // 3rd failure - triggers 30-second lockout
        await act(async () => {
            await performLogin();
        });

        expect(screen.getByText(/too many incorrect attempts/i)).toBeInTheDocument();
        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('0:30');
        expect(emailInput).toBeDisabled();
        expect(passwordInput).toBeDisabled();
        expect(submitBtn).toBeDisabled();
    });

    it('persists lockout across page refreshes / component remounts', async () => {
        const lockedUntil = Date.now() + 30000; // 30 seconds from now
        localStorage.setItem('crm_login_attempts', '3');
        localStorage.setItem('crm_login_locked_until', String(lockedUntil));

        render(<LoginPage />);

        expect(screen.getByText(/too many incorrect attempts/i)).toBeInTheDocument();
        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('0:30');
        expect(screen.getByPlaceholderText('name@partnershipcork.ie')).toBeDisabled();
        expect(screen.getByPlaceholderText('••••••••')).toBeDisabled();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    it('counts down remaining lockout time and unlocks form when timer expires', async () => {
        const lockedUntil = Date.now() + 5000; // 5 seconds
        localStorage.setItem('crm_login_attempts', '3');
        localStorage.setItem('crm_login_locked_until', String(lockedUntil));

        render(<LoginPage />);

        const emailInput = screen.getByPlaceholderText('name@partnershipcork.ie');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        expect(emailInput).toBeDisabled();
        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('0:05');

        // Advance timers by 2 seconds
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('0:03');

        // Advance timers by another 3 seconds (5 seconds total elapsed)
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(screen.queryByText(/too many incorrect attempts/i)).not.toBeInTheDocument();
        expect(emailInput).not.toBeDisabled();
        expect(submitBtn).not.toBeDisabled();
    });

    it('escalates lockout duration progressively on subsequent failures', async () => {
        const lockedUntil = Date.now() + 5000;
        localStorage.setItem('crm_login_attempts', '3');
        localStorage.setItem('crm_login_locked_until', String(lockedUntil));

        render(<LoginPage />);

        // Wait until unlocked
        act(() => {
            vi.advanceTimersByTime(5000);
        });

        // 4th failure - triggers 60-second (1 minute) lockout
        mockSignIn.mockResolvedValue({ error: new Error('Invalid credentials') });
        await act(async () => {
            await performLogin();
        });

        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('1:00');

        // Wait until unlocked again
        act(() => {
            vi.advanceTimersByTime(60000);
        });

        // 5th failure - triggers 5-minute lockout
        await act(async () => {
            await performLogin();
        });

        expect(screen.getByTestId('lockout-countdown')).toHaveTextContent('5:00');
    });

    it('clears attempts counter and lockout data on successful login', async () => {
        mockSignIn.mockResolvedValue({ error: null });
        localStorage.setItem('crm_login_attempts', '2');

        render(<LoginPage />);

        await act(async () => {
            await performLogin();
        });

        expect(localStorage.getItem('crm_login_attempts')).toBeNull();
        expect(localStorage.getItem('crm_login_locked_until')).toBeNull();
    });

    it('shows the reset help text and a keyboard-reachable show-password button', () => {
        render(<LoginPage />);
        expect(screen.getByText(/ask an admin to reset it/i)).toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: /show password/i });
        expect(toggle).not.toHaveAttribute('tabindex', '-1');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });
});
