# Miami Stories DOJ Portal Config

This project is a copied and rebranded Miami Stories DOJ portal. Do not reuse Shotta production Cloudflare, Discord, D1, OAuth, or domain values.

## Cloudflare

- Pages project: `miami-stories-doj-portal`
- Worker project: `miami-stories-doj-api`
- D1 database: `miami-stories-doj-db`
- D1 binding: `DB`
- Public app URL: `https://miami-stories-doj.pages.dev`
- Worker/API URL: `https://miami-stories-doj-api.natsu-dragneel13576.workers.dev`

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
- `VITE_DISCORD_RESOURCE_CHANNEL_ID=1523789799830589542` if the public Bar page should link to `resource-compendium`

`LEGACY_BAR_EXAM_URL` should stay blank unless a Miami-specific legacy form URL is intentionally added.

## Discord Role IDs To Configure

Use the existing mapping keys and permission names, but insert these Miami Stories Discord role IDs in D1/admin tools.

| Role Name | Permission | Discord Role ID |
| --- | --- | --- |
| Chief Justice | `CHIEF_JUSTICE` | `1457659514474991818` |
| Supreme Court Justice | `JUSTICE` | `1395614223920267285` |
| Judge | `JUDGE` | `1395614223861678162` |
| DOJ Portal Admin | `ADMIN` | `1523772553456386079` |
| Attorney General | `PROSECUTOR` | `1395614223920267286` |
| Assistant Attorney General | `PROSECUTOR` | `1395614223882780729` |
| District Attorney | `PROSECUTOR` | `1523779187867914453` |
| Assistant District Attorney | `PROSECUTOR` | `1523779265760333914` |
| Bar Association Member | `BAR_ASSOCIATION_MEMBER` | `1523782462088675398` |
| Bar Licensed | `BAR_ACTIVE` | `1523782508716490854` |
| Private Practitioner | `BAR_ACTIVE` | `1395614223861678159` |
| Defense Attorney | `DEFENSE_ATTORNEY` | `1523782301702553620` |
| Public Defender | `PUBLIC_DEFENDER_CERTIFIED` | `1395614223861678160` |
| Bar Candidate | `BAR_CANDIDATE` | `1523782559966953562` |
| Bar Eligible | `BAR_ELIGIBLE` | `1523782597820551358` |
| Civilian | `CIVILIAN` | `1395614223366754397` |

Reference-only Miami roles may also be entered for display and diagnostics:

| Role Name | Discord Role ID |
| --- | --- |
| Miami Stories DOJ bot role | `1523833312731201590` |
| Judicial Branch | `1523778635104780429` |
| Executive Branch | `1523779395716776016` |
| Defense Branch | `1523782369461403888` |
| DA Paralegal | `1523779329442578603` |
| Chief Public Defender | `1457662900192809054` |
| Defense Paralegal | `1523782153543090286` |
| PD High Command | `1396553641636397218` |
| PD Liaison | `1395614223828258880` |
| EMS MDT | `1461213599405047881` |
| Clerk of Court | `1398059940614242384` |
| DOJ High Command | `1488452096771752037` |
| ATF Special Agent | `1523784013993611364` |
| Leave Of Absence | `1395614223366754401` |
| Miami Citizen | `1395614223366754397` |

Reference-only Miami roles not yet supplied: Court Clerk, Lawyer Trainer, Judge Trainer, Application Reviewer, Applicant, Needs Training, Under Review By IA, Strike 1, Strike 2, Terminated, Server Admin, Server Moderator, Law Enforcement Officer, Chief of Police, Server Booster, and Bots.

## Discord Channel And Category IDs To Configure

