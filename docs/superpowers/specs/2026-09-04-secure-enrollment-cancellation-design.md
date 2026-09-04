# Design Specification: Secure Enrollment Cancellation & Rescheduling

**Date:** 2026-09-04  
**Author:** Pair Programming Agent & Project Lead  
**Status:** Validated / Ready for Implementation  

---

## 1. Problem & Threat Model

### 1.1 Vulnerability Overview
Currently, the public course confirmation page (`ConfirmationPage.tsx`) allows any visitor with the course link (e.g. `/c/:token` or `/confirm?course_id=...`) to enter an arbitrary student's email address and execute cancellation actions:
- **Reschedule**: resets the enrollment status to `'requested'`.
- **Withdraw**: marks the enrollment as `'withdrawn'`.

Both actions execute via the database RPC function `public_decline_enrollment` which is granted execution rights to the `anon` role.

### 1.2 Threat Scenario
If an unauthorized third party (e.g., an acquaintance, malicious peer, or prankster) knows or discovers that a person ("Petya") is registered for a course and knows his email address, the attacker can:
1. Open the course link.
2. Enter `petya@example.com`.
3. Click "I can't attend this date" -> "Withdraw from course entirely".
4. The database immediately revokes Petya's confirmed place on the course.
5. The attacker remains completely anonymous; Petya loses his course slot without any notification or consent.

### 1.3 Constraints
- The organization uses **Microsoft 365** (`@partnershipcork.ie`) for institutional email, which cannot be spoofed or relayed through free third-party Google Apps Script without failing SPF/DKIM/DMARC.
- Third-party transactional mail providers require DNS records or paid subscriptions not available in this scope.
- Course participants should not be forced to create accounts or passwords for simple community courses.
- Attendance confirmation should remain frictionless and instant.

---

## 2. Architectural Solution: Verified Direct Communication Channel

Instead of permitting unauthenticated anonymous state mutations in the database, all destructive actions (withdrawal and rescheduling) are moved to a verified communication channel: **direct email from the participant's authenticated email client to the course organizer**.

### 2.1 Security Principles
1. **Proof of Ownership via Mail Client**: A participant sending an email from their personal client (`mailto:`) proves ownership of their email address. An unauthorized third party cannot forge the sender address from Petya's mailbox.
2. **Database Hardening (Defense in Depth)**: `REVOKE EXECUTE` on `public_decline_enrollment` from `anon` and `public`. Even if an attacker attempts to bypass the UI using developer tools (`curl` / `fetch`), the database will reject the call with `403 Forbidden`.
3. **Audited Coordinator Control**: The course coordinator (`ivasyliev@partnershipcork.ie`) receives the request directly, verifies the student's identity, and updates the status within the CRM admin interface.

---

## 3. Component Details & Changes

### 3.1 Database: Supabase Migration (`supabase/53_revoke_public_decline_enrollment.sql`)
- Revoke `EXECUTE` privileges on `public.public_decline_enrollment(text, uuid, text, uuid)` from `anon` and `public`.
- Ensure only `authenticated` users (CRM staff logged into the dashboard) can invoke `public_decline_enrollment`.

```sql
-- Revoke anonymous access to decline/withdraw RPC
REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) TO authenticated;
```

### 3.2 Frontend: `ConfirmationPage.tsx`
- **Remove Anonymous RPC Call**: Remove `supabase.rpc('public_decline_enrollment')` from the client.
- **Decline Modal / Screen Flow**:
  - When the user selects "I can't attend this date" and picks an action (`reschedule` or `withdraw`), navigate to a dedicated contact/instruction state (`decline_contact`).
  - **Interface Content**:
    - **Header**: "Need to reschedule or withdraw?"
    - **Security Note**: "To protect your registration from unauthorized changes, cancellation and rescheduling requests are handled directly by the course coordinator."
    - **Primary Action Button**: "Open Email to Coordinator" (triggers pre-filled `mailto:` link).
    - **Pre-filled Mailto Fields**:
      - `To`: `ivasyliev@partnershipcork.ie`
      - `Subject`: `[Reschedule Request] <Course Name> - <Student Name or Email>` (or `[Withdrawal Request] ...`)
      - `Body`:
        ```text
        Hello Ihor,

        I am registered for <Course Name> on <Course Date>.
        I would like to request to <reschedule to a future date / withdraw from this course>.

        Student Name: <First Last>
        Email: <Student Email>

        Thank you.
        ```
    - **Fallback for Webmail / Mobile Users**:
      - A copyable text box containing the coordinator's email (`ivasyliev@partnershipcork.ie`) with a "Copy Email" button.
      - A "Copy Message Template" button with visual copied indicator.
    - **Back Button**: Allows returning to the confirmation screen in case of an accidental click.

### 3.3 Confirmation Flow (`public_confirm_enrollment`)
- Attendance confirmation remains available via the public page (`public_confirm_enrollment`), as confirming a place does not revoke a student's enrollment and carries minimal risk.

---

## 4. Verification Plan

### 4.1 Automated Tests
- Run existing frontend tests via `npm run test` or `npx vitest run` in the `frontend` directory to ensure no regressions.
- Add/update unit test in `ConfirmationPage.test.tsx` (or new test file) verifying:
  - Selecting reschedule/withdraw triggers the mailto view instead of calling `supabase.rpc('public_decline_enrollment')`.
  - Mailto URL contains correctly encoded subject, recipient, and body text.
  - Copy buttons correctly trigger clipboard API.

### 4.2 Manual Verification
1. **Anonymous Decline Denial**: Test calling `public_decline_enrollment` using an unauthenticated Supabase client; confirm it returns a permission denied error.
2. **Decline Flow UI**:
   - Open `/c/:token` in a browser.
   - Enter an email and click "I can't attend this date".
   - Select "Reschedule for next group" -> verify the email action dialog appears with correct course details and prefilled `mailto:`.
   - Click "Open Email to Coordinator" -> verify default mail app opens with expected content.
   - Test "Copy Message Template" -> verify clipboard receives the text.
3. **Confirm Attendance Flow**:
   - Confirm attendance continues to work smoothly without interruption.
