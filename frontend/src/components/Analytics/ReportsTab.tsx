import { useState, useMemo } from 'react';
import { 
    FileSpreadsheet, 
    Download, 
    Mail, 
    Search, 
    ChevronLeft, 
    ChevronRight, 
    Check, 
    Layers, 
    Sparkles
} from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import type { Student } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { cleanVariant } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { 
    classifyCorkRegion, 
    copyEmailsToClipboard, 
    exportCustomCSV, 
    exportExecutiveExcelReport 
} from './analyticsUtils';

interface ReportsTabProps {
    enrollments: EnrollmentWithRelations[];
    employmentStatuses: any[];
    onSelectStudent?: (student: Student) => void;
    activeFilterLabel: string;
}

export default function ReportsTab({
    enrollments,
    employmentStatuses,
    onSelectStudent,
    activeFilterLabel
}: ReportsTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'requested' | 'invited' | 'confirmed' | 'completed'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [copiedCount, setCopiedCount] = useState<number | null>(null);
    const itemsPerPage = 10;

    // Filter enrollments by search query and local status filter
    const filteredRoster = useMemo(() => {
        return enrollments.filter(e => {
            if (statusFilter !== 'all' && e.status !== statusFilter) return false;
            if (!searchQuery.trim()) return true;

            const q = searchQuery.toLowerCase().trim();
            const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
            const email = (e.students?.email || '').toLowerCase();
            const phone = (e.students?.phone || '').toLowerCase();
            const course = (e.courses?.name || '').toLowerCase();
            const eircode = (e.students?.eircode || '').toLowerCase();
            const region = classifyCorkRegion(e.students?.address || null, e.students?.eircode || null).toLowerCase();

            return name.includes(q) || email.includes(q) || phone.includes(q) || course.includes(q) || eircode.includes(q) || region.includes(q);
        });
    }, [enrollments, searchQuery, statusFilter]);

    const totalPages = Math.ceil(filteredRoster.length / itemsPerPage) || 1;
    const paginatedRoster = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRoster.slice(start, start + itemsPerPage);
    }, [filteredRoster, currentPage]);

    const handleCopyFilteredEmails = () => {
        const emails = filteredRoster.map(e => e.students?.email || '').filter(Boolean);
        const count = copyEmailsToClipboard(emails);
        setCopiedCount(count);
        setTimeout(() => setCopiedCount(null), 2500);
    };

    const handleExportCSV = () => {
        exportCustomCSV(filteredRoster, `filtered_crm_roster_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const handleGenerateExecutiveExcel = async () => {
        try {
            setIsExportingExcel(true);
            await exportExecutiveExcelReport(enrollments, employmentStatuses, activeFilterLabel);
        } catch (err) {
            console.error('Failed to export Excel report:', err);
        } finally {
            setIsExportingExcel(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Pre-built Report Hub Banner */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex-shrink-0">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-primary">Pre-built Executive Excel Reports</h3>
                            <p className="text-xs text-muted mt-0.5">
                                Generates complete, styled multi-tab Excel workbooks formatted for management presentations & audits.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                            onClick={handleGenerateExecutiveExcel}
                            disabled={isExportingExcel || enrollments.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                        >
                            {isExportingExcel ? (
                                <span>Generating...</span>
                            ) : (
                                <>
                                    <FileSpreadsheet size={15} />
                                    <span>Download Executive .XLSX</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleExportCSV}
                            disabled={filteredRoster.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface hover:bg-surface-elevated text-primary border border-border-subtle rounded-xl text-xs font-semibold transition-all shadow-sm"
                        >
                            <Download size={14} />
                            <span>Export CSV</span>
                        </button>

                        <button
                            onClick={handleCopyFilteredEmails}
                            disabled={filteredRoster.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/20 rounded-xl text-xs font-semibold transition-all"
                        >
                            {copiedCount !== null ? (
                                <>
                                    <Check size={14} className="text-emerald-500" />
                                    <span>Copied {copiedCount} emails!</span>
                                </>
                            ) : (
                                <>
                                    <Mail size={14} />
                                    <span>Copy Filtered Emails</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Live Data Explorer */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                {/* Header and Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                            <Layers size={16} className="text-brand-500" /> Interactive Data Explorer
                        </h3>
                        <p className="text-xs text-muted mt-0.5">
                            Filter, search, sort, and inspect individual student records in real time
                        </p>
                    </div>

                    {/* Status Tabs */}
                    <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-medium overflow-x-auto">
                        <button
                            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-surface-elevated text-primary font-bold shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                            All ({enrollments.length})
                        </button>
                        <button
                            onClick={() => { setStatusFilter('requested'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'requested' ? 'bg-surface-elevated text-amber-600 font-bold shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                            Requested
                        </button>
                        <button
                            onClick={() => { setStatusFilter('invited'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'invited' ? 'bg-surface-elevated text-sky-600 font-bold shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                            Invited
                        </button>
                        <button
                            onClick={() => { setStatusFilter('confirmed'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'confirmed' ? 'bg-surface-elevated text-emerald-600 font-bold shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                            Confirmed
                        </button>
                        <button
                            onClick={() => { setStatusFilter('completed'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'completed' ? 'bg-surface-elevated text-violet-600 font-bold shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                            Completed
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mb-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
                        <input
                            type="text"
                            placeholder="Filter by name, email, phone, eircode, region..."
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-4 py-2 bg-surface-elevated border border-border-subtle rounded-xl text-xs sm:text-sm text-primary focus:outline-none focus:border-brand-500"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-elevated/20">
                    {paginatedRoster.length === 0 ? (
                        <div className="text-center py-12 text-muted text-sm">
                            {searchQuery ? 'No records match your search criteria.' : 'No enrollment records found.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm border-collapse">
                                <thead className="bg-surface-elevated text-xs font-bold uppercase tracking-wider text-muted border-b border-border-subtle">
                                    <tr>
                                        <th className="py-3 px-3 sm:px-4">Student</th>
                                        <th className="py-3 px-3 sm:px-4">Region</th>
                                        <th className="py-3 px-3 sm:px-4">Course & Variant</th>
                                        <th className="py-3 px-3 sm:px-4">Status</th>
                                        <th className="py-3 px-3 sm:px-4">Registered</th>
                                        <th className="py-3 px-3 sm:px-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle bg-surface">
                                    {paginatedRoster.map((e) => {
                                        const s = e.students;
                                        const region = classifyCorkRegion(s?.address || null, s?.eircode || null);
                                        const statusCfg = STATUS_CONFIG[e.status];

                                        return (
                                            <tr key={e.id} className="hover:bg-brand-500/5 transition-colors group">
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
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/5 dark:bg-white/5 text-primary">
                                                        {region}
                                                    </span>
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
                                                    {formatDateDMY(e.created_at)}
                                                </td>

                                                <td className="py-3 px-3 sm:px-4 text-right">
                                                    {s && onSelectStudent && (
                                                        <button
                                                            onClick={() => onSelectStudent(s)}
                                                            className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-colors"
                                                        >
                                                            Open
                                                        </button>
                                                    )}
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
                    <div className="flex items-center justify-between gap-4 mt-4 px-1 text-xs">
                        <div className="text-muted font-medium">
                            Showing <span className="font-semibold text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                            <span className="font-semibold text-primary">
                                {Math.min(currentPage * itemsPerPage, filteredRoster.length)}
                            </span> of{' '}
                            <span className="font-semibold text-primary">{filteredRoster.length}</span> entries
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <span className="font-semibold text-primary px-1">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
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
