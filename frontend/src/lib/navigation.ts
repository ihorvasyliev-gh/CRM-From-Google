import type { InviteFilter } from './inviteDeadline';
import type { EnrollmentStatus } from './types';

/** Router state an admin page can be opened with, e.g. the board narrowed to one course date. */
export interface NavState {
    courseId?: string;
    courseDate?: string;
    inviteFilter?: InviteFilter;
    /** Board: the status column to bring into view */
    status?: EnrollmentStatus;
    /** Courses: open the "new course" dialog */
    openCreate?: boolean;
}

/** Opens an admin tab (a top-level route such as 'enrollments'), optionally with state. */
export type NavigateFn = (tab: string, state?: NavState) => void;
