import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';

const LOCKOUT_KEY_PREFIX = 'crm_login';

const getLockoutData = () => {
    try {
        const attempts = Number(localStorage.getItem(`${LOCKOUT_KEY_PREFIX}_attempts`) || '0');
        const lockedUntil = Number(localStorage.getItem(`${LOCKOUT_KEY_PREFIX}_locked_until`) || '0');
        return { attempts, lockedUntil };
    } catch {
        return { attempts: 0, lockedUntil: 0 };
    }
};

const setLockoutData = (attempts: number, lockedUntil: number) => {
    try {
        localStorage.setItem(`${LOCKOUT_KEY_PREFIX}_attempts`, String(attempts));
        localStorage.setItem(`${LOCKOUT_KEY_PREFIX}_locked_until`, String(lockedUntil));
    } catch (e) {
        console.error('Failed to save lockout data:', e);
    }
};

const clearLockoutData = () => {
    try {
        localStorage.removeItem(`${LOCKOUT_KEY_PREFIX}_attempts`);
        localStorage.removeItem(`${LOCKOUT_KEY_PREFIX}_locked_until`);
    } catch (e) {
        console.error('Failed to clear lockout data:', e);
    }
};

const getLockoutDuration = (attempts: number): number => {
    if (attempts === 3) return 30 * 1000;       // 30 seconds
    if (attempts === 4) return 60 * 1000;       // 1 minute
    if (attempts === 5) return 5 * 60 * 1000;   // 5 minutes
    if (attempts >= 6) return 15 * 60 * 1000;   // 15 minutes
    return 0;
};

const formatLockoutTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
};

export default function LoginPage() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);

    useEffect(() => {
        const { lockedUntil } = getLockoutData();
        const now = Date.now();
        if (lockedUntil > now) {
            const seconds = Math.ceil((lockedUntil - now) / 1000);
            setLockoutSecondsLeft(seconds);
            setError(`Too many failed login attempts. Please try again in ${formatLockoutTime(seconds)}.`);
        }
    }, []);

    useEffect(() => {
        if (lockoutSecondsLeft <= 0) return;

        const timer = setInterval(() => {
            const { lockedUntil } = getLockoutData();
            const now = Date.now();
            const remaining = Math.ceil((lockedUntil - now) / 1000);
            if (remaining <= 0) {
                setLockoutSecondsLeft(0);
                setError('');
            } else {
                setLockoutSecondsLeft(remaining);
                setError(`Too many failed login attempts. Please try again in ${formatLockoutTime(remaining)}.`);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [lockoutSecondsLeft]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();

        const { lockedUntil } = getLockoutData();
        const now = Date.now();
        if (lockedUntil > now) {
            const remaining = Math.ceil((lockedUntil - now) / 1000);
            setLockoutSecondsLeft(remaining);
            setError(`Too many failed login attempts. Please try again in ${formatLockoutTime(remaining)}.`);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const { error: signInError } = await signIn(email.trim(), password);
            if (signInError) {
                const { attempts } = getLockoutData();
                const newAttempts = attempts + 1;
                const duration = getLockoutDuration(newAttempts);

                if (duration > 0) {
                    const nextLockout = Date.now() + duration;
                    setLockoutData(newAttempts, nextLockout);
                    const seconds = Math.ceil(duration / 1000);
                    setLockoutSecondsLeft(seconds);
                    setError(`Too many failed login attempts. Please try again in ${formatLockoutTime(seconds)}.`);
                } else {
                    setLockoutData(newAttempts, 0);
                    const message = signInError.message === 'Invalid login credentials'
                        ? 'Invalid email or password'
                        : signInError.message;
                    setError(message || 'Invalid email or password');
                }
            } else {
                clearLockoutData();
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col items-center justify-start sm:justify-center px-4 pt-12 sm:pt-4 relative overflow-hidden">
            {/* One soft brand glow behind the card (radial gradient, no filter: blur) */}
            <div aria-hidden className="orb absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] sm:w-[760px] sm:h-[760px] text-brand-500/[0.08] pointer-events-none" />

            <div className="relative w-full max-w-sm animate-scaleIn">
                {/* Logo */}
                <div className="text-center mb-7">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-500 via-brand-600 to-violet-500 rounded-2xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-lg shadow-brand-500/25 ring-1 ring-inset ring-white/15">
                        C
                    </div>
                    <h1 className="text-2xl font-bold text-primary tracking-tight">CCP CRM</h1>
                    <p className="text-sm text-muted mt-1">Sign in to manage your courses</p>
                </div>

                {/* Card */}
                <div className="bg-surface border border-border-subtle rounded-2xl shadow-float p-6 sm:p-7">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div role="alert" className="text-sm text-status-rejected bg-danger/10 border border-danger/25 px-4 py-2.5 rounded-xl animate-slideDown text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="login-email" className="text-xs font-semibold text-muted mb-1.5 block">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" size={16} />
                                <input
                                    type="email"
                                    id="login-email"
                                    autoComplete="username"
                                    inputMode="email"
                                    placeholder="admin@example.com"
                                    className="w-full h-11 pl-10 pr-4 bg-surface border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    disabled={loading || lockoutSecondsLeft > 0}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="login-password" className="text-xs font-semibold text-muted mb-1.5 block">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" size={16} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="login-password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    onKeyUp={e => setCapsLockOn(e.getModifierState?.('CapsLock') ?? false)}
                                    onKeyDown={e => setCapsLockOn(e.getModifierState?.('CapsLock') ?? false)}
                                    className="w-full h-11 pl-10 pr-11 bg-surface border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    disabled={loading || lockoutSecondsLeft > 0}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    aria-pressed={showPassword}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted/70 hover:text-primary hover:bg-surface-elevated transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {capsLockOn && (
                                <p className="mt-1.5 text-[11px] font-medium text-status-requested">Caps Lock is on</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || lockoutSecondsLeft > 0}
                            className="w-full h-11 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-colors shadow-sm shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-muted/70 mt-6">
                    CCP CRM • Management System
                </p>
            </div>
        </div>
    );
}
