/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Public Routes and Dashboard Screens
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: (c) 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  Landmark,
  LayoutDashboard,
  Scale,
  ShieldCheck
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type {
  AttorneyProfile,
  BarExamAnswerDraft,
  BarExamCandidateAttempt,
  BarExamTrack,
  CreateDocketInput,
  CurrentUserResponse,
  DocketCaseType,
  DocketDetail,
  DocketProceedingType,
  DocketStatus,
  EligibleJudge,
  FaqEntry,
  TicketTranscriptDetail,
  TicketTranscriptMessage,
  TicketTranscriptSummary
} from "@shotta-doj/shared";
import { DOCKET_CASE_TYPES, DOCKET_PROCEEDING_TYPES, DOCKET_STATUSES, RESOURCE_CATEGORIES } from "@shotta-doj/shared";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  addRequestEvent,
  archiveDocketEntry,
  archiveJudicialRecord,
  archiveAdminFaq,
  archiveAdminResource,
  assignRequest,
  authStartUrl,
  bootstrapSession,
  closeDocketEntry,
  createAdminFaq,
  createAdminResource,
  createDiscordTicket,
  createBarExamFollowupChannel,
  createDocketEntry,
  createDocketFromRequest,
  createJudicialRecord,
  closeDiscordTicket,
  createServiceRequest,
  deleteAdminFaq,
  deleteAdminRequest,
  deleteAdminResource,
  deleteBarExamAttempt,
  deleteBarExamVersion,
  deleteDocketEntry,
  deleteJudicialRecord,
  fetchAdminBarSummary,
  fetchAdminFaq,
  fetchAdminResources,
  fetchAdminRequest,
  fetchAdminRequests,
  fetchAdminDocket,
  fetchAdminDocketDetail,
  fetchAdminJudicialRecords,
  fetchAdminBarExamAttempt,
  fetchAdminBarExamAttempts,
  fetchAdminBarExamVersions,
  fetchBarExamAttempt,
  fetchBarExamResources,
  fetchBarExamStatus,
  fetchDeletionLog,
  fetchDiscordDiagnostics,
  fetchDocket,
  fetchEligibleJudges,
  fetchFaq,
  fetchLawyerProfile,
  fetchLawyers,
  fetchMe,
  fetchMyRequests,
  fetchPublicDocketDetail,
  fetchJudicialRecords,
  fetchRequest,
  fetchResources,
  fetchTicketTranscript,
  fetchTicketTranscripts,
  importAdminFaq,
  logout as logoutApi,
  markBarExamAttempt,
  postDocketToDiscord,
  postDiscordTicketEmbed,
  publishAdminFaq,
  publishAdminResource,
  publishBarExamVersion,
  publishDocketEntry,
  publishJudicialRecord,
  refreshRoles,
  restoreDeletionLogEntry,
  saveBarExamDraft,
  scoreBarExamAttempt,
  searchJudicialHistory,
  startBarExam,
  submitBarExam,
  unpublishAdminFaq,
  unpublishAdminResource,
  unpublishBarExamVersion,
  unpublishDocketEntry,
  updateAdminFaq,
  updateAdminResource,
  updateDocketEntry,
  updateRequestStatus
} from "./api";
import type { JudicialHistorySearchResponse, JudicialRecord, JudicialRecordInput } from "./api";
import { Badge, ButtonLink, Card, ErrorState, ExternalAnchor, Layout, LoadingState, Markdown, PageHeader } from "./components";
import { dashboardRoutes, divisions, requestForms, serviceCards, serviceGroups } from "./data";
import { useAsync } from "./hooks";
import seoRoutes from "./seoRoutes.json";

const DISCORD_INVITE_URL = "https://discord.gg/4f5Ga4RVVR";
const DISCORD_GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || "REPLACE_WITH_MIAMI_DISCORD_GUILD_ID";
const DISCORD_RESOURCE_CHANNEL_ID = import.meta.env.VITE_DISCORD_RESOURCE_CHANNEL_ID || "";
const SITE_URL = "https://miami-stories-doj.pages.dev";
const SITE_NAME = "Miami Stories Department of Justice";
const DEFAULT_DESCRIPTION =
  "Florida-inspired legal services, court administration, Bar licensing, and public justice resources for Miami Stories RP.";
const SOCIAL_IMAGE_URL = `${SITE_URL}/miami-og-image.png`;

type SeoRoute = {
  path: string;
  title: string;
  description: string;
};

const seoRouteMap = new Map((seoRoutes as SeoRoute[]).map((route) => [route.path, route]));

