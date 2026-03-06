# 📋 Project Audit Implementation Tasks

## 1. Database (Supabase) Improvements
- [x] Add `CHECK constraint` on `enrollments.status`
- [x] Add `SET search_path = public;` to all `SECURITY DEFINER` functions

##- [x] Infrastructure & Utilities
  - [x] Install and configure `vitest` and `@testing-library/react`.
  - [x] Setup ESLint with React and TypeScript recommended rules and fix existing linting errors.
  - [x] Extract `CARD_GRADIENTS` array in `CourseList.tsx` into `src/lib/types` (already done in codebase earlier, but verify).
  - [x] Consolidate date formatting functions (`formatDate`, `formatDateDMY`, `formatDateLong`, etc.) into a generic `dateUtils` module.ts`

## 3. Architecture & Routing
- [x] Implement React Router in `App.tsx` and `main.tsx`
- [x] Migrate `activeTab` state to URL-based routing (`/dashboard`, `/students`, etc.)
- [x] Ensure nested navigation (e.g. returning to Enrollments with a pre-selected course) works with router state.
- [x] Keep `ConfirmationPage` accessible via `/confirm` without breaking the CRM layout.

## 4. EnrollmentBoard Refactoring
- [ ] Extract custom hooks (`useEnrollments`, `useBulkActions`, etc.)
- [ ] Extract sub-components (`FilterBar`, `EnrollmentCard`, etc.)
- [ ] Address race condition between Realtime and optimistic updates
- [ ] Add loading/error states for data fetching where missing

## 5. Final Polish
- [ ] Ensure `package-lock.json` is committed
- [ ] General cleanup
