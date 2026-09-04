# Secure Enrollment Cancellation & Rescheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure the course enrollment cancellation and rescheduling workflows by preventing unauthorized third-party changes via anonymous RPC and routing decline requests through an authenticated direct email channel to the course coordinator.

**Architecture:** Revoke anonymous execution privileges on `public_decline_enrollment` in Supabase to block unauthenticated database modifications. Redesign the public `ConfirmationPage.tsx` decline workflow to replace anonymous RPC calls with a pre-filled direct email action (`mailto:ivasyliev@partnershipcork.ie`) containing verified course/student details, accompanied by clipboard copy utilities for webmail users.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL RLS & RPC), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-secure-enrollment-cancellation-design.md`

## Global Constraints

- Never allow `anon` role to execute destructive enrollment status updates (`withdrawn`, `requested`) via RPC.
- Coordinator email is fixed to `ivasyliev@partnershipcork.ie`.
- Participant attendance confirmation (`public_confirm_enrollment`) must remain functional and unobstructed.
- All Windows shell commands executing npm must invoke `npm.cmd` or `npx.cmd`.

---

### Task 1: Supabase Security Migration for Revoking Anonymous Decline Access

**Files:**
- Create: `supabase/53_revoke_public_decline_enrollment.sql`

**Interfaces:**
- Consumes: `public.public_decline_enrollment(text, uuid, text, uuid)` from `supabase/45_public_decline_enrollment.sql`
- Produces: Migration SQL script revoking public execution from `anon` and `public`, restricting to `authenticated`.

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/53_revoke_public_decline_enrollment.sql`:
```sql
-- ============================================================
-- Migration 53: Revoke Public Access to Decline Enrollment RPC
-- Security Hardening: Prevent anonymous third parties from
-- revoking student course enrollments without authentication.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM public;

GRANT EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) TO authenticated;
```

- [ ] **Step 2: Verify file existence and syntax**

Verify that `supabase/53_revoke_public_decline_enrollment.sql` is present and correctly formatted.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/53_revoke_public_decline_enrollment.sql
git commit -m "security(db): revoke anon execute on public_decline_enrollment"
```

---

### Task 2: Write Failing Unit Tests for Secure Decline/Reschedule Flow

**Files:**
- Create: `frontend/src/components/ConfirmationPage.test.tsx`

**Interfaces:**
- Consumes: `ConfirmationPage` component from `frontend/src/components/ConfirmationPage.tsx`
- Produces: Test suite verifying that selecting reschedule/withdraw presents the secure mailto view and never calls `public_decline_enrollment`.

- [ ] **Step 1: Write the unit test file**

Create `frontend/src/components/ConfirmationPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmationPage from './ConfirmationPage';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
    },
}));

