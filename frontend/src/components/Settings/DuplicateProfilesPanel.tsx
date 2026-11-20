import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeftRight,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    EyeOff,
    GitMerge,
    Info,
    Loader2,
    Mail,
    MapPin,
    Phone,
    RefreshCw,
    RotateCcw,
    Search,
    Users,
} from 'lucide-react';
import {
    makePairKey,
    markPairAsNonDuplicates,
    markStudentsAsNonDuplicates,
    restoreNonDuplicatePair,
    scanDuplicateStudents,
    type DuplicateEmailGroup,
    type DuplicateScanResult,
    type IgnoredDuplicatePair,
    type PotentialDuplicateMatch,
} from '../../lib/duplicates';
import type { Student } from '../../lib/types';
import { formatDisplayDate } from '../../lib/dateUtils';
import { errorMessage } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { useDialogMount, useLastPresent } from '../../hooks/usePresence';
import MergeModal from '../MergeModal';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState } from '../ui/States';
import { calloutCls, panelCls, toneChipCls, type Tone } from '../ui/styles';

export interface DuplicateProfilesPanelProps {
    onIssuesCountChange?: (count: number | undefined) => void;
}

function studentFullName(student: Student): string {
    return `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || 'Unnamed student';
}

function SummaryStat({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string;
    value: number;
    icon: typeof Users;
    tone: Tone;
}) {
    return (
        <div className={`${panelCls} px-3.5 py-3 flex items-center gap-3 min-w-0`}>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toneChipCls[tone]}`}>
                <Icon size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-lg leading-tight font-bold text-primary tabular-nums">{value.toLocaleString()}</p>
                <p className="text-xs text-muted truncate">{label}</p>
            </div>
        </div>
    );
}

