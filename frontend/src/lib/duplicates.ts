// ─── Duplicate Student Scanner & Non-Duplicate Management ──────
// Full-table paginated duplicate detection (exact email groups, phone/DOB fuzzy matches,
// and resolved ignored pairs) plus persistence helpers for `student_non_duplicates`.
import { fetchAllPages } from './queries';
import { areNamesSimilar, normalizePhone } from './similarity';
import { supabase } from './supabase';
import type { Student } from './types';

export interface NonDuplicateRow {
    student_a_id: string;
    student_b_id: string;
    created_at?: string | null;
}

export type DuplicateEmailGroup = {
    key: string;
    students: Student[];
    unresolvedPairs: [Student, Student][];
};

export type PotentialDuplicateMatch = {
    pairKey: string;
    studentA: Student;
    studentB: Student;
    reason: string;
    diffs: string[];
};

export type IgnoredDuplicatePair = {
    pairKey: string;
    studentAId: string;
    studentBId: string;
    studentA?: Student;
    studentB?: Student;
    createdAt?: string | null;
};

export type DuplicateScanResult = {
    totalStudents: number;
    exactEmailGroups: DuplicateEmailGroup[];
    potentialMatches: PotentialDuplicateMatch[];
    ignoredPairs: IgnoredDuplicatePair[];
    nonDupKeys: Set<string>;
};

/** Canonical pair order matching the DB constraint `student_a_id < student_b_id`. */
export function orderStudentPair(idA: string, idB: string): [string, string] {
    return idA < idB ? [idA, idB] : [idB, idA];
}

/** Canonical string key (`${minId}_${maxId}`) for a student pair. */
export function makePairKey(idA: string, idB: string): string {
    const [a, b] = orderStudentPair(idA, idB);
    return `${a}_${b}`;
}

function toTimestamp(iso: string | null | undefined): number {
    if (!iso) return 0;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function isMissingTableError(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code;
    return code === '42P01' || code === 'PGRST205';
}

/**
 * Pure duplicate analysis across all students and known non-duplicate pairs:
 * - Groups exact normalized email matches with their unresolved pairs.
 * - Buckets by normalized phone (>= 6 digits) and DOB to find similar-name potential matches.
 * - Resolves non-duplicate pairs to student objects (newest first), omitting orphaned IDs.
 */
export function computeDuplicateScan(
    students: Student[],
    nonDups: NonDuplicateRow[],
): DuplicateScanResult {
    const studentById = new Map<string, Student>(students.map(s => [s.id, s]));

    const nonDupKeys = new Set<string>();
    const seenIgnored = new Set<string>();
    const ignoredPairs: IgnoredDuplicatePair[] = [];

    for (const row of nonDups) {
        if (!row.student_a_id || !row.student_b_id || row.student_a_id === row.student_b_id) continue;
        const [studentAId, studentBId] = orderStudentPair(row.student_a_id, row.student_b_id);
        const pairKey = `${studentAId}_${studentBId}`;
        nonDupKeys.add(pairKey);

        if (seenIgnored.has(pairKey)) continue;
        const studentA = studentById.get(studentAId);
        const studentB = studentById.get(studentBId);
        // Filter out orphaned rows where either student no longer exists
        if (!studentA || !studentB) continue;

        seenIgnored.add(pairKey);
        ignoredPairs.push({
            pairKey,
            studentAId,
            studentBId,
            studentA,
            studentB,
            createdAt: row.created_at ?? null,
        });
    }

    ignoredPairs.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

    // 1. Group by exact normalized email (ignoring empty/whitespace emails)
    const emailGroups = new Map<string, Student[]>();
    for (const s of students) {
        const key = s.email?.trim().toLowerCase();
        if (!key) continue;
        let list = emailGroups.get(key);
        if (!list) {
            list = [];
            emailGroups.set(key, list);
        }
        list.push(s);
    }

    const exactEmailGroups: DuplicateEmailGroup[] = [];
    for (const [key, list] of emailGroups.entries()) {
        if (list.length <= 1) continue;
        const unresolvedPairs: [Student, Student][] = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const pairKey = makePairKey(list[i].id, list[j].id);
                if (!nonDupKeys.has(pairKey)) {
                    const t1 = toTimestamp(list[i].created_at);
                    const t2 = toTimestamp(list[j].created_at);
                    unresolvedPairs.push(t1 <= t2 ? [list[i], list[j]] : [list[j], list[i]]);
                }
            }
        }
        if (unresolvedPairs.length > 0) {
            exactEmailGroups.push({ key, students: list, unresolvedPairs });
        }
    }

    // 2. Fast candidate bucketing by normalized phone and DOB to avoid O(N^2) comparisons
    const candidatePairs = new Map<string, [Student, Student]>();
    const phoneBuckets = new Map<string, Student[]>();
    const dobBuckets = new Map<string, Student[]>();

    for (const s of students) {
        const phone = normalizePhone(s.phone);
        if (phone && phone.length >= 6) {
            let list = phoneBuckets.get(phone);
            if (!list) {
                list = [];
                phoneBuckets.set(phone, list);
            }
            list.push(s);
        }
        const dob = s.dob?.trim();
        if (dob) {
            let list = dobBuckets.get(dob);
            if (!list) {
                list = [];
                dobBuckets.set(dob, list);
            }
            list.push(s);
        }
    }

    const addBucketCandidates = (buckets: Map<string, Student[]>) => {
        for (const list of buckets.values()) {
            if (list.length <= 1) continue;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const pairKey = makePairKey(list[i].id, list[j].id);
                    if (!candidatePairs.has(pairKey)) {
                        candidatePairs.set(pairKey, [list[i], list[j]]);
                    }
                }
            }
        }
    };

    addBucketCandidates(phoneBuckets);
    addBucketCandidates(dobBuckets);

    const potentialMatches: PotentialDuplicateMatch[] = [];
    for (const [pairKey, [s1, s2]] of candidatePairs.entries()) {
        // Exact email matches are already covered by exactEmailGroups
        const e1 = s1.email?.trim().toLowerCase();
        const e2 = s2.email?.trim().toLowerCase();
        if (e1 && e2 && e1 === e2) continue;

        if (nonDupKeys.has(pairKey)) continue;

        if (!areNamesSimilar(s1.first_name, s1.last_name, s2.first_name, s2.last_name)) continue;

        const reasons: string[] = [];
        const dob1 = s1.dob?.trim();
        const dob2 = s2.dob?.trim();
        if (dob1 && dob2 && dob1 === dob2) {
            reasons.push('Same DOB');
        }

        const p1 = normalizePhone(s1.phone);
        const p2 = normalizePhone(s2.phone);
        if (p1 && p2 && p1.length >= 6 && p1 === p2) {
            reasons.push('Same Phone');
        }

        if (reasons.length === 0) continue;

        const t1 = toTimestamp(s1.created_at);
        const t2 = toTimestamp(s2.created_at);
        const studentA = t1 <= t2 ? s1 : s2; // older profile
        const studentB = t1 <= t2 ? s2 : s1; // newer profile

        const diffs: string[] = [];
        if ((studentA.address || '').trim() !== (studentB.address || '').trim()) diffs.push('address');
        if (normalizePhone(studentA.phone) !== normalizePhone(studentB.phone)) diffs.push('phone');
        if ((studentA.email || '').trim().toLowerCase() !== (studentB.email || '').trim().toLowerCase()) diffs.push('email');

        let reason = reasons.join(' & ');
        if (diffs.length > 0) {
            reason += `, different ${diffs.join('/')}`;
        }

        potentialMatches.push({
            pairKey,
            studentA,
            studentB,
            reason,
            diffs,
        });
    }

    return {
        totalStudents: students.length,
        exactEmailGroups,
        potentialMatches,
        ignoredPairs,
        nonDupKeys,
    };
}

