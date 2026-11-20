import { useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    ClipboardList,
    FileArchive,
    FileCheck2,
    FileSpreadsheet,
    FileText,
    Folder,
    FolderOpen,
    Tag,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { EmptyState } from '../ui/States';
import { panelCls } from '../ui/styles';
import {
    archiveFileName,
    planArchivePaths,
    type DocContext,
    type EnrollmentWithRelations,
    type PlannedTopFile,
} from '../../lib/documentUtils';
import { plural } from './helpers';

export interface ArchiveTreePreviewProps {
    archiveName: string;
    enrollments: EnrollmentWithRelations[];
    templateNames: string[];
    combined: boolean;
    includeAttendance: boolean;
    includeLabels: boolean;
    includeSicap: boolean;
    includeExcel: boolean;
    excelColumnCount: number;
    context?: DocContext;
}

const PREVIEW_FILE_LIMIT = 6;

function TopFileIcon({ kind }: { kind: PlannedTopFile['kind'] }) {
    switch (kind) {
        case 'attendance':
            return (
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-info/10 text-status-invited shrink-0">
                    <ClipboardList size={13} />
                </span>
            );
        case 'labels':
            return (
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-warning/15 text-status-requested shrink-0">
                    <Tag size={13} />
                </span>
            );
        case 'sicap':
            return (
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-completed/10 text-status-completed shrink-0">
                    <FileCheck2 size={13} />
                </span>
            );
        case 'excel':
            return (
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-success/10 text-status-confirmed shrink-0">
                    <FileSpreadsheet size={13} />
                </span>
            );
    }
}

export default function ArchiveTreePreview({
    archiveName,
    enrollments,
    templateNames,
    combined,
    includeAttendance,
    includeLabels,
    includeSicap,
    includeExcel,
    excelColumnCount,
    context,
}: ArchiveTreePreviewProps) {
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
    const [expandedLimits, setExpandedLimits] = useState<Set<string>>(() => new Set());

    const tree = useMemo(
        () =>
            planArchivePaths({
                enrollments,
                templateNames,
                combined,
                includeAttendance,
                includeLabels,
                includeSicap,
                includeExcel,
                excelColumnCount,
                context,
            }),
        [
            enrollments,
            templateNames,
            combined,
            includeAttendance,
            includeLabels,
            includeSicap,
            includeExcel,
            excelColumnCount,
            context,
        ],
    );

    const resolvedName = archiveName.trim() || archiveFileName(enrollments);

    if (tree.totalFiles === 0) {
        return (
            <EmptyState
                bare
                icon={<FileArchive size={22} />}
                title="Archive is empty"
                description="Select at least one participant and enable one or more outputs to inspect the ZIP contents."
            />
        );
    }

    const toggleFolder = (name: string) => {
        setCollapsedFolders(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleShowAll = (name: string) => {
        setExpandedLimits(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const allCollapsed = tree.folders.length > 0 && tree.folders.every(f => collapsedFolders.has(f.name));
    const toggleAllFolders = () => {
        setCollapsedFolders(allCollapsed ? new Set() : new Set(tree.folders.map(f => f.name)));
    };

    return (
        <div className="space-y-3 min-w-0">
            {/* .zip Header Pill */}
            <div className={`${panelCls} px-3 py-2.5 flex items-center justify-between gap-2.5`}>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0">
                        <FileArchive size={15} />
                    </span>
                    <span
                        title={resolvedName}
                        className="text-xs font-semibold text-primary font-mono truncate"
                    >
                        {resolvedName}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {tree.folders.length > 1 && (
                        <button
                            type="button"
                            onClick={toggleAllFolders}
                            className="text-[11px] font-medium text-muted hover:text-primary px-1.5 py-0.5 rounded-md hover:bg-surface transition-colors"
                        >
                            {allCollapsed ? 'Expand all' : 'Collapse all'}
                        </button>
                    )}
                    <Badge tone="brand" shape="pill" className="tabular-nums">
                        {plural(tree.totalFiles, 'file')}
                    </Badge>
                </div>
            </div>

            {/* Tree Body */}
            <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
                {/* Folders */}
                {tree.folders.map(folder => {
                    const isOpen = !collapsedFolders.has(folder.name);
                    const showAll = expandedLimits.has(folder.name);
                    const visibleFiles = showAll ? folder.files : folder.files.slice(0, PREVIEW_FILE_LIMIT);
                    const hiddenCount = folder.files.length - visibleFiles.length;
                    const isCombined = folder.kind === 'combined';

                    return (
                        <div key={folder.name} className="min-w-0">
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() => toggleFolder(folder.name)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-elevated/50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    {isOpen ? (
                                        <ChevronDown size={14} className="text-muted shrink-0" />
                                    ) : (
                                        <ChevronRight size={14} className="text-muted shrink-0" />
                                    )}
                                    <span
                                        className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 ${
                                            isCombined
                                                ? 'bg-completed/10 text-status-completed'
                                                : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                                        }`}
                                    >
                                        {isOpen ? <FolderOpen size={13} /> : <Folder size={13} />}
                                    </span>
                                    <span className="text-xs font-semibold text-primary font-mono truncate">
                                        {folder.name}/
                                    </span>
                                    {isCombined && (
                                        <Badge tone="completed" shape="pill">Printing</Badge>
                                    )}
                                </span>
                                <Badge tone="neutral" shape="pill" className="tabular-nums shrink-0">
                                    {plural(folder.files.length, 'file')}
                                </Badge>
                            </button>

                            {isOpen && folder.files.length > 0 && (
                                <ul className="pl-11 pr-3 pb-2.5 pt-0.5 space-y-1 bg-surface-elevated/25">
                                    {visibleFiles.map(file => (
                                        <li key={file} className="flex items-center gap-2 text-xs text-muted min-w-0">
                                            <FileText size={12} className="shrink-0 opacity-70" />
                                            <span className="font-mono text-[11px] text-primary/90 truncate">{file}</span>
                                        </li>
                                    ))}
                                    {hiddenCount > 0 && (
                                        <li className="pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => toggleShowAll(folder.name)}
                                                className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                                            >
                                                … and {hiddenCount} more
                                            </button>
                                        </li>
                                    )}
                                    {showAll && folder.files.length > PREVIEW_FILE_LIMIT && (
                                        <li className="pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => toggleShowAll(folder.name)}
                                                className="text-[11px] font-medium text-muted hover:text-primary hover:underline"
                                            >
                                                Show fewer
                                            </button>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    );
                })}

                {/* Top-level files */}
                {tree.topFiles.length > 0 && (
                    <ul className="divide-y divide-border-subtle/70">
                        {tree.topFiles.map(file => (
                            <li
                                key={file.name}
                                className="flex items-center justify-between gap-2.5 px-3 py-2.5 min-w-0"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <TopFileIcon kind={file.kind} />
                                    <span className="text-xs font-medium text-primary font-mono truncate">
                                        {file.name}
                                    </span>
                                </span>
                                {file.note && (
                                    <span className="text-[11px] text-muted whitespace-nowrap shrink-0">
                                        {file.note}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <p className="text-[11px] text-muted px-1">
                Student files are sorted A–Z by surname ({plural(enrollments.length, 'participant')}).
            </p>
        </div>
    );
}
