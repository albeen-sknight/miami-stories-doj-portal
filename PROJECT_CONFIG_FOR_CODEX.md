# Miami Stories DOJ Portal Config

This project is a copied and rebranded Miami Stories DOJ portal. Do not reuse Shotta production Cloudflare, Discord, D1, OAuth, or domain values.

## Cloudflare

- Pages project: `miami-stories-doj-portal`
- Worker project: `miami-stories-doj-api`
- D1 database: `miami-stories-doj-db`
- D1 binding: `DB`
- Public app placeholder: `https://miami-stories-doj.pages.dev`
- Worker/API placeholder: `https://miami-stories-doj-api.example`

Before deployment, create a new Miami D1 database and replace the placeholder `database_id` in `wrangler.toml`.

## Required Environment

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_PUBLIC_KEY`
- `SESSION_SECRET`
- `PUBLIC_APP_URL`
- `WORKER_APP_URL`
- `BOOTSTRAP_ADMIN_DISCORD_IDS`
- `VITE_API_BASE_URL` for Pages
- `VITE_DISCORD_GUILD_ID` for frontend Discord links
- `VITE_DISCORD_RESOURCE_CHANNEL_ID` if the public Bar page should link to a Discord resource channel

`LEGACY_BAR_EXAM_URL` should stay blank unless a Miami-specific legacy form URL is intentionally added.

## Discord Role IDs To Configure

Use the existing mapping keys and permission names, but insert Miami Stories Discord role IDs in D1/admin tools.

| Role Name | Permission |
| --- | --- |
| Chief Justice | CHIEF_JUSTICE |
| Supreme Court Justice | JUSTICE |
| Judge | JUDGE |
| DOJ Portal Admin | ADMIN |
| Attorney General | PROSECUTOR |
| Assistant Attorney General | PROSECUTOR |
| District Attorney | PROSECUTOR |
| Assistant District Attorney | PROSECUTOR |
| Bar Association Member | BAR_ASSOCIATION_MEMBER |
| Bar Licensed | BAR_ACTIVE |
| Private Practitioner | BAR_ACTIVE |
| Defense Attorney | DEFENSE_ATTORNEY |
| Public Defender | PUBLIC_DEFENDER_CERTIFIED |
| Bar Candidate | BAR_CANDIDATE |
| Bar Eligible | BAR_ELIGIBLE |
| Civilian | CIVILIAN |

Reference-only Miami roles may also be entered for display and diagnostics: Judicial Branch, Executive Branch, Defense Branch, DA Paralegal, Defense Paralegal, PD High Command, PD Liaison, Clerk of Court, Court Clerk, Lawyer Trainer, Judge Trainer, Application Reviewer, Applicant, Needs Training, ATF Special Agent, Under Review By IA, Leave Of Absence, Strike 1, Strike 2, Terminated, Server Admin, Server Moderator, Law Enforcement Officer, Chief of Police, Miami Citizen, Server Booster, and Bots.

## Discord Channel And Category IDs To Configure

| Mapping Key | Purpose |
| --- | --- |
| BAR_EXAM_SUBMISSIONS | Bar Exam submissions/reviewer notifications |
| BAR_EXAM_FOLLOWUP_CATEGORY | Private Bar Exam follow-up channels |
| GENERAL_CHAT | Safe non-sensitive follow-up fallback |
| DOJ_DOCKET | Public docket publishing |
| JUDICIAL_RECORDS | Public judicial records publishing |
| REQUEST_LAWYER | Defense counsel request intake |
| REQUEST_CRIMINAL_TRIAL | Court hearing request intake |
| REQUEST_CIVIL_CASE | Civil claim intake |
| REQUEST_SUBPOENA | Subpoena request intake |
| REQUEST_WARRANT | Warrant request intake |
| REQUEST_SEARCH_SEIZURE | Search and seizure review intake |
| REQUEST_EXPUNGEMENT | Expungement request intake |
| REQUEST_MARRIAGE | Marriage certificate review intake |
| REQUEST_DIVORCE | Divorce review intake |
| ADMIN_LOG | Administrative audit messages |
| CRIMINAL_TRIALS_CATEGORY | Private court hearing tickets |
| CIVIL_CASES_CATEGORY | Private civil claim tickets |
| SUBPOENAS_CATEGORY | Private subpoena tickets |
| WARRANTS_CATEGORY | Private warrant/search tickets |
| EXPUNGEMENTS_CATEGORY | Private expungement tickets |
| MARRIAGE_DIVORCE_CATEGORY | Private marriage/divorce tickets |

Transcript archive mappings also need Miami channel IDs before archive links can open in Discord.

## Brand Assets

The current copied asset paths are preserved so the app builds:

- `apps/web/public/logo.png`
- `apps/web/public/logo-160.webp`
- `apps/web/public/favicon.png`
- `apps/web/public/hero-background.webp`
- `apps/web/public/building-background.webp`
- `apps/web/public/og-image.png`

Replace these with authorized Miami Stories assets when available. The intended style is neon Miami: midnight navy backgrounds, hot pink/cyan accents, tropical skyline or water imagery, and a professional DOJ portal feel.

## Deployment Safety

Deployment is intentionally not ready until Miami-specific Cloudflare and Discord values are supplied. `wrangler.toml` has no production route attached and uses a zero D1 database ID placeholder to prevent accidental Shotta production deployment.
