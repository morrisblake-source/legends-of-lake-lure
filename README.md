# Legends of Lake Lure

Golf trip website with live scoring, player profiles, historical scorecards,
contests, and a photo/video gallery.

- Live site: https://morrisblake-source.github.io/legends-of-lake-lure/
- Repository: https://github.com/morrisblake-source/legends-of-lake-lure
- Prepared release: **11.0.0** (owner sign-in release; additional-admin email delivery pending).
- Production baseline for this change: **10.3.0**, commit `a552e8edeeb103d8c20d71d46d5c6ddd76ad6c49`.

## Architecture

No package installation or bundler is required. GitHub Pages serves the repository
root using its generated Pages/Jekyll build and deployment workflow.

| File | Responsibility |
| --- | --- |
| `index.html` | Page structure, navigation, script/style references |
| `app.js` | UI, scoring calculations, Supabase access, admin and release checks |
| `data.js` | Initial players, courses, pairings, and Supabase browser configuration |
| `styles.css` | Mobile-first layout and styling |
| `release.json` | Advertised app version checked by running browsers |
| `manifest.webmanifest` | Installable web app identity, scope and icons |

The Supabase JavaScript v2 client loads from jsDelivr. Supabase provides database
reads/writes, realtime subscriptions, and gallery storage. Browser localStorage
remembers navigation and handicap snapshots; sessionStorage holds the admin/scoring
unlock state. The 2026 event is marked complete and scoring is locked by default.

The app uses `matches`, `hole_scores`, `team_hole_scores`, `players`,
`event_players`, `player_handicaps`, `contest_settings`, `ctp_entries`, and
`media_gallery`, plus the `trip-media` storage bucket. Event-scoped operations use
`lake-lure-2026`; individual/team hole-score reads currently load their full tables.
Some history and draft details are embedded in app code.

### Database and access

`supabase-schema.sql` is an **incomplete historical prototype**, not a current
migration or restore script. Referenced `SUPABASE-SETUP-*` files are not present in
this repository. Do not run the prototype SQL against production or recreate tables
from guesses. Current deployed schema and row-level security policies must be
inspected in Supabase before preparing any database work.

The browser admin PIN and scoring lock are UI controls, not database authorization.
Real access enforcement belongs in Supabase policies/authentication. Never place a
service-role key, secret key or privileged credential in this public repository.
Do not delete or rewrite production scores/history without explicit approval and a
verified data backup. This repository does not contain a production database backup.

## Development and verification

Start from the latest `main`, preserve a rollback checkpoint, and use a feature
branch. For a local static preview:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/. **Local previews still use the configured production
Supabase project.** For any write testing, substitute an isolated test backend or
stub network requests. Do not save scores, change pairings/handicaps, submit contests,
or upload/delete media against production during testing.

Run the offline checks (Node.js required):

```sh
node --check app.js
node --check data.js
npm ci
npm test
```

Before merging, check phone and desktop layouts, navigation, profiles, historical
scorecards, scoring calculations, and the affected workflows. Write paths require
an isolated environment. Syntax/unit checks alone do not prove all app behavior.

## Release and deployment

1. Prepare changes on a feature branch and show a diff/pull request with validation.
2. Keep `APP_RELEASE` in `app.js` and `release.json` identical. Bump local script,
   stylesheet and manifest cache versions in `index.html` when shipping changes.
3. Obtain approval before merging or publishing. A push/merge to `main` triggers
   the existing GitHub Pages build/deployment; no manual ZIP upload is needed.
4. Check the Pages workflow result and compare live release/app assets with the
   approved commit. Verify Supabase connectivity and preserved final results.
5. For a frontend rollback, revert the approved change on `main` and verify the
   resulting Pages deployment. A frontend rollback does not restore database data.

The release checker polls every minute and checks on startup, focus, and visibility
changes. It defers reloads during score entry or while an input/select is focused.
Release 10.1.1 attempts each advertised version only once per tab/session; a matching
`release` URL parameter also prevents repeated reloads when sessionStorage is blocked.
If a stale asset survives that attempt, the site stays usable instead of repeatedly
refreshing. After a failed automatic update, a manual browser reload may be needed.
The manifest adds app identity/icons; it does not provide offline functionality.

`README-8.2.txt` and `UPDATE-10.1.txt` are historical release notes. This README is
the current development/deployment guide.

## Finances (10.2.0)

The Finances tab follows Players. `finance-core.js` performs all ledger calculations
in integer cents; `finances.js` renders split costs, individual/team bets, compact
expandable balances, request details, revisions and soft cancellations. `finances.css`
is scoped to this tab. No payment tracking or individual sign-ins are used.

Split costs include the bill payer automatically. Bet amounts are per losing
player, with total winnings divided equally among selected recipients. Uneven cents
are assigned in sorted player-ID order. Every request nets to zero. All existing
players (including substitutes) are available; missing shared player names can still
be displayed by ID rather than dropping their balances.

