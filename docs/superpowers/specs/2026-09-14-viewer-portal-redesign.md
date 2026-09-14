# Design Specification: Viewer Portal Redesign

**Date:** 2026-09-14  
**Target Users:** Curators / Case Managers (Viewer role)  
**Status:** Validated / Ready for Implementation Plan  

---

## 1. Problem & Objectives

### 1.1 Context
In the current system, users with the `viewer` role (curators, case managers, external partner coordinators) have access to two disconnected views:
1. `StudentLookup.tsx` (`/lookup`): A single-person search tool requiring exact queries, unable to browse, sort, or filter the student population across courses, statuses, and priorities.
2. `ViewerCourses.tsx` (`/courses`): A course catalog and per-course roster tool.

### 1.2 Case Manager Pain Points & Needs
Curators and case managers need to:
- Monitor and manage student pipelines across all courses in one place.
- See registration dates, notes/comments, priority tags, and queue positions immediately.
- Filter students by course, application status, priority, and date without manual cross-referencing.
- View detailed profiles without losing table filter state and pagination.
- Retain read-only safety (no accidental direct edits), but keep essential utility actions: contact copying, direct WhatsApp/call/maps links, Excel roster export, and course completion requests for admin approval.

### 1.3 Key Objectives
- **Modern 2-Tab Navigation Hub:** Provide clear, intuitive top-level navigation (`/students` and `/courses`).
- **Comprehensive Students Directory:** A full-featured table and card view with multi-attribute filtering (course, status, priority, sorting).
- **Slide-over Student Detail Drawer:** A seamless right-side drawer displaying contacts, timeline, all enrollments, notes, and completion request actions without losing directory context.
- **Enhanced Course Monitor:** Maintain and polish the course catalog, date/variant filtering, and bulk Excel export/completion request capabilities.
- **Strict Security & Performance:** All data queried through optimized, `SECURITY DEFINER` Supabase RPCs with zero direct table mutation exposure for viewers.

---

## 2. Information Architecture & Navigation

### 2.1 Route Structure
- `/students` — **Students Directory** (Default landing page for viewer role).
- `/courses` — **Course Monitor** (Course catalog and roster inspection).
- `/lookup` — Automatic redirect to `/students` (backwards compatibility).
- `*` — Fallback redirect to `/students`.

### 2.2 Global Header (`App.tsx`)
A glassmorphic header tailored for the viewer role:
- **Left:** CRM branding badge with `Viewer Portal` tag.
- **Center:** Two prominent pill tabs with active indicators and icons:
  - 👥 **Students** (`/students`)
  - 📚 **Courses** (`/courses`)
- **Right:**
  - Dark / Light mode toggle.
  - User identity badge & Logout button.

### 2.3 Mobile Navigation (`MobileBottomNav.tsx`)
On mobile viewports, the bottom navigation bar presents clear touch targets:
- **Students** (Users icon)
- **Courses** (BookOpen icon)
- **Theme toggle** (Sun / Moon icon)

---

## 3. Component Details & Interactions

### 3.1 Component 1: Students Directory (`frontend/src/components/ViewerStudentsDirectory.tsx`)

#### A. Search & Filter Bar
- **Instant Search Input:** Debounced (250ms) search supporting multi-token matching across:
  - First name, Last name, Combined full name
  - Email address
  - Phone number
  - Eircode
  - Clear button `(X)` when text is present.
- **Course Filter Dropdown:**
  - `All Courses` (default)
  - Dynamically populated from active courses (`get_viewer_courses`).
- **Status Filter Pills:**
  - Quick toggle options: `All`, `Requested (Queue)`, `Invited`, `Confirmed`, `Completed`.
- **Priority Filter Toggle:**
  - Pill button `⭐ Priority Only` (toggles boolean filter).
- **Sorting Options:**
  - `Newest Registration First` (default, `date_desc`)
  - `Oldest Registration First` (`date_asc`)
  - `Queue Position / Priority` (`queue`)
  - `Student Name (A-Z)` (`name_asc`)
