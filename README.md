# Legends of Lake Lure — Live Scoring Site

## What is already working
- Mobile-first Cup dashboard
- 2026 Apple Valley locked pairings
- Gross-score entry for all four players
- High/Low match calculation using relative course handicaps
- Player database with GHIN links, current handicaps/course handicaps, and historical Lake Lure records
- Fuller → Nate Pratt injury toggle
- 2026 weekend pairing card
- Local persistence in the browser

## Important scoring configuration
The Apple Valley scoring engine currently uses hole number 1–18 as a temporary stroke-index order. Before live use, replace that with Apple Valley's official handicap/stroke index for each hole. This is deliberately not guessed.

## Shared live scoring
The prototype works immediately on one device using localStorage. For all golfers to see the same live scores, create a Supabase project and run `supabase-schema.sql`, then replace the localStorage adapter in `app.js` with Supabase reads/writes/realtime subscriptions. The database schema is included.

## Deployment
This is a static site, so it can be deployed to Vercel, Netlify, GitHub Pages, or any static host by uploading this folder. `index.html` is the entry point.

## Next recommended production steps
1. Add official hole pars and stroke indexes for all three courses.
2. Confirm whether Fuller or Pratt is playing.
3. Add the final Bald, Bright's Better Ball, and Singles matchups.
4. Connect Supabase and add a simple trip PIN/authentication.
5. Add completed 2024/2025 match-level history if desired, beyond the player totals already loaded.
