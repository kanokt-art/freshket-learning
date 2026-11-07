# Freshket Sale Tracking — Developer Handbook

Everything a developer (or Claude Code) needs to keep building this system without re-deriving how it works.
Read `CLAUDE.md` first for the standing rules (design system, security rules, commands); this file is the map
and the lessons learned. Where the two disagree, trust the code, then fix the doc.

> Language: the UI is Thai; code, comments, commits and docs are English. Chat replies to the owner (Kanok, HR /
> People & Engagement) are in Thai.

---

## 1. What the system is

An internal platform for the Freshket sale team: training courses, Mandatory Reading, role play, Shadow Visits,
MBTI, Key Take Away, team-lead / manager feedback, and Slack notifications that keep trainers and leads in the
loop.

| Layer | Choice |
|---|---|
| App | Next.js 14 (App Router), React, TypeScript, Tailwind. Deployed on Vercel from `main` |
| Sign-in | Firebase Auth (Google), `@freshket.co` only. Firebase is used **for sign-in only** |
| Data | Supabase Postgres through PostgREST with the `service_role` key, **server-side only** |
| Notifications | In-app bell (one row per person) + Slack app (bot DMs, channel posts, webhook fallback) |
| Imports | Google Apps Script → `/api/sheets/*` (Shadow form, course scores, cuisine sale) |
| Tests | Vitest unit tests (`tests/unit`), Playwright e2e (`test:e2e`) |

Roles (RBAC, ascending): `sale` < `team_lead` < `manager` < `super_admin`. HR rank grants at most `manager`;
`super_admin` is set by hand (`scripts/set-super-admin.mjs`). A **department head** (JG11+, `lib/users/departmentHead.ts`)
also oversees their whole department even though their role is `manager`.

Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) bypasses the backend and serves mock data **and skips sign-in, so it only runs
under `next dev`**: any deployed build (Production or Preview) ignores the variable and the browser toggle
(`src/lib/demo/demoMode.ts`, `DEMO_MODE_ALLOWED`). Every feature that talks to
the server needs a demo branch (look for `getDemoMode()`).

---

## 2. Commands

```bash
npx vitest run                 # unit tests (stand-in REST server, no DB needed) — ~1,400 tests
npx tsc --noEmit -p .          # types
npx eslint src tests           # lint (unused imports are NOT always flagged — see §9)
npx next build                 # production build
node scripts/migrate/run.mjs [--apply]            # Firestore → Postgres snapshot copy (dry run by default)
node --env-file=.env.local scripts/smoke.mjs [url]   # post-deploy smoke test
node --env-file=.env.local scripts/set-super-admin.mjs <email>   # one-off; delete after use
```

Before every commit run tsc + eslint + vitest. Commit messages are ASCII (see §9), one commit per request,
and end with the attribution line the session gives. **Deploy = `git push origin main`**, only when the owner says
"deploy" / "push". Vercel then builds on its own; check the dashboard for **Ready** — never claim a deploy
succeeded from here.

---

## 3. Data layer (the most important thing to understand)

> `CLAUDE.md` describes this as branch `phase4-supabase`, "not yet deployed". In practice the features on `main`
> (migrations 008/010, Slack, shadow reviews) already run on Supabase. Verify the cutover state before relying on
> either statement.

**Documents in, documents out.** The app still thinks in Firestore-shaped documents (camelCase, `id`, `Date`).
`src/lib/server/docMap.ts` holds a `TableSpec` per collection (field ↔ column maps, `fText/fTs/fJson/...`,
`required`, `hasExtra`) and converts doc ↔ row. `src/lib/server/store.ts` talks PostgREST.

```
Browser ──► /api/data/{query,get,write} ──► policies.ts (canRead / canWrite / viewOf) ──► store.ts ──► Supabase
```

- Every table is RLS deny-all. The browser never holds a DB key.
- **Writes** from the browser: only through `src/lib/data/collection.ts` (`save / patch / remove / saveMany /
  removeMany / get / findBy`). Never `fetch('/api/data/...')` directly anywhere else.
