import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowUpCircle,
    Eye,
    FileInput,
    Info,
    ListChecks,
    RotateCcw,
    ShieldCheck,
    Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatDisplayDate } from '../lib/dateUtils';
import ConfirmDialog from './ConfirmDialog';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import SearchInput from './ui/SearchInput';
import { Segmented, type SegmentOption } from './ui/Tabs';
import { EmptyState, SkeletonRows } from './ui/States';
import { calloutCls, panelCls } from './ui/styles';
import { normalizeRole, ROLE_LABELS, type AppRole } from '../lib/roles';

export interface AppUser {
    id: string;
    email: string;
    role: AppRole | string;
    created_at: string;
    last_sign_in_at: string | null;
}

const ROLE_ICONS = { admin: ShieldCheck, viewer: Eye, outreach: ListChecks, forms: FileInput } as const;

const ROLE_BADGE_CLS: Record<AppRole, string> = {
    admin: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20',
    viewer: 'bg-surface-elevated text-muted border-border-subtle',
    outreach: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    forms: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
};

const ROLE_GUIDE: readonly { role: AppRole; title: string; description: string }[] = [
    {
        role: 'admin',
        title: 'Admin',
        description: 'Full CRM access, settings, templates & user management (one-way promotion).',
    },
    {
        role: 'viewer',
        title: 'Viewer',
        description: 'Read-only students & courses, plus External Lists and PDF Forms.',
    },
    {
        role: 'outreach',
        title: 'External Lists',
        description: 'Create & manage External Lists and fill PDF Forms.',
    },
    {
        role: 'forms',
        title: 'PDF Forms',
        description: 'Manage & fill PDF Forms only.',
    },
];

type RoleFilter = 'all' | AppRole;

/**
 * Admin-only list of app users. New sign-ups are viewers by default; an admin can switch a
 * non-admin between "Viewer", "External Lists" (outreach) and "PDF Forms" (forms),
 * or promote any of them to admin. Demoting an admin is intentionally not possible.
 */
