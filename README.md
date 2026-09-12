# Event Manager — Vercel + Supabase

Staff-facing booking, seat assignment and ticket check-in app for On Stage.

## Stack
- React + Vite
- Supabase Postgres + Storage + Realtime
- Vercel Functions for OCR

## Local setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Create a Storage bucket named `slips` (the SQL also attempts to configure it).
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `ANTHROPIC_API_KEY`.
5. Run `npm install` then `npm run dev`.

The browser only receives the Supabase publishable key. The Anthropic key is used only by the Vercel server function `/api/ocr.mjs`.
