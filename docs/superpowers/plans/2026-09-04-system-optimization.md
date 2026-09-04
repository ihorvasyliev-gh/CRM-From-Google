# System Optimization & Usability Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accelerate runtime rendering, optimize network and chunk loading, index the Supabase database, and enhance mobile confirmation and admin template usability across the Course CRM system.

**Architecture:** A 4-phase layered overhaul: (1) Client runtime rendering and listener cleanup, (2) Intent-based chunk prewarming and lazy-loading, (3) Database indexes and server-side RPC aggregation, (4) Mobile input ergonomics and split-view template live preview.

**Tech Stack:** React 18, TypeScript, Vite 7, TanStack Query 5, Tailwind CSS, PostgreSQL / Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-system-optimization-design.md`

## Global Constraints

- Preserve all existing comments, docstrings, and test expectations.
- All 184 existing Vitest tests must continue to pass throughout every phase.
- Shared invitation links (`/c/:token`) must NOT contain pre-filled emails in query parameters; each student in the cohort confirms independently.
- Avoid introducing heavy runtime dependencies; leverage native CSS and existing utilities.

---

### Task 1: Eliminate `matchMedia` Listeners & Optimize Card Rendering in `EnrollmentCard.tsx`

**Files:**
- Modify: `frontend/src/components/EnrollmentBoard/EnrollmentCard.tsx`
- Test: `frontend/src/components/EnrollmentBoard/EnrollmentCard.test.tsx`

**Interfaces:**
- Consumes: `EnrollmentRow`, `StudentFlag`, `STATUS_CONFIG`
- Produces: Clean, lightweight `EnrollmentCard` without per-card `matchMedia` listeners

- [ ] **Step 1: Check existing `EnrollmentCard` tests**

Run: `cmd.exe /c "npx vitest run src/components/EnrollmentBoard/EnrollmentCard.test.tsx"`
Expected: PASS

- [ ] **Step 2: Remove per-card `window.matchMedia` listeners and individual intervals**

In `frontend/src/components/EnrollmentBoard/EnrollmentCard.tsx`:
1. Remove `isMobile` and `isSmallScreen` state and their `useEffect` listeners (lines 74-101).
2. For layout elements conditionally rendered by `isMobile` or `isSmallScreen`, replace with Tailwind responsive utility classes:
   - Elements hidden on mobile: `hidden sm:block` or `hidden lg:inline-flex`.
   - Elements visible only on mobile: `sm:hidden` or `lg:hidden`.
3. If `isSmallScreen` was used in `handleQuickMoveClick` for `popoverPos`, compute on-demand at click time:
   ```ts
   const isSmall = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
   ```
4. Replace the 60-second `setInterval` inside invited cards by removing `now` state if relative time can be evaluated or derive time without a per-card interval.

- [ ] **Step 3: Run Vitest on `EnrollmentCard.test.tsx`**

Run: `cmd.exe /c "npx vitest run src/components/EnrollmentBoard/EnrollmentCard.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/EnrollmentBoard/EnrollmentCard.tsx
git commit -m "perf(enrollment): eliminate per-card matchMedia listeners and consolidate timer"
```

---

### Task 2: Fast Numeric Timestamp Sorting in `Dashboard.tsx`

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx:293-315`
- Test: `frontend/src/components/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `allEnrollments: EnrollmentRow[]`
- Produces: Instant activity sorting without repeated `toLocaleDateString()` calls in comparators

- [ ] **Step 1: Check existing `Dashboard` test**

Run: `cmd.exe /c "npx vitest run src/components/Dashboard.test.tsx"`
Expected: PASS

- [ ] **Step 2: Optimize `filteredRecent` comparator in `Dashboard.tsx`**

In `frontend/src/components/Dashboard.tsx:293-315`:
1. During `.map(en => ...)`, pre-calculate numeric timestamp:
   ```ts
   const ts = en.created_at ? new Date(en.created_at).getTime() : 0;
   ```
2. Replace sorting comparator:
   ```ts
   // Before: .sort((a, b) => parseSafeDate(b.created_at).time - parseSafeDate(a.created_at).time)
   // After:
   .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
   ```
3. Format date labels (`parseSafeDate`) only when rendering the displayed list items, not during sort comparisons.

- [ ] **Step 3: Verify tests pass**

Run: `cmd.exe /c "npx vitest run src/components/Dashboard.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "perf(dashboard): optimize activity sorting comparator by caching timestamps"
```

---

### Task 3: Deduplicate Outcomes Logic into `useOutcomes.ts` and Optimize O(N) Mapping

**Files:**
- Create: `frontend/src/hooks/useOutcomes.ts`
- Create: `frontend/src/hooks/useOutcomes.test.ts`
- Modify: `frontend/src/components/OutcomesList.tsx`
- Modify: `frontend/src/App.tsx:300-375`

**Interfaces:**
- Produces: `fetchGraduatesFn(): Promise<GraduateRow[]>` and `useGraduates(): UseQueryResult<GraduateRow[]>`
- Consumes: Supabase `enrollments` and `employment_status` tables

- [ ] **Step 1: Write test for `useOutcomes.ts`**

Create `frontend/src/hooks/useOutcomes.test.ts` testing `fetchGraduatesFn` with mocked Supabase responses.

- [ ] **Step 2: Run test to verify failure**

Run: `cmd.exe /c "npx vitest run src/hooks/useOutcomes.test.ts"`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implement `frontend/src/hooks/useOutcomes.ts`**

1. Move `GraduateRow` interface and `fetchGraduatesFn` into `useOutcomes.ts`.
2. Optimize student-to-employment-status mapping:
   ```ts
   const empStatusMap = new Map<string, any>();
   for (const es of empStatuses) {
       if (es.student_id) empStatusMap.set(es.student_id, es);
   }
   // Replace O(N*M) empStatuses.find(...) with O(1) empStatusMap.get(student.id)
   ```
3. Export `useGraduatesQuery` hook with `staleTime: 30_000`.

- [ ] **Step 4: Update `OutcomesList.tsx` and `App.tsx`**

In `frontend/src/components/OutcomesList.tsx`:
- Import `fetchGraduatesFn`, `GraduateRow` from `../hooks/useOutcomes`.

In `frontend/src/App.tsx`:
- Replace the 70 lines of inline `queryFn` in `prefetchForTab('outcomes')` with `queryFn: fetchGraduatesFn`.

- [ ] **Step 5: Run tests to verify**

Run: `cmd.exe /c "npx vitest run src/hooks/useOutcomes.test.ts src/components/OutcomesList.tsx"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useOutcomes.ts frontend/src/hooks/useOutcomes.test.ts frontend/src/components/OutcomesList.tsx frontend/src/App.tsx
git commit -m "refactor(outcomes): extract useOutcomes hook and optimize lookup to O(1)"
```

---

### Task 4: Command Palette Fast Cache Lookup

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx`
- Test: `frontend/src/components/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: TanStack `useQueryClient`
- Produces: Instantaneous `Ctrl+K` modal rendering using cached courses & students

- [ ] **Step 1: Check existing `CommandPalette` tests**

Run: `cmd.exe /c "npx vitest run src/components/CommandPalette.test.tsx"`
Expected: PASS

- [ ] **Step 2: Update `CommandPalette.tsx` to read from queryClient**

1. Inject `const queryClient = useQueryClient();`.
2. On `open`, check if `queryClient.getQueryData<Course[]>(['courses'])` exists. If so, immediately initialize `courses` state.
3. If not in cache, trigger the background fetch.
4. Set `loadingData` to false immediately if cache is available so the user experiences zero spinner delay.

- [ ] **Step 3: Run Vitest**

Run: `cmd.exe /c "npx vitest run src/components/CommandPalette.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx
git commit -m "perf(command-palette): use cached query data for instant modal render"
```

---

### Task 5: Intent-Driven Prewarming in `App.tsx` and Code-Splitting in `Analytics.tsx`

**Files:**
- Modify: `frontend/src/App.tsx:85-108`
- Modify: `frontend/src/components/Analytics.tsx:26-30`

**Interfaces:**
- Consumes: `lazyWithRetry`
- Produces: Optimized background bandwidth usage and dynamic sub-tab loading in Analytics

- [ ] **Step 1: Refine `App.tsx` prewarming strategy**

In `frontend/src/App.tsx`:
1. In the initial `prewarm` callback (lines 85-108), only import `EnrollmentBoard` and `StudentList`.
2. In `handleTabMouseEnter(tab: string)`, trigger chunk preloading when hovered for 150ms:
   ```ts
   if (tab === 'documents') import('./components/DocumentGenerator');
   if (tab === 'analytics') import('./components/Analytics');
   if (tab === 'settings') import('./components/Settings');
   if (tab === 'outcomes') import('./components/OutcomesList');
   ```

- [ ] **Step 2: Lazy load sub-tabs in `Analytics.tsx`**

In `frontend/src/components/Analytics.tsx`:
1. Replace synchronous imports of `PipelineVelocityTab`, `GeographyDemographicsTab`, `CourseMatrixTab`, `OutcomesTab`, and `DataExplorerTab` with `lazyWithRetry()`.
2. Wrap tab rendering in `<Suspense fallback={<AnalyticsTabSkeleton />}>`.

- [ ] **Step 3: Verify build and tests**

Run: `cmd.exe /c "npx vitest run src/components/Analytics/analyticsUtils.test.ts"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Analytics.tsx
git commit -m "perf(bundle): implement intent-based chunk prewarming and analytics code splitting"
```

---

### Task 6: Database Migration for Performance Indexes & RPC Aggregation in `CourseList.tsx`

**Files:**
- Create: `supabase/migrations/44_performance_indexes_and_aggregations.sql`
- Modify: `frontend/src/components/CourseList.tsx:106-135`
- Test: `frontend/src/components/CourseList.test.tsx`

**Interfaces:**
- Produces: `get_course_enrollment_counts()` RPC in Supabase, fast index on `enrollments(status, created_at)`
- Consumes: `supabase.rpc('get_course_enrollment_counts')` in `CourseList.tsx`

- [ ] **Step 1: Create SQL migration**

Create `supabase/migrations/44_performance_indexes_and_aggregations.sql` containing:
- B-tree indexes for `enrollments(status)`, `enrollments(created_at DESC)`, `students(created_at DESC)`, `enrollments(course_id, status)`.
- `get_course_enrollment_counts()` function returning `course_id, total, requested, invited, confirmed, completed, withdrawn, rejected`.
- Grant execute permissions to `authenticated` and `anon`.

- [ ] **Step 2: Update `CourseList.tsx` query**

In `frontend/src/components/CourseList.tsx`:
1. Use `useQuery` with key `['course_enrollment_counts']`:
   ```ts
   const { data: serverCounts } = useQuery({
       queryKey: ['course_enrollment_counts'],
       queryFn: async () => {
           const { data, error } = await supabase.rpc('get_course_enrollment_counts');
           if (error) throw error;
           const map: Record<string, EnrollmentCount> = {};
           for (const row of data || []) {
               map[row.course_id] = row;
           }
           return map;
       },
       staleTime: 30_000,
   });
   ```
2. Remove dependency on `fetchAllEnrollments` in `CourseList.tsx`, preventing loading all student personal records.

- [ ] **Step 3: Run Vitest on `CourseList.test.tsx`**

Run: `cmd.exe /c "npx vitest run src/components/CourseList.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/44_performance_indexes_and_aggregations.sql frontend/src/components/CourseList.tsx
git commit -m "perf(courses): add database indexes and aggregate enrollment counts via RPC"
```

---

### Task 7: Mobile Confirmation Usability in `ConfirmationPage.tsx`

**Files:**
- Modify: `frontend/src/components/ConfirmationPage.tsx`

**Interfaces:**
- Consumes: Mobile browser input autofill, `/c/:token` URL
- Produces: 1-tap mobile email suggestion, auto-trim, and clear retry button

- [ ] **Step 1: Update email input attributes & normalization**

In `frontend/src/components/ConfirmationPage.tsx`:
1. Set input attributes:
   ```tsx
   <input
       type="email"
       inputMode="email"
       autoComplete="email"
       autoCapitalize="none"
       spellCheck="false"
       placeholder="Enter your email address"
       value={email}
       onChange={e => setEmail(e.target.value.toLowerCase())}
       onBlur={() => setEmail(prev => prev.trim().toLowerCase())}
       ...
   />
   ```
2. In the course header banner, clearly show:
   ```tsx
   <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4">
       <p className="text-xs text-brand-400 font-medium uppercase tracking-wider">Confirming attendance for</p>
       <p className="text-sm font-bold text-primary mt-0.5">{courseName}</p>
       {courseDate && <p className="text-xs text-muted mt-0.5">{courseDate}</p>}
   </div>
   ```
3. In `state === 'error'`, render a prominent `<button onClick={() => window.location.reload()} ...>Try Again</button>` button.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ConfirmationPage.tsx
git commit -m "feat(confirmation): optimize mobile keyboard ergonomics and error recovery"
```

