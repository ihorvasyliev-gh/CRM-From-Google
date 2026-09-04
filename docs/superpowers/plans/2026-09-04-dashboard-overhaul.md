# Dashboard Overhaul & Mobile-First Operational Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Course CRM Dashboard into a high-productivity, mobile-first Operational Command Center with instant registration link access, expired invites monitoring, upcoming date cohorts, compact activity feed, and responsive desktop layout.

**Architecture:** Decompose monolithic `Dashboard.tsx` into modular subcomponents in `frontend/src/components/Dashboard/`. Extract pure business logic (expired invites calculation, cohort date slicing, activity grouping) into `dashboardUtils.ts` with unit tests. Assemble a fluid mobile vertical stream and a 12-column desktop grid.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack React Query, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-dashboard-overhaul-design.md`

## Global Constraints
- Reuse global TanStack Query cache `['enrollments']` and `['dashboard_stats']` (no redundant network calls).
- Mobile-first layout with min 44×44px touch targets and `safe-area-inset` support.
- Registration link: `https://forms.gle/9U4DsSe5UYnsakJZ8`.
- Focus attention section strictly on expired and expiring (<48h) invites.
- 0 TypeScript errors (`npx tsc --noEmit`) and 100% passing tests (`npm test`).

---

### Task 1: Pure Utilities for Expired Invites & Upcoming Cohorts

**Files:**
- Create: `frontend/src/components/Dashboard/dashboardUtils.ts`
- Test: `frontend/src/components/Dashboard/dashboardUtils.test.ts`

**Interfaces:**
- Produces:
  - `calculateExpiredInvites(enrollments: any[], nowMs?: number): ExpiredInviteItem[]`
  - `groupUpcomingCohorts(enrollments: any[], todayIso?: string): UpcomingCohortItem[]`
  - Types: `ExpiredInviteItem`, `UpcomingCohortItem`

- [ ] **Step 1: Write the failing unit tests**

```ts
// frontend/src/components/Dashboard/dashboardUtils.test.ts
import { describe, it, expect } from 'vitest';
import { calculateExpiredInvites, groupUpcomingCohorts } from './dashboardUtils';

describe('dashboardUtils - calculateExpiredInvites', () => {
    it('correctly identifies expired and expiring (<48h) invites and sorts by overdue urgency', () => {
        const now = new Date('2026-09-04T12:00:00Z').getTime();
        const enrollments = [
            {
                id: '1',
                student_id: 's1',
                course_id: 'c1',
                status: 'invited',
                invited_at: '2026-08-25T12:00:00Z', // 10 days ago, 7-day limit -> expired 3 days ago
                response_days: 7,
                students: { first_name: 'Alice', last_name: 'Cooper' },
                courses: { name: 'Manual Handling' },
            },
            {
                id: '2',
                student_id: 's2',
                course_id: 'c2',
                status: 'invited',
                invited_at: '2026-08-29T00:00:00Z', // 6.5 days ago -> ~12h remaining (<48h)
                response_days: 7,
                students: { first_name: 'Bob', last_name: 'Marley' },
                courses: { name: 'SafePass' },
            },
            {
                id: '3',
                student_id: 's3',
                course_id: 'c1',
                status: 'invited',
                invited_at: '2026-09-03T12:00:00Z', // 1 day ago -> 6 days remaining (NOT urgent)
                response_days: 7,
                students: { first_name: 'Charlie', last_name: 'Brown' },
                courses: { name: 'Manual Handling' },
            },
            {
                id: '4',
                student_id: 's4',
                course_id: 'c1',
                status: 'confirmed',
                invited_at: '2026-08-20T12:00:00Z',
                response_days: 7,
            },
        ];

        const urgent = calculateExpiredInvites(enrollments, now);
        expect(urgent).toHaveLength(2);
        // Alice is expired by 3 days -> most urgent, should be first
        expect(urgent[0].id).toBe('1');
        expect(urgent[0].isExpired).toBe(true);
        expect(urgent[0].studentName).toBe('Alice Cooper');

        // Bob has ~12h left -> urgent, second
        expect(urgent[1].id).toBe('2');
        expect(urgent[1].isExpired).toBe(false);
        expect(urgent[1].studentName).toBe('Bob Marley');
    });
});

describe('dashboardUtils - groupUpcomingCohorts', () => {
    it('groups confirmed enrollments by upcoming confirmed_date and course', () => {
        const enrollments = [
            {
                id: 'e1',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
            {
                id: 'e2',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
            {
                id: 'e3',
                course_id: 'c2',
                status: 'confirmed',
                confirmed_date: '2026-09-15',
                courses: { name: 'Manual Handling' },
            },
            {
                id: 'e4',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-01', // past date
                courses: { name: 'SafePass' },
            },
            {
                id: 'e5',
                course_id: 'c1',
                status: 'requested', // not confirmed
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
        ];

        const cohorts = groupUpcomingCohorts(enrollments, '2026-09-04');
        expect(cohorts).toHaveLength(2);
        expect(cohorts[0]).toEqual({
            date: '2026-09-10',
            courseId: 'c1',
            courseName: 'SafePass',
            confirmedCount: 2,
        });
        expect(cohorts[1]).toEqual({
            date: '2026-09-15',
            courseId: 'c2',
            courseName: 'Manual Handling',
            confirmedCount: 1,
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/dashboardUtils.test.ts --run` in `frontend/`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation in `dashboardUtils.ts`**