/**
 * Fetches all students and non-duplicate rows across all pages and computes duplicate matches.
 * Gracefully ignores missing `student_non_duplicates` table (42P01 / PGRST205), while rethrowing real errors.
 */
export async function scanDuplicateStudents(): Promise<DuplicateScanResult> {
    const fetchNonDups = async (): Promise<NonDuplicateRow[]> => {
        try {
            return await fetchAllPages<NonDuplicateRow>((from, to) =>
                supabase
                    .from('student_non_duplicates')
                    .select('student_a_id, student_b_id, created_at')
                    .order('student_a_id', { ascending: true })
                    .order('student_b_id', { ascending: true })
                    .range(from, to)
            );
        } catch (err) {
            if (isMissingTableError(err)) return [];
            throw err;
        }
    };

    const [students, nonDups] = await Promise.all([
        fetchAllPages<Student>((from, to) =>
            supabase
                .from('students')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to)
        ),
        fetchNonDups(),
    ]);

    return computeDuplicateScan(students, nonDups);
}

/** Upserts all ordered pairs `(a < b)` for the given student IDs into `student_non_duplicates`. */
export async function markStudentsAsNonDuplicates(studentIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
    const pairsToInsert: { student_a_id: string; student_b_id: string }[] = [];
    for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i + 1; j < uniqueIds.length; j++) {
            const [student_a_id, student_b_id] = orderStudentPair(uniqueIds[i], uniqueIds[j]);
            pairsToInsert.push({ student_a_id, student_b_id });
        }
    }
    if (pairsToInsert.length === 0) return;

    const { error } = await supabase
        .from('student_non_duplicates')
        .upsert(pairsToInsert, { onConflict: 'student_a_id,student_b_id' });
    if (error) throw error;
}

/** Upserts a single ordered pair into `student_non_duplicates`. */
export async function markPairAsNonDuplicates(studentAId: string, studentBId: string): Promise<void> {
    if (!studentAId || !studentBId || studentAId === studentBId) return;
    const [student_a_id, student_b_id] = orderStudentPair(studentAId, studentBId);
    const { error } = await supabase
        .from('student_non_duplicates')
        .upsert({ student_a_id, student_b_id }, { onConflict: 'student_a_id,student_b_id' });
    if (error) throw error;
}

/** Deletes the ordered pair from `student_non_duplicates` so it can be flagged again. */
export async function restoreNonDuplicatePair(studentAId: string, studentBId: string): Promise<void> {
    if (!studentAId || !studentBId || studentAId === studentBId) return;
    const [student_a_id, student_b_id] = orderStudentPair(studentAId, studentBId);
    const { error } = await supabase
        .from('student_non_duplicates')
        .delete()
        .eq('student_a_id', student_a_id)
        .eq('student_b_id', student_b_id);
    if (error) throw error;
}
