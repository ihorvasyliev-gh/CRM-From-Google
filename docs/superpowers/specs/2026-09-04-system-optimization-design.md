# Design Specification: Comprehensive System Optimization & Usability Overhaul

**Date:** 2026-09-04  
**Status:** Approved by User  
**Scope:** Frontend Runtime Performance, Network & Bundle Architecture, Database Indexing, UX/UI Usability

---

## 1. Overview & Goals

This document specifies the architectural changes required to optimize the Course CRM system across four key layers:
1. **Frontend Runtime Performance:** Eliminate DOM listener leaks, optimize Kanban rendering, and prevent main-thread sorting freezes.
2. **Network & Bundle Loading:** Shift from blanket background prewarming to intent-driven prewarming, and code-split heavy visualization components.
3. **Database Scalability & Aggregations:** Prevent sequential table scans via targeted PostgreSQL B-tree/composite indexes and server-side aggregation for course counts.
4. **User Experience & Usability:** Streamline mobile student confirmation via keyboard ergonomics and input autofill, provide real-time split-view preview for email templates, and eliminate $O(N^2)$ freezing in duplicate scanning.

---

## 2. Architecture & Detailed Specifications

### Phase 1: Frontend Runtime Performance & Rendering

#### 1.1 `EnrollmentCard.tsx`
* **Problem:** Each card mounts two `window.matchMedia` listeners (`max-width: 1023px` and `max-width: 639px`). With 200 cards rendered, 400 window listeners are active simultaneously.
* **Solution:**
  * Remove `matchMedia` state and listeners from `EnrollmentCard`.
  * Replace conditional layout toggles with Tailwind responsive utility classes (`hidden lg:flex`, `sm:inline-block`).
  * If a JS boolean is strictly required for popover positioning, provide it once via a shared board-level hook or context (`useIsMobile`).
* **Timer Consolidation:**
  * Remove the individual `setInterval(() => setNow(Date.now()), 60000)` inside every invited card.
  * Provide a single centralized 60-second tick or derive relative time during standard component update cycles.

#### 1.2 `Dashboard.tsx`
* **Problem:** The activity filter sorting comparator executes `parseSafeDate()`, calling `toLocaleDateString('en-IE')` tens of thousands of times during $O(N \log N)$ sorting, causing frame drops on tab switch.
* **Solution:**
  * Pre-map ISO date strings to numeric timestamps (`new Date(iso).getTime()`) once during data preparation.
  * Sort using fast numeric subtraction (`b.timestamp - a.timestamp`).

#### 1.3 Deduplication & `useOutcomes.ts`
* **Problem:** 70 lines of Supabase pagination loop and student mapping logic are copy-pasted between `App.tsx` (for prefetch) and `OutcomesList.tsx`.
* **Solution:**
  * Create `frontend/src/hooks/useOutcomes.ts`.
  * Export `fetchGraduatesFn` and a unified `useGraduatesQuery()` hook.
  * Optimize graduate mapping from $O(N \times M)$ using `Array.find()` to $O(N + M)$ using a `Map<string, EmploymentStatus>` indexed by `student_id`.
  * Import `fetchGraduatesFn` into `App.tsx` and `OutcomesList.tsx`.

#### 1.4 `CommandPalette.tsx`
* **Problem:** Pressing `Ctrl+K` triggers un-cached database queries on `courses` and `students` on every open.
* **Solution:**
  * Utilize `queryClient.getQueryData(['courses'])` to immediately populate courses without network delay.
  * Cache recent students with a 5-minute `staleTime` via TanStack Query.

---

### Phase 2: Network & Bundle Architecture

#### 2.1 Intent-Driven Prewarming in `App.tsx`
* **Problem:** `useEffect` prewarms all route chunks 1-2 seconds after login, downloading 2.5 MB of heavy third-party vendor code (`exceljs` 938 kB, `recharts` 396 kB, `docxtemplater` 373 kB, `quill` 198 kB) on devices that only needed the enrollment board.
* **Solution:**
  * Initial prewarm: Only prefetch `EnrollmentBoard` and `StudentList`.
  * Intent prewarm: In `handleTabMouseEnter`, trigger dynamic `import(...)` for heavy chunks (`DocumentGenerator`, `Analytics`, `Settings`) alongside `prefetchForTab()` after a 150ms hover delay.

#### 2.2 Sub-tab Code Splitting in `Analytics.tsx`
* **Problem:** All 5 analytics tabs are bundled synchronously into `Analytics.tsx`.
* **Solution:**
  * Split `PipelineVelocityTab`, `GeographyDemographicsTab`, `CourseMatrixTab`, `OutcomesTab`, and `DataExplorerTab` using `lazyWithRetry()` with a clean fallback skeleton.

