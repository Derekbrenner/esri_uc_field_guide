# Turning on live location sharing (≈ 5 minutes)

The site works without this — you just won't see live dots. Do these steps when
you want the map to show where everyone is.

## 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in.
2. **New project**. Pick any name/password/region (a US-West region is closest to San Diego).
3. Wait ~2 minutes for it to spin up.

## 2. Create the table
1. In your project: left sidebar → **SQL Editor** → **New query**.
2. Open `supabase.sql` from this repo, paste the whole thing, click **Run**.
   That creates the `attendee_locations` table, turns on realtime, and sets the
   access rules.

## 3. Grab your keys
1. Left sidebar → **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon / public** key.

## 4. Add the keys to the app
Copy `.env.example` to `.env.local` and paste your values:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Restart `npm run dev`. The share panel on the Map turns on — pick your name and
hit **Start sharing**.

For the deployed site (see `README.md`), add those same two variables in your
host's **Environment Variables** settings (Vercel: Project → Settings →
Environment Variables), then redeploy.

## A note on privacy / security
This uses one shared anon key for a small, trusted group, so anyone with the
site can read all dots and post their own. That's the right trade-off for a
crew of colleagues — it needs no logins. Locations auto-hide after 15 minutes
of no update and delete when someone taps **Stop sharing**. If you ever wanted
this locked down further (per-person auth, private group), that's a later step
and the data layer in `src/lib/supabase.ts` is where it would change.
