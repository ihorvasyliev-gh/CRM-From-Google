import type { Course } from '../../lib/types';
import type { ConfirmDelete, ShowToast } from './helpers';
import type { PreviewModalTarget } from './types';
import type { DocumentSetup } from './useDocumentSetup';
import { WordTemplatesPanel } from './WordTemplatesPanel';
import { SingleTemplatesPanel } from './SingleTemplatesPanel';
import { CoursePresetsPanel } from './CoursePresetsPanel';

export interface TemplatesTabProps {
    courses: Course[];
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
    onPreview: (preview: PreviewModalTarget) => void;
    initialCourseId?: string;
}

export function TemplatesTab({
    courses,
    setup,
    showToast,
    confirmDelete,
    onPreview,
    initialCourseId,
}: TemplatesTabProps) {
    return (
        <div className="max-w-6xl mx-auto w-full space-y-6">
            <WordTemplatesPanel
                courses={courses}
                setup={setup}
                showToast={showToast}
                confirmDelete={confirmDelete}
                onPreview={onPreview}
            />
            <SingleTemplatesPanel
                setup={setup}
                showToast={showToast}
                confirmDelete={confirmDelete}
                onPreview={onPreview}
            />
            <CoursePresetsPanel
                courses={courses}
                setup={setup}
                showToast={showToast}
                initialCourseId={initialCourseId}
            />
        </div>
    );
}

export default TemplatesTab;
