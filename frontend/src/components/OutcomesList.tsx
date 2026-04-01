import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Briefcase, Search, Mail, Copy, CheckCircle, Send, Loader2, Filter, X, Pencil } from 'lucide-react';
import { buildStatusEmailBodyHtml, buildStatusEmailSubject } from '../lib/appConfig';
import { formatDateDMY } from '../lib/dateUtils';
import { getAvatarGradient } from '../lib/types';
import Toast, { ToastData } from './Toast';
import OutcomeEditModal from './OutcomeEditModal';

export interface GraduateRow {
    student_id: string;
    first_name: string;
    last_name: string;
    email: string;
    courses: string[];
    // Employment status (may be null if not yet submitted)
    is_working: boolean | null;
    started_month: string | null;
    field_of_work: string | null;
    employment_type: string | null;
    status_updated_at: string | null;
    // Tracking
    tracking_status: 'not_contacted' | 'pending' | 'responded';
    last_sent_at: string | null;
}

type OutcomeFilter = 'all' | 'not_contacted' | 'pending' | 'responded';

export default function OutcomesList() {
    const [graduates, setGraduates] = useState<GraduateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<OutcomeFilter>('all');
    const [filterCourse, setFilterCourse] = useState('all');
    const [sending, setSending] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    const [editingGrad, setEditingGrad] = useState<GraduateRow | null>(null);
    const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

    const fetchGraduates = useCallback(async () => {
        setLoading(true);

        // Get all completed enrollments with student info
        const { data: enrollments, error: enrollError } = await supabase
            .from('enrollments')
            .select('student_id, course_id, courses(name), students(id, first_name, last_name, email)')
            .eq('status', 'completed');

        if (enrollError || !enrollments) {
            console.error('Error fetching graduates:', enrollError);
            setLoading(false);
            return;
        }

        // Get all employment_status records
        const { data: empStatuses } = await supabase
            .from('employment_status')
            .select('*');

        // Build a map of unique students
        const studentMap = new Map<string, GraduateRow>();

        for (const e of enrollments) {
            const student = e.students as unknown as { id: string; first_name: string; last_name: string; email: string };
            const course = e.courses as unknown as { name: string };
            if (!student || !student.id) continue;

            if (!studentMap.has(student.id)) {
                // Find employment status
                const empStatus = empStatuses?.find(es => es.student_id === student.id);

                let trackingStatus: GraduateRow['tracking_status'] = 'not_contacted';
                if (empStatus) {
                    trackingStatus = empStatus.status as 'pending' | 'responded';
                }

                studentMap.set(student.id, {
                    student_id: student.id,
                    first_name: student.first_name || '',
                    last_name: student.last_name || '',
                    email: student.email || '',
                    courses: [course?.name || 'Unknown'],
                    is_working: empStatus?.is_working ?? null,
                    started_month: empStatus?.started_month ?? null,
                    field_of_work: empStatus?.field_of_work ?? null,
                    employment_type: empStatus?.employment_type ?? null,
                    status_updated_at: empStatus?.last_responded_at ?? null,
                    tracking_status: trackingStatus,
                    last_sent_at: empStatus?.last_invited_at ?? null,
                });
            } else {
                // Add course to existing student
                const existing = studentMap.get(student.id)!;
                const courseName = course?.name || 'Unknown';
                if (!existing.courses.includes(courseName)) {
                    existing.courses.push(courseName);
                }
            }
        }

        setGraduates(Array.from(studentMap.values()).sort(
            (a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
        ));
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchGraduates();
    }, [fetchGraduates]);

    // Unique courses for filter
    const uniqueCourses = useMemo(() => {
        const courseSet = new Set<string>();
        graduates.forEach(g => g.courses.forEach(c => courseSet.add(c)));
        return Array.from(courseSet).sort();
    }, [graduates]);

    // Filtered graduates
    const filtered = useMemo(() => {
        let result = graduates;
        if (filterStatus !== 'all') {
            result = result.filter(g => g.tracking_status === filterStatus);
        }
        if (filterCourse !== 'all') {
            result = result.filter(g => g.courses.includes(filterCourse));
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(g =>
                g.first_name.toLowerCase().includes(q) ||
                g.last_name.toLowerCase().includes(q) ||
                g.email.toLowerCase().includes(q) ||
                g.field_of_work?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [graduates, filterStatus, filterCourse, searchQuery]);

    // Status counts
    const statusCounts = useMemo(() => {
        const counts = { all: graduates.length, not_contacted: 0, pending: 0, responded: 0 };
        graduates.forEach(g => { counts[g.tracking_status]++; });
        return counts;
    }, [graduates]);

    // Stats
    const respondedGrads = graduates.filter(g => g.is_working !== null);
    const workingCount = respondedGrads.filter(g => g.is_working).length;
    const responseRate = graduates.length > 0 ? Math.round((respondedGrads.length / graduates.length) * 100) : 0;

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAll() {
        const allSelected = filtered.length > 0 && filtered.every(g => selectedIds.has(g.student_id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            filtered.forEach(g => {
                if (allSelected) next.delete(g.student_id);
                else next.add(g.student_id);
            });
            return next;
        });
    }

    async function handleCopyEmails() {
        const selected = graduates.filter(g => selectedIds.has(g.student_id));
        const emails = [...new Set(selected.map(g => g.email).filter(Boolean))];
        if (emails.length === 0) { showToast('No emails to copy', 'error'); return; }
        await navigator.clipboard.writeText(emails.join('; '));
        showToast(`${emails.length} email(s) copied!`, 'success');
    }

    async function handleSendStatusRequest() {
        if (selectedIds.size === 0) return;
        setSending(true);

        const selected = graduates.filter(g => selectedIds.has(g.student_id));
        const ids = selected.map(g => g.student_id);

        try {
            // Update DB status to pending
            await supabase.rpc('mark_students_outcomes_pending', {
                p_student_ids: ids
            });

            // Build bulk generic email
            const statusLink = `${window.location.origin}/status`;
            const htmlBody = buildStatusEmailBodyHtml(statusLink);
            const subject = encodeURIComponent(buildStatusEmailSubject());

            const blobHtml = new Blob([htmlBody], { type: 'text/html' });
            const blobText = new Blob(['Please view this email in an HTML-compatible client.'], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': blobHtml,
                'text/plain': blobText,
            })]);
            
            showToast(`Status requests sent to ${selected.length} graduate(s). Template copied!`, 'success');

            // Open mailto with bcc
            const emails = [...new Set(selected.map(g => g.email).filter(Boolean))];
            const bcc = emails.map(e => encodeURIComponent(e)).join(',');
            window.location.href = `mailto:?bcc=${bcc}&subject=${subject}`;

            // Refresh data to show updated token statuses
            await fetchGraduates();
            setSelectedIds(new Set());
        } catch (err) {
            console.error(err);
            showToast('Failed to send status requests.', 'error');
        } finally {
            setSending(false);
        }
    }

    function getTrackingBadge(status: GraduateRow['tracking_status']) {
        switch (status) {
            case 'responded':
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500"><CheckCircle size={10} /> Responded</span>;
            case 'pending':
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400"><Send size={10} /> Pending</span>;
            default:
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400"><Mail size={10} /> Not Contacted</span>;
        }
    }

    function getEmploymentBadge(grad: GraduateRow) {
        if (grad.tracking_status !== 'responded') {
            return <span className="text-xs text-muted italic">No data</span>;
        }
        if (grad.is_working) {
            const type = grad.employment_type === 'full_time' ? 'Full-time' : grad.employment_type === 'part_time' ? 'Part-time' : '';
            return (
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500">
                        <Briefcase size={10} /> Working {type && `· ${type}`}
                    </span>
                    {grad.field_of_work && (
                        <span className="text-[10px] text-muted">in {grad.field_of_work}</span>
                    )}
                </div>
            );
        }
        return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">Not working</span>;
    }

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={28} className="animate-spin text-brand-500" />
                    <p className="text-sm text-muted">Loading outcomes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-8">
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-surface rounded-2xl border border-border-subtle p-4">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Graduates</p>
                    <p className="text-2xl font-bold text-primary mt-1">{graduates.length}</p>
                </div>
                <div className="bg-surface rounded-2xl border border-border-subtle p-4">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Response Rate</p>
                    <p className="text-2xl font-bold text-brand-500 mt-1">{responseRate}%</p>
                </div>
                <div className="bg-surface rounded-2xl border border-border-subtle p-4">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Currently Working</p>
                    <p className="text-2xl font-bold text-emerald-500 mt-1">{workingCount}</p>
                </div>
                <div className="bg-surface rounded-2xl border border-border-subtle p-4">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Pending Responses</p>
                    <p className="text-2xl font-bold text-blue-500 mt-1">{statusCounts.pending}</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-surface rounded-2xl border border-border-subtle p-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, or field..."
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-primary placeholder:text-muted/40"
                        />
                    </div>

                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                            showFilters || filterStatus !== 'all' || filterCourse !== 'all'
                                ? 'bg-brand-500/10 text-brand-500 border-brand-500/30'
                                : 'bg-surface-elevated text-muted border-border-subtle hover:border-border-strong'
                        }`}
                    >
                        <Filter size={14} />
                        Filters
                        {(filterStatus !== 'all' || filterCourse !== 'all') && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                        )}
                    </button>

                    {/* Count */}
                    <span className="text-xs text-muted font-medium">
                        {filtered.length} of {graduates.length} graduate{graduates.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Filter Row */}
                {showFilters && (
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border-subtle animate-fadeIn">
                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted">Status:</span>
                            <div className="flex gap-1">
                                {(['all', 'not_contacted', 'pending', 'responded'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s)}
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all ${
                                            filterStatus === s
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
                                        }`}
                                    >
                                        {s === 'all' ? 'All' : s === 'not_contacted' ? 'Not Contacted' : s === 'pending' ? 'Pending' : 'Responded'}
                                        {' '}({statusCounts[s]})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Course Filter */}
                        {uniqueCourses.length > 1 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted">Course:</span>
                                <select
                                    value={filterCourse}
                                    onChange={e => setFilterCourse(e.target.value)}
                                    className="text-xs bg-background border border-border-strong rounded-lg px-2 py-1 text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                                >
                                    <option value="all">All courses</option>
                                    {uniqueCourses.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {(filterStatus !== 'all' || filterCourse !== 'all') && (
                            <button
                                onClick={() => { setFilterStatus('all'); setFilterCourse('all'); }}
                                className="text-xs text-muted hover:text-primary flex items-center gap-1 transition-colors"
                            >
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                            <Briefcase size={28} className="text-muted" />
                        </div>
                        <p className="text-lg font-semibold text-primary">No graduates found</p>
                        <p className="text-sm text-muted mt-1">Try adjusting your filters or wait for students to complete courses</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-subtle bg-surface-elevated/50">
                                    <th className="py-3 px-4 text-left w-10">
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && filtered.every(g => selectedIds.has(g.student_id))}
                                            onChange={selectAll}
                                            className="rounded border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                        />
                                    </th>
                                    <th className="py-3 px-4 text-left text-[10px] font-bold text-muted uppercase tracking-wider">Student</th>
                                    <th className="py-3 px-4 text-left text-[10px] font-bold text-muted uppercase tracking-wider hidden md:table-cell">Courses</th>
                                    <th className="py-3 px-4 text-left text-[10px] font-bold text-muted uppercase tracking-wider">Tracking</th>
                                    <th className="py-3 px-4 text-left text-[10px] font-bold text-muted uppercase tracking-wider">Employment</th>
                                    <th className="py-3 px-4 text-left text-[10px] font-bold text-muted uppercase tracking-wider hidden lg:table-cell">Updated</th>
                                    <th className="py-3 px-4 text-right text-[10px] font-bold text-muted uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(grad => {
                                    const isSelected = selectedIds.has(grad.student_id);
                                    return (
                                        <tr
                                            key={grad.student_id}
                                            onClick={() => toggleSelect(grad.student_id)}
                                            className={`border-b border-border-subtle/50 transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-brand-500/5'
                                                    : 'hover:bg-surface-elevated/50'
                                            }`}
                                        >
                                            <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(grad.student_id)}
                                                    className="rounded border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 bg-gradient-to-br ${getAvatarGradient(grad.student_id)} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                        {(grad.first_name[0] || '').toUpperCase()}{(grad.last_name[0] || '').toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-primary text-[13px] truncate">
                                                            {grad.first_name} {grad.last_name}
                                                        </p>
                                                        <p className="text-[11px] text-muted truncate">{grad.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 hidden md:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {grad.courses.map(c => (
                                                        <span key={c} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 truncate max-w-[120px]">
                                                            {c}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                {getTrackingBadge(grad.tracking_status)}
                                                {grad.tracking_status === 'pending' && grad.last_sent_at && (
                                                    <p className="text-[10px] text-muted mt-0.5">Sent {formatDateDMY(grad.last_sent_at)}</p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                {getEmploymentBadge(grad)}
                                                {grad.is_working && grad.started_month && (
                                                    <p className="text-[10px] text-muted mt-0.5">
                                                        Since {new Date(grad.started_month + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 hidden lg:table-cell">
                                                {grad.status_updated_at ? (
                                                    <span className="text-xs text-muted">{formatDateDMY(grad.status_updated_at)}</span>
                                                ) : (
                                                    <span className="text-xs text-muted italic">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingGrad(grad); }}
                                                    className="p-1.5 text-muted hover:text-brand-500 hover:bg-surface-elevated rounded-lg transition-colors"
                                                    title="Edit Status"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl shadow-black/20 px-5 py-3 flex items-center gap-3 animate-slideUp">
                    <span className="text-sm font-bold text-primary">
                        {selectedIds.size} selected
                    </span>
                    <div className="h-5 w-px bg-border-subtle" />
                    <button
                        onClick={handleCopyEmails}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated hover:bg-background border border-border-subtle rounded-lg transition-all"
                    >
                        <Copy size={12} /> Copy Emails
                    </button>
                    <button
                        onClick={handleSendStatusRequest}
                        disabled={sending}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {sending ? (
                            <><Loader2 size={12} className="animate-spin" /> Moving...</>
                        ) : (
                            <><Mail size={12} /> Send Email & Move to Pending</>
                        )}
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="p-1.5 text-muted hover:text-primary transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <OutcomeEditModal
                isOpen={!!editingGrad}
                graduate={editingGrad}
                onClose={() => setEditingGrad(null)}
                onSaved={() => {
                    fetchGraduates();
                    showToast('Student status has been updated.', 'success');
                }}
            />

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}
