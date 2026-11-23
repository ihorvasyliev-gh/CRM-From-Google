import { useMemo, useState } from 'react';
import {
    AlertTriangle,
    Download,
    FileDown,
    FileText,
    Maximize2,
    Printer,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import Modal from '../ui/Modal';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import { panelCls } from '../ui/styles';
import { useElementWidth } from '../PdfForms/pdfHooks';
import { chequeReqFileName, descriptionFit } from '../../lib/chequeReq/docx';
import type { ChequeReqForm, ChequeReqMeta } from '../../lib/chequeReq/types';
import RequisitionSheet, { SHEET_HEIGHT_PX, SHEET_WIDTH_PX } from './RequisitionSheet';

export interface RequisitionLivePreviewProps {
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    onDownloadDocx?: () => void;
    onDownloadPdf?: () => void;
    onPrint?: () => void;
    downloading?: boolean;
}

type ZoomMode = 'fit' | '100';

const ZOOM_OPTIONS: SegmentOption<ZoomMode>[] = [
    { value: 'fit', label: 'Fit' },
    { value: '100', label: '100%' },
];

interface ScaledSheetProps {
    form: ChequeReqForm;
    zoomMode: ZoomMode;
    expanded?: boolean;
}

/**
 * Scales the fixed 612pt × 792pt SICAP sheet cleanly with CSS transform inside an
 * exact-sized wrapper so both Fit and 100% modes stay razor-sharp without reflowing text.
 */
function ScaledSheet({ form, zoomMode, expanded = false }: ScaledSheetProps) {
    const [measureRef, canvasWidth] = useElementWidth<HTMLDivElement>();

    const scale =
        zoomMode === '100'
            ? 1
            : canvasWidth > 0
                ? Math.min(1, canvasWidth / SHEET_WIDTH_PX)
                : 1;

    const scaledW = Math.round(SHEET_WIDTH_PX * scale);
    const scaledH = Math.round(SHEET_HEIGHT_PX * scale);

    return (
        <div
            className={`${panelCls} overflow-y-auto ${zoomMode === '100' ? 'overflow-x-auto' : 'overflow-x-hidden'} ${
                expanded ? 'max-h-[72vh] min-h-[420px]' : 'max-h-[75vh] lg:max-h-[calc(100vh-14.5rem)] min-h-[360px]'
            } p-3 sm:p-4`}
        >
            <div ref={measureRef} className="w-full min-w-0">
                <div
                    className="mx-auto relative"
                    style={{ width: `${scaledW}px`, minHeight: `${scaledH}px` }}
                >
                    <div
                        style={{
                            width: `${SHEET_WIDTH_PX}px`,
                            transform: scale === 1 ? undefined : `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        <RequisitionSheet form={form} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Instant live visual preview of the filled SICAP Cheque Requisition form, matching
 * the Word template and vector PDF 1:1 with zoom controls, 2-line description fit guard,
 * fullscreen expand modal, and quick export actions.
 */
export default function RequisitionLivePreview({
    form,
    meta,
    onDownloadDocx,
    onDownloadPdf,
    onPrint,
    downloading = false,
}: RequisitionLivePreviewProps) {
    const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
    const [modalZoom, setModalZoom] = useState<ZoomMode>('fit');
    const [expanded, setExpanded] = useState(false);

    const fit = useMemo(() => descriptionFit(form.description), [form.description]);
    const fileName = useMemo(() => chequeReqFileName(meta, form), [meta, form]);

    const actions = (
        <div className="flex items-center gap-1.5 flex-wrap">
            {onPrint && (
                <Button size="xs" variant="ghost" disabled={downloading} onClick={onPrint}>
                    <Printer size={13} />
                    <span>Print</span>
                </Button>
            )}
            {onDownloadPdf && (
                <Button size="xs" variant="secondary" disabled={downloading} onClick={onDownloadPdf}>
                    <FileDown size={13} />
                    <span>PDF</span>
                </Button>
            )}
            {onDownloadDocx && (
                <Button size="xs" variant="secondary" loading={downloading} onClick={onDownloadDocx}>
                    {!downloading && <Download size={13} />}
                    <span>.docx</span>
                </Button>
            )}
        </div>
    );

    return (
        <>
            <div className="space-y-2.5 min-w-0">
                {/* Pinned Preview Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <Segmented
                            options={ZOOM_OPTIONS}
                            value={zoomMode}
                            onChange={setZoomMode}
                            ariaLabel="Requisition preview zoom"
                            size="sm"
                        />

                        {fit.overflowsLine2 && (
                            <Badge
                                tone="warning"
                                shape="pill"
                                icon={<AlertTriangle size={11} />}
                                title={`Description uses ${fit.line2Pct}% of the second ruled line and may wrap past the template lines`}
                            >
                                Overflows 2 lines
                            </Badge>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {actions}
                        <IconButton
                            size="sm"
                            label="Expand requisition preview"
                            onClick={() => setExpanded(true)}
                        >
                            <Maximize2 size={14} />
                        </IconButton>
                    </div>
                </div>

                {/* Live SICAP Requisition Paper Sheet */}
                <ScaledSheet form={form} zoomMode={zoomMode} />
            </div>

            <Modal
                open={expanded}
                onClose={() => setExpanded(false)}
                title={fileName.replace(/\.docx$/i, '')}
                subtitle="Live SICAP cheque requisition preview"
                icon={FileText}
                size="3xl"
                headerAction={
                    <div className="flex items-center gap-2">
                        <Segmented
                            options={ZOOM_OPTIONS}
                            value={modalZoom}
                            onChange={setModalZoom}
                            ariaLabel="Expanded requisition zoom"
                            size="sm"
                        />
                        {actions}
                    </div>
                }
                bodyClassName="p-3 sm:p-4"
            >
                {expanded && (
                    <div className="space-y-2.5">
                        {fit.overflowsLine2 && (
                            <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-primary flex items-center gap-2">
                                <AlertTriangle size={14} className="shrink-0 text-status-requested" />
                                <span>
                                    The description exceeds the two ruled lines on the SICAP Word form ({fit.line2Pct}% of line 2). Shorten it slightly to keep the layout crisp.
                                </span>
                            </div>
                        )}
                        <ScaledSheet form={form} zoomMode={modalZoom} expanded />
                    </div>
                )}
            </Modal>
        </>
    );
}
