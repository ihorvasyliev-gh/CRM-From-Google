import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Eye, Search, Loader2, ArrowUpCircle, RotateCcw, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatDateDMY } from '../lib/dateUtils';
import ConfirmDialog from './ConfirmDialog';

export interface AppUser {
    id: string;
    email: string;
    role: 'admin' | 'viewer' | string;
    created_at: string;
    last_sign_in_at: string | null;
}

/**
 * Admin-only list of app users. New sign-ups are viewers by default;
 * an admin can promote a viewer to admin. Demoting an admin is intentionally not possible.
 */
export default function UserRolesSection() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'viewer' | 'admin'>('all');
    const [confirmUser, setConfirmUser] = useState<AppUser | null>(null);

    const { data: users = [], isLoading, error, refetch, isFetching } = useQuery<AppUser[]>({
        queryKey: ['app_users'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('list_app_users');
            if (error) throw error;
            return (data || []) as AppUser[];
        },
    });

    const promote = useMutation({
        mutationFn: async (userId: string) => {
            const { error } = await supabase.rpc('promote_user_to_admin', { p_user_id: userId });
            if (error) throw error;
        },
        onSuccess: (_data, userId) => {
            queryClient.setQueryData<AppUser[]>(['app_users'], prev => prev?.map(u => (u.id === userId ? { ...u, role: 'admin' } : u)));
            queryClient.invalidateQueries({ queryKey: ['app_users'] });
            const promoted = users.find(u => u.id === userId);
            toast.success(`${promoted?.email ?? 'User'} is now an admin`);
        },
        onError: (err: Error) => toast.error(err.message || 'Failed to change role'),
    });

    const counts = useMemo(() => ({
        all: users.length,
        admin: users.filter(u => u.role !== 'viewer').length,
        viewer: users.filter(u => u.role === 'viewer').length,
    }), [users]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter(u =>
            (filter === 'all' || (filter === 'viewer' ? u.role === 'viewer' : u.role !== 'viewer')) &&
            (!q || u.email?.toLowerCase().includes(q))
        );
    }, [users, search, filter]);

    return (
        <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-brand-500/10 rounded-lg">
                        <ShieldCheck size={16} className="text-brand-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-primary">Users & Roles</h3>
                        <p className="text-xs text-muted mt-0.5">New users join as viewers. Promote a viewer to give full admin access.</p>
                    </div>
                </div>
                <button type="button" onClick={() => refetch()} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated" title="Refresh" aria-label="Refresh users">
                    <RotateCcw size={15} className={isFetching ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by email…"
                            aria-label="Search users"
                            className="w-full h-9 pl-9 pr-3 bg-surface-elevated border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                    </div>
                    <div className="flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl" role="tablist" aria-label="Role filter">
                        {(['all', 'viewer', 'admin'] as const).map(f => (
                            <button
                                key={f}
                                type="button"
                                role="tab"
                                aria-selected={filter === f}
                                onClick={() => setFilter(f)}
                                className={`px-2.5 h-7 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${filter === f ? 'bg-surface text-primary shadow-sm ring-1 ring-border-subtle' : 'text-muted hover:text-primary'}`}
                            >
                                {{ all: 'All', viewer: 'Viewers', admin: 'Admins' }[f]}
                                <span className="text-[10px] text-muted tabular-nums">{counts[f]}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Loading users…</div>
                ) : error ? (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                        Couldn't load users: {(error as Error).message}. Make sure migration 58 has been applied.
                    </div>
                ) : visible.length === 0 ? (
                    <p className="text-sm text-muted text-center py-6">No users match.</p>
                ) : (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {visible.map(u => {
                            const isViewer = u.role === 'viewer';
                            const isMe = u.id === user?.id;
                            return (
                                <li key={u.id} data-testid="app-user-row" className="flex items-center gap-3 px-3.5 py-2.5">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isViewer ? 'bg-surface-elevated text-muted' : 'bg-brand-500/10 text-brand-500'}`}>
                                        {isViewer ? <Eye size={15} /> : <ShieldCheck size={15} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-primary truncate">
                                            {u.email}
                                            {isMe && <span className="ml-1.5 text-[10px] font-bold text-muted">(you)</span>}
                                        </p>
                                        <p className="text-[11px] text-muted">
                                            Joined {formatDateDMY(u.created_at)}
                                            {u.last_sign_in_at ? ` · last sign-in ${formatDateDMY(u.last_sign_in_at)}` : ' · never signed in'}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isViewer ? 'bg-surface-elevated text-muted border border-border-subtle' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20'}`}>
                                        {isViewer ? 'Viewer' : 'Admin'}
                                    </span>
                                    {isViewer && (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmUser(u)}
                                            disabled={promote.isPending}
                                            className="h-8 px-2.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 border border-brand-500/30 hover:bg-brand-500/10 inline-flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {promote.isPending && promote.variables === u.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpCircle size={13} />}
                                            Make admin
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="text-[11px] text-muted flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    Promotion is one-way — admins can't be changed back to viewers here. A promoted user gets admin access after signing in again (or within about an hour).
                </p>
            </div>

            <ConfirmDialog
                open={!!confirmUser}
                title="Make this user an admin?"
                message={confirmUser ? `${confirmUser.email} will get full admin access. This can't be undone from the app.` : ''}
                confirmLabel="Make admin"
                variant="warning"
                onConfirm={() => {
                    if (!confirmUser) return;
                    return promote.mutateAsync(confirmUser.id).catch(() => undefined).finally(() => setConfirmUser(null));
                }}
                onCancel={() => setConfirmUser(null)}
            />
        </section>
    );
}