- **Reads**: the hooks in `src/hooks/useFirestore.ts` (`useFirestoreList`, `useFirestoreDoc` share warm listeners).
  There is no realtime: queries fetch once, poll every 60 s (notifications 30 s) while the tab is visible, and
  refetch on invalidation (`lib/data/live.ts`, `invalidation.ts`). A successful non-GET `authedFetch` outside
  `/api/data` and `/api/auth` invalidates everything automatically.
- **Server routes** use `getStore()`; `firebase/admin.ts` only verifies ID tokens.
- **Identity**: `users.uid` is a stable *person id* (`csv-{employeeId}`, or the Firebase uid for someone HR never
  imported). `users.auth_uid` is the Firebase uid they sign in with. Login = `POST /api/auth/session`. Server routes
  must use the person id from the `src/lib/server/auth.ts` gates (`requireStaff/Manager/SuperAdmin` → `gate.uid`),
  **never `decoded.uid`**.
- **Policies** (`policies.ts`, ported from the old `firestore.rules`): who may read/write each collection.
  `SELF_PROTECTED_USER_FIELDS` (includes `ROLE_SOURCE_USER_FIELDS` = rank/position/department/employmentStatus) can't be
  edited by the person themself. `viewOf` trims what a `sale` learner sees of colleagues (`COLLEAGUE_PROFILE_FIELDS`)
  and of imported scores.
- **Who decides "completed"**: a course with a graded post-test (`requiresPostTest`, `lib/courses/completion.ts`) is
  completed/failed by the grading route only; the data door refuses a client setting it. Other courses finish by lessons.
- Reuse `refreshUserStats` / `refreshManyUserStats` after changing training records; `store.claim` for
  first-writer-wins (once-only Slack posts); `store.addCourseLearners` to add to a roster atomically.

### PostgREST / Postgres gotchas

- 1,000-row response cap (the store pages automatically).
- `ilike` treats `_` as a wildcard → use `users.email_lc` for email matching.
- Heterogeneous bulk upserts must be grouped by column set.
- `store.set(..., {merge:true})` updates the row if it exists and only inserts when it doesn't (an upsert is refused
  when a NOT NULL column is missing, even for an existing row). `store.setMany` with merge still upserts, so every
  document must carry the table's NOT NULL columns (the HR import always sends `email`).
- `slack_posts` has `kind, ref_id, channel, posted_at, payload (json)` — a convenient place for small bookkeeping (it
  holds the Slack thread `ts` of a Shadow post: `channel` + `payload.ts`).

### Migrations

`supabase/migrations/00x_*.sql`, run **by the owner in the Supabase SQL Editor** (the Supabase MCP refuses statements
containing `drop`). Keep each file idempotent. 002–012 exist; 010 (learner feedback) is applied; **011 (course packages) and 012 (Course Design audience and dates) must be run before Course Design works**. Adding a column
means: migration + `docMap.ts` field + type + (if the browser may write it) `policies.ts`.

---

## 4. Where things live

### Pages (`src/app/(dashboard)/`)

