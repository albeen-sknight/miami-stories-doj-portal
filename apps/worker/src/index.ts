/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Worker API Router
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type { ApiListResponse, AttorneyProfile, FaqEntry, ResourceDocument } from "@shotta-doj/shared";
import {
  adminBarSummary,
  adminFaq,
  adminFaqDetail,
  adminResourceDetail,
  adminResources,
  createFaq,
  createResource,
  faqImportGuidance,
  setFaqPublication,
  setResourcePublication,
  updateFaq,
  updateResource
} from "./adminContent";
import { bootstrapSession, completeDiscordAuth, logout, me, refreshOwnRoles, requireAuth, startDiscordAuth, AuthRequiredError } from "./auth";
import { audit } from "./audit";
import {
  addBarExamEventNote,
  adminBarExamAttemptDetail,
  adminBarExamAttempts,
  adminBarExamVersions,
  barExamResources,
  barExamStatus,
  getBarExamEvents,
  getCandidateAttempt,
  markBarExamAttempt,
  saveBarExamDraft,
  scoreBarExamAttempt,
  seedBarExamVersions,
  startBarExam,
  submitBarExam,
  updateBarExamVersionPublication,
  createFollowupChannelRoute
} from "./barExam";
import { deletionLogDetail, listDeletionLog, restoreFromDeletionLog, restoreEntityRoute, softDeleteEntityRoute } from "./deletionLog";
import { listFaq, getLawyerBySlug, listLawyers, listResources } from "./db";
import { discordInteractions } from "./discordInteractions";
import {
  addDocketEventNote,
  adminDocketDetail,
  adminDocketList,
  archiveDocket,
  closeDocket,
  createDocket,
  createDocketFromRequest,
  getDocketEvents,
  listPublicDocket,
  postDocketToDiscord,
  publicDocketDetail,
  publishDocket,
  unpublishDocket,
  updateDocket
} from "./docket";
import { errorJson, json, notFound } from "./http";
import {
  adminJudicialRecordDetail,
  adminJudicialRecords,
  archiveJudicialRecord,
  createJudicialRecord,
  deleteJudicialRecord,
  judicialHistorySearch,
  judicialRecordDetail,
  listJudicialRecords,
  publishJudicialRecord,
  restoreJudicialRecord,
  updateJudicialRecord
} from "./judicialRecords";
import { PermissionError, requireAnyPermission, requirePermission } from "./permissions";
import {
  addAdminRequestEvent,
  adminRequestDetail,
  adminRequests,
  assignRequest,
  createDiscordChannelRoute,
  createRequest,
  closeDiscordTicketRoute,
  discordDiagnosticsRoute,
  eligibleJudgesRoute,
  getAdminRequestEvents,
  myRequests,
  postDiscordTicketRoute,
  publicRequestDetail,
  updateRequestStatus
} from "./serviceRequests";
import { attorneyProfilesSeed, faqSeed } from "./seeds/publicSeeds";
import { resourceDocumentsSeed } from "./seeds/resources";
import { seedFoundationData } from "./seedRunner";
import { listTicketTranscripts, ticketTranscriptDetail } from "./transcripts";
import type { Env } from "./types";

