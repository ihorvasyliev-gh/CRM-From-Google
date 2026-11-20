import { useMemo } from 'react';
import { ClipboardList, FileCheck2, FileText, Layers, Tag } from 'lucide-react';
import Modal from '../ui/Modal';
import DocxLivePreview from './DocxLivePreview';
import { makeSampleEnrollment, type DocContext } from '../../lib/documentUtils';
import { templateLabel } from '../../lib/types';
import { plural, type ShowToast } from './helpers';
import type { PreviewModalTarget, PreviewTarget } from './types';
import type { DocumentSetup } from './useDocumentSetup';

export interface TemplatePreviewModalProps {
    preview: PreviewModalTarget | null;
    onClose: () => void;
    setup: DocumentSetup;
    context?: DocContext;
    showToast: ShowToast;
}

function targetMeta(target: PreviewTarget | undefined) {
    if (!target) return { title: 'Document preview', icon: FileText };
    switch (target.kind) {
        case 'word':
            return { title: templateLabel(target.template), icon: FileText };
        case 'combined':
            return { title: `Combined packet (${plural(target.templates.length, 'template')})`, icon: Layers };
        case 'attendance':
            return { title: 'Attendance sheet', icon: ClipboardList };
        case 'labels':
            return { title: 'Address labels', icon: Tag };
        case 'sicap':
            return { title: 'SICAP course form', icon: FileCheck2 };
    }
}

export default function TemplatePreviewModal({
    preview,
    onClose,
    setup,
    context,
    showToast,
}: TemplatePreviewModalProps) {
    const isSampleData = !preview?.enrollments?.length;
    const enrollments = useMemo(() => {
        if (!preview) return [];
        if (preview.enrollments && preview.enrollments.length > 0) return preview.enrollments;
        return [makeSampleEnrollment(preview.courseName)];
    }, [preview]);

    const { title, icon } = targetMeta(preview?.target);
    const subtitle = preview
        ? isSampleData
            ? `Sample participant data${preview.courseName ? ` · ${preview.courseName}` : ''}`
            : `${plural(enrollments.length, 'participant')}${preview.courseName ? ` · ${preview.courseName}` : ''}`
        : undefined;

    return (
        <Modal
            open={!!preview}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            icon={icon}
            tone="brand"
            size="3xl"
            sheetOnMobile
        >
            {preview && (
                <DocxLivePreview
                    target={preview.target}
                    enrollments={enrollments}
                    context={context}
                    customVariables={setup.archiveVariables.customVariables}
                    dateVariables={setup.archiveVariables.dateVariables}
                    expanded
                    showToast={showToast}
                    isSampleData={isSampleData}
                />
            )}
        </Modal>
    );
}
