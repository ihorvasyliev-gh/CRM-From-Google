# CRM System 🚀

A modern CRM dashboard for managing courses, enrollments, and student data. Built with **React**, **TypeScript**, and **Supabase**.

## Key Features 

- **Dashboard Overview**: Real-time stats on pending enrollments, active courses, and recent activity.
- **Kanban Enrollment Board**: Drag-and-drop workflow for tracking student progress (Invited → Confirmed → Completed).
- **Course Management**: Create, edit, and manage courses with multiple language variants.
- **Automated Document Generation**: Create personalized Word documents (certificates, letters) using templates.
- **Google Sheets Sync**: Seamless 2-way data synchronization with Google Sheets via Automation scripts.
- **Secure Authentication**: Role-based access control powered by Supabase Auth.
- **Responsive UI**: Optimized for desktop and tablet usage with Tailwind CSS.

## Tech Stack 🛠️

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Lucide-React
- **Backend**: Supabase (PostgreSQL, Storage, Auth)
- **Automation**: Google Apps Script
- **Deployment**: Cloudflare Pages

## Google Apps Script

The `google-apps-script/` directory contains the logic for syncing data between Google Sheets and Supabase.
- **Setup**: Deploy the script via [Google Apps Script](https://script.google.com).
- **Configuration**: Set `SUPABASE_URL` and `SUPABASE_KEY` in the script properties.

## Getting Started 🏁

### Prerequisites

- Node.js (v18+)
- Supabase account

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   ```

2. **Install Frontend Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in `frontend/` based on `.env.example`:
   ```env
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```

## Deployment 🚀

The frontend is configured for deployment on **Cloudflare Pages**.
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
