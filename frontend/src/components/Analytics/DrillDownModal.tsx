import { useState, useMemo, useEffect } from 'react';
import { Download, Mail, User, Users, ExternalLink, Check, MapPin } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button, IconButton } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import Pagination from '../ui/Pagination';
import { EmptyState } from '../ui/States';
import { PriorityStar } from '../Viewer/ViewerUI';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
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

    // Each drill-down starts fresh (previously a new cohort could open on a stale page / search)
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setCurrentPage(1);
        }
    }, [isOpen, title]);

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
    const safePage = Math.min(currentPage, totalPages);
    const paginatedData = useMemo(() => {
        const start = (safePage - 1) * itemsPerPage;
        return filteredData.slice(start, start + itemsPerPage);
    }, [filteredData, safePage]);

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

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={title}
            subtitle={`${data.length} records · search, copy emails or open a student profile`}
            icon={Users}
            size="3xl"
            labelId="drilldown-title"
            bodyClassName="p-0!"
            headerAction={
                <div className="hidden sm:flex items-center gap-2 mr-1">
                    <Button variant="secondary" size="sm" onClick={handleCopyEmails} title="Copy email addresses to clipboard">
                        {copiedCount !== null ? <Check size={14} className="text-status-confirmed" /> : <Mail size={14} />}
                        {copiedCount !== null ? `Copied ${copiedCount}` : 'Copy emails'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleExportCohort} title="Export cohort to CSV">
                        <Download size={14} />
                        CSV
                    </Button>
                </div>
            }
        >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-border-subtle">
                <SearchInput
                    value={searchQuery}
                    onChange={v => {
                        setSearchQuery(v);
                        setCurrentPage(1);
                    }}
                    placeholder="Search name, email, district, course…"
                    aria-label="Search records"
                    wrapperClassName="flex-1 max-w-md"
                />
                <div className="flex sm:hidden items-center gap-1">
                    <IconButton label="Copy emails" onClick={handleCopyEmails}>
                        {copiedCount !== null ? <Check size={16} className="text-status-confirmed" /> : <Mail size={16} />}
                    </IconButton>
                    <IconButton label="Export CSV" onClick={handleExportCohort}>
                        <Download size={16} />
                    </IconButton>
                </div>
            </div>

            {filteredData.length === 0 ? (
                <EmptyState
                    bare
                    icon={<User size={22} />}
                    title={searchQuery ? 'No matching records' : 'No records'}
                    description={searchQuery ? 'No records match your search criteria.' : 'No records found for this cohort.'}
                />
            ) : (
                <div className={tableWrapCls}>
                    <table className={tableCls}>
                        <thead className={theadCls}>
                            <tr>
                                <th className={thCls}>Student</th>
                                <th className={thCls}>Location</th>
                                <th className={thCls}>Course</th>
                                <th className={thCls}>Status</th>
                                <th className={thCls}>Date</th>
                                <th className={thCls}><span className="sr-only">Action</span></th>
                            </tr>
                        </thead>
                        <tbody className={tbodyCls}>
                            {paginatedData.map(e => {
                                const s = e.students;
                                const statusCfg = STATUS_CONFIG[e.status];
                                const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);
                                return (
                                    <tr key={e.id} className={`${trCls} group`}>
                                        <td className={tdCls}>
                                            <button
                                                type="button"
                                                className="font-semibold text-[13px] text-primary flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400 text-left"
                                                onClick={() => s && onSelectStudent && onSelectStudent(s)}
                                            >
                                                {s?.first_name} {s?.last_name}
                                                {e.is_priority && <PriorityStar />}
                                            </button>
                                            <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                                                <span className="truncate max-w-[220px]">{s?.email || 'No email'}</span>
                                                {s?.phone && <span className="tabular-nums">{s.phone}</span>}
                                            </div>
                                        </td>
                                        <td className={tdCls}>
                                            <div className="flex items-center gap-1 text-xs font-medium text-primary">
                                                <MapPin size={12} className="text-muted shrink-0" />
                                                {norm.microDistrict}
                                            </div>
                                            <div className="text-[11px] text-muted ml-4">{norm.macroRegion}</div>
                                        </td>
                                        <td className={tdCls}>
                                            <div className="text-[13px] text-primary font-medium">{e.courses?.name || 'Unknown'}</div>
                                            <div className="text-[11px] text-muted">{cleanVariant(e.courses?.name || '', e.course_variant)}</div>
                                        </td>
                                        <td className={tdCls}>
                                            <span className={`${statusCfg?.pillBg || 'status-pill-withdrawn'} inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap`}>
                                                {statusCfg?.icon}
                                                {statusCfg?.label || e.status}
                                            </span>
                                        </td>
                                        <td className={`${tdCls} text-muted text-xs tabular-nums whitespace-nowrap`}>
                                            {formatDateDMY(e.completed_date || e.confirmed_date || e.created_at)}
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            {s && onSelectStudent ? (
                                                <Button variant="ghost" size="sm" onClick={() => onSelectStudent(s)} className="text-brand-600 dark:text-brand-400">
                                                    Open
                                                    <ExternalLink size={12} />
                                                </Button>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={filteredData.length}
                pageSize={itemsPerPage}
                onPageChange={setCurrentPage}
                itemLabel="records"
            />
        </Modal>
    );
}
