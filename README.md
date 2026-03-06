# CRM System 

This repository contains a full-featured CRM (Customer Relationship Management) system tailored for managing courses, student enrollments, and document generation.

---

## 👨‍💻 For Regular Users (Non-Technical Overview)

Welcome to your new digital control center! This CRM system is designed to make your daily tasks of managing educational programs as easy as possible. You don't need any programming knowledge to use it.

**What can this system do for you?**
- **Real-time Enrollment Management:** Easily see who is signed up for which course. You can move students between different statuses (like "Requested", "Invited", "Confirmed", or "Completed") using a simple and intuitive board. Thanks to real-time synchronization, any changes (like a participant confirming their attendance via a link) instantly reflect on your board without needing to refresh the page.
- **Smart Email Invitations:** The system helps you send beautiful HTML emails to clients (compatible with Outlook as well). Emails are automatically populated with individual data and include dynamic shortcodes like a unique confirmation link `{confirmationLink}`, course title, and date.
- **Short Confirmation Links:** Long, ugly links are a thing of the past. Users receive unique short tokens via email for confirmation.
- **Document & Attendance Sheet Generation:** Stop manually typing out certificates! 
  - Upload your standard Word document template.
  - You can use an **Attendance Sheet** template, which supports automatic data population for up to 34 students per document.
  - The system compiles a batch of personalized documents into a smart-named ZIP archive (e.g., `[Course Name] [Current Date].zip`).
- **Student Prioritization:** Mark important students with a priority flag so they always appear at the top of the list.
- **Smart Date Handling:** The system remembers dates you've invited students to courses, making it easy to re-select dates with one click.
- **Powerful Search and Filtering:** Search by names and contacts, filter by enrollments and languages in a couple of clicks, and perform bulk selections.
- **Template Configuration:** Set a default email template in system settings so you don't have to type the same text twice.
- **Google Sheets Integration:** The system automatically communicates with your Google Sheets, performing two-way synchronization for reliable backups.
- **Secure Access:** Secure login ensures that your student data remains completely private.

---

## 🛠️ For Developers (Technical Overview)

This project is built using a modern, scalable, and type-safe web stack. It uses a serverless architecture where the frontend communicates directly with Supabase for data and authentication.

### Core Tech Stack
- **Frontend Framework:** [React 18](https://react.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/) for robust static typing.
- **Build Tool:** [Vite](https://vitejs.dev/) for lightning-fast Hot Module Replacement (HMR) and optimized builds.
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) for utility-first, responsive styling. UI icons are provided by `lucide-react`.
- **Routing:** [React Router v6](https://reactrouter.com/) for seamless client-side navigation.

### Backend & Infrastructure
- **BaaS (Backend as a Service):** [Supabase](https://supabase.com/)
  - **Database:** PostgreSQL for relational data storage (Students, Courses, Enrollments, Tokens, Email Settings).
  - **Realtime:** Uses Supabase Realtime subscriptions to instantly reflect changes on the client (e.g., updating the dashboard when statuses change).
  - **Auth:** Supabase Auth for secure, role-based user authentication.
  - **Storage:** Supabase Storage for hosting `.docx` templates used in document generation.
  - **RPC (Database Functions):** Implemented SQL stored procedures (e.g., `create_confirmation_token`, `resolve_confirmation_token`) to manage tokens and enable short link functionality.
- **Hosting/Deployment:** Configured for deployment on **Cloudflare Pages**.

### Key Libraries & Functionality
- **Document Generation (Client-Side):** The system generates and populates `.docx` files completely client-side using a combination of `docxtemplater`, `pizzip`, `jszip`, and `file-saver`. This allows for complex template mapping (including lists) without hitting a backend server.
- **Email Generation:** Generates formatted `mailto` links with a rich HTML Body (Outlook supported).
- **Smooth UI/UX:** Animations, modals, toast notifications, bulk actions support, and contextual note editing for enrollments – designed for a premium user experience.

### External Integrations
- **Google Apps Script:** The `google-apps-script/` directory contains custom automation scripts that establish a two-way synchronization between Google Sheets and the Supabase PostgreSQL database.

---

## 🏁 Getting Started (Local Development)

### Prerequisites
- Node.js (v18+)
- A Supabase account and project

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   ```

2. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the `frontend/` directory based on the provided `.env.example`:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

### Backend Setup (Supabase)
Ensure your Supabase project is configured with the necessary tables (`students`, `courses`, `enrollments`, `confirmation_tokens`, `invite_dates`, `settings`, etc.) and storage buckets (`templates`). The RLS (Row Level Security) policies should be configured to allow authenticated users to perform CRUD operations where appropriate.

## 🚀 Deployment

The frontend is optimized for deployment on **Cloudflare Pages**.
- **Build Command:** `npm run build`
- **Build Output Directory:** `frontend/dist`
