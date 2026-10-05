import { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileArchive, Printer, Square } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { calloutCls } from '../ui/styles';
import GenerationReport from '../DocumentGenerator/GenerationReport';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDateLong } from '../../lib/dateUtils';
import {
    courseDateOf, generateSelectionArchive, isAbortError, summarizeGeneration, type GenerationResult,
} from '../../lib/documentUtils';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];

/**
 * "Generate Docs" on the board: what will be made for the selection, an optional combined
 * file for printing, progress with cancel, and the same report as the Documents page.
 * `onClose(done)` — done is true when a run finished without errors (the board then clears the selection).
 */
export default function GenerateDocsModal({ open, selected, onClose }: { open: boolean; selected: EnrollmentRow[]; onClose: (done: boolean) => void }) {
    const [combined, setCombined] = usePersistentState('doc_gen_combined', false, { storage: 'local' });
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [report, setReport] = useState<{ result: GenerationResult; fileName: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const generating = progress !== null;

    // A fresh dialog every time it opens; stop a run if the board goes away
    useEffect(() => { if (open) { setReport(null); setError(null); } }, [open]);
    useEffect(() => () => controllerRef.current?.abort(), []);

    const courses = distinct(selected.map(e => e.courses?.name));
    const dates = distinct(selected.map(e => courseDateOf(e)?.slice(0, 10))).sort();
    const done = !!report && summarizeGeneration(report.result).type !== 'error';

    async function generate() {
        const controller = new AbortController();
        controllerRef.current = controller;
        setProgress({ done: 0, total: 0 });
        setReport(null);
        setError(null);
        try {
            setReport(await generateSelectionArchive(selected, {
                combined,
                signal: controller.signal,
                onProgress: (d, total) => setProgress({ done: d, total }),
            }));
        } catch (err: unknown) {
            if (!isAbortError(err)) {
                console.error('Generation error:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            }
        } finally {
            controllerRef.current = null;
            setProgress(null);
        }
    }

    const footer = generating ? (
        <Button variant="secondary" onClick={() => controllerRef.current?.abort()}>
            <Square size={12} />
            Cancel generation
        </Button>
    ) : report ? (
        <Button variant="primary" onClick={() => onClose(done)}>Done</Button>
    ) : (
        <>
            <Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
            <Button variant="success" onClick={generate} disabled={!selected.length}>
                <FileArchive size={15} />
                Generate & Download ZIP
            </Button>
        </>
    );

    return (
        <Modal
            open={open}
            onClose={() => onClose(done)}
            dismissible={!generating}
            title="Generate documents"
            subtitle={`${selected.length} selected enrollment${selected.length !== 1 ? 's' : ''}`}
            icon={FileArchive}
            tone="warning"
            labelId="generate-docs-title"
            sheetOnMobile
            footer={footer}
        >
            <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    <dt className="text-muted">Course{courses.length !== 1 ? 's' : ''}</dt>
                    <dd className="text-primary font-medium">{courses.join(', ') || '—'}</dd>
                    <dt className="text-muted">Date{dates.length !== 1 ? 's' : ''}</dt>
                    <dd className="text-primary">{dates.map(d => formatDateLong(d)).join(', ') || 'No course date'}</dd>
                    <dt className="text-muted">Templates</dt>
                    <dd className="text-primary">
                        {courses.length === 1 ? "The course's template preset" : 'All active templates (several courses selected)'}, plus the attendance sheet, labels and Participants.xlsx when set up
                    </dd>
                </dl>

                <label className={`flex items-start gap-2 text-xs ${generating ? 'text-muted' : 'text-primary cursor-pointer'}`}>
                    <input type="checkbox" checked={combined} disabled={generating} onChange={e => setCombined(e.target.checked)} className="accent-brand-500 mt-0.5" />
                    <span>
                        <span className="inline-flex items-center gap-1 font-medium"><Printer size={13} /> Also one combined file per template</span>
                        <span className="block text-muted">Everyone in a single .docx, one after another on new pages — for printing.</span>
                    </span>
                </label>

                {generating && (
                    <div>
                        <div className="flex justify-between text-xs text-muted mb-1">
                            <span>Generating…</span>
                            {progress.total > 0 && <span className="tabular-nums">{progress.done} / {progress.total} files</span>}
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
                            <div className="h-full bg-success transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                        </div>
                    </div>
                )}

                {error && (
                    <div role="alert" className={`${calloutCls.danger} flex items-start gap-2 px-3 py-2.5 text-xs`}>
                        <AlertCircle size={14} className="text-status-rejected shrink-0 mt-px" />
                        <span>Generation failed: {error}</span>
                    </div>
                )}

                {report && <GenerationReport result={report.result} fileName={report.fileName} onDismiss={() => setReport(null)} />}
            </div>
        </Modal>
    );
}