---

### Phase 3: Database Indexing & Server Aggregations

#### 3.1 Migration `44_performance_indexes_and_aggregations.sql`
* **Indexes to add:**
  ```sql
  -- Fast status filtering (e.g. completed graduates, requested pipeline)
  CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

  -- Fast reverse chronological sorting for enrollments
  CREATE INDEX IF NOT EXISTS idx_enrollments_created_at ON public.enrollments(created_at DESC);

  -- Fast reverse chronological sorting for student pagination
  CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students(created_at DESC);

  -- Composite index for course and status breakdowns
  CREATE INDEX IF NOT EXISTS idx_enrollments_course_status ON public.enrollments(course_id, status);
  ```

#### 3.2 Server Aggregation for `CourseList.tsx`
* **RPC Function:**
  ```sql
  CREATE OR REPLACE FUNCTION get_course_enrollment_counts()
  RETURNS TABLE (
      course_id UUID,
      total BIGINT,
      requested BIGINT,
      invited BIGINT,
      confirmed BIGINT,
      completed BIGINT,
      withdrawn BIGINT,
      rejected BIGINT
  ) AS $$
  BEGIN
      RETURN QUERY
      SELECT
          e.course_id,
          count(*)::BIGINT AS total,
          count(*) FILTER (WHERE e.status = 'requested')::BIGINT AS requested,
          count(*) FILTER (WHERE e.status = 'invited')::BIGINT AS invited,
          count(*) FILTER (WHERE e.status = 'confirmed')::BIGINT AS confirmed,
          count(*) FILTER (WHERE e.status = 'completed')::BIGINT AS completed,
          count(*) FILTER (WHERE e.status = 'withdrawn')::BIGINT AS withdrawn,
          count(*) FILTER (WHERE e.status = 'rejected')::BIGINT AS rejected
      FROM enrollments e
      GROUP BY e.course_id;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
  ```
* **Frontend usage in `CourseList.tsx`:**
  * Query `get_course_enrollment_counts` via `useQuery({ queryKey: ['course_enrollment_counts'] })`.
  * Avoid fetching thousands of student records with names, addresses, and phones just to count status badges.

---

### Phase 4: UX & Usability Enhancements

#### 4.1 Mobile Confirmation Usability (`ConfirmationPage.tsx`)
* **Context:** Invitation links (`/c/:token`) are shared across multiple recipients in a single email (e.g. 20 students per cohort). Email must NOT be pre-filled via URL parameters.
* **Ergonomics Improvements:**
  * Mobile keyboard attributes: `inputMode="email"`, `autoComplete="email"`, `autoCapitalize="none"`, `spellCheck="false"`. Enables 1-tap browser profile email autofill on iOS and Android.
  * Auto-trim and lowercase on paste and blur.
  * Clear course and date header banner confirming: "Confirming your spot for: {course_name} on {course_date}".
  * Network error fallback with an inline "Try Again" retry button.

#### 4.2 Duplicate Scanner Optimization (`Settings.tsx`)
* **Problem:** $O(N^2)$ loop over all students runs Levenshtein string distance calculations on the main thread, freezing the tab for 3,000+ students.
* **Solution:**
  * Pre-index students into buckets by normalized phone numbers, date of birth (DOB), and first character of last name.
  * Only compare names within matching buckets. Reduces comparisons from 4,500,000 to under 500, executing in <50ms.

#### 4.3 Email Template Split-View Live Preview (`Settings.tsx`)
* **Enhancements:**
  * On desktop screens (`lg:`), render a 2-column split-view: editor on the left, live rendered email preview with sample data on the right.
  * Real-time shortcode validation for `{confirmationLink}` and `{confirmationButton}` with subtle warning feedback if absent.

---

## 3. Verification & Testing Plan

### Automated Tests
1. **Full Vitest Suite:** Run `cmd.exe /c "npm run test:run"` in `frontend` ensuring all existing 184 tests pass without regressions.
2. **Production Build Verification:** Run `cmd.exe /c "npm run build"` to verify TypeScript typing, bundle compilation, and chunk sizes.

### Manual Verification
1. **Kanban Board:** Verify drag-and-drop, quick move, note editing, and priority toggling on `EnrollmentBoard`.
2. **Dashboard:** Verify activity list sorting and status breakdown counters.
3. **Course Catalog:** Verify status counts render accurately from RPC aggregation.
4. **Confirmation Page:** Test `/c/:token` flow with valid and invalid tokens, checking mobile keyboard attributes and domain hints.
5. **Settings:** Verify duplicate scanner execution speed and template split-view live preview.
