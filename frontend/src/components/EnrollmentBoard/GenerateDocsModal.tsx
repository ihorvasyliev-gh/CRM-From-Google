import { useContext, useEffect, useRef, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { AlertCircle, Check, FileArchive, Printer, Square } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import Switch from '../ui/Switch';
import { calloutCls, panelCls } from '../ui/styles';
import GenerationReport from '../DocumentGenerator/GenerationReport';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDisplayDate } from '../../lib/dateUtils';
import { errorMessage } from '../../lib/errors';
import { refreshCachedEnrollments } from '../../lib/enrollmentCache';
import {
    courseDateOf, generateSelectionArchive, isAbortError, summarizeGeneration,
    type GenerationPhase, type GenerationResult,
} from '../../lib/documentUtils';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];

const PHASE_LABELS: Record<GenerationPhase, string> = {
    refreshing: 'Refreshing participants…',
    downloading: 'Downloading templates…',
    rendering: 'Rendering…',
    packing: 'Packing ZIP…',
};

/**
 * "Generate Docs" on the board: what will be made for the selection, per-run output toggles,
 * an optional combined file for printing, progress with cancel, and the same report as the Documents page.
 * `onClose(done)` — done is true when a run finished without errors (the board then clears the selection).
 */
export default function GenerateDocsModal({ open, selected, onClose }: { open: boolean; selected: EnrollmentRow[]; onClose: (done: boolean) => void }) {
    // Safely reads the app's QueryClient when inside QueryClientProvider without crashing standalone modal renders
    const queryClient = useContext(QueryClientContext);
    const [combined, setCombined] = usePersistentState('doc_gen_combined', false, { storage: 'local' });
    const [includeAttendance, setIncludeAttendance] = useState(true);
    const [includeLabels, setIncludeLabels] = useState(true);
    const [includeSicap, setIncludeSicap] = useState(true);
    const [includeExcel, setIncludeExcel] = useState(true);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [phase, setPhase] = useState<GenerationPhase | null>(null);
    const [report, setReport] = useState<{ result: GenerationResult; fileName: string } | null>(null);
    const [hasSucceeded, setHasSucceeded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const generating = progress !== null;

    // A fresh dialog every time it opens; stop a run if the board goes away
    useEffect(() => {
        if (open) {
            setReport(null);
            setError(null);
            setPhase(null);
            setHasSucceeded(false);
            setIncludeAttendance(true);
            setIncludeLabels(true);
            setIncludeSicap(true);
            setIncludeExcel(true);
        }
    }, [open]);
    useEffect(() => () => controllerRef.current?.abort(), []);

    const courseIds = distinct(selected.map(e => e.course_id));
    const singleCourse = courseIds.length === 1;
    const courses = distinct(selected.map(e => e.courses?.name));
    const dates = distinct(selected.map(e => courseDateOf(e)?.slice(0, 10))).sort();
    const done = hasSucceeded;

    const outputToggles = [
        { key: 'attendance', label: 'Attendance sheet', enabled: includeAttendance, setEnabled: setIncludeAttendance },
        { key: 'labels', label: 'Address labels', enabled: includeLabels, setEnabled: setIncludeLabels },
        { key: 'sicap', label: 'SICAP course form', enabled: includeSicap, setEnabled: setIncludeSicap },
        { key: 'excel', label: 'Participants.xlsx', enabled: includeExcel, setEnabled: setIncludeExcel },
    ];

    async function generate() {
        const controller = new AbortController();
        controllerRef.current = controller;
        setProgress({ done: 0, total: 0 });
        setPhase('refreshing');
        setReport(null);
        setError(null);
        try {
            const res = await generateSelectionArchive(selected, {
                combined,
                includeAttendance,
                includeLabels,
                includeSicap,
                includeExcel,
                signal: controller.signal,
                onProgress: (d, total) => setProgress({ done: d, total }),
                onPhase: setPhase,
            });
            if (res.skippedIds.length > 0 && queryClient) {
                void refreshCachedEnrollments(queryClient, res.skippedIds);
            }
            if (queryClient && (res.result.totalDocs > 0 || res.result.extras.some(x => x.ok))) {
                void queryClient.invalidateQueries({ queryKey: ['doc_generations'] });
            }
            setReport({ result: res.result, fileName: res.fileName });
            if (summarizeGeneration(res.result).type !== 'error') {
                setHasSucceeded(true);
            }
        } catch (err: unknown) {
            if (!isAbortError(err)) {
                console.error('Generation error:', err);
                setError(errorMessage(err));
            }
        } finally {
            controllerRef.current = null;
            setProgress(null);
            setPhase(null);
        }
    }

    const footer = generating ? (
        <Button variant="secondary" onClick={() => controllerRef.current?.abort()}>
            <Square size={12} />
            Cancel generation
        </Button>
    ) : report ? (
        <Button variant="primary" onClick={() => onClose(done)}>Done</Button>
    ) : hasSucceeded ? (
        <>
            <Button variant="secondary" onClick={generate} disabled={!selected.length}>
                <FileArchive size={15} />
                Generate again
            </Button>
            <Button variant="primary" onClick={() => onClose(true)}>Done</Button>
        </>
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
                    <dd className="text-primary">{dates.map(d => formatDisplayDate(d)).join(', ') || 'No course date'}</dd>
                    <dt className="text-muted">Templates</dt>
                    <dd className="text-primary">
                        {singleCourse ? "The course's template preset" : 'All active templates (several courses selected)'}
                    </dd>
                </dl>

                <div className={`${panelCls} p-3 space-y-2`}>
                    <p className="text-xs font-semibold text-muted">Additional outputs (when configured)</p>
                    <div className="flex flex-wrap gap-1.5">
                        {outputToggles.map(item => (
                            <button
                                key={item.key}
                                type="button"
                                aria-pressed={item.enabled}
                                disabled={generating}
                                onClick={() => item.setEnabled(!item.enabled)}
                                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    item.enabled
                                        ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
                                        : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                }`}
                            >
                                {item.enabled && <Check size={12} />}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Switch
                    size="sm"
                    role="checkbox"
                    checked={combined}
                    disabled={generating}
                    onChange={setCombined}
                    label={
                        <span className="inline-flex items-center gap-1 font-medium text-xs">
                            <Printer size={13} /> Also one combined file per student
                        </span>
                    }
                    description="All templates for each person in a single .docx, one after another on new pages — for printing. Saved in the Combined folder of the ZIP."
                />

                {generating && (
                    <div>
                        <div className="flex justify-between text-xs text-muted mb-1">
                            <span>{PHASE_LABELS[phase ?? 'refreshing']}</span>
                            {progress.total > 0 && <span className="tabular-nums">{progress.done} / {progress.total} files</span>}
                        </div>
                        <div
                            className="h-1.5 rounded-full bg-surface-elevated overflow-hidden"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={progress.total || 1}
                            aria-valuenow={progress.done}
                        >
                            <div
                                className={`h-full bg-success transition-all ${progress.total === 0 ? 'w-1/3 animate-pulse' : ''}`}
                                style={progress.total > 0 ? { width: `${(progress.done / progress.total) * 100}%` } : undefined}
                            />
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
