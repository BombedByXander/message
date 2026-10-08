# Blink

A dark, snap-style messaging web app: accounts, profile pictures, friends, realtime chat,
view-once photo snaps (with captions and drawing), and 24-hour stories.
Plain HTML/CSS/JS plus Supabase. No build step, so it deploys to Vercel as a static site.

## Setup (about 5 minutes)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. This creates the tables, security rules, storage buckets, and realtime.
3. Optional but recommended for testing: **Authentication → Providers → Email → turn off "Confirm email"** so sign-ups work instantly.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Configure
Edit `config.js` and paste in those two values. The anon key is meant to be public;
Row Level Security in `schema.sql` is what protects the data. Never use the `service_role` key here.

### 3. Deploy to Vercel
1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo.
3. Leave **Framework Preset** as *Other*, with no build command and no output directory. `vercel.json` already handles it. Click **Deploy**.

### 4. Tell Supabase your site URL
**Authentication → URL Configuration**: set **Site URL** to your Vercel URL
(for example `https://message.vercel.app`) so email confirmation links point to the right place.

## Notes
- Camera access needs HTTPS, which Vercel provides. It also works on `localhost`.
- Snaps are view-once: opening one marks it opened, deletes the image from storage, and it can't be opened again.
- Stories expire after 24 hours. To also purge the files, see the optional `pg_cron` snippet at the bottom of `schema.sql`.
- Run locally with any static server, for example `npx serve .`.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Dark theme and layout |
| `app.js` | All app logic and Supabase calls |
| `config.js` | Your Supabase URL and anon key |
| `supabase/schema.sql` | Database, security, storage, realtime |
| `vercel.json` | Static deploy config and camera permission header |
