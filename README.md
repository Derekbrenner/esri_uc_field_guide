# SD Field Guide — Esri UC 2026

The crew's one-stop guide to the Esri User Conference in San Diego, July 10–17,
2026: the week's **schedule**, all the **food & drink** spots, **who's in town**,
and a **live map** where everyone can share their location in real time.

Built from the group's trip doc. A coastal survey-chart look — because this is a
guide about *where*.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). The map, food, schedule,
and crew all work immediately. Live location dots need Supabase — see below.

## Live location sharing

Attendees open the **Map**, pick their name, and tap **Start sharing**. Everyone
sees each other's dots update every ~15 seconds. It's powered by a free Supabase
project (one small table, realtime).

👉 **Setup:** follow [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) (~5 min). Until
keys are added the site runs fine — the share panel just says it's not connected.

Location data auto-expires 15 minutes after the last update and is deleted when
someone taps **Stop sharing**.

## Deploy to the web (Vercel)

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com): **Add New → Project**, import the repo.
   Framework preset **Vite** is auto-detected (build `npm run build`, output
   `dist`).
3. Add the two environment variables from `SUPABASE_SETUP.md`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under **Settings →
   Environment Variables**.
4. Deploy, and share the URL with the crew. On phones, "Start sharing" prompts
   for location permission — that needs the site served over HTTPS, which Vercel
   does automatically.

Netlify works the same way (build `npm run build`, publish `dist`, same env vars).

## Editing the content

Everything comes from plain data files — no CMS:

| File | What's in it |
| --- | --- |
| `src/data/venues.ts` | Food/drink spots, categories, notes, **map coordinates** |
| `src/data/schedule.ts` | Day-by-day itinerary + field-note tips |
| `src/data/attendees.ts` | The crew and their arrival/departure dates |

**Map coordinates** in `venues.ts` are best-effort downtown-San-Diego locations
so the map is useful out of the box. A few may be a block off — just edit the
`lat`/`lng` for any spot to nudge its pin.

## Stack

Vite · React · TypeScript · Leaflet (CartoDB dark basemap, OpenStreetMap data) ·
Supabase (realtime). No API keys needed for the map itself.
