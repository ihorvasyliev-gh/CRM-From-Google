import { useParams } from 'react-router-dom';
import ViewerCourseCatalog from './Viewer/ViewerCourseCatalog';
import ViewerCourseRoster from './Viewer/ViewerCourseRoster';

/**
 * Viewer course pages: `/courses` is the catalog, `/courses/:courseId` a course roster.
 * All filters live in the URL (`?status=confirmed&date=2026-10-02&q=…`).
 */
export default function ViewerCourses() {
    const { courseId } = useParams<{ courseId: string }>();
    return courseId ? <ViewerCourseRoster key={courseId} courseId={courseId} /> : <ViewerCourseCatalog />;
}