| Route | What | Notes |
|---|---|---|
| `sale/` | **Home.** Learner home, admin home, and (for leads) renders `TeamLeadHome` | Learner: `HomeHighlightsRow` ("Latest"), pending courses, deadlines. Admin: stat cards + `UserTable` roster + profile overlay |
| `manager/` | "ภาพรวมทีม" team page for team leads / managers | Stat cards (incl. MBTI summary card), team + department filters, sortable roster, member window with tabs (info / history / Shadow / radar / assess) |
| `team-lead/` | Older team-lead dashboard | |
| `shadow/` | Shadow Visit. Learners: own visits + form. Leads: member table | Table = `managedMembers`, team filter, sortable, newest start first, Avg Rating, **Acked** stage dots (member → team lead → manager, `lib/shadow/stages.ts`) |
| `courses/`, `assessment/` | Course library, player, quiz, results | |
| `courses/design/` (+ `[id]`) | **Course Design = the step where courses are launched.** A super_admin gathers courses into an ordered package, sets the learners (กำหนดผู้เรียน), start/end dates and publishes; the builder also has the แดชบอร์ด and สรุปผลการเรียน tabs. Learners see it on My Course and at `/courses/design/<id>` | `coursePackages` table (migrations 011 + 012). A **course** is only a draft of content (lessons, quiz, Key Take Away): its audience, dates and `isPublished` are a **projection** of the live Course Designs holding it (`lib/courses/designProjection.ts`, written by `lib/server/courseDesigns.ts` via `POST /api/course-designs/sync` after every package save/publish/delete). `POST /api/course-designs/convert` wraps each already-live course in a Course Design of its own (admin banner on the Course Design page). The optional "sequential" lock is enforced on the package page only |
| `users/` | Employees page (admin) | Its member "Training" tab still has the older layout (see §10) |
| `tools/` | `mandatory`, `cuisine-guide` | Mandatory Reading lives under Tools |
| `admin/` | `announcements`, `activity`, `guide`, `rewards`, `settings`, `spotlight` | `spotlight` = pin/hide items shown in "Latest" |
| `notifications/`, `profile/`, `points/`, `personality/`, `log/` | | |

### Shared UI (`src/components/features/`)

Next.js page files cannot export non-default names → anything shared between pages lives here.

- `MemberDirectory.tsx` — `UserTable` (newest start first, every column sortable, `restrict` prop: admin passes the
  default `true` = numbered employees of the rollout departments only; a lead's own team passes `false`) and
  `UserSidePanel` (the member profile window). Used by admin home **and** `TeamLeadHome`.
- `TeamLeadHome.tsx` — Latest row, team course progress, `UserTable` of the lead's team, right column with
  pending courses + `TeamActivityCard`.
- `HomeHighlights.tsx` + `lib/home/highlights.ts` + `hooks/useHomeHighlights.ts` — the "Latest" row (tabs Latest
  Course / Activity, red dot via localStorage `fk_latest_seen_{uid}_{tab}`). Pins/hidden items are stored in
  `appConfig/homeHighlights` (demo: localStorage `fk_home_highlights_demo`). Admin UI: `/admin/spotlight`.
- `ShadowVisitDrawer.tsx` — right-hand drawer for one visit. Optional `rating`, `hideEvaluatorFeedback` and `children`
  (the manager page passes `ShadowReviews` so a lead can review inside it). `ShadowPushButton.tsx` = super_admin
  "Push ไป Slack" (asks to confirm, calls `announce({kind:'shadow_push'})`).
- `MemberCourseDrawer.tsx` — right drawer with a member's Key Take Away + team lead / manager feedback.
- `CourseCover.tsx`, `QuestionnaireResultCell.tsx` (+ `UserQuestionnaireResult`), `MbtiBadge.tsx`, `OrgBoard.tsx`.

**Drawer pattern**: `createPortal` to `document.body`, `fixed inset-0 z-[70]`, `animate-slide-in-right`,
`stopPropagation` on both backdrop and panel so it doesn't close the modal it was opened from. The member window is
`z-40`.

### Libraries worth knowing (`src/lib/`)

- `users/managedMembers.ts` — **the** definition of "my team" (`managedMembers`, `managedTeamIds`,
  `canViewEmployeeReport`). Home, manager page, shadow page, course results all use it. A super_admin gets everyone;
  a department head gets the whole department; others get the teams they lead/manage, at or below their level.
- `users/teamFilter.ts` — team dropdown choices (`teamChoices`, `effectiveTeamChoice`, `matchesTeam`, `NO_TEAM`).
- `users/displayName.ts` — `formatPersonName` → **"First (Nickname) Surname"**. Use it for every person name.
- `shadow/` — `reviews.ts` (one review per visit **and reviewer**, `slotOf(role)` = team_lead | manager,
  `primaryReview`, `averageRating`), `stages.ts`, `mentorName.ts` (mentor text → formatted name via email/EN/TH/nickname
  match), `submitReview.ts`, `sheetImport.ts`, `fields.ts`.
- `notifications/` — `announce.ts` (client → `/api/notifications/announce`), `confirmAnnounce.ts` (admin confirm before
  publishing), `slack.ts` (channel posts), `slackDm.ts` (DMs, lookup, thread-capable `sendSlackMessage`), `slackText.ts`
  (**all text going to Slack must pass `slackText`** so nothing typed anywhere can add a mention).
- `server/` — `shadowNotice.ts`, `teamLeads.ts` (`teamLeadsOf`, `teamManagersOf`), `saleTrainers.ts`, `trainerNotice.ts`,
  `courseCompleted.ts`, `userStats.ts`, `teamMoves.ts`, `identity.ts`.
- `bucketAssessments/` — MBTI (`MBTI_DEFINITION`, `mbtiProfiles.ts`) and Selling Style.

### API routes (`src/app/api/`)

`data/{query,get,write}` (the data door) · `auth/{session,verify}` · `notifications/{announce,push}` ·
`assessment/{start,submit,[id]/take}` · `courses/{enroll,library-stats,sync-department-assignments}` ·
`training-records/{dismiss,override,reset,restore}` · `users`, `users/{auto-map-teams,save-assignments}` ·
`sheets/{shadow-sync,course-scores-sync,cuisine-sale-sync}` · `slack/lookup` · `takeaway/notify` ·
`personality/submit` · `csv/{course-results,roleplay}` · `stats/rebuild` · `upload/*`, `gemini/course-image`,
`unsplash/search`, `resolve-form-url`.

---

## 5. Slack

App manifest + setup: `docs/slack/`. Sends with `SLACK_BOT_TOKEN` (server-only).

Three kinds of destination:

1. **Trainer × team-lead group** — `postToTeam` / `postToTeamRef` in `slack.ts`. Through the bot into
   `SLACK_TRAINER_CHANNEL_ID` (bot must be a member), else the `SLACK_WEBHOOK_URL` fallback.
2. **Course channel** — `postToCourseChannel` (`SLACK_COURSE_CHANNEL_ID`, `<!channel>` only for a new course), webhook fallback.
3. **DMs to learners only** — `dmPeople`, `sendSlackDm`. A person's id is `users.slack_user_id` (set by a super_admin;
   policy validates it) or looked up by company email (scopes `users:read` + `users:read.email`;
   `POST /api/slack/lookup` backs the admin button). **Team leads / managers get no DMs.**

