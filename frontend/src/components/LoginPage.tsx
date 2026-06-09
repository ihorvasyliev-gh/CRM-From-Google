import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Lock, Mail, Sparkles } from 'lucide-react';

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
            const { error: signInError } = await signIn(email, password);
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
                    setError(signInError.message || 'Invalid email or password');
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
        <div className="min-h-screen bg-gradient-to-br from-background via-brand-50/30 to-background dark:via-brand-950/20 flex items-center justify-center px-4 relative overflow-hidden">
            {/* Animated orbs */}
            <div className="absolute top-20 left-20 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl animate-orb1" />
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl animate-orb2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-600/5 rounded-full blur-3xl" />

            <div className="relative w-full max-w-md animate-scaleIn">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-400 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-xl shadow-brand-500/30 animate-glow">
                        <Sparkles size={28} />
                    </div>
                    <h1 className="text-3xl font-bold text-primary mb-1">Course CRM</h1>
                    <p className="text-sm text-muted font-medium">Sign in to manage your courses</p>
                </div>

                {/* Card */}
                <div className="bg-surface/60 dark:bg-white/5 backdrop-blur-2xl border border-border-subtle/80 dark:border-white/10 rounded-2xl shadow-2xl p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 dark:bg-red-500/15 border border-red-500/20 px-4 py-2.5 rounded-xl animate-slideDown text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" size={16} />
                                <input
                                    type="email"
                                    placeholder="admin@example.com"
                                    className="w-full pl-10 pr-4 py-3 bg-surface-elevated/50 dark:bg-white/5 border border-border-subtle dark:border-white/10 rounded-xl text-sm text-primary placeholder:text-muted/50 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/40 focus:border-brand-500 dark:focus:border-brand-400/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    disabled={loading || lockoutSecondsLeft > 0}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" size={16} />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-3 bg-surface-elevated/50 dark:bg-white/5 border border-border-subtle dark:border-white/10 rounded-xl text-sm text-primary placeholder:text-muted/50 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/40 focus:border-brand-500 dark:focus:border-brand-400/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    disabled={loading || lockoutSecondsLeft > 0}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || lockoutSecondsLeft > 0}
                            className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-muted/50 dark:text-white/20 mt-6 font-medium">
                    Course CRM • Management System
                </p>
            </div>
        </div>
    );
}
