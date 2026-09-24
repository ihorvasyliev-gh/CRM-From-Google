import { useState, useMemo } from 'react';
import { Search, Filter, Download, Copy, Check, ExternalLink, MapPin } from 'lucide-react';
import Card, { SectionHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import Pagination from '../ui/Pagination';
import { EmptyState } from '../ui/States';
import { Avatar, PriorityStar, SelectField } from '../Viewer/ViewerUI';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
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
            <SectionHeader
                icon={Search}
                tone="brand"
                title="Data explorer"
                description="Search, filter and export individual participants in the current scope"
                actions={
                    <>
                        <Button variant="secondary" onClick={handleCopyEmails} disabled={filteredRows.length === 0}>
                            {copied ? <Check size={14} className="text-status-confirmed" /> : <Copy size={14} />}
                            {copied ? 'Copied!' : 'Copy emails'}
                        </Button>
                        <Button variant="primary" onClick={handleExportCSV} disabled={filteredRows.length === 0}>
                            <Download size={14} />
                            Export CSV
                        </Button>
                    </>
                }
            />

            <Card flush className="overflow-hidden">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 p-3 sm:p-3.5 border-b border-border-subtle">
                    <SearchInput
                        value={searchQuery}
                        onChange={v => {
                            setSearchQuery(v);
                            setCurrentPage(1);
                        }}
                        placeholder="Search name, email, phone, course…"
                        aria-label="Search participants"
                        wrapperClassName="flex-1 min-w-[220px]"
                    />
                    <SelectField
                        label="Status"
                        icon={<Filter size={14} />}
                        value={statusFilter}
                        onChange={v => {
                            setStatusFilter(v);
                            setCurrentPage(1);
                        }}
                        className="w-full sm:w-44"
                    >
                        <option value="all">All statuses</option>
                        <option value="requested">Requested</option>
                        <option value="invited">Invited</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="withdrawn">Withdrawn</option>
                        <option value="rejected">Rejected</option>
                    </SelectField>
                    <SelectField
                        label="District"
                        icon={<MapPin size={14} />}
                        value={districtFilter}
                        onChange={v => {
                            setDistrictFilter(v);
                            setCurrentPage(1);
                        }}
                        className="w-full sm:w-52"
                    >
                        <option value="all">All districts</option>
                        {availableDistricts.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </SelectField>
                    <Badge tone="brand" shape="pill" className="tabular-nums ml-auto">{filteredRows.length} matches</Badge>
                </div>

                {paginatedRows.length === 0 ? (
                    <EmptyState bare icon={<Search size={22} />} title="No participants found" description="No records match the selected filters." />
                ) : (
                    <div className={tableWrapCls}>
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>Participant</th>
                                    <th className={thCls}>Phone</th>
                                    <th className={thCls}>District</th>
                                    <th className={thCls}>Course</th>
                                    <th className={thCls}>Status</th>
                                    <th className={thCls}>Applied</th>
                                    <th className={thCls}><span className="sr-only">Action</span></th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {paginatedRows.map(r => {
                                    const cfg = STATUS_CONFIG[r.status] || { label: r.status, pillBg: 'status-pill-withdrawn' };
                                    return (
                                        <tr key={r.id} className={`${trCls} group cursor-pointer`} onClick={() => r.student && onOpenStudent(r.student)}>
                                            <td className={tdCls}>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Avatar id={r.student?.id || r.id} person={r.student || {}} size="sm" />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-primary text-[13px] truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                                                {r.fullName}
                                                            </span>
                                                            {r.isPriority && <PriorityStar />}
                                                        </div>
                                                        <span className="block text-[11px] text-muted truncate max-w-[220px]">{r.email || '—'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`${tdCls} text-muted text-xs tabular-nums whitespace-nowrap`}>{r.phone || '—'}</td>
                                            <td className={tdCls}>
                                                <Badge icon={<MapPin size={10} />}>{r.district}</Badge>
                                            </td>
                                            <td className={tdCls}>
                                                <span className="block text-[13px] font-medium text-primary">{r.courseName}</span>
                                                <span className="block text-[11px] text-muted">{r.variant}</span>
                                            </td>
                                            <td className={tdCls}>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${cfg.pillBg}`}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className={`${tdCls} text-muted text-xs tabular-nums whitespace-nowrap`}>{r.createdDate}</td>
                                            <td className={`${tdCls} text-right`}>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        if (r.student) onOpenStudent(r.student);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 opacity-70 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <ExternalLink size={13} />
                                                    Open
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredRows.length}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemLabel="participants"
                />
            </Card>
        </div>
    );
}
