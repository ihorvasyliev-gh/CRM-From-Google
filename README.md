# CRM System 🚀

This repository contains a full-featured CRM (Customer Relationship Management) system tailored for managing courses, student enrollments, and document generation.

---

## 👨‍💻 For Regular Users (Non-Technical Overview)

Welcome to your new digital control center! This CRM system is designed to make your daily tasks of managing educational programs as easy as possible. You don't need any programming knowledge to use it. 

**What can this system do for you?**
- **Track Students & Enrollments:** Easily see who is signed up for which course. You can move students between different statuses (like "Invited", "Confirmed", or "Completed") using a simple and intuitive drag-and-drop board.
- **Course Management:** Keep all your course information organized in one place, including different language versions of the same course.
- **Automated Document Generation:** Stop manually typing out certificates or welcome letters! You can upload a standard Word document template, and the system will automatically create personalized documents for individual students or entire groups at once.
- **Google Sheets Sync:** The system automatically talks to your Google Sheets. When data updates here, it stays in sync, giving you a reliable and familiar backup.
- **Secure Access:** Log in securely to ensure your student data remains completely private.

Simply log into the dashboard using your browser from your computer or tablet, and start managing your workflow efficiently!

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
  - **Database:** PostgreSQL for relational data storage (Students, Courses, Enrollments).
  - **Auth:** Supabase Auth for secure, role-based user authentication.
  - **Storage:** Supabase Storage for hosting `.docx` templates used in document generation.
- **Hosting/Deployment:** Configured for deployment on **Cloudflare Pages**.

### Key Libraries & Functionality
- **Document Generation:** The system generates `.docx` files completely client-side using a combination of `docxtemplater`, `pizzip`, `jszip`, and `file-saver`. This allows for complex template filling without hitting a backend server.
- **Animations & Delight:** Standard UI animations, drag-and-drop interactions, and modern modal/toast components for a premium user experience.

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
Ensure your Supabase project is configured with the necessary tables (`students`, `courses`, `enrollments`) and storage buckets (`templates`). The RLS (Row Level Security) policies should be configured to allow authenticated users to perform CRUD operations.

## 🚀 Deployment

The frontend is optimized for deployment on **Cloudflare Pages**.
- **Build Command:** `npm run build`
- **Build Output Directory:** `frontend/dist`
