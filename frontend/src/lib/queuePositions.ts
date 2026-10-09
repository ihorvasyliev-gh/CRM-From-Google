import { cleanVariant } from './types';

interface QueueEnrollment {
    id: string;
    student_id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    is_priority?: boolean | null;
    created_at: string;
    courses?: { name: string } | null;
}

export interface QueuePositions {
    /** Place of each requested enrollment in the queue of its course and language */
    positions: Map<string, number>;
    /** "English #100 · Ukrainian #10" for a student queued in several languages of the course */
    details: Map<string, string>;
}

/**
 * Requested students queue per course and language: priority first, then the earliest registration.
 * A student can queue in several languages of a course at once, one enrollment per language with
 * its own registration date, so their places differ (e.g. #10 in Ukrainian, #100 in English).
 */
export function computeQueuePositions(enrollments: QueueEnrollment[]): QueuePositions {
    const queues = new Map<string, QueueEnrollment[]>();
    const languageOf = new Map<string, string>();
    for (const e of enrollments) {
        if (e.status !== 'requested') continue;
        const language = cleanVariant(e.courses?.name || '', e.course_variant);
        languageOf.set(e.id, language);
        const key = `${e.course_id}_${language.toLowerCase()}`;
        const queue = queues.get(key);
        if (queue) queue.push(e);
        else queues.set(key, [e]);
    }

    const positions = new Map<string, number>();
    queues.forEach(queue => {
        queue.sort((a, b) => {
            if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
            // ISO timestamps from Postgres: string order is time order, without two Dates per comparison
            return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
        });
        queue.forEach((e, index) => positions.set(e.id, index + 1));
    });

    // The same student's places across the languages of one course
    const byStudentCourse = new Map<string, QueueEnrollment[]>();
    for (const e of enrollments) {
        if (!positions.has(e.id)) continue;
        const key = `${e.student_id}_${e.course_id}`;
        const list = byStudentCourse.get(key);
        if (list) list.push(e);
        else byStudentCourse.set(key, [e]);
    }
    const details = new Map<string, string>();
    byStudentCourse.forEach(list => {
        if (list.length < 2) return;
        const text = list
            .map(e => ({ language: languageOf.get(e.id)!, position: positions.get(e.id)! }))
            .sort((a, b) => a.language.localeCompare(b.language))
            .map(p => `${p.language} #${p.position}`)
            .join(' · ');
        list.forEach(e => details.set(e.id, text));
    });
    return { positions, details };
}
