import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Lock, Mail, Sparkles } from 'lucide-react';

export default function LoginPage() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await signIn(email, password);
        } catch {
            setError('Invalid email or password');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-surface-950 via-brand-950 to-surface-900 flex items-center justify-center px-4 relative overflow-hidden">
            {/* Animated orbs */}
            <div className="absolute top-20 left-20 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl animate-orb1" />
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent-500/8 rounded-full blur-3xl animate-orb2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-600/5 rounded-full blur-3xl" />

            <div className="relative w-full max-w-md animate-scaleIn">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-xl shadow-brand-500/30 animate-glow">
                        <Sparkles size={28} />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-1">Course CRM</h1>
                    <p className="text-sm text-white/40 font-medium">Sign in to manage your courses</p>
                </div>

                {/* Card */}
                <div className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="text-sm text-red-300 bg-red-500/15 border border-red-500/20 px-4 py-2.5 rounded-xl animate-slideDown text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                                <input
                                    type="email"
                                    placeholder="admin@example.com"
                                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400/40 transition-all"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400/40 transition-all"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-white/20 mt-6 font-medium">
                    Course CRM • Management System
                </p>
            </div>
        </div>
    );
}
