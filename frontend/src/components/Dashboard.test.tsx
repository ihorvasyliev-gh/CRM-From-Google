import { describe, it, expect } from 'vitest';
import { cleanVariant } from '../lib/types';

describe('Dashboard Activity Grouping Logic', () => {
    function groupStudentEnrollments(enrollments: Array<{
        id: string;
        courseName: string;
        courseVariant: string | null;
        status: string;
    }>) {
        const courseGroups = new Map<string, typeof enrollments>();
        for (const en of enrollments) {
            const groupKey = `${en.courseName}:::${en.status}`;
            const existing = courseGroups.get(groupKey) || [];
            existing.push(en);
            courseGroups.set(groupKey, existing);
        }

        return Array.from(courseGroups.entries()).map(([_, ens]) => {
            const courseName = ens[0].courseName;
            const status = ens[0].status;
            const variants = ens
                .map(en => cleanVariant(courseName, en.courseVariant))
                .filter((v, idx, self) => v && self.indexOf(v) === idx);

            const first = ens[0];
            return {
                id: first.id,
                courseName,
                courseVariant: variants.length > 0 ? variants.join(', ') : null,
                status,
            };
        }).sort((a, b) => {
            const STATUS_PRIORITY: Record<string, number> = {
                confirmed: 1,
                invited: 2,
                completed: 3,
                requested: 4,
                withdrawn: 5,
                rejected: 6,
            };
            const pA = STATUS_PRIORITY[a.status] || 99;
            const pB = STATUS_PRIORITY[b.status] || 99;
            if (pA !== pB) return pA - pB;
            return a.courseName.localeCompare(b.courseName);
        });
    }

    it('separates confirmed and requested variants for the same course and prioritizes confirmed first', () => {
        const studentEnrollments = [
            { id: '1', courseName: 'Manual Handling', courseVariant: 'English', status: 'requested' },
            { id: '2', courseName: 'Manual Handling', courseVariant: 'Ukrainian', status: 'confirmed' },
            { id: '3', courseName: 'SafePass', courseVariant: 'Ukrainian', status: 'requested' },
            { id: '4', courseName: 'SafePass', courseVariant: 'English', status: 'requested' },
            { id: '5', courseName: 'Barista', courseVariant: 'English', status: 'requested' },
        ];

        const grouped = groupStudentEnrollments(studentEnrollments);

        // Confirmed Manual Handling should be first (priority sort)
        expect(grouped[0]).toEqual({
            id: '2',
            courseName: 'Manual Handling',
            courseVariant: 'Ukrainian',
            status: 'confirmed'
        });

        // SafePass with both requested variants merged into one pill
        const safePass = grouped.find(g => g.courseName === 'SafePass');
        expect(safePass).toEqual({
            id: '3',
            courseName: 'SafePass',
            courseVariant: 'Ukrainian, English',
            status: 'requested'
        });

        // Requested Manual Handling is retained as separate pill
        const requestedManualHandling = grouped.find(g => g.courseName === 'Manual Handling' && g.status === 'requested');
        expect(requestedManualHandling).toEqual({
            id: '1',
            courseName: 'Manual Handling',
            courseVariant: 'English',
            status: 'requested'
        });
    });
});
