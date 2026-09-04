# Design Specification: Dashboard Overhaul & Mobile-First Operational Command Center

**Date:** 2026-09-04  
**Status:** Approved by User  
**Scope:** Dashboard UX/UI Architecture, Mobile-First Layout, Operational Metrics, Expired Invites Monitoring, Upcoming Cohorts Slicing, Quick Actions & Registration Link Access.

---

## 1. Executive Summary & Goals

The objective is to redesign the Course CRM Dashboard from a static overview and long activity list into a high-productivity **Operational Command Center**, optimized first for mobile workflows and fully responsive on desktop displays:

1. **Mobile-First Operational Flow:** Provide a unified, fluid vertical scrolling view optimized for one-hand usage with zero dead space, high information density, and rapid thumb access to key daily tasks.
2. **Prominent Registration Link Access:** Provide an instantly accessible widget/chip to copy the registration form link (`forms.gle/9U4DsSe5UYnsakJZ8`) with 1-tap copy feedback and open capabilities.
3. **Actionable Expired Invites Widget:** Focus the attention section strictly on students with expired or expiring response deadlines (`invited_at + response_days`), enabling immediate reminders or status management.
4. **Upcoming Cohorts (Date Slices):** Group confirmed students by upcoming scheduled course dates (`confirmed_date >= today`), providing immediate visibility into cohort readiness and 1-tap navigation to the Kanban board filtered by that date.
5. **Streamlined & Compact Activity Feed:** Maintain the student-day grouping while reducing visual clutter, tightening margins, and optimizing touch targets.
6. **Component Modularity:** Decompose the monolithic `Dashboard.tsx` into clean, testable subcomponents.

---

## 2. Layout & Information Architecture

### 2.1 Mobile View (360px - 767px)
A single structured vertical stream:
1. **Top Bar & Registration Link:** Quick banner with 1-tap "Copy Link" (swaps to green checkmark) and "Open" external link.
2. **KPI Metrics Grid (2×2):**
   - Total Students
   - Unprocessed Requests (`requested`)
   - Pending Invites (`invited`)
   - Confirmed Students (`confirmed`)
   - *Tapping any status KPI routes to the Kanban board filtered to that column.*
3. **Quick Actions Strip:** Horizontal touch chips for `+ Student`, `+ Enroll`, and `Board`.
4. **Expired Invites Card (Attention):**
   - If expired invites exist: Amber/Rose alert badge with count, list of affected students with time delta (e.g. "Expired 2d ago" / "14h left"), and 1-tap jump to the Kanban card.
   - If no expired invites: Subtle success state ("All invites on track").
5. **Upcoming Cohorts Strip:** Horizontal scrollable cards showing scheduled course dates (`confirmed_date`), course name, and confirmed student count with 1-tap board filter.
6. **Recent Activity Feed:** Compact timeline with sticky status filter pills (`All`, `Requested`, `Invited`, `Confirmed`, `Completed`).

### 2.2 Desktop View (1024px+)
A clean 12-column responsive layout:
- **Top Full-Width Row:** 4 KPI stat cards with spotlight hover effects, accent gradients, and count-up values.
- **Main Content (8 Columns - Left):**
  - **Upcoming Cohorts Section:** Grid of upcoming date cohorts with confirmed counts and progress indications.
  - **Recent Activity Feed:** Grouped timeline with filter pills, quick student details drawer opening, and course filters.
- **Side Panel (4 Columns - Right):**
  - **Registration Form Widget:** Dedicated card with copy link, open button, and QR/URL preview.
  - **Expired Invites Widget:** Actionable card for overdue responses.
  - **Quick Actions:** Buttons with icons and descriptions.
  - **Enrollment Status Breakdown:** Stacked progress bar and percentage breakdown of all statuses.

---

## 3. Data Flow & Algorithmic Logic

### 3.1 Data Sources
- Reuse global TanStack Query cache `['enrollments']` (cached from `fetchAllEnrollments`, 30s staleTime).
- Query `['dashboard_stats']` for exact student and course counts.
- No redundant network calls.

### 3.2 Expired Invites Calculation
```ts
const nowMs = Date.now();
const expiredInvites = allEnrollments.filter(e => {
    if (e.status !== 'invited' || !e.invited_at) return false;
    const days = e.response_days ?? 7;
    const deadline = new Date(e.invited_at).getTime() + days * 24 * 60 * 60 * 1000;
    return nowMs > deadline || (deadline - nowMs) <= 48 * 3600 * 1000;
}).sort((a, b) => {
    // Sort most overdue first
    const deadlineA = new Date(a.invited_at!).getTime() + (a.response_days ?? 7) * 86400000;
    const deadlineB = new Date(b.invited_at!).getTime() + (b.response_days ?? 7) * 86400000;
    return deadlineA - deadlineB;
});
```

### 3.3 Upcoming Cohorts Grouping
```ts
// Extract all confirmed enrollments with confirmed_date >= today
const todayIso = new Date().toISOString().split('T')[0];
const cohortMap = new Map<string, { date: string; courseId: string; courseName: string; confirmedCount: number }>();

for (const en of allEnrollments) {
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
const upcomingCohorts = Array.from(cohortMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
```

---

## 4. Component Structure & Decomposition

```
frontend/src/components/Dashboard/
├── Dashboard.tsx                   # Main container, responsive layout, query orchestration
├── DashboardKPIs.tsx               # Top 4 KPI metric cards with status routing
├── RegistrationLinkCard.tsx        # Copy/Open registration form widget
├── ExpiredInvitesCard.tsx          # Urgent expired/expiring invites list & action buttons
├── UpcomingCohortsCard.tsx         # Date-grouped cohorts with confirmed counts
├── DashboardActivityFeed.tsx       # Compact timeline grouped by student & day
└── StatusBreakdownCard.tsx         # Visual status distribution & funnel bar
```

---

## 5. Testing & Verification Plan

### 5.1 Automated Unit & Integration Tests (`Dashboard.test.tsx`)
1. **KPI Stats:** Verifies rendering of student count, requested count, invited count, and confirmed count.
2. **Expired Invites:** Verifies that items with expired deadline appear with warning indicators, and that 0 expired items renders the success message.
3. **Upcoming Cohorts:** Verifies correct grouping of upcoming `confirmed_date` items and triggers navigation with `{ courseId, courseDate }`.
4. **Registration Link:** Verifies copying to clipboard triggers copied state and displays external link.
5. **Activity Feed Filters:** Verifies toggling filters updates visible activity items.

### 5.2 Manual Verification
- Test mobile viewport (< 640px) in responsive developer tools to verify tap targets (min 44px) and smooth scrolling.
- Test desktop viewport (1280px+) to verify side-by-side grid arrangement.
- Run `npm test -- components/Dashboard.test.tsx` and `npx tsc --noEmit`.