export default function UserRolesSection() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<RoleFilter>('all');
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

    const setRole = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
            const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role });
            if (error) throw error;
        },
        onSuccess: (_data, { userId, role }) => {
            queryClient.setQueryData<AppUser[]>(['app_users'], prev => prev?.map(u => (u.id === userId ? { ...u, role } : u)));
            queryClient.invalidateQueries({ queryKey: ['app_users'] });
            const changed = users.find(u => u.id === userId);
            toast.success(`${changed?.email ?? 'User'} is now: ${ROLE_LABELS[role]}`);
        },
        onError: (err: Error) => toast.error(err.message || 'Failed to change role'),
    });

    const counts = useMemo(
        () => ({
            all: users.length,
            admin: users.filter(u => normalizeRole(u.role) === 'admin').length,
            viewer: users.filter(u => normalizeRole(u.role) === 'viewer').length,
            outreach: users.filter(u => normalizeRole(u.role) === 'outreach').length,
            forms: users.filter(u => normalizeRole(u.role) === 'forms').length,
        }),
        [users],
    );

    const filterOptions: SegmentOption<RoleFilter>[] = useMemo(
        () => [
            { value: 'all', label: 'All', count: counts.all },
            { value: 'viewer', label: 'Viewers', count: counts.viewer },
            { value: 'outreach', label: 'External Lists', count: counts.outreach },
            { value: 'forms', label: 'PDF Forms', count: counts.forms },
            { value: 'admin', label: 'Admins', count: counts.admin },
        ],
        [counts],
    );

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter(
            u =>
                (filter === 'all' || normalizeRole(u.role) === filter) &&
                (!q || u.email?.toLowerCase().includes(q)),
        );
    }, [users, search, filter]);

    const hasActiveFilter = filter !== 'all' || search.trim().length > 0;

    return (
        <Card
            title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>Users &amp; Roles</span>
                    {!isLoading && !error && (
                        <Badge tone="brand" shape="pill" className="tabular-nums">
                            {users.length} {users.length === 1 ? 'user' : 'users'}
                        </Badge>
                    )}
                </span>
            }
            subtitle="New sign-ups start as Viewers. Assign a scoped workspace role or promote team members to Admin."
            icon={ShieldCheck}
            divided
            action={
                <IconButton label="Refresh users" title="Refresh" onClick={() => refetch()}>
                    <RotateCcw size={15} className={isFetching ? 'animate-spin' : ''} />
                </IconButton>
            }
        >
            <div className="space-y-4">
                {/* Role Capabilities Guide */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5" aria-label="Role capabilities overview">
                    {ROLE_GUIDE.map(({ role, title, description }) => {
                        const Icon = ROLE_ICONS[role];
                        return (
                            <div key={role} className={`${panelCls} p-3 flex flex-col gap-1.5 min-w-0`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${ROLE_BADGE_CLS[role]}`}
                                        >
                                            <Icon size={13} aria-hidden="true" />
                                        </span>
                                        <span className="text-xs font-semibold text-primary truncate">{title}</span>
                                    </div>
                                    {!isLoading && !error && (
                                        <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                                            {counts[role]}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted leading-snug">{description}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Search & Role Filter Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search by email…"
                        aria-label="Search users"
                        wrapperClassName="flex-1 min-w-0"
                        className="h-9!"
                    />
                    <Segmented<RoleFilter>
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                        ariaLabel="Role filter"
                        className="self-start lg:self-auto"
                    />
                </div>

                {isLoading ? (
                    <SkeletonRows rows={4} />
                ) : error ? (
                    <div className={`${calloutCls.danger} text-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                        <span>
                            Couldn't load users: {(error as Error).message}. Make sure migration 58 has been applied.
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => refetch()} className="self-start sm:self-center shrink-0">
                            Try again
                        </Button>
                    </div>
                ) : visible.length === 0 ? (
                    <EmptyState
                        bare
                        className="py-8!"
                        icon={<Users size={20} />}
                        title="No users match"
                        description={
                            hasActiveFilter
                                ? 'Try a different email search or switch back to all roles.'
                                : 'No team accounts have signed up yet.'
                        }
                        action={
                            hasActiveFilter ? (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setSearch('');
                                        setFilter('all');
                                    }}
                                >
                                    Clear filters
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden bg-surface">
                        {visible.map(u => {
                            const role = normalizeRole(u.role);
                            const RoleIcon = ROLE_ICONS[role];
                            const isMe = u.id === user?.id;
                            const isPromoting = promote.isPending && promote.variables === u.id;
                            const busy = isPromoting || (setRole.isPending && setRole.variables?.userId === u.id);

                            return (
                                <li
                                    key={u.id}
                                    data-testid="app-user-row"
                                    className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 px-3.5 py-3 hover:bg-surface-elevated/40 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span
                                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${ROLE_BADGE_CLS[role]}`}
                                        >
                                            <RoleIcon size={15} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-semibold text-primary truncate">
                                                {u.email}
                                                {isMe && (
                                                    <span className="ml-1.5 text-xs font-bold text-muted">(you)</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted truncate">
                                                Joined {formatDisplayDate(u.created_at)}
                                                {u.last_sign_in_at
                                                    ? ` · last sign-in ${formatDisplayDate(u.last_sign_in_at)}`
                                                    : ' · never signed in'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center flex-wrap gap-2 pl-11 sm:pl-0 shrink-0">
                                        {role === 'admin' ? (
                                            <span
                                                className={`px-2.5 h-6 inline-flex items-center gap-1 rounded-md text-xs font-semibold border ${ROLE_BADGE_CLS.admin}`}
                                            >
                                                <ShieldCheck size={12} aria-hidden="true" />
                                                {ROLE_LABELS.admin}
                                            </span>
                                        ) : (
                                            <>
                                                <select
                                                    value={role}
                                                    onChange={e =>
                                                        setRole.mutate({ userId: u.id, role: e.target.value as AppRole })
                                                    }
                                                    disabled={busy}
                                                    aria-label={`Role for ${u.email}`}
                                                    className="h-8 px-2.5 bg-surface border border-border-subtle rounded-lg text-xs font-semibold text-primary cursor-pointer focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                                                >
                                                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                                                    <option value="outreach">{ROLE_LABELS.outreach}</option>
                                                    <option value="forms">{ROLE_LABELS.forms}</option>
                                                </select>
                                                <Button
                                                    variant="brand-soft"
                                                    size="sm"
                                                    loading={isPromoting}
                                                    disabled={promote.isPending || setRole.isPending}
                                                    onClick={() => setConfirmUser(u)}
                                                >
                                                    {!isPromoting && <ArrowUpCircle size={13} />}
                                                    Make admin
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="text-xs text-muted flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                        Promotion to Admin is one-way and cannot be reversed from inside the app. Role changes take effect the next time the user signs in, or within about an hour.
                    </span>
                </p>
            </div>

            <ConfirmDialog
                open={!!confirmUser}
                title="Make this user an admin?"
                message={
                    confirmUser
                        ? `${confirmUser.email} will get full admin access. This can't be undone from the app.`
                        : ''
                }
                confirmLabel="Make admin"
                variant="warning"
                onConfirm={() => {
                    if (!confirmUser) return;
                    return promote
                        .mutateAsync(confirmUser.id)
                        .catch(() => undefined)
                        .finally(() => setConfirmUser(null));
                }}
                onCancel={() => setConfirmUser(null)}
            />
        </Card>
    );
}
