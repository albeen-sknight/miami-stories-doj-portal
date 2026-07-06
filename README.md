# Miami Stories DOJ Portal

Cloudflare full-stack foundation for the fictional Miami Stories Department of Justice, a GTA roleplay legal portal. This is not a real government website, court system, law firm, legal service, or source of real-world legal advice.

## Stage 1 Foundation

This repository is organized as a pnpm workspace:

- `apps/web` - React + Vite + Tailwind public portal
- `apps/worker` - Cloudflare Worker API
- `packages/shared` - shared TypeScript types and constants
- `migrations` - Cloudflare D1 migrations

Implemented public routes:

- `/`
- `/resources`
- `/faq`
- `/docket`
- `/lawyers`
- `/services`
- `/services/lawyer`
- `/services/criminal-trial`
- `/services/civil-case`
- `/services/subpoena`
- `/services/warrant`
- `/services/expungement`
- `/services/marriage`
- `/services/divorce`
- `/bar-exam`
- `/login`
- `/logout`
- `/unauthorized`

Dashboard shell routes also exist under `/dashboard` for Stage 2 authentication and RBAC work.

## Local Setup

Requirements:

- Node.js 20+
- pnpm 9+

Install dependencies:

```bash
pnpm install
```

Run frontend and Worker locally:

```bash
pnpm dev
```

Useful scripts:

```bash
pnpm dev:web
pnpm dev:worker
pnpm build
pnpm typecheck
pnpm db:migrate:local
pnpm db:migrate:prod
```

Local URLs:

- Frontend: `http://localhost:5173`
- Worker API: `http://localhost:8787`
- Discord redirect URI for later OAuth: `http://localhost:8787/api/auth/discord/callback`

## D1

The D1 binding is named `DB`, with database name `miami-stories-doj-db`.

Apply migrations locally:

```bash
pnpm db:migrate:local
```

Apply migrations remotely:

```bash
pnpm db:migrate:prod
```

The Stage 1 API falls back to seed data when D1 is unavailable or empty.

## Soft Delete and Trash

Production records are soft-deleted, not hard-deleted. Apply the latest D1 migrations before using Trash / Deletion Log features so active lists can filter `deleted_at IS NULL` and deleted records are preserved in `deletion_log`.

```bash
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --local
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --remote
```

Trash / Deletion Log access is intentionally limited to Chief Justice and Justice logical permissions. Deleting records requires a written reason, hides them from normal public/admin views, and restore/republish actions are logged. Discord messages and channels are not deleted automatically.

Production public FAQ content is seeded from `apps/worker/src/seeds/faqSeed.md` by the FAQ importer. Editing an already-applied migration will not update remote D1. Update the markdown source, test locally, then run the remote FAQ seed command.

```bash
corepack pnpm seed:faq -- --local
corepack pnpm seed:faq -- --remote
```

Run remote D1 migrations before the FAQ importer when preparing a fresh production database. The importer upserts by stable IDs and hides legacy public FAQ seed rows that are not present in `faqSeed.md`, so it can be run repeatedly without creating duplicate public FAQ records.

## Environment Variables

Do not commit secrets. Use `.dev.vars` for local Worker secrets and Cloudflare dashboard/secret bindings for deployed secrets.

