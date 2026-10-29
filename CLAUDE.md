# Freshket Sale Tracking — Project Instructions for Claude Code

## Project Overview

Internal web platform for Freshket sale team training tracking and enablement.

- **Auth**: Google OAuth via Firebase Auth, `@freshket.co` domain only. Block all other domains immediately. Firebase is used for sign-in only.
- **RBAC**: `sale` < `team_lead` < `manager` < `super_admin`
- **Demo mode**: `NEXT_PUBLIC_DEMO_MODE=true` bypasses the backend entirely, serves mock data
- **Security**: Never commit `.env`, `.env.local`, or any file with API keys / service account JSON

## Data Layer (branch `phase4-supabase`: Firestore → Supabase Postgres)

Status: code complete, **not yet deployed**. `main` still runs on Firestore. Before cutover: run `supabase/migrations/006_runtime_support.sql`, re-run `node scripts/migrate/run.mjs --apply` (data copy is a snapshot), and set Vercel env (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` server-only, `SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL`). Plan and gotchas: memory file `project_supabase_migration.md`.

- **Documents in, documents out**: the app still handles Firestore-shaped docs (camelCase, `id`, `Date`). `src/lib/server/docMap.ts` maps docs ↔ table rows; `store.ts` talks PostgREST with the service_role key.
- **All DB access is server-side.** Every table is RLS deny-all; the browser never holds a DB key. Browser → `/api/data/{query,get,write}` → `policies.ts` (rules ported from `firestore.rules`) → store.
- **Browser writes** go through `src/lib/data/collection.ts` (`save/patch/remove/saveMany/removeMany/get/findBy`). Never call `fetch('/api/data/...')` directly elsewhere.
- **Reads** use the `useFirestore.ts` hooks. There is no realtime: queries fetch once, poll every 60s (notifications 30s) while the tab is visible, and refetch on invalidation (`src/lib/data/live.ts`, `invalidation.ts`). A successful non-GET `authedFetch` outside `/api/data` and `/api/auth` invalidates everything automatically.
- **Identity**: `users.uid` is a stable **person id** (`csv-{employeeId}`, or the Firebase uid for someone HR never imported). `users.auth_uid` is the Firebase uid they sign in with. Login = `POST /api/auth/session`. Server routes must use the person id from `src/lib/server/auth.ts` gates (`requireStaff/Manager/SuperAdmin` → `gate.uid`), **never** `decoded.uid` directly.
- **Server routes** use `getStore()` (`src/lib/server/store.ts`), not Firebase Admin Firestore (removed). `firebase/admin.ts` only verifies ID tokens. Reuse `refreshUserStats` / `refreshManyUserStats` after changing training records; `store.claim` for first-writer-wins; `store.addCourseLearners` to add to a roster atomically.
- **PostgREST gotchas**: 1,000-row response cap (store pages automatically); `ilike` treats `_` as a wildcard (use `users.email_lc`); heterogeneous bulk upserts must be grouped by column set.
- **Partial merges**: `store.set(..., {merge:true})` updates the row if it exists and only inserts when it does not (an upsert is refused by Postgres when a NOT NULL column is missing, even for a row that exists). `store.setMany` with merge still upserts, so every document in it must carry the table's NOT NULL columns (the HR import always sends `email`).
- **Who decides "completed"**: a course with a graded post-test (`requiresPostTest`, lib/courses/completion.ts) is completed or failed by the grading route only; the data door refuses a client setting it. Courses without one finish by lessons.
- **What a learner (`sale`) sees**: other people's profiles are cut to `COLLEAGUE_PROFILE_FIELDS` and imported scores to their own, by `viewOf` in policies.ts at the data door. HR rank grants at most `manager`; `super_admin` is set by hand.
- **Testing against the real database**: clean up what you create, and know that submitting a quiz notifies the learner's manager — or EVERY team_lead/manager/super_admin when the learner has no `managerId` (22 people). A test learner with no manager spams real inboxes; delete those notifications afterwards.
- **Migrations** are run by the user in the Supabase SQL Editor (the Supabase MCP refuses statements containing `drop`). Keep each file idempotent.

## Slack DMs (private notifications)

Slack app manifest + setup in `docs/slack/`. `src/lib/notifications/slackDm.ts` sends DMs with `SLACK_BOT_TOKEN` (server-only) to a person's `users.slack_user_id`, which only a super_admin sets (Admin → Employees → Slack row; policy validates the id). Triggers: quiz submit and Shadow submit → `leadsOf` (line manager + team leads/managers, no everyone-fallback); Shadow review → the visit's observer (looked up server-side from `recordId` + the caller's own review, never from client text). Migration 008 must be run before deploying.

## Commands

- `npx vitest run` — unit tests (stand-in REST server, no DB needed) · `npx tsc --noEmit -p .` · `npx eslint src tests` · `npx next build`
- `node scripts/migrate/run.mjs [--apply]` — Firestore → Postgres data copy (dry run by default)
- `node --env-file=.env.local scripts/smoke.mjs [url]` — post-deploy smoke test
- `node --env-file=.env.local scripts/set-super-admin.mjs <email>` — one-off promotion; delete after use

## Cuisine Sale sync (Google Sheet → Supabase)

Apps Script in `docs/apps-script/cuisine-sale/` (`Code.gs`, `appsscript.json`), pushed with `clasp push -f` from that folder (script ID in `.clasp.json`). Tabs `Japanese / Western / Beef / Non food for all / Beer` (row 2 = headers) upsert into `cuisine_sale` on `(cuisine, item_id)`; midnight trigger via `createMidnightTrigger()`; `healthCheck()` verifies key, sheet, tabs, Supabase, row counts and trigger. Needs Script Property `SUPABASE_SERVICE_KEY`. Pending design: split a 20k-row `item_master` from a small `cuisine_map` (see conversation 2026-10-27).

## Development Rules

### Icons
Always use **inline SVG** icons — do NOT use icon libraries (lucide-react, heroicons, etc.) unless already installed. When adding a new icon, write it as a `<svg>` element directly in JSX.

### Font
Use **Noto Sans Thai** as the primary font, with Inter as fallback.

Never use `text-[10px]` or `text-[11px]` — minimum label size is `text-xs` (12px).

### UX/UI Design System — Freshket CI

Design language: **white / clean** — Freshket CI is used as accent only, NOT as background gradient.

Base = `white` + `gray-100` border; Freshket green = border, badge, icon, active state only.

---

## Design Tokens

### Colors

| Token | Hex | Usage |
|---|---|---|
| `freshket-500` | `#00ce7c` | Active icon, progress bar fill, success, active nav state |
| `freshket-600` | `#00a862` | Solid Admin badge bg, hover state |
| `freshket-700` | `#00804c` | Dark text on freshket-100 bg |
| `freshket-100` | `#d6fdf0` | Pastel bg — badges, avatar, pill backgrounds |
| `freshket-200` | `#a7f3d0` | Pastel border — pill border, badge border |
| `primary-600` | `#2563eb` | Admin actions, primary buttons |
| Slate BG | `#f8fafc` | Page backgrounds |
| White | `#ffffff` | All cards, panels, nav |

### Logo

```jsx
<img
  src="https://dwrbdsoumciwjszloluz.supabase.co/storage/v1/object/public/freshket%20AW/freshket-original.svg"
  className="h-7 w-auto object-contain"
  alt="Freshket"
/>
// Sidebar: h-7 | Navbar: h-8
```

---

## Component Patterns

### Pastel Pill Badge

```jsx
// Neutral / employee
<span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">
  Employee
</span>

// Admin (solid)
<span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-freshket-600 text-white border border-freshket-700">
  Admin
</span>
```

### Card Layout

```jsx
// Standard card — no decorative stripes or gradients
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
  {/* content */}
</div>

// Highlighted card (e.g. active/selected state)
<div className="bg-freshket-50 rounded-2xl border border-freshket-200 shadow-sm p-6">
  {/* content */}
</div>
```

> ⛔ **ห้ามใช้** left accent stripe (`w-1.5 bg-freshket-500` ริมซ้าย) — เป็น AI-generated UI pattern ที่ดู generic

### Progress Bar

```jsx
<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
  <div
    className="h-full rounded-full transition-all duration-300"
    style={{ width: `${pct}%`, background: '#00ce7c' }}
  />
</div>
```

### Score Color Thresholds

| Score | Text | Bar |
|---|---|---|
| ≥ 4.0 | `text-freshket-600` | `bg-freshket-500` |
| 3.0–3.9 | `text-amber-600` | `bg-amber-400` |
| < 3.0 | `text-rose-600` | `bg-rose-400` |

---

## Page Templates

### Light Form Page (default)

```
Body:   bg-slate-50 flex flex-col h-full
Card:   bg-white rounded-2xl border border-gray-100 shadow-sm
Header: sticky, white, border-b, h-16
Max-w:  max-w-2xl mx-auto (forms), max-w-4xl (dashboard sections)
```

### Modal

```
Backdrop:  fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50
Card:      bg-white rounded-2xl max-w-sm mx-auto p-6 text-center shadow-2xl
Entrance:  scale-95 opacity-0 → scale-100 opacity-100, 200ms
```

---

## Shared UI Conventions

| Property | Value |
|---|---|
| Border radius | `rounded-2xl` cards/forms, `rounded-3xl` result cards, `rounded-xl` buttons, `rounded-full` badges |
| Shadow | `shadow-sm` cards, `shadow-xl` / `shadow-2xl` modals |
| Transition interactive | `transition-all duration-150` |
| Transition modals | `duration-300` |
| Transition progress | `duration-500` |
| Focus ring | `focus:ring-2 focus:ring-freshket-300` (inputs) |
| Disabled | `opacity-60 cursor-not-allowed` |
| XSS safety | Always `.textContent =` not `.innerHTML =` for user strings |

---

## Full UX/UI Reference

See [design.md](./design.md) for the complete design spec: page templates, animation catalog, modal patterns, QR dark screen, check-in result cards, Likert scale cards, AI analysis section, and radar chart config.

## Skills Available

See [Skill.md](./Skill.md) for the full list of available skills and when to invoke them.