export function App() {
  const [me, setMe] = useState<CurrentUserResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMe({ authenticated: false, user: null, roles: [], permissions: [], actionPermissions: [], isBootstrapAdmin: false }))
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogout() {
    await logoutApi().catch(() => undefined);
    setMe({ authenticated: false, user: null, roles: [], permissions: [], actionPermissions: [], isBootstrapAdmin: false });
    navigate("/");
  }

  return (
    <Layout me={me} onLogout={handleLogout}>
      <SeoManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/docket" element={<Docket />} />
        <Route path="/docket/:docketId" element={<PublicDocketDetail />} />
        <Route path="/lawyers" element={<Lawyers />} />
        <Route path="/lawyers/:profileSlug" element={<LawyerProfileDetail />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:serviceId" element={<ServiceForm />} />
        <Route path="/requests/mine" element={<MyRequests me={me} loading={authLoading} />} />
        <Route path="/requests/:requestId" element={<RequestDetail me={me} loading={authLoading} />} />
        <Route path="/bar-exam" element={<BarExam me={me} loading={authLoading} />} />
        <Route path="/bar-exam/start" element={<BarExamStart me={me} loading={authLoading} />} />
        <Route path="/bar-exam/attempt" element={<BarExamAttempt me={me} loading={authLoading} />} />
        <Route path="/bar-exam/submitted" element={<BarExamSubmitted me={me} loading={authLoading} />} />
        <Route path="/legal" element={<LegalNoticePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/cookies" element={<CookiePolicyPage />} />
        <Route path="/terms" element={<TermsOfUsePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/logout" element={<LogoutPage onLogout={handleLogout} />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/dashboard/requests" element={<StaffRequests me={me} loading={authLoading} />} />
        <Route path="/dashboard/discord" element={<DiscordDiagnosticsPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/deletion-log" element={<DeletionLogPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/transcripts" element={<TicketTranscriptsPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/transcripts/:transcriptId" element={<TicketTranscriptDetailPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/resources" element={<ResourceManager me={me} loading={authLoading} />} />
        <Route path="/dashboard/faq" element={<FaqManager me={me} loading={authLoading} />} />
        <Route path="/dashboard/bar" element={<BarAssociationDashboard me={me} loading={authLoading} />} />
        <Route path="/dashboard/judicial" element={<JudicialTools me={me} loading={authLoading} />} />
        <Route path="/dashboard/docket" element={<DocketDashboard me={me} loading={authLoading} />} />
        <Route path="/dashboard/docket/new" element={<DocketFormPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/docket/:docketId" element={<DocketAdminDetail me={me} loading={authLoading} />} />
        <Route path="/dashboard/docket/:docketId/edit" element={<DocketFormPage me={me} loading={authLoading} />} />
        <Route path="/dashboard/bar-exam" element={<BarExamReviewDashboard me={me} loading={authLoading} />} />
        <Route path="/dashboard/bar-exam/versions" element={<BarExamVersions me={me} loading={authLoading} />} />
        <Route path="/dashboard/bar-exam/:attemptId" element={<BarExamReviewDetail me={me} loading={authLoading} />} />
        {dashboardRoutes.filter((path) => !["/dashboard/requests", "/dashboard/discord", "/dashboard/deletion-log", "/dashboard/transcripts", "/dashboard/resources", "/dashboard/faq", "/dashboard/judicial", "/dashboard/docket", "/dashboard/bar", "/dashboard/bar-exam"].includes(path)).map((path) => (
          <Route key={path} path={path} element={<DashboardShell path={path} me={me} loading={authLoading} onRefresh={setMe} />} />
        ))}
        <Route path="/dashboard/requests/:requestId" element={<StaffRequestDetail me={me} loading={authLoading} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const seo = seoForPath(location.pathname);
    const canonicalUrl = `${SITE_URL}${seo.canonicalPath === "/" ? "/" : seo.canonicalPath}`;
    const robots = seo.indexable ? "index,follow" : "noindex,nofollow";

    document.title = seo.title;
    setMeta("name", "description", seo.description);
    setMeta("name", "robots", robots);
    setLink("canonical", canonicalUrl);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", seo.title);
    setMeta("property", "og:description", seo.description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", SOCIAL_IMAGE_URL);
    setMeta("property", "og:image:secure_url", SOCIAL_IMAGE_URL);
    setMeta("property", "og:image:width", "1200");
    setMeta("property", "og:image:height", "630");
    setMeta("property", "og:image:alt", "Miami Stories Department of Justice Portal banner");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", seo.title);
    setMeta("name", "twitter:description", seo.description);
    setMeta("name", "twitter:image", SOCIAL_IMAGE_URL);
    setMeta("name", "twitter:image:alt", "Miami Stories Department of Justice Portal banner");
    setOrganizationJsonLd();
  }, [location.pathname]);

  return null;
}

function seoForPath(pathname: string): { title: string; description: string; canonicalPath: string; indexable: boolean } {
  const normalizedPath = normalizePath(pathname);
  const exactRoute = seoRouteMap.get(normalizedPath);
  if (exactRoute) return { ...exactRoute, canonicalPath: exactRoute.path, indexable: true };

  if (normalizedPath.startsWith("/docket/")) {
    return {
      title: "Public Docket Entry | Miami Stories DOJ",
      description: "Published Miami Stories DOJ docket entry details, public case references, proceeding status, and official notices.",
      canonicalPath: normalizedPath,
      indexable: true
    };
  }

  if (normalizedPath.startsWith("/lawyers/")) {
    return {
      title: "Attorney Profile | Miami Stories DOJ",
      description: "Public Miami Stories DOJ attorney or judicial officer profile with approved registry information.",
      canonicalPath: normalizedPath,
      indexable: true
    };
  }

  if (isPrivateOrWorkflowPath(normalizedPath)) {
    return {
      title: "Protected DOJ Portal Area | Miami Stories DOJ",
      description: "Protected Miami Stories DOJ Portal workspace for authenticated users and authorized administrative workflows.",
      canonicalPath: normalizedPath,
      indexable: false
    };
  }

  return {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    canonicalPath: "/",
    indexable: false
  };
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
}

function isPrivateOrWorkflowPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/bar-exam") ||
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/unauthorized"
  );
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${cssEscape(key)}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${cssEscape(rel)}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function setOrganizationJsonLd() {
  const id = "organization-json-ld";
  let element = document.getElementById(id) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement("script");
    element.id = id;
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    sameAs: ["https://github.com/albeen-sknight"]
  });
}

function cssEscape(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

function discordChannelUrl(channelId: string) {
  return `https://discord.com/channels/${DISCORD_GUILD_ID}/${channelId}`;
}

function Home() {
  return (
    <>
      <section className="relative min-h-[620px] overflow-hidden border-b border-white/10 sm:min-h-[680px]">
        <img src="/hero-background.png" alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/25" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl flex-col justify-center px-4 py-16 sm:min-h-[680px] sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-4xl min-w-0">
            <img src="/logo-160.webp" alt="" className="mb-6 h-20 w-20 rounded-full object-cover ring-2 ring-gold/50 sm:mb-8 sm:h-24 sm:w-24" />
            <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-gold sm:text-sm sm:tracking-[0.24em]">Miami, Florida - Florida-inspired RP law</p>
            <h1 className="mt-4 break-words text-4xl font-semibold min-[390px]:text-5xl sm:text-6xl lg:text-7xl">Miami Stories Department of Justice</h1>
            <p className="mt-6 text-xl text-zinc-200 sm:text-2xl">A Florida-based justice portal for Miami Stories roleplay.</p>
            <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-200 sm:text-lg sm:leading-8">
              Official legal services, court docket, Bar licensing, transcript archives, and justice administration for Miami Stories RP.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink href="/services">Request a Service</ButtonLink>
              <ButtonLink href="/resources" variant="ghost">View Legal Resources</ButtonLink>
              <ButtonLink href="/bar-exam" variant="ghost">Take Bar Exam</ButtonLink>
              <ButtonLink href="/docket" variant="ghost">View Docket</ButtonLink>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black sm:w-auto">
                Join the Discord <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 max-w-4xl rounded-lg border border-fuchsia-500/50 bg-fuchsia-500/10 p-4 text-sm leading-6 text-fuchsia-100 shadow-[0_0_24px_rgba(236,72,153,0.18)]">
              <strong className="text-fuchsia-300">Website under construction:</strong>{" "}
              The Miami Stories DOJ portal is currently being built and reviewed. Public resources,
              service forms, templates, docket tools, and legal references may be incomplete or subject to change.
              This site reflects Miami Stories RP procedures and Florida-inspired RP law only. It is not
              real-world legal advice.
            </div>
          </div>
        </div>

      </section>

      <section className="bg-ink px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">Mission</p>
              <h2 className="mt-3 text-3xl font-semibold">Accessible justice with clean records and accountable process.</h2>
            </div>
            <p className="text-lg leading-8 text-zinc-300">
              The mission of the Department of Justice is to support a Florida-inspired RP legal framework adapted for
              Miami Stories. The portal keeps court procedure, legal services, Bar licensing, public records, and staff
              administration organized without becoming overly real-life legalistic.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-black px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Institutional Role" title="A balanced justice institution for Miami Stories" />
          <p className="mt-4 max-w-4xl text-lg leading-8 text-zinc-300">
            The Department coordinates court administration, prosecutor review, defense counsel access, attorney
            licensing, public legal resources, civil and administrative services, docket publication, Bar Examination
            management, and communication between legal actors and the public throughout Miami Stories.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Transparency", "Published resources, public docket surfaces, and reviewable records make DOJ actions easier to understand."],
              ["Accountability", "Authorized courts may review charges, warrants, subpoenas, policies, and proceedings for procedural defects."],
              ["Due Process", "Court procedures, access to counsel, and evidentiary standards protect against misuse of legal authority."],
              ["Judicial Independence", "Judges and authorized courts serve as gatekeepers for legal process, evidence, and compliance."]
            ].map(([title, text]) => (
              <Card key={title}>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Divisions" title="What the DOJ does" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {divisions.map(([title, description, Icon]) => (
              <Card key={title}>
                <Icon className="h-7 w-7 text-gold" />
                <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Services" title="Public intake routes" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {serviceCards.map((service) => (
              <Link key={service.href} to={service.href} className="group rounded-md border border-white/10 bg-panel p-5 transition hover:border-gold/60">
                <service.icon className="h-7 w-7 text-gold" />
                <h3 className="mt-4 text-lg font-semibold">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{service.description}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold">
                  Open route <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Checks and Balances" title="Oversight, evidence standards, and defense protections" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Judicial Review", "Federal judges and authorized courts may review DOJ actions, policies, criminal charges, warrants, subpoenas, and proceedings. Courts may invalidate defective actions or dismiss charges that violate due process or protected rights under the Miami Stories Charter, Penal Code, applicable departmental directives, and controlling court procedure."],
              ["Evidence Standards", "Courts act as gatekeepers for evidence. Improperly obtained evidence may be suppressed, and weak or poorly investigated cases may be dismissed before they proceed."],
              ["Access to Counsel", "The portal supports the right to defense by helping residents request legal representation and understand the attorney pathway."],
              ["Prosecution and Defense Balance", "The DOJ supports lawful prosecution while preserving accused persons' rights, fair hearings, and review of government action."],
              ["Public Docket and Records", "Public notices and docket references give residents a clearer view into documented proceedings and official records."],
              ["Professional Standards", "Attorney licensing, Bar status, and future registry tools help regulate practice standards across the Miami Stories justice system."]
            ].map(([title, text]) => (
              <Card key={title}>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 px-4 py-16 sm:px-6 lg:px-8">
        <img src="/building-background.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <Card className="bg-black/70">
            <SectionTitle eyebrow="Transparency" title="Public records surface" />
            <div className="mt-6 grid gap-3 text-sm">
              {[
                ["Public docket", "/docket"],
                ["Published legal resources", "/resources"],
                ["FAQ", "/faq"],
                ["Attorney registry", "/lawyers"],
                ["Public notices", "/docket"]
              ].map(([label, href]) => (
                <Link key={label} to={href} className="flex items-center justify-between rounded-md border border-white/10 px-4 py-3 hover:border-gold/50">
                  {label}
                  <ArrowRight className="h-4 w-4 text-gold" />
                </Link>
              ))}
            </div>
          </Card>
          <Card className="bg-black/70">
            <SectionTitle eyebrow="Bar Pathway" title="From candidate to active practice" />
            <ol className="mt-6 grid gap-3 text-sm text-zinc-200">
              {[
                "Review official resources.",
                "Take written Bar Examination.",
                "Receive Bar Eligible status.",
                "Complete competency check.",
                "Receive Bar Active status.",
                "Optional Public Defender certification."
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-black">{index + 1}</span>
                  <span className="pt-1">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </section>
    </>
  );
}

/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Public Legal and Policy Pages
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: (c) 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

function LegalNoticePage() {
  return (
    <PolicyPage eyebrow="Legal Notice" title="Legal Notice">
      <p>The Miami Stories Department of Justice Portal is maintained for Miami Stories Department of Justice administrative and community proceedings.</p>
      <p>(c) 2026 Miami Stories Department of Justice Portal. All rights reserved.</p>
      <p>
        Unauthorized copying, redistribution, resale, sublicensing, republication, scraping, cloning, modification,
        derivative use, or reuse of this portal, including its design, source code, written materials, forms, templates,
        workflows, branding, records structure, and administrative systems, is prohibited without prior permission from
        the project owner.
      </p>
      <p>
        The real project owner identifier for source-code and repository ownership is albeen-sknight:
        {" "}<ExternalAnchor href="https://github.com/albeen-sknight">https://github.com/albeen-sknight</ExternalAnchor>
      </p>
      <p>This portal is provided for Miami Stories community proceedings and administrative use. It does not provide real-world legal advice.</p>
    </PolicyPage>
  );
}

function PrivacyPolicyPage() {
  return (
    <PolicyPage eyebrow="Privacy Policy" title="Privacy Policy">
      <p>
        Discord login is used for authentication. The portal may store Discord account identifiers, display names,
        role information, session records, and related access-control data needed to operate protected DOJ features.
      </p>
      <p>
        The portal may store service requests, Bar Exam attempts, docket records, judicial records, lawyer profiles,
        Discord ticket metadata, deletion records, and administrative logs. This data is used for DOJ administration,
        request handling, access control, Bar Exam processing, recordkeeping, audit review, and operational continuity.
      </p>
      <p>
        Access to private records is restricted by role-based permissions. Public records may be displayed publicly when
        intentionally published through the portal workflow.
      </p>
      <p>
        Users should not submit unnecessary sensitive real-world personal information. The portal is intended for Miami
        Stories community proceedings and administrative use, not real-world legal intake.
      </p>
      <p>
        The project owner identifier for repository and source-code ownership is albeen-sknight, while public DOJ
        operations remain under the Miami Stories Department of Justice portal identity.
      </p>
    </PolicyPage>
  );
}

function CookiePolicyPage() {
  return (
    <PolicyPage eyebrow="Cookie Policy" title="Cookie Policy">
      <p>
        The portal currently uses essential authentication/session cookies only. These are required for login-protected
        functionality.
      </p>
      <p>
        Essential cookies and session tokens are used to keep users signed in, protect sessions, and complete the Discord
        OAuth login flow. Cookies may be set by the Worker API and Discord OAuth flow.
      </p>
      <p>
        Essential cookies are required for protected features such as service request history, dashboard access, Bar Exam
        attempts, review tools, and administrative actions.
      </p>
      <p>
        The site does not need a marketing cookie banner unless non-essential analytics or tracking cookies are added. If
        analytics or tracking is later added, this page should be updated and consent handling should be added.
      </p>
    </PolicyPage>
  );
}

function TermsOfUsePage() {
  return (
    <PolicyPage eyebrow="Terms of Use" title="Terms of Use">
      <p>Use of the portal must follow Miami Stories community rules and DOJ administrative expectations.</p>
      <p>
        Users must not abuse, spam, scrape, attack, bypass, interfere with, or attempt unauthorized access to the portal,
        its APIs, its records, or its connected Discord workflows.
      </p>
      <p>
        Users must not submit false, malicious, abusive, or intentionally disruptive requests. Bar Exam candidates must
        follow all integrity rules shown before and during the exam.
      </p>
      <p>
        Portal access may be restricted or revoked for misuse, unauthorized access attempts, abusive conduct, or other
        conduct that undermines DOJ administration.
      </p>
      <p>
        The project owner reserves all rights over the portal system, design, content, workflows, records structure, and
        source code.
      </p>
    </PolicyPage>
  );
}

function PolicyPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description="Official portal policy information for Miami Stories Department of Justice administrative use." />
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Card className="space-y-5 text-sm leading-7 text-zinc-200 sm:text-base">
            {children}
          </Card>
        </div>
      </section>
    </>
  );
}

function Resources() {
  const { data, loading, error } = useAsync(fetchResources);
  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["data"]>();
    data?.data.forEach((resource) => map.set(resource.category, [...(map.get(resource.category) ?? []), resource]));
    return map;
  }, [data]);

  return (
    <>
      <PageHeader eyebrow="Resources" title="Published legal resources" description="Review Miami Stories DOJ procedures, Florida-inspired RP legal standards, courtroom expectations, Bar requirements, and public filing guidance." />
      <div className="mb-6 rounded-lg border border-fuchsia-500/50 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-100 shadow-[0_0_24px_rgba(236,72,153,0.18)]">
  <strong className="text-fuchsia-300">Website under construction:</strong>{" "}
  Miami Stories DOJ resources are currently being drafted and reviewed. Published documents,
  templates, procedures, and legal references may be incomplete, outdated, or subject to change.
  This portal reflects Miami Stories RP procedures and Florida-inspired RP law only. It is not
  real-world legal advice.
</div>
      <Content>{loading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
        <div className="space-y-8">
          {data?.source === "seed" ? <Badge>Seed fallback</Badge> : <Badge>D1 records</Badge>}
          {[...grouped.entries()].map(([category, docs]) => (
            <section key={category}>
              <h2 className="mb-4 text-2xl font-semibold">{category.replaceAll("_", " ")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {docs.map((doc) => (
                  <Card key={doc.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{doc.title}</h3>
                        <p className="mt-2 text-sm text-muted">{doc.description}</p>
                      </div>
                      <Badge>{doc.version}</Badge>
                    </div>
                    <div className="mt-5">
                      <ExternalAnchor href={doc.url}>Open document</ExternalAnchor>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}</Content>
    </>
  );
}

function Faq() {
  const { data, loading, error } = useAsync(fetchFaq);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const entries = data?.data ?? [];
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category))], [entries]);
  const filteredEntries = useMemo(() => {
    const search = searchableText(query);
    return entries.filter((entry) => {
      const matchesCategory = selectedCategory === "All" || entry.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!search) return true;
      return searchableText(`${entry.category} ${entry.question} ${entry.answerMarkdown}`).includes(search);
    });
  }, [entries, query, selectedCategory]);
  const grouped = useMemo(() => {
    const map = new Map<string, FaqEntry[]>();
    filteredEntries.forEach((entry) => map.set(entry.category, [...(map.get(entry.category) ?? []), entry]));
    return map;
  }, [filteredEntries]);
  const topicChips = ["warrant", "subpoena", "bar", "marriage", "appeal", "expungement"];
  const hasFilters = query.length > 0 || selectedCategory !== "All";

  return (
    <>
      <PageHeader eyebrow="FAQ" title="Public DOJ FAQ" description="This portal is adapted for Miami Stories RP and supports fair, organized, accessible legal roleplay." />
      <Content>{loading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
        <div className="space-y-8">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              {data?.source === "seed" ? <Badge>Seed fallback</Badge> : <Badge>D1 records</Badge>}
              <p className="text-sm text-muted">Showing {filteredEntries.length} of {entries.length} FAQs</p>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="grid gap-2 text-sm font-medium text-zinc-200">
                Search FAQ
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search FAQ by keyword, topic, or procedure..."
                  className="rounded-md border border-white/10 bg-black px-3 py-3 text-sm outline-none focus:border-gold"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedCategory("All");
                }}
                disabled={!hasFilters}
                className="self-end rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear filters
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["All", ...categories].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    selectedCategory === category
                      ? "border-gold bg-gold text-black"
                      : "border-white/10 bg-black text-zinc-200 hover:border-gold/60"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {topicChips.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setQuery(topic)}
                  className="rounded-md border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold hover:border-gold"
                >
                  {topic}
                </button>
              ))}
            </div>
          </Card>
          {filteredEntries.length === 0 ? (
            <Card>
              <h2 className="text-xl font-semibold">No FAQ entries match your search.</h2>
              <p className="mt-2 text-sm text-muted">Try another keyword or choose a different category.</p>
            </Card>
          ) : null}
          {[...grouped.entries()].map(([category, entries]) => (
            <section key={category}>
              <h2 className="mb-4 text-2xl font-semibold">{category}</h2>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <Card key={entry.id}>
                    <h3 className="text-lg font-semibold">{entry.question}</h3>
                    <div className="mt-3">
                      <Markdown content={entry.answerMarkdown} />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}</Content>
    </>
  );
}

function searchableText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function Docket() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [caseType, setCaseType] = useState("");
  const [proceedingType, setProceedingType] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDocket>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (caseType) params.set("caseType", caseType);
    if (proceedingType) params.set("proceedingType", proceedingType);
    setLoading(true);
    fetchDocket(params.toString() ? `?${params.toString()}` : "")
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Docket load failed."))
      .finally(() => setLoading(false));
  }, [query, status, caseType, proceedingType]);
  return (
    <>
      <PageHeader eyebrow="Docket" title="Public docket" description="View scheduled hearings, judicial reviews, court notices, and published proceedings from the Miami Stories DOJ." />
      <Content>{loading ? <LoadingState /> : error ? <ErrorState message={error} /> : (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 md:grid-cols-4">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search docket, title, or party" className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold" />
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold">
                <option value="">All statuses</option>
                {DOCKET_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={caseType} onChange={(event) => setCaseType(event.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold">
                <option value="">All case types</option>
                {DOCKET_CASE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={proceedingType} onChange={(event) => setProceedingType(event.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold">
                <option value="">All proceedings</option>
                {DOCKET_PROCEEDING_TYPES.map((item) => <option key={item} value={item}>{formatDocketLabel(item)}</option>)}
              </select>
            </div>
          </Card>
          {data?.source === "seed" ? <Badge>Seed fallback</Badge> : <Badge>D1 public records</Badge>}
          {data?.data.map((entry) => (
            <Link key={entry.id} to={`/docket/${entry.id}`} className="block rounded-md border border-white/10 bg-panel p-5 shadow-gold hover:border-gold/60">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{entry.status}</Badge>
                <Badge>{entry.caseType}</Badge>
                <span className="text-sm text-muted">{entry.docketNumber}</span>
                {entry.filedOn ? <span className="text-sm text-muted">Filed {new Date(entry.filedOn).toLocaleDateString()}</span> : null}
                {entry.scheduledFor ? <span className="text-sm text-muted">Scheduled {new Date(entry.scheduledFor).toLocaleString()}</span> : null}
              </div>
              <h2 className="mt-4 text-2xl font-semibold">{entry.title}</h2>
              <p className="mt-2 text-muted">{entry.publicSummary}</p>
              <p className="mt-3 text-sm text-muted">Proceeding: {entry.proceedingType.replaceAll("_", " ")} - Judge: {entry.judgeName ?? "Pending assignment"}</p>
              {entry.linkedRequestNumber ? <p className="mt-2 text-sm text-gold">Linked request: {entry.linkedRequestNumber}</p> : null}
            </Link>
          ))}
          {data?.data.length === 0 ? <Card>No public docket entries match the current filters.</Card> : null}
        </div>
      )}</Content>
    </>
  );
}

function PublicDocketDetail() {
  const { docketId } = useParams();
  const { data, loading, error } = useAsync(() => fetchPublicDocketDetail(docketId ?? ""));
  const detail = data?.data;
  return (
    <>
      <PageHeader eyebrow="Docket Detail" title={detail?.docketNumber ?? "Public docket entry"} description={detail?.title ?? "Published docket details."} />
      <Content>{loading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : detail ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <div className="flex flex-wrap gap-3">
              <Badge>{detail.status}</Badge>
              <Badge>{detail.caseType}</Badge>
              <Badge>{detail.proceedingType.replaceAll("_", " ")}</Badge>
            </div>
            <h2 className="mt-4 text-3xl font-semibold">{detail.title}</h2>
            <div className="mt-5 grid gap-3 text-sm text-muted md:grid-cols-2">
              <p>Filed: {detail.filedOn ? new Date(detail.filedOn).toLocaleDateString() : "Pending"}</p>
              <p>Scheduled: {detail.scheduledFor ? new Date(detail.scheduledFor).toLocaleString() : "Pending"}</p>
              <p>Judge: {detail.judgeName ?? "Pending assignment"}</p>
              <p>Linked request: {detail.linkedRequestNumber ?? "None public"}</p>
            </div>
            <h3 className="mt-6 text-xl font-semibold">Public summary</h3>
            <div className="mt-3"><Markdown content={detail.summaryMarkdown} /></div>
            {detail.publicNotesMarkdown ? <div className="mt-6"><h3 className="text-xl font-semibold">Public notes</h3><Markdown content={detail.publicNotesMarkdown} /></div> : null}
          </Card>
          <Card>
            <h3 className="text-xl font-semibold">Official docket text</h3>
            <pre className="mt-4 max-h-[520px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black p-4 text-sm text-zinc-200">{detail.previewText}</pre>
          </Card>
        </div>
      ) : null}</Content>
    </>
  );
}

function formatRegistryStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function registryProfileKindLabel(profile: AttorneyProfile) {
  return profile.profileKind === "JUDICIAL_OFFICER" ? "Judicial Officer" : "Bar Licensed Attorney";
}

function Lawyers() {
  const { data, loading, error } = useAsync(fetchLawyers);
  const profiles = data?.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Judicial Directory"
        title="Bar Association Registry"
        description="Certified legal practitioners, public defense counsel, and authorized judicial officers serving Miami Stories."
      />
      <Content>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <div className="space-y-8">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                {data?.source === "seed" ? <Badge>Seed fallback</Badge> : <Badge>D1 public records</Badge>}
                <p className="text-sm text-muted">{profiles.length} public {profiles.length === 1 ? "profile" : "profiles"} listed</p>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">
                The registry publishes approved attorney profiles and authorized judicial officers whose public listing
                supports transparency, counsel access, and professional accountability across the Department of Justice.
              </p>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {profiles.map((profile) => (
                <Link
                  key={profile.id}
                  to={`/lawyers/${profile.profileSlug}`}
                  className="group block overflow-hidden rounded-md border border-white/10 bg-panel shadow-gold transition hover:border-gold/60"
                >
                  <div className="border-b border-white/10 bg-black/40 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{formatRegistryStatus(profile.status)}</Badge>
                      <Badge>{registryProfileKindLabel(profile)}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-gold">{profile.shortTitle}</p>
                    <h2 className="mt-2 break-words text-2xl font-semibold group-hover:text-gold">{profile.displayName}</h2>
                  </div>
                  <div className="space-y-3 px-5 py-5">
                    <p className="text-sm text-muted">
                      <span className="font-semibold text-white">{profile.office}</span>
                      <span className="mx-2 text-white/30">-</span>
                      {profile.division}
                    </p>
                    {profile.practiceAreas.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {profile.practiceAreas.map((area) => (
                          <Badge key={area}>{area}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {profile.barNumber ? <p className="text-sm text-muted">Bar ID: {profile.barNumber}</p> : null}
                    <p className="line-clamp-3 text-sm leading-6 text-muted">{profile.biographyMarkdown.split("\n\n")[0]}</p>
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-gold">
                      View profile <ArrowRight className="h-4 w-4" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {profiles.length === 0 ? (
              <Card>
                <h2 className="text-xl font-semibold">No public registry profiles are published yet.</h2>
                <p className="mt-2 text-sm text-muted">Approved attorney and judicial listings will appear here once published by DOJ staff.</p>
              </Card>
            ) : null}

            <Card className="overflow-hidden p-0">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
                <div className="px-5 py-6 sm:px-7">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">Need legal representation?</p>
                  <h2 className="mt-3 text-2xl font-semibold">Submit a lawyer request through the DOJ service system.</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                    Residents seeking counsel may submit a lawyer request for review and assignment through the public
                    service intake. Registry listings identify authorized practitioners and judicial officers; counsel
                    requests are routed separately through DOJ intake.
                  </p>
                  <div className="mt-6">
                    <ButtonLink href="/services/lawyer">Request Counsel</ButtonLink>
                  </div>
                </div>
                <div className="relative min-h-[220px] border-t border-white/10 lg:min-h-full lg:border-l lg:border-t-0">
                  <img src="/building-background.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20 lg:bg-gradient-to-l" />
                  <div className="relative flex h-full items-end p-5 sm:p-7">
                    <p className="max-w-sm text-sm leading-7 text-zinc-200">
                      Integrity. Due Process. Public Trust. The registry supports public access to verified legal
                      practitioners while preserving separate intake for counsel requests.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Content>
    </>
  );
}

function LawyerProfileDetail() {
  const { profileSlug } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLawyerProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileSlug) return;
    setLoading(true);
    setError(null);
    fetchLawyerProfile(profileSlug)
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Registry profile load failed."))
      .finally(() => setLoading(false));
  }, [profileSlug]);

  const profile = data?.data;

  if (!profileSlug) return <Navigate to="/lawyers" replace />;

  return (
    <>
      <PageHeader
        eyebrow={profile?.division ?? "Judicial Directory"}
        title={profile?.displayName ?? "Registry profile"}
        description={profile ? `${profile.title} - ${profile.office}` : "Public registry profile details."}
      />
      <Content>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : profile ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/lawyers" className="text-sm font-semibold text-gold hover:text-white">
                Back to registry
              </Link>
              {data?.source === "seed" ? <Badge>Seed fallback</Badge> : <Badge>D1 public records</Badge>}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <div className="flex flex-wrap gap-2">
                  <Badge>{formatRegistryStatus(profile.status)}</Badge>
                  <Badge>{registryProfileKindLabel(profile)}</Badge>
                  <Badge>{profile.shortTitle}</Badge>
                </div>
                <h2 className="mt-5 break-words text-3xl font-semibold">{profile.displayName}</h2>
                <p className="mt-2 text-lg text-gold">{profile.title}</p>
                <div className="mt-6 space-y-4 text-sm leading-7 text-muted">
                  <Markdown content={profile.biographyMarkdown} />
                </div>
                {profile.motto ? (
                  <div className="mt-8 rounded-md border border-gold/20 bg-gold/5 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Judicial motto</p>
                    <p className="mt-3 whitespace-pre-line text-base leading-8 text-zinc-100">{profile.motto}</p>
                  </div>
                ) : null}
                {profile.quote ? (
                  <blockquote className="mt-6 border-l-4 border-gold/60 pl-5 text-lg italic leading-8 text-zinc-100">
                    "{profile.quote.replace(/^["]|["]$/g, "")}"
                  </blockquote>
                ) : null}
              </Card>

              <div className="space-y-4">
                <Card>
                  <h3 className="text-lg font-semibold">Office record</h3>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                      <dt className="text-muted">Office</dt>
                      <dd className="mt-1 font-medium text-white">{profile.office}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Division</dt>
                      <dd className="mt-1 font-medium text-white">{profile.division}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Status</dt>
                      <dd className="mt-1 font-medium text-white">{formatRegistryStatus(profile.status)}</dd>
                    </div>
                    {profile.barNumber ? (
                      <div>
                        <dt className="text-muted">Bar ID</dt>
                        <dd className="mt-1 font-medium text-white">{profile.barNumber}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {profile.practiceAreas.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {profile.practiceAreas.map((area) => (
                        <Badge key={area}>{area}</Badge>
                      ))}
                    </div>
                  ) : null}
                </Card>

                {profile.responsibilities.length > 0 ? (
                  <Card>
                    <h3 className="text-lg font-semibold">Areas of responsibility</h3>
                    <div className="mt-4 grid gap-3">
                      {profile.responsibilities.map((item) => (
                        <div key={item.title} className="rounded-md border border-white/10 bg-black/30 p-4">
                          <h4 className="font-semibold text-white">{item.title}</h4>
                          <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>
            </div>

            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">Need legal representation?</p>
              <h3 className="mt-3 text-xl font-semibold">Submit a lawyer request through the DOJ service system.</h3>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                This registry profile identifies an authorized judicial officer or licensed practitioner. To request
                counsel, use the public lawyer service intake so DOJ staff may review and route your request.
              </p>
              <div className="mt-5">
                <ButtonLink href="/services/lawyer">Request Counsel</ButtonLink>
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <h2 className="text-xl font-semibold">Registry profile not found.</h2>
            <p className="mt-2 text-sm text-muted">The requested profile is unavailable or has not been published.</p>
            <div className="mt-5">
              <ButtonLink href="/lawyers">Return to registry</ButtonLink>
            </div>
          </Card>
        )}
      </Content>
    </>
  );
}

function Services() {
  return (
    <>
      <PageHeader eyebrow="Services" title="Public request intake" description="Request court services, legal review, representation, warrants, subpoenas, licensing support, or administrative review through the Miami Stories DOJ portal." />
      <Content>
        <div className="space-y-10">
          {serviceGroups.map((group) => (
            <section key={group}>
              <h2 className="mb-4 text-2xl font-semibold">{group}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {serviceCards.filter((service) => service.group === group).map((service) => (
                  <Link key={service.href} to={service.href} className="rounded-md border border-white/10 bg-panel p-5 hover:border-gold/60">
                    <service.icon className="h-7 w-7 text-gold" />
                    <h3 className="mt-4 text-xl font-semibold">{service.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{service.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Content>
    </>
  );
}

function ServiceForm() {
  const { serviceId } = useParams();
  const config = serviceId ? requestForms[serviceId as keyof typeof requestForms] : undefined;
  const [submitted, setSubmitted] = useState<null | { id: string; requestNumber: string; discordTicketStatus: string; createdAt: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  if (!config) return <Navigate to="/services" replace />;
  const formConfig = config;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current || submitted) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);
const formData = new FormData(form);
const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;

for (const field of formConfig.fields) {
  if (field.kind === "checkbox") {
    const input = form.elements.namedItem(field.name) as HTMLInputElement | null;
    payload[field.name] = Boolean(input?.checked);
  }
}
try {
  const result = await createServiceRequest({
    requestType: formConfig.type,
    payload,
    requesterContact: String(payload.preferredContactMethod ?? payload.contactInfo ?? ""),
    documentUrl: String(payload.documentUrl ?? "")
  });
  setSubmitted({
    id: result.data.id,
    requestNumber: result.data.requestNumber,
    discordTicketStatus: result.data.discordTicketStatus,
    createdAt: result.data.createdAt
  });
  form.reset();
} catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed.");
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={config.type} title={config.title} description={`Request numbers use ${config.prefix}-YYYY-0001 format. Full submitted details go only to a private DOJ ticket-style channel.`} />
      <Content>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <Card>
            <config.icon className="h-7 w-7 text-gold" />
            <h2 className="mt-4 text-xl font-semibold">Before submitting</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{config.who}</p>
            {config.templateUrl ? <ExternalAnchor href={config.templateUrl}>Open official template</ExternalAnchor> : null}
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
              {config.prepare.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="mt-5 rounded-md border border-gold/30 bg-gold/10 p-4 text-sm text-gold">
              Sensitive details are never posted to public request-service channels. If Discord ticket creation fails, the request remains stored for staff retry.
            </div>
            {config.guidance.map((item) => <p key={item} className="mt-3 text-sm leading-6 text-muted">{item}</p>)}
          </Card>
          <Card>
            {submitted ? (
              <div>
                <Badge>Request received</Badge>
                <h2 className="mt-4 text-2xl font-semibold">{submitted.requestNumber}</h2>
                <p className="mt-2 text-muted">Submitted {new Date(submitted.createdAt).toLocaleString()}</p>
                <p className="mt-2 text-muted">Private ticket channel status: {submitted.discordTicketStatus}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink href={`/requests/${submitted.id}`}>View Request</ButtonLink>
                  <ButtonLink href="/requests/mine" variant="ghost">My Requests</ButtonLink>
                </div>
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={submit}>
                {config.fields.map((field) => (
                  <label key={field.name} className="grid gap-2 text-sm font-medium text-zinc-200">
                    {field.kind === "checkbox" ? (
                    <span className="flex gap-3 rounded-md border border-white/10 bg-black p-3">
                <input
                name={field.name}
                type="checkbox"
                value="true"
                required={field.required}
               className="mt-1"
    />
    {field.label}
  </span>
) : (
                      <>
                        {field.label}
                        {field.kind === "textarea" ? (
                          <textarea name={field.name} required={field.required} rows={4} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold" />
                        ) : field.kind === "select" ? (
                          <select name={field.name} required={field.required} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold">
                            <option value="">Select</option>
                            {field.options?.map((option) => <option key={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input name={field.name} required={field.required} type={field.kind === "url" ? "url" : "text"} className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold" />
                        )}
                      </>
                    )}
                  </label>
                ))}
                {error ? <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
                <button disabled={submitting} className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60" type="submit">
                  {submitting ? "Submitting..." : "Submit Private Request"} <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </Card>
        </div>
      </Content>
    </>
  );
}

function MyRequests({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { data, loading: listLoading, error } = useAsync(fetchMyRequests);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <PageHeader eyebrow="My Requests" title="Your DOJ service requests" description="Private service requests submitted through the DOJ Portal." />
      <Content>{listLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
        <div className="space-y-3">
          {data?.data.map((request) => <RequestRow key={request.id} request={request} href={`/requests/${request.id}`} />)}
          {data?.data.length === 0 ? <Card>No service requests yet.</Card> : null}
        </div>
      )}</Content>
    </>
  );
}

function RequestDetail({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { requestId } = useParams();
  const { data, loading: detailLoading, error } = useAsync(() => fetchRequest(requestId ?? ""));
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <PageHeader eyebrow="Request Detail" title={data?.data.requestNumber ?? "Service request"} description="Only the submitter or authorized DOJ staff can view this private request." />
      <Content>{detailLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : data ? <RequestDetailCard detail={data.data} /> : null}</Content>
    </>
  );
}

function DocketDashboard({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const queryParams = new URLSearchParams(window.location.search);
  const requestParam = queryParams.get("request") || queryParams.get("linkedRequest") || queryParams.get("requestId");
  if (requestParam) {
    return <Navigate to={`/dashboard/docket/new?request=${requestParam}`} replace />;
  }

  const { data, loading: listLoading, error } = useAsync(() => fetchAdminDocket());
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canManageDocket(me)) return <Navigate to="/unauthorized" replace />;
  const entries = data?.data ?? [];
  const scheduled = entries.filter((entry) => entry.status === "SCHEDULED" || entry.scheduledFor);
  const drafts = entries.filter((entry) => entry.status === "DRAFT" || !entry.isPublic);
  const published = entries.filter((entry) => entry.isPublic);
  const archived = entries.filter((entry) => entry.isArchived || entry.status === "ARCHIVED" || entry.status === "CLOSED");
  return (
    <>
      <PageHeader eyebrow="Judicial Dashboard" title="Docket management" description="Judge-facing tools for structured docket creation, publication, Discord posting, and event history." />
      <Content>
        <div className="mb-5 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/docket/new">Quick Create</ButtonLink>
          <ButtonLink href="/dashboard/requests" variant="ghost">Linked Requests</ButtonLink>
        </div>
        {listLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <DocketMetric label="Drafts" value={drafts.length} />
              <DocketMetric label="Scheduled" value={scheduled.length} />
              <DocketMetric label="Published" value={published.length} />
              <DocketMetric label="Archived/Closed" value={archived.length} />
            </div>
            <Card>
              <h2 className="text-xl font-semibold">Recent docket entries</h2>
              <div className="mt-4 space-y-3">
                {entries.map((entry) => <DocketRow key={entry.id} entry={entry} href={`/dashboard/docket/${entry.id}`} />)}
                {entries.length === 0 ? <p className="text-sm text-muted">No docket entries yet.</p> : null}
              </div>
            </Card>
          </div>
        )}
      </Content>
    </>
  );
}

function JudicialTools({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [records, setRecords] = useState<JudicialRecord[]>([]);
  const [recordTypes, setRecordTypes] = useState(JUDICIAL_RECORD_TYPES);
  const [categories, setCategories] = useState(JUDICIAL_CATEGORIES);
  const [orderForm, setOrderForm] = useState(judicialFormDefaults("Court Order"));
  const [precedentForm, setPrecedentForm] = useState(judicialFormDefaults("Precedent / Binding Authority"));
  const [historyQuery, setHistoryQuery] = useState("");
  const [history, setHistory] = useState<JudicialHistorySearchResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JudicialRecord | null>(null);

  const canEdit = me?.authenticated ? canManageDocket(me) : false;

  async function loadRecords() {
    const result = canEdit ? await fetchAdminJudicialRecords() : await fetchJudicialRecords();
    setRecords(result.data);
    if ("recordTypes" in result && Array.isArray(result.recordTypes)) setRecordTypes(result.recordTypes);
    if ("categories" in result && Array.isArray(result.categories)) setCategories(result.categories);
  }

  useEffect(() => {
    if (!loading && me?.authenticated && canViewJudicialTools(me)) {
      void loadRecords().catch((cause) => setError(cause instanceof Error ? cause.message : "Judicial records failed to load."));
    }
  }, [loading, me?.authenticated]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canViewJudicialTools(me)) return <Navigate to="/unauthorized" replace />;

  const published = records.filter((record) => record.status === "PUBLISHED" && !record.deletedAt);
  const drafts = records.filter((record) => record.status === "DRAFT" && !record.deletedAt);
  const archived = records.filter((record) => record.status === "ARCHIVED" && !record.deletedAt);

  async function saveRecord(kind: "order" | "precedent", publish = false) {
    const form = kind === "order" ? orderForm : precedentForm;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createJudicialRecord(toJudicialRecordInput(form));
      if (publish) {
        const publishedRecord = await publishJudicialRecord(created.data.id);
        setNotice(`Published ${publishedRecord.data.recordNumber}. Discord status: ${publishedRecord.discordStatus}.`);
      } else {
        setNotice(`Saved ${created.data.recordNumber} as a draft.`);
      }
      if (kind === "order") setOrderForm(judicialFormDefaults(form.category));
      else setPrecedentForm(judicialFormDefaults(form.category));
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Judicial record save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runRecordAction(action: () => Promise<{ data: JudicialRecord } | { data: unknown }>, label: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(label);
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Judicial record action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runHistorySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!historyQuery.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await searchJudicialHistory(historyQuery);
      setHistory(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Judicial history search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(reason: string) {
    if (!deleteTarget) return;
    await deleteJudicialRecord(deleteTarget.id, reason);
    setDeleteTarget(null);
    setNotice(`${deleteTarget.recordNumber} moved to Trash.`);
    await loadRecords();
  }

  return (
    <>
      <PageHeader eyebrow="Judicial Tools" title="Judicial Tools" description="Work in progress tools for court orders, precedent, case law, and DOJ history lookup." />
      <Content>
        <div className="space-y-6">
          <Card className="border-gold/40 bg-gold/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge>Work in Progress</Badge>
                <h2 className="mt-3 text-2xl font-semibold">Court record workspace</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-200">
                  This hub is separate from the active docket dashboard. Use it for drafting court orders, building precedent records,
                  publishing judicial interpretations, and checking DOJ history before a decision is finalized.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                <ButtonLink href="/dashboard/docket" variant="ghost">Open docket tools</ButtonLink>
                <ButtonLink href="/dashboard/docket/new" variant="ghost">Create docket entry</ButtonLink>
                <ButtonLink href="/dashboard/requests" variant="ghost">Linked requests</ButtonLink>
              </div>
            </div>
          </Card>

          {error ? <ErrorState message={error} /> : null}
          {notice ? <Card className="border-gold/40 text-gold">{notice}</Card> : null}

          <div className="grid gap-4 md:grid-cols-3">
            <DocketMetric label="Published records" value={published.length} />
            <DocketMetric label="Draft records" value={drafts.length} />
            <DocketMetric label="Archived records" value={archived.length} />
          </div>

          {canEdit ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <JudicialRecordFormCard
                title="Issue Order / Ruling"
                description="Draft a court order, ruling, standing order, sentencing guidance, or advisory notice from an editable template."
                form={orderForm}
                categories={recordTypes}
                onChange={setOrderForm}
                onTemplate={() => setOrderForm((current) => ({ ...current, bodyMarkdown: judicialOrderTemplate(current, me.user.displayName) }))}
                onSave={() => saveRecord("order", false)}
                onPublish={() => saveRecord("order", true)}
                busy={busy}
              />
              <JudicialRecordFormCard
                title="Precedent / Case Law Builder"
                description="Capture holdings, reasoning, tags, and linked matters for case law summaries or binding authority records."
                form={precedentForm}
                categories={categories}
                onChange={setPrecedentForm}
                onTemplate={() => setPrecedentForm((current) => ({ ...current, bodyMarkdown: precedentTemplate(current, me.user.displayName) }))}
                onSave={() => saveRecord("precedent", false)}
                onPublish={() => saveRecord("precedent", true)}
                busy={busy}
              />
            </div>
          ) : (
            <Card>
              <h2 className="text-xl font-semibold">Published judicial records</h2>
              <p className="mt-2 text-sm text-muted">You can view published records available to licensed legal and judicial roles. Drafting and history search are restricted to judicial staff.</p>
            </Card>
          )}

          {canEdit ? (
            <Card>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Person DOJ History Search</h2>
                  <p className="mt-2 text-sm text-muted">Search dockets, requests, judicial records, and safe Bar Exam attempt metadata. Private answers, keys, rubrics, and reviewer notes are never returned here.</p>
                </div>
                <form onSubmit={runHistorySearch} className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:min-w-[420px]">
                  <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Name, CID, docket, request, or Discord username" className="field" />
                  <button disabled={busy || !historyQuery.trim()} className="w-full rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black disabled:opacity-60 sm:w-auto">Search</button>
                </form>
              </div>
              {history ? <JudicialHistoryResults history={history} /> : null}
            </Card>
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Judicial Records List</h2>
                <p className="mt-1 text-sm text-muted">Court opinions, orders, precedent-setting decisions, city case law, judicial interpretations, appeal decisions, standing orders, sentencing guidance, and advisory notices.</p>
              </div>
              <Badge>{records.length} records</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {records.map((record) => (
                <JudicialRecordRow
                  key={record.id}
                  record={record}
                  canEdit={canEdit}
                  onPublish={() => runRecordAction(() => publishJudicialRecord(record.id), `Published ${record.recordNumber}.`)}
                  onArchive={() => runRecordAction(() => archiveJudicialRecord(record.id), `Archived ${record.recordNumber}.`)}
                  onDelete={() => setDeleteTarget(record)}
                />
              ))}
              {records.length === 0 ? <p className="text-sm text-muted">No judicial records yet.</p> : null}
            </div>
          </Card>
        </div>
      </Content>
      <ReasonModal
        open={Boolean(deleteTarget)}
        title="Delete judicial record"
        confirmLabel="Move to Trash"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function DocketFormPage({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { docketId } = useParams();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(window.location.search);
  const requestParam = queryParams.get("request") || queryParams.get("linkedRequest") || queryParams.get("requestId");
  const [form, setForm] = useState<DocketFormState>(emptyDocketForm());
  const [sourceRequest, setSourceRequest] = useState<Awaited<ReturnType<typeof fetchAdminRequest>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eligibleJudges, setEligibleJudges] = useState<EligibleJudge[]>([]);
  const [judgesLoading, setJudgesLoading] = useState(false);
  const [judgeLoadError, setJudgeLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!docketId) return;
    void fetchAdminDocketDetail(docketId).then((result) => setForm(formFromDocket(result.data))).catch((cause) => setError(cause instanceof Error ? cause.message : "Docket load failed."));
  }, [docketId]);

  useEffect(() => {
    if (!requestParam || docketId) return;
    setNotice(`Creating docket entry from ${requestParam}...`);
    void fetchAdminRequest(requestParam).then((result) => {
      setSourceRequest(result.data);
      setForm((current) => ({ ...current, ...prefillFromRequest(result.data) }));
      setNotice(`Creating docket entry from ${result.data.requestNumber}`);
    }).catch((cause) => {
      console.error(cause);
      setNotice(null);
      setError(`Linked service request not found: ${requestParam}`);
    });
  }, [requestParam, docketId]);

  useEffect(() => {
    if (loading || !me?.authenticated || !canManageDocket(me)) return;
    setJudgesLoading(true);
    setJudgeLoadError(null);
    void fetchEligibleJudges()
      .then((result) => {
        setEligibleJudges(result.data);
        setForm((current) => {
          if (current.judgeUserId) return current;
          const signedInJudge = result.data.find((judge) => judge.discordUserId === me.user.discordId);
          return signedInJudge ? { ...current, judgeUserId: signedInJudge.portalUserId ?? signedInJudge.discordUserId, judgeName: signedInJudge.displayName } : current;
        });
      })
      .catch((cause) => setJudgeLoadError(cause instanceof Error ? cause.message : "Judge list could not be loaded."))
      .finally(() => setJudgesLoading(false));
  }, [loading, me]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canManageDocket(me)) return <Navigate to="/unauthorized" replace />;

  async function save(publish = false) {
    const validationMessage = validateDocketForm(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toDocketInput({ ...form, isPublic: publish ? true : form.isPublic });
      const result = docketId ? await updateDocketEntry(docketId, input) : await createDocketEntry(input);
      navigate(`/dashboard/docket/${result.data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Docket save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(false);
  }

  function selectJudge(judgeDiscordId: string) {
    const judge = eligibleJudges.find((item) => item.discordUserId === judgeDiscordId || item.portalUserId === judgeDiscordId);
    setForm((current) => ({
      ...current,
      judgeUserId: judge ? judge.portalUserId ?? judge.discordUserId : "",
      judgeName: judge?.displayName ?? ""
    }));
  }

  const signedInJudge = me.authenticated ? eligibleJudges.find((judge) => judge.discordUserId === me.user.discordId) ?? null : null;
  const preview = previewDocketText(form);
  return (
    <>
      <PageHeader eyebrow="Docket Creator" title={docketId ? "Edit docket entry" : "Create docket entry"} description="Structured docket drafting with local time conversion, public/private separation, and Discord-safe preview text." />
      <Content>
        <form className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]" onSubmit={(event) => submit(event)}>
          <Card>
            {sourceRequest ? <Badge>Prefilled from {sourceRequest.requestNumber}</Badge> : null}
            {notice ? (
              <div className="mb-4 rounded-md border border-gold/30 bg-gold/10 p-3 text-sm text-gold">
                {notice}
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Docket/case number">
                <input value={form.docketNumber} onChange={(event) => setFormField(setForm, "docketNumber", event.target.value)} placeholder="Auto-generated if blank" className="field" />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setFormField(setForm, "status", event.target.value as DocketStatus)} className="field">
                  {DOCKET_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input required value={form.title} onChange={(event) => setFormField(setForm, "title", event.target.value)} className="field" />
              </Field>
              <Field label="Judge">
                <div className="space-y-2">
                  <select
                    value={form.judgeUserId}
                    onChange={(event) => selectJudge(event.target.value)}
                    disabled={judgesLoading || eligibleJudges.length === 0}
                    className="field min-h-11"
                  >
                    <option value="">{judgesLoading ? "Loading eligible judges..." : "Select eligible judge"}</option>
                    {!judgesLoading && judgeLoadError ? <option value="">Judge list unavailable</option> : null}
                    {!judgesLoading && !judgeLoadError && eligibleJudges.length === 0 ? <option value="">No eligible judges found</option> : null}
                    {eligibleJudges.map((judge) => (
                      <option key={judge.discordUserId} value={judge.discordUserId}>
                        {judge.displayName} ({judge.username})
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    {signedInJudge ? (
                      <button
                        type="button"
                        onClick={() => selectJudge(signedInJudge.portalUserId ?? signedInJudge.discordUserId)}
                        className="rounded-md border border-gold/50 px-3 py-2 text-xs font-semibold text-gold hover:bg-gold/10"
                      >
                        Use myself
                      </button>
                    ) : null}
                    {form.judgeName ? <span className="min-w-0 break-words text-xs text-muted">Selected: {form.judgeName}</span> : <span className="text-xs text-muted">Pending judicial assignment</span>}
                  </div>
                  {judgeLoadError ? <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">{judgeLoadError}</p> : null}
                  {form.judgeName && !form.judgeUserId ? <p className="text-xs text-muted">This docket has a legacy text judge value. Select an eligible Judge-role member before republishing.</p> : null}
                </div>
              </Field>
              <Field label="Case type">
                <select value={form.caseType} onChange={(event) => setFormField(setForm, "caseType", event.target.value as DocketCaseType)} className="field">
                  {DOCKET_CASE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Proceeding">
                <select value={form.proceedingType} onChange={(event) => setFormField(setForm, "proceedingType", event.target.value as DocketProceedingType)} className="field">
                  {DOCKET_PROCEEDING_TYPES.map((type) => <option key={type} value={type}>{formatDocketLabel(type)}</option>)}
                </select>
              </Field>
              <Field label="Plaintiff / petitioner / state actor">
                <input value={form.plaintiff} onChange={(event) => setFormField(setForm, "plaintiff", event.target.value)} className="field" />
              </Field>
              <Field label="Defendant / respondent / target">
                <input value={form.defendant} onChange={(event) => setFormField(setForm, "defendant", event.target.value)} className="field" />
              </Field>
              <Field label="Filed date">
                <input type="date" value={form.filedOn} onChange={(event) => setFormField(setForm, "filedOn", event.target.value)} className="field min-h-11" />
              </Field>
              <Field label="Timezone">
                <input value={form.scheduledTimezone} onChange={(event) => setFormField(setForm, "scheduledTimezone", event.target.value)} className="field" />
              </Field>
              <Field label="Scheduled local date">
                <input type="date" value={form.scheduledLocalDate} onChange={(event) => setFormField(setForm, "scheduledLocalDate", event.target.value)} className="field min-h-11" />
              </Field>
              <Field label="Scheduled local time">
                <input type="time" value={form.scheduledLocalTime} onChange={(event) => setFormField(setForm, "scheduledLocalTime", event.target.value)} className="field min-h-11" />
              </Field>
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="Individuals involved, one per line">
                <textarea value={form.individualsText} onChange={(event) => setFormField(setForm, "individualsText", event.target.value)} rows={5} className="field" />
              </Field>
              <Field label="Summary">
                <textarea value={form.summaryMarkdown} onChange={(event) => setFormField(setForm, "summaryMarkdown", event.target.value)} rows={6} className="field" />
              </Field>
              <Field label="Public notes">
                <textarea value={form.publicNotesMarkdown} onChange={(event) => setFormField(setForm, "publicNotesMarkdown", event.target.value)} rows={4} className="field" />
              </Field>
              <Field label="Private judge/staff notes">
                <textarea value={form.privateNotesMarkdown} onChange={(event) => setFormField(setForm, "privateNotesMarkdown", event.target.value)} rows={4} className="field" />
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Linked service request">
                  <input value={form.linkedServiceRequestId} onChange={(event) => setFormField(setForm, "linkedServiceRequestId", event.target.value)} className="field" />
                </Field>
                <Field label="Private ticket channel ID">
                  <input value={form.linkedPrivateTicketChannelId} onChange={(event) => setFormField(setForm, "linkedPrivateTicketChannelId", event.target.value)} placeholder="Discord channel ID, if linked" className="field" />
                </Field>
                <Field label="Internal petition/document URL">
                  <input value={form.linkedPetitionUrl} onChange={(event) => setFormField(setForm, "linkedPetitionUrl", event.target.value)} className="field" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isPublic} onChange={(event) => setFormField(setForm, "isPublic", event.target.checked)} /> Public docket</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.isArchived} onChange={(event) => setFormField(setForm, "isArchived", event.target.checked)} /> Archived</label>
              </div>
              {error ? <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button disabled={saving} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black" type="submit">Save draft</button>
                <button disabled={saving} onClick={() => void save(true)} className="rounded-md border border-gold/50 px-4 py-3 text-sm font-semibold text-gold" type="button">Publish to public docket</button>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Docket preview</h2>
            <div className="mt-4 rounded-md border border-gold/30 bg-gold/10 p-4 text-sm text-gold">
              Scheduled For: {docketSchedulePreview(form)}
            </div>
            <pre className="mt-4 max-h-[700px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black p-4 text-sm text-zinc-200">{preview}</pre>
          </Card>
        </form>
      </Content>
    </>
  );
}

function DocketAdminDetail({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { docketId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DocketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (docketId) void fetchAdminDocketDetail(docketId).then((result) => setDetail(result.data)).catch((cause) => setError(cause instanceof Error ? cause.message : "Docket load failed."));
  }, [docketId]);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canManageDocket(me)) return <Navigate to="/unauthorized" replace />;

  async function run(action: () => Promise<{ data: DocketDetail }>) {
    setError(null);
    try {
      const result = await action();
      setDetail(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Docket action failed.");
    }
  }

  async function confirmDelete(reason: string) {
    if (!detail) return;
    setError(null);
    await deleteDocketEntry(detail.id, reason);
    navigate("/dashboard/docket");
  }

  return (
    <>
      <PageHeader eyebrow="Docket Detail" title={detail?.docketNumber ?? "Docket entry"} description={detail?.title ?? "Judicial docket management detail."} />
      <Content>{!detail ? <LoadingState /> : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            {detail.deletedAt ? <DeletedRecordBanner deletedAt={detail.deletedAt} deletedBy={detail.deletedByDisplayName} reason={detail.deleteReason} /> : null}
            <div className="flex flex-wrap gap-3">
              <Badge>{detail.status}</Badge>
              <Badge>{detail.isPublic ? "Public" : "Private"}</Badge>
              <Badge>{detail.discordSyncStatus.replaceAll("_", " ")}</Badge>
            </div>
            <h2 className="mt-4 text-3xl font-semibold">{detail.title}</h2>
            <div className="mt-5 grid gap-3 text-sm text-muted md:grid-cols-2">
              <p>Case type: {detail.caseType}</p>
              <p>Proceeding: {detail.proceedingType.replaceAll("_", " ")}</p>
              <p>Judge: {detail.judgeName ?? "Pending assignment"}</p>
              <p>Scheduled: {detail.scheduledFor ? new Date(detail.scheduledFor).toLocaleString() : "Pending"}</p>
              <p>Discord message: {detail.discordMessageId ?? "Not posted"}</p>
              <p>Linked request: {detail.linkedRequestNumber ?? detail.linkedServiceRequestId ?? "None"}</p>
            </div>
            <h3 className="mt-6 text-xl font-semibold">Preview</h3>
            <pre className="mt-3 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black p-4 text-sm text-zinc-200">{detail.previewText}</pre>
            <h3 className="mt-6 text-xl font-semibold">Events</h3>
            <div className="mt-3 space-y-2 text-sm text-muted">
              {detail.events?.map((event) => <p key={event.id}>{new Date(event.createdAt).toLocaleString()} - {event.eventType}: {event.message}</p>)}
            </div>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Docket actions</h2>
            <div className="mt-4 grid gap-3">
              <ButtonLink href={`/dashboard/docket/${detail.id}/edit`} variant="ghost">Edit docket entry</ButtonLink>
              <button onClick={() => run(() => publishDocketEntry(detail.id))} className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black">Publish to public docket</button>
              <button onClick={() => run(() => unpublishDocketEntry(detail.id))} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Unpublish</button>
              <button onClick={() => run(() => postDocketToDiscord(detail.id))} className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black">{detail.discordMessageId ? "Update Discord post" : "Post to Discord"}</button>
              <button onClick={() => run(() => postDocketToDiscord(detail.id, true))} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Repost as new Discord message</button>
              <button onClick={() => run(() => closeDocketEntry(detail.id))} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Close docket</button>
              <button onClick={() => run(() => archiveDocketEntry(detail.id))} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Archive docket</button>
              <button onClick={() => setDeleteOpen(true)} className="rounded-md border border-red-500/40 px-3 py-2 text-left text-red-200 hover:border-red-300">Delete docket entry</button>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </div>
          </Card>
        </div>
      )}</Content>
      <ReasonModal
        open={deleteOpen}
        title="Delete docket entry"
        confirmLabel="Delete docket entry"
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function DocketMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </Card>
  );
}

const JUDICIAL_RECORD_TYPES = [
  "Court Order",
  "Ruling",
  "Standing Order",
  "Judicial Interpretation",
  "Sentencing Guidance",
  "Procedural Order",
  "Advisory Notice"
];

const JUDICIAL_CATEGORIES = [
  "Court Opinion",
  "Standing Order",
  "Judicial Interpretation",
  "Appeal Decision",
  "Sentencing Guidance",
  "Procedural Rule",
  "Case Law Summary",
  "Precedent / Binding Authority",
  "Advisory Notice"
];

interface JudicialFormState {
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown: string;
  reasoningMarkdown: string;
  linkedDocketNumber: string;
  linkedRequestNumber: string;
  subjectName: string;
  subjectCid: string;
  tagsText: string;
  visibility: string;
}

function JudicialRecordFormCard({
  title,
  description,
  form,
  categories,
  onChange,
  onTemplate,
  onSave,
  onPublish,
  busy
}: {
  title: string;
  description: string;
  form: JudicialFormState;
  categories: string[];
  onChange: Dispatch<SetStateAction<JudicialFormState>>;
  onTemplate: () => void;
  onSave: () => void;
  onPublish: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        <button type="button" onClick={onTemplate} className="w-full rounded-md border border-white/10 px-3 py-2 text-sm font-semibold hover:border-gold sm:w-auto">Template</button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Type / category">
          <select value={form.category} onChange={(event) => setJudicialFormField(onChange, "category", event.target.value)} className="field">
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </Field>
        <Field label="Visibility">
          <select value={form.visibility} onChange={(event) => setJudicialFormField(onChange, "visibility", event.target.value)} className="field">
            <option value="LAWYER_VISIBLE">Lawyer / judicial visible</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private draft</option>
          </select>
        </Field>
        <Field label="Title">
          <input value={form.title} onChange={(event) => setJudicialFormField(onChange, "title", event.target.value)} placeholder="State v. Name - ruling on motion" className="field" />
        </Field>
        <Field label="Subject name">
          <input value={form.subjectName} onChange={(event) => setJudicialFormField(onChange, "subjectName", event.target.value)} placeholder="Optional person/entity" className="field" />
        </Field>
        <Field label="Linked docket">
          <input value={form.linkedDocketNumber} onChange={(event) => setJudicialFormField(onChange, "linkedDocketNumber", event.target.value)} placeholder="CRT-2026-0001 or docket ID" className="field" />
        </Field>
        <Field label="Linked request">
          <input value={form.linkedRequestNumber} onChange={(event) => setJudicialFormField(onChange, "linkedRequestNumber", event.target.value)} placeholder="CIV-2026-0001 or request ID" className="field" />
        </Field>
        <Field label="Subject CID">
          <input value={form.subjectCid} onChange={(event) => setJudicialFormField(onChange, "subjectCid", event.target.value)} placeholder="Optional character ID" className="field" />
        </Field>
        <Field label="Tags">
          <input value={form.tagsText} onChange={(event) => setJudicialFormField(onChange, "tagsText", event.target.value)} placeholder="appeal, warrant, sentencing" className="field" />
        </Field>
      </div>
      <div className="mt-4 grid gap-4">
        <Field label="Summary">
          <textarea value={form.summary} onChange={(event) => setJudicialFormField(onChange, "summary", event.target.value)} rows={3} className="field" />
        </Field>
        <Field label="Holding / rule">
          <textarea value={form.holdingMarkdown} onChange={(event) => setJudicialFormField(onChange, "holdingMarkdown", event.target.value)} rows={3} className="field" />
        </Field>
        <Field label="Reasoning">
          <textarea value={form.reasoningMarkdown} onChange={(event) => setJudicialFormField(onChange, "reasoningMarkdown", event.target.value)} rows={4} className="field" />
        </Field>
        <Field label="Record body">
          <textarea value={form.bodyMarkdown} onChange={(event) => setJudicialFormField(onChange, "bodyMarkdown", event.target.value)} rows={9} className="field font-mono text-xs" />
        </Field>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" disabled={busy} onClick={onSave} className="w-full rounded-md border border-white/10 px-4 py-2 text-sm font-semibold hover:border-gold disabled:opacity-60 sm:w-auto">Save draft</button>
        <button type="button" disabled={busy} onClick={onPublish} className="w-full rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black disabled:opacity-60 sm:w-auto">Save and publish</button>
      </div>
    </Card>
  );
}

function JudicialHistoryResults({ history }: { history: JudicialHistorySearchResponse }) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <HistoryGroup title="Dockets" items={history.dockets} labelKey="docketNumber" descriptionKey="title" />
      <HistoryGroup title="Service requests" items={history.requests} labelKey="requestNumber" descriptionKey="requestType" />
      <HistoryGroup title="Judicial records" items={history.judicialRecords} labelKey="recordNumber" descriptionKey="title" />
      <HistoryGroup title="Bar Exam metadata" items={history.barExamAttempts} labelKey="attemptNumber" descriptionKey="status" />
    </div>
  );
}

function HistoryGroup({ title, items, labelKey, descriptionKey }: { title: string; items: unknown[]; labelKey: string; descriptionKey: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 break-words font-semibold">{title}</h3>
        <Badge>{items.length}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return (
            <div key={`${title}-${index}`} className="min-w-0 rounded-md border border-white/10 p-3 text-sm">
              <p className="break-all font-semibold">{String(record[labelKey] ?? "Unknown")}</p>
              <p className="mt-1 break-words text-muted">{String(record[descriptionKey] ?? "No summary")}</p>
            </div>
          );
        })}
        {items.length === 0 ? <p className="text-sm text-muted">No matching records.</p> : null}
      </div>
    </div>
  );
}

function JudicialRecordRow({
  record,
  canEdit,
  onPublish,
  onArchive,
  onDelete
}: {
  record: JudicialRecord;
  canEdit: boolean;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const discordUrl = record.discordChannelId && record.discordMessageId ? `${discordChannelUrl(record.discordChannelId)}/${record.discordMessageId}` : null;
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black p-4">
      {record.deletedAt ? <DeletedRecordBanner deletedAt={record.deletedAt} deletedBy={record.deletedByDisplayName} reason={record.deleteReason} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{record.status}</Badge>
        <Badge>{record.visibility.replaceAll("_", " ")}</Badge>
        <Badge>{record.category}</Badge>
        <span className="break-all text-sm font-semibold text-gold">{record.recordNumber}</span>
      </div>
      <h3 className="mt-3 break-words text-lg font-semibold">{record.title}</h3>
      <p className="mt-2 break-words text-sm leading-6 text-muted">{record.summary || record.bodyMarkdown.slice(0, 220) || "No summary provided."}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="break-words">Issued by: {record.issuedByDisplayName ?? "Unknown"}</span>
        <span className="break-words">Published: {record.publishedAt ? new Date(record.publishedAt).toLocaleString() : "Not published"}</span>
        <span className="break-words">Discord: {record.discordSyncStatus.replaceAll("_", " ")}</span>
        {record.linkedDocketNumber ? <span className="break-all">Docket: {record.linkedDocketNumber}</span> : null}
        {record.linkedRequestNumber ? <span className="break-all">Request: {record.linkedRequestNumber}</span> : null}
      </div>
      {record.holdingMarkdown ? (
        <div className="mt-3 rounded-md border border-white/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Holding / Rule</p>
          <p className="mt-2 break-words text-sm leading-6 text-zinc-200">{record.holdingMarkdown}</p>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={onPublish} className="w-full rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black sm:w-auto">Publish / update Discord</button>
          <button type="button" onClick={onArchive} className="w-full rounded-md border border-white/10 px-3 py-2 text-sm font-semibold hover:border-gold sm:w-auto">Archive</button>
          <button type="button" onClick={onDelete} className="w-full rounded-md border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-300 sm:w-auto">Delete</button>
          {discordUrl ? <ExternalAnchor href={discordUrl}>Discord post</ExternalAnchor> : null}
        </div>
      ) : null}
    </div>
  );
}

function judicialFormDefaults(category: string): JudicialFormState {
  return {
    recordType: category,
    category,
    title: "",
    summary: "",
    bodyMarkdown: "",
    holdingMarkdown: "",
    reasoningMarkdown: "",
    linkedDocketNumber: "",
    linkedRequestNumber: "",
    subjectName: "",
    subjectCid: "",
    tagsText: "",
    visibility: "LAWYER_VISIBLE"
  };
}

function judicialOrderTemplate(form: JudicialFormState, judgeName: string): string {
  return [
    `# ${form.category || "Court Order"}`,
    "",
    `Issued by: ${judgeName}`,
    `Linked docket: ${form.linkedDocketNumber || "Pending"}`,
    `Linked request: ${form.linkedRequestNumber || "None"}`,
    "",
    "## Findings",
    form.summary || "The Court finds the matter appropriate for written order based on the submitted record.",
    "",
    "## Order",
    form.holdingMarkdown || "The requested relief is granted, denied, or modified as stated below.",
    "",
    "## Conditions",
    "- Parties must comply with all applicable DOJ procedure.",
    "- This order may be revisited by the Court if new facts or procedural defects are presented.",
    "",
    "## Notice",
    "This judicial record is issued for Miami Stories community proceedings and does not provide real-world legal advice."
  ].join("\n");
}

function precedentTemplate(form: JudicialFormState, judgeName: string): string {
  return [
    `# ${form.title || "Precedent / Case Law Summary"}`,
    "",
    `Prepared by: ${judgeName}`,
    `Category: ${form.category}`,
    "",
    "## Issue",
    form.summary || "State the legal or procedural question resolved by this record.",
    "",
    "## Holding",
    form.holdingMarkdown || "State the rule, interpretation, or binding authority.",
    "",
    "## Reasoning",
    form.reasoningMarkdown || "Explain the facts, procedural posture, and reasoning supporting the holding.",
    "",
    "## Application",
    "Describe when this record should guide future court or DOJ action."
  ].join("\n");
}

function setJudicialFormField<K extends keyof JudicialFormState>(setForm: Dispatch<SetStateAction<JudicialFormState>>, key: K, value: JudicialFormState[K]) {
  setForm((current) => ({ ...current, [key]: value }));
}

function toJudicialRecordInput(form: JudicialFormState): JudicialRecordInput {
  return {
    recordType: form.recordType || form.category,
    category: form.category,
    title: form.title || `${form.category} - ${form.linkedDocketNumber || form.subjectName || "Untitled"}`,
    summary: form.summary,
    bodyMarkdown: form.bodyMarkdown,
    holdingMarkdown: form.holdingMarkdown || undefined,
    reasoningMarkdown: form.reasoningMarkdown || undefined,
    tagsText: form.tagsText,
    visibility: form.visibility,
    linkedDocketNumber: form.linkedDocketNumber || undefined,
    linkedRequestNumber: form.linkedRequestNumber || undefined,
    subjectName: form.subjectName || undefined,
    subjectCid: form.subjectCid || undefined
  };
}

function DocketRow({ entry, href }: { entry: { id: string; docketNumber: string; title: string; status: string; caseType: string; proceedingType: string; scheduledFor: string | null; isPublic: boolean; discordSyncStatus: string }; href: string }) {
  return (
    <Link to={href} className="block rounded-md border border-white/10 bg-black p-4 hover:border-gold/60">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{entry.status}</Badge>
        <Badge>{entry.isPublic ? "Public" : "Private"}</Badge>
        <Badge>{entry.discordSyncStatus.replaceAll("_", " ")}</Badge>
        <span className="font-semibold">{entry.docketNumber}</span>
        <span className="text-sm text-muted">{entry.caseType}</span>
        {entry.scheduledFor ? <span className="text-sm text-muted">{new Date(entry.scheduledFor).toLocaleString()}</span> : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold">{entry.title}</h3>
      <p className="text-sm text-muted">{entry.proceedingType.replaceAll("_", " ")}</p>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 break-words text-sm font-medium text-zinc-200">
      {label}
      {children}
    </label>
  );
}

interface DocketFormState {
  docketNumber: string;
  title: string;
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status: DocketStatus;
  judgeUserId: string;
  judgeName: string;
  plaintiff: string;
  defendant: string;
  individualsText: string;
  filedOn: string;
  scheduledLocalDate: string;
  scheduledLocalTime: string;
  scheduledTimezone: string;
  summaryMarkdown: string;
  publicNotesMarkdown: string;
  privateNotesMarkdown: string;
  linkedServiceRequestId: string;
  linkedPrivateTicketChannelId: string;
  linkedPetitionUrl: string;
  isPublic: boolean;
  isArchived: boolean;
}

function emptyDocketForm(): DocketFormState {
  return {
    docketNumber: "",
    title: "",
    caseType: "OTHER",
    proceedingType: "OTHER",
    status: "DRAFT",
    judgeUserId: "",
    judgeName: "",
    plaintiff: "",
    defendant: "",
    individualsText: "",
    filedOn: new Date().toISOString().slice(0, 10),
    scheduledLocalDate: "",
    scheduledLocalTime: "",
    scheduledTimezone: "America/New_York",
    summaryMarkdown: "",
    publicNotesMarkdown: "",
    privateNotesMarkdown: "",
    linkedServiceRequestId: "",
    linkedPrivateTicketChannelId: "",
    linkedPetitionUrl: "",
    isPublic: false,
    isArchived: false
  };
}

function formFromDocket(detail: DocketDetail): DocketFormState {
  const scheduled = detail.scheduledFor ? new Date(detail.scheduledFor) : null;
  return {
    docketNumber: detail.docketNumber,
    title: detail.title,
    caseType: detail.caseType,
    proceedingType: detail.proceedingType,
    status: detail.status,
    judgeUserId: detail.judgeUserId ?? "",
    judgeName: detail.judgeName ?? "",
    plaintiff: detail.plaintiff ?? "",
    defendant: detail.defendant ?? "",
    individualsText: detail.individualsInvolved.join("\n"),
    filedOn: detail.filedOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    scheduledLocalDate: scheduled ? scheduled.toISOString().slice(0, 10) : "",
    scheduledLocalTime: scheduled ? scheduled.toISOString().slice(11, 16) : "",
    scheduledTimezone: detail.scheduledTimezone ?? "America/New_York",
    summaryMarkdown: detail.summaryMarkdown,
    publicNotesMarkdown: detail.publicNotesMarkdown ?? "",
    privateNotesMarkdown: detail.privateNotesMarkdown ?? "",
    linkedServiceRequestId: detail.linkedServiceRequestId ?? "",
    linkedPrivateTicketChannelId: detail.linkedPrivateTicketChannelId ?? "",
    linkedPetitionUrl: detail.linkedPetitionUrl ?? "",
    isPublic: detail.isPublic,
    isArchived: detail.isArchived
  };
}

function prefillFromRequest(detail: Awaited<ReturnType<typeof fetchAdminRequest>>["data"]): Partial<DocketFormState> {
  const payload = detail.payload;
  const caseMap: Record<string, { caseType: DocketCaseType; proceedingType: DocketProceedingType }> = {
    CRIMINAL_TRIAL: { caseType: "CRIMINAL", proceedingType: "PRELIMINARY_HEARING" },
    CIVIL_CASE: { caseType: "CIVIL", proceedingType: "CIVIL_CASE_REVIEW" },
    SUBPOENA: { caseType: "SUBPOENA", proceedingType: "SUBPOENA_REVIEW" },
    ARREST_WARRANT: { caseType: "WARRANT", proceedingType: "WARRANT_REVIEW" },
    SEARCH_SEIZURE_WARRANT: { caseType: "WARRANT", proceedingType: "SEARCH_SEIZURE_REVIEW" },
    EXPUNGEMENT: { caseType: "EXPUNGEMENT", proceedingType: "EXPUNGEMENT_HEARING" },
    MARRIAGE: { caseType: "MARRIAGE", proceedingType: "MARRIAGE_CERTIFICATE_REVIEW" },
    DIVORCE: { caseType: "DIVORCE", proceedingType: "DIVORCE_REVIEW" },
    GENERAL: { caseType: "OTHER", proceedingType: "ADMINISTRATIVE_REVIEW" },
    LAWYER: { caseType: "OTHER", proceedingType: "TEMPORARY_DEFENSE_REPRESENTATION" }
  };
  const suggestion = caseMap[detail.requestType] ?? caseMap.GENERAL;

  let title = `${detail.shortTitle} / ${detail.requestNumber}`;
  let plaintiff =
    stringValue(payload, "plaintiffFullName") ||
    stringValue(payload, "submittingParty") ||
    stringValue(payload, "applicantFullName") ||
    stringValue(payload, "petitionerName");
  let defendant = stringValue(payload, "defendantName") || stringValue(payload, "respondentName") || stringValue(payload, "target");
  let individuals = [plaintiff, defendant, detail.requesterDiscordUsername].filter(Boolean);

  if (detail.requestType === "LAWYER") {
    const character = stringValue(payload, "characterFullName");
    const repType = stringValue(payload, "representationType");
    title = repType && character ? `${repType} - ${character}` : title;
    defendant = character;
    plaintiff = "State of Florida / MPD";
    const prefRep = stringValue(payload, "preferredRepresentation");
    individuals = [character, "MPD", prefRep || "Public Defender", detail.requesterDiscordUsername].filter(Boolean);
  }

  const summaryMarkdown = detail.requestType === "LAWYER"
    ? `Generated from lawyer request details for ${stringValue(payload, "characterFullName")}. Urgent: ${stringValue(payload, "urgency")}. Description: ${stringValue(payload, "briefDescription")}`
    : `The Court has received ${detail.requestNumber} for judicial review. Public docket text should be finalized by the assigned judicial officer before publication.`;
  const publicNotesMarkdown = detail.requestType === "LAWYER" ? "Brief docket-safe note" : "";
  const privateNotesMarkdown = `Internal note referencing ${detail.requestNumber}`;

  return {
    ...suggestion,
    title,
    plaintiff,
    defendant,
    individualsText: individuals.join("\n"),
    summaryMarkdown,
    publicNotesMarkdown,
    privateNotesMarkdown,
    linkedServiceRequestId: detail.requestNumber || detail.id,
    linkedPrivateTicketChannelId: detail.discordTicketChannelId ?? "",
    linkedPetitionUrl: detail.documentUrl ?? ""
  };
}

function toDocketInput(form: DocketFormState): CreateDocketInput {
  return {
    docketNumber: form.docketNumber || undefined,
    title: form.title,
    caseType: form.caseType,
    proceedingType: form.proceedingType,
    status: form.status,
    plaintiff: form.plaintiff || undefined,
    defendant: form.defendant || undefined,
    individualsInvolved: form.individualsText.split("\n").map((line) => line.trim()).filter(Boolean),
    judgeUserId: form.judgeUserId || undefined,
    judgeName: form.judgeName || undefined,
    filedOn: form.filedOn || undefined,
    scheduledLocalDate: form.scheduledLocalDate || undefined,
    scheduledLocalTime: form.scheduledLocalTime || undefined,
    scheduledTimezone: form.scheduledTimezone || undefined,
    summaryMarkdown: form.summaryMarkdown || undefined,
    publicNotesMarkdown: form.publicNotesMarkdown || undefined,
    privateNotesMarkdown: form.privateNotesMarkdown || undefined,
    linkedServiceRequestId: form.linkedServiceRequestId || undefined,
    linkedPrivateTicketChannelId: form.linkedPrivateTicketChannelId || undefined,
    linkedPetitionUrl: form.linkedPetitionUrl || undefined,
    isPublic: form.isPublic,
    isArchived: form.isArchived
  };
}

function validateDocketForm(form: DocketFormState): string | null {
  if (!form.judgeUserId) return "Select an eligible judge before saving or publishing this docket entry.";
  if (form.linkedPrivateTicketChannelId && !isDiscordSnowflake(form.linkedPrivateTicketChannelId)) {
    return "Private ticket channel must be a Discord channel ID.";
  }
  return null;
}

function isDiscordSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value.trim());
}

function previewDocketText(form: DocketFormState): string {
  const people = form.individualsText.split("\n").map((line) => line.trim()).filter(Boolean);
  const lines = [`Docket Entry - ${form.title || "Untitled docket entry"}`, "", `Date: ${form.filedOn || new Date().toISOString().slice(0, 10)}`];
  lines.push(`Scheduled For: ${docketSchedulePreview(form)}`);
  lines.push("", "Individuals Involved:");
  const withJudge = form.judgeName ? [form.judgeName, ...people] : people;
  lines.push(...(withJudge.length ? withJudge : ["Pending assignment"]).map((person) => `- ${person}`));
  lines.push("", `Proceeding: ${formatDocketLabel(form.proceedingType)}`, "", "Summary:", form.summaryMarkdown || "Summary restricted until further order of the Court.", "", `Status: ${formatDocketLabel(form.status)}`);
  return lines.join("\n");
}

function docketSchedulePreview(form: DocketFormState): string {
  if (!form.scheduledLocalDate || !form.scheduledLocalTime) return "Pending scheduling";
  const [year, month, day] = form.scheduledLocalDate.split("-").map(Number);
  const [hour, minute] = form.scheduledLocalTime.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return "Pending scheduling";
  const date = new Date(year, month - 1, day, hour, minute);
  const timezone = form.scheduledTimezone.trim() || "America/New_York";
  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
  return `${formatted} ${timezone}`;
}

function formatDocketLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function setFormField<K extends keyof DocketFormState>(setForm: Dispatch<SetStateAction<DocketFormState>>, key: K, value: DocketFormState[K]) {
  setForm((current) => ({ ...current, [key]: value }));
}

function canManageDocket(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (me.actionPermissions.includes("CREATE_DOCKET") || me.actionPermissions.includes("PUBLISH_DOCKET") || me.actionPermissions.includes("ADMIN"));
}

function canViewJudicialTools(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (
    me.actionPermissions.includes("CREATE_DOCKET") ||
    me.actionPermissions.includes("PUBLISH_DOCKET") ||
    me.actionPermissions.includes("ADMIN") ||
    me.permissions.includes("BAR_ACTIVE") ||
    me.permissions.includes("BAR_ASSOCIATION_MEMBER") ||
    me.permissions.includes("DEFENSE_ATTORNEY") ||
    me.permissions.includes("PUBLIC_DEFENDER_CERTIFIED") ||
    me.permissions.includes("JUDGE") ||
    me.permissions.includes("JUSTICE") ||
    me.permissions.includes("CHIEF_JUSTICE") ||
    me.permissions.includes("ADMIN")
  );
}

function canReviewBarExam(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (me.actionPermissions.includes("REVIEW_BAR_EXAMS") || me.actionPermissions.includes("ADMIN"));
}

function canUseDeletionLog(me: CurrentUserResponse | null): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me?.authenticated === true && (me.permissions.includes("CHIEF_JUSTICE") || me.permissions.includes("JUSTICE"));
}

function canViewTranscripts(me: CurrentUserResponse | null): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me?.authenticated === true && (
    me.actionPermissions.includes("MANAGE_REQUESTS") ||
    me.actionPermissions.includes("CREATE_DOCKET") ||
    me.actionPermissions.includes("PUBLISH_DOCKET") ||
    me.actionPermissions.includes("REVIEW_BAR_EXAMS") ||
    me.actionPermissions.includes("ADMIN")
  );
}

function timeRemaining(deadlineAt: string): string {
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return "Deadline has passed";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

function stringValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function ResourceManager({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [items, setItems] = useState<Array<Awaited<ReturnType<typeof fetchAdminResources>>["data"][number]>>([]);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof fetchAdminResources>>["data"][number] | null>(null);
  const [form, setForm] = useState(resourceFormDefaults());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    const result = await fetchAdminResources(params.toString() ? `?${params}` : "");
    setItems(result.data);
  }

  useEffect(() => {
    if (!loading && me?.authenticated && canManageResources(me)) void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Resource load failed."));
  }, [loading, me, query, status, category]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canManageResources(me)) return <Navigate to="/unauthorized" replace />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) };
      const result = selected ? await updateAdminResource(selected.id, payload) : await createAdminResource(payload);
      setSelected(result.data);
      setForm(resourceFormFrom(result.data));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<{ data: Awaited<ReturnType<typeof fetchAdminResources>>["data"][number] }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setSelected(result.data);
      setForm(resourceFormFrom(result.data));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(reason: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminResource(selected.id, reason);
      setSelected(null);
      setForm(resourceFormDefaults());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource delete failed.");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Content Management" title="Resource management" description="Create, publish, hide, and maintain D1-backed public DOJ resources." />
      <Content>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <Card>
              <div className="grid gap-3 md:grid-cols-3">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" className="field md:col-span-3" />
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="field">
                  <option value="">All categories</option>
                  {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                </select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="field">
                  <option value="">All status</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                </select>
                <button type="button" onClick={() => { setSelected(null); setForm(resourceFormDefaults()); }} className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black">New resource</button>
              </div>
            </Card>
            <div className="space-y-3">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => { setSelected(item); setForm(resourceFormFrom(item)); }} className="block w-full rounded-md border border-white/10 bg-black p-4 text-left hover:border-gold/60">
                  <div className="flex flex-wrap gap-2"><Badge>{item.status}</Badge><Badge>{item.category.replaceAll("_", " ")}</Badge></div>
                  <h2 className="mt-3 font-semibold">{item.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{item.description}</p>
                </button>
              ))}
              {items.length === 0 ? <Card>No resources match the current filters.</Card> : null}
            </div>
          </div>
          <Card>
            <h2 className="text-xl font-semibold">{selected ? "Edit resource" : "Create resource"}</h2>
            <form className="mt-4 grid gap-4" onSubmit={save}>
              <Field label="Title"><input required className="field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Category">
                  <select className="field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as (typeof RESOURCE_CATEGORIES)[number] })}>
                    {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                  </select>
                </Field>
                <Field label="Version"><input required className="field" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></Field>
                <Field label="Sort order"><input type="number" className="field" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
              </div>
              <Field label="URL"><input required type="url" className="field" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></Field>
              <Field label="Description"><textarea required rows={5} className="field" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} /> Published on public resources page</label>
              {error ? <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">{busy ? "Saving..." : "Save resource"}</button>
                {selected ? <button type="button" disabled={busy} onClick={() => run(() => selected.isPublic ? unpublishAdminResource(selected.id) : publishAdminResource(selected.id))} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">{selected.isPublic ? "Unpublish" : "Publish"}</button> : null}
                {selected ? <button type="button" disabled={busy} onClick={() => run(() => archiveAdminResource(selected.id))} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">Archive/hide</button> : null}
                {selected ? <button type="button" disabled={busy} onClick={() => setDeleteOpen(true)} className="rounded-md border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-200">Delete resource</button> : null}
                {selected?.url ? <ExternalAnchor href={selected.url}>Preview public link</ExternalAnchor> : null}
              </div>
            </form>
          </Card>
        </div>
      </Content>
      <ReasonModal
        open={deleteOpen}
        title="Delete resource"
        confirmLabel="Delete resource"
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function FaqManager({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [items, setItems] = useState<Array<Awaited<ReturnType<typeof fetchAdminFaq>>["data"][number]>>([]);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof fetchAdminFaq>>["data"][number] | null>(null);
  const [form, setForm] = useState(faqFormDefaults());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    const result = await fetchAdminFaq(params.toString() ? `?${params}` : "");
    setItems(result.data);
  }

  useEffect(() => {
    if (!loading && me?.authenticated && canManageFaq(me)) void load().catch((cause) => setError(cause instanceof Error ? cause.message : "FAQ load failed."));
  }, [loading, me, query, status, category]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canManageFaq(me)) return <Navigate to="/unauthorized" replace />;
  const categories = Array.from(new Set(items.map((item) => item.category))).sort();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) };
      const result = selected ? await updateAdminFaq(selected.id, payload) : await createAdminFaq(payload);
      setSelected(result.data);
      setForm(faqFormFrom(result.data));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "FAQ save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<{ data: Awaited<ReturnType<typeof fetchAdminFaq>>["data"][number] }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setSelected(result.data);
      setForm(faqFormFrom(result.data));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "FAQ action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(reason: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminFaq(selected.id, reason);
      setSelected(null);
      setForm(faqFormDefaults());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "FAQ delete failed.");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Content Management" title="FAQ management" description="Maintain public FAQ entries while preserving the searchable public FAQ experience." />
      <Content>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <Card>
              <div className="grid gap-3 md:grid-cols-3">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search question, answer, or category" className="field md:col-span-3" />
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="field">
                  <option value="">All categories</option>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="field">
                  <option value="">All status</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                </select>
                <button type="button" onClick={() => { setSelected(null); setForm(faqFormDefaults()); }} className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black">New FAQ</button>
              </div>
              <button type="button" onClick={async () => { const result = await importAdminFaq(); setImportMessage(`${result.message} Command: ${result.command}`); }} className="mt-3 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white">Show FAQ import command</button>
              {importMessage ? <p className="mt-3 text-sm text-muted">{importMessage}</p> : null}
            </Card>
            <div className="space-y-3">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => { setSelected(item); setForm(faqFormFrom(item)); }} className="block w-full rounded-md border border-white/10 bg-black p-4 text-left hover:border-gold/60">
                  <div className="flex flex-wrap gap-2"><Badge>{item.status}</Badge><Badge>{item.category}</Badge></div>
                  <h2 className="mt-3 font-semibold">{item.question}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{item.answerMarkdown}</p>
                </button>
              ))}
              {items.length === 0 ? <Card>No FAQ entries match the current filters.</Card> : null}
            </div>
          </div>
          <Card>
            <h2 className="text-xl font-semibold">{selected ? "Edit FAQ" : "Create FAQ"}</h2>
            <form className="mt-4 grid gap-4" onSubmit={save}>
              <div className="grid gap-4 md:grid-cols-[1fr_140px]">
                <Field label="Category"><input required className="field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
                <Field label="Sort order"><input type="number" className="field" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
              </div>
              <Field label="Question"><input required className="field" value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} /></Field>
              <Field label="Answer"><textarea required rows={10} className="field" value={form.answerMarkdown} onChange={(event) => setForm({ ...form, answerMarkdown: event.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} /> Published on public FAQ page</label>
              {error ? <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">{busy ? "Saving..." : "Save FAQ"}</button>
                {selected ? <button type="button" disabled={busy} onClick={() => run(() => selected.isPublic ? unpublishAdminFaq(selected.id) : publishAdminFaq(selected.id))} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">{selected.isPublic ? "Unpublish" : "Publish"}</button> : null}
                {selected ? <button type="button" disabled={busy} onClick={() => run(() => archiveAdminFaq(selected.id))} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">Archive/hide</button> : null}
                {selected ? <button type="button" disabled={busy} onClick={() => setDeleteOpen(true)} className="rounded-md border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-200">Delete FAQ</button> : null}
                <ButtonLink href="/faq" variant="ghost">Preview FAQ page</ButtonLink>
              </div>
            </form>
          </Card>
        </div>
      </Content>
      <ReasonModal
        open={deleteOpen}
        title="Delete FAQ entry"
        confirmLabel="Delete FAQ"
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function BarAssociationDashboard({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { data, loading: summaryLoading, error } = useAsync(fetchAdminBarSummary);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canUseBarWorkspace(me)) return <Navigate to="/unauthorized" replace />;
  const attempts = data?.data.attempts;
  const activeVersion = data?.data.activeVersion;
  const importedActive = Boolean(activeVersion?.isImported);
  return (
    <>
      <PageHeader eyebrow="Bar Association" title="Bar Association workspace" description="Operational status for attorney licensing, Bar Exam review, and registry maintenance." />
      <Content>
        {summaryLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : data ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <DocketMetric label="Submitted" value={Number(attempts?.submitted ?? 0)} />
              <DocketMetric label="Pending review" value={Number(attempts?.pendingReview ?? 0)} />
              <DocketMetric label="Passed" value={Number(attempts?.passed ?? 0)} />
              <DocketMetric label="Referred/Failed" value={Number(attempts?.referred ?? 0) + Number(attempts?.failed ?? 0)} />
            </div>
            <Card>
              <div className="flex flex-wrap gap-2">
                <Badge>{activeVersion ? "Active exam available" : "No active exam"}</Badge>
                {importedActive ? <Badge>Server-scored version</Badge> : null}
              </div>
              <h2 className="mt-4 text-2xl font-semibold">{activeVersion?.title ?? "No active Bar Exam version"}</h2>
              <p className="mt-2 text-sm text-muted">
                {activeVersion ? `${activeVersion.versionLabel} contains ${activeVersion.questionCount ?? 0} candidate-safe questions.` : "Candidates cannot begin until a reviewer/admin publishes an exam version."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href="/dashboard/bar-exam">Review attempts</ButtonLink>
                <ButtonLink href="/dashboard/bar-exam/versions" variant="ghost">Manage versions</ButtonLink>
                <ButtonLink href="/lawyers" variant="ghost">View public registry</ButtonLink>
              </div>
            </Card>
            {importedActive ? (
              <Card className="border-gold/40 bg-gold/10">
                <ShieldCheck className="h-6 w-6 text-gold" />
                <h2 className="mt-3 text-xl font-semibold text-gold">Imported private exam versions are active</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-200">Candidate payloads remain answer-key safe; scoring material stays server-side for Bar Association reviewers.</p>
              </Card>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h2 className="text-xl font-semibold">Attorney registry</h2>
                <p className="mt-3 text-sm text-muted">{Number(data.data.attorneys?.publicCount ?? 0)} public profiles, {Number(data.data.attorneys?.activeCount ?? 0)} active public attorneys.</p>
                <p className="mt-3 text-sm text-muted">Registry administration is handled through protected DOJ management workflows.</p>
              </Card>
              <Card className="border-gold/40 bg-gold/10">
                <AlertTriangle className="h-6 w-6 text-gold" />
                <h2 className="mt-3 text-xl font-semibold text-gold">Security reminder</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-200">Candidate APIs must only return prompts, choices, resources, and candidate-owned draft answers. Answer keys, rubrics, and reviewer notes stay behind reviewer/admin routes.</p>
              </Card>
            </div>
          </div>
        ) : null}
      </Content>
    </>
  );
}

function resourceFormDefaults() {
  return { title: "", category: "LEGAL_AUTHORITY" as (typeof RESOURCE_CATEGORIES)[number], version: "v1.0", url: "", description: "", sortOrder: 0, isPublic: true };
}

function resourceFormFrom(item: Awaited<ReturnType<typeof fetchAdminResources>>["data"][number]) {
  return { title: item.title, category: item.category, version: item.version, url: item.url, description: item.description, sortOrder: item.sortOrder, isPublic: item.isPublic };
}

function faqFormDefaults() {
  return { category: "", question: "", answerMarkdown: "", sortOrder: 0, isPublic: true };
}

function faqFormFrom(item: Awaited<ReturnType<typeof fetchAdminFaq>>["data"][number]) {
  return { category: item.category, question: item.question, answerMarkdown: item.answerMarkdown, sortOrder: item.sortOrder, isPublic: item.isPublic };
}

function canManageResources(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (me.actionPermissions.includes("MANAGE_RESOURCES") || me.actionPermissions.includes("ADMIN"));
}

function canManageFaq(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (me.actionPermissions.includes("MANAGE_FAQ") || me.actionPermissions.includes("ADMIN"));
}

function canUseBarWorkspace(me: CurrentUserResponse): me is Extract<CurrentUserResponse, { authenticated: true }> {
  return me.authenticated && (me.actionPermissions.includes("REVIEW_BAR_EXAMS") || me.actionPermissions.includes("MANAGE_ATTORNEY_REGISTRY") || me.actionPermissions.includes("ADMIN"));
}

function isChannelPostRequestType(requestType: string): boolean {
  return requestType === "LAWYER" || requestType === "GENERAL";
}

function DiscordDiagnosticsPage({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { data, loading: diagnosticsLoading, error } = useAsync(fetchDiscordDiagnostics);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!me.actionPermissions.includes("ADMIN")) return <Navigate to="/unauthorized" replace />;
  return (
    <>
      <PageHeader eyebrow="Discord Diagnostics" title="Private ticket diagnostics" description="Admin-only checks for Discord bot configuration, mapped channels, ticket categories, and bot permissions." />
      <Content>
        {diagnosticsLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : data ? (
          <div className="space-y-6">
            <Card className={data.data.ok ? "border-gold/40" : "border-red-500/40"}>
              <Badge>{data.data.ok ? "Diagnostics passing" : "Action needed"}</Badge>
              <p className="mt-3 text-sm text-muted">Guild ID: {data.data.guildId ?? "Not configured"}</p>
              <p className="mt-3 text-sm leading-6 text-muted">
                Required bot permissions: View Channels, Manage Channels, Manage Permissions, Send Messages, Embed Links, and Read Message History.
                The bot role must be high enough to apply permission overwrites in configured ticket categories.
              </p>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h2 className="text-xl font-semibold">Configuration checks</h2>
                <div className="mt-4 space-y-3">
                  {data.data.checks.map((check, index) => <DiagnosticRow key={index} item={check} />)}
                </div>
              </Card>
              <Card>
                <h2 className="text-xl font-semibold">Bot permissions</h2>
                <div className="mt-4 grid gap-2 text-sm">
                  {data.data.permissions ? Object.entries(data.data.permissions).map(([key, value]) => (
                    <p key={key} className={value ? "text-zinc-200" : "text-red-200"}>{key}: {String(value)}</p>
                  )) : <p className="text-muted">Permission details unavailable. Check bot token, guild access, and role list access.</p>}
                </div>
              </Card>
            </div>
            <Card>
              <h2 className="text-xl font-semibold">Configured channels and categories</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {data.data.channels.map((channel, index) => <DiagnosticRow key={index} item={channel} />)}
              </div>
            </Card>
            <Card>
              <h2 className="text-xl font-semibold">Private ticket overwrites</h2>
              <p className="mt-2 text-sm text-muted">Category-backed request types are checked against guild roles before a retry attempts channel creation.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(data.data.privateTicketOverwrites ?? []).map((item, index) => <DiagnosticRow key={index} item={item} />)}
              </div>
            </Card>
          </div>
        ) : null}
      </Content>
    </>
  );
}

function DiagnosticRow({ item }: { item: Record<string, unknown> }) {
  const ok = item.ok !== false;
  return (
    <div className={`rounded-md border p-3 text-sm ${ok ? "border-white/10 bg-black" : "border-red-500/40 bg-red-500/10 text-red-100"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{ok ? "OK" : "Check"}</Badge>
        <span className="font-semibold">{String(item.name ?? item.mappingKey ?? "Diagnostic")}</span>
      </div>
      <div className="mt-2 space-y-1 text-muted">
        {Object.entries(item).filter(([key]) => !["ok", "name", "mappingKey", "error"].includes(key)).map(([key, value]) => (
          <p key={key}>{key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}</p>
        ))}
        {item.error ? <p>error: {JSON.stringify(item.error)}</p> : null}
      </div>
    </div>
  );
}

function StaffRequests({ me, loading: authLoading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [requests, setRequests] = useState<Array<Awaited<ReturnType<typeof fetchAdminRequests>>["data"][number]>>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  async function loadRequests() {
    setListLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      const result = await fetchAdminRequests(params.toString() ? `?${params}` : "");
      setRequests(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Request load failed."));
    } finally {
      setListLoading(false);
    }
  }
  useEffect(() => {
    if (!authLoading && me?.authenticated && (me.actionPermissions.includes("MANAGE_REQUESTS") || me.actionPermissions.includes("ADMIN"))) void loadRequests();
  }, [authLoading, me, query, status, type]);
  if (authLoading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!me.actionPermissions.includes("MANAGE_REQUESTS") && !me.actionPermissions.includes("ADMIN")) return <Navigate to="/unauthorized" replace />;
  return (
    <>
      <PageHeader eyebrow="Dashboard" title="Service request management" description="Authorized DOJ staff can review private portal requests and retry Discord ticket actions." />
      <Content>
        {me.actionPermissions.includes("ADMIN") ? <div className="mb-4"><ButtonLink href="/dashboard/discord" variant="ghost">Discord Diagnostics</ButtonLink></div> : null}
        <Card className="mb-4">
          <div className="grid gap-3 md:grid-cols-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search request number, character, Discord ID, or case number" className="field md:col-span-3" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="field">
              <option value="">All status</option>
              {["SUBMITTED", "RECEIVED", "UNDER_REVIEW", "NEEDS_INFO", "ASSIGNED", "APPROVED", "DENIED", "SCHEDULED", "CLOSED", "CANCELLED"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
            <select value={type} onChange={(event) => setType(event.target.value)} className="field">
              <option value="">All types</option>
              {["LAWYER", "CRIMINAL_TRIAL", "CIVIL_CASE", "SUBPOENA", "ARREST_WARRANT", "SEARCH_SEIZURE_WARRANT", "EXPUNGEMENT", "MARRIAGE", "DIVORCE", "GENERAL"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
            <button type="button" onClick={() => { setQuery(""); setStatus(""); setType(""); }} className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white">Reset filters</button>
          </div>
        </Card>
        {listLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
          <div className="space-y-3">
            <p className="text-sm text-muted">Showing {requests.length} service request{requests.length === 1 ? "" : "s"}</p>
            {requests.map((request) => <RequestRow key={request.id} request={request} href={`/dashboard/requests/${request.id}`} />)}
            {requests.length === 0 ? <Card>No service requests match the current filters.</Card> : null}
          </div>
        )}
      </Content>
    </>
  );
}

function StaffRequestDetail({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchAdminRequest>>["data"] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  useEffect(() => {
    if (requestId) void fetchAdminRequest(requestId).then((result) => setDetail(result.data)).catch((cause) => setError(cause instanceof Error ? cause.message : "Request failed."));
  }, [requestId]);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!me.actionPermissions.includes("MANAGE_REQUESTS")) return <Navigate to="/unauthorized" replace />;

  async function run(action: () => Promise<{ data: typeof detail }>) {
    if (!detail) return;
    setError(null);
    setActionMessage(null);
    try {
      const result = await action();
      setDetail(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    }
  }
  async function confirmDelete(reason: string) {
    if (!detail) return;
    await deleteAdminRequest(detail.id, reason);
    navigate("/dashboard/requests");
  }
  async function confirmClose(reason: string) {
    if (!detail) return;
    setError(null);
    setActionMessage(null);
    try {
      const result = await closeDiscordTicket(detail.id, reason);
      setDetail(result.data);
      setActionMessage(typeof result.close.message === "string" ? result.close.message : "Ticket close workflow completed.");
      setCloseOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Close workflow failed.");
      throw cause;
    }
  }
  async function confirmAssignJudge(judgeDiscordId: string) {
    if (!detail) return;
    setError(null);
    setActionMessage(null);
    try {
      const result = await assignRequest(detail.id, judgeDiscordId);
      setDetail(result.data);
      setActionMessage(`Assigned to ${result.data.assignedJudgeDisplayName ?? "the current judge"}.`);
      setAssignOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Judge assignment failed.");
      throw cause;
    }
  }
  const channelPostWorkflow = detail ? isChannelPostRequestType(detail.requestType) : false;
  const canCloseArchiveTicket = Boolean(detail?.discordTicketChannelId && detail.status !== "CLOSED");

  return (
    <>
      <PageHeader eyebrow="Dashboard" title={detail?.requestNumber ?? "Request"} description="Private service request detail and Discord ticket controls." />
      <Content>{!detail ? <LoadingState /> : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {detail.deletedAt ? <DeletedRecordBanner deletedAt={detail.deletedAt} deletedBy={detail.deletedByDisplayName} reason={detail.deleteReason} /> : null}
            <RequestDetailCard detail={detail} />
          </div>
          <Card>
            <h2 className="text-xl font-semibold">Staff actions</h2>
            <div className="mt-4 grid gap-3">
              {(["RECEIVED", "UNDER_REVIEW", "NEEDS_INFO", "CLOSED"] as const).map((status) => (
                <button key={status} onClick={() => run(() => updateRequestStatus(detail.id, status))} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">{status.replaceAll("_", " ")}</button>
              ))}
              {canCloseArchiveTicket ? <button onClick={() => setCloseOpen(true)} className="rounded-md border border-gold/50 px-3 py-2 text-left font-semibold text-gold">
                Close ticket and archive transcript
              </button> : null}
              <button onClick={() => setAssignOpen(true)} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">
                {detail.assignedJudgeDisplayName ? "Reassign Judge" : "Assign Judge"}
              </button>
              {!channelPostWorkflow ? <button onClick={() => run(() => createDiscordTicket(detail.id))} className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black">Create/retry private Discord channel</button> : null}
              <button onClick={() => run(() => postDiscordTicketEmbed(detail.id))} className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black">{channelPostWorkflow ? "Post/repost lawyer request embed" : "Post/repost private ticket embed"}</button>
              {canManageDocket(me) ? (
                <button
                  onClick={() => {
                    navigate(`/dashboard/docket/new?request=${detail.requestNumber}`);
                  }}
                  className="rounded-md border border-gold/50 px-3 py-2 text-left font-semibold text-gold"
                >
                  Create docket entry from this request
                </button>
              ) : null}
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Admin/staff note" className="rounded-md border border-white/10 bg-black px-3 py-2 outline-none focus:border-gold" />
              <button onClick={() => run(async () => { await addRequestEvent(detail.id, note); setNote(""); return fetchAdminRequest(detail.id); })} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Add note</button>
              <button onClick={() => setDeleteOpen(true)} className="rounded-md border border-red-500/40 px-3 py-2 text-left text-red-200 hover:border-red-300">Delete service request</button>
              {actionMessage ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{actionMessage}</p> : null}
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </div>
          </Card>
        </div>
      )}</Content>
      <ReasonModal
        open={deleteOpen}
        title="Delete service request"
        confirmLabel="Delete request"
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
      <ReasonModal
        open={closeOpen}
        title="Close service request ticket"
        confirmLabel="Close ticket"
        reasonLabel="Close reason"
        description="This creates and archives a Discord transcript, marks the request closed, and deletes the private ticket channel only after the transcript succeeds. Shared request channels are never deleted."
        onClose={() => setCloseOpen(false)}
        onConfirm={confirmClose}
      />
      <JudgeAssignModal
        open={assignOpen}
        me={me}
        currentJudgeName={detail?.assignedJudgeDisplayName ?? null}
        onClose={() => setAssignOpen(false)}
        onConfirm={confirmAssignJudge}
      />
    </>
  );
}

function RequestRow({ request, href }: { request: { id: string; requestNumber: string; requestType: string; status: string; createdAt: string; mainParty: string; shortTitle: string; discordTicketStatus: string }; href: string }) {
  return (
    <Link to={href} className="block rounded-md border border-white/10 bg-panel p-4 hover:border-gold/60">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{request.status}</Badge>
        <Badge>{request.discordTicketStatus}</Badge>
        <span className="font-semibold">{request.requestNumber}</span>
        <span className="text-sm text-muted">{request.requestType.replaceAll("_", " ")}</span>
        <span className="text-sm text-muted">{new Date(request.createdAt).toLocaleString()}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{request.mainParty}</h3>
      <p className="text-sm text-muted">{request.shortTitle}</p>
    </Link>
  );
}

function TicketTranscriptsPage({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TicketTranscriptSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !me?.authenticated || !canViewTranscripts(me)) return;
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    setBusy(true);
    setError(null);
    fetchTicketTranscripts(params)
      .then((result) => setData(result.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Transcript list failed."))
      .finally(() => setBusy(false));
  }, [loading, me, query]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canViewTranscripts(me)) return <Navigate to="/unauthorized" replace />;

  return (
    <>
      <PageHeader eyebrow="Ticket Transcripts" title="Saved Discord ticket transcripts" description="Protected staff view for archived private ticket transcripts stored by the DOJ Portal." />
      <Content>
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search request number, channel, or transcript ID" className="field sm:max-w-md" />
            <Badge>{data.length} transcripts</Badge>
          </div>
          {busy ? <LoadingState /> : error ? <ErrorState message={error} /> : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="p-2">Request</th>
                    <th className="p-2">Channel</th>
                    <th className="p-2">Messages</th>
                    <th className="p-2">Archive</th>
                    <th className="p-2">Created by</th>
                    <th className="p-2">Created</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((transcript) => (
                    <tr key={transcript.id} className="border-t border-white/10">
                      <td className="p-2 font-semibold">{transcript.sourceNumber ?? transcript.sourceId ?? transcript.id}</td>
                      <td className="p-2 break-all">{transcript.discordChannelName ?? transcript.discordChannelId}</td>
                      <td className="p-2">{transcript.messageCount}</td>
                      <td className="p-2 break-all">{transcript.archiveMessageId ? `${transcript.archiveChannelId}/${transcript.archiveMessageId}` : "Pending"}</td>
                      <td className="p-2">{transcript.createdByDisplayName ?? "Unknown"}</td>
                      <td className="p-2">{new Date(transcript.createdAt).toLocaleString()}</td>
                      <td className="p-2"><Link className="font-semibold text-gold hover:text-white" to={`/dashboard/transcripts/${transcript.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 ? <p className="mt-4 text-sm text-muted">No transcripts match that search.</p> : null}
            </div>
          )}
        </Card>
      </Content>
    </>
  );
}

function TicketTranscriptDetailPage({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { transcriptId } = useParams();
  const [detail, setDetail] = useState<TicketTranscriptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!transcriptId || loading || !me?.authenticated || !canViewTranscripts(me)) return;
    fetchTicketTranscript(transcriptId)
      .then((result) => setDetail(result.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Transcript load failed."));
  }, [transcriptId, loading, me]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canViewTranscripts(me)) return <Navigate to="/unauthorized" replace />;

  function downloadHtml() {
    if (!detail) return;
    const html = buildTranscriptHtml(detail);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${detail.sourceNumber ?? detail.id}-transcript.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function copyId() {
    if (!detail) return;
    await navigator.clipboard?.writeText(detail.id).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <PageHeader eyebrow="Ticket Transcript" title={detail?.sourceNumber ?? transcriptId ?? "Transcript"} description="Protected readable view of the archived Discord ticket transcript." />
      <Content>
        {error ? <ErrorState message={error} /> : !detail ? <LoadingState /> : (
          <div className="space-y-5">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{detail.sourceType}</Badge>
                <Badge>{detail.messageCount} messages</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <MetaLine label="Transcript ID" value={detail.id} />
                <MetaLine label="Request / Source" value={detail.sourceNumber ?? detail.sourceId ?? "Unknown"} />
                <MetaLine label="Ticket channel" value={`${detail.discordChannelName ?? "unknown"} (${detail.discordChannelId})`} />
                <MetaLine label="Archive" value={detail.archiveMessageId ? `${detail.archiveChannelId}/${detail.archiveMessageId}` : "Pending archive message"} />
                <MetaLine label="Generated by" value={detail.createdByDisplayName ?? "Unknown"} />
                <MetaLine label="Created" value={new Date(detail.createdAt).toLocaleString()} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={downloadHtml} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">Download HTML transcript</button>
                <button type="button" onClick={() => void copyId()} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">{copied ? "Copied" : "Copy transcript ID"}</button>
                {detail.archiveChannelId && detail.archiveMessageId ? <a className="rounded-md border border-gold/50 px-4 py-3 text-sm font-semibold text-gold" href={discordMessageUrl(detail.archiveChannelId, detail.archiveMessageId)} target="_blank" rel="noreferrer">Open archive message in Discord</a> : null}
              </div>
              {Object.keys(detail.metadata).length > 0 ? <pre className="mt-5 overflow-auto rounded-md border border-white/10 bg-black p-3 text-xs text-zinc-200">{JSON.stringify(detail.metadata, null, 2)}</pre> : null}
            </Card>
            <Card>
              <h2 className="text-xl font-semibold">Messages</h2>
              <div className="mt-5 space-y-3">
                {detail.messages.map((message) => <TranscriptMessageView key={message.id} message={message} />)}
                {detail.messages.length === 0 ? <p className="text-sm text-muted">No messages were captured in this transcript.</p> : null}
              </div>
            </Card>
          </div>
        )}
      </Content>
    </>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="break-words font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function TranscriptMessageView({ message }: { message: TicketTranscriptMessage }) {
  const author = message.author?.displayName ?? message.author?.globalName ?? message.author?.username ?? "Unknown user";
  if (message.transcriptKind === "system") {
    return (
      <div className="rounded-md border border-gold/30 bg-gold/10 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge>System</Badge>
          <span>{message.timestamp ? new Date(message.timestamp).toLocaleString() : "Unknown time"}</span>
          {message.systemEvent?.actorDisplayName ? <span>Actor: {message.systemEvent.actorDisplayName}</span> : null}
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold text-gold">{message.systemEvent?.label || message.content}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-white/10 bg-black p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-zinc-100">{author}</span>
        {message.author?.bot ? <Badge>Bot</Badge> : null}
        <span>{message.timestamp ? new Date(message.timestamp).toLocaleString() : "Unknown time"}</span>
        {message.editedTimestamp ? <span>Edited {new Date(message.editedTimestamp).toLocaleString()}</span> : null}
      </div>
      {message.content ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-200">{message.content}</p> : null}
      {message.embeds.length > 0 ? (
        <div className="mt-3 space-y-3">
          {message.embeds.map((embed, index) => <TranscriptEmbedView key={`${message.id}-embed-${index}`} embed={embed} />)}
        </div>
      ) : null}
      {message.attachments.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {message.attachments.map((attachment) => (
            <a key={`${message.id}-${attachment.url}`} className="break-all text-sm font-semibold text-gold hover:text-white" href={attachment.url} target="_blank" rel="noreferrer">
              {attachment.filename}
            </a>
          ))}
        </div>
      ) : null}
      {message.reactions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {message.reactions.map((reaction, index) => <span key={`${message.id}-reaction-${index}`} className="rounded-md border border-white/10 px-2 py-1">{reaction.emoji.name ?? "reaction"} x{reaction.count}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function TranscriptEmbedView({ embed }: { embed: TicketTranscriptMessage["embeds"][number] }) {
  const accent = embed.color ? `#${embed.color.toString(16).padStart(6, "0")}` : "#ff2fae";
  return (
    <div className="rounded-md border border-white/10 bg-zinc-950 p-4" style={{ borderLeftColor: accent, borderLeftWidth: 4 }}>
      {embed.author?.name ? <p className="text-xs font-semibold text-muted">{embed.author.name}</p> : null}
      {embed.title ? (
        embed.url ? <a href={embed.url} target="_blank" rel="noreferrer" className="mt-1 block break-words text-base font-semibold text-gold hover:text-white">{embed.title}</a> : <h4 className="mt-1 break-words text-base font-semibold text-gold">{embed.title}</h4>
      ) : null}
      {embed.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">{embed.description}</p> : null}
      {embed.fields.length > 0 ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {embed.fields.map((field, index) => (
            <div key={`${field.name}-${index}`} className={field.inline ? "min-w-0" : "min-w-0 sm:col-span-2"}>
              <dt className="break-words text-xs font-semibold uppercase tracking-wide text-muted">{field.name}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {embed.thumbnail?.url || embed.image?.url ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {embed.thumbnail?.url ? <a className="break-all text-xs font-semibold text-gold" href={embed.thumbnail.url} target="_blank" rel="noreferrer">Thumbnail</a> : null}
          {embed.image?.url ? <a className="break-all text-xs font-semibold text-gold" href={embed.image.url} target="_blank" rel="noreferrer">Image</a> : null}
        </div>
      ) : null}
      {embed.footer?.text || embed.timestamp ? <p className="mt-3 text-xs text-muted">{[embed.footer?.text, embed.timestamp ? new Date(embed.timestamp).toLocaleString() : null].filter(Boolean).join(" - ")}</p> : null}
    </div>
  );
}

function discordMessageUrl(channelId: string, messageId: string): string {
  return `https://discord.com/channels/@me/${channelId}/${messageId}`;
}

function buildTranscriptHtml(detail: TicketTranscriptDetail): string {
  const generated = new Date().toLocaleString();
  const rows = detail.messages.map((message) => {
    if (message.transcriptKind === "system") {
      return `<article class="message system"><div class="meta"><strong>SYSTEM</strong><span>${escapeHtml(message.timestamp ? new Date(message.timestamp).toLocaleString() : "Unknown time")}</span>${message.systemEvent?.actorDisplayName ? `<span>Actor: ${escapeHtml(message.systemEvent.actorDisplayName)}</span>` : ""}</div><p>${escapeHtml(message.systemEvent?.label || message.content)}</p></article>`;
    }
    const author = escapeHtml(message.author?.displayName ?? message.author?.globalName ?? message.author?.username ?? "Unknown user");
    const bot = message.author?.bot ? " <span class=\"bot\">BOT</span>" : "";
    const content = escapeHtml(message.content || "[No text content]");
    const attachments = message.attachments.map((attachment) => `<li><a href="${escapeAttribute(attachment.url)}">${escapeHtml(attachment.filename)}</a></li>`).join("");
    const embeds = message.embeds.map(transcriptEmbedHtml).join("");
    const reactions = message.reactions.map((reaction) => `<span class="reaction">${escapeHtml(reaction.emoji.name ?? "reaction")} x${reaction.count}</span>`).join("");
    return `<article class="message"><div class="meta"><strong>${author}</strong>${bot}<span>${escapeHtml(message.timestamp ? new Date(message.timestamp).toLocaleString() : "Unknown time")}</span>${message.editedTimestamp ? `<span>Edited ${escapeHtml(new Date(message.editedTimestamp).toLocaleString())}</span>` : ""}</div>${message.content ? `<pre>${content}</pre>` : ""}${embeds}${attachments ? `<ul>${attachments}</ul>` : ""}${reactions ? `<div class="reactions">${reactions}</div>` : ""}</article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(detail.sourceNumber ?? detail.id)} DOJ Ticket Transcript</title>
  <style>
    body{font-family:Arial,sans-serif;background:#090909;color:#f4f4f5;margin:0;padding:32px;line-height:1.5}
    header{border-bottom:1px solid #ff2fae;padding-bottom:18px;margin-bottom:24px}
    h1{margin:0;color:#75f6ff}
    .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}
    .box,.message{border:1px solid #27272a;background:#111;padding:14px;border-radius:8px}
    .label{font-size:11px;text-transform:uppercase;color:#a1a1aa}
    .value{font-weight:700;word-break:break-word}
    .message{margin:12px 0}
    .system{border-color:#ff2fae;background:#18051a}
    .meta{display:flex;gap:10px;flex-wrap:wrap;color:#a1a1aa;font-size:12px}
    .meta strong{color:#fff}
    .bot{border:1px solid #75f6ff;color:#75f6ff;border-radius:4px;padding:1px 5px}
    pre{white-space:pre-wrap;word-break:break-word;font-family:inherit}
    .embed{border:1px solid #22324a;border-left:4px solid #ff2fae;background:#06111f;padding:12px;border-radius:8px;margin-top:10px}
    .embed-title{font-weight:700;color:#75f6ff}
    .embed-description{white-space:pre-wrap;word-break:break-word}
    .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px}
    .field-full{grid-column:1/-1}
    .reaction{display:inline-block;border:1px solid #27272a;border-radius:6px;padding:3px 7px;margin:3px;color:#a1a1aa}
    a{color:#75f6ff}
  </style>
</head>
<body>
  <header>
    <h1>Miami Stories Department of Justice</h1>
    <p>Ticket Transcript: ${escapeHtml(detail.sourceNumber ?? detail.id)}</p>
    <p>Generated: ${escapeHtml(generated)}</p>
  </header>
  <section class="meta-grid">
    ${metadataBox("Transcript ID", detail.id)}
    ${metadataBox("Source", detail.sourceNumber ?? detail.sourceId ?? "Unknown")}
    ${metadataBox("Ticket channel", `${detail.discordChannelName ?? "unknown"} (${detail.discordChannelId})`)}
    ${metadataBox("Archive", detail.archiveMessageId ? `${detail.archiveChannelId}/${detail.archiveMessageId}` : "Pending")}
    ${metadataBox("Created by", detail.createdByDisplayName ?? "Unknown")}
    ${metadataBox("Created at", new Date(detail.createdAt).toLocaleString())}
  </section>
  <main>${rows || "<p>No messages were captured.</p>"}</main>
</body>
</html>`;
}

function transcriptEmbedHtml(embed: TicketTranscriptMessage["embeds"][number]): string {
  const accent = embed.color ? `#${embed.color.toString(16).padStart(6, "0")}` : "#ff2fae";
  const title = embed.title ? (embed.url ? `<a class="embed-title" href="${escapeAttribute(embed.url)}">${escapeHtml(embed.title)}</a>` : `<div class="embed-title">${escapeHtml(embed.title)}</div>`) : "";
  const fields = embed.fields.map((field) => `<div class="${field.inline ? "" : "field-full"}"><div class="label">${escapeHtml(field.name)}</div><div class="value">${escapeHtml(field.value)}</div></div>`).join("");
  const media = [embed.thumbnail?.url ? `<a href="${escapeAttribute(embed.thumbnail.url)}">Thumbnail</a>` : "", embed.image?.url ? `<a href="${escapeAttribute(embed.image.url)}">Image</a>` : ""].filter(Boolean).join(" ");
  const footer = [embed.footer?.text, embed.timestamp ? new Date(embed.timestamp).toLocaleString() : null].filter(Boolean).join(" - ");
  return `<section class="embed" style="border-left-color:${accent}">${embed.author?.name ? `<div class="label">${escapeHtml(embed.author.name)}</div>` : ""}${title}${embed.description ? `<p class="embed-description">${escapeHtml(embed.description)}</p>` : ""}${fields ? `<div class="fields">${fields}</div>` : ""}${media ? `<p>${media}</p>` : ""}${footer ? `<p class="label">${escapeHtml(footer)}</p>` : ""}</section>`;
}

function metadataBox(label: string, value: string): string {
  return `<div class="box"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function RequestDetailCard({ detail }: { detail: { requestNumber: string; requestType: string; status: string; requesterDiscordUsername: string | null; documentUrl: string | null; templateUrl: string | null; discordTicketStatus: string; discordTicketChannelId: string | null; discordTicketMessageId: string | null; assignedJudgeDisplayName?: string | null; assignedJudgeDiscordId?: string | null; assignedJudgeAssignedAt?: string | null; payload: Record<string, unknown>; events: Array<{ id: string; eventType: string; message: string | null; metadata?: Record<string, unknown>; createdAt: string }> } }) {
  const channelPostWorkflow = isChannelPostRequestType(detail.requestType);
  const transcriptIds = transcriptIdsFromEvents(detail.events);
  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        <Badge>{detail.status}</Badge>
        <Badge>{detail.discordTicketStatus}</Badge>
      </div>
      <h2 className="mt-4 text-2xl font-semibold">{detail.requestNumber}</h2>
      <p className="mt-1 text-muted">{detail.requestType.replaceAll("_", " ")} submitted by {detail.requesterDiscordUsername ?? "unknown"}</p>
      <div className="mt-5 grid gap-3 text-sm">
        {detail.templateUrl ? <ExternalAnchor href={detail.templateUrl}>Template</ExternalAnchor> : null}
        {detail.documentUrl ? <ExternalAnchor href={detail.documentUrl}>Submitted document</ExternalAnchor> : null}
        {detail.assignedJudgeDisplayName ? (
          <p className="text-muted">
            Assigned judge: <span className="font-semibold text-white">{detail.assignedJudgeDisplayName}</span>
            {detail.assignedJudgeAssignedAt ? ` (${new Date(detail.assignedJudgeAssignedAt).toLocaleString()})` : ""}
          </p>
        ) : null}
        {detail.discordTicketChannelId && !channelPostWorkflow ? <p className="text-muted">Private ticket channel ID: {detail.discordTicketChannelId}</p> : null}
        {detail.discordTicketMessageId ? <p className="text-muted">{channelPostWorkflow ? "Request channel message ID" : "Private ticket message ID"}: {detail.discordTicketMessageId}</p> : null}
      </div>
      {transcriptIds.length > 0 ? (
        <div className="mt-5 rounded-md border border-gold/30 bg-gold/10 p-3 text-sm">
          <p className="font-semibold text-gold">Saved transcript{transcriptIds.length > 1 ? "s" : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {transcriptIds.map((id) => (
              <Link key={id} to={`/dashboard/transcripts/${id}`} className="rounded-md border border-gold/40 px-3 py-2 font-semibold text-gold hover:bg-gold hover:text-black">
                {id}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <h3 className="mt-6 text-lg font-semibold">Payload</h3>
      <dl className="mt-3 grid gap-3">
        {Object.entries(detail.payload).map(([key, value]) => (
          <div key={key} className="rounded-md border border-white/10 bg-black p-3">
            <dt className="text-xs uppercase tracking-wide text-muted">{key}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 text-lg font-semibold">Events</h3>
      <div className="mt-3 space-y-2 text-sm text-muted">
        {detail.events.map((event) => <RequestEventRow key={event.id} event={event} />)}
      </div>
    </Card>
  );
}

function transcriptIdsFromEvents(events: Array<{ metadata?: Record<string, unknown> }>): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const id = event.metadata?.transcript_id;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  return [...ids];
}

function RequestEventRow({ event }: { event: { eventType: string; message: string | null; metadata?: Record<string, unknown>; createdAt: string } }) {
  const discord = event.metadata?.discord;
  const details = discord && typeof discord === "object" ? discord as Record<string, unknown> : null;
  const failed = event.eventType.includes("FAILED");
  return (
    <div className={failed ? "rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-100" : ""}>
      <p>{new Date(event.createdAt).toLocaleString()} - {event.eventType}: {event.message}</p>
      {details ? (
        <dl className="mt-2 grid gap-1 text-xs text-zinc-200 md:grid-cols-2">
          {["status", "discordCode", "discordMessage", "likelyFix", "action", "guildId", "categoryId", "channelId", "messageId", "requestNumber"].map((key) => (
            details[key] !== undefined && details[key] !== null ? (
              <div key={key}>
                <dt className="uppercase tracking-wide text-muted">{key}</dt>
                <dd className="break-words">{typeof details[key] === "object" ? JSON.stringify(details[key]) : String(details[key])}</dd>
              </div>
            ) : null
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function BarExam({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { data, loading: statusLoading, error } = useAsync(fetchBarExamStatus);
  const resources = useAsync(fetchBarExamResources);
  if (loading) return <Content><LoadingState /></Content>;
  return (
    <>
      <PageHeader eyebrow="Bar Exam" title="Miami Stories Bar Examination" description="Applicants demonstrate understanding of the Miami Stories legal code, court procedure, ethical conduct, and RP courtroom standards." />
      <Content>
        {!me?.authenticated ? (
          <Card>
            <Badge>Discord login required</Badge>
            <p className="mt-4 text-muted">Exam identity is locked to your Discord account. The old email/username assignment page has been replaced.</p>
            <a className="mt-6 inline-flex rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black" href={authStartUrl("/bar-exam")}>Login with Discord</a>
          </Card>
        ) : statusLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
          <div className="space-y-6">
            <Card className="border-gold/50 bg-gold/10">
              <Clock className="h-7 w-7 text-gold" />
              <h2 className="mt-4 text-xl font-semibold text-gold">24-hour exam window</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                You have 24 hours from the moment you start the exam to complete and submit it. Use the time.
                Read the facts carefully, check the official resources, and explain your reasoning.
              </p>
            </Card>
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <Badge>{data?.eligible ? "Eligible" : "Not eligible"}</Badge>
              {data?.availability === "no_exam_available" ? <Badge>No active exam</Badge> : null}
              {data?.availability === "no_track_available" ? <Badge>No track exam</Badge> : null}
              {data?.activeImportedVersionCount ? <Badge>Imported exams active</Badge> : null}
              <h2 className="mt-4 text-2xl font-semibold">Exam status</h2>
              <p className="mt-3 text-muted">{data?.eligibilityMessage}</p>
              {data?.availability === "no_exam_available" ? (
                <div className="mt-5 rounded-md border border-gold/30 bg-gold/10 p-4 text-sm text-gold">
                  No active Bar Exam is currently available. Please check back after the Bar Association publishes the next exam cycle.
                </div>
              ) : null}
              {data?.availability === "no_track_available" ? (
                <div className="mt-5 rounded-md border border-gold/30 bg-gold/10 p-4 text-sm text-gold">
                  Active Bar Exam versions exist, but none match your current eligible track.
                </div>
              ) : null}
              <div className="mt-5 space-y-3">
                {data?.activeAttempts.map((attempt) => (
                  <Link key={attempt.id} to={`/bar-exam/attempt?track=${attempt.examTrack}`} className="block rounded-md border border-white/10 bg-black p-4 hover:border-gold/60">
                    <div className="flex flex-wrap gap-2"><Badge>{attempt.status}</Badge><Badge>{attempt.examTrack}</Badge></div>
                    <p className="mt-3 font-semibold">{attempt.attemptNumber}</p>
                    <p className="text-sm text-muted">Deadline {new Date(attempt.deadlineAt).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {data?.eligible && ["not_started", "active_attempt"].includes(data.availability) ? <ButtonLink href="/bar-exam/start">Start or Resume Exam</ButtonLink> : null}
                {data?.reviewer ? <ButtonLink href="/dashboard/bar-exam" variant="ghost">Reviewer Dashboard</ButtonLink> : null}
              </div>
            </Card>
            <div className="space-y-4">
              <BarExamInstructionsCard />
              <BarExamWritingGuidanceCard />
              <BarExamIntegrityCard />
              <Card>
                <BookOpen className="h-7 w-7 text-gold" />
                <h2 className="mt-4 text-xl font-semibold">Permitted official resources</h2>
                <div className="mt-3 grid gap-2 text-sm">
                  {resources.data?.data.map((resource) => <ExternalAnchor key={resource.url} href={resource.url}>{resource.title}</ExternalAnchor>)}
                </div>
                {DISCORD_RESOURCE_CHANNEL_ID ? (
                  <p className="mt-4 text-sm leading-6 text-muted">
                    Official resources may also be available in the DOJ resource channel:
                    {" "}<ExternalAnchor href={discordChannelUrl(DISCORD_RESOURCE_CHANNEL_ID)}>DOJ resource channel</ExternalAnchor>
                  </p>
                ) : null}
              </Card>
            </div>
            </div>
          </div>
        )}
      </Content>
    </>
  );
}

function BarExamInstructionsCard() {
  return (
    <Card>
      <BookOpen className="h-7 w-7 text-gold" />
      <h2 className="mt-4 text-xl font-semibold">DOJ Bar Exam Instructions</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted">
        <p>Thank you for applying to take the Miami Stories Bar Examination.</p>
        <p>The Bar Examination is administered through the DOJ Portal. Your exam version is assigned by the portal and locked to your logged-in Discord account.</p>
        <p>You have 24 hours from the moment you start the exam to complete and submit it. You do not need to rush. Use the time to read carefully, research the official materials, organize your thoughts, and write complete answers.</p>
        <p>This exam is open book. You may use official Miami Stories legal resources, including the Miami Stories legal code, courtroom procedures, DOJ standards, and attorney training materials.</p>
        <p>You may use outside legal research for structure or persuasive guidance, but the Florida-inspired Miami Stories RP legal framework controls where applicable.</p>
        <p>You must answer in your own words. You may not use AI to write, rewrite, generate, or complete your answers for you.</p>
        <p>You may not copy another candidate's answers, share your assigned version, share your answers, or ask another person to complete any part of the exam for you.</p>
        <p>Where relevant, cite the specific authority you rely on, such as DOI sections, SOP sections, Charter provisions, or Penal Code sections.</p>
        <p>Submit the exam only once. Once submitted, your answers are final and will be reviewed by the Bar Association.</p>
      </div>
    </Card>
  );
}

function BarExamWritingGuidanceCard() {
  return (
    <Card>
      <Gavel className="h-7 w-7 text-gold" />
      <h2 className="mt-4 text-xl font-semibold">How to Write Strong Answers</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted">
        <p>The Bar Exam is not only testing whether you know the final answer. It is testing whether you can reason, justify, argue, and apply the law to facts.</p>
        <p>Show your thought process.</p>
        <div>
          <p>A strong answer should usually:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Identify the legal issue.</li>
            <li>Explain the rule or legal principle that applies.</li>
            <li>Apply that rule to the facts.</li>
            <li>Consider both sides where appropriate.</li>
            <li>Explain the likely result.</li>
            <li>Cite the authority you relied on.</li>
          </ol>
        </div>
        <p>Do not just write a short conclusion. Explain why you reached it.</p>
        <p>For example, if a case raises possible rights violations, explain what right may have been violated, what facts support that concern, what remedy may apply, and how that affects the strength of the case.</p>
        <p>If a criminal fact pattern involves intent, participation, or responsibility for another person's act, discuss concepts such as actus reus, mens rea, accomplice liability, felony murder, exceptions, defenses, and evidentiary problems where relevant.</p>
        <p>The best answers are clear, organized, honest about uncertainty, and grounded in the Miami Stories legal code.</p>
      </div>
    </Card>
  );
}

function BarExamIntegrityCard() {
  return (
    <Card>
      <ShieldCheck className="h-7 w-7 text-gold" />
      <h2 className="mt-4 text-xl font-semibold">Integrity Rules</h2>
      <div className="mt-3 grid gap-4 text-sm leading-6 text-muted md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-zinc-100">Allowed:</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Official Miami Stories legal resources</li>
            <li>Personal notes</li>
            <li>Outside legal research for structure or persuasive guidance</li>
            <li>Drafting your own answer in your own words</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-zinc-100">Not allowed:</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>AI-written answers</li>
            <li>AI-rewritten answers</li>
            <li>AI-generated legal analysis submitted as your own work</li>
            <li>Copying another candidate</li>
            <li>Sharing your assigned version</li>
            <li>Sharing answers</li>
            <li>Submitting more than once</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function BarExamStart({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const navigate = useNavigate();
  const [examTrack, setExamTrack] = useState<BarExamTrack>("DOJ");
  const [integrityAccepted, setIntegrityAccepted] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = useAsync(fetchBarExamStatus);
  const startableTracks = status.data?.eligibleTracks.filter((track) => status.data?.availableTracks.includes(track)) ?? [];
  useEffect(() => {
    if (startableTracks.length > 0 && !startableTracks.includes(examTrack)) setExamTrack(startableTracks[0]);
  }, [startableTracks.join(","), examTrack]);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  async function start() {
    setError(null);
    try {
      await startBarExam({ examTrack, integrityAccepted, candidateName, candidatePhone, candidateEmail });
      navigate(`/bar-exam/attempt?track=${examTrack}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start exam.");
    }
  }
  return (
    <>
      <PageHeader eyebrow="Bar Exam" title="Start native exam" description="Confirm your track and integrity declaration before the server assigns and locks your version." />
      <Content>
        {status.loading ? <LoadingState /> : status.error ? <ErrorState message={status.error.message} /> : status.data && status.data.availability !== "not_started" && status.data.availability !== "active_attempt" ? (
          <Card>
            <Badge>{status.data.availability === "not_eligible" ? "Not eligible" : "Unavailable"}</Badge>
            <p className="mt-4 text-muted">{status.data.eligibilityMessage}</p>
            {status.data.reviewer ? <div className="mt-5"><ButtonLink href="/dashboard/bar-exam" variant="ghost">Reviewer Dashboard</ButtonLink></div> : null}
          </Card>
        ) : (
        <div className="space-y-4">
        <Card className="border-gold/50 bg-gold/10">
          <Clock className="h-6 w-6 text-gold" />
          <p className="mt-3 text-sm leading-6 text-zinc-200">
            You have 24 hours from the moment you start. Show your reasoning, cite authority where relevant, and submit only when your final answers are ready.
          </p>
        </Card>
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Exam track">
              <select value={examTrack} onChange={(event) => setExamTrack(event.target.value as BarExamTrack)} className="field">
                {(startableTracks.length > 0 ? startableTracks : status.data?.availableTracks ?? ["DOJ", "DEFENSE"]).map((track) => (
                  <option key={track} value={track}>{track === "DOJ" ? "DOJ Bar Exam" : "Defense Bar Exam"}</option>
                ))}
              </select>
            </Field>
            <Field label="In-city name"><input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} className="field" /></Field>
            <Field label="In-city phone"><input value={candidatePhone} onChange={(event) => setCandidatePhone(event.target.value)} className="field" /></Field>
            <Field label="Optional contact email"><input type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} className="field" /></Field>
          </div>
          <label className="mt-6 flex gap-3 rounded-md border border-gold/30 bg-gold/10 p-4 text-sm text-gold">
            <input type="checkbox" checked={integrityAccepted} onChange={(event) => setIntegrityAccepted(event.target.checked)} />
            I confirm that I will answer in my own words, will not use AI to write, rewrite, generate, or complete answers for me, will not copy another candidate's answers, will not share my assigned version, and will submit only once.
          </label>
          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
          <button onClick={start} className="mt-6 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">Start or Resume</button>
        </Card>
        </div>
        )}
      </Content>
    </>
  );
}

function BarExamAttempt({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const navigate = useNavigate();
  const track = (new URLSearchParams(window.location.search).get("track") || "DOJ") as BarExamTrack;
  const [attempt, setAttempt] = useState<BarExamCandidateAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, BarExamAnswerDraft>>({});
  const [saveState, setSaveState] = useState("Not saved yet");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchBarExamAttempt(track).then((result) => {
      setAttempt(result.data);
      setAnswers(Object.fromEntries(result.data.answers.map((answer) => [answer.questionKey, answer])));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Attempt load failed."));
  }, [track]);
  useEffect(() => {
    if (!attempt) return;
    const timer = window.setTimeout(() => void save(false), 2500);
    return () => window.clearTimeout(timer);
  }, [answers]);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  async function save(manual = true) {
    if (!attempt || ["SUBMITTED", "UNDER_REVIEW", "PASSED", "FAILED", "REFERRED_FOR_INTERVIEW", "VOIDED", "EXPIRED"].includes(attempt.status)) return;
    try {
      const result = await saveBarExamDraft({ answers: Object.values(answers) }, attempt.examTrack);
      setAttempt(result.data);
      setSaveState(`${manual ? "Saved" : "Autosaved"} ${new Date().toLocaleTimeString()}`);
    } catch {
      setSaveState("Save failed");
    }
  }
  async function submit() {
    if (!attempt) return;
    if (!window.confirm("Submit final Bar Exam answers? You cannot edit after final submission.")) return;
    try {
      const result = await submitBarExam({ answers: Object.values(answers) }, attempt.examTrack);
      setAttempt(result.data);
      navigate("/bar-exam/submitted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submit failed.");
    }
  }
  return (
    <>
      <PageHeader eyebrow="Bar Exam Attempt" title={attempt?.attemptNumber ?? "Active attempt"} description={attempt ? `${attempt.title} - ${attempt.versionLabel}` : "Loading your locked exam version."} />
      <Content>{error ? <ErrorState message={error} /> : !attempt ? <LoadingState /> : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Card className="border-gold/50 bg-gold/10">
            <Badge>{attempt.status}</Badge>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p><Clock className="mr-2 inline h-4 w-4 text-gold" />Deadline {new Date(attempt.deadlineAt).toLocaleString()}</p>
              <p className="text-lg font-semibold text-gold">{timeRemaining(attempt.deadlineAt)}</p>
              <p className="leading-6 text-zinc-200">You have 24 hours from the moment you start. Show your reasoning, cite authority where relevant, and submit only when your final answers are ready.</p>
              <p>{saveState}</p>
            </div>
            <button onClick={() => void save()} className="mt-5 w-full rounded-md border border-white/10 px-3 py-2 text-sm hover:border-gold">Manual Save</button>
            <button onClick={() => void submit()} className="mt-3 w-full rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black">Final Submit</button>
          </Card>
          <div className="space-y-4">
            <Card><Markdown content={attempt.candidateInstructionsMarkdown} /></Card>
            {attempt.questions.map((question, index) => (
              <Card key={question.key}>
                <div className="flex flex-wrap items-center gap-3"><Badge>{question.points} pts</Badge><span className="text-sm text-muted">Question {index + 1}</span></div>
                <h2 className="mt-4 text-xl font-semibold">{question.prompt}</h2>
                {question.kind === "MULTIPLE_CHOICE" ? (
                  <select value={answers[question.key]?.selectedChoice ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: { ...current[question.key], questionKey: question.key, selectedChoice: event.target.value } }))} className="field mt-4">
                    <option value="">Select</option>
                    {question.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                  </select>
                ) : (
                  <textarea value={answers[question.key]?.answerText ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: { ...current[question.key], questionKey: question.key, answerText: event.target.value } }))} rows={8} className="field mt-4" />
                )}
              </Card>
            ))}
          </div>
        </div>
      )}</Content>
    </>
  );
}

function BarExamSubmitted({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <PageHeader eyebrow="Bar Exam" title="Submission received" description="Your native Bar Exam attempt has been submitted once and is now locked for reviewer processing." />
      <Content>
        <Card>
          <CheckCircle2 className="h-8 w-8 text-gold" />
          <p className="mt-4 text-muted">A Bar Association reviewer will review your attempt in the protected DOJ Portal dashboard. Discord notification failures do not affect your stored submission.</p>
          <div className="mt-6 flex gap-3"><ButtonLink href="/bar-exam">Exam Status</ButtonLink></div>
        </Card>
      </Content>
    </>
  );
}

function BarExamReviewDashboard({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [query, setQuery] = useState("");
  const { data, loading: listLoading, error } = useAsync(() => fetchAdminBarExamAttempts(query ? `?q=${encodeURIComponent(query)}` : ""));
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canReviewBarExam(me)) return <Navigate to="/unauthorized" replace />;
  return (
    <>
      <PageHeader eyebrow="Bar Exam Review" title="Submitted attempts" description="Protected reviewer dashboard for native Bar Exam scoring and decisions." />
      <Content>
        <div className="mb-4 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/bar-exam/versions" variant="ghost">Versions</ButtonLink>
        </div>
        <Card className="mb-4"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attempt, candidate, or Discord ID" className="field" /></Card>
        {listLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
          <div className="space-y-3">
            {data?.data.map((attempt) => (
              <Link key={attempt.id} to={`/dashboard/bar-exam/${attempt.id}`} className="block rounded-md border border-white/10 bg-panel p-4 hover:border-gold/60">
                <div className="flex flex-wrap gap-3"><Badge>{attempt.status}</Badge><Badge>{attempt.examTrack}</Badge><Badge>{attempt.versionLabel}</Badge><span className="font-semibold">{attempt.attemptNumber}</span></div>
                <p className="mt-3 text-lg font-semibold">{attempt.candidateName ?? attempt.discordUsername ?? "Unknown candidate"}</p>
                <p className="text-sm text-muted">Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "not submitted"} - Score {attempt.finalScore ?? "pending"}</p>
              </Link>
            ))}
          </div>
        )}
      </Content>
    </>
  );
}

function BarExamReviewDetail({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const { attemptId } = useParams();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchAdminBarExamAttempt>>["data"] | null>(null);
  const [scores, setScores] = useState<Record<string, { pointsAwarded: number; reviewerNotes: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!attemptId) return;
    void fetchAdminBarExamAttempt(attemptId).then((result) => {
      setDetail(result.data);
      setScores(Object.fromEntries(result.data.answers.map((answer) => [answer.questionKey, { pointsAwarded: answer.pointsAwarded ?? 0, reviewerNotes: answer.reviewerNotes ?? "" }])));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Attempt load failed."));
  }, [attemptId]);
  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canReviewBarExam(me)) return <Navigate to="/unauthorized" replace />;
  async function saveScore() {
    if (!detail) return;
    const result = await scoreBarExamAttempt(detail.id, Object.entries(scores).map(([questionKey, score]) => ({ questionKey, ...score })));
    setDetail(result.data);
  }
  async function decide(action: "mark-under-review" | "pass" | "fail" | "refer" | "void" | "reopen") {
    if (!detail) return;
    if (["pass", "fail", "void", "reopen"].includes(action) && !window.confirm(`Confirm ${action} decision?`)) return;
    const result = await markBarExamAttempt(detail.id, action);
    setDetail(result.data);
  }
  async function confirmDelete(reason: string) {
    if (!detail) return;
    await deleteBarExamAttempt(detail.id, reason);
    navigate("/dashboard/bar-exam");
  }
  return (
    <>
      <PageHeader eyebrow="Bar Exam Review" title={detail?.attemptNumber ?? "Attempt"} description={detail ? `${detail.title} - ${detail.versionLabel}` : "Protected reviewer detail."} />
      <Content>{error ? <ErrorState message={error} /> : !detail ? <LoadingState /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            {detail.deletedAt ? <DeletedRecordBanner deletedAt={detail.deletedAt} deletedBy={detail.deletedByDisplayName} reason={detail.deleteReason} /> : null}
            <Card>
              <div className="flex flex-wrap gap-3"><Badge>{detail.status}</Badge><Badge>{detail.examTrack}</Badge><Badge>Passing {detail.passingScore}</Badge></div>
              <div className="mt-4 grid gap-2 text-sm text-muted md:grid-cols-2">
                <p>Candidate: {detail.candidateName ?? "Unknown"}</p>
                <p>Discord: {detail.discordUsername ?? detail.discordUserId}</p>
                <p>Deadline: {new Date(detail.deadlineAt).toLocaleString()}</p>
                <p>Submitted: {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "Not submitted"}</p>
                <p>Score: {detail.finalScore ?? "Pending"}</p>
                <p>Decision: {detail.decision ?? "Pending"}</p>
              </div>
            </Card>
            {detail.questions.map((question, index) => {
              const answer = detail.answers.find((item) => item.questionKey === question.key);
              const score = scores[question.key] ?? { pointsAwarded: 0, reviewerNotes: "" };
              return (
                <Card key={question.key}>
                  <div className="flex flex-wrap gap-3"><Badge>{question.points} pts</Badge><span className="text-sm text-muted">Question {index + 1}</span></div>
                  <h2 className="mt-4 text-xl font-semibold">{question.prompt}</h2>
                  <div className="mt-4 rounded-md border border-white/10 bg-black p-4 text-sm whitespace-pre-wrap break-words">{answer?.selectedChoice || answer?.answerText || "No answer"}</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr]">
                    <Field label="Points">
                      <input type="number" min={0} max={question.points} value={score.pointsAwarded} onChange={(event) => setScores((current) => ({ ...current, [question.key]: { ...score, pointsAwarded: Number(event.target.value) } }))} className="field" />
                    </Field>
                    <Field label="Private reviewer notes">
                      <textarea value={score.reviewerNotes} onChange={(event) => setScores((current) => ({ ...current, [question.key]: { ...score, reviewerNotes: event.target.value } }))} rows={3} className="field" />
                    </Field>
                  </div>
                </Card>
              );
            })}
            <Card>
              <h2 className="text-xl font-semibold">Events</h2>
              <div className="mt-3 space-y-2 text-sm text-muted">{detail.events.map((event) => <p key={event.id}>{new Date(event.createdAt).toLocaleString()} - {event.eventType}: {event.message}</p>)}</div>
            </Card>
          </div>
          <Card>
            <h2 className="text-xl font-semibold">Decision controls</h2>
            <div className="mt-4 grid gap-3">
              <button onClick={() => void decide("mark-under-review")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Mark Under Review</button>
              <button onClick={() => void saveScore()} className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black">Save Score</button>
              <button onClick={() => void decide("pass")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Pass / Accept</button>
              <button onClick={() => void decide("fail")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Fail / Deny</button>
              <button onClick={() => void decide("refer")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Refer for Interview</button>
              <button onClick={() => void decide("void")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Void Attempt</button>
              <button onClick={() => void decide("reopen")} className="rounded-md border border-white/10 px-3 py-2 text-left hover:border-gold">Reopen Attempt</button>
              <button onClick={() => setDeleteOpen(true)} className="rounded-md border border-red-500/40 px-3 py-2 text-left text-red-200 hover:border-red-300">Delete attempt</button>
            </div>
            {detail.status === "PASSED" ? (
              <div className="mt-6 border-t border-white/10 pt-6">
                <h3 className="font-semibold text-zinc-200">Role & Channel Status</h3>
                <div className="mt-2 text-xs text-muted space-y-1">
                  <p>
                    Role: <span className="text-emerald-400 font-semibold">Bar Eligible (Assigned)</span>
                  </p>
                </div>
                {detail.followupChannelId ? (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted">A private coordination channel has been created.</p>
                    <a
                      href={discordChannelUrl(detail.followupChannelId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black"
                    >
                      Go to Discord Channel
                    </a>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted">No coordination channel created yet.</p>
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try {
                          const result = await createBarExamFollowupChannel(detail.id);
                          setDetail(result.data);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : "Failed to create coordination channel.");
                        }
                      }}
                      className="rounded-md bg-gold px-3 py-2 text-left font-semibold text-black text-sm"
                    >
                      Create Bar Exam follow-up channel
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      )}</Content>
      <ReasonModal
        open={deleteOpen}
        title="Delete Bar Exam attempt"
        confirmLabel="Delete attempt"
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function BarExamVersions({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [versions, setVersions] = useState<Array<Awaited<ReturnType<typeof fetchAdminBarExamVersions>>["data"][number]>>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);

  async function loadVersions() {
    setListLoading(true);
    setError(null);
    try {
      const result = await fetchAdminBarExamVersions();
      setVersions(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to load Bar Exam versions."));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && me?.authenticated && canReviewBarExam(me)) {
      void loadVersions();
    }
  }, [loading, me]);

  async function publish(id: string, nextActive: boolean) {
    setActionId(id);
    setError(null);
    try {
      if (nextActive) {
        await publishBarExamVersion(id);
      } else {
        await unpublishBarExamVersion(id);
      }
      await loadVersions();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to update Bar Exam version publication."));
    } finally {
      setActionId(null);
    }
  }

  async function confirmDeleteVersion(reason: string) {
    if (!deleteVersionId) return;
    setActionId(deleteVersionId);
    setError(null);
    try {
      await deleteBarExamVersion(deleteVersionId, reason);
      await loadVersions();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to delete Bar Exam version."));
    } finally {
      setActionId(null);
      setDeleteVersionId(null);
    }
  }

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canReviewBarExam(me)) return <Navigate to="/unauthorized" replace />;
  const officialVersions = versions.filter((version) => Boolean(version.isImported) && !version.isPlaceholder);
  const activeVersions = officialVersions.filter((version) => Boolean(version.isActive));
  const inactiveVersions = versions.filter((version) => !version.isActive);
  const renderVersion = (version: (typeof versions)[number]) => {
    const active = Boolean(version.isActive);
    const imported = Boolean(version.isImported);
    return (
      <Card key={version.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge>{version.examTrack}</Badge>
              <Badge>{active ? "Active" : "Inactive"}</Badge>
              <Badge>{imported ? "Server-scored" : "Candidate-safe metadata"}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold">{version.title}</h2>
            <p className="mt-1 text-sm text-muted">{version.versionLabel} - {version.status}</p>
          </div>
          <button
            disabled={actionId === version.id}
            onClick={() => void publish(version.id, !active)}
            className={active ? "rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-gold disabled:cursor-not-allowed disabled:opacity-60" : "rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"}
          >
            {actionId === version.id ? "Saving..." : active ? "Deactivate" : "Activate"}
          </button>
          <button
            disabled={actionId === version.id}
            onClick={() => setDeleteVersionId(version.id)}
            className="rounded-md border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </button>
        </div>
        {version.description ? <p className="mt-3 text-sm leading-6 text-muted">{version.description}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><p className="text-muted">Questions</p><p className="font-semibold">{version.questionCount}</p></div>
          <div><p className="text-muted">Points</p><p className="font-semibold">{version.totalPoints}</p></div>
          <div><p className="text-muted">Passing</p><p className="font-semibold">{version.passingScore}</p></div>
          <div><p className="text-muted">Minutes</p><p className="font-semibold">{version.timeLimitMinutes}</p></div>
        </div>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted">
          Server scoring material: {version.hasServerAnswerKey ? "stored privately" : "not imported"}
        </p>
      </Card>
    );
  };
  return (
    <>
      <PageHeader eyebrow="Bar Exam Versions" title="Native exam versions" description="Publish candidate-safe exam versions while keeping scoring material server-side." />
      <Content>
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Version operations</h2>
              <p className="mt-1 text-sm text-muted">
                Import exam versions through the protected local seed workflow, then publish the active version for candidates.
              </p>
            </div>
          </div>
        </Card>
        {listLoading ? <LoadingState /> : error ? <ErrorState message={error.message} /> : (
          <>
            <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted">
              <Badge>{versions.length} total versions</Badge>
              <Badge>{officialVersions.length} server-scored</Badge>
              <Badge>{activeVersions.length} active server-scored</Badge>
              <Badge>{versions.filter((version) => version.isActive).length} active</Badge>
            </div>
            {versions.length === 0 ? (
              <Card>
                <h2 className="text-lg font-semibold">No Bar Exam versions found</h2>
                <p className="mt-2 text-sm text-muted">Use the protected Bar Association import workflow, then refresh this dashboard.</p>
              </Card>
            ) : (
              <div className="space-y-6">
                <section>
                  <h2 className="mb-3 text-xl font-semibold">Exam versions</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {officialVersions.map(renderVersion)}
                    {officialVersions.length === 0 ? <Card>No exam versions are currently available for publishing.</Card> : null}
                  </div>
                </section>
                <section>
                  <button type="button" onClick={() => setShowInactive((value) => !value)} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">
                    {showInactive ? "Hide" : "Show"} inactive versions ({inactiveVersions.length})
                  </button>
                  {showInactive ? <div className="mt-3 grid gap-3 md:grid-cols-2">{inactiveVersions.map(renderVersion)}</div> : null}
                </section>
              </div>
            )}
          </>
        )}
      </Content>
      <ReasonModal
        open={Boolean(deleteVersionId)}
        title="Delete Bar Exam version"
        confirmLabel="Delete version"
        onClose={() => setDeleteVersionId(null)}
        onConfirm={confirmDeleteVersion}
      />
    </>
  );
}

function DeletionLogPage({ me, loading }: { me: CurrentUserResponse | null; loading: boolean }) {
  const [entries, setEntries] = useState<Array<Awaited<ReturnType<typeof fetchDeletionLog>>["data"][number]>>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await fetchDeletionLog();
    setEntries(result.data);
  }

  useEffect(() => {
    if (!loading && canUseDeletionLog(me)) void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Deletion log load failed."));
  }, [loading, me]);

  if (loading) return <Content><LoadingState /></Content>;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  if (!canUseDeletionLog(me)) return <Navigate to="/unauthorized" replace />;

  async function confirmRestore(reason: string) {
    if (!restoreId) return;
    setBusy(true);
    setError(null);
    try {
      await restoreDeletionLogEntry(restoreId, reason);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Restore failed.");
    } finally {
      setBusy(false);
      setRestoreId(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Protected Trash" title="Deletion Log" description="Justice-only record of soft-deleted DOJ Portal content with restore/republish controls." />
      <Content>
        {error ? <ErrorState message={error} /> : null}
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{entry.entityType.replaceAll("_", " ")}</Badge>
                    <Badge>{entry.restoredAt ? "Restored" : "Deleted"}</Badge>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">{entry.entityNumber ?? entry.entityTitle ?? entry.entityId}</h2>
                  {entry.entityTitle && entry.entityTitle !== entry.entityNumber ? <p className="mt-1 text-sm text-muted">{entry.entityTitle}</p> : null}
                  <div className="mt-3 grid gap-1 text-sm text-muted">
                    <p>Deleted by {entry.deletedByDisplayName ?? entry.deletedByUserId ?? "Unknown"} on {new Date(entry.createdAt).toLocaleString()}</p>
                    <p>Reason: {entry.deleteReason}</p>
                    {entry.restoredAt ? <p>Restored by {entry.restoredByDisplayName ?? entry.restoredByUserId ?? "Unknown"} on {new Date(entry.restoredAt).toLocaleString()}: {entry.restoreReason}</p> : null}
                  </div>
                </div>
                {!entry.restoredAt ? (
                  <button disabled={busy} onClick={() => setRestoreId(entry.id)} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60">
                    Restore / Republish
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
          {entries.length === 0 ? <Card>No deleted records are currently in the protected Trash.</Card> : null}
        </div>
      </Content>
      <ReasonModal
        open={Boolean(restoreId)}
        title="Restore / Republish"
        confirmLabel="Restore / Republish"
        reasonLabel="Reason for restore"
        description="This restores the record to the active DOJ Portal views allowed by its saved publication/status settings and records the restore action in the protected Trash / Deletion Log."
        onClose={() => setRestoreId(null)}
        onConfirm={confirmRestore}
      />
    </>
  );
}

function DeletedRecordBanner({ deletedAt, deletedBy, reason }: { deletedAt?: string | null; deletedBy?: string | null; reason?: string | null }) {
  if (!deletedAt) return null;
  return (
    <Card className="border-red-500/40 bg-red-500/10">
      <AlertTriangle className="h-5 w-5 text-red-200" />
      <h2 className="mt-2 font-semibold text-red-100">Deleted record</h2>
      <p className="mt-1 text-sm text-red-100/80">
        Removed from active portal views on {new Date(deletedAt).toLocaleString()} by {deletedBy ?? "Unknown"}.
      </p>
      {reason ? <p className="mt-1 text-sm text-red-100/80">Reason: {reason}</p> : null}
    </Card>
  );
}

function JudgeAssignModal({
  open,
  me,
  currentJudgeName,
  onClose,
  onConfirm
}: {
  open: boolean;
  me: CurrentUserResponse | null;
  currentJudgeName: string | null;
  onClose: () => void;
  onConfirm: (judgeDiscordId: string) => Promise<void>;
}) {
  const [judges, setJudges] = useState<EligibleJudge[]>([]);
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
      setLoading(true);
      setSelectedJudgeId("");
      fetchEligibleJudges()
        .then((result) => {
          setJudges(result.data);
          const currentUserJudge = me?.authenticated ? result.data.find((judge) => judge.discordUserId === me.user.discordId) : null;
          setSelectedJudgeId(currentUserJudge?.discordUserId ?? result.data[0]?.discordUserId ?? "");
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Judge list could not be loaded."))
        .finally(() => setLoading(false));
    }
  }, [open, me]);

  if (!open) return null;

  const selectedJudge = judges.find((judge) => judge.discordUserId === selectedJudgeId) ?? null;
  const signedInJudge = me?.authenticated ? judges.find((judge) => judge.discordUserId === me.user.discordId) ?? null : null;

  async function submit() {
    if (!selectedJudgeId) {
      setError("Select an eligible judge.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(selectedJudgeId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-lg rounded-md border border-white/10 bg-panel p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">{currentJudgeName ? "Reassign judge" : "Assign judge"}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {currentJudgeName
            ? `This request is currently assigned to ${currentJudgeName}. Select the Judge-role member who should handle it.`
            : "Select the Judge-role member who should handle this request."}
        </p>
        {signedInJudge ? (
          <button
            type="button"
            onClick={() => setSelectedJudgeId(signedInJudge.discordUserId)}
            disabled={busy || loading}
            className="mt-4 rounded-md border border-gold/50 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold/10 disabled:opacity-60"
          >
            Assign to me / Claim request
          </button>
        ) : null}
        <label className="mt-4 block text-sm font-semibold text-zinc-200">
          Eligible judge
          <select
            value={selectedJudgeId}
            onChange={(event) => setSelectedJudgeId(event.target.value)}
            disabled={busy || loading || judges.length === 0}
            className="mt-2 w-full rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-gold"
          >
            {loading ? <option>Loading Judge role members...</option> : null}
            {!loading && !error && judges.length === 0 ? <option>No eligible judges found</option> : null}
            {!loading && error ? <option>Judge list unavailable</option> : null}
            {judges.map((judge) => (
              <option key={judge.discordUserId} value={judge.discordUserId}>
                {judge.displayName} ({judge.username})
              </option>
            ))}
          </select>
        </label>
        {selectedJudge ? (
          <div className="mt-4 flex min-w-0 items-center gap-3 rounded-md border border-white/10 bg-black p-3">
            {selectedJudge.avatarUrl ? <img src={selectedJudge.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : null}
            <div className="min-w-0">
              <p className="truncate font-semibold">{selectedJudge.displayName}</p>
              <p className="truncate text-xs text-muted">Discord ID: {selectedJudge.discordUserId}</p>
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || loading || !selectedJudgeId} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black disabled:opacity-60">
            {busy ? "Saving..." : currentJudgeName ? "Reassign judge" : "Assign judge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReasonModal({
  open,
  title,
  confirmLabel,
  reasonLabel = "Reason for deletion",
  description = "This removes the record from active portal views but preserves it in the protected Trash / Deletion Log.",
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  reasonLabel?: string;
  description?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setError(`${reasonLabel} is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-md border border-white/10 bg-panel p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {description}
        </p>
        <Field label={reasonLabel}>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} className="field" required />
        </Field>
        {error ? <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white">Cancel</button>
          <button disabled={busy} className="rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">{busy ? "Saving..." : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}

function safeLoginRedirect(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value === "/requests" || value === "/my-requests") return "/requests/mine";
  return value;
}

function resolvePostLoginRedirect(me: CurrentUserResponse, intendedRedirect: string | null): string {
  const canViewDashboard = me.authenticated && (me.actionPermissions.includes("VIEW_DASHBOARD") || me.actionPermissions.includes("ADMIN"));
  if (!intendedRedirect || intendedRedirect === "/") return canViewDashboard ? "/dashboard" : "/";
  if (intendedRedirect === "/requests" || intendedRedirect === "/my-requests") return "/requests/mine";
  if (isDashboardRedirect(intendedRedirect)) return canViewDashboard ? intendedRedirect : "/";
  return isPublicUserRedirect(intendedRedirect) ? intendedRedirect : "/";
}

function isDashboardRedirect(path: string): boolean {
  return path === "/dashboard" || path.startsWith("/dashboard/");
}

function isPublicUserRedirect(path: string): boolean {
  const exact = new Set(["/", "/resources", "/faq", "/docket", "/lawyers", "/services", "/bar-exam", "/requests/mine"]);
  if (exact.has(path)) return true;
  return ["/docket/", "/lawyers/", "/services/", "/requests/"].some((prefix) => path.startsWith(prefix));
}

function LoginPage() {
  return (
    <>
      <PageHeader eyebrow="Authentication" title="Login with Discord" description="Use Discord OAuth to verify identity and load DOJ role permissions from the configured server." />
      <Content>
        <Card>
          <Badge>Discord OAuth</Badge>
          <p className="mt-4 text-muted">You will be redirected to Discord, then returned to the correct DOJ Portal area for your role.</p>
          <p className="mt-3 text-sm text-muted">
            To switch Discord accounts, use Discord's "Not you?" option on the authorization screen or log out of Discord before continuing.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex items-center justify-center rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black" href={authStartUrl()}>
              Login with Discord
            </a>
            <Link to="/" className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
              Return Home
            </Link>
          </div>
        </Card>
      </Content>
    </>
  );
}

function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = searchParams.get("bootstrap");
    const redirectPath = searchParams.get("redirect");
    const intendedRedirect = safeLoginRedirect(redirectPath);
    if (!bootstrap) {
      setError("Missing login token. Please sign in with Discord again.");
      return;
    }
    window.history.replaceState(null, "", "/auth/callback");
    bootstrapSession(bootstrap)
      .then(fetchMe)
      .then((currentUser) => {
        if (!currentUser.authenticated) {
          throw new Error("Your DOJ Portal session was not established. Please sign in with Discord again.");
        }
        const selectedRedirect = resolvePostLoginRedirect(currentUser, intendedRedirect);
        console.log("post_login_redirect_selected", {
          dashboardAccess: currentUser.actionPermissions.includes("VIEW_DASHBOARD") || currentUser.actionPermissions.includes("ADMIN"),
          redirect: selectedRedirect
        });
        window.location.assign(selectedRedirect);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Login failed. Please try again.");
      });
  }, [searchParams]);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Authentication" title="Login failed" description="Your Discord sign-in could not be completed." />
        <Content>
          <Card>
            <p className="text-muted">{error}</p>
            <Link to="/login" className="mt-6 inline-flex rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">
              Try again
            </Link>
          </Card>
        </Content>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Authentication" title="Completing sign-in" description="Establishing your DOJ Portal session." />
      <Content><LoadingState /></Content>
    </>
  );
}

function LogoutPage({ onLogout }: { onLogout: () => void }) {
  useEffect(() => {
    void onLogout();
  }, [onLogout]);
  return (
    <>
      <PageHeader eyebrow="Authentication" title="Logging out" description="Your DOJ Portal session is being cleared." />
      <Content><LoadingState /></Content>
    </>
  );
}

function Unauthorized() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");
  const message = unauthorizedMessage(reason);
  const isDashboardPermission = reason === "missing_dashboard_permission";

  return (
    <>
      <PageHeader eyebrow="Access" title={isDashboardPermission ? "Workspace access limited" : "Sign-in required"} description={message.title} />
      <Content>
        <Card>
          <p className="text-muted">{message.body}</p>
          {isDashboardPermission ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/" className="inline-flex items-center justify-center rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">
                Return Home
              </Link>
              <Link to="/services" className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
                View Services
              </Link>
              <Link to="/resources" className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
                View Resources
              </Link>
            </div>
          ) : (
            <Link to="/login" className="mt-6 inline-flex rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black">
              Login with Discord
            </Link>
          )}
        </Card>
      </Content>
    </>
  );
}

function unauthorizedMessage(reason: string | null): { title: string; body: string } {
  switch (reason) {
    case "not_in_guild":
      return {
        title: "Discord server membership required",
        body: "You must be a member of the Miami Stories Discord server to access the DOJ Portal. Join the server, then sign in again."
      };
    case "guild_verification_failed":
      return {
        title: "Discord membership could not be verified",
        body: "Unable to verify your Miami Stories Discord membership. Please make sure you are in the server and try again."
      };
    case "invalid_state":
    case "expired_state":
      return {
        title: "Discord sign-in expired",
        body: "Your Discord authorization session expired or was invalid. Please start sign-in again from the login page."
      };
    case "callback_failed":
      return {
        title: "Discord sign-in failed",
        body: "Discord authorization could not be completed. Please try signing in again. If the problem continues, contact DOJ leadership."
      };
    case "missing_dashboard_permission":
      return {
        title: "Authorized DOJ personnel only",
        body: "You are signed in, but this workspace is limited to authorized DOJ personnel. You can still access public DOJ services, resources, the docket, lawyer requests, and Bar Examination access from the main portal."
      };
    default:
      return {
        title: "Unauthorized",
        body: "Your authenticated Discord identity does not currently have the permissions required for that DOJ Portal area. Ask DOJ leadership to confirm your Discord roles, then use the dashboard role refresh control after logging in."
      };
  }
}

function DashboardShell({ path, me, loading, onRefresh }: { path: string; me: CurrentUserResponse | null; loading: boolean; onRefresh: (me: CurrentUserResponse) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const authenticated = me?.authenticated === true;
  const canView = authenticated && me.actionPermissions.includes("VIEW_DASHBOARD");

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      onRefresh(await refreshRoles());
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "Role refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Dashboard" title={dashboardTitle(path)} description="Checking your DOJ Portal session." />
        <Content><LoadingState /></Content>
      </>
    );
  }

  if (!authenticated) return <Navigate to="/login" replace />;
  if (!canView) {
    console.warn("unauthorized_dashboard_access", { path });
    return <Navigate to="/unauthorized?reason=missing_dashboard_permission" replace />;
  }

  return (
    <>
      <PageHeader eyebrow="Dashboard" title={dashboardTitle(path)} description="Authenticated DOJ workspace shell with Discord-derived role and permission context." />
      <Content>
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card>
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-5 w-5 text-gold" />
              <span className="font-semibold">Internal Shell</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {dashboardRoutes.slice(0, 8).map((route) => (
                <Link key={route} to={route} className="rounded-md px-3 py-2 text-muted hover:bg-white/5 hover:text-white">
                  {dashboardTitle(route)}
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              {me.user.avatarUrl ? <img src={me.user.avatarUrl} alt="" className="h-16 w-16 rounded-full" /> : null}
              <div>
                <Badge>{me.isBootstrapAdmin ? "Bootstrap Admin" : "Discord Authenticated"}</Badge>
                <h2 className="mt-3 text-2xl font-semibold">{me.user.discordGlobalName ?? me.user.discordUsername}</h2>
                <p className="text-sm text-muted">Discord ID: {me.user.discordId}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <PermissionPanel title="Logical permissions" items={me.permissions} />
              <PermissionPanel title="Action permissions" items={me.actionPermissions} />
            </div>
            <div className="mt-6">
              <h3 className="text-lg font-semibold">Cached Discord roles</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {me.roles.length > 0 ? me.roles.map((role) => <RoleBadge key={role.discordRoleId} role={role} />) : <span className="text-sm text-muted">No mapped guild roles cached.</span>}
              </div>
              <button type="button" onClick={refresh} disabled={refreshing} className="mt-5 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black disabled:opacity-60">
                {refreshing ? "Refreshing..." : "Refresh Discord Roles"}
              </button>
              {refreshError ? <p className="mt-3 text-sm text-red-300">{refreshError}</p> : null}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Stage 3", "Service request workflows", me.actionPermissions.includes("SUBMIT_SERVICE_REQUEST") || me.actionPermissions.includes("MANAGE_REQUESTS")],
                ["Stage 4", "Docket and records tools", me.actionPermissions.includes("CREATE_DOCKET") || me.actionPermissions.includes("PUBLISH_DOCKET")],
                ["Stage 5", "Native Bar Exam operations", me.actionPermissions.includes("START_BAR_EXAM") || me.actionPermissions.includes("REVIEW_BAR_EXAMS")]
              ].map(([label, text, unlocked]) => (
                <div key={String(label)} className="rounded-md border border-white/10 bg-black p-4">
                  <Badge>{unlocked ? "Unlocked path" : "Restricted path"}</Badge>
                  <h3 className="mt-3 font-semibold">{String(label)}</h3>
                  <p className="mt-1 text-sm text-muted">{String(text)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Content>
    </>
  );
}

function RoleBadge({ role }: { role: Extract<CurrentUserResponse, { authenticated: true }>["roles"][number] }) {
  if (role.roleName) return <Badge>{role.roleName}</Badge>;
  return (
    <span className="rounded-md border border-white/10 bg-black px-3 py-2 text-xs text-zinc-100">
      Unknown Discord role
      <span className="ml-2 text-muted">{role.discordRoleId}</span>
    </span>
  );
}

function PermissionPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => <Badge key={item}>{item}</Badge>)}
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
    </div>
  );
}

function Content({ children }: { children: ReactNode }) {
  return <section className="mx-auto max-w-7xl min-w-0 px-4 py-12 sm:px-6 lg:px-8">{children}</section>;
}

function dashboardTitle(path: string) {
  if (path === "/dashboard") return "Dashboard";
  return path
    .replace("/dashboard/", "")
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

