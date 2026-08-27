import { useState, useMemo } from 'react';
import { X, Search, Download, Mail, ChevronLeft, ChevronRight, Sparkles, User, ExternalLink, Check, MapPin } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import type { Student } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { cleanVariant } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { copyEmailsToClipboard, exportCustomCSV, normalizeCorkAddress } from './analyticsUtils';

interface DrillDownModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: EnrollmentWithRelations[];
    onSelectStudent?: (student: Student) => void;
}

export default function DrillDownModal({ isOpen, onClose, title, data, onSelectStudent }: DrillDownModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [copiedCount, setCopiedCount] = useState<number | null>(null);
    const itemsPerPage = 8;

    // Filter by search query
    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) return data;
        const q = searchQuery.toLowerCase().trim();
        return data.filter(e => {
            const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
            const email = (e.students?.email || '').toLowerCase();
            const phone = (e.students?.phone || '').toLowerCase();
            const addr = (e.students?.address || '').toLowerCase();
            const eircode = (e.students?.eircode || '').toLowerCase();
            const course = (e.courses?.name || '').toLowerCase();
            const status = (e.status || '').toLowerCase();
            const norm = normalizeCorkAddress(e.students?.address || null, e.students?.eircode || null);
            const district = norm.microDistrict.toLowerCase();
            const macro = norm.macroRegion.toLowerCase();

            return name.includes(q) || email.includes(q) || phone.includes(q) || addr.includes(q) || eircode.includes(q) || course.includes(q) || status.includes(q) || district.includes(q) || macro.includes(q);
        });
    }, [data, searchQuery]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(start, start + itemsPerPage);
    }, [filteredData, currentPage]);

    const handleCopyEmails = () => {
        const emails = filteredData.map(e => e.students?.email || '').filter(Boolean);
        const count = copyEmailsToClipboard(emails);
        setCopiedCount(count);
        setTimeout(() => setCopiedCount(null), 2500);
    };

    const handleExportCohort = () => {
        const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        exportCustomCSV(filteredData, `cohort_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />
            
            <div className="relative bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface-elevated gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-primary flex items-center gap-2">
                            {title}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 font-mono">
                                {data.length} records
                            </span>
                        </h2>
                        <p className="text-xs text-muted mt-0.5">Explore, search, copy emails, or inspect student profiles</p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                            onClick={handleCopyEmails}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-500/10 dark:hover:bg-brand-500/20 transition-all border border-brand-500/20"
                            title="Copy email addresses to clipboard"
                        >
                            {copiedCount !== null ? (
                                <>
                                    <Check size={14} className="text-emerald-500" />
                                    <span>Copied {copiedCount} emails!</span>
                                </>
                            ) : (
                                <>
                                    <Mail size={14} />
                                    <span>Copy Emails</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleExportCohort}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-surface hover:bg-surface-elevated transition-all border border-border-subtle shadow-sm"
                            title="Export cohort to CSV"
                        >
                            <Download size={14} />
                            <span>Export CSV</span>
                        </button>

                        <button 
                            onClick={onClose}
                            className="p-1.5 text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors ml-1"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="p-3 sm:px-5 border-b border-border-subtle bg-surface/50 flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
                        <input
                            type="text"
                            placeholder="Search by student name, email, district, course..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-9 pr-4 py-1.5 bg-surface-elevated border border-border-subtle rounded-xl text-xs sm:text-sm text-primary focus:outline-none focus:border-brand-500"
                        />
                    </div>

                    <div className="text-xs text-muted font-medium hidden sm:block">
                        Showing {paginatedData.length} of {filteredData.length} entries
                    </div>
                </div>

                {/* Content Table */}
                <div className="flex-1 overflow-auto p-3 sm:p-5">
                    {filteredData.length === 0 ? (
                        <div className="text-center py-12 text-muted text-sm">
                            <User size={32} className="mx-auto text-muted/40 mb-2" />
                            {searchQuery ? 'No records match your search criteria.' : 'No records found for this cohort.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-border-subtle rounded-xl">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead className="bg-surface-elevated text-xs font-bold uppercase tracking-wider text-muted border-b border-border-subtle">
                                    <tr>
                                        <th className="py-2.5 px-3 sm:px-4">Student</th>
                                        <th className="py-2.5 px-3 sm:px-4">Location</th>
                                        <th className="py-2.5 px-3 sm:px-4">Course & Variant</th>
                                        <th className="py-2.5 px-3 sm:px-4">Status</th>
                                        <th className="py-2.5 px-3 sm:px-4">Date</th>
                                        <th className="py-2.5 px-3 sm:px-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle bg-surface">
                                    {paginatedData.map((e) => {
                                        const s = e.students;
                                        const statusCfg = STATUS_CONFIG[e.status];
                                        const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);

                                        return (
                                            <tr 
                                                key={e.id}
                                                className="hover:bg-brand-500/5 transition-colors group"
                                            >
                                                <td className="py-3 px-3 sm:px-4">
                                                    <div 
                                                        className="font-semibold text-primary flex items-center gap-1.5 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400"
                                                        onClick={() => s && onSelectStudent && onSelectStudent(s)}
                                                    >
                                                        <span>{s?.first_name} {s?.last_name}</span>
                                                        {e.is_priority && (
                                                            <span className="p-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400" title="Priority Student">
                                                                <Sparkles size={11} />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                                                        <span>{s?.email || 'No email'}</span>
                                                        {s?.phone && <span className="font-mono">{s.phone}</span>}
                                                    </div>
                                                </td>

                                                <td className="py-3 px-3 sm:px-4">
                                                    <div className="flex items-center gap-1 font-medium text-primary text-xs">
                                                        <MapPin size={12} className="text-brand-500 flex-shrink-0" />
                                                        <span>{norm.microDistrict}</span>
                                                    </div>
                                                    <div className="text-[10px] text-muted ml-4">
                                                        {norm.macroRegion}
                                                    </div>
                                                </td>

                                                <td className="py-3 px-3 sm:px-4">
                                                    <div className="text-primary font-medium">{e.courses?.name || 'Unknown'}</div>
                                                    <div className="text-[11px] text-muted">
                                                        {cleanVariant(e.courses?.name || '', e.course_variant)}
                                                    </div>
                                                </td>

                                                <td className="py-3 px-3 sm:px-4">
                                                    <span className={`${statusCfg?.pillBg || 'bg-surface-elevated text-muted'} inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusCfg?.border || 'border-border-subtle'}`}>
                                                        {statusCfg?.icon}
                                                        {statusCfg?.label || e.status}
                                                    </span>
                                                </td>

                                                <td className="py-3 px-3 sm:px-4 text-muted font-mono text-xs">
                                                    {formatDateDMY(e.completed_date || e.confirmed_date || e.created_at)}
                                                </td>

                                                <td className="py-3 px-3 sm:px-4 text-right">
                                                    {s && onSelectStudent ? (
                                                        <button
                                                            onClick={() => onSelectStudent(s)}
                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-colors"
                                                        >
                                                            Open
                                                            <ExternalLink size={12} />
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-3 sm:px-5 border-t border-border-subtle bg-surface-elevated text-xs">
                        <div className="text-muted">
                            Page <span className="font-bold text-primary">{currentPage}</span> of <span className="font-bold text-primary">{totalPages}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
