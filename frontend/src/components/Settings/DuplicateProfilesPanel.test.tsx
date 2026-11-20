import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DuplicateProfilesPanel from './DuplicateProfilesPanel';
import {
    makePairKey,
    restoreNonDuplicatePair,
    scanDuplicateStudents,
    type DuplicateScanResult,
} from '../../lib/duplicates';
import type { Student } from '../../lib/types';

vi.mock('../../lib/duplicates', async importOriginal => {
    const actual = await importOriginal<typeof import('../../lib/duplicates')>();
    return {
        ...actual,
        scanDuplicateStudents: vi.fn(),
        markPairAsNonDuplicates: vi.fn().mockResolvedValue(undefined),
        markStudentsAsNonDuplicates: vi.fn().mockResolvedValue(undefined),
        restoreNonDuplicatePair: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock('../MergeModal', () => ({
    default: function MockMergeModal({
        open,
        student,
        initialTargetStudent,
        onClose,
    }: {
        open: boolean;
        student: Student;
        initialTargetStudent?: Student | null;
        onClose: () => void;
    }) {
        if (!open) return null;
        return (
            <div role="dialog" aria-label="Mock merge modal">
                <p data-testid="merge-student-a">{`${student.id}:${student.first_name} ${student.last_name}`}</p>
                <p data-testid="merge-student-b">
                    {initialTargetStudent
                        ? `${initialTargetStudent.id}:${initialTargetStudent.first_name} ${initialTargetStudent.last_name}`
                        : 'none'}
                </p>
                <button type="button" onClick={onClose}>
                    Close merge
                </button>
            </div>
        );
    },
}));

function makeStudent(overrides: Partial<Student> & { id: string }): Student {
    return {
        first_name: 'Alice',
        last_name: 'Murphy',
        email: 'alice@example.com',
        phone: '+353871234567',
        address: '12 Patrick St',
        eircode: 'T12 AB12',
        dob: '1992-05-14',
        created_at: '2026-01-10T10:00:00Z',
        ...overrides,
    };
}

describe('DuplicateProfilesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders initial empty state before scan and shows summary stats after scanning', async () => {
        const s1 = makeStudent({ id: 's1', first_name: 'Alice', last_name: 'One', email: 'shared@example.com' });
        const s2 = makeStudent({ id: 's2', first_name: 'Alice', last_name: 'Two', email: 'shared@example.com' });
        const s3 = makeStudent({ id: 's3', first_name: 'Bob', last_name: 'Smith', email: 'bob1@example.com', phone: '+353870001111' });
        const s4 = makeStudent({ id: 's4', first_name: 'Bob', last_name: 'Smyth', email: 'bob2@example.com', phone: '+353870001111' });
        const s5 = makeStudent({ id: 's5', first_name: 'Cara', last_name: 'Old', email: 'cara1@example.com' });
        const s6 = makeStudent({ id: 's6', first_name: 'Cara', last_name: 'New', email: 'cara2@example.com' });

        const scanResult: DuplicateScanResult = {
            totalStudents: 128,
            exactEmailGroups: [
                {
                    key: 'shared@example.com',
                    students: [s1, s2],
                    unresolvedPairs: [[s1, s2]],
                },
            ],
            potentialMatches: [
                {
                    pairKey: makePairKey(s3.id, s4.id),
                    studentA: s3,
                    studentB: s4,
                    reason: 'Same Phone',
                    diffs: ['email'],
                },
            ],
            ignoredPairs: [
                {
                    pairKey: makePairKey(s5.id, s6.id),
                    studentAId: s5.id,
                    studentBId: s6.id,
                    studentA: s5,
                    studentB: s6,
                    createdAt: '2026-02-01T09:00:00Z',
                },
            ],
            nonDupKeys: new Set([makePairKey(s5.id, s6.id)]),
        };

        vi.mocked(scanDuplicateStudents).mockResolvedValueOnce(scanResult);
        const onIssuesCountChange = vi.fn();

        render(<DuplicateProfilesPanel onIssuesCountChange={onIssuesCountChange} />);

        // Initial empty state before scan
        expect(screen.getByText('No scan run yet')).toBeInTheDocument();
        expect(scanDuplicateStudents).not.toHaveBeenCalled();

        fireEvent.click(screen.getAllByRole('button', { name: 'Scan for duplicates' })[0]);

        await waitFor(() => {
            expect(scanDuplicateStudents).toHaveBeenCalledTimes(1);
        });

        expect(await screen.findByText('Profiles scanned')).toBeInTheDocument();
        expect(screen.getByText('128')).toBeInTheDocument();
        expect(screen.getByText('Shared email groups')).toBeInTheDocument();
        expect(screen.getByText('Potential matches')).toBeInTheDocument();
        expect(screen.getByText('Ignored pairs')).toBeInTheDocument();
        expect(screen.getByText('2 to review')).toBeInTheDocument();
        expect(onIssuesCountChange).toHaveBeenCalledWith(2);
    });

    it('shows error state with Retry button on scan failure and does not show "everything is clean"', async () => {
        vi.mocked(scanDuplicateStudents)
            .mockRejectedValueOnce(new Error('Database connection failed'))
            .mockResolvedValueOnce({
                totalStudents: 50,
                exactEmailGroups: [],
                potentialMatches: [],
                ignoredPairs: [],
                nonDupKeys: new Set(),
            });

        const onIssuesCountChange = vi.fn();
        render(<DuplicateProfilesPanel onIssuesCountChange={onIssuesCountChange} />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Scan for duplicates' })[0]);

        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Could not scan student profiles')).toBeInTheDocument();
        expect(within(alert).getByText('Database connection failed')).toBeInTheDocument();
        expect(screen.queryByText(/everything is clean/i)).not.toBeInTheDocument();
        expect(onIssuesCountChange).toHaveBeenCalledWith(undefined);

        // Retry recovers cleanly
        fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText(/everything is clean/i)).toBeInTheDocument();
        expect(scanDuplicateStudents).toHaveBeenCalledTimes(2);
    });

    it('defaults 3+ exact-email group to the first unresolved pair and lets admin select any 2 profiles (A / B) before merging', async () => {
        const s1 = makeStudent({ id: 's1', first_name: 'Alice', last_name: 'Alpha', email: 'family@example.com' });
        const s2 = makeStudent({ id: 's2', first_name: 'Alice', last_name: 'Beta', email: 'family@example.com' });
        const s3 = makeStudent({ id: 's3', first_name: 'Alice', last_name: 'Gamma', email: 'family@example.com' });

        vi.mocked(scanDuplicateStudents).mockResolvedValueOnce({
            totalStudents: 3,
            exactEmailGroups: [
                {
                    key: 'family@example.com',
                    students: [s1, s2, s3],
                    // First unresolved pair is [s2, s3] (e.g. s1_s2 was already ignored)
                    unresolvedPairs: [
                        [s2, s3],
                        [s1, s3],
                    ],
                },
            ],
            potentialMatches: [],
            ignoredPairs: [],
            nonDupKeys: new Set([makePairKey(s1.id, s2.id)]),
        });

        render(<DuplicateProfilesPanel />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Scan for duplicates' })[0]);

        const alphaBtn = await screen.findByRole('button', { name: /Alice Alpha/ });
        const betaBtn = screen.getByRole('button', { name: /Alice Beta/ });
        const gammaBtn = screen.getByRole('button', { name: /Alice Gamma/ });

        // Defaults to first unresolved pair: s2 (A) and s3 (B)
        expect(alphaBtn).toHaveAttribute('aria-pressed', 'false');
        expect(betaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(gammaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(within(betaBtn).getByText('A')).toBeInTheDocument();
        expect(within(gammaBtn).getByText('B')).toBeInTheDocument();

        // Deselect Gamma → only 1 profile selected → Review & merge disabled
        fireEvent.click(gammaBtn);
        expect(gammaBtn).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /Review & merge/i })).toBeDisabled();
        expect(screen.getByText(/Select 2 profiles above to enable Review & merge/i)).toBeInTheDocument();

        // Select Alpha → Beta (A) and Alpha (B) selected, and previously ignored warning shown
        fireEvent.click(alphaBtn);
        expect(betaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(alphaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(within(betaBtn).getByText('A')).toBeInTheDocument();
        expect(within(alphaBtn).getByText('B')).toBeInTheDocument();
        expect(screen.getByText(/previously marked as not duplicates/i)).toBeInTheDocument();

        // Select Gamma while 2 are already selected → shifts selection to Alpha (A) and Gamma (B)
        fireEvent.click(gammaBtn);
        expect(alphaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(gammaBtn).toHaveAttribute('aria-pressed', 'true');
        expect(betaBtn).toHaveAttribute('aria-pressed', 'false');
        expect(within(alphaBtn).getByText('A')).toBeInTheDocument();
        expect(within(gammaBtn).getByText('B')).toBeInTheDocument();

        // Open merge modal with the chosen A / B profiles
        const mergeBtn = screen.getByRole('button', { name: /Review & merge/i });
        expect(mergeBtn).toBeEnabled();
        fireEvent.click(mergeBtn);

        const dialog = screen.getByRole('dialog', { name: 'Mock merge modal' });
        expect(within(dialog).getByTestId('merge-student-a')).toHaveTextContent('s1:Alice Alpha');
        expect(within(dialog).getByTestId('merge-student-b')).toHaveTextContent('s3:Alice Gamma');
    });

    it('expands collapsible Ignored pairs and calls restoreNonDuplicatePair + re-scans on Restore', async () => {
        const s1 = makeStudent({ id: 's1', first_name: 'Nora', last_name: 'Keane', email: 'nora1@example.com' });
        const s2 = makeStudent({ id: 's2', first_name: 'Nora', last_name: 'Keane-Byrne', email: 'nora2@example.com' });

        vi.mocked(scanDuplicateStudents)
            .mockResolvedValueOnce({
                totalStudents: 10,
                exactEmailGroups: [],
                potentialMatches: [],
                ignoredPairs: [
                    {
                        pairKey: makePairKey(s1.id, s2.id),
                        studentAId: s1.id,
                        studentBId: s2.id,
                        studentA: s1,
                        studentB: s2,
                        createdAt: '2026-03-01T12:00:00Z',
                    },
                ],
                nonDupKeys: new Set([makePairKey(s1.id, s2.id)]),
            })
            .mockResolvedValueOnce({
                totalStudents: 10,
                exactEmailGroups: [],
                potentialMatches: [],
                ignoredPairs: [],
                nonDupKeys: new Set(),
            });

        render(<DuplicateProfilesPanel />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Scan for duplicates' })[0]);

        const ignoredToggle = await screen.findByRole('button', { name: /Ignored pairs \(Not Duplicates\)/i });
        expect(ignoredToggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();

        fireEvent.click(ignoredToggle);
        expect(ignoredToggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Nora Keane')).toBeInTheDocument();
        expect(screen.getByText('Nora Keane-Byrne')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

        await waitFor(() => {
            expect(restoreNonDuplicatePair).toHaveBeenCalledWith('s1', 's2');
        });
        await waitFor(() => {
            expect(scanDuplicateStudents).toHaveBeenCalledTimes(2);
        });
    });
});