describe('ConfirmationPage - Secure Decline Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default URL params mock
        delete (window as unknown as { location: unknown }).location;
        (window as unknown as { location: unknown }).location = {
            pathname: '/confirm',
            search: '?course_id=11111111-1111-1111-1111-111111111111&date=2026-10-15',
            origin: 'http://localhost:5173',
        };

        // Default mock course info
        mockRpc.mockImplementation((fnName: string) => {
            if (fnName === 'get_public_course_info') {
                return Promise.resolve({
                    data: [{ course_name: 'Safe Pass' }],
                    error: null,
                });
            }
            if (fnName === 'find_students_by_email') {
                return Promise.resolve({
                    data: [{ student_id: 's1', first_name: 'Peter', last_name: 'Smith' }],
                    error: null,
                });
            }
            return Promise.resolve({ data: null, error: null });
        });
    });

    it('navigates to secure contact screen and does NOT call public_decline_enrollment when declining', async () => {
        render(<ConfirmationPage />);

        // Wait for course to load
        await waitFor(() => {
            expect(screen.getByText(/Safe Pass/i)).toBeInTheDocument();
        });

        // Enter email
        const emailInput = screen.getByPlaceholderText(/your\.email@example\.com/i);
        fireEvent.change(emailInput, { target: { value: 'peter@example.com' } });

        // Click "I can't attend this date"
        const declineBtn = screen.getByRole('button', { name: /can't attend/i });
        fireEvent.click(declineBtn);

        // Click Reschedule option
        const rescheduleOption = await screen.findByRole('button', { name: /reschedule/i });
        fireEvent.click(rescheduleOption);

        // Verify public_decline_enrollment was NOT called
        const declineRpcCalls = mockRpc.mock.calls.filter(call => call[0] === 'public_decline_enrollment');
        expect(declineRpcCalls.length).toBe(0);

        // Verify secure contact screen is shown
        expect(await screen.findByText(/Need to reschedule or withdraw\?/i)).toBeInTheDocument();
        expect(screen.getByText(/ivasyliev@partnershipcork.ie/i)).toBeInTheDocument();

        // Verify mailto link is present
        const mailtoLink = screen.getByRole('link', { name: /open email app/i });
        expect(mailtoLink).toHaveAttribute('href', expect.stringContaining('mailto:ivasyliev@partnershipcork.ie'));
        expect(mailtoLink.getAttribute('href')).toContain('Safe%20Pass');
    });

    it('allows returning back to confirmation form from the contact screen', async () => {
        render(<ConfirmationPage />);

        await waitFor(() => {
            expect(screen.getByText(/Safe Pass/i)).toBeInTheDocument();
        });

        const emailInput = screen.getByPlaceholderText(/your\.email@example\.com/i);
        fireEvent.change(emailInput, { target: { value: 'peter@example.com' } });

        const declineBtn = screen.getByRole('button', { name: /can't attend/i });
        fireEvent.click(declineBtn);

        const withdrawOption = await screen.findByRole('button', { name: /withdraw/i });
        fireEvent.click(withdrawOption);

        // On contact screen, click Back
        const backBtn = await screen.findByRole('button', { name: /back to confirmation/i });
        fireEvent.click(backBtn);

        // Verify we are back on the form
        expect(screen.getByPlaceholderText(/your\.email@example\.com/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --run src/components/ConfirmationPage.test.tsx`  
Expected: FAIL (because `ConfirmationPage.tsx` currently calls `public_decline_enrollment` and does not yet have the `decline_contact` screen or mailto links).

- [ ] **Step 3: Commit failing test**

```bash
git add frontend/src/components/ConfirmationPage.test.tsx
git commit -m "test: add failing tests for secure decline contact workflow"
```

---

### Task 3: Implement Secure Decline / Reschedule Flow in ConfirmationPage

**Files:**
- Modify: `frontend/src/components/ConfirmationPage.tsx`

**Interfaces:**
- Consumes: `PageState` updated to include `'decline_contact'`, mailto parameters for coordinator.
- Produces: Updated `ConfirmationPage` component rendering the secure contact view on reschedule/withdraw, with clipboard copy helpers and zero anonymous decline RPC invocations.

- [ ] **Step 1: Update ConfirmationPage state and remove anonymous decline RPC**

In `frontend/src/components/ConfirmationPage.tsx`:
1. Update `PageState` type:
```typescript
type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error' | 'decline_confirm' | 'decline_contact' | 'decline_success';
```
2. In `handleDeclineAction(action: DeclineActionType)`:
   - Check email validity.
   - If students exist with this email, pick the matching student name.
   - Set `pendingDeclineAction(action)`.
   - Set `state('decline_contact')`.
   - **Do NOT call** `supabase.rpc('public_decline_enrollment')`.
3. In `handleConfirmSelected()`:
   - When `pendingDeclineAction` is active, transition to `'decline_contact'` for the selected student instead of calling `public_decline_enrollment`.

- [ ] **Step 2: Implement the `decline_contact` UI view**

Render the secure contact screen with:
- Icon: `Mail` or `AlertCircle` with clean badge.
- Header: `Need to reschedule or withdraw?`
- Security note: `To protect registrations from unauthorized cancellation, reschedule and withdrawal requests are handled directly by our training coordinator.`
- Action summary chip: `Action requested: Reschedule for next group` or `Withdraw from course`.
- Pre-filled mailto anchor:
```typescript
const studentName = matchedStudents.find(s => selectedStudentIds.has(s.student_id))
    ? `${matchedStudents.find(s => selectedStudentIds.has(s.student_id))?.first_name} ${matchedStudents.find(s => selectedStudentIds.has(s.student_id))?.last_name}`.trim()
    : (matchedStudents.length === 1 ? `${matchedStudents[0].first_name} ${matchedStudents[0].last_name}`.trim() : '');

const actionLabel = pendingDeclineAction === 'reschedule' ? 'Reschedule Request' : 'Withdrawal Request';
const subject = encodeURIComponent(`[${actionLabel}] ${courseName}${studentName ? ` - ${studentName}` : ''}`);
const bodyText = `Hello Ihor,

I am registered for ${courseName}${courseDate ? ` on ${formatCourseDate(courseDate)}` : ''}.
I would like to request to ${pendingDeclineAction === 'reschedule' ? 'reschedule to a future course date' : 'withdraw from this course'}.

Student Name: ${studentName || 'Not specified'}
Email: ${email}

Thank you.`;

const mailtoUrl = `mailto:${ORGANIZER_EMAIL}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
```
- Primary button styled with `ExternalLink` / `Mail`: `Open Email App` (`href={mailtoUrl}`).
- Fallback copy section:
  - Copy coordinator email (`ivasyliev@partnershipcork.ie`).
  - Copy message template button with temporary `Copied!` state feedback.
- Secondary button: `Back to Confirmation` (`onClick={() => { setState('form'); setPendingDeclineAction(null); }}`).

- [ ] **Step 3: Run the unit test to verify it passes**

Run: `npm.cmd test -- --run src/components/ConfirmationPage.test.tsx`  
Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add frontend/src/components/ConfirmationPage.tsx frontend/src/components/ConfirmationPage.test.tsx
git commit -m "feat(security): route course decline requests to direct coordinator email"
```

---

### Task 4: Comprehensive Regression Testing & Quality Verification

**Files:**
- Test all: `frontend/`

- [ ] **Step 1: Run full frontend test suite**

Run: `npm.cmd test -- --run` in `frontend/`  
Expected: 31 passed test files (198+ tests passing), 0 failures.

- [ ] **Step 2: Run linter and typecheck**

Run: `npm.cmd run lint` (or `npx.cmd tsc --noEmit`) in `frontend/`  
Expected: Clean exit code 0.

- [ ] **Step 3: Commit any test adjustments or polish**

```bash
git status
# If clean, proceed to completion.
```