Who gets told what:

| Event (`announce` kind) | Group post | DM | Bell |
|---|---|---|---|
| Quiz completed / graded | yes — tags Team Lead + Sale Trainer | learner on first pass | learner's manager |
| Shadow submitted (`shadow_submitted`, also from sheet sync) | yes (sales departments) — tags **Team Lead, Manager, Sale Trainer**; remembers the post's `ts` | — | everyone who supervises the sender |
| Shadow reviewed (`shadow_acked`) | **reply in the visit's thread** tagging the Sale Trainer (a new post if the original has no `ts`, e.g. webhook or pre-existing visits) | the visit's owner (rating, excerpt of the comment, link), once per reviewer, retried until delivered | trainers |
| Shadow push (`shadow_push`, super_admin) | yes, not once-only | — | rings again |
| Course published / Mandatory published | course channel | new Mandatory: audience re-derived from the DB, super_admin only | — |
| Course feedback / Role play assessed | group, tags trainer | the learner (feedback) | — |

Rules that keep it sane:

- **Once per event**: `store.claim('slackPosts', key, …)` (e.g. `shadow_submitted:{id}`, `shadow_acked:{visit}__{reviewer}`,
  `dm:shadow_acked:{rid}`). `dmOnce` marks a DM as sent only when it was delivered, so a failed one retries.
- A review edit tells nobody again. Notifications fire on first attempt / first pass.
- `announceNewShadowVisit` (`lib/server/shadowNotice.ts`) is the single path for both the in-app form and the Google
  Form sync; `force: {byUid}` is the super_admin push.