- **Active Filters Bar & Counters:**
  - Results count display (e.g. `Showing 42 students`).
  - `Reset All Filters` button visible whenever any filter/search is active.

#### B. Data Table (Desktop Viewport)
Responsive table with subtle hover effects and clear typography:
1. **Student:** Avatar with deterministic gradient, Full Name, clickable phone/email icons.
2. **Primary Course & Status:** Course name badge, status badge (`Requested`, `Invited`, `Confirmed`, `Completed`, `Rejected`, `Withdrawn`). If the student has multiple enrollments, a `+N more` pill is rendered.
3. **Queue & Priority:**
   - Gold star badge `⭐ Priority` if `is_priority = true`.
   - Blue queue pill `#N in queue` if status is `requested`.
4. **Registration Date:** Formatted Irish date (`DD/MM/YYYY`).
5. **Notes & Flags:** Comment bubble icon `💬 N` showing the count of coordinator notes/flags.
6. **Actions:** `View Details →` button; entire row is clickable.

#### C. Mobile Cards View (< 768px Viewport)
For mobile screens, table rows transform into clean card components displaying:
- Avatar + Name + Priority Star
- Course name & Status badge
- Registration date & Queue position
- Tap anywhere to open the slide-over drawer.

#### D. Loading & Empty States
- Animated skeleton placeholders matching the table row layout during query fetches.
- Descriptive empty states:
  - When no results match active filters: "No students match your selected filters" with a direct "Reset filters" button.
  - When directory has no records: "No students found in the database".

---

### 3.2 Component 2: Student Detail Slide-over Drawer (`frontend/src/components/StudentDetailDrawer.tsx`)

A drawer anchored to the right side of the screen (`fixed inset-y-0 right-0 z-50`), with smooth slide-in transition and backdrop blur.

#### A. Drawer Header
- Large student avatar with deterministic gradient.
- Full Name.
- Registration metadata: "Added on DD/MM/YYYY".
- Close actions: Close `(X)` button, clicking backdrop, or pressing `Esc`.

#### B. Quick Contact Panel
- **Email:** Displayed with single-click copy button and toast confirmation.
- **Phone:** Displayed with copy button, direct `tel:` link, and direct WhatsApp web/app link (`wa.me/<cleaned_phone>`).
- **Address & Eircode:** Clickable Google Maps link generated via `formatGoogleMapsUrl(address, eircode)`.
- **Date of Birth:** Formatted date display.

#### C. Course Enrollments Section
Chronological list of all courses the student is enrolled in or requested:
- Course name and course variant (cleaned via `cleanVariant`).
- Status badge with corresponding color and icon.
- **Queue Position:** Displayed if status is `requested`.
- **Milestone Dates:**
  - Registration date (`created_at`)
  - Invited date (`invited_date` / `invited_at`)
  - Confirmed date (`confirmed_date` / `confirmed_at`)
  - Completed date (`completed_date` / `completed_at`)
- **Completion Request Action:**
  - If status is `confirmed`, display a prominent `Request Completion` button.
  - Clicking opens a completion date picker modal.
  - On submit, dispatches `useRequestCompletion` mutation to register a pending approval for administrators.
  - Shows pending status tag if a request is already awaiting admin approval.

#### D. Notes & Flags Section
- List of coordinator comments and flags linked to the student.
- Shows timestamp, author/context, and note content.
- Read-only display for viewers.

---

### 3.3 Component 3: Course Monitor & Roster (`ViewerCourses.tsx`)

#### A. Catalog View
- Searchable grid of course cards.
- Real-time counters:
  - Total participants
  - Requested (in queue)
  - Invited
  - Confirmed
  - Completed
- Click on any card opens the detailed roster view for that course.