```ts
// frontend/src/components/Dashboard/dashboardUtils.ts

export interface ExpiredInviteItem {
    id: string;
    studentId: string;
    studentName: string;
    courseId: string;
    courseName: string;
    invitedAt: string;
    deadlineMs: number;
    hoursRemaining: number;
    isExpired: boolean;
    timeLabel: string;
}

export interface UpcomingCohortItem {
    date: string;
    courseId: string;
    courseName: string;
    confirmedCount: number;
}

export function calculateExpiredInvites(enrollments: any[], nowMs: number = Date.now()): ExpiredInviteItem[] {
    const items: ExpiredInviteItem[] = [];

    for (const en of enrollments) {
        if (en.status !== 'invited' || !en.invited_at) continue;

        const invitedTime = new Date(en.invited_at).getTime();
        if (isNaN(invitedTime)) continue;

        const days = en.response_days ?? 7;
        const deadlineMs = invitedTime + days * 24 * 60 * 60 * 1000;
        const diffMs = deadlineMs - nowMs;
        const hoursRemaining = diffMs / (1000 * 60 * 60);

        // Include if already expired (hoursRemaining < 0) or <= 48h remaining
        if (hoursRemaining <= 48) {
            const isExpired = hoursRemaining <= 0;
            let timeLabel = '';
            if (isExpired) {
                const daysOverdue = Math.floor(Math.abs(hoursRemaining) / 24);
                timeLabel = daysOverdue === 0 ? 'Expired today' : `Expired ${daysOverdue}d ago`;
            } else {
                const hrs = Math.ceil(hoursRemaining);
                timeLabel = hrs <= 24 ? `${hrs}h left` : `${Math.ceil(hrs / 24)}d left`;
            }

            const studentName = [en.students?.first_name, en.students?.last_name].filter(Boolean).join(' ') || 'Unknown Student';

            items.push({
                id: en.id,
                studentId: en.student_id || en.id,
                studentName,
                courseId: en.course_id,
                courseName: en.courses?.name || 'Unknown Course',
                invitedAt: en.invited_at,
                deadlineMs,
                hoursRemaining,
                isExpired,
                timeLabel,
            });
        }
    }

    return items.sort((a, b) => a.deadlineMs - b.deadlineMs);
}

export function groupUpcomingCohorts(enrollments: any[], todayIso: string = new Date().toISOString().split('T')[0]): UpcomingCohortItem[] {
    const cohortMap = new Map<string, UpcomingCohortItem>();

    for (const en of enrollments) {
        if (en.status !== 'confirmed' || !en.confirmed_date) continue;
        const dateKey = en.confirmed_date.split('T')[0];
        if (dateKey < todayIso) continue;

        const key = `${dateKey}:::${en.course_id}`;
        const existing = cohortMap.get(key);
        if (existing) {
            existing.confirmedCount++;
        } else {
            cohortMap.set(key, {
                date: dateKey,
                courseId: en.course_id,
                courseName: en.courses?.name || 'Unknown Course',
                confirmedCount: 1,
            });
        }
    }

    return Array.from(cohortMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 12);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/dashboardUtils.test.ts --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/dashboardUtils.ts frontend/src/components/Dashboard/dashboardUtils.test.ts
git commit -m "feat(dashboard): add pure utilities for expired invites and upcoming cohorts calculation"
```

