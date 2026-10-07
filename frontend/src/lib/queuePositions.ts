import { ANY_VARIANT, cleanVariant } from './types';

interface QueueEnrollment {
    id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    is_priority?: boolean | null;
    created_at: string;
    courses?: { name: string } | null;
}

export interface QueuePositions {
    /** Place in the queue shown on the card */
    positions: Map<string, number>;
    /** "English #10 · Ukrainian #100": where an "Any language" student stands in each language's queue */
    details: Map<string, string>;
}

/**
 * Requested students queue per course and language: priority first, then the earliest registration.
 * An "Any language" student stands in the queue of every language of the course at once, with a
 * place in each; the card shows the place in the language on screen (shownLanguage of shownCourse),
 * otherwise the best one. get_enrollment_queue_position (migration 80) counts the same way.
 */
export function computeQueuePositions(
    enrollments: QueueEnrollment[],
    shownCourse?: string,
    shownLanguage?: string | null,
): QueuePositions {
    const anyKey = ANY_VARIANT.toLowerCase();
    const languageOf = (e: QueueEnrollment) => cleanVariant(e.courses?.name || '', e.course_variant);

    // The languages of each course, from every enrollment, so a language nobody waits for still has a queue
    const courseLanguages = new Map<string, Map<string, string>>();
    for (const e of enrollments) {
        const language = languageOf(e);
        const key = language.toLowerCase();
        if (key === anyKey) continue;
        let languages = courseLanguages.get(e.course_id);
        if (!languages) courseLanguages.set(e.course_id, languages = new Map());
        if (!languages.has(key)) languages.set(key, language);
    }

    const queues = new Map<string, { language: string; entries: QueueEnrollment[] }>();
    const join = (e: QueueEnrollment, key: string, language: string) => {
        const id = `${e.course_id}_${key}`;
        let queue = queues.get(id);
        if (!queue) queues.set(id, queue = { language, entries: [] });
        queue.entries.push(e);
    };
    for (const e of enrollments) {
        if (e.status !== 'requested') continue;
        const language = languageOf(e);
        const key = language.toLowerCase();
        const languages = courseLanguages.get(e.course_id);
        if (key !== anyKey) join(e, key, language);
        else if (languages?.size) languages.forEach((name, k) => join(e, k, name));
        else join(e, anyKey, ANY_VARIANT);
    }

    // enrollment id → its place in each queue it stands in
    const places = new Map<string, Array<{ language: string; position: number }>>();
    queues.forEach(({ language, entries }) => {
        entries.sort((a, b) => {
            if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        entries.forEach((e, index) => {
            const list = places.get(e.id) || [];
            list.push({ language, position: index + 1 });
            places.set(e.id, list);
        });
    });

    const positions = new Map<string, number>();
    const details = new Map<string, string>();
    const courseOf = new Map(enrollments.map(e => [e.id, e.course_id]));
    places.forEach((list, id) => {
        if (list.length === 1) {
            positions.set(id, list[0].position);
            return;
        }
        list.sort((a, b) => a.language.localeCompare(b.language));
        const shown = courseOf.get(id) === shownCourse && shownLanguage
            ? list.find(p => p.language.toLowerCase() === shownLanguage.toLowerCase())
            : undefined;
        positions.set(id, shown ? shown.position : Math.min(...list.map(p => p.position)));
        details.set(id, list.map(p => `${p.language} #${p.position}`).join(' · '));
    });
    return { positions, details };
}