- Mentions are built only from validated ids (`/^[UW][A-Z0-9]{6,}$/`); missing ids degrade to plain text names.
- Publishing a course / Mandatory asks the admin to confirm (`confirmAndAnnounce`; "no" skips only the Slack post).
  The Mandatory page warns when Slack was asked and nothing went out, and each published item has a "Send to Slack" button.
- Env var **names** (never values): `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`, `SLACK_TRAINER_CHANNEL_ID`,
  `SLACK_COURSE_CHANNEL_ID`, `SLACK_TRAINER_EMAILS` (who "Sale Trainer" is; default Kanok), `SLACK_SALES_DEPARTMENTS`,
  `NEXT_PUBLIC_APP_URL` (links in messages).
- Thread replies only work for posts made through the bot. Webhook posts can't be replied to.

---

## 6. Google Sheets / Apps Script

Code in `docs/apps-script/`; pushed with `clasp push -f` **only when the owner asks** (use the `clasp-master` skill).
Routes authenticate with `SHEETS_SYNC_SECRET` (Script Property on the Apps Script side).

- **Shadow Visit form** (`course-scores/Code.gs`, script ID in `.clasp.json`) → `POST /api/sheets/shadow-sync`.
  The form's response tab must be named **"Shadow"**. The route imports rows and now announces fresh ones
  (`RECENT_MS` 3 days, `MAX_ANNOUNCE` 30). `onFormSubmit` trigger → sync immediately; `testShadowSubmit` for a dry check.
- **Course scores** → `/api/sheets/course-scores-sync`.
- **Cuisine sale** (`cuisine-sale/Code.gs`) → `/api/sheets/cuisine-sale-sync`, tabs `Japanese / Western / Beef /
  Non food for all / Beer` (row 2 = headers), upsert on `(cuisine, item_id)`, midnight trigger
  (`createMidnightTrigger()`), `healthCheck()`. Needs Script Property `SUPABASE_SERVICE_KEY`. Pending design: split a
  20k-row `item_master` from a small `cuisine_map`.

---

## 7. Security

Standing rules (details in `CLAUDE.md` and `.claude/skills/security-audit/`):

- Guidance mode by default; a full audit/report only when explicitly requested. **Read-only first**: report a problem
  with the evidence and the smallest fix, change behaviour on the owner's go-ahead.
- **Never probe live systems**, use real tokens/keys, or touch real users' data. Use dummy principals and local fixtures.
  If the deciding fact is a Vercel / Supabase / Slack setting, say "needs validation" and tell the owner how to check.
- Secrets never go in chat or git (`.env*`, service account JSON, tokens). Don't read or print env files.
- Block non-`@freshket.co` sign-ins immediately.
- A prior audit's outputs live outside the repo (`~/security-audit-skill/freshket-learning/run-1/`); its validators
  don't run on Windows.

Testing against the real database: clean up what you create. Submitting a quiz rings the learner's manager's bell, posts
to the trainer × team-lead Slack group and DMs a first pass to the learner. Test with a learner whose manager is you and
delete test notifications afterwards.

---

## 8. Conventions

**UI** (full spec: `design.md`, tokens in `CLAUDE.md`)

- White / clean; Freshket green only as accent (border, badge, icon, active state). No left accent stripes, no decorative gradients.
- **Inline SVG icons only** (no icon libraries). Font **Noto Sans Thai**. Minimum text size `text-xs` — never `text-[10px]`/`text-[11px]`.
- Table **column headers are in English** (Employee, Team, Start Date, Visits, Avg Rating, Acked…); content/labels in Thai.
- Person names via `formatPersonName` ("First (Nickname) Surname"); mentors are stored that way too.
- Tenure/start date display: `StartDateCell` (`components/common/EmployeeCells.tsx`).
- Rosters default to **shortest tenure first** (newest start date on top) and every column is sortable.
- Right-hand drawers (not dropdowns/inline expansion) for detail views.
- `textContent`, never `innerHTML`, for user strings.

**Code**