Expected future variables include:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `DISCORD_REDIRECT_URI`
- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_DISCORD_IDS`

Known non-secret values are documented in `PROJECT_CONFIG_FOR_CODEX.md`.

## Cloudflare Pages

Future Pages settings:

- Build command: `pnpm --filter @shotta-doj/web build`
- Build output directory: `apps/web/dist`
- Root directory: leave blank
- Production variable: `VITE_API_BASE_URL=https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev`

Do not use `/` as the build output directory.

Cloudflare Pages serves the frontend only. The frontend requires `VITE_API_BASE_URL` to point to the deployed Worker URL. Without this, Pages will return `index.html` for `/api` routes and pages such as `/resources`, `/faq`, `/docket`, `/bar-exam`, and `/login` will show JSON parse errors.

## Cloudflare Worker

The Worker entry point is `apps/worker/src/index.ts`, configured by the root `wrangler.toml`.

Deploy in a later stage only after secrets, OAuth, D1 migrations, and production URLs are configured.

## Discord OAuth

Stage 2 implements Discord OAuth, server-side D1 sessions, role cache refresh, RBAC helpers, `/api/me`, protected admin placeholders, and auth audit logging.

Create a local `.dev.vars` file for secrets and local auth values:

```bash
DISCORD_CLIENT_ID=your_miami_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_oauth_secret
DISCORD_REDIRECT_URI=http://localhost:8787/api/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_miami_discord_guild_id
DISCORD_PUBLIC_KEY=your_discord_application_public_key
SESSION_SECRET=generate_a_long_random_value
PUBLIC_APP_URL=http://localhost:5173
WORKER_APP_URL=http://localhost:8787
LEGACY_BAR_EXAM_URL=
BOOTSTRAP_ADMIN_DISCORD_IDS=your_discord_user_id_if_needed
```

Required Discord Developer Portal setup:

- Add redirect URI: `http://localhost:8787/api/auth/discord/callback`
- Set Interactions Endpoint URL to the final Miami Worker URL plus `/api/discord/interactions` in production.
- OAuth scopes used by the portal: `identify` and `guilds.members.read`
- The bot token is used server-side only to fetch guild member roles from the DOJ Discord server.
- `DISCORD_PUBLIC_KEY` is the application public key used to verify slash command request signatures. Do not use the bot token for signature verification.

Register guild slash commands after Worker deployment:

```bash
corepack pnpm register:discord-commands
```

The registration script requires `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID` in the operator shell environment. It registers guild commands for fast testing, including `/help`, `/hcommand`, service request helpers, ticket lifecycle commands, soft-delete/restore commands, and public FAQ/resource posting commands.

Local login test:

```bash
pnpm db:migrate:local
pnpm dev
```

Then open `http://localhost:5173/login` and choose **Login with Discord**.

Role refresh:

- Open `/dashboard` after login.
- Use **Refresh Discord Roles** to call `POST /api/auth/refresh-roles`.
- If Discord role fetch fails, privileged access fails closed.

Bootstrap admin:

- Any Discord ID in `BOOTSTRAP_ADMIN_DISCORD_IDS` receives `ADMIN` and `CHIEF_JUSTICE` logical permissions.
- This is intended for emergency setup and local development before role mapping is fully seeded.

Protected API foundations:

- `GET /api/admin/session-debug` requires `VIEW_DASHBOARD` or `ADMIN`.
- `GET /api/admin/audit-logs` requires `VIEW_AUDIT_LOGS` or `ADMIN`.

Local/dev seeding:

- `POST /api/dev/seed` seeds role mappings, channel mappings, resources, FAQ subset, lawyer placeholder, and docket placeholder.
- The endpoint is open only for local Worker URLs. Outside local/dev it requires `ADMIN`.

Production OAuth later requires adding the production Worker callback URL to Discord OAuth2 settings before deployment.

## Bar Exam Safety

The native Bar Exam schema stores candidate-safe exam content separately from server-only scoring material. Do not expose answer keys in frontend code, public assets, migrations, README text, or `packages/shared`.

`apps/worker/src/seeds/legacyBarExamAppsScript.js` is local-only migration material and is intentionally ignored by Git.

Private Bar Exam import commands:

```bash
corepack pnpm seed:bar-exam -- --dry-run
corepack pnpm seed:bar-exam -- --local
corepack pnpm seed:bar-exam -- --remote --activate
```

The importer reads the ignored legacy Apps Script source, writes candidate-safe prompts/options to D1, and stores reviewer-only answer material only in server-side D1 fields. The remote production command to publish imported versions is:

```bash
corepack pnpm seed:bar-exam -- --remote --activate
```

Never commit:

- `.dev.vars`
- `.env`
- `.env.local`
- `.wrangler/`
- Discord client secrets
- Discord bot tokens
- Cloudflare API tokens
- `SESSION_SECRET` values
- legacy Bar Exam answer key files