const PRODUCTION_FRONTEND_ORIGINS = ["https://miami-stories-doj.pages.dev", "https://www.miami-stories-doj.pages.dev", "https://miami-stories-doj.pages.dev"] as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return corsPreflight(request, env);

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return withCors(notFound(), request, env);

    try {
      if (url.pathname === "/api/discord/interactions") {
        return await requireMethod(request, "POST", () => discordInteractions(request, env, ctx));
      }

      if (url.pathname === "/api/admin/requests/eligible-judges") {
        return withCors(await requireMethod(request, "GET", () => eligibleJudgesRoute(request, env)), request, env);
      }

      const transcriptMatch = url.pathname.match(/^\/api\/admin\/transcripts(?:\/([^/]+))?$/);
      if (transcriptMatch) {
        const [, id] = transcriptMatch;
        if (id) return withCors(await requireMethod(request, "GET", () => ticketTranscriptDetail(request, env, decodeURIComponent(id))), request, env);
        return withCors(await requireMethod(request, "GET", () => listTicketTranscripts(request, env)), request, env);
      }

      const deletionLogMatch = url.pathname.match(/^\/api\/admin\/deletion-log\/([^/]+)(?:\/([^/]+))?$/);
      if (deletionLogMatch) {
        const [, id, action] = deletionLogMatch;
        if (!action) return withCors(await requireMethod(request, "GET", () => deletionLogDetail(request, env, id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreFromDeletionLog(request, env, id)), request, env);
        return withCors(notFound(), request, env);
      }

      const adminRequestMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)(?:\/([^/]+))?$/);
      if (adminRequestMatch) {
        const [, id, action] = adminRequestMatch;
        if (!action) return withCors(await requireMethod(request, "GET", () => adminRequestDetail(request, env, id)), request, env);
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "request", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "request", id)), request, env);
        if (action === "create-docket") return withCors(await requireMethod(request, "POST", () => createDocketFromRequest(request, env, id)), request, env);
        if (action === "status") return withCors(await requireMethod(request, "PATCH", () => updateRequestStatus(request, env, id)), request, env);
        if (action === "assign") return withCors(await requireMethod(request, "PATCH", () => assignRequest(request, env, id)), request, env);
        if (action === "create-discord-channel") return withCors(await requireMethod(request, "POST", () => createDiscordChannelRoute(request, env, id)), request, env);
        if (action === "post-to-discord-ticket") return withCors(await requireMethod(request, "POST", () => postDiscordTicketRoute(request, env, id)), request, env);
        if (action === "close-ticket") return withCors(await requireMethod(request, "POST", () => closeDiscordTicketRoute(request, env, id)), request, env);
        if (action === "events") {
          if (request.method === "GET") return withCors(await getAdminRequestEvents(request, env, id), request, env);
          if (request.method === "POST") return withCors(await addAdminRequestEvent(request, env, id), request, env);
        }
        return withCors(notFound(), request, env);
      }

      const publicRequestMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
      if (publicRequestMatch && publicRequestMatch[1] !== "mine") {
        return withCors(await requireMethod(request, "GET", () => publicRequestDetail(request, env, publicRequestMatch[1])), request, env);
      }

      const adminDocketMatch = url.pathname.match(/^\/api\/admin\/dockets?\/([^/]+)(?:\/([^/]+))?$/);
      if (adminDocketMatch) {
        const [, id, action] = adminDocketMatch;
        if (!action) {
          if (request.method === "GET") return withCors(await adminDocketDetail(request, env, id), request, env);
          if (request.method === "PATCH") return withCors(await updateDocket(request, env, id), request, env);
        }
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "docket", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "docket", id)), request, env);
        if (action === "publish") return withCors(await requireMethod(request, "POST", () => publishDocket(request, env, id)), request, env);
        if (action === "unpublish") return withCors(await requireMethod(request, "POST", () => unpublishDocket(request, env, id)), request, env);
        if (action === "archive") return withCors(await requireMethod(request, "POST", () => archiveDocket(request, env, id)), request, env);
        if (action === "close") return withCors(await requireMethod(request, "POST", () => closeDocket(request, env, id)), request, env);
        if (action === "post-to-discord") return withCors(await requireMethod(request, "POST", () => postDocketToDiscord(request, env, id)), request, env);
        if (action === "events") {
          if (request.method === "GET") return withCors(await getDocketEvents(request, env, id), request, env);
          if (request.method === "POST") return withCors(await addDocketEventNote(request, env, id), request, env);
        }
        return withCors(notFound(), request, env);
      }

      const publicLawyerMatch = url.pathname.match(/^\/api\/lawyers\/([^/]+)$/);
      if (publicLawyerMatch) {
        return withCors(await requireMethod(request, "GET", () => publicLawyerDetail(env, publicLawyerMatch[1])), request, env);
      }

      const publicDocketMatch = url.pathname.match(/^\/api\/docket\/([^/]+)$/);
      if (publicDocketMatch) {
        return withCors(await requireMethod(request, "GET", () => publicDocketDetail(request, env, publicDocketMatch[1])), request, env);
      }

      const adminJudicialRecordMatch = url.pathname.match(/^\/api\/admin\/judicial-records\/([^/]+)(?:\/([^/]+))?$/);
      if (adminJudicialRecordMatch) {
        const [, id, action] = adminJudicialRecordMatch;
        if (!action) {
          if (request.method === "GET") return withCors(await adminJudicialRecordDetail(request, env, id), request, env);
          if (request.method === "PATCH") return withCors(await updateJudicialRecord(request, env, id), request, env);
        }
        if (action === "publish") return withCors(await requireMethod(request, "POST", () => publishJudicialRecord(request, env, id)), request, env);
        if (action === "archive") return withCors(await requireMethod(request, "POST", () => archiveJudicialRecord(request, env, id)), request, env);
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => deleteJudicialRecord(request, env, id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreJudicialRecord(request, env, id)), request, env);
        return withCors(notFound(), request, env);
      }

      const publicJudicialRecordMatch = url.pathname.match(/^\/api\/judicial-records\/([^/]+)$/);
      if (publicJudicialRecordMatch) {
        return withCors(await requireMethod(request, "GET", () => judicialRecordDetail(request, env, publicJudicialRecordMatch[1])), request, env);
      }

      const adminBarExamMatch = url.pathname.match(/^\/api\/admin\/bar-exam\/attempts\/([^/]+)(?:\/([^/]+))?$/);
      if (adminBarExamMatch) {
        const [, id, action] = adminBarExamMatch;
        if (!action) return withCors(await requireMethod(request, "GET", () => adminBarExamAttemptDetail(request, env, id)), request, env);
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "bar_exam_attempt", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "bar_exam_attempt", id)), request, env);
        if (action === "score") return withCors(await requireMethod(request, "PATCH", () => scoreBarExamAttempt(request, env, id)), request, env);
        if (action === "create-followup-channel") return withCors(await requireMethod(request, "POST", () => createFollowupChannelRoute(request, env, id)), request, env);
        if (action === "events") {
          if (request.method === "GET") return withCors(await getBarExamEvents(request, env, id), request, env);
          if (request.method === "POST") return withCors(await addBarExamEventNote(request, env, id), request, env);
        }
        if (["mark-under-review", "pass", "fail", "refer", "void", "reopen"].includes(action)) {
          return withCors(await requireMethod(request, "POST", () => markBarExamAttempt(request, env, id, action)), request, env);
        }
        return withCors(notFound(), request, env);
      }

      const adminBarExamVersionMatch = url.pathname.match(/^\/api\/admin\/bar-exam\/versions\/([^/]+)\/(activate|deactivate|delete|restore)$/);
      if (adminBarExamVersionMatch) {
        const [, id, action] = adminBarExamVersionMatch;
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "bar_exam_version", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "bar_exam_version", id)), request, env);
        return withCors(await requireMethod(request, "POST", () => updateBarExamVersionPublication(request, env, id, action === "activate")), request, env);
      }

      const adminResourceMatch = url.pathname.match(/^\/api\/admin\/resources\/([^/]+)(?:\/([^/]+))?$/);
      if (adminResourceMatch) {
        const [, id, action] = adminResourceMatch;
        if (!action) {
          if (request.method === "GET") return withCors(await adminResourceDetail(request, env, id), request, env);
          if (request.method === "PATCH") return withCors(await updateResource(request, env, id), request, env);
        }
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "resource", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "resource", id)), request, env);
        if (action === "publish") return withCors(await requireMethod(request, "POST", () => setResourcePublication(request, env, id, true)), request, env);
        if (action === "unpublish") return withCors(await requireMethod(request, "POST", () => setResourcePublication(request, env, id, false)), request, env);
        if (action === "archive") return withCors(await requireMethod(request, "POST", () => setResourcePublication(request, env, id, false, "RESOURCE_ARCHIVED")), request, env);
        return withCors(notFound(), request, env);
      }

      if (url.pathname === "/api/admin/faq/import") {
        return withCors(await requireMethod(request, "POST", () => faqImportGuidance(request, env)), request, env);
      }

      const adminFaqMatch = url.pathname.match(/^\/api\/admin\/faq\/([^/]+)(?:\/([^/]+))?$/);
      if (adminFaqMatch) {
        const [, id, action] = adminFaqMatch;
        if (!action) {
          if (request.method === "GET") return withCors(await adminFaqDetail(request, env, id), request, env);
          if (request.method === "PATCH") return withCors(await updateFaq(request, env, id), request, env);
        }
        if (action === "delete") return withCors(await requireMethod(request, "POST", () => softDeleteEntityRoute(request, env, "faq", id)), request, env);
        if (action === "restore") return withCors(await requireMethod(request, "POST", () => restoreEntityRoute(request, env, "faq", id)), request, env);
        if (action === "publish") return withCors(await requireMethod(request, "POST", () => setFaqPublication(request, env, id, true)), request, env);
        if (action === "unpublish") return withCors(await requireMethod(request, "POST", () => setFaqPublication(request, env, id, false)), request, env);
        if (action === "archive") return withCors(await requireMethod(request, "POST", () => setFaqPublication(request, env, id, false, "FAQ_ARCHIVED")), request, env);
        return withCors(notFound(), request, env);
      }

      const response = await routeRequest(request, env, url);
      return withCors(response, request, env);
    } catch (cause) {
      if (cause instanceof AuthRequiredError || (cause instanceof Error && cause.name === "AuthRequiredError")) {
        return withCors(errorJson("AUTH_REQUIRED", "Authentication is required.", 401), request, env);
      }
      if (cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")) {
        const reason = cause instanceof PermissionError ? cause.permission : cause.message;
        await audit(env, "AUTH_FORBIDDEN", { route: url.pathname, reason });
        return withCors(errorJson("FORBIDDEN", "You do not have permission to access this DOJ Portal resource.", 403), request, env);
      }
      console.error(JSON.stringify({ event: "api_error", path: url.pathname, cause: String(cause) }));
      return withCors(
        errorJson(
          "API_ERROR",
          "The DOJ Portal API could not complete the request. Check the request details and server logs for the specific production error.",
          500
        ),
        request,
        env
      );
    }
  }
};

