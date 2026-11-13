import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import SummaryReportSheet from './SummaryReportSheet';
import type { Insights } from './insights';
import type { Narrative } from './narrative';
import { formatPeriodLabel } from './summaryReport';

/**
 * Only the report is printed: everything else on the page is hidden and the page has no margins
 * (each sheet carries its own), so the browser adds no header or footer. Mounted only while the
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
    /* A hair under 297 mm: rounding must not spill an empty extra page */
    .report-print-root .report-sheet { height: 296mm; break-inside: avoid; break-after: page; }
    .report-print-root .report-sheet:last-child { break-after: auto; }
}`;

const SHEET_WIDTH_PX = (210 / 25.4) * 96;

type PageCount = '1' | '2';
const PAGE_OPTIONS: { value: PageCount; label: string; title: string }[] = [
    { value: '1', label: '1 page', title: 'The summary, key figures, months and courses' },
    { value: '2', label: '2 pages', title: 'Also where registrations stand, employment after the course and who registered' },
];

interface SummaryReportModalProps {
    open: boolean;
    onClose: () => void;
    /** The figures on the Analytics page: the report is the same period and course */
    insights: Insights;
    narrative: Narrative;
    courseName: string | null;
}

export default function SummaryReportModal({ open, onClose, insights, narrative, courseName }: SummaryReportModalProps) {
    const [pageCount, setPageCount] = useState<PageCount>('2');
    const pages = pageCount === '1' ? 1 : 2;
    const { period } = insights;

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
        document.title = `Courses report ${period.start} to ${period.end}${courseName ? ` ${courseName.replace(/[\\/:*?"<>|]/g, ' ')}` : ''}`;
        window.print();
    };

    const sheet = <SummaryReportSheet insights={insights} narrative={narrative} courseName={courseName} pages={pages} />;

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title="PDF report"
                subtitle="The figures of the Analytics page, explained in words, on A4"
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
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 sm:px-6 py-3.5 border-b border-border-subtle">
                    <p className="text-xs text-muted min-w-0">
                        <span className="font-semibold text-primary">{formatPeriodLabel(period)}</span>
                        {' · '}{courseName ?? 'All courses'}
                        <span className="hidden sm:inline"> · change the period or course on the Analytics page</span>
                    </p>
                    <Segmented options={PAGE_OPTIONS} value={pageCount} onChange={setPageCount} ariaLabel="Length of the report" />
                </div>

                <div ref={previewRef} className="flex-1 bg-surface-elevated/70 px-4 py-6 overflow-x-hidden">
                    <div className="report-preview mx-auto w-fit flex flex-col gap-6" style={{ zoom }}>
                        {sheet}
                    </div>
                </div>
            </Modal>

            {open && createPortal(
                <div className="report-print-root">
                    <style>{PRINT_CSS}</style>
                    {sheet}
                </div>,
                document.body,
            )}
        </>
    );
}
