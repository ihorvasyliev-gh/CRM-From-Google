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

    const performLogin = async (email = 'admin@example.com', password = 'password') => {
        const emailInput = screen.getByPlaceholderText('admin@example.com');
        const passwordInput = screen.getByPlaceholderText('••••••••');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        fireEvent.change(emailInput, { target: { value: email } });
        fireEvent.change(passwordInput, { target: { value: password } });

        fireEvent.click(submitBtn);
    };

    it('renders the login form with email, password inputs and submit button', () => {
        render(<LoginPage />);
        expect(screen.getByPlaceholderText('admin@example.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('allows typing into email and password inputs', () => {
        render(<LoginPage />);
        const emailInput = screen.getByPlaceholderText('admin@example.com') as HTMLInputElement;
        const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;

        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });

        expect(emailInput.value).toBe('test@example.com');
        expect(passwordInput.value).toBe('password123');
    });

    it('shows error message on a standard failed login attempt without lockout', async () => {
        mockSignIn.mockResolvedValue({ error: new Error('Invalid credentials') });
        render(<LoginPage />);

        const emailInput = screen.getByPlaceholderText('admin@example.com');
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

        const emailInput = screen.getByPlaceholderText('admin@example.com');
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

        expect(screen.getByText(/too many failed login attempts/i)).toBeInTheDocument();
        expect(screen.getByText(/please try again in 30 seconds/i)).toBeInTheDocument();
        expect(emailInput).toBeDisabled();
        expect(passwordInput).toBeDisabled();
        expect(submitBtn).toBeDisabled();
    });

    it('persists lockout across page refreshes / component remounts', async () => {
        const lockedUntil = Date.now() + 30000; // 30 seconds from now
        localStorage.setItem('crm_login_attempts', '3');
        localStorage.setItem('crm_login_locked_until', String(lockedUntil));

        render(<LoginPage />);

        expect(screen.getByText(/too many failed login attempts/i)).toBeInTheDocument();
        expect(screen.getByText(/please try again in 30 seconds/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('admin@example.com')).toBeDisabled();
        expect(screen.getByPlaceholderText('••••••••')).toBeDisabled();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    it('counts down remaining lockout time and unlocks form when timer expires', async () => {
        const lockedUntil = Date.now() + 5000; // 5 seconds
        localStorage.setItem('crm_login_attempts', '3');
        localStorage.setItem('crm_login_locked_until', String(lockedUntil));

        render(<LoginPage />);

        const emailInput = screen.getByPlaceholderText('admin@example.com');
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        expect(emailInput).toBeDisabled();
        expect(screen.getByText(/please try again in 5 seconds/i)).toBeInTheDocument();

        // Advance timers by 2 seconds
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByText(/please try again in 3 seconds/i)).toBeInTheDocument();

        // Advance timers by another 3 seconds (5 seconds total elapsed)
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(screen.queryByText(/too many failed login attempts/i)).not.toBeInTheDocument();
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

        expect(screen.getByText(/please try again in 1 minute/i)).toBeInTheDocument();

        // Wait until unlocked again
        act(() => {
            vi.advanceTimersByTime(60000);
        });

        // 5th failure - triggers 5-minute lockout
        await act(async () => {
            await performLogin();
        });

        expect(screen.getByText(/please try again in 5 minutes/i)).toBeInTheDocument();
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
});