async function routeRequest(request: Request, env: Env, url: URL): Promise<Response> {
  switch (url.pathname) {
    case "/api/health":
      return json({
        ok: true,
        service: "miami-stories-doj-api",
        stage: "stage-5-native-bar-exam",
        hasD1Binding: Boolean(env.DB)
      });
    case "/api/auth/discord/start":
    case "/api/auth/discord/login":
      return await requireMethod(request, "GET", () => startDiscordAuth(request, env));
    case "/api/auth/discord/callback":
      return await requireMethod(request, "GET", () => completeDiscordAuth(request, env));
    case "/api/auth/session-bootstrap":
      return await requireMethod(request, "POST", () => bootstrapSession(request, env));
    case "/api/auth/logout":
      return await requireMethod(request, "POST", () => logout(request, env));
    case "/api/auth/refresh-roles":
      return await requireMethod(request, "POST", () => refreshOwnRoles(request, env));
    case "/api/resources":
      return listResponse<ResourceDocument>(await listResources(env.DB), resourceDocumentsSeed);
    case "/api/faq":
      return listResponse<FaqEntry>(await listFaq(env.DB), faqSeed);
    case "/api/docket":
      return await requireMethod(request, "GET", () => listPublicDocket(request, env));
    case "/api/judicial-records":
      return await requireMethod(request, "GET", () => listJudicialRecords(request, env));
    case "/api/lawyers":
      return listResponse<AttorneyProfile>(await listLawyers(env.DB), attorneyProfilesSeed);
    case "/api/me":
      return await requireMethod(request, "GET", () => me(request, env));
    case "/api/requests":
      return await requireMethod(request, "POST", () => createRequest(request, env));
    case "/api/requests/mine":
      return await requireMethod(request, "GET", () => myRequests(request, env));
    case "/api/bar-exam/status":
      return await requireMethod(request, "GET", () => barExamStatus(request, env));
    case "/api/bar-exam/resources":
      return await requireMethod(request, "GET", () => barExamResources(request, env));
    case "/api/bar-exam/start":
      return await requireMethod(request, "POST", () => startBarExam(request, env));
    case "/api/bar-exam/attempt":
      return await requireMethod(request, "GET", () => getCandidateAttempt(request, env));
    case "/api/bar-exam/attempt/draft":
      return await requireMethod(request, "PATCH", () => saveBarExamDraft(request, env));
    case "/api/bar-exam/attempt/submit":
      return await requireMethod(request, "POST", () => submitBarExam(request, env));
    case "/api/admin/requests":
      return await requireMethod(request, "GET", () => adminRequests(request, env));
    case "/api/admin/requests/eligible-judges":
      return await requireMethod(request, "GET", () => eligibleJudgesRoute(request, env));
    case "/api/admin/deletion-log":
      return await requireMethod(request, "GET", () => listDeletionLog(request, env));
    case "/api/admin/discord/diagnostics":
      return await requireMethod(request, "GET", () => discordDiagnosticsRoute(request, env));
    case "/api/admin/docket":
    case "/api/admin/dockets":
      if (request.method === "GET") return await adminDocketList(request, env);
      if (request.method === "POST") return await createDocket(request, env);
      return errorJson("METHOD_NOT_ALLOWED", "Use GET or POST for this route.", 405);
    case "/api/admin/judicial-records":
      if (request.method === "GET") return await adminJudicialRecords(request, env);
      if (request.method === "POST") return await createJudicialRecord(request, env);
      return errorJson("METHOD_NOT_ALLOWED", "Use GET or POST for this route.", 405);
    case "/api/admin/judicial-history/search":
      return await requireMethod(request, "GET", () => judicialHistorySearch(request, env));
    case "/api/admin/resources":
      if (request.method === "GET") return await adminResources(request, env);
      if (request.method === "POST") return await createResource(request, env);
      return errorJson("METHOD_NOT_ALLOWED", "Use GET or POST for this route.", 405);
    case "/api/admin/faq":
      if (request.method === "GET") return await adminFaq(request, env);
      if (request.method === "POST") return await createFaq(request, env);
      return errorJson("METHOD_NOT_ALLOWED", "Use GET or POST for this route.", 405);
    case "/api/admin/bar":
      return await requireMethod(request, "GET", () => adminBarSummary(request, env));
    case "/api/admin/bar-exam/attempts":
      return await requireMethod(request, "GET", () => adminBarExamAttempts(request, env));
    case "/api/admin/bar-exam/versions":
      return await requireMethod(request, "GET", () => adminBarExamVersions(request, env));
    case "/api/admin/bar-exam/versions/seed":
      return await requireMethod(request, "POST", () => seedBarExamVersions(request, env));
    case "/api/admin/session-debug":
      return await requireMethod(request, "GET", () => sessionDebug(request, env));
    case "/api/admin/audit-logs":
      return await requireMethod(request, "GET", () => auditLogs(request, env));
    case "/api/dev/seed":
      return await requireMethod(request, "POST", () => devSeed(request, env));
    default:
      return notFound();
  }
}

