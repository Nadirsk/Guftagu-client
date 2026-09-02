# Guftagu Console — admin panel

Vue 3 · TypeScript · Vite · Pinia · Vue Router · Tailwind 4 · Element Plus

**Built: A.1 + A.11** (auth & delegation), **A.3** (users & wallets), **A.2** (dashboard),
**A.4** (rooms & catalogue), **A.6** (gifts, VIP & cosmetics), **A.7** (economy, payouts &
reconciliation), **A.9** (events, draws & rankings) — all of M2's admin scope, plus M3's room
epic, both of M4's, and M5's. Everything else is deliberately absent — see
[Build state](#build-state).

---

## Running it

Two processes. The API must be up or the panel has nothing to talk to.

```bash
# 1 — API (in backend/)
php artisan serve --host=127.0.0.1 --port=8001

# 2 — queue worker (in backend/) — CSV exports stay "queued" forever without it
php artisan queue:work

# 3 — panel (here)
npm run dev
```

The dashboard reads a materialised rollup, not the ledgers. Populate it after seeding:

```bash
php artisan stats:rollup --days=90      # backfill
php artisan stats:rollup                # nightly: yesterday + today
```

| | |
|---|---|
| Panel | <http://localhost:5173> |
| API | <http://localhost:8001> |
| Swagger | <http://localhost:8001/api/documentation> |

> **Ports.** 8000 belongs to the old FastAPI app, so the API runs on **8001**. The panel
> uses Vite's default **5173**, pinned with `strictPort: true` — by default Vite silently
> moves to the next free port, which leaves a stale tab pointed at a dead one and produces
> a `net::ERR_CONNECTION_REFUSED` that looks exactly like an API failure. Failing loudly is
> kinder.

Vite proxies `/api` → `127.0.0.1:8001`, so the browser stays on one origin. There is no
CORS configuration in dev, and the same relative URLs work behind a single nginx vhost in
production.

### Signing in

The base seeder creates one account — the Super Admin — because nothing else can exist
before someone creates it:

| Role | Email | Password |
|---|---|---|
| Super Admin | `super@guftagu.local` | `Guftagu@2026` |

**You cannot grant permissions to yourself**, so with only that account the whole
delegation UI has no target and cannot be exercised. For click-testing, add one account per
role:

```bash
php artisan db:seed --class=DemoAdminsSeeder
```

| Role | Email | MFA at sign-in |
|---|---|---|
| Admin | `admin@guftagu.local` | yes — the role policy requires it |
| Manager | `manager@guftagu.local` | no |
| Moderator | `moderator@guftagu.local` | no |

Same password. That seeder refuses to run outside `local`/`testing`.

> Setting `mfa_enabled: false` on an account does **not** switch MFA off. The role policy
> governs and a per-account flag can only add to it — which is why the Admin still gets a
> challenge.

### The MFA code in local

`ADMIN_MFA_STATIC_OTP=123456` in `backend/.env` pins every admin OTP — login *and*
high-risk re-auth — to **`123456`**, so testing does not mean reading the mail log on
every sign-in. The panel also fills the field in automatically when running under
`vite dev`; **“local: re-read code”** refetches it if you need to.

This is inert outside local, by construction rather than by convention:

- `AdminAuthService::nextOtp()` checks `app()->environment('local')` **first**, before it
  looks at the configured value, so setting the variable on a deployed box does nothing.
- A value that is not exactly six digits is discarded and a random code used.
- Every use writes a `warning` to the log, so nobody reading logs has to wonder whether
  MFA was real for a given sign-in.
- Three tests hold this down, including `a_static_otp_is_ignored_outside_local`.

Leave `ADMIN_MFA_STATIC_OTP` empty to get real random codes; the dev-only
`GET /admin/dev/last-otp` still reads them out of the mail log.

---

## Design

The console is built as an **audio control desk**, because that is what Guftagu is: live
voice rooms. The metaphor is not decoration — it maps onto what this module actually does.

| Desk | Console |
|---|---|
| the default mix | a role baseline |
| a channel pushed up | a direct grant |
| **a hard mute overriding the mix** | an explicit deny |
| a broadcast shift | a scoped grant — the spec's own example runs 18:00–02:00 |
| a guard over a high-consequence switch | the hatched edge on a `high` risk key |

So permissions render as **channel strips in module racks**, not a grid of checkboxes.

- **Palette** — slate panelwork (`#10151C` → `#2F3C52`), signal-lamp amber `#F0A93B` for
  granted/live, `#E0574F` reserved strictly for deny and destructive, teal `#3FBFA0` to
  confirm. Dark is a working decision, not a fashion one: moderators work the night shift.
- **Type** — Archivo for UI; **JetBrains Mono for permission keys**, because
  `rooms.force_close` is a dotted identifier and alignment is what lets you scan 79 of them.
- Colour never carries meaning alone. Every lamp is paired with a text origin tag
  (`ROLE`, `DIRECT`, `DENIED`), so state survives being read without colour.

---

## How it is put together

```
src/
├── lib/api.ts          axios: envelope unwrapping, ApiError with the backend's error code,
│                       session-loss detection
├── lib/permissions.ts  v-permission directive + the permission-driven nav model
├── stores/auth.ts      session, resolved permissions, idle watch
├── router/index.ts     route guard reading meta.permission
├── components/         AppShell, SideRail, and the desk primitives:
│                       StateLamp · PermissionStrip · ModuleRack
└── views/              one per screen
```

**Errors carry codes, not prose.** `ApiError.code` is the backend's own
`error.code`, so the grant screen branches on `MFA_REQUIRED` (open the re-auth dialog and
retry in place) versus `PERMISSION_ESCALATION_DENIED` (name the keys that were refused)
instead of pattern-matching English.

**`v-permission` is presentation only.** Every key it hides is enforced again server-side.
The A.11 acceptance criteria are explicit that hiding an option in the UI proves nothing —
so the grant screen is built to *explain* a server refusal, not to prevent one.

---

## Ticket coverage

| Ticket | What | Where |
|---|---|---|
| GFT-008 | Login, MFA step, error states, remember-device | `views/LoginView.vue` |
| GFT-009 | Auth store, axios interceptors, 401 handling, logout-on-idle | `stores/auth.ts`, `lib/api.ts` |
| GFT-010 | Profile and change-password | `views/AccountView.vue` |
| GFT-011 | Security settings — timeout, 2FA per role | `views/SecurityView.vue` |
| GFT-124 | Grant UI — module racks, only-grantable rendering | `views/PanelUserView.vue` |
| GFT-125 | Route guard, `v-permission`, permission-driven sidebar | `router/`, `lib/permissions.ts`, `components/SideRail.vue` |
| GFT-126 | Effective-permission viewer showing origin | `views/PanelUserView.vue`, `components/PermissionStrip.vue` |
| GFT-127 | Panel users — create, assign role, suspend | `views/PanelUsersView.vue` |
| GFT-031 | User list — search, filters, pagination | `views/UsersView.vue` |
| GFT-032 | User detail — profile, wallet, KYC, history tabs | `views/UserDetailView.vue` |
| GFT-033 | KYC review, documents beside the decision | `views/UserDetailView.vue` |
| GFT-034 | Wallet adjustment — arithmetic shown, note required | `components/WalletAdjustDialog.vue` |
| GFT-019 | Dashboard tiles + counters refreshing every 5s | `views/OverviewView.vue` |
| GFT-020 | Revenue by stream | `components/charts/GroupedBars.vue` |
| GFT-021 | Signups line + retention cohort table | `components/charts/LineChart.vue` |
| GFT-022 | Export button | `views/OverviewView.vue` |
| GFT-043 | Live-rooms grid, 10s auto-refresh, filters | `views/RoomsView.vue` |
| GFT-044 | Room detail — seat map, members, actions | `views/RoomDetailView.vue` |
| GFT-045 | Categories and themes management | `views/RoomCatalogueView.vue` |
| GFT-063 | Gift manager — grid, create/edit, limited drops | `views/GiftsView.vue` |
| GFT-064 | VIP tier editor with a privileges matrix | `views/VipView.vue` |
| GFT-065 | Frames, badges and entrance effects | `views/VipView.vue` |
| GFT-075 | Rates with an effective-date timeline, packages | `views/EconomyView.vue` |
| GFT-076 | Commission slab builder with overlap feedback | `views/EconomyView.vue` |
| GFT-077 | Withdrawal queue — approve, reject, second approval | `views/PayoutsView.vue` |
| GFT-079 | Reconciliation report | `views/EconomyView.vue` |
| GFT-099 | Event builder, list and detail | `views/EventsView.vue`, `views/EventDetailView.vue` |
| GFT-100 | Ranking rules and live boards | `views/RankingsView.vue` |
| GFT-101 | Snapshot review and reward payout | `views/RankingsView.vue` |

---

## Build state

Built and wired to the real API: **auth**, **role & permission delegation**, **user &
wallet management**, and the **dashboard**.

Moderation, agency and CMS have no backend yet. Payment *capture* is also
absent — the economy is configurable and payouts are reviewable, but taking money needs
Razorpay credentials (CI-04). They appear in the
sidebar under *Not built yet*, marked unavailable — listed rather than hidden so the shape
of the finished console is visible, and not linked so they cannot 404. The same honesty
runs through the dashboard: the live-rooms tile shows `—` and "arrives with the rooms
module" rather than a zero, and the revenue chart says why every stream reads zero.

---

## Known gaps

Recorded so they are decisions, not surprises.

1. **The 2FA-per-role switches show seeded defaults, not live state.** The API has
   `POST /admin/auth/mfa/toggle/{role}` (write) but no matching read, so `SecurityView`
   starts from the documented defaults and reflects only what you change in that session.
   It says so on screen. A `GET` for the policy would fix it properly.
2. **`remember_device` is sent but does nothing.** The backend accepts and stores it;
   skipping the challenge for a known device is not implemented on either side.
3. **No token refresh.** `POST /admin/auth/refresh` does not exist (see the backend's
   known-gaps list), so an expired session means signing in again.
4. **Element Plus is imported in full** — 869 kB raw / 274 kB gzip in one chunk. Fine over
   an office connection; if that matters, `unplugin-vue-components` with the Element Plus
   resolver would cut it substantially, at the cost of some IDE/TS indirection.
5. **No component tests yet.** The backend has 48; this has none. The logic worth covering
   is `PermissionResolver`-adjacent: origin → lamp state, and the guard-error branching in
   `PanelUserView`.

---

## Chart colour is computed, not chosen

`src/components/charts/palette.ts` holds three series colours produced by running the
dataviz validator against this panel's surface:

```
node scripts/validate_palette.js "#BF831F,#5E7FC7,#00A47C" --mode dark --surface "#1A2230"
→ ALL CHECKS PASS   (also under --pairs all)
```

Two properties are load-bearing and easy to break:

1. **They are not the UI tokens.** The interface amber `#F0A93B` and teal `#3FBFA0` sit
   above the L 0.48–0.67 band a dark surface needs and *failed* the lightness check as
   fills. Darkening the teal pushed it under the 0.1 chroma floor, so it was re-saturated.
   Do not "tidy" these back to the UI values — re-run the validator instead.
2. **The order matters.** Amber and teal are tritan-confusable (ΔE 6.7), so blue sits
   between them and the confusable pair is never adjacent. A 6–8 ΔE is legal *only* with
   secondary encoding — which is why those charts always carry a legend, direct labels and
   2px gaps, and why the retention cells print the number inside the tint.

Charts are hand-rolled inline SVG rather than ECharts (which GFT-020 names). Two charts do
not justify ~1 MB, and the mark specs — 2px strokes, ≥8px hit targets, 2px surface gaps,
crosshair tooltips — are easier to hold exactly. Worth revisiting when M6 brings the full
analytics set.
6. **Retention is "still active after N days", not day-N retention.** True D1/D7/D30 asks
   whether someone was active *on* day N, which needs a per-day activity record; the only
   signal today is `users.last_active_at`. The API returns `measure: still_active_after`
   with a note, and the panel prints that note above the table — a familiar name over a
   different number would be worse than the gap.
7. **No live WebSocket tick.** A.2a's "within 5 seconds without a page reload" is met by
   polling `/dashboard/kpis` every 5s (the endpoint caches for 10s, so it is cheap).
   GFT-016's `kpi.tick` broadcast needs Reverb, which arrives with the realtime work in M3.
8. **Room listener counts are not live.** `listener_count` is denormalised into MySQL by
   the realtime layer every 10 s — and that layer (E.1) does not exist, so the figures are
   whatever was last written. `/admin/rooms/live` returns `realtime.available: false` and
   the grid prints the reason rather than implying a live feed.
9. **Force-close does not disconnect anyone yet.** The database state is authoritative —
   room marked `force_closed`, members marked out with durations recorded, seats vacated,
   both logs written — but pushing clients off the Agora channel needs E.1. The response
   says `broadcast.sent: false` rather than claiming otherwise.
10. **Gift and VIP prices are placeholders.** CI-02 (tier pricing, commission) and CI-06
    (gift artwork) are client inputs the SoW does not contain. Everything is seeded with
    working structure and no artwork, and lives in the database precisely so the real
    numbers need no code change. The panel says so on the VIP screen.
11. **`vip.manage` covers cosmetics too.** Frames, badges and entrance effects sit behind
    the same key as tiers rather than getting their own — they are the things a tier
    unlocks, and splitting them would mean a permission nobody would ever grant alone.
12. **No payment gateway.** A.7's configuration, payout review and reconciliation are
    built; capturing money, gateway webhooks and executing payouts are not — they need
    Razorpay credentials (CI-04) and belong to E.3. A withdrawal can be approved, which
    settles it in the ledger; actually sending the money is the missing half.
13. **Withdrawal policy numbers are placeholders.** The 1,000-diamond minimum and the
    ₹50,000 second-approval threshold are guesses pending CI-03, and both are editable
    from the panel rather than baked in.
14. **Ranking boards are computed, not live.** docs/02 §8 serves them from Redis ZSETs;
    that arrives with the realtime layer. Wealth and charm are derived from the wallet
    lifetime counters instead — which is where those scores come from anyway — and the
    board response says `source.live: false`. Snapshots and payouts are unaffected, since
    they read the snapshot rather than the live board.
15. **Room and agency leaderboards are not computable yet.** They need modules that do not
    exist, so the rules list returns `computable_board_types` and the panel greys the rest
    out rather than showing a board that would always be empty.
16. **Cosmetic event rewards are recorded, not granted.** Coins and diamonds move through
    the wallet ledger; frames, badges and VIP days have no user-inventory tables until D.7,
    so a claim row is written and the reward is marked `payable: false` rather than
    reporting a grant that did not happen.
