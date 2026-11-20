import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import type { DocumentTemplate, TemplateVariable } from '../../lib/types';
import type { ShowToast } from '../../lib/toast';

export type DocumentsTabKey = 'generate' | 'templates' | 'variables';

export const DOCUMENTS_TABS: readonly DocumentsTabKey[] = ['generate', 'templates', 'variables'] as const;

export function isDocumentsTabKey(value: string | null | undefined): value is DocumentsTabKey {
    return value === 'generate' || value === 'templates' || value === 'variables';
}

/** Asks for confirmation before a destructive action (template / variable deletion). */
export type ConfirmDelete = (request: {
    title: string;
    message: string;
    confirmLabel?: string;
    run: () => Promise<unknown>;
}) => void;

/** What the Live Preview pane or Preview Modal renders. */
export type PreviewTarget =
    | { kind: 'word'; template: DocumentTemplate }
    | { kind: 'combined'; templates: DocumentTemplate[] }
    | { kind: 'attendance'; template: DocumentTemplate }
    | { kind: 'labels'; template: DocumentTemplate }
    | { kind: 'sicap'; template: DocumentTemplate };

/** Shared props for previewing any template in a modal (used by TemplatesTab and GenerateTab fullscreen). */
export interface PreviewModalTarget {
    target: PreviewTarget;
    /** Real participants when triggered from Generate; undefined falls back to realistic sample participant(s). */
    enrollments?: EnrollmentWithRelations[];
    courseName?: string;
}

export interface SharedPanelProps {
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
}

export type VariableKind = 'text' | 'date';

export interface VariableUpdateInput {
    variable: TemplateVariable;
    var_key?: string;
    kind?: VariableKind;
    value?: string;
    rule?: import('../../lib/documentUtils').DateRule;
}