- Match the surrounding comment density and idiom; comments explain *why*.
- New collection write from the browser → `collection.ts`; new server read/write → `getStore()`.
- Keep pure logic in `src/lib/**` with a unit test in `tests/unit/` (e.g. `shadowStages.test.ts`, `mentorName.test.ts`,
  `slackRouting.test.ts`, `announceRoute.test.ts`, `policies.test.ts`).
- Route tests mock the store and Slack modules — when you add an import to a route, add the mock export too.

---

## 9. Working notes & pitfalls (learned the hard way)

**Windows / PowerShell / bash**
- The shell tools are fragile with big multi-line strings: write edit scripts to the scratchpad with the Write tool and
  run them with Node (`rep(old,new)` helper that throws when a snippet is missing; preserve CRLF by detecting `\r\n`).
  Bash heredocs containing both `'` and backticks have failed with "unexpected EOF".
- Keep **Thai text out of `git commit -m`** on PowerShell — it split the argument into a pathspec. Use ASCII messages.
- `git push` needs the gh credential helper (active gh account must be `kanokt-art`):
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
- Git warns "LF will be replaced by CRLF" — harmless.
- ESLint does not reliably flag unused imports; after large moves run a pruning pass or read the diff.

**Next.js**
- A `page.tsx` can only default-export a component (plus a few config exports). Shared components must live in
  `src/components/**`.
- Shared state hooks (`useFirestoreList`) reuse warm listeners; don't call them conditionally — pass an `enabled`/uid argument.

**Data**
- Real data disagrees with types: `mandatoryItems.departmentAccess` is a list of objects, `users.createdAt` comes as
  Timestamp / ISO string / `{seconds,nanoseconds}`, notification ids (`{type}_{refId}`) are unique only per person,
  training-record ids embed the person.
- Don't trust `decoded.uid` — see §3.
- Imported scores and colleague profiles are trimmed for learners at the data door, not in the UI.

**Slack**
- A webhook post can't be threaded; only bot posts return `ts`.
- Moving a DM before the once-only claim requires the test mock to expose `findSlackIdByEmail` and a `get` for claimed posts.
- Mandatory Reading used to rely on the webhook alone and failed silently — it now uses `postToCourseChannel`.

---

## 10. Status, open items and ideas

**Not done by choice / offered but not requested**
- Employees page (`users/`) member **Training tab** still has the old layout; the admin-home overlay got the new one
  (course cover, pre/post score with change, finish date, MBTI in place of the dash, course-name → Key Take Away drawer).
- "Push ไป Slack" for a Shadow Visit exists on the visit cards/detail of the admin home and Employees page, but not on
  the main `/shadow` page detail.
- A team filter on `TeamLeadHome`'s member table (the manager page and `/shadow` already have one).
- Shadow "Acked" dots are aggregated **per member** over all visits (green = every visit reached the stage, amber = some,
  grey = none). A per-visit timeline would be a separate view.
- Firestore cleanup after cutover is settled: delete `firestore.rules`/indexes, old `inspect-*.js` scripts, the scratch
  `ddl_probe` schema, and the ~1.4k leftover PVP docs (needs the owner's say-so).
- Cuisine Sale: split `item_master` / `cuisine_map` (see §6).

**Operational checklist after a deploy that touches Slack**
1. Vercel shows **Ready**.
2. Env present in Production: `SLACK_BOT_TOKEN`, `SLACK_TRAINER_CHANNEL_ID` (+ bot invited to it), `SLACK_COURSE_CHANNEL_ID`
   or `SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL`, Supabase keys.
3. A super_admin's "Push ไป Slack" on a test visit produces a post with the three tag lines; a review then appears as
   a thread reply tagging the trainer.
4. For DMs: the learner has a Slack id (profile) or a company email Slack can find.

**Memory / docs map**
- `CLAUDE.md` — standing rules and quick reference (keep it short).
- `design.md`, `Skill.md` — full design spec and skill list.
- `docs/slack/README.md` — Slack app setup. `docs/apps-script/` — Apps Script sources.
- This file — architecture map, how-it-works, pitfalls. Update it when you change a flow listed above.