## Stage 3 Service Requests

Stage 3 replaces public Discord ticket panel submissions with controlled DOJ Portal service requests.

Public routes:

- `/services`
- `/services/lawyer`
- `/services/criminal-trial`
- `/services/civil-case`
- `/services/subpoena`
- `/services/warrant`
- `/services/search-seizure`
- `/services/expungement`
- `/services/marriage`
- `/services/divorce`
- `/requests/mine`
- `/requests/:id`

Staff routes:

- `/dashboard/requests`
- `/dashboard/requests/:id`

Worker API:

- `POST /api/requests`
- `GET /api/requests/mine`
- `GET /api/requests/:id`
- `GET /api/admin/requests`
- `GET /api/admin/requests/:id`
- `PATCH /api/admin/requests/:id/status`
- `PATCH /api/admin/requests/:id/assign`
- `POST /api/admin/requests/:id/create-discord-channel`
- `POST /api/admin/requests/:id/post-to-discord-ticket`
- `POST /api/admin/requests/:id/events`
- `GET /api/admin/requests/:id/events`

Request numbers are generated server-side with a yearly counter:

- `LAW-2026-0001`
- `CRT-2026-0001`
- `CIV-2026-0001`
- `SUB-2026-0001`
- `AWR-2026-0001`
- `SWR-2026-0001`
- `EXP-2026-0001`
- `MAR-2026-0001`
- `DIV-2026-0001`
- `GEN-2026-0001`

Privacy model:

- Public request-service Discord channels are entry/panel/link channels only.
- Full request details, evidence links, Google Doc filing links, probable cause narratives, warrant targets, civil complaints, subpoena targets, expungement petitions, marriage/divorce details, and private legal facts must not be posted publicly.
- The Worker stores the request in D1 first, then attempts to create a private ticket-style Discord channel under the configured category.
- If Discord channel creation or embed posting fails, the request remains in D1 with `discord_ticket_status = FAILED`, an event is written, and staff can retry from `/dashboard/requests/:id`.

Required Discord bot permissions in the relevant private ticket categories:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Channels
- Manage Permissions

The bot must have those permissions in each configured private ticket category, and the bot role must be high enough in the Discord role hierarchy to create channels and apply permission overwrites. The bot may appear offline in Discord. That is okay because the Worker uses the Discord HTTP API with the bot token and does not need a websocket bot process.

Admins can inspect production Discord setup at `/dashboard/discord`. The diagnostics endpoint never exposes the bot token; it reports whether the Worker has Discord configuration, whether the bot can access the guild, whether configured channels/categories exist, and whether guild-level bot roles include the ticket permissions above. Failed private ticket events store admin-safe Discord details such as HTTP status, Discord error code/message, configured IDs used, and a likely fix.

Category and channel mappings are stored in `discord_channel_mappings` through migrations/seeds. Public request mappings such as `REQUEST_LAWYER`, `REQUEST_CIVIL_CASE`, `REQUEST_WARRANT`, and `REQUEST_MARRIAGE` are panel/post destination text channels only. Lawyer requests post/repost/update their staff embed directly in `REQUEST_LAWYER`; there is no active lawyer private ticket category. Private ticket parent mappings for other request types must use Discord category IDs such as `CIVIL_CASES_CATEGORY`, `WARRANTS_CATEGORY`, and `MARRIAGE_DIVORCE_CATEGORY`; do not use a public panel channel ID as `parent_id`. `REQUEST_SEARCH_SEIZURE` and private category mappings are seeded in Stage 3. `REQUEST_LAWYER_CATEGORY` may exist as a deprecated reference-only D1 key from migration `0013`, but business logic must not use it for lawyer requests.

Local testing:

```bash
corepack pnpm install
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --local
corepack pnpm dev
```

Then:

1. Log in with Discord at `/login`.
2. Submit a request at one of the `/services/*` routes.
3. Open `/requests/mine` to confirm it is visible to the submitter.
4. Open `/dashboard/requests` with a user that has `MANAGE_REQUESTS`.
5. Use the detail page buttons to retry private Discord channel creation or private ticket embed posting.