function corsPreflight(request: Request, env: Env): Response {
  const headers = new Headers();
  const origin = allowedCorsOrigin(request, env);
  if (origin) {
    applyCorsHeaders(headers, origin);
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(null, { status: 204, headers });
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = allowedCorsOrigin(request, env);
  if (!origin) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  appendVaryOrigin(response.headers);
  return response;
}

function applyCorsHeaders(headers: Headers, origin: string) {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  appendVaryOrigin(headers);
}

function allowedCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return allowedOrigins(env).has(origin) ? origin : null;
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    [
      originFromUrl(env.PUBLIC_APP_URL),
      originFromUrl(env.WORKER_APP_URL),
      ...PRODUCTION_FRONTEND_ORIGINS,
      "http://localhost:5173",
      "http://localhost:8787"
    ].filter((origin): origin is string => Boolean(origin))
  );
}

function originFromUrl(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function appendVaryOrigin(headers: Headers) {
  const vary = headers.get("Vary");
  if (!vary) {
    headers.set("Vary", "Origin");
    return;
  }
  const values = vary.split(",").map((value) => value.trim().toLowerCase());
  if (!values.includes("origin")) {
    headers.set("Vary", `${vary}, Origin`);
  }
}

async function requireMethod(request: Request, method: string, handler: () => Promise<Response>): Promise<Response> {
  if (request.method !== method) return errorJson("METHOD_NOT_ALLOWED", `Use ${method} for this route.`, 405);
  return handler();
}

function listResponse<T>(rows: T[] | null, seed: T[]): Response {
  const payload: ApiListResponse<T> = rows ? { data: rows, source: "d1" } : { data: seed, source: "seed" };
  return json(payload);
}

async function publicLawyerDetail(env: Env, slug: string): Promise<Response> {
  const profile = await getLawyerBySlug(env.DB, slug);
  if (profile) return json({ data: profile, source: "d1" });
  const fallback = attorneyProfilesSeed.find((entry) => entry.profileSlug === slug || entry.id === slug);
  if (!fallback) return errorJson("NOT_FOUND", "Registry profile not found.", 404);
  return json({ data: fallback, source: "seed" });
}

async function sessionDebug(request: Request, env: Env): Promise<Response> {
  const ctx = requireAnyPermission(await requireAuth(request, env), ["VIEW_DASHBOARD", "ADMIN"]);
  return json({
    authenticated: true,
    user: ctx.user,
    roleCount: ctx.roles.length,
    permissions: ctx.permissions,
    actionPermissions: ctx.actionPermissions,
    isBootstrapAdmin: ctx.isBootstrapAdmin
  });
}

async function auditLogs(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "VIEW_AUDIT_LOGS");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for audit log access.", 503);
  const result = await env.DB.prepare(
    "SELECT id, actor_user_id as actorUserId, action, target_type as targetType, target_id as targetId, metadata_json as metadataJson, created_at as createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 50"
  ).all();
  return json({ data: result.results, viewer: ctx.user.id });
}

async function devSeed(request: Request, env: Env): Promise<Response> {
  const isLocal = (env.WORKER_APP_URL ?? "").includes("localhost") || new URL(request.url).hostname === "127.0.0.1";
  if (!isLocal) {
    const ctx = requirePermission(await requireAuth(request, env), "ADMIN");
    await audit(env, "DEV_SEED_ATTEMPT", { route: "/api/dev/seed" }, ctx.user.id);
  }
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for seeding.", 503);
  const result = await seedFoundationData(env.DB);
  return json({ ok: true, result });
}
