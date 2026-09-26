import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileArchive, Tag, Users, Variable } from 'lucide-react';
import { fetchCourses } from '../lib/queries';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import Toast, { type ToastData } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import StatTile from './ui/StatTile';
import { ErrorState } from './ui/States';
import GeneratePanel from './DocumentGenerator/GeneratePanel';
import PlaceholderReference from './DocumentGenerator/PlaceholderReference';
import { WordTemplatesCard, SingleTemplateCard } from './DocumentGenerator/TemplateCards';
import { CustomVariablesCard, ExcelColumnsCard } from './DocumentGenerator/SettingsCards';
import { useDocumentSetup } from './DocumentGenerator/useDocumentSetup';
import type { ConfirmDelete, ShowToast } from './DocumentGenerator/helpers';

export default function DocumentGenerator() {
    const { data: courses = [], isLoading: coursesLoading } = useQuery({
        queryKey: ['doc_courses'],
        staleTime: 0, // pick up template presets just edited on the Courses tab
        queryFn: fetchCourses,
    });
    // Reuse the global enrollments cache (same key as useEnrollments / Dashboard; kept fresh by realtime sync).
    // Generation re-reads the chosen people anyway, so documents never use stale data.
    const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
    });
    const setup = useDocumentSetup();

    const [toast, setToast] = useState<ToastData | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Parameters<ConfirmDelete>[0] | null>(null);
    const showToast: ShowToast = useCallback((message, type, duration) => setToast({ message, type, duration }), []);

    if (coursesLoading || enrollmentsLoading || setup.loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            </div>
        );
    }

    const { templates, attTemplate, labelTemplate, customVars, excelColumns } = setup;
    const activeCount = templates.filter(t => t.is_active).length;
    const cardProps = { setup, showToast, confirmDelete: setPendingDelete };

    return (
        <div className="pb-8 space-y-5">
            <Toast toast={toast} onDismiss={() => setToast(null)} />
            <ConfirmDialog
                open={!!pendingDelete}
                title={pendingDelete?.title || ''}
                message={pendingDelete?.message || ''}
                onConfirm={async () => {
                    if (!pendingDelete) return;
                    await pendingDelete.run();
                    setPendingDelete(null);
                }}
                onCancel={() => setPendingDelete(null)}
            />

            {setup.error && <ErrorState title="Could not load the document templates" error={setup.error} onRetry={setup.retry} />}

            {/* Readiness overview */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="Active templates"
                    icon={FileArchive}
                    tone="completed"
                    accent={false}
                    value={<>{activeCount}<span className="text-sm font-semibold text-muted"> / {templates.length}</span></>}
                    hint={activeCount ? 'Used for every student' : 'Upload a .docx to start'}
                    hintTone={activeCount ? 'muted' : 'alert'}
                />
                <StatTile
                    label="Ready courses"
                    icon={Users}
                    tone="success"
                    accent={false}
                    value={new Set(enrollments.filter(e => e.status === 'confirmed').map(e => e.course_id)).size}
                    hint="With confirmed participants"
                />
                <StatTile
                    label="Attendance & labels"
                    icon={Tag}
                    tone="info"
                    accent={false}
                    value={<>{Number(!!attTemplate) + Number(!!labelTemplate)}<span className="text-sm font-semibold text-muted"> / 2</span></>}
                    hint={attTemplate && labelTemplate ? 'Both templates set' : 'Optional sheets'}
                />
                <StatTile
                    label="Custom variables"
                    icon={Variable}
                    tone="brand"
                    accent={false}
                    value={customVars.length}
                    hint={`${excelColumns.length} Excel column${excelColumns.length !== 1 ? 's' : ''}`}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5 items-start">
                {/* ═══ Left: generate flow ═══ */}
                <div className="space-y-5 min-w-0">
                    <GeneratePanel courses={courses} enrollments={enrollments} setup={setup} showToast={showToast} />
                    <PlaceholderReference customVars={customVars} />
                </div>

                {/* ═══ Right: templates & setup ═══ */}
                <div className="space-y-5 min-w-0">
                    <WordTemplatesCard {...cardProps} />
                    <SingleTemplateCard kind="attendance" {...cardProps} />
                    <SingleTemplateCard kind="labels" {...cardProps} />
                    <CustomVariablesCard {...cardProps} />
                    <ExcelColumnsCard setup={setup} showToast={showToast} />
                </div>
            </div>
        </div>
    );
}
