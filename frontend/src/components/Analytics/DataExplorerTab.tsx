import { useState, useMemo } from 'react';
import { Search, Filter, Download, Copy, Check, ExternalLink, ChevronLeft, ChevronRight, Sparkles, MapPin } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { normalizeCorkAddress, copyEmailsToClipboard, exportCustomCSV } from './analyticsUtils';
import { cleanVariant, Student } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { STATUS_CONFIG } from '../../lib/statusConfig';

interface DataExplorerTabProps {
    enrollments: EnrollmentWithRelations[];
    onOpenStudent: (student: Student) => void;
}

export default function DataExplorerTab({ enrollments, onOpenStudent }: DataExplorerTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [districtFilter, setDistrictFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [copied, setCopied] = useState(false);
    const itemsPerPage = 12;

    // Normalize and enrich each enrollment row
    const enrichedRows = useMemo(() => {
        return enrollments.map(e => {
            const s = e.students;
            const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);
            const courseName = e.courses?.name || 'Unknown Course';
            const variant = cleanVariant(courseName, e.course_variant);
            const fullName = `${s?.first_name || ''} ${s?.last_name || ''}`.trim() || 'Unknown Student';

            return {
                raw: e,
                student: s,
                id: e.id,
                fullName,
                email: s?.email || '',
                phone: s?.phone || '',
                district: norm.microDistrict,
                macro: norm.macroRegion,
                courseName,
                variant,
                status: e.status,
                isPriority: !!e.is_priority,
                createdDate: formatDateDMY(e.created_at),
                createdIso: e.created_at || ''
            };
        });
    }, [enrollments]);

    // Unique districts for dropdown
    const availableDistricts = useMemo(() => {
        const set = new Set<string>();
        enrichedRows.forEach(r => {
            if (r.district && r.district !== 'Unknown / Outside Cork') {
                set.add(r.district);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [enrichedRows]);

    // Filter rows
    const filteredRows = useMemo(() => {
        return enrichedRows.filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (districtFilter !== 'all' && r.district !== districtFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const match = 
                    r.fullName.toLowerCase().includes(q) ||
                    r.email.toLowerCase().includes(q) ||
                    r.phone.toLowerCase().includes(q) ||
                    r.courseName.toLowerCase().includes(q) ||
                    r.district.toLowerCase().includes(q) ||
                    r.variant.toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [enrichedRows, statusFilter, districtFilter, searchQuery]);

    const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRows.slice(start, start + itemsPerPage);
    }, [filteredRows, currentPage]);

    const handleCopyEmails = () => {
        const emails = filteredRows.map(r => r.email).filter(Boolean);
        copyEmailsToClipboard(emails);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleExportCSV = () => {
        exportCustomCSV(filteredRows.map(r => r.raw), `analytics_explorer_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Header & Local Controls */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-primary">
                                Interactive Participant Explorer & Live Roster
                            </h3>
                            <span className="text-xs font-bold font-mono text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20">
                                {filteredRows.length} Matches
                            </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                            Search, filter, export, and inspect individual student profiles in the active cohort
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleCopyEmails}
                            disabled={filteredRows.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border-subtle bg-surface-elevated hover:bg-surface-elevated/80 disabled:opacity-40 transition-colors shadow-sm"
                        >
                            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                            <span>{copied ? 'Copied!' : 'Copy Emails'}</span>
                        </button>
                        <button
                            onClick={handleExportCSV}
                            disabled={filteredRows.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors shadow-sm"
                        >
                            <Download size={13} />
                            <span>Export CSV</span>
                        </button>
                    </div>
                </div>

                {/* Filter Controls Row */}
                <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-border-subtle/50">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            type="text"
                            placeholder="Search by student name, email, phone, course..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-8 pr-3 py-1.5 bg-surface-elevated border border-border-strong rounded-xl text-xs focus:outline-none focus:border-brand-500 text-primary"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-3 py-1.5 rounded-xl text-xs shadow-sm">
                        <Filter size={13} className="text-muted flex-shrink-0" />
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none max-w-[140px]"
                        >
                            <option value="all">All Statuses</option>
                            <option value="requested">Requested</option>
                            <option value="invited">Invited</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="withdrawn">Withdrawn</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>

                    {/* District Filter */}
                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-3 py-1.5 rounded-xl text-xs shadow-sm">
                        <MapPin size={13} className="text-muted flex-shrink-0" />
                        <select
                            value={districtFilter}
                            onChange={(e) => {
                                setDistrictFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none max-w-[160px] truncate"
                        >
                            <option value="all">All Districts</option>
                            {availableDistricts.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
                {paginatedRows.length === 0 ? (
                    <div className="text-center py-16 text-muted text-xs">
                        No participant records match the selected filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-surface-elevated text-[11px] uppercase font-bold tracking-wider text-muted border-b border-border-subtle">
                                <tr>
                                    <th className="py-3 px-4">Participant Name</th>
                                    <th className="py-3 px-3">Contact</th>
                                    <th className="py-3 px-3">District</th>
                                    <th className="py-3 px-3">Course & Variant</th>
                                    <th className="py-3 px-3 text-center">Status</th>
                                    <th className="py-3 px-3">Date</th>
                                    <th className="py-3 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle bg-surface">
                                {paginatedRows.map((r) => {
                                    const cfg = STATUS_CONFIG[r.status] || {
                                        label: r.status,
                                        pillBg: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                    };

                                    return (
                                        <tr 
                                            key={r.id}
                                            className="hover:bg-brand-500/5 transition-colors group cursor-pointer"
                                            onClick={() => r.student && onOpenStudent(r.student)}
                                        >
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-primary text-[13px] group-hover:text-brand-600 transition-colors">
                                                        {r.fullName}
                                                    </span>
                                                    {r.isPriority && (
                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                            <Sparkles size={9} /> PRIORITY
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="py-3 px-3 text-muted">
                                                <div className="flex flex-col">
                                                    <span className="truncate max-w-[170px]">{r.email || '-'}</span>
                                                    <span className="text-[10px] text-muted/70 font-mono">{r.phone || '-'}</span>
                                                </div>
                                            </td>

                                            <td className="py-3 px-3 text-primary">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-border-subtle">
                                                    <MapPin size={10} className="text-brand-500" />
                                                    {r.district}
                                                </span>
                                            </td>

                                            <td className="py-3 px-3">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-primary">{r.courseName}</span>
                                                    <span className="text-[10px] text-muted">{r.variant}</span>
                                                </div>
                                            </td>

                                            <td className="py-3 px-3 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.pillBg}`}>
                                                    {cfg.label}
                                                </span>
                                            </td>

                                            <td className="py-3 px-3 text-muted font-mono text-[11px]">
                                                {r.createdDate}
                                            </td>

                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (r.student) onOpenStudent(r.student);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors p-1"
                                                >
                                                    <ExternalLink size={13} />
                                                    <span>Open</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 p-4 border-t border-border-subtle text-xs bg-surface-elevated/20">
                        <div className="text-muted font-medium text-[11px]">
                            Showing <span className="font-semibold text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                            <span className="font-semibold text-primary">
                                {Math.min(currentPage * itemsPerPage, filteredRows.length)}
                            </span> of{' '}
                            <span className="font-semibold text-primary">{filteredRows.length}</span> participants
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="font-semibold text-primary px-1.5 text-xs">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