Never commit `.dev.vars`, Discord bot tokens, client secrets, session secrets, private filing links, or Bar Exam answer keys.

## Stage 4 Judicial Docket Tools

Stage 4 turns manual judge-written docket announcements into structured docket records with public/private separation.

Public routes:

- `/docket`
- `/docket/:id`

Judicial routes:

- `/dashboard/judicial`
- `/dashboard/docket`
- `/dashboard/docket/new`
- `/dashboard/docket/:id`
- `/dashboard/docket/:id/edit`

Worker API:

- `GET /api/docket`
- `GET /api/docket/:id`
- `GET /api/admin/docket`
- `GET /api/admin/docket/:id`
- `POST /api/admin/docket`
- `PATCH /api/admin/docket/:id`
- `DELETE /api/admin/docket/:id`
- `POST /api/admin/docket/:id/publish`
- `POST /api/admin/docket/:id/unpublish`
- `POST /api/admin/docket/:id/archive`
- `POST /api/admin/docket/:id/close`
- `POST /api/admin/docket/:id/post-to-discord`
- `GET /api/admin/docket/:id/events`
- `POST /api/admin/docket/:id/events`
- `POST /api/admin/requests/:id/create-docket`

Docket management permissions are enforced in the Worker. Users need `CREATE_DOCKET`, `PUBLISH_DOCKET`, or `ADMIN`; mapped judge, justice, chief justice, and admin roles derive those actions through RBAC.

Docket numbers are generated server-side with yearly counters and case prefixes:

- `DKT-2026-0001`
- `CR-2026-0001`
- `CV-2026-0001`
- `WAR-2026-0001`
- `SUB-2026-0001`
- `EXP-2026-0001`
- `MAR-2026-0001`
- `DIV-2026-0001`
- `NC-2026-0001`

Judges may override the suggested number, but the Worker validates uniqueness.

Scheduling uses local date, local time, and timezone inputs. The default timezone is `Europe/Madrid`. The Worker converts the local time to an ISO datetime, Unix seconds, and Discord timestamp markup:

- `<t:UNIX:F>`
- `<t:UNIX:R>`

The external `r.3v.fi` timestamp site can be useful for manual checking, but the app generates timestamps internally and does not depend on external timestamp services at runtime.

Service request linking:

- Staff can start a docket from `/dashboard/requests/:id`.
- The Worker links `linked_service_request_id` and private ticket channel ID internally.
- The request receives a service request event.
- The docket receives a docket event.
- The public docket does not expose private request payloads, evidence, private filing links, private ticket channel IDs, or judge notes.

Discord docket posting:

- Public docket embeds post to the configured `DOJ_DOCKET` channel mapping in D1.
- Discord role IDs, channel IDs, and category IDs are not hardcoded in business logic.
- Embeds include docket number, title, case type, proceeding, judge, status, scheduled time, and public summary.
- Existing Discord messages are patched when possible.
- Failed Discord syncs mark the docket as failed or repost-required and write docket events/audit logs.
- Staff can retry updating or explicitly repost as a new Discord message.

Visibility model:

- `is_public` controls public docket visibility.
- `is_archived` removes entries from the default public listing.
- `private_notes_markdown`, private request payloads, private evidence links, and private Discord ticket channel IDs are staff-only.
- Sensitive public text should be written intentionally, for example: "Defendant name withheld to preserve investigative integrity."

Local docket testing:

```bash
corepack pnpm install
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --local
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm dev
```

Then:

1. Log in with Discord at `/login`.
2. Open `/dashboard/docket/new` as a user with docket permissions.
3. Create a draft docket entry and confirm the generated docket number.
4. Enter local date/time and confirm the Discord timestamp preview.
5. Publish the entry and confirm it appears on `/docket`.
6. Link a docket from `/dashboard/requests/:id` and confirm private payloads remain absent from `/docket/:id`.
7. Test Discord posting with `DISCORD_BOT_TOKEN` present; without it, the docket remains stored and the sync status records the failure.

