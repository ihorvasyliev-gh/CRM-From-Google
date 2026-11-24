import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, RefreshCw, ShieldAlert, GitMerge, Trash2, Archive, MailX, UserCog, Database } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import { EmptyState, SkeletonRows } from '../ui/States';
import { tableCls, theadCls, thCls, tbodyCls, tdCls } from '../ui/styles';

export interface AuditLogEntry {
    id: string;
    created_at: string;
    actor_id: string | null;
    actor_email: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    summary: string;
    details: Record<string, unknown> | null;
}

const PAGE_SIZE = 40;

const ACTION_FILTERS = [
    { value: 'all', label: 'All events' },
    { value: 'student.merge', label: 'Student merges' },
    { value: 'student.delete', label: 'Student deletions' },
    { value: 'user.role_changed', label: 'Role changes' },
    { value: 'email.opted_out', label: 'Unsubscribes' },
    { value: 'email.opted_in', label: 'Re-subscribes' },
    { value: 'course.archived', label: 'Courses archived' },
    { value: 'course.unarchived', label: 'Courses restored' },
    { value: 'course.deleted', label: 'Courses deleted' },
] as const;

function actionMeta(action: string): { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success'; icon: React.JSX.Element } {
    switch (action) {
        case 'student.merge':
            return { label: 'Merged', tone: 'info', icon: <GitMerge size={12} /> };
        case 'student.delete':
            return { label: 'Student deleted', tone: 'danger', icon: <Trash2 size={12} /> };
        case 'user.role_changed':
            return { label: 'Role changed', tone: 'warning', icon: <UserCog size={12} /> };
        case 'email.opted_out':
            return { label: 'Unsubscribed', tone: 'warning', icon: <MailX size={12} /> };
        case 'email.opted_in':
            return { label: 'Re-subscribed', tone: 'success', icon: <MailX size={12} /> };
        case 'course.archived':
            return { label: 'Course archived', tone: 'neutral', icon: <Archive size={12} /> };
        case 'course.unarchived':
            return { label: 'Course restored', tone: 'success', icon: <Archive size={12} /> };
        case 'course.deleted':
            return { label: 'Course deleted', tone: 'danger', icon: <Trash2 size={12} /> };
        default:
            return { label: action, tone: 'neutral', icon: <ShieldAlert size={12} /> };
    }
}

function isMissingTable(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'PGRST205' || code === '42P01';
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function fetchAuditLog(actionFilter: string, search: string, limit: number): Promise<{ rows: AuditLogEntry[]; available: boolean; hasMore: boolean }> {
    let query = supabase
        .from('audit_log')
        .select('id, created_at, actor_id, actor_email, action, entity_type, entity_id, summary, details')
        .order('created_at', { ascending: false })
        .limit(limit + 1);

    if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
    }
    const cleanSearch = search.trim();
    if (cleanSearch) {
        const escaped = cleanSearch.replace(/[\\%_]/g, '\\$&').replace(/[,()]/g, ' ');
        query = query.or(`summary.ilike.%${escaped}%,actor_email.ilike.%${escaped}%,action.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
        if (isMissingTable(error)) return { rows: [], available: false, hasMore: false };
        throw error;
    }
    const list = (data || []) as AuditLogEntry[];
    return {
        rows: list.slice(0, limit),
        available: true,
        hasMore: list.length > limit,
    };
}

export default function ActivityLogPanel() {
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 250);
    const [limit, setLimit] = useState(PAGE_SIZE);

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['audit_log', actionFilter, debouncedSearch, limit],
        queryFn: () => fetchAuditLog(actionFilter, debouncedSearch, limit),
        staleTime: 30_000,
    });

    if (data && !data.available) {
        return (
            <Card className="p-6">
                <EmptyState
                    icon={<Database size={24} />}
                    title="Activity log not enabled yet"
                    description="Run migration 100 (supabase/100_audit_log_and_course_archive.sql) to start recording deletions, merges, role changes, and course archives."
                />
            </Card>
        );
    }

    const rows = data?.rows ?? [];

    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <SearchInput
                    wrapperClassName="flex-1 sm:max-w-xs"
                    placeholder="Search summary or admin email…"
                    value={search}
                    onChange={v => { setSearch(v); setLimit(PAGE_SIZE); }}
                    aria-label="Search activity log"
                />
                <select
                    aria-label="Filter by event type"
                    value={actionFilter}
                    onChange={e => { setActionFilter(e.target.value); setLimit(PAGE_SIZE); }}
                    className="h-9 text-sm bg-surface border border-border-subtle rounded-xl pl-3 pr-8 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                >
                    {ACTION_FILTERS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    className="sm:ml-auto"
                >
                    <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                    Refresh
                </Button>
            </div>

            {error ? (
                <Card className="p-5 text-sm text-status-rejected">
                    Could not load activity log. Please try again.
                </Card>
            ) : isLoading ? (
                <Card className="p-4">
                    <SkeletonRows rows={5} />
                </Card>
            ) : rows.length === 0 ? (
                <Card className="p-6">
                    <EmptyState
                        icon={<History size={24} />}
                        title="No activity recorded yet"
                        description={search.trim() || actionFilter !== 'all'
                            ? 'No audit events match your current filters.'
                            : 'Critical admin changes (merges, deletions, role updates, unsubscribes, course archives) will appear here.'}
                    />
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>When</th>
                                    <th className={thCls}>Event</th>
                                    <th className={thCls}>Summary</th>
                                    <th className={thCls}>By</th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {rows.map(entry => {
                                    const meta = actionMeta(entry.action);
                                    return (
                                        <tr key={entry.id} className="hover:bg-surface-elevated/40 transition-colors">
                                            <td className={`${tdCls} whitespace-nowrap text-xs text-muted tabular-nums`}>
                                                {formatTimestamp(entry.created_at)}
                                            </td>
                                            <td className={`${tdCls} whitespace-nowrap`}>
                                                <Badge tone={meta.tone} shape="pill" className="inline-flex items-center gap-1">
                                                    {meta.icon}
                                                    {meta.label}
                                                </Badge>
                                            </td>
                                            <td className={`${tdCls} text-sm text-primary max-w-md`}>
                                                {entry.summary}
                                            </td>
                                            <td className={`${tdCls} whitespace-nowrap text-xs text-muted`}>
                                                {entry.actor_email || 'System'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {data?.hasMore && (
                        <div className="p-3 border-t border-border-subtle flex justify-center">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setLimit(prev => prev + PAGE_SIZE)}
                                disabled={isFetching}
                            >
                                Load more events
                            </Button>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