function EmailDuplicateGroupCard({
    group,
    nonDupKeys,
    busy,
    disabled,
    onMarkNotDuplicates,
    onReviewMerge,
}: {
    group: DuplicateEmailGroup;
    nonDupKeys: Set<string>;
    busy: boolean;
    disabled: boolean;
    onMarkNotDuplicates: (group: DuplicateEmailGroup) => void;
    onReviewMerge: (studentA: Student, studentB: Student) => void;
}) {
    const isMulti = group.students.length >= 3;
    const defaultPair = group.unresolvedPairs[0] ?? [group.students[0], group.students[1]];
    const defaultAId = defaultPair?.[0]?.id;
    const defaultBId = defaultPair?.[1]?.id;

    const [selectedIds, setSelectedIds] = useState<string[]>(() =>
        defaultAId && defaultBId ? [defaultAId, defaultBId] : [],
    );

    useEffect(() => {
        if (defaultAId && defaultBId) {
            setSelectedIds([defaultAId, defaultBId]);
        }
    }, [defaultAId, defaultBId]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(item => item !== id);
            if (prev.length < 2) return [...prev, id];
            return [prev[1], id];
        });
    };

    const studentById = new Map(group.students.map(s => [s.id, s]));
    const selectedA = isMulti
        ? (selectedIds[0] ? studentById.get(selectedIds[0]) : undefined)
        : defaultPair?.[0];
    const selectedB = isMulti
        ? (selectedIds[1] ? studentById.get(selectedIds[1]) : undefined)
        : defaultPair?.[1];
    const canMerge = Boolean(selectedA && selectedB && selectedA.id !== selectedB.id);
    const selectedPairAlreadyIgnored = Boolean(
        isMulti && selectedA && selectedB && nonDupKeys.has(makePairKey(selectedA.id, selectedB.id)),
    );

    const orderedTwoStudents = !isMulti && defaultPair ? [defaultPair[0], defaultPair[1]] : group.students;

    return (
        <div className="p-4 space-y-3 hover:bg-surface-elevated/30 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Badge tone="brand" className="font-mono max-w-full truncate">
                        {group.key}
                    </Badge>
                    <Badge tone={isMulti ? 'warning' : 'neutral'} shape="pill" className="tabular-nums">
                        {group.students.length} profiles
                    </Badge>
                    {isMulti && (
                        <span className="text-xs text-muted">
                            Select any 2 profiles to merge ({group.unresolvedPairs.length} unresolved{' '}
                            {group.unresolvedPairs.length === 1 ? 'pair' : 'pairs'})
                        </span>
                    )}
                </div>

                <div className="flex items-center flex-wrap gap-2 shrink-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={busy}
                        disabled={disabled}
                        title={
                            isMulti
                                ? 'Mark all profiles in this email group as separate people'
                                : 'Mark these profiles as separate people'
                        }
                        onClick={() => onMarkNotDuplicates(group)}
                    >
                        {!busy && <Check size={13} />}
                        Not duplicates
                    </Button>
                    <Button
                        variant="brand-soft"
                        size="sm"
                        disabled={disabled || !canMerge}
                        title={canMerge ? 'Compare and merge selected profiles' : 'Select 2 profiles to review and merge'}
                        onClick={() => {
                            if (selectedA && selectedB) onReviewMerge(selectedA, selectedB);
                        }}
                    >
                        <GitMerge size={13} />
                        Review &amp; merge
                    </Button>
                </div>
            </div>

            {isMulti ? (
                <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {group.students.map(student => {
                            const slotIndex = selectedIds.indexOf(student.id);
                            const isSelected = slotIndex !== -1;
                            const slotLabel = slotIndex === 0 ? 'A' : slotIndex === 1 ? 'B' : null;
                            return (
                                <button
                                    key={student.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => toggleSelect(student.id)}
                                    className={`text-left p-3 rounded-xl border transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                        isSelected
                                            ? 'border-brand-500 bg-brand-500/[0.06] ring-1 ring-brand-500/30'
                                            : 'border-border-subtle bg-surface hover:border-border-strong'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-xs font-semibold text-primary leading-snug break-words">
                                            {studentFullName(student)}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className={`w-5 h-5 rounded-md text-[11px] font-bold inline-flex items-center justify-center shrink-0 transition-colors ${
                                                isSelected
                                                    ? 'bg-brand-500 text-white'
                                                    : 'border border-border-strong bg-surface-elevated text-transparent'
                                            }`}
                                        >
                                            {slotLabel ?? '·'}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 space-y-0.5 text-xs text-muted">
                                        {student.phone && (
                                            <p className="flex items-center gap-1.5 truncate">
                                                <Phone size={11} className="shrink-0" aria-hidden="true" />
                                                <span className="truncate">{student.phone}</span>
                                            </p>
                                        )}
                                        {student.dob && (
                                            <p className="flex items-center gap-1.5 truncate">
                                                <Calendar size={11} className="shrink-0" aria-hidden="true" />
                                                <span>DOB {formatDisplayDate(student.dob) || student.dob}</span>
                                            </p>
                                        )}
                                        {student.address && (
                                            <p className="flex items-center gap-1.5 truncate">
                                                <MapPin size={11} className="shrink-0" aria-hidden="true" />
                                                <span className="truncate">{student.address}</span>
                                            </p>
                                        )}
                                        {student.created_at && (
                                            <p className="text-[11px] text-muted/80 pt-0.5">
                                                Added {formatDisplayDate(student.created_at)}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {!canMerge && (
                        <p className="text-xs text-muted">Select 2 profiles above to enable Review &amp; merge.</p>
                    )}
                    {selectedPairAlreadyIgnored && (
                        <p className="text-xs text-status-requested flex items-center gap-1.5">
                            <Info size={12} className="shrink-0" aria-hidden="true" />
                            <span>This specific pair was previously marked as not duplicates, but you can still review &amp; merge them.</span>
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {orderedTwoStudents.map((student, idx) => (
                        <div key={student.id} className={`${panelCls} p-3 space-y-1.5`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-primary truncate">{studentFullName(student)}</span>
                                <Badge tone={idx === 0 ? 'neutral' : 'brand'} shape="pill">
                                    {idx === 0 ? 'Older' : 'Newer'}
                                </Badge>
                            </div>
                            <div className="space-y-0.5 text-xs text-muted">
                                {student.phone && (
                                    <p className="flex items-center gap-1.5 truncate">
                                        <Phone size={11} className="shrink-0" aria-hidden="true" />
                                        <span className="truncate">{student.phone}</span>
                                    </p>
                                )}
                                {student.dob && (
                                    <p className="flex items-center gap-1.5 truncate">
                                        <Calendar size={11} className="shrink-0" aria-hidden="true" />
                                        <span>DOB {formatDisplayDate(student.dob) || student.dob}</span>
                                    </p>
                                )}
                                {student.address && (
                                    <p className="flex items-center gap-1.5 truncate">
                                        <MapPin size={11} className="shrink-0" aria-hidden="true" />
                                        <span className="truncate">{student.address}</span>
                                    </p>
                                )}
                                {student.created_at && (
                                    <p className="text-[11px] text-muted/80 pt-0.5">
                                        Added {formatDisplayDate(student.created_at)}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function PotentialMatchCard({
    match,
    busy,
    disabled,
    onMarkNotDuplicates,
    onReviewMerge,
}: {
    match: PotentialDuplicateMatch;
    busy: boolean;
    disabled: boolean;
    onMarkNotDuplicates: (match: PotentialDuplicateMatch) => void;
    onReviewMerge: (studentA: Student, studentB: Student) => void;
}) {
    const hasSamePhone = match.reason.includes('Same Phone');
    const hasSameDob = match.reason.includes('Same DOB');
    const diffSet = new Set(match.diffs);

    const diffCls = (field: string) =>
        diffSet.has(field)
            ? 'bg-warning/10 border border-warning/25 text-primary font-medium rounded-md px-1.5 py-0.5 -mx-1.5'
            : '';

    return (
        <div className="p-4 space-y-3 hover:bg-surface-elevated/30 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    {hasSamePhone && (
                        <Badge tone="info" icon={<Phone size={11} aria-hidden="true" />}>
                            Same Phone
                        </Badge>
                    )}
                    {hasSameDob && (
                        <Badge tone="info" icon={<Calendar size={11} aria-hidden="true" />}>
                            Same DOB
                        </Badge>
                    )}
                    {!hasSamePhone && !hasSameDob && <Badge tone="info">{match.reason}</Badge>}
                    {match.diffs.length > 0 && (
                        <Badge tone="warning">
                            Different {match.diffs.join(', ')}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center flex-wrap gap-2 shrink-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={busy}
                        disabled={disabled}
                        onClick={() => onMarkNotDuplicates(match)}
                    >
                        {!busy && <Check size={13} />}
                        Not duplicates
                    </Button>
                    <Button
                        variant="brand-soft"
                        size="sm"
                        disabled={disabled}
                        onClick={() => onReviewMerge(match.studentA, match.studentB)}
                    >
                        <GitMerge size={13} />
                        Review &amp; merge
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {(
                    [
                        { label: 'Older profile', tone: 'neutral' as const, student: match.studentA },
                        { label: 'Newer profile', tone: 'brand' as const, student: match.studentB },
                    ] as const
                ).map(({ label, tone, student }) => (
                    <div key={student.id} className={`${panelCls} p-3 space-y-1.5`}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-primary truncate">{studentFullName(student)}</span>
                            <Badge tone={tone} shape="pill">
                                {label}
                            </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted">
                            <p className={`flex items-center gap-1.5 min-w-0 ${diffCls('email')}`}>
                                <Mail size={11} className="shrink-0 text-muted" aria-hidden="true" />
                                <span className="truncate">{student.email || <span className="italic opacity-70">No email</span>}</span>
                            </p>
                            <p className={`flex items-center gap-1.5 min-w-0 ${diffCls('phone')}`}>
                                <Phone size={11} className="shrink-0 text-muted" aria-hidden="true" />
                                <span className="truncate">{student.phone || <span className="italic opacity-70">No phone</span>}</span>
                            </p>
                            {(student.address || diffSet.has('address')) && (
                                <p className={`flex items-center gap-1.5 min-w-0 ${diffCls('address')}`}>
                                    <MapPin size={11} className="shrink-0 text-muted" aria-hidden="true" />
                                    <span className="truncate">{student.address || <span className="italic opacity-70">No address</span>}</span>
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11px] text-muted/80">
                                {student.dob && <span>DOB {formatDisplayDate(student.dob) || student.dob}</span>}
                                {student.created_at && <span>Added {formatDisplayDate(student.created_at)}</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Data & Hygiene → Duplicate Profiles: full-table paginated duplicate detector,
 * side-by-side comparison, 3+ email group pair picker, merge modal launcher,
 * and reversible "Ignored pairs" management.
 */
export default function DuplicateProfilesPanel({ onIssuesCountChange }: DuplicateProfilesPanelProps) {
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<DuplicateScanResult | null>(null);
    const [scanError, setScanError] = useState<unknown>(null);
    const [markingKey, setMarkingKey] = useState<string | null>(null);
    const [restoringKey, setRestoringKey] = useState<string | null>(null);
    const [showIgnored, setShowIgnored] = useState(false);

    const [selectedStudentForMerge, setSelectedStudentForMerge] = useState<Student | null>(null);
    const [targetStudentForMerge, setTargetStudentForMerge] = useState<Student | null>(null);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);

    const mergeMount = useDialogMount(mergeModalOpen && !!selectedStudentForMerge);
    const mergeStudent = useLastPresent(selectedStudentForMerge);
    const mergeTarget = useLastPresent(targetStudentForMerge);

    const onIssuesCountChangeRef = useRef(onIssuesCountChange);
    useEffect(() => {
        onIssuesCountChangeRef.current = onIssuesCountChange;
    }, [onIssuesCountChange]);

    const runScan = useCallback(async () => {
        setScanning(true);
        setScanError(null);
        try {
            const scanResult = await scanDuplicateStudents();
            setResult(scanResult);
            onIssuesCountChangeRef.current?.(scanResult.exactEmailGroups.length + scanResult.potentialMatches.length);
        } catch (err) {
            setResult(null);
            setScanError(err);
            onIssuesCountChangeRef.current?.(undefined);
        } finally {
            setScanning(false);
        }
    }, []);

    const handleMarkGroupNotDuplicates = async (group: DuplicateEmailGroup) => {
        setMarkingKey(group.key);
        try {
            await markStudentsAsNonDuplicates(group.students.map(s => s.id));
            toast.success(`Marked ${group.key} profiles as not duplicates`);
            await runScan();
        } catch (err) {
            toast.error(errorMessage(err, 'Could not mark profiles as non-duplicates'));
        } finally {
            setMarkingKey(null);
        }
    };

    const handleMarkPairNotDuplicates = async (match: PotentialDuplicateMatch) => {
        setMarkingKey(match.pairKey);
        try {
            await markPairAsNonDuplicates(match.studentA.id, match.studentB.id);
            toast.success('Marked pair as not duplicates');
            await runScan();
        } catch (err) {
            toast.error(errorMessage(err, 'Could not mark pair as non-duplicates'));
        } finally {
            setMarkingKey(null);
        }
    };

    const handleRestoreIgnored = async (pair: IgnoredDuplicatePair) => {
        setRestoringKey(pair.pairKey);
        try {
            await restoreNonDuplicatePair(pair.studentAId, pair.studentBId);
            toast.success('Pair restored to duplicate checks');
            await runScan();
        } catch (err) {
            toast.error(errorMessage(err, 'Could not restore pair'));
        } finally {
            setRestoringKey(null);
        }
    };

    const openMerge = (studentA: Student, studentB: Student) => {
        setSelectedStudentForMerge(studentA);
        setTargetStudentForMerge(studentB);
        setMergeModalOpen(true);
    };

    const hasScanned = result !== null;
    const totalIssues = result ? result.exactEmailGroups.length + result.potentialMatches.length : 0;
    const busyGlobal = scanning || markingKey !== null || restoringKey !== null;

    return (
        <Card
            id="settings-duplicates"
            className="scroll-mt-20"
            title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>Duplicate student profiles</span>
                    {hasScanned && !scanError && (
                        <Badge tone={totalIssues > 0 ? 'warning' : 'success'} shape="pill" className="tabular-nums">
                            {totalIssues > 0 ? `${totalIssues} to review` : 'All clean'}
                        </Badge>
                    )}
                </span>
            }
            subtitle="Scan all student profiles for shared emails or similar names with matching phone or date of birth."
            icon={GitMerge}
            tone="warning"
            divided
            action={
                <Button
                    variant={hasScanned ? 'secondary' : 'primary'}
                    size="sm"
                    loading={scanning}
                    disabled={busyGlobal}
                    onClick={() => void runScan()}
                >
                    {!scanning && (hasScanned ? <RefreshCw size={14} /> : <Search size={14} />)}
                    {hasScanned ? 'Scan again' : 'Scan for duplicates'}
                </Button>
            }
        >
            <div className="space-y-5">
                {scanning && (
                    <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-muted animate-fadeIn">
                        <Loader2 size={24} className="animate-spin text-brand-500" />
                        <p className="text-xs font-medium">Scanning all student profiles…</p>
                    </div>
                )}

                {!scanning && Boolean(scanError) && (
                    <ErrorState
                        title="Could not scan student profiles"
                        error={scanError}
                        onRetry={() => void runScan()}
                    />
                )}

                {!scanning && !scanError && !hasScanned && (
                    <EmptyState
                        bare
                        className="py-8!"
                        icon={<GitMerge size={20} />}
                        title="No scan run yet"
                        description="Check every student record for shared email addresses or potential profile updates with the same phone number or date of birth."
                        action={
                            <Button variant="primary" onClick={() => void runScan()}>
                                <Search size={14} />
                                Scan for duplicates
                            </Button>
                        }
                    />
                )}

                {!scanning && !scanError && result && (
                    <>
                        {/* 4-stat scan summary strip */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                            <SummaryStat
                                label="Profiles scanned"
                                value={result.totalStudents}
                                icon={Users}
                                tone="brand"
                            />
                            <SummaryStat
                                label="Shared email groups"
                                value={result.exactEmailGroups.length}
                                icon={Mail}
                                tone={result.exactEmailGroups.length > 0 ? 'warning' : 'success'}
                            />
                            <SummaryStat
                                label="Potential matches"
                                value={result.potentialMatches.length}
                                icon={GitMerge}
                                tone={result.potentialMatches.length > 0 ? 'info' : 'success'}
                            />
                            <SummaryStat
                                label="Ignored pairs"
                                value={result.ignoredPairs.length}
                                icon={EyeOff}
                                tone="neutral"
                            />
                        </div>

                        {/* Clean state when 0 unresolved issues */}
                        {result.exactEmailGroups.length === 0 && result.potentialMatches.length === 0 && (
                            <div className={`${calloutCls.success} flex items-center gap-2.5 p-3.5 text-xs font-semibold`}>
                                <CheckCircle2 size={16} className="text-status-confirmed shrink-0" aria-hidden="true" />
                                <span>
                                    No duplicates or profile updates found across {result.totalStudents.toLocaleString()} profiles — everything is clean.
                                </span>
                            </div>
                        )}

                        {/* Exact Email Groups */}
                        {result.exactEmailGroups.length > 0 && (
                            <section className="space-y-3" aria-label="Shared email duplicate groups">
                                <div className={`${calloutCls.warning} flex items-center gap-2 p-3 text-xs font-medium`}>
                                    <AlertTriangle size={14} className="shrink-0 text-status-requested" aria-hidden="true" />
                                    <span>
                                        Found {result.exactEmailGroups.length}{' '}
                                        {result.exactEmailGroups.length === 1 ? 'group' : 'groups'} of students sharing the same email address.
                                    </span>
                                </div>
                                <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden bg-surface">
                                    {result.exactEmailGroups.map(group => (
                                        <EmailDuplicateGroupCard
                                            key={group.key}
                                            group={group}
                                            nonDupKeys={result.nonDupKeys}
                                            busy={markingKey === group.key}
                                            disabled={busyGlobal}
                                            onMarkNotDuplicates={handleMarkGroupNotDuplicates}
                                            onReviewMerge={openMerge}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Potential Profile Updates */}
                        {result.potentialMatches.length > 0 && (
                            <section className="space-y-3" aria-label="Potential profile update matches">
                                <div className={`${calloutCls.info} flex items-center gap-2 p-3 text-xs font-medium`}>
                                    <Info size={14} className="shrink-0 text-status-invited" aria-hidden="true" />
                                    <span>
                                        Found {result.potentialMatches.length} potential profile{' '}
                                        {result.potentialMatches.length === 1 ? 'update' : 'updates'} (similar name with the same phone number or date of birth).
                                    </span>
                                </div>
                                <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden bg-surface">
                                    {result.potentialMatches.map(match => (
                                        <PotentialMatchCard
                                            key={match.pairKey}
                                            match={match}
                                            busy={markingKey === match.pairKey}
                                            disabled={busyGlobal}
                                            onMarkNotDuplicates={handleMarkPairNotDuplicates}
                                            onReviewMerge={openMerge}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Collapsible Ignored Pairs (Not Duplicates) */}
                        {result.ignoredPairs.length > 0 && (
                            <div className="rounded-xl border border-border-subtle overflow-hidden bg-surface">
                                <button
                                    type="button"
                                    aria-expanded={showIgnored}
                                    onClick={() => setShowIgnored(v => !v)}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-surface-elevated/40 hover:bg-surface-elevated/70 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                        <EyeOff size={14} className="text-muted shrink-0" aria-hidden="true" />
                                        <span className="text-xs font-semibold text-primary">
                                            Ignored pairs (Not Duplicates)
                                        </span>
                                        <Badge tone="neutral" shape="pill" className="tabular-nums">
                                            Ignored pairs · {result.ignoredPairs.length}
                                        </Badge>
                                    </div>
                                    <ChevronDown
                                        size={15}
                                        aria-hidden="true"
                                        className={`text-muted shrink-0 transition-transform duration-200 ${showIgnored ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {showIgnored && (
                                    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                                        {result.ignoredPairs.map(pair => {
                                            const nameA = pair.studentA ? studentFullName(pair.studentA) : pair.studentAId;
                                            const nameB = pair.studentB ? studentFullName(pair.studentB) : pair.studentBId;
                                            const restoring = restoringKey === pair.pairKey;
                                            return (
                                                <li
                                                    key={pair.pairKey}
                                                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-elevated/30 transition-colors"
                                                >
                                                    <div className="min-w-0 space-y-1">
                                                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                                            <span className="font-semibold text-primary">{nameA}</span>
                                                            {pair.studentA?.email && (
                                                                <span className="text-muted">({pair.studentA.email})</span>
                                                            )}
                                                            <ArrowLeftRight size={12} className="text-muted shrink-0 mx-0.5" aria-hidden="true" />
                                                            <span className="font-semibold text-primary">{nameB}</span>
                                                            {pair.studentB?.email && (
                                                                <span className="text-muted">({pair.studentB.email})</span>
                                                            )}
                                                        </div>
                                                        {pair.createdAt && (
                                                            <p className="text-[11px] text-muted">
                                                                Marked not duplicates on {formatDisplayDate(pair.createdAt)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        size="xs"
                                                        loading={restoring}
                                                        disabled={busyGlobal}
                                                        onClick={() => void handleRestoreIgnored(pair)}
                                                        className="self-start sm:self-center shrink-0"
                                                    >
                                                        {!restoring && <RotateCcw size={12} />}
                                                        Restore
                                                    </Button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {mergeMount.mounted && mergeStudent && (
                <MergeModal
                    key={mergeMount.key}
                    open={mergeModalOpen && !!selectedStudentForMerge}
                    student={mergeStudent}
                    initialTargetStudent={mergeTarget ?? null}
                    onClose={() => {
                        setMergeModalOpen(false);
                        setSelectedStudentForMerge(null);
                        setTargetStudentForMerge(null);
                    }}
                    onSuccess={() => {
                        void runScan();
                    }}
                />
            )}
        </Card>
    );
}
