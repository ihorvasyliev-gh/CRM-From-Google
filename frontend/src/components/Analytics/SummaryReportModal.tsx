import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DatePicker';
import { fieldCls, labelCls } from '../ui/styles';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import SummaryReportSheet from './SummaryReportSheet';
import {
    REPORT_PRESETS,
    buildSummaryReport,
    formatPeriodLabel,
    presetPeriod,
    type ReportPeriod,
    type ReportPresetId,
} from './summaryReport';

/**
 * Only the report is printed: everything else on the page is hidden and the page has no margins
 * (the sheet carries its own), so the browser adds no header or footer. Mounted only while the
 * dialog is open, so printing any other page is unchanged.
 */
const PRINT_CSS = `
.report-print-root { display: none; }
@media print {
    @page { size: A4 portrait; margin: 0; }
    html, body {
        background: #fff !important;
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        overflow: visible !important;
    }
    body > :not(.report-print-root) { display: none !important; }
    .report-print-root { display: block !important; }
    /* A hair under 297 mm: rounding must not spill an empty second page */
    .report-print-root .report-sheet { height: 296mm; break-inside: avoid; }
}`;

const SHEET_WIDTH_PX = (210 / 25.4) * 96;

interface SummaryReportModalProps {
    open: boolean;
    onClose: () => void;
    enrollments: EnrollmentWithRelations[];
}

export default function SummaryReportModal({ open, onClose, enrollments }: SummaryReportModalProps) {
    const [preset, setPreset] = useState<ReportPresetId | 'custom'>('ytd');
    const [period, setPeriod] = useState<ReportPeriod>(() => presetPeriod('ytd'));

    const report = useMemo(() => buildSummaryReport(enrollments, period), [enrollments, period]);

    const choosePreset = (id: ReportPresetId) => {
        setPreset(id);
        setPeriod(presetPeriod(id));
    };
    const setStart = (start: string) => {
        if (!start) return;
        setPreset('custom');
        setPeriod(p => ({ start, end: start > p.end ? start : p.end }));
    };
    const setEnd = (end: string) => {
        if (!end) return;
        setPreset('custom');
        setPeriod(p => ({ start: end < p.start ? end : p.start, end }));
    };

    // The preview is the sheet at its real size, zoomed down when the dialog is narrower
    const [zoom, setZoom] = useState(1);
    const previewRef = useCallback((el: HTMLDivElement | null) => {
        if (!el) return;
        // 32: the preview's side padding
        const fit = () => {
            if (el.clientWidth > 32) setZoom(Math.min(1, (el.clientWidth - 32) / SHEET_WIDTH_PX));
        };
        fit();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // "Save as PDF" names the file after the page title
    const titleRef = useRef<string | null>(null);
    useEffect(() => {
        const restore = () => {
            if (titleRef.current !== null) {
                document.title = titleRef.current;
                titleRef.current = null;
            }
        };
        window.addEventListener('afterprint', restore);
        return () => {
            window.removeEventListener('afterprint', restore);
            restore();
        };
    }, []);
    const handlePrint = () => {
        titleRef.current ??= document.title;
        document.title = `Courses report ${period.start} to ${period.end}`;
        window.print();
    };

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title="Courses report"
                subtitle="One A4 page: who registered and who completed a course"
                icon={FileText}
                size="3xl"
                labelId="summary-report-title"
                bodyClassName="p-0! flex flex-col"
                footer={
                    <>
                        <p className="hidden sm:block mr-auto text-xs text-muted">
                            In the print window, choose <span className="font-semibold text-primary">Save as PDF</span>.
                        </p>
                        <Button variant="ghost" onClick={onClose}>Close</Button>
                        <Button variant="primary" onClick={handlePrint}>
                            <Download size={14} />
                            Download PDF
                        </Button>
                    </>
                }
            >
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-5 sm:px-6 py-4 border-b border-border-subtle">
                    <div className="min-w-0 max-w-full">
                        <span className={labelCls}>Period</span>
                        <div role="group" aria-label="Period" className="flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none">
                            {REPORT_PRESETS.map(p => {
                                const active = preset === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => choosePreset(p.id)}
                                        className={`shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                            active ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <label htmlFor="report-start" className={labelCls}>From</label>
                            <DateInput id="report-start" value={period.start} onChange={setStart} className={`${fieldCls} w-36`} />
                        </div>
                        <div>
                            <label htmlFor="report-end" className={labelCls}>To</label>
                            <DateInput id="report-end" value={period.end} onChange={setEnd} className={`${fieldCls} w-36`} />
                        </div>
                    </div>
                    <p className="text-xs text-muted pb-2" aria-live="polite">
                        <span className="font-semibold text-primary">{formatPeriodLabel(period)}</span>
                        {' · '}
                        {report.peopleRegistered} registered · {report.peopleCompleted} completed
                    </p>
                </div>

                <div ref={previewRef} className="flex-1 bg-surface-elevated/70 px-4 py-6 overflow-x-hidden">
                    <div className="mx-auto w-fit shadow-float ring-1 ring-black/5" style={{ zoom }}>
                        <SummaryReportSheet report={report} period={period} />
                    </div>
                </div>
            </Modal>

            {open && createPortal(
                <div className="report-print-root">
                    <style>{PRINT_CSS}</style>
                    <SummaryReportSheet report={report} period={period} />
                </div>,
                document.body,
            )}
        </>
    );
}