#### B. Course Roster View
- Breadcrumbs: `← All Courses / <Course Name>` for fast return.
- Status tabs: `All`, `Confirmed`, `Requested`, `Invited`, `Completed`.
- Filters: Variant dropdown, Date dropdown (matching confirmed/invited dates).
- Sorting: Queue order (priority first, registration date second), Date, Name.
- Actions:
  - Multi-select checkboxes (per student and select all).
  - Bulk "Request Completion" for selected confirmed students.
  - "Export to Excel" generating a formatted spreadsheet of the current filtered roster.

---

## 4. Backend & Data Layer

### 4.1 Supabase Migration (`supabase/54_viewer_students_directory_rpc.sql`)
Create a dedicated `SECURITY DEFINER` function for the students directory:

```sql
CREATE OR REPLACE FUNCTION public.get_viewer_students_directory(
    p_search TEXT DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_priority_only BOOLEAN DEFAULT FALSE,
    p_sort_by TEXT DEFAULT 'date_desc',
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    eircode TEXT,
    dob DATE,
    created_at TIMESTAMPTZ,
    primary_course_name TEXT,
    primary_course_id UUID,
    primary_status TEXT,
    primary_course_variant TEXT,
    primary_queue_position INT,
    is_priority BOOLEAN,
    total_enrollments INT,
    notes_count INT,
    total_count BIGINT
) AS $$
...
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Security & Permissions:
- `REVOKE EXECUTE ON FUNCTION public.get_viewer_students_directory(...) FROM PUBLIC;`
- `GRANT EXECUTE ON FUNCTION public.get_viewer_students_directory(...) TO authenticated;`
- Strict role check: ensures caller is an authenticated session.
- Exposes only sanitized participant directory fields; sensitive system tokens remain hidden.

### 4.2 Existing RPC Functions Utilized
- `get_viewer_courses()`: Course list and stats.
- `get_viewer_course_roster(...)`: Per-course roster with queue ordering.
- `get_student_detail_restricted(p_student_id)`: Fetches full student profile, all enrollments, and flags for the detail drawer.
- `request_completion_approval(...)`: Submits completion requests into `pending_approvals`.

---

## 5. Error Handling & User Experience

- **Network & Server Errors:** Handled via React Query error boundaries with retry mechanisms and visible toast notifications.
- **Clipboard Fallbacks:** Direct feedback on copying contacts (`Email copied to clipboard!`).
- **Debounced Input:** Prevents excessive RPC calls while maintaining instant user feel (250ms debounce).
- **Zero Filter Lost:** Drawer slides in without unmounting or re-rendering the directory table, preserving all search terms and selected filters.

---

## 6. Verification & Test Plan

### 6.1 Automated Tests (Vitest & Testing Library)
1. **`ViewerStudentsDirectory.test.tsx`:**
   - Verify table renders students with name, course badge, status, priority, and date.
   - Verify typing in search input updates query with debouncing.
   - Verify selecting a course or status filter updates the filter state.
   - Verify clicking `⭐ Priority Only` toggles priority filtering.
   - Verify clicking a student row triggers `onSelectStudent` with student ID.
2. **`StudentDetailDrawer.test.tsx`:**
   - Verify drawer renders contact fields, enrollments timeline, and notes.
   - Verify copying phone/email triggers clipboard write.
   - Verify pressing `Esc` or clicking close button triggers `onClose`.
   - Verify clicking "Request Completion" opens date modal.
3. **`App.test.tsx` / Routing:**
   - Verify viewer route `/students` loads directory and `/courses` loads course catalog.
   - Verify `/lookup` redirects to `/students`.

### 6.2 Manual Verification
- Log in with a viewer account (`role === 'viewer'`).
- Test search by name, phone, eircode.
- Filter by course, status, priority.
- Click a student row -> verify drawer opens smoothly.
- Test WhatsApp link, Maps link, copy contact.
- Navigate to Courses -> pick course -> filter roster -> export to Excel.
- Verify dark and light mode themes render cleanly across all new components.
