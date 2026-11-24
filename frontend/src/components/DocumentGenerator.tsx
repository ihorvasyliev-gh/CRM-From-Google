import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useInRouterContext } from 'react-router-dom';
import { Braces, FileArchive, FolderOpen, Tag, Users, Variable } from 'lucide-react';
import { fetchCourses } from '../lib/queries';
import { useEnrollmentList } from '../hooks/useEnrollments';
import { showToast } from '../lib/toast';
import ConfirmDialog from './ConfirmDialog';
import StatTile from './ui/StatTile';
import { UnderlineTabs, type UnderlineTab } from './ui/Tabs';
import { ErrorState } from './ui/States';
import { RouterTabSync } from './ui/RouterTabSync';
import GenerateTab from './DocumentGenerator/GenerateTab';
import TemplatesTab from './DocumentGenerator/TemplatesTab';
import VariablesExcelTab from './DocumentGenerator/VariablesExcelTab';
import TemplatePreviewModal from './DocumentGenerator/TemplatePreviewModal';
import { useDocumentSetup } from './DocumentGenerator/useDocumentSetup';
import {
    isDocumentsTabKey,
    type ConfirmDelete,
    type DocumentsTabKey,
    type PreviewModalTarget,
} from './DocumentGenerator/types';

export default function DocumentGenerator() {
    const inRouter = useInRouterContext();
    const [activeTab, setActiveTab] = useState<DocumentsTabKey>('generate');
    const [focusCourseId, setFocusCourseId] = useState<string | undefined>(undefined);
    const [previewModal, setPreviewModal] = useState<PreviewModalTarget | null>(null);
    const [routerNav, setRouterNav] = useState<((tab: DocumentsTabKey, path?: string) => void) | null>(null);

    const registerNavigate = useCallback((fn: (tab: DocumentsTabKey, path?: string) => void) => {
        setRouterNav(() => fn);
    }, []);

    const handleNavigateTab = useCallback(
        (nextTab: DocumentsTabKey, courseId?: string) => {
            setActiveTab(nextTab);
            if (courseId !== undefined) setFocusCourseId(courseId);
            routerNav?.(nextTab);
        },
        [routerNav],
    );

    const handleOpenSettingsGeneral = useCallback(() => {
        routerNav?.('generate', '/settings?tab=general');
    }, [routerNav]);

    const {
        data: courses = [],
        isLoading: coursesLoading,
        error: coursesError,
        refetch: refetchCourses,
    } = useQuery({
        queryKey: ['courses'],
        queryFn: fetchCourses,
    });

    // Reuse the global enrollments cache (same key as useEnrollments / Dashboard; kept fresh by realtime sync).
    // Generation re-reads the chosen people anyway, so documents never use stale data.
    const {
        data: enrollments = [],
        complete: enrollmentsComplete,
        error: enrollmentsError,
        refetch: refetchEnrollments,
    } = useEnrollmentList();
    const enrollmentsLoading = !enrollmentsComplete && !enrollmentsError;
    const setup = useDocumentSetup();

    const [pendingDelete, setPendingDelete] = useState<Parameters<ConfirmDelete>[0] | null>(null);

    if (coursesLoading || setup.loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            </div>
        );
    }

    const { templates, attTemplate, labelTemplate, sicapTemplate, customVars, excelColumns } = setup;
    const activeCount = templates.filter(t => t.is_active).length;
    const configuredSingles = Number(!!attTemplate) + Number(!!labelTemplate) + Number(!!sicapTemplate);
    const readyCoursesCount = new Set(enrollments.filter(e => e.status === 'confirmed').map(e => e.course_id)).size;
    const topError = setup.error ?? coursesError ?? null;

    const tabs: UnderlineTab<DocumentsTabKey>[] = [
        {
            value: 'generate',
            label: 'Generate',
            icon: FileArchive,
            count: readyCoursesCount,
        },
        {
            value: 'templates',
            label: 'Templates',
            icon: FolderOpen,
            count: activeCount + configuredSingles,
            countTone: activeCount === 0 ? 'warning' : 'brand',
            dot: activeCount === 0 ? 'bg-warning' : undefined,
            dotLabel: activeCount === 0 ? 'No active Word templates' : undefined,
        },
        {
            value: 'variables',
            label: 'Variables & Excel',
            icon: Braces,
            count: customVars.length + excelColumns.length,
        },
    ];

    return (
        <div className="flex-1 flex flex-col gap-5 sm:gap-6 pb-12 w-full max-w-[1600px] mx-auto">
            {inRouter && (
                <RouterTabSync
                    activeTab={activeTab}
                    isValidTab={isDocumentsTabKey}
                    onTabFromUrl={setActiveTab}
                    registerNavigate={registerNavigate}
                />
            )}

            <ConfirmDialog
                open={!!pendingDelete}
                title={pendingDelete?.title || ''}
                message={pendingDelete?.message || ''}
                confirmLabel={pendingDelete?.confirmLabel}
                onConfirm={async () => {
                    if (!pendingDelete) return;
                    try {
                        await pendingDelete.run();
                    } finally {
                        setPendingDelete(null);
                    }
                }}
                onCancel={() => setPendingDelete(null)}
            />

            <TemplatePreviewModal
                preview={previewModal}
                onClose={() => setPreviewModal(null)}
                setup={setup}
                showToast={showToast}
            />

            {Boolean(topError) && (
                <ErrorState
                    title="Could not load the document templates"
                    error={topError}
                    onRetry={() => {
                        setup.retry();
                        if (coursesError) void refetchCourses();
                    }}
                />
            )}

            {/* Clickable readiness overview */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="Active templates"
                    icon={FileArchive}
                    tone="completed"
                    onClick={() => handleNavigateTab('templates')}
                    value={
                        <>
                            {activeCount}
                            <span className="text-sm font-semibold text-muted"> / {templates.length}</span>
                        </>
                    }
                    hint={activeCount ? 'Manage templates & presets' : 'Upload a .docx to start'}
                    hintTone={activeCount ? 'muted' : 'alert'}
                />
                <StatTile
                    label="Ready courses"
                    icon={Users}
                    tone="success"
                    onClick={() => handleNavigateTab('generate')}
                    value={readyCoursesCount}
                    hint="With confirmed participants"
                />
                <StatTile
                    label="Sheets & SICAP form"
                    icon={Tag}
                    tone="info"
                    onClick={() => handleNavigateTab('templates')}
                    value={
                        <>
                            {configuredSingles}
                            <span className="text-sm font-semibold text-muted"> / 3</span>
                        </>
                    }
                    hint={configuredSingles === 3 ? 'All templates set' : 'Attendance, labels, SICAP form'}
                />
                <StatTile
                    label="Custom variables"
                    icon={Variable}
                    tone="brand"
                    onClick={() => handleNavigateTab('variables')}
                    value={customVars.length}
                    hint={`${excelColumns.length} Excel column${excelColumns.length !== 1 ? 's' : ''}`}
                />
            </div>

            {/* Top-level workspace navigation */}
            <UnderlineTabs<DocumentsTabKey>
                ariaLabel="Documents sections"
                tabs={tabs}
                value={activeTab}
                onChange={tab => handleNavigateTab(tab)}
            />

            {/* Tab panels */}
            <div key={activeTab} className="animate-fadeIn">
                {activeTab === 'generate' && (
                    <GenerateTab
                        courses={courses}
                        enrollments={enrollments}
                        enrollmentsLoading={enrollmentsLoading}
                        enrollmentsError={enrollmentsError}
                        onRetryEnrollments={() => void refetchEnrollments()}
                        setup={setup}
                        showToast={showToast}
                        onNavigateTab={handleNavigateTab}
                        onOpenPreviewModal={setPreviewModal}
                        onOpenSettingsGeneral={inRouter ? handleOpenSettingsGeneral : undefined}
                    />
                )}
                {activeTab === 'templates' && (
                    <TemplatesTab
                        courses={courses}
                        setup={setup}
                        showToast={showToast}
                        confirmDelete={setPendingDelete}
                        onPreview={setPreviewModal}
                        initialCourseId={focusCourseId}
                    />
                )}
                {activeTab === 'variables' && (
                    <VariablesExcelTab
                        setup={setup}
                        showToast={showToast}
                        confirmDelete={setPendingDelete}
                        onOpenSettingsGeneral={inRouter ? handleOpenSettingsGeneral : undefined}
                    />
                )}
            </div>
        </div>
    );
}