## Publishing / Cloudflare URL

Do not deploy unless local validation passes and production secrets are configured outside Git.

Required validation before publishing:

```bash
corepack pnpm install
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --local
```

Remote preparation commands, to run only when ready:

```bash
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --remote
corepack pnpm exec wrangler deploy
```

For the frontend, prefer the existing Cloudflare Pages GitHub deployment. If manual Pages deployment is needed, publish `apps/web/dist` after the build succeeds. Once Pages publishes, open the configured `.pages.dev` URL for the public portal and set the Cloudflare Pages production variable:

```bash
VITE_API_BASE_URL=https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev
```

Cloudflare Pages frontend requires `VITE_API_BASE_URL` to point to the deployed Worker URL. Without this, Pages will return `index.html` for `/api` routes and pages such as `/resources`, `/faq`, `/docket`, `/bar-exam`, and `/login` will show JSON parse errors.

The Worker must be deployed separately and remote D1 migrations must be applied before production API routes work:

```bash
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --remote
corepack pnpm exec wrangler deploy
```

Discord Developer Portal must include the production Worker callback URL:

```txt
https://YOUR_WORKER_URL/api/auth/discord/callback
```

Never publish or commit `.dev.vars`, `.wrangler/`, Discord bot tokens, Discord client secrets, `SESSION_SECRET`, session hashes, private filings, private docket notes, or Bar Exam answer keys.

## Stage 5 Native Bar Exam Platform

Stage 5 replaces the legacy Google Apps Script / Google Forms candidate flow with a native Discord-authenticated Bar Exam system.

Candidate routes:

- `/bar-exam`
- `/bar-exam/start`
- `/bar-exam/attempt`
- `/bar-exam/submitted`

Reviewer routes:

- `/dashboard/bar-exam`
- `/dashboard/bar-exam/:id`
- `/dashboard/bar-exam/versions`

Candidate API:

- `GET /api/bar-exam/status`
- `GET /api/bar-exam/resources`
- `POST /api/bar-exam/start`
- `GET /api/bar-exam/attempt`
- `PATCH /api/bar-exam/attempt/draft`
- `POST /api/bar-exam/attempt/submit`

Reviewer API:

- `GET /api/admin/bar-exam/attempts`
- `GET /api/admin/bar-exam/attempts/:id`
- `PATCH /api/admin/bar-exam/attempts/:id/score`
- `POST /api/admin/bar-exam/attempts/:id/mark-under-review`
- `POST /api/admin/bar-exam/attempts/:id/pass`
- `POST /api/admin/bar-exam/attempts/:id/fail`
- `POST /api/admin/bar-exam/attempts/:id/refer`
- `POST /api/admin/bar-exam/attempts/:id/void`
- `POST /api/admin/bar-exam/attempts/:id/reopen`
- `GET /api/admin/bar-exam/attempts/:id/events`
- `POST /api/admin/bar-exam/attempts/:id/events`
- `GET /api/admin/bar-exam/versions`
- `POST /api/admin/bar-exam/versions/seed`

Eligibility:

- Candidate access requires `START_BAR_EXAM`, derived from Bar Candidate, Bar Eligible, Chief Justice, or Admin roles.
- Reviewer access requires `REVIEW_BAR_EXAMS`, derived from Bar Association Member, Chief Justice, or Admin roles.
- Authorization is enforced in the Worker. Frontend checks are only for navigation and user experience.

Identity and version locking:

- Discord user ID is the primary identity lock.
- The lock key is `discord_user_id + exam_track + exam_cycle`.
- A candidate receives one server-assigned active version per exam track/cycle.
- Reopening `/bar-exam/attempt` returns the same assigned version.
- Candidates cannot choose versions, create duplicate active attempts, submit twice, or edit after final submission.

Timer and submissions:

- Attempts have a 24-hour `deadline_at`.
- Candidate draft saves are allowed only while the attempt is editable and before the deadline.
- The Worker expires editable attempts after the deadline.
- Final submission locks answers and creates Bar Exam events/audit logs.

