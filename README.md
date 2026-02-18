# Course CRM

A lightweight CRM system for managing students and course enrollments, built with React + Vite + Supabase.

## Project Structure

```
CRM System/
├── frontend/            # React/Vite app (deployed to Cloudflare Pages)
├── google-apps-script/  # Code.gs — syncs Google Sheets → Supabase
└── supabase/            # schema.sql — database schema
```

## Local Development

1. Copy `.env.example` to `frontend/.env` and fill in your Supabase credentials.
2. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Deployment

The frontend is deployed on **Cloudflare Pages**:
- **Root directory**: `frontend`
- **Build command**: `npm run build`
- **Build output**: `dist`
- **Environment variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Google Apps Script

The `google-apps-script/Code.gs` file syncs data from Google Sheets to Supabase.
Deploy it via [Google Apps Script](https://script.google.com) and set the required script properties:
- `SUPABASE_URL`
- `SUPABASE_KEY`
