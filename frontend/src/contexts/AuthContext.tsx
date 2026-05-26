import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AlertCircle } from 'lucide-react';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [setupError, setSetupError] = useState<string | null>(null);

    useEffect(() => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) {
            setSetupError("Supabase configuration is missing. Please check your .env file or environment variables.");
            setLoading(false);
            return;
        }

        const syncUserSettings = async (userId: string) => {
            try {
                const { data, error } = await supabase
                    .from('user_settings')
                    .select('settings')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching user settings:', error);
                } else if (data && data.settings) {
                    localStorage.setItem('crm_app_config', JSON.stringify(data.settings));
                } else {
                    // Create default settings row in Supabase
                    const { DEFAULT_CONFIG } = await import('../lib/appConfig');
                    const settingsToSave = { ...DEFAULT_CONFIG };
                    localStorage.setItem('crm_app_config', JSON.stringify(settingsToSave));
                    await supabase.from('user_settings').insert({
                        user_id: userId,
                        settings: settingsToSave
                    });
                }
            } catch (e) {
                console.error('Failed to sync user settings:', e);
            }
        };

        // Get initial session
        supabase.auth.getSession()
            .then(async ({ data: { session }, error }) => {
                if (error) {
                    console.error("Auth Session Error:", error);
                    setSetupError(error.message || "Failed to connect. Invalid or expired token.");
                } else {
                    setSession(session);
                    setUser(session?.user ?? null);
                    if (session?.user) {
                        await syncUserSettings(session.user.id);
                    }
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Auth Session Catch:", err);
                setSetupError(err.message || "Network error. Failed to connect to Supabase backend.");
                setLoading(false);
            });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                
                if (session?.user) {
                    await syncUserSettings(session.user.id);
                } else if (event === 'SIGNED_OUT') {
                    localStorage.removeItem('crm_app_config');
                }
                
                setLoading(false);
            }
        );

        return () => subscription?.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    if (setupError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4 animate-fadeIn">
                <div className="w-full max-w-md bg-surface-elevated border border-red-500/30 shadow-2xl rounded-2xl p-6 text-center">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-full mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-primary mb-2">Connection Error</h2>
                    <p className="text-sm text-muted mb-6">{setupError}</p>
                    <div className="bg-surface p-4 rounded-xl border border-border-subtle text-left">
                        <h4 className="text-xs font-bold uppercase text-primary mb-2">How to fix this:</h4>
                        <ol className="text-xs text-muted space-y-2 list-decimal list-inside pl-1">
                            <li>Ensure you have a <code className="font-mono text-[10px] px-1 py-0.5 bg-surface-elevated rounded border border-border-subtle">.env</code> or <code className="font-mono text-[10px] px-1 py-0.5 bg-surface-elevated rounded border border-border-subtle">.env.local</code> file.</li>
                            <li>Add your <code className="font-mono text-[10px] px-1 py-0.5 bg-surface-elevated rounded border border-border-subtle">VITE_SUPABASE_URL</code>.</li>
                            <li>Add your <code className="font-mono text-[10px] px-1 py-0.5 bg-surface-elevated rounded border border-border-subtle">VITE_SUPABASE_ANON_KEY</code>.</li>
                            <li>Restart your development server.</li>
                        </ol>
                    </div>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors shadow-sm"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