---

### Task 2: Registration Link Component

**Files:**
- Create: `frontend/src/components/Dashboard/RegistrationLinkCard.tsx`
- Test: `frontend/src/components/Dashboard/RegistrationLinkCard.test.tsx`

**Interfaces:**
- Produces: `export default function RegistrationLinkCard(props: { compact?: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Dashboard/RegistrationLinkCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegistrationLinkCard from './RegistrationLinkCard';

describe('RegistrationLinkCard', () => {
    it('renders the registration form link and handles copy action', async () => {
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });

        render(<RegistrationLinkCard />);
        expect(screen.getByText(/Registration Form/i)).toBeInTheDocument();
        const copyBtn = screen.getByRole('button', { name: /Copy Link/i });
        fireEvent.click(copyBtn);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://forms.gle/9U4DsSe5UYnsakJZ8');
        expect(await screen.findByText(/Copied!/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/RegistrationLinkCard.test.tsx --run` in `frontend/`  
Expected: FAIL

- [ ] **Step 3: Implement `RegistrationLinkCard.tsx`**

```tsx
// frontend/src/components/Dashboard/RegistrationLinkCard.tsx
import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';

export const GOOGLE_FORM_URL = 'https://forms.gle/9U4DsSe5UYnsakJZ8';

interface RegistrationLinkCardProps {
    compact?: boolean;
}

export default function RegistrationLinkCard({ compact = false }: RegistrationLinkCardProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(GOOGLE_FORM_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (compact) {
        return (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/25 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 truncate">
                        📝 Registration Form
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleCopy}
                        aria-label={copied ? 'Copied' : 'Copy Link'}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 ${
                            copied
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                                : 'bg-surface hover:bg-surface-elevated text-brand-600 dark:text-brand-400 border-brand-500/30'
                        }`}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>
                    <a
                        href={GOOGLE_FORM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open registration form"
                        className="p-1.5 rounded-lg text-muted hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
                        title="Open form in new tab"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/10 via-brand-500/5 to-transparent p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-brand-500/15 text-brand-600 dark:text-brand-400 rounded-xl flex-shrink-0">
                    <ExternalLink size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Registration Form</h4>
                    <span className="block text-xs font-mono text-primary truncate">forms.gle/9U4DsSe5UYnsakJZ8</span>
                </div>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl border transition-all duration-300 ${
                        copied
                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                            : 'bg-brand-500 text-white hover:bg-brand-600 border-transparent shadow-xs active:scale-[0.98]'
                    }`}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                    href={GOOGLE_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle rounded-xl transition-all"
                >
                    <ExternalLink size={14} />
                    Open
                </a>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/RegistrationLinkCard.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/RegistrationLinkCard.tsx frontend/src/components/Dashboard/RegistrationLinkCard.test.tsx
git commit -m "feat(dashboard): add RegistrationLinkCard with 1-tap copy and responsive modes"
```

---

### Task 3: Top Operational KPIs Component

**Files:**
- Create: `frontend/src/components/Dashboard/DashboardKPIs.tsx`
- Test: `frontend/src/components/Dashboard/DashboardKPIs.test.tsx`

**Interfaces:**
- Produces: `DashboardKPIs({ stats, statusCounts, onNavigate }: DashboardKPIsProps)`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Dashboard/DashboardKPIs.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardKPIs from './DashboardKPIs';

describe('DashboardKPIs', () => {
    it('renders 4 key operational metrics and triggers navigation on click', () => {
        const mockNavigate = vi.fn();
        render(
            <DashboardKPIs
                stats={{ students: 120, courses: 8, enrollments: 340 }}
                statusCounts={{ requested: 14, invited: 9, confirmed: 28, completed: 80 }}
                onNavigate={mockNavigate}
            />
        );

        expect(screen.getByText('120')).toBeInTheDocument();
        expect(screen.getByText('14')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('28')).toBeInTheDocument();

        // Click Requested card
        const requestedCard = screen.getByText(/Unprocessed/i).closest('button');
        if (requestedCard) fireEvent.click(requestedCard);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'requested' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/DashboardKPIs.test.tsx --run` in `frontend/`  
Expected: FAIL

- [ ] **Step 3: Implement `DashboardKPIs.tsx`**

```tsx
// frontend/src/components/Dashboard/DashboardKPIs.tsx
import { Users, Clock, Send, CheckCircle2 } from 'lucide-react';

interface DashboardKPIsProps {
    stats: { students: number; courses: number; enrollments: number };
    statusCounts: Record<string, number>;
    onNavigate?: (tab: string, filter?: any) => void;
    loading?: boolean;
}

export default function DashboardKPIs({ stats, statusCounts, onNavigate, loading = false }: DashboardKPIsProps) {
    const kpis = [
        {
            key: 'students',
            label: 'Total Students',
            subLabel: 'Active in CRM',
            value: stats.students,
            icon: Users,
            colorClass: 'text-brand-500 bg-brand-500/10 border-brand-500/20',
            accentGradient: 'from-brand-500 to-brand-600',
            onClick: () => onNavigate?.('students'),
        },
        {
            key: 'requested',
            label: 'New Requests',
            subLabel: 'Awaiting review',
            value: statusCounts['requested'] || 0,
            icon: Clock,
            colorClass: 'text-warning bg-warning/10 border-warning/20',
            accentGradient: 'from-amber-500 to-amber-600',
            onClick: () => onNavigate?.('enrollments', { status: 'requested' }),
        },
        {
            key: 'invited',
            label: 'Pending Invites',
            subLabel: 'Sent to students',
            value: statusCounts['invited'] || 0,
            icon: Send,
            colorClass: 'text-info bg-info/10 border-info/20',
            accentGradient: 'from-sky-500 to-blue-600',
            onClick: () => onNavigate?.('enrollments', { status: 'invited' }),
        },
        {
            key: 'confirmed',
            label: 'Confirmed',
            subLabel: 'Ready for training',
            value: statusCounts['confirmed'] || 0,
            icon: CheckCircle2,
            colorClass: 'text-success bg-success/10 border-success/20',
            accentGradient: 'from-emerald-500 to-teal-600',
            onClick: () => onNavigate?.('enrollments', { status: 'confirmed' }),
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {kpis.map(card => {
                const Icon = card.icon;
                return (
                    <button
                        type="button"
                        key={card.key}
                        onClick={card.onClick}
                        disabled={loading}
                        className="relative overflow-hidden p-3 sm:p-4 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong/60 transition-all duration-300 shadow-xs hover:shadow-md text-left group active:scale-[0.98] cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] sm:text-[11px] font-bold text-muted uppercase tracking-wider truncate">
                                {card.label}
                            </span>
                            <div className={`p-1.5 sm:p-2 rounded-xl border ${card.colorClass} group-hover:scale-110 transition-transform`}>
                                <Icon size={16} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-primary tracking-tight">
                                {loading ? '—' : card.value}
                            </span>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted block truncate mt-0.5">
                            {card.subLabel}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/DashboardKPIs.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/DashboardKPIs.tsx frontend/src/components/Dashboard/DashboardKPIs.test.tsx
git commit -m "feat(dashboard): add DashboardKPIs component with interactive column filters"
```

---

### Task 4: Expired Invites Card Component

**Files:**
- Create: `frontend/src/components/Dashboard/ExpiredInvitesCard.tsx`
- Test: `frontend/src/components/Dashboard/ExpiredInvitesCard.test.tsx`

**Interfaces:**
- Produces: `ExpiredInvitesCard({ items, onNavigate, onOpenStudentDetail }: ExpiredInvitesCardProps)`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Dashboard/ExpiredInvitesCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExpiredInvitesCard from './ExpiredInvitesCard';
import { ExpiredInviteItem } from './dashboardUtils';

describe('ExpiredInvitesCard', () => {
    it('renders empty success state when no expired invites', () => {
        render(<ExpiredInvitesCard items={[]} />);
        expect(screen.getByText(/All invites on track/i)).toBeInTheDocument();
    });

    it('renders list of overdue invites and supports navigation', () => {
        const mockNavigate = vi.fn();
        const items: ExpiredInviteItem[] = [
            {
                id: 'enr-1',
                studentId: 'stu-1',
                studentName: 'John Doe',
                courseId: 'crs-1',
                courseName: 'SafePass',
                invitedAt: '2026-08-20',
                deadlineMs: 123456,
                hoursRemaining: -48,
                isExpired: true,
                timeLabel: 'Expired 2d ago',
            },
        ];

        render(<ExpiredInvitesCard items={items} onNavigate={mockNavigate} />);
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Expired 2d ago')).toBeInTheDocument();

        const itemBtn = screen.getByText('John Doe').closest('button');
        if (itemBtn) fireEvent.click(itemBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'crs-1' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/ExpiredInvitesCard.test.tsx --run` in `frontend/`  
Expected: FAIL

- [ ] **Step 3: Implement `ExpiredInvitesCard.tsx`**

```tsx
// frontend/src/components/Dashboard/ExpiredInvitesCard.tsx
import { AlertCircle, CheckCircle2, ArrowUpRight, Clock } from 'lucide-react';
import { ExpiredInviteItem } from './dashboardUtils';

interface ExpiredInvitesCardProps {
    items: ExpiredInviteItem[];
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
}

export default function ExpiredInvitesCard({ items, onNavigate, onOpenStudentDetail }: ExpiredInvitesCardProps) {
    const hasItems = items.length > 0;

    return (
        <div className={`rounded-2xl border transition-all duration-300 ${
            hasItems
                ? 'bg-surface border-amber-500/30 shadow-card'
                : 'bg-surface/60 border-border-subtle p-3.5 sm:p-4'
        }`}>
            {hasItems ? (
                <div className="p-3.5 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                <AlertCircle size={16} />
                            </span>
                            <div>
                                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Expired Invites</h3>
                                <span className="text-[10px] text-muted">Awaiting response past deadline</span>
                            </div>
                        </div>
                        <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/25">
                            {items.length} overdue
                        </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {items.slice(0, 5).map(item => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-amber-500/30 transition-all text-left group"
                            >
                                <div className="min-w-0 flex-1">
                                    <button
                                        type="button"
                                        onClick={() => onOpenStudentDetail?.(item.studentId)}
                                        className="text-xs font-bold text-primary hover:text-brand-500 hover:underline truncate block"
                                    >
                                        {item.studentName}
                                    </button>
                                    <span className="text-[10px] text-muted truncate block">
                                        {item.courseName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                        item.isExpired
                                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                            : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}>
                                        {item.timeLabel}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.('enrollments', { courseId: item.courseId })}
                                        aria-label={`Open ${item.courseName} board`}
                                        className="p-1 rounded-lg text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                                    >
                                        <ArrowUpRight size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {items.length > 5 && (
                        <button
                            type="button"
                            onClick={() => onNavigate?.('enrollments', { status: 'invited' })}
                            className="mt-2.5 w-full text-center text-[11px] font-bold text-brand-500 hover:underline py-1"
                        >
                            View all {items.length} in Kanban →
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-primary">All invites on track</p>
                        <p className="text-[10px] text-muted">No students currently past their response deadline</p>
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/ExpiredInvitesCard.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/ExpiredInvitesCard.tsx frontend/src/components/Dashboard/ExpiredInvitesCard.test.tsx
git commit -m "feat(dashboard): add ExpiredInvitesCard focusing strictly on overdue response deadlines"
```

---

### Task 5: Upcoming Cohorts by Date Component

**Files:**
- Create: `frontend/src/components/Dashboard/UpcomingCohortsCard.tsx`
- Test: `frontend/src/components/Dashboard/UpcomingCohortsCard.test.tsx`

**Interfaces:**
- Produces: `UpcomingCohortsCard({ cohorts, onNavigate }: UpcomingCohortsCardProps)`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Dashboard/UpcomingCohortsCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpcomingCohortsCard from './UpcomingCohortsCard';

describe('UpcomingCohortsCard', () => {
    it('renders upcoming cohorts grouped by date and triggers filter navigation', () => {
        const mockNavigate = vi.fn();
        const cohorts = [
            {
                date: '2026-09-12',
                courseId: 'c-1',
                courseName: 'Patient Moving and Handling',
                confirmedCount: 9,
            },
        ];

        render(<UpcomingCohortsCard cohorts={cohorts} onNavigate={mockNavigate} />);
        expect(screen.getByText(/Patient Moving and Handling/i)).toBeInTheDocument();
        expect(screen.getByText(/9 confirmed/i)).toBeInTheDocument();

        const cardBtn = screen.getByRole('button', { name: /Patient Moving and Handling/i });
        fireEvent.click(cardBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', {
            courseId: 'c-1',
            courseDate: '2026-09-12',
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/UpcomingCohortsCard.test.tsx --run` in `frontend/`  
Expected: FAIL

- [ ] **Step 3: Implement `UpcomingCohortsCard.tsx`**

```tsx
// frontend/src/components/Dashboard/UpcomingCohortsCard.tsx
import { Calendar, Users, ArrowUpRight } from 'lucide-react';
import { UpcomingCohortItem } from './dashboardUtils';
import { formatDayDateShort } from '../../lib/dateUtils';

interface UpcomingCohortsCardProps {
    cohorts: UpcomingCohortItem[];
    onNavigate?: (tab: string, filter?: any) => void;
}

export default function UpcomingCohortsCard({ cohorts, onNavigate }: UpcomingCohortsCardProps) {
    if (cohorts.length === 0) {
        return (
            <div className="p-4 rounded-2xl bg-surface border border-border-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-muted">
                    <Calendar size={16} />
                    <span className="text-xs">No upcoming course cohorts scheduled</span>
                </div>
                <button
                    type="button"
                    onClick={() => onNavigate?.('enrollments')}
                    className="text-xs font-bold text-brand-500 hover:underline"
                >
                    Open Board →
                </button>
            </div>
        );
    }

    return (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border-subtle shadow-card">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={14} className="text-brand-500" />
                    Upcoming Cohorts by Date
                </h3>
                <span className="text-[11px] text-muted">
                    Next {cohorts.length} dates
                </span>
            </div>

            {/* Mobile horizontal scroll / Desktop grid */}
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {cohorts.map(c => (
                    <button
                        type="button"
                        key={`${c.date}:::${c.courseId}`}
                        onClick={() => onNavigate?.('enrollments', { courseId: c.courseId, courseDate: c.date })}
                        aria-label={`Cohort: ${c.courseName} on ${c.date}, ${c.confirmedCount} confirmed`}
                        className="flex-shrink-0 w-52 sm:w-auto p-2.5 sm:p-3 rounded-xl bg-surface-elevated/50 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 transition-all duration-300 text-left group active:scale-[0.98] shadow-xs cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                                📅 {formatDayDateShort(c.date)}
                            </span>
                            <ArrowUpRight size={13} className="text-muted group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <span className="block text-xs font-semibold text-primary truncate leading-tight mb-1.5" title={c.courseName}>
                            {c.courseName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted">
                            <Users size={12} className="text-emerald-500" />
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                {c.confirmedCount} confirmed
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/UpcomingCohortsCard.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/UpcomingCohortsCard.tsx frontend/src/components/Dashboard/UpcomingCohortsCard.test.tsx
git commit -m "feat(dashboard): add UpcomingCohortsCard grouped by confirmed dates"
```

---

### Task 6: Compact Activity Feed & Status Breakdown Components

**Files:**
- Create: `frontend/src/components/Dashboard/DashboardActivityFeed.tsx`
- Create: `frontend/src/components/Dashboard/StatusBreakdownCard.tsx`
- Test: `frontend/src/components/Dashboard/DashboardActivityFeed.test.tsx`

**Interfaces:**
- Produces: `DashboardActivityFeed`, `StatusBreakdownCard`

- [ ] **Step 1: Write failing test for Activity Feed**

```tsx
// frontend/src/components/Dashboard/DashboardActivityFeed.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardActivityFeed from './DashboardActivityFeed';

describe('DashboardActivityFeed', () => {
    it('renders grouped student activities and filters by status', () => {
        const mockNavigate = vi.fn();
        const mockOpenStudent = vi.fn();

        const groupedActivity = [
            {
                key: 'g1',
                studentName: 'Alice Green',
                studentId: 's1',
                date: '2026-09-04',
                dateLabel: '04 Sep',
                isNew: true,
                enrollments: [
                    { id: 'en1', courseId: 'c1', courseName: 'SafePass', courseVariant: null, status: 'requested' },
                ],
                previousEnrollments: [],
            },
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 1, requested: 1, invited: 0, confirmed: 0, completed: 0 }}
                onNavigate={mockNavigate}
                onOpenStudentDetail={mockOpenStudent}
            />
        );

        expect(screen.getByText('Alice Green')).toBeInTheDocument();
        expect(screen.getByText('SafePass')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Alice Green'));
        expect(mockOpenStudent).toHaveBeenCalledWith('s1');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Dashboard/DashboardActivityFeed.test.tsx --run` in `frontend/`  
Expected: FAIL

- [ ] **Step 3: Implement `DashboardActivityFeed.tsx` and `StatusBreakdownCard.tsx`**

Extract and clean up the timeline feed into `DashboardActivityFeed.tsx`, and the status progress bar and percentages into `StatusBreakdownCard.tsx`. Ensure high density and responsive layout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Dashboard/DashboardActivityFeed.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/DashboardActivityFeed.tsx frontend/src/components/Dashboard/DashboardActivityFeed.test.tsx frontend/src/components/Dashboard/StatusBreakdownCard.tsx
git commit -m "feat(dashboard): extract compact ActivityFeed and StatusBreakdownCard"
```

---

### Task 7: Main Dashboard Assembly & App Integration

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`
- Modify: `frontend/src/App.tsx` (ensure state with `courseDate` passes to EnrollmentBoard)
- Test: `frontend/src/components/Dashboard.test.tsx`

**Interfaces:**
- Connects: `DashboardKPIs`, `RegistrationLinkCard`, `ExpiredInvitesCard`, `UpcomingCohortsCard`, `DashboardActivityFeed`, `StatusBreakdownCard`.

- [ ] **Step 1: Write integration tests in `Dashboard.test.tsx`**

Test that the unified Dashboard renders all sections (KPIs, Registration Link, Expired Invites, Upcoming Cohorts, Activity Feed), handles navigation, and respects both mobile and desktop views.

- [ ] **Step 2: Assemble `Dashboard.tsx`**

Replace the monolithic Dashboard code with the modular orchestration:
1. Mobile layout:
   - Sticky/compact registration form link bar
   - DashboardKPIs (2x2)
   - Quick action buttons
   - ExpiredInvitesCard
   - UpcomingCohortsCard (horizontal swipe)
   - DashboardActivityFeed
2. Desktop layout:
   - Top row: 4 KPI Cards
   - Left 8-cols: Upcoming Cohorts Grid + DashboardActivityFeed
   - Right 4-cols: RegistrationLinkCard + ExpiredInvitesCard + Quick Actions + StatusBreakdownCard

- [ ] **Step 3: Run all Dashboard tests**

Run: `npm test -- src/components/Dashboard.test.tsx --run` in `frontend/`  
Expected: PASS

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit` in `frontend/`  
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.tsx frontend/src/components/Dashboard.test.tsx frontend/src/App.tsx
git commit -m "feat(dashboard): assemble overhauled mobile-first operational command center"
```

---

### Task 8: Full End-to-End Verification

- [ ] **Step 1: Run complete test suite**

Run: `npm test -- --run` in `frontend/`

- [ ] **Step 2: Run build check**

Run: `npm run build` in `frontend/`

- [ ] **Step 3: Verify git status and create walkthrough**
