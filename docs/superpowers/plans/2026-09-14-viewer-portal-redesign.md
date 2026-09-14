# Viewer Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Viewer Portal into an intuitive, high-performance workspace for case managers and curators, featuring a full Students Directory with multi-attribute filtering, a slide-over detail drawer, and a streamlined Course Monitor.

**Architecture:** A modern two-tab navigation hub (`/students` and `/courses`) with Glassmorphic headers and responsive mobile docks. All viewer data is securely accessed via dedicated `SECURITY DEFINER` Supabase RPCs ensuring read-only safety with curated actions (contact copy, WhatsApp/maps links, Excel export, and completion requests).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, TanStack Query (React Query), Supabase (PostgreSQL RPC), Vitest, React Testing Library.

**Spec:** [2026-09-14-viewer-portal-redesign.md](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CRM%20System/docs/superpowers/specs/2026-09-14-viewer-portal-redesign.md)

## Global Constraints

- Never mutate database records directly from the viewer role; all destructive or status change actions go through admin approval (`pending_approvals`).
- Use existing utility functions: `cleanVariant` and `getAvatarGradient` from `../lib/types`, `formatDateDMY` from `../lib/dateUtils`, contact utilities from `../lib/contactUtils`.
- Retain all existing tests and passing state (`npx vitest run`).
- Debounce live search inputs by 250ms using `useDebounce`.

---

### Task 1: Supabase Migration for Viewer Students Directory RPC

**Files:**
- Create: `supabase/54_viewer_students_directory_rpc.sql`
- Test: Syntax check and SQL structure verification

**Interfaces:**
- Produces: `public.get_viewer_students_directory(p_search TEXT, p_course_id UUID, p_status TEXT, p_priority_only BOOLEAN, p_sort_by TEXT, p_limit INT, p_offset INT)`

- [ ] **Step 1: Write migration SQL file**
  Create `supabase/54_viewer_students_directory_rpc.sql` defining `get_viewer_students_directory`:
  - Validates `auth.role() = 'authenticated'`.
  - Filters students by multi-token search across name, email, phone, eircode.
  - Filters by optional `p_course_id`, `p_status`, and `p_priority_only`.
  - Computes `primary_course_name`, `primary_status`, `primary_queue_position`, `is_priority`, `total_enrollments`, and `notes_count`.
  - Supports ordering by `date_desc`, `date_asc`, `queue`, `name_asc`.
  - Enforces `SECURITY DEFINER`, revokes from `public`, grants to `authenticated`.

- [ ] **Step 2: Verify SQL file structure and syntax**
  Review function signature, grants, and return types against the spec.

- [ ] **Step 3: Commit**
  ```bash
  git add supabase/54_viewer_students_directory_rpc.sql
  git commit -m "feat(db): add get_viewer_students_directory RPC migration"
  ```

---

### Task 2: Student Detail Slide-over Drawer Component

**Files:**
- Create: `frontend/src/components/StudentDetailDrawer.tsx`
- Create: `frontend/src/components/StudentDetailDrawer.test.tsx`

**Interfaces:**
- Consumes: `get_student_detail_restricted(student_id)` via Supabase RPC, `useRequestCompletion()` mutation.
- Produces: `<StudentDetailDrawer studentId={string | null} onClose={() => void} />`

- [ ] **Step 1: Write the failing unit test**
  Create `frontend/src/components/StudentDetailDrawer.test.tsx` testing:
  - Renders null when `studentId` is null.
  - Fetches and displays student name, contacts (email, phone, address).
  - Triggers copy action on contact field click.
  - Displays course enrollments with queue position and dates.
  - Calls `onClose` when close button or backdrop is clicked, or `Escape` key pressed.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd frontend && npx vitest run src/components/StudentDetailDrawer.test.tsx`
  Expected: FAIL (Component does not exist yet).

- [ ] **Step 3: Implement `StudentDetailDrawer.tsx`**
  - Smooth right slide-over layout (`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface border-l shadow-2xl`).
  - Student avatar with gradient, full name, registration date.
  - Contact buttons: Copy email/phone, Call (`tel:`), WhatsApp (`wa.me`), Maps (via `formatGoogleMapsUrl`).
  - Enrollments list: Course name, variant, status badge, queue position, timeline dates (created, invited, confirmed, completed).
  - "Request Completion" button for confirmed enrollments with date picker dialog.
  - Notes & flags list with timestamps.
  - Keyboard shortcut listener for `Escape`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cd frontend && npx vitest run src/components/StudentDetailDrawer.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/StudentDetailDrawer.tsx frontend/src/components/StudentDetailDrawer.test.tsx
  git commit -m "feat: add StudentDetailDrawer component with tests"
  ```

---

### Task 3: Viewer Students Directory Component

**Files:**
- Create: `frontend/src/components/ViewerStudentsDirectory.tsx`
- Create: `frontend/src/components/ViewerStudentsDirectory.test.tsx`

