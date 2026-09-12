# Deploy checklist

## Supabase
1. Create a project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Confirm tables `shows`, `bookings`, `seats`, `booking_seats`, `booking_slips` exist.
4. Confirm Storage bucket `slips` exists.

## Vercel
Import this folder/repository as a Vite project.
Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY`
- optional `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-6`)

Build command: `npm run build`
Output directory: `dist`

## Important
The current SQL intentionally permits anonymous staff access because the requested workflow has no login screen. Before making the URL public, add Supabase Auth and change the RLS/storage policies to authenticated-only.