| Mapping Key | Purpose | Miami Discord Destination | Discord ID |
| --- | --- | --- | --- |
| `BAR_EXAM_SUBMISSIONS` | Bar Exam submissions/reviewer notifications | `bar-exam-responses` | `1523805114630930724` |
| `BAR_EXAM_FOLLOWUP_CATEGORY` | Private Bar Exam follow-up channels | `Bar Exams` category | `1523805013749666019` |
| `GENERAL_CHAT` | Safe non-sensitive follow-up fallback | `general-chat` | `1505603404125307062` |
| `DOJ_DOCKET` | Public docket publishing | `doj-docket` | `1523789891601960980` |
| `JUDICIAL_RECORDS` | Public judicial records publishing | `judicial-records` | `1523789863382679592` |
| `REQUEST_LAWYER` | Defense counsel request intake | `request-a-lawyer` | `1523800735928811661` |
| `REQUEST_CRIMINAL_TRIAL` | Court hearing request intake | `request-criminal-trial` | `1523800758154297586` |
| `REQUEST_CIVIL_CASE` | Civil claim intake | `request-civil-case` | `1523800778182234152` |
| `REQUEST_SUBPOENA` | Subpoena request intake | `request-subpoena` | `1523800804291645656` |
| `REQUEST_WARRANT` | Warrant request intake | `request-warrant` | `1523800818711531580` |
| `REQUEST_SEARCH_SEIZURE` | Search and seizure review intake | `request-search-seizure` | `1523800836755558410` |
| `REQUEST_EXPUNGEMENT` | Expungement request intake | `request-expungement` | `1523800942733033552` |
| `REQUEST_MARRIAGE` | Marriage certificate review intake | `request-marriage-certificate` | `1523800960663818362` |
| `REQUEST_DIVORCE` | Divorce review intake | `request-divorce` | `1523800978384752742` |
| `ADMIN_LOG` | Administrative audit messages | `portal-admin-log` | `1523813307058880533` |
| `CRIMINAL_TRIALS_CATEGORY` | Private court hearing tickets | `[ Criminal Trials ]` category | `1523803878171344957` |
| `CIVIL_CASES_CATEGORY` | Private civil claim tickets | `[ Civil Cases ]` category | `1504220541102330059` |
| `SUBPOENAS_CATEGORY` | Private subpoena tickets | `[ Subpoenas ]` category | `1523804034056716460` |
| `WARRANTS_CATEGORY` | Private warrant/search tickets | `[ Warrants ]` category | `1523804674896036023` |
| `EXPUNGEMENTS_CATEGORY` | Private expungement tickets | `[ Expungements ]` category | `1523804820996231260` |
| `MARRIAGE_DIVORCE_CATEGORY` | Private marriage/divorce tickets | `Marriage & Divorce Certificates` category | `1523804898628731124` |

Transcript archive mappings also need Miami channel IDs before archive links can open in Discord.

| Archive Mapping | Miami Discord Destination | Discord ID |
| --- | --- | --- |
| Criminal trial transcripts | `criminal-trials-transcripts` | `1523812752877945015` |
| Civil case transcripts | `civil-cases-transcripts` | `1523812773023449098` |
| Subpoena transcripts | `subpoena-transcripts` | `1523812793688789144` |
| Warrant transcripts | `warrants-executed-transcripts` | `1523812813133578310` |
| Expungement records | `expungement-records` | `1523812832406143076` |
| Certificates issued transcripts | `certificates-issued-transcripts` | `1523812853948350587` |
| Bar exam transcripts | `bar-exam-transcripts` | `1523812874169090078` |

Additional Discord destinations available for reference:

| Destination | Discord ID |
| --- | --- |
| `verification` | `1395614224448753679` |
| `announcements` | `1395614224448753677` |
| `doj-website-portal` | `1523789755773489252` |
| `resource-compendium` | `1523789799830589542` |
| `faq` | `1523789836098736128` |
| `doj-bar-exam` | `1523790063056719993` |
| `DOJ General Chat` category | `1523800203726028872` |
| `welcome` | `1523812486296506448` |
| `role-request` | `1417257207602614312` |
| `command-general` | `1523800405358674140` |
| `Requests & Ticket Panels` category | `1523800551622574100` |
| `DOJ Internal Operations` category | `1395614225824612357` |
| `internal-announcements` | `1395614225824612359` |
| `defense-general-chat` | `1523802707406884986` |
| `prosecution-general-chat` | `1523812547021635755` |
| `doj-general-chat` | `1523802731691643044` |
| `case-assignments` | `1523802759495684330` |
| `training-and-resources` | `1523802779452444812` |
| `doj-questions-and-clarifications` | `1523802800478355488` |
| `loa-request` | `1395614226139316307` |
| `judge-chambers` | `1523802815540232394` |
| `DOJ Case Archives` category | `1523812679209451612` |
| `ticket-logs` | `1455629739145564161` |

## Items To Verify

- No Discord category ID was supplied for `DOJ Announcements & Resources`; only the channels inside it were supplied.
- Server Staff, Server Booster, Strike 1, Strike 2, Terminated, and several training/application roles appear in the screenshots but were not supplied as typed IDs.

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

Deployment is intentionally not ready until Miami-specific Cloudflare and Discord values are supplied. `wrangler.toml` should have no production route attached unless the Miami deployment is intentionally going live.
