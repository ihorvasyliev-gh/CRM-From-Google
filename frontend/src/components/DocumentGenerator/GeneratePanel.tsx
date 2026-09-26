import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, CheckCircle2, Download, FileArchive, FlaskConical, Printer, Square, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import { panelCls, tableCls, tbodyCls, tdCls, thCls, theadCls, trCls } from '../ui/styles';
import CoursePicker from './CoursePicker';
import GenerationReport from './GenerationReport';
import { StepHeader } from './shared';
import { errorText, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDateLong } from '../../lib/dateUtils';
import type { Course } from '../../lib/types';
import {
    archiveFileName, coursePreset, defaultSessionKey, generateDocumentsArchive, groupSessions, isAbortError,
    refreshParticipants, sessionKeyOf, sortBySurname, summarizeGeneration,
    type EnrollmentWithRelations, type GenerationResult, type GenerationStatus,
} from '../../lib/documentUtils';

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

const STATUS_OPTIONS: { value: GenerationStatus; label: string; title: string }[] = [
    { value: 'confirmed', label: 'Confirmed', title: 'People confirmed for a course date — letters, attendance sheets, labels' },
    { value: 'completed', label: 'Completed', title: 'People who finished the course — certificates' },
];

export default function GeneratePanel({ courses, enrollments, setup, showToast }: {
    courses: Course[];
    enrollments: EnrollmentWithRelations[];
    setup: DocumentSetup;
    showToast: ShowToast;
}) {
    const queryClient = useQueryClient();
    const { templates, attTemplate, labelTemplate, archiveVariables, excelColumns } = setup;

    const [status, setStatus] = usePersistentState<GenerationStatus>('doc_gen_status', 'confirmed', {
        validate: (v): v is GenerationStatus => v === 'confirmed' || v === 'completed',
    });
    const [courseId, setCourseId] = useState('');
    const [sessionKey, setSessionKey] = useState<string | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [combined, setCombined] = usePersistentState('doc_gen_combined', false, { storage: 'local' });
    const [progress, setProgress] = useState<{ done: number; total: number; sample: boolean } | null>(null);
    const [report, setReport] = useState<{ result: GenerationResult; fileName: string } | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const generating = progress !== null;

    // Stop a running generation when leaving the page
    useEffect(() => () => controllerRef.current?.abort(), []);

    // ─── Who is in the list ─────────────────────────────────
    const withStatus = useMemo(() => enrollments.filter(e => e.status === status && e.students), [enrollments, status]);
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of withStatus) map.set(e.course_id, (map.get(e.course_id) || 0) + 1);
        return map;
    }, [withStatus]);
    const coursesWithPeople = useMemo(() => courses.filter(c => counts.has(c.id)), [courses, counts]);
    const course = courses.find(c => c.id === courseId);

    const sessions = useMemo(() => groupSessions(withStatus.filter(e => e.course_id === courseId)), [withStatus, courseId]);
    const session = sessions.find(s => s.key === sessionKey) ?? sessions.find(s => s.key === defaultSessionKey(sessions, status));
    const rows = useMemo(() => sortBySurname(session?.enrollments ?? []), [session]);
    const selected = useMemo(() => rows.filter(e => !excluded.has(e.id)), [rows, excluded]);

    const resetSelection = () => { setSessionKey(null); setExcluded(new Set()); setReport(null); };
    const changeStatus = (value: GenerationStatus) => { setStatus(value); setCourseId(''); resetSelection(); };
    const changeCourse = (id: string) => { setCourseId(id); resetSelection(); };
    const changeSession = (key: string) => { setSessionKey(key); setExcluded(new Set()); setReport(null); };
    const toggle = (id: string) => setExcluded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const allChecked = selected.length === rows.length;
    const toggleAll = () => setExcluded(allChecked ? new Set(rows.map(e => e.id)) : new Set());

    // ─── What goes into the archive ─────────────────────────
    const preset = coursePreset(templates, course?.template_ids);
    const wordTemplates = preset.templates;
    const hasOutput = wordTemplates.length > 0 || !!attTemplate || !!labelTemplate || excelColumns.length > 0;
    const canGenerate = !setup.error && selected.length > 0 && hasOutput;
    const presetNote = { all: 'all active — no course preset', preset: 'course preset', 'preset-off': '' }[preset.state];
    const archiveContents = [
        preset.state === 'preset-off'
            ? { key: 'word', label: 'Word documents: every template picked for this course is switched off', ok: false, warn: true }
            : {
                key: 'word',
                label: `${plural(wordTemplates.length, 'Word template')} per student${wordTemplates.length ? ` (${presetNote}): ${wordTemplates.map(t => t.name).join(', ')}` : ''}`,
                ok: wordTemplates.length > 0,
            },
        { key: 'att', label: 'Attendance sheet', ok: !!attTemplate },
        { key: 'lbl', label: 'Address labels', ok: !!labelTemplate },
        { key: 'xlsx', label: `Participants.xlsx (${plural(excelColumns.length, 'column')})`, ok: excelColumns.length > 0 },
    ];

    // ─── Generate ───────────────────────────────────────────
    /** `sample` renders only the first participant, to check the templates before a full run. */
    async function generate(sample = false) {
        if (!canGenerate) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setProgress({ done: 0, total: 0, sample });
        setReport(null);
        try {
            // Re-read the chosen people so names, addresses and statuses are current
            const { people, skipped } = await refreshParticipants(
                sample ? selected.slice(0, 1) : selected,
                e => e.status === status && e.course_id === courseId && sessionKeyOf(e) === session?.key,
            );
            if (skipped.length) queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            if (!people.length) {
                showToast('Nobody to generate for — the selected enrollments changed since the list was loaded. The list has been refreshed.', 'error');
                return;
            }

            const fileName = archiveFileName(people, sample ? 'SAMPLE ' : '');
            const result = await generateDocumentsArchive(fileName, {
                enrollments: people,
                templates: wordTemplates.map(t => ({ name: t.name, storagePath: t.storage_path })),
                attendanceTemplatePath: attTemplate?.storage_path,
                labelTemplatePath: labelTemplate?.storage_path,
                ...archiveVariables,
                excelColumns,
                combined: combined && !sample,
                signal: controller.signal,
                onProgress: (done, total) => setProgress({ done, total, sample }),
            });
            result.skipped = skipped;
            setReport({ result, fileName });
            const { type } = summarizeGeneration(result);
            const downloaded = result.totalDocs > 0 || result.extras.some(x => x.ok);
            showToast(
                !downloaded ? 'Nothing was generated — see the report below' : type === 'success' ? `Downloaded ${fileName}` : 'Downloaded, but some files need attention — see the report below',
                type,
            );
        } catch (err: unknown) {
            if (isAbortError(err)) {
                showToast('Generation cancelled', 'info');
            } else {
                console.error('Generation error:', err);
                showToast(`Generation failed: ${errorText(err)}`, 'error');
            }
        } finally {
            controllerRef.current = null;
            setProgress(null);
        }
    }

    const statusWord = status === 'confirmed' ? 'confirmed' : 'completed';
    const dateHeader = status === 'confirmed' ? 'Confirmed' : 'Completed';

    return (
        <Card
            title="Generate documents"
            subtitle="Personalised documents for the participants of one course date"
            icon={Download}
            tone="success"
            divided
        >
            <div className="space-y-6">
                {/* Step 1 */}
                <div>
                    <StepHeader n={1} title="Choose a course" done={!!course} hint={`${coursesWithPeople.length} with ${statusWord} students`} />
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Segmented options={STATUS_OPTIONS} value={status} onChange={changeStatus} ariaLabel="Participants" className="shrink-0 self-start sm:self-center" />
                        <div className="flex-1 min-w-0">
                            <CoursePicker courses={coursesWithPeople} counts={counts} countLabel={statusWord} value={courseId} onChange={changeCourse} />
                        </div>
                    </div>
                </div>

                {/* Step 2 */}
                <div>
                    <StepHeader
                        n={2}
                        title="Choose the date and participants"
                        done={selected.length > 0}
                        hint={course && rows.length ? `${selected.length} of ${rows.length} selected` : undefined}
                    />
                    {!course ? (
                        <div className={`${panelCls} border-dashed px-4 py-6 text-center text-xs text-muted`}>
                            Pick a course above to see who will receive documents.
                        </div>
                    ) : rows.length === 0 ? (
                        <div className={`${panelCls} px-4 py-6 text-center`}>
                            <AlertCircle size={20} className="mx-auto mb-2 text-muted" />
                            <p className="text-sm text-muted">No {statusWord} enrollments for this course</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sessions.length > 1 ? (
                                <div role="radiogroup" aria-label="Course date" className="flex flex-wrap gap-1.5">
                                    {sessions.map(s => {
                                        const active = s.key === session?.key;
                                        return (
                                            <button
                                                key={s.key}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                onClick={() => changeSession(s.key)}
                                                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                                                    active ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400' : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                                }`}
                                            >
                                                <CalendarDays size={13} />
                                                {s.date ? formatDateLong(s.date) : 'No date'}
                                                <span className="tabular-nums opacity-70">· {s.enrollments.length}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="flex items-center gap-1.5 text-xs text-muted">
                                    <CalendarDays size={13} />
                                    {session?.date ? `Course date ${formatDateLong(session.date)}` : 'No course date set'}
                                </p>
                            )}

                            <div className="rounded-xl border border-border-subtle overflow-hidden">
                                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                    <table className={tableCls}>
                                        <thead className={`${theadCls} sticky top-0 z-10 bg-surface-elevated!`}>
                                            <tr>
                                                <th className={`${thCls} w-10`}>
                                                    <input
                                                        type="checkbox"
                                                        aria-label="Select all participants"
                                                        checked={allChecked}
                                                        ref={el => { if (el) el.indeterminate = selected.length > 0 && !allChecked; }}
                                                        onChange={toggleAll}
                                                        className="accent-brand-500 cursor-pointer"
                                                    />
                                                </th>
                                                <th className={thCls}>Name</th>
                                                <th className={`${thCls} hidden md:table-cell`}>Phone</th>
                                                <th className={thCls}>Variant</th>
                                                <th className={`${thCls} hidden sm:table-cell`}>{dateHeader}</th>
                                            </tr>
                                        </thead>
                                        <tbody className={tbodyCls}>
                                            {rows.map(e => {
                                                const checked = !excluded.has(e.id);
                                                const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.trim();
                                                const date = status === 'confirmed' ? e.confirmed_date : e.completed_date;
                                                return (
                                                    <tr key={e.id} className={`${trCls} ${checked ? '' : 'opacity-50'}`}>
                                                        <td className={`${tdCls} py-2.5!`}>
                                                            <input type="checkbox" aria-label={`Include ${name}`} checked={checked} onChange={() => toggle(e.id)} className="accent-brand-500 cursor-pointer" />
                                                        </td>
                                                        <td className={`${tdCls} py-2.5!`}>
                                                            <p className="font-medium text-primary text-[13px]">{name}</p>
                                                            <p className="text-[11px] text-muted truncate max-w-[240px]">{e.students?.email || '—'}</p>
                                                        </td>
                                                        <td className={`${tdCls} py-2.5! text-muted text-xs tabular-nums hidden md:table-cell`}>{e.students?.phone || '—'}</td>
                                                        <td className={`${tdCls} py-2.5!`}>
                                                            {e.course_variant ? <Badge tone="completed">{e.course_variant}</Badge> : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td className={`${tdCls} py-2.5! text-muted text-xs hidden sm:table-cell whitespace-nowrap`}>
                                                            {date ? formatDateLong(date) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Step 3 */}
                <div>
                    <StepHeader n={3} title="Generate the archive" done={false} />
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                        {archiveContents.map(item => (
                            <li
                                key={item.key}
                                className={`flex items-start gap-2 text-xs ${item.ok ? 'text-primary' : item.warn ? 'text-status-requested font-medium' : 'text-muted line-through decoration-border-strong'}`}
                            >
                                {item.ok
                                    ? <CheckCircle2 size={14} className="text-status-confirmed shrink-0 mt-px" />
                                    : item.warn ? <AlertCircle size={14} className="shrink-0 mt-px" /> : <X size={14} className="text-muted shrink-0 mt-px" />}
                                {item.label}
                            </li>
                        ))}
                    </ul>
                    <label className={`flex items-start gap-2 mb-4 text-xs ${wordTemplates.length ? 'text-primary cursor-pointer' : 'text-muted'}`}>
                        <input
                            type="checkbox"
                            checked={combined}
                            disabled={!wordTemplates.length}
                            onChange={e => setCombined(e.target.checked)}
                            className="accent-brand-500 mt-0.5"
                        />
                        <span>
                            <span className="inline-flex items-center gap-1 font-medium"><Printer size={13} /> Also one combined file per template</span>
                            <span className="block text-muted">Everyone in a single .docx, one after another on new pages — for printing.</span>
                        </span>
                    </label>

                    {generating ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between text-xs text-muted mb-1">
                                        <span>{progress.sample ? 'Generating a sample…' : 'Generating…'}</span>
                                        {progress.total > 0 && <span className="tabular-nums">{progress.done} / {progress.total} files</span>}
                                    </div>
                                    <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
                                        <div className="h-full bg-success transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm" onClick={() => controllerRef.current?.abort()}>
                                    <Square size={12} />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <Button variant={canGenerate ? 'success' : 'secondary'} size="lg" className="w-full h-11!" onClick={() => generate()} disabled={!canGenerate}>
                                <FileArchive size={17} className="shrink-0" />
                                <span className="truncate">
                                    Generate & Download ZIP <span className="hidden sm:inline">({plural(selected.length, 'student')} × {plural(wordTemplates.length, 'template')})</span>
                                </span>
                            </Button>
                            {canGenerate && (
                                <div className="mt-2 flex justify-center">
                                    <Button variant="ghost" size="sm" onClick={() => generate(true)}>
                                        <FlaskConical size={14} />
                                        Try with one participant first
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {!hasOutput && (
                        <p className="mt-2 text-xs text-status-requested text-center font-medium flex items-center justify-center gap-1.5">
                            <AlertCircle size={13} />
                            Upload a Word template, an attendance or label template, or add Excel columns first
                        </p>
                    )}
                    {report && <GenerationReport result={report.result} fileName={report.fileName} onDismiss={() => setReport(null)} />}
                </div>
            </div>
        </Card>
    );
}