Shared storage requires explicit approval to install
`migrations/20261017_finance_requests.sql`. It creates one new table only. The public
client can read/insert/update this table, consistent with the requested no-sign-in
flow; creator names are self-selected and UI edit restrictions do not verify identity.
The table has no public delete policy. This finance migration is already deployed.
The production UI disables saving with a setup notice if the table is unavailable.
Refresh or reopening the tab reloads shared data. Writes use revision matching to
reject concurrent edits; the prior request is retained in its change history.

The private testing site uses the same finance code with
`window.LL_FINANCE_SANDBOX=true`, sanitized player names/IDs, and isolated browser
storage. It does not load the Supabase client or make production database requests.
It is a finance sandbox with the navigation position shown, not a replacement for
full golf-page integration testing. Clear sandbox entries removes only test data.

Run `node --test tests/*.test.cjs` for the release and finance regression checks.

## Settle Up (10.3.0)

Inside Weekend Balances, Settle Up refreshes saved requests and produces a
read-only payment plan. It preserves net balances and uses exact subset dynamic
programming to maximize disjoint zero-sum groups, giving the minimum transaction
count (nonzero players minus zero-sum groups). It supports up to 20 nonzero player
balances, above the current trip roster; it shows an error beyond that limit rather
than claiming an approximate result is minimal. All math uses integer cents.

The plan shows transaction count, net total to settle and who pays whom. It moves
no money, writes no settlement/payment records, and leaves original requests intact.
A balance change invalidates an open plan; refresh failure hides it. Unsaved requests
are excluded. No database migration is needed. Tests include a separate exhaustive
solver as an oracle for randomized small cases and a 20-player performance case.


## Upcoming trip administration (11.0.0)

The public year selector keeps the completed 2026 event separate from the 2027 trip.
In Admin, select 2027 and work through Teams & Players, Round Formats, Match
Schedule and Pairings. Existing players start unassigned; no dates or team names
are inferred from the previous trip. Save teams to initialize the upcoming event.
Add Player requires a name and index, with optional team assignment. Unassigned
or inactive players cannot be paired. Negative indexes represent plus handicaps.

Formats are High/Low, Modified Alternate Shot, Better Ball and Singles. Match
counts normally follow team sizes; an admin can override them. Course choices use
only the saved tees: Apple Valley Blue, Bald Mountain Blue, and Bright's Creek
Long/Intermediate. Round dates, Eastern tee times, courses and tees provide match
defaults, with ten-minute tee intervals and individual match overrides.

Weather uses the selected course coordinates and exact local date/hour. It shows
an availability notice outside the forecast range instead of substituting another
day. Scored matches reject changes to participants, handicap indexes, formats,
points, courses and tees through the configuration RPC. Date corrections remain
possible. Revision checks prevent an admin from overwriting another admin's save.

`trip-core.js` holds pure setup/scoring rules; `trip-manager.js` provides upcoming
trip screens and admin integration; `trip-manager.css` scopes their styles.
The future finance ledger uses a separate event ID. The existing 2026 score,
roster, gallery, contest and finance rows are not copied or rewritten.

`db/trip_setup.sql` installs upcoming-trip storage and database-enforced admin
permissions. It has been applied using recorded Supabase migrations. The earlier
proposal granting anonymous configuration writes was rejected and replaced.
`ll_private.admin_emails` stores approved emails outside the public API. The owner
is seeded separately, never through a public first-user claim. Only the owner may
list, add or remove admins; no browser metadata or editable JWT claims authorize
access. Each privileged operation checks the current verified Supabase user
against the live allowlist, so removal takes effect on the next operation.

`admin-auth.js` uses Supabase magic links with persisted, refreshed sessions.
Existing PIN flags no longer authorize actions. Public read access, upcoming
score entry, finance requests, contest submissions and uploads remain available
without sign-in. Admin-only setup and completed-trip corrections require an
approved session. Public submissions use separate tables/RPCs and cannot overwrite
team setup. Sensitive functions live in the private schema with explicit grants;
public wrappers run with invoker privileges. Never expose private emails or
service-role credentials in client assets.

Before publishing, configure the exact Pages URL as an allowed auth redirect and
verify email delivery. Supabase's default sender is restricted to organization
team members; additional admins require a configured SMTP sender. No email is sent
when an owner adds an approved address: the new admin requests their own link.
The connector cannot manage these auth settings; the dashboard is required.
The exact Pages URL is now saved as both Site URL and an allowed redirect.
The dashboard confirms the built-in sender is in use. Owner sign-in can use the
organization member email; delivery to additional admins requires custom SMTP.
Admin Access displays this limitation explicitly. Set `senderReady` in
`admin-auth.js` only after custom delivery is configured and verified.


Validation includes 54 offline tests for finance regressions, setup/scoring rules,
mocked DOM workflows, sign-in/session behavior and owner-only email management.
Transaction-scoped tests on Supabase verified anonymous/unapproved denial, owner
protection, admin setup, stale revisions, public scoring, scored-match locks and
immediate revocation. Test records were rolled back. Original trip record counts
and hashes are unchanged. The security advisor's informational notice for the
private allowlist's lack of RLS policies is intentional: clients have no table
privileges and all operations pass through narrowly scoped private functions.
See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.
