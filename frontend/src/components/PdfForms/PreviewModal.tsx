import { Download, Eye, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { calloutCls } from '../ui/styles';
import { downloadBlob } from '../../lib/download';
import { useElementWidth, usePdfDocument } from './pdfHooks';
import { PdfPage } from './pdfView';

interface PreviewModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    fileName: string;
    /** The filled PDF; null while it is being made */
    bytes: Uint8Array | null;
    warnings?: string[];
    error?: string | null;
}

/** A filled form, page by page, with a download button */
export default function PreviewModal({ open, onClose, title, fileName, bytes, warnings = [], error }: PreviewModalProps) {
    const { pdf, loading, error: openError } = usePdfDocument(open ? bytes : null, false);
    const [bodyRef, bodyWidth] = useElementWidth<HTMLDivElement>();
    const width = Math.min(bodyWidth, 900);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            subtitle={fileName}
            icon={Eye}
            size="3xl"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Close</Button>
                    <Button
                        variant="primary"
                        disabled={!bytes}
                        onClick={() => bytes && downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName)}
                    >
                        <Download size={15} /> Download
                    </Button>
                </>
            }
        >
            <div ref={bodyRef} className="space-y-4">
                {warnings.length > 0 && (
                    <ul className={`${calloutCls.warning} text-xs p-3 space-y-1`}>
                        {warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                )}
                {(error || openError) && <div className={`${calloutCls.danger} text-sm p-3`}>{error || openError}</div>}
                {(!bytes || loading) && !error && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted py-16">
                        <Loader2 size={18} className="animate-spin" /> Filling the form…
                    </div>
                )}
                {pdf && width > 0 && (
                    <div className="flex flex-col items-center gap-4 bg-surface-elevated/60 rounded-xl p-3">
                        {pdf.layout.pages.map((size, i) => (
                            <PdfPage key={i} doc={pdf.doc} page={i} size={size} width={width - 24} />
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