**Interfaces:**
- Consumes: `get_viewer_students_directory`, `get_viewer_courses`, `<StudentDetailDrawer />`
- Produces: `<ViewerStudentsDirectory />`

- [ ] **Step 1: Write the failing unit test**
  Create `frontend/src/components/ViewerStudentsDirectory.test.tsx` testing:
  - Renders search input and filter controls (course dropdown, status pills, priority toggle, sort dropdown).
  - Displays list of students with name, status badge, priority star, queue badge, and registration date.
  - Toggles priority filter when `⭐ Priority Only` is clicked.
  - Debounced search updates query.
  - Clicking a student row opens `StudentDetailDrawer` for that student.
  - Reset filters button clears active filters.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd frontend && npx vitest run src/components/ViewerStudentsDirectory.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement `ViewerStudentsDirectory.tsx`**
  - Search input with clear `(X)` button and 250ms debounce.
  - Filter bar: Course selector, Status tabs, Priority toggle, Sort selector.
  - Desktop data table: Avatar, Name, Email, Phone, Primary Course & Status badge, Queue `#N in queue`, Priority `⭐`, Registration date, Notes count `💬 N`.
  - Mobile cards: Responsive card view for small viewports.
  - Result count indicator and "Reset Filters" button.
  - Loading skeleton states and empty state ("No students match your filters").
  - Slide-over drawer integration: opens on row click, preserves table scroll and filters.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cd frontend && npx vitest run src/components/ViewerStudentsDirectory.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/ViewerStudentsDirectory.tsx frontend/src/components/ViewerStudentsDirectory.test.tsx
  git commit -m "feat: add ViewerStudentsDirectory component with tests"
  ```

---

### Task 4: Polish Course Monitor & Roster (`ViewerCourses.tsx`)

**Files:**
- Modify: `frontend/src/components/ViewerCourses.tsx`
- Modify: `frontend/src/components/ViewerCourses.test.tsx`

**Interfaces:**
- Consumes: `get_viewer_courses`, `get_viewer_course_roster`, `exportViewerRosterToExcel`
- Produces: `<ViewerCourses />`

- [ ] **Step 1: Review and update `ViewerCourses.test.tsx`**
  Add tests for breadcrumb navigation back to catalog and verify existing roster filtering.

- [ ] **Step 2: Run test to check current behavior**
  Run: `cd frontend && npx vitest run src/components/ViewerCourses.test.tsx`
  Expected: PASS.

- [ ] **Step 3: Polish `ViewerCourses.tsx` UI**
  - Ensure visual consistency with `ViewerStudentsDirectory` (matching badge styles, typography, filter pills).
  - Refine breadcrumb bar (`← All Courses / <Course Name>`) with prominent back button.
  - Ensure Excel export and bulk completion request buttons have clear tooltips and loading states.

- [ ] **Step 4: Run test to verify all tests pass**
  Run: `cd frontend && npx vitest run src/components/ViewerCourses.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/ViewerCourses.tsx frontend/src/components/ViewerCourses.test.tsx
  git commit -m "refactor: polish ViewerCourses UI and navigation consistency"
  ```

---

### Task 5: Routing & Global Navigation Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/MobileBottomNav.tsx`
- Modify: `frontend/src/components/MobileBottomNav.test.tsx`

**Interfaces:**
- Replaces `/lookup` route with `/students` (`ViewerStudentsDirectory`).
- Adds backwards-compatible redirect from `/lookup` to `/students`.
- Updates header tabs and mobile bottom bar for `viewer` role.

- [ ] **Step 1: Write test for updated navigation**
  Update `frontend/src/components/MobileBottomNav.test.tsx` to verify viewer navigation tabs: "Students" and "Courses".

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd frontend && npx vitest run src/components/MobileBottomNav.test.tsx`

- [ ] **Step 3: Update `App.tsx` and `MobileBottomNav.tsx`**
  - Lazy load `ViewerStudentsDirectory`.
  - In `App.tsx`:
    - Set `/students` as primary viewer route.
    - Add `<Route path="/lookup" element={<Navigate to="/students" replace />} />`.
    - Update viewer header buttons: `Students Directory` (`/students`) and `Course Monitor` (`/courses`).
  - In `MobileBottomNav.tsx`:
    - Ensure active tab highlighting matches `students` and `courses`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cd frontend && npx vitest run src/components/MobileBottomNav.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/App.tsx frontend/src/components/MobileBottomNav.tsx frontend/src/components/MobileBottomNav.test.tsx
  git commit -m "feat: integrate ViewerStudentsDirectory into App routing and navigation"
  ```

---

### Task 6: Full Suite Verification & Build Verification

**Files:**
- Entire repository

- [ ] **Step 1: Run complete test suite**
  Run: `cd frontend && npx vitest run`
  Expected: All tests PASS.

- [ ] **Step 2: Run production build**
  Run: `cd frontend && npm run build`
  Expected: TypeScript check and Vite build succeed with 0 errors.

- [ ] **Step 3: Final clean commit and tag**
  ```bash
  git status
  ```