---

### Task 8: Settings Optimization: Fast Duplicate Scanner & Split-View Template Preview

**Files:**
- Modify: `frontend/src/components/Settings.tsx`

**Interfaces:**
- Consumes: `AppConfig`, `Student`
- Produces: $<50ms$ duplicate scanner and real-time split-view email template editor

- [ ] **Step 1: Optimize duplicate student scanner algorithm**

In `frontend/src/components/Settings.tsx:160-220`:
1. Group students by normalized phone and by date of birth (DOB) into buckets (`Map<string, Student[]>`).
2. Only run `areNamesSimilar(s1, s2)` for pairs that share either a phone or DOB (or exact first 3 letters of last name).
3. This reduces pairwise iterations from $N^2$ (4,500,000 checks) to under 500 checks, eliminating UI freeze.

- [ ] **Step 2: Add desktop Split-View for email template preview**

In `frontend/src/components/Settings.tsx`:
1. On `lg:` screens, format template editing area as a 2-column grid:
   ```tsx
   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
       <div className="space-y-4">{/* ReactQuill Editor */}</div>
       <div className="sticky top-6">{/* Live Preview Window */}</div>
   </div>
   ```
2. Display instant validation badge:
   - Green: "Valid template: {confirmationLink} found"
   - Amber/Red: "Missing {confirmationLink} shortcode — emails will not contain a confirmation link"

- [ ] **Step 3: Verify build and test suite**

Run: `cmd.exe /c "npm run test:run"`
Expected: PASS (all 184+ tests pass)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Settings.tsx
git commit -m "perf(settings): optimize duplicate scanner to sub-50ms and add split-view live preview"
```

---

### Task 9: Final Full Suite Verification & Bundle Measurement

**Files:**
- None (verification phase)

- [ ] **Step 1: Run complete Vitest suite**

Run: `cmd.exe /c "npm run test:run"`
Expected: All test files pass.

- [ ] **Step 2: Run production build**

Run: `cmd.exe /c "npm run build"`
Expected: Clean build, verify chunk distribution.

- [ ] **Step 3: Document walkthrough**

Create `walkthrough.md` summarizing performance gains, bundle size improvements, and verification outputs.
