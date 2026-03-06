# 🎯 CRM System Audit Implementation Plan

Based on the [Project Audit](project_audit.md) findings, we will implement the recommended improvements categorized by Database (Supabase), Architecture (React Router, Error Boundary), Testing & Tooling, and Refactoring of `EnrollmentBoard.tsx`.

## ⚠️ User Review Required
> [!WARNING]
> This plan involves a major refactoring of the central `EnrollmentBoard.tsx` component (1600+ lines). Please review the proposed separation into hooks and components carefully.

## 🛠️ Proposed Changes

### Database (Supabase SQL)
- Add a script to introduce `CHECK` constraints on `enrollments.status`.
- Add `SET search_path = public;` to all functions with `SECURITY DEFINER`.
- [NEW] `supabase/09_add_constraints_and_search_path.sql`

---

### Infrastructure & Utilities
- Setup **ESLint** and configure it for the project.
- Consolidate all date formatting logic into a single utility file.
- Setup **Vitest + React Testing Library**.
- Write tests for utilities.
- [NEW] `frontend/eslint.config.js` (or `.eslintrc.js`)
- [NEW] `frontend/vitest.config.ts`
- [NEW] `frontend/src/lib/dateUtils.ts`
- [MODIFY] `frontend/src/lib/documentUtils.ts` (Remove duplicate date logic)
- [MODIFY] `frontend/src/components/ConfirmationPage.tsx` (Use `dateUtils`)
- [NEW] `frontend/src/lib/__tests__/dateUtils.test.ts`
- [NEW] `frontend/src/lib/__tests__/appConfig.test.ts`

---

### Architecture & Routing
- Introduce **React Router v6** to handle application navigation properly instead of relying on `activeTab` state and manual `window.location.pathname` checks.
- Add an **ErrorBoundary** component to catch rendering errors gracefully.
- [MODIFY] `frontend/src/App.tsx` (Add Router configuration)
- [MODIFY] `frontend/src/main.tsx` (Wrap with Router setup)
- [NEW] `frontend/src/components/ErrorBoundary.tsx`

---

### EnrollmentBoard Component Refactoring
- Split `EnrollmentBoard.tsx` into smaller chunks to improve maintainability and avoid re-render performance issues.
- Solve race conditions between realtime `postgres_changes` events and optimistic JSON updates.
- Extract Hooks:
  - `useEnrollments`: Data fetching, realtime subscriptions, optimistic updates.
  - `useBulkActions`: Handlers for bulk status, email, deletion.
  - `useInviteFlow`: Handles generating invitation tokens and managing flow.
- Extract Components:
  - `FilterBar`: Filters, search, stats.
  - `EnrollmentCard`: Individual enrollment item.
  - `BulkActionBar`: Contextual bar for bulk operations.
  - `StatusColumn`: Drag-n-drop or list column container.
- [MODIFY] `frontend/src/components/EnrollmentBoard.tsx`
- [NEW] `frontend/src/hooks/useEnrollments.ts`
- [NEW] `frontend/src/hooks/useBulkActions.ts`
- [NEW] `frontend/src/hooks/useInviteFlow.ts`
- [NEW] `frontend/src/components/EnrollmentBoard/FilterBar.tsx`
- [NEW] `frontend/src/components/EnrollmentBoard/EnrollmentCard.tsx`
- [NEW] `frontend/src/components/EnrollmentBoard/BulkActionBar.tsx`
- [NEW] `frontend/src/components/EnrollmentBoard/StatusColumn.tsx`

---

## 🧪 Verification Plan

### Automated Tests
- Run `npm run test` (Vitest) to verify that `dateUtils`, `appConfig`, and `documentUtils` behave correctly.
- Run `npm run lint` (ESLint) to ensure zero linting errors across the codebase.
- Run `npm run build` to ensure TypeScript compilation succeeds without errors.

### Manual Verification
1. **Routing:** Open the app and navigate between Dashboard, Enrollments, Students, Courses, Settings using the sidebar/tabs. Verify URL updates (`/`, `/enrollments`, `/students`). Use browser Back/Forward buttons.
2. **Data Integration:** Create a new enrollment from the frontend and verify it displays correctly in the new `EnrollmentBoard`.
3. **Refactored EnrollmentBoard:**
   - Test "Requested" -> "Invited" transition (single and bulk).
   - Test bulk email operations.
   - Verify drag-and-drop or column status changes work and persist cleanly without race-condition flickering.
   - Use another browser to insert an enrollment and verify Realtime updates work.
4. **Database Security:** Test calling a `SECURITY DEFINER` RPC function to ensure it still succeeds with the explicit `search_path`. Confirm via Supabase dashboard or `psql` that `enrollments.status` cannot accept invalid values like `invalid_status`.
