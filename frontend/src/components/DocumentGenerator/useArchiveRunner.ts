import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshCachedEnrollments } from '../../lib/enrollmentCache';
import { templateLabel, type DocumentTemplate } from '../../lib/types';
import {
    archiveFileName,
    fetchDocContext,
    generateDocumentsArchive,
    isAbortError,
    refreshParticipants,
    sessionKeyOf,
    summarizeGeneration,
    type EnrollmentWithRelations,
    type GenerationPhase,
    type GenerationResult,
    type GenerationStatus,
} from '../../lib/documentUtils';
import { errorText, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';

export const PHASE_LABELS: Record<GenerationPhase, string> = {
    refreshing: 'Refreshing participants…',
    downloading: 'Downloading templates…',
    rendering: 'Rendering documents…',
    packing: 'Packing ZIP archive…',
};

export interface ArchiveRunProgress {
    done: number;
    total: number;
    sample: boolean;
    phase: GenerationPhase;
}

export interface ArchiveRunReport {
    result: GenerationResult;
    fileName: string;
}

export interface UseArchiveRunnerOptions {
    canGenerate: boolean;
    status: GenerationStatus;
    courseId: string;
    courseName?: string;
    sessionKey?: string;
    sessionDate?: string | null;
    selected: EnrollmentWithRelations[];
    chosenWordTemplates: DocumentTemplate[];
    attendanceTemplatePath?: string | null;
    labelTemplatePath?: string | null;
    sicapTemplatePath?: string | null;
    archiveVariables: DocumentSetup['archiveVariables'];
    excelColumns: DocumentSetup['excelColumns'];
    combined: boolean;
    onLogGeneration: DocumentSetup['logGeneration']['mutate'];
    showToast: ShowToast;
}

export function useArchiveRunner({
    canGenerate,
    status,
    courseId,
    courseName,
    sessionKey,
    sessionDate,
    selected,
    chosenWordTemplates,
    attendanceTemplatePath,
    labelTemplatePath,
    sicapTemplatePath,
    archiveVariables,
    excelColumns,
    combined,
    onLogGeneration,
    showToast,
}: UseArchiveRunnerOptions) {
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState<ArchiveRunProgress | null>(null);
    const [report, setReport] = useState<ArchiveRunReport | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const generating = progress !== null;

    // Stop a running generation when unmounting
    useEffect(() => () => controllerRef.current?.abort(), []);

    const cancel = useCallback(() => {
        controllerRef.current?.abort();
    }, []);

    const clearReport = useCallback(() => {
        setReport(null);
    }, []);

    /** `sample` renders only the first participant, to check the templates before a full run. */
    const generate = useCallback(async (sample = false) => {
        if (!canGenerate) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setProgress({ done: 0, total: 0, sample, phase: 'refreshing' });
        setReport(null);
        try {
            const chosen = sample ? selected.slice(0, 1) : selected;
            const { people, skipped } = await refreshParticipants(
                chosen,
                e => e.status === status && e.course_id === courseId && sessionKeyOf(e) === sessionKey,
            );
            if (controller.signal.aborted) return;
            if (skipped.length) void refreshCachedEnrollments(queryClient, chosen.map(e => e.id));
            if (!people.length) {
                showToast('Nobody to generate for — the selected enrollments changed since the list was loaded. The list has been refreshed.', 'error');
                return;
            }

            const fileName = archiveFileName(people, sample ? 'SAMPLE ' : '');
            const context = await fetchDocContext(people);
            if (controller.signal.aborted) return;

            const result = await generateDocumentsArchive(fileName, {
                enrollments: people,
                templates: chosenWordTemplates.map(t => ({ name: templateLabel(t), storagePath: t.storage_path })),
                attendanceTemplatePath: attendanceTemplatePath ?? null,
                labelTemplatePath: labelTemplatePath ?? null,
                sicapTemplatePath: sicapTemplatePath ?? null,
                context,
                ...archiveVariables,
                excelColumns,
                combined,
                signal: controller.signal,
                onPhase: phase => setProgress(prev => (prev ? { ...prev, phase } : { done: 0, total: 0, sample, phase })),
                onProgress: (done, total) => setProgress(prev => ({ done, total, sample, phase: prev?.phase ?? 'rendering' })),
            });
            result.skipped = skipped;
            setReport({ result, fileName });
            const { type } = summarizeGeneration(result);
            const downloaded = result.totalDocs > 0 || result.extras.some(x => x.ok);

            if (downloaded && !sample) {
                onLogGeneration({
                    staff_name: context.staffName ?? '',
                    course_id: courseId || null,
                    course_name: courseName || 'Course',
                    session_date: sessionDate ?? null,
                    status,
                    participant_count: people.length,
                    template_names: chosenWordTemplates.map(t => templateLabel(t)),
                    extras: result.extras.filter(x => x.ok).map(x => x.label),
                    file_name: fileName,
                    total_docs: result.totalDocs,
                    had_problems: result.failedTemplates.length > 0 || result.failedDocs.length > 0 || result.extras.some(x => !x.ok),
                    source: 'documents',
                });
            }

            showToast(
                !downloaded
                    ? 'Nothing was generated — see the report below'
                    : type === 'success'
                        ? `Downloaded ${fileName}`
                        : 'Downloaded, but some files need attention — see the report below',
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
    }, [
        canGenerate,
        selected,
        status,
        courseId,
        sessionKey,
        queryClient,
        showToast,
        chosenWordTemplates,
        attendanceTemplatePath,
        labelTemplatePath,
        sicapTemplatePath,
        archiveVariables,
        excelColumns,
        combined,
        onLogGeneration,
        courseName,
        sessionDate,
    ]);

    return {
        progress,
        report,
        generating,
        generate,
        cancel,
        clearReport,
    };
}