Security:

- Candidate API responses return only title, assigned version label, candidate-safe instructions, questions, choices, point values, deadline/status, and the candidate's own draft answers.
- Candidate APIs never return answer keys, rubrics, reviewer notes, model answers, correct answers, or reviewer-only metadata.
- Reviewer-only data is loaded only through protected admin endpoints.
- No AI-writing, answer-generation, rewrite, or completion feature is included in the candidate exam flow.

Private version seeding:

- `apps/worker/src/seeds/legacyBarExamAppsScript.js` remains ignored/local and must not be committed.
- `apps/worker/src/seeds/barExamVersions.server.ts` is Worker-only seed scaffolding with safe placeholder questions and no committed answer keys.
- `POST /api/admin/bar-exam/versions/seed` seeds six placeholder versions: DOJ A/B/C and Defense A/B/C.
- Before real exam use, run `corepack pnpm seed:bar-exam -- --remote --activate` from a private local checkout that contains the ignored legacy source.
- The local importer transforms the ignored legacy source into private D1 seed data and stores official questions plus server-only answer keys in D1.
- Do not copy answer keys into `apps/web`, `packages/shared`, public assets, README, Discord messages, or frontend build output.
- `corepack pnpm seed:bar-exam -- --dry-run` prints counts and labels only. It does not print answer keys.
- `/dashboard/bar-exam/versions` shows available versions, placeholder/imported status, active state, and reviewer/admin publication controls.
- Until the private import has been run and at least one version is active, candidate `/bar-exam` shows that no active exam is available.

Duplicate-attempt protection:

- The D1 partial unique index locks one attempt per `identity_lock_key` for active, submitted, reviewed, final, reopened, and follow-up statuses.
- The protected statuses include `OPENED`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `PASSED`, `FAILED`, `REFERRED_FOR_INTERVIEW`, `NEEDS_CANDIDATE_FOLLOW_UP`, and `REOPENED`.
- `VOIDED` and `EXPIRED` are excluded so staff may intentionally allow a new cycle/attempt after administrative review.

Discord notifications:

- Final submission attempts to post a safe internal notification to the configured `BAR_EXAM_SUBMISSIONS` channel.
- The notification may ping the configured Bar Association Member role from D1 role mappings.
- Discord notifications include attempt metadata and a protected reviewer dashboard link, not full answers.
- Discord notification failure never loses the D1 submission.
- Final reviewer decisions, including administrative voids, attempt a safe Discord DM to the candidate.
- If DM fails, the Worker tries a minimal safe mention in a configured public fallback channel.
- Preferred fallback mapping is `GENERAL_CHAT`; alternate supported mapping is `BAR_EXAM_FOLLOWUP_PUBLIC`.
- If neither safe fallback mapping is configured, the Worker records the DM/fallback failure and requires manual staff follow-up.
- Public fallback text is minimal and must never include score, failed questions, reviewer notes, answer keys, rubrics, or private review details.

Local Stage 5 testing:

```bash
corepack pnpm install
corepack pnpm exec wrangler d1 migrations apply miami-stories-doj-db --local
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm dev
```

Then:

1. Log in with Discord at `/login`.
2. Use a user with Bar Candidate or Bar Eligible status to open `/bar-exam`.
3. Seed placeholder versions from `/dashboard/bar-exam/versions` as a reviewer/admin.
4. Start an attempt at `/bar-exam/start`.
5. Save draft answers and reload `/bar-exam/attempt` to confirm the same version returns.
6. Submit once and confirm the attempt locks.
7. Open `/dashboard/bar-exam/:id` as a reviewer to score and decide the attempt.
8. Confirm unauthenticated/ineligible users cannot access exam questions.

Never publish or commit `.dev.vars`, `.wrangler/`, Discord bot tokens, Discord client secrets, `SESSION_SECRET`, session hashes, private Bar Exam source, official answer keys, rubrics, reviewer notes, or candidate answers.
