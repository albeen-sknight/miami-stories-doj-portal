/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Docket API and Publication Workflow
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type {
  CreateDocketInput,
  DiscordSyncStatus,
  DocketCaseType,
  DocketDetail,
  DocketProceedingType,
  DocketStatus
} from "@shotta-doj/shared";
import { DOCKET_CASE_TYPES, DOCKET_PROCEEDING_TYPES, DOCKET_STATUSES } from "@shotta-doj/shared";
import { audit } from "./audit";
import { requireAuth } from "./auth";
import { CASE_TYPE_PREFIX, DEFAULT_DOCKET_TIMEZONE, docketSuggestionFromRequest } from "./docketDefinitions";
import { postOrUpdateDocketEmbed } from "./docketDiscord";
import { buildSchedule, generateDocketText } from "./docketText";
import { errorJson, json } from "./http";
import { hasActionPermission, requireAnyPermission, requirePermission } from "./permissions";
import { addServiceRequestEvent, getServiceRequestDetail, portalUserIdForDiscordId, resolveEligibleJudge } from "./serviceRequests";
import type { AuthContext, Env } from "./types";

const JSON_LIMIT = 20_000;

export async function listPublicDocket(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for docket access.", 503);
  const url = new URL(request.url);
  const { where, params } = publicFilters(url);
  const result = await env.DB.prepare(`${selectDocket()} ${where} ORDER BY de.published_at DESC, de.updated_at DESC LIMIT 100`)
    .bind(...params)
    .all<DocketRow>();
  return json({ data: result.results.map((row) => rowToSummary(row)), source: "d1" });
}

export async function publicDocketDetail(request: Request, env: Env, id: string): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for docket access.", 503);
  const row = await loadDocketRow(env, id);
  if (!row) return errorJson("NOT_FOUND", "Docket entry not found.", 404);
  if (row.deletedAt) {
    const auth = await optionalAuth(request, env);
    if (!auth || !canManageDocket(auth)) return errorJson("NOT_FOUND", "Docket entry not found.", 404);
  }
  if (!row.isPublic && row.visibility !== "PUBLIC") {
    const auth = await optionalAuth(request, env);
    if (!auth || !canManageDocket(auth)) {
      await audit(env, "DOCKET_VIEW_FORBIDDEN", { docket_id: id, route: new URL(request.url).pathname }, auth?.user.id ?? null);
      return errorJson("NOT_FOUND", "Docket entry not found.", 404);
    }
  }
  return json({ data: rowToDetail(row, Boolean(row.isPublic || row.visibility === "PUBLIC") ? "public" : "staff") });
}

export async function adminDocketList(request: Request, env: Env): Promise<Response> {
  requireDocketManager(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for docket access.", 503);
  const url = new URL(request.url);
  const filters: string[] = ["de.deleted_at IS NULL"];
  const params: string[] = [];
  for (const [key, column] of [
    ["status", "de.status"],
    ["caseType", "de.case_type"],
    ["proceedingType", "de.proceeding_type"]
  ] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      filters.push(`${column} = ?`);
      params.push(normalizeDocketFilterValue(key, value));
    }
  }
  const search = url.searchParams.get("q");
  if (search) {
    filters.push("(de.docket_number LIKE ? OR de.title LIKE ? OR de.plaintiff LIKE ? OR de.defendant LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(`${selectDocket()} ${where} ORDER BY de.updated_at DESC LIMIT 150`).bind(...params).all<DocketRow>();
  return json({ data: result.results.map((row) => rowToSummary(row)) });
}

export async function adminDocketDetail(request: Request, env: Env, id: string): Promise<Response> {
  requireDocketManager(await requireAuth(request, env));
  const row = await loadDocketRow(env, id);
  if (!row) return errorJson("NOT_FOUND", "Docket entry not found.", 404);
  return json({ data: { ...rowToDetail(row, "staff"), events: await docketEvents(env, id) } });
}

export async function createDocket(request: Request, env: Env): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for docket creation.", 503);
  const input = (await request.json()) as CreateDocketInput;
  const prepared = await prepareDocketInputOrError(env, ctx, "create_docket", input, null);
  if (prepared instanceof Response) return prepared;
  if (!prepared.ok) return docketValidationError(prepared, ctx, "create_docket", input);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO docket_entries (
        id, docket_number, case_id, title, entry_type, case_type, proceeding_type, plaintiff, defendant,
        individuals_involved_json, judge_user_id, judge_name, status, filed_on, scheduled_for, scheduled_timezone,
        scheduled_discord_timestamp, scheduled_discord_relative, summary, summary_markdown, public_notes_markdown,
        private_notes_markdown, linked_service_request_id, linked_private_ticket_channel_id, linked_petition_url,
        discord_sync_status, is_public, is_archived, visibility, published_at, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_POSTED', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        prepared.value.docketNumber,
        prepared.value.docketNumber,
        prepared.value.title,
        prepared.value.caseType,
        prepared.value.caseType,
        prepared.value.proceedingType,
        prepared.value.plaintiff,
        prepared.value.defendant,
        JSON.stringify(prepared.value.individualsInvolved),
        prepared.value.judgeUserId,
        prepared.value.judgeName,
        prepared.value.status,
        prepared.value.filedOn,
        prepared.value.schedule.scheduledFor,
        prepared.value.schedule.timezone,
        prepared.value.schedule.discordTimestamp,
        prepared.value.schedule.discordRelative,
        prepared.value.summaryMarkdown,
        prepared.value.summaryMarkdown,
        prepared.value.publicNotesMarkdown,
        prepared.value.privateNotesMarkdown,
        prepared.value.linkedServiceRequestId,
        prepared.value.linkedPrivateTicketChannelId,
        prepared.value.linkedPetitionUrl,
        prepared.value.isPublic ? 1 : 0,
        prepared.value.isArchived ? 1 : 0,
        prepared.value.isPublic ? "PUBLIC" : "PRIVATE",
        prepared.value.isPublic ? now : null,
        now,
        now,
        "{}"
      )
      .run();
  } catch (cause) {
    return docketOperationError(ctx, "create_docket", input, cause);
  }
  try {
    await addDocketEvent(env, id, ctx.user.id, "DOCKET_CREATED", "Docket entry created.", { docket_number: prepared.value.docketNumber });
    await audit(env, "DOCKET_CREATED", { docket_id: id, docket_number: prepared.value.docketNumber }, ctx.user.id);
    if (prepared.value.linkedServiceRequestId) await recordRequestLink(env, ctx, id, prepared.value.linkedServiceRequestId);
  } catch (cause) {
    return docketOperationError(ctx, "create_docket_post_write", input, cause);
  }
  return json({ data: await loadDocketDetail(env, id) }, { status: 201 });
}

export async function updateDocket(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  const existing = await loadDocketRow(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Docket entry not found.", 404);
  const input = (await request.json()) as CreateDocketInput;
  const prepared = await prepareDocketInputOrError(env, ctx, "update_docket", input, id);
  if (prepared instanceof Response) return prepared;
  if (!prepared.ok) return docketValidationError(prepared, ctx, "update_docket", input);
  try {
    await env.DB!.prepare(
      `UPDATE docket_entries SET docket_number = ?, case_id = ?, title = ?, entry_type = ?, case_type = ?, proceeding_type = ?,
        plaintiff = ?, defendant = ?, individuals_involved_json = ?, judge_user_id = ?, judge_name = ?, status = ?,
        filed_on = ?, scheduled_for = ?, scheduled_timezone = ?, scheduled_discord_timestamp = ?, scheduled_discord_relative = ?,
        summary = ?, summary_markdown = ?, public_notes_markdown = ?, private_notes_markdown = ?, linked_service_request_id = ?,
        linked_private_ticket_channel_id = ?, linked_petition_url = ?, is_public = ?, is_archived = ?, visibility = ?,
        published_at = CASE WHEN ? = 1 AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(
        prepared.value.docketNumber,
        prepared.value.docketNumber,
        prepared.value.title,
        prepared.value.caseType,
        prepared.value.caseType,
        prepared.value.proceedingType,
        prepared.value.plaintiff,
        prepared.value.defendant,
        JSON.stringify(prepared.value.individualsInvolved),
        prepared.value.judgeUserId,
        prepared.value.judgeName,
        prepared.value.status,
        prepared.value.filedOn,
        prepared.value.schedule.scheduledFor,
        prepared.value.schedule.timezone,
        prepared.value.schedule.discordTimestamp,
        prepared.value.schedule.discordRelative,
        prepared.value.summaryMarkdown,
        prepared.value.summaryMarkdown,
        prepared.value.publicNotesMarkdown,
        prepared.value.privateNotesMarkdown,
        prepared.value.linkedServiceRequestId,
        prepared.value.linkedPrivateTicketChannelId,
        prepared.value.linkedPetitionUrl,
        prepared.value.isPublic ? 1 : 0,
        prepared.value.isArchived ? 1 : 0,
        prepared.value.isPublic ? "PUBLIC" : "PRIVATE",
        prepared.value.isPublic ? 1 : 0,
        id
      )
      .run();
  } catch (cause) {
    return docketOperationError(ctx, "update_docket", input, cause);
  }
  try {
    await addDocketEvent(env, id, ctx.user.id, "DOCKET_UPDATED", "Docket entry updated.", {});
    await audit(env, "DOCKET_UPDATED", { docket_id: id }, ctx.user.id);
  } catch (cause) {
    return docketOperationError(ctx, "update_docket_post_write", input, cause);
  }
  return json({ data: await loadDocketDetail(env, id) });
}

export async function publishDocket(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "PUBLISH_DOCKET");
  try {
    await env.DB!.prepare("UPDATE docket_entries SET is_public = 1, visibility = 'PUBLIC', published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .run();
    await addDocketEvent(env, id, ctx.user.id, "DOCKET_PUBLISHED", "Docket entry published to the public docket.", {});
    await audit(env, "DOCKET_PUBLISHED", { docket_id: id }, ctx.user.id);
  } catch (cause) {
    return docketOperationError(ctx, "publish_docket", { title: id, caseType: "OTHER", proceedingType: "OTHER" } as CreateDocketInput, cause);
  }
  return json({ data: await loadDocketDetail(env, id) });
}

export async function unpublishDocket(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "PUBLISH_DOCKET");
  await env.DB!.prepare("UPDATE docket_entries SET is_public = 0, visibility = 'PRIVATE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await addDocketEvent(env, id, ctx.user.id, "DOCKET_UNPUBLISHED", "Docket entry removed from the public docket.", {});
  await audit(env, "DOCKET_UNPUBLISHED", { docket_id: id }, ctx.user.id);
  return json({ data: await loadDocketDetail(env, id) });
}

export async function archiveDocket(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  await env.DB!.prepare("UPDATE docket_entries SET is_archived = 1, status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await addDocketEvent(env, id, ctx.user.id, "DOCKET_ARCHIVED", "Docket entry archived.", {});
  await audit(env, "DOCKET_ARCHIVED", { docket_id: id }, ctx.user.id);
  return json({ data: await loadDocketDetail(env, id) });
}

export async function closeDocket(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  await env.DB!.prepare("UPDATE docket_entries SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await addDocketEvent(env, id, ctx.user.id, "DOCKET_CLOSED", "Docket entry closed.", {});
  await audit(env, "DOCKET_CLOSED", { docket_id: id }, ctx.user.id);
  return json({ data: await loadDocketDetail(env, id) });
}

export async function postDocketToDiscord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "PUBLISH_DOCKET");
  const body = (await safeJson(request)) as { repost?: boolean };
  const docket = await loadDocketDetail(env, id);
  if (!docket) return errorJson("NOT_FOUND", "Docket entry not found.", 404);
  if (!docket.isPublic) return errorJson("VALIDATION_ERROR", "Publish this docket entry before posting it to Discord.", 400);
  if (body.repost !== true && docket.discordMessageId && docket.discordSyncStatus === "FAILED") {
    return errorJson("REPOST_REQUIRED", "The previous Discord update failed. Retry update or explicitly repost as a new message.", 409);
  }
  try {
    const result = await postOrUpdateDocketEmbed(env, docket, { repost: body.repost, judgeFallback: ctx.user.displayName });
    const now = new Date().toISOString();
    const eventType = result.action === "UPDATED" ? "DOCKET_DISCORD_UPDATED" : result.action === "REPOSTED" ? "DOCKET_DISCORD_REPOSTED" : "DOCKET_DISCORD_POSTED";
    await env.DB!.prepare(
      `UPDATE docket_entries SET discord_channel_id = ?, discord_message_id = ?,
        discord_posted_at = COALESCE(discord_posted_at, ?), discord_updated_at = ?,
        discord_sync_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(result.channelId, result.messageId, now, result.action === "POSTED" ? null : now, result.action === "UPDATED" ? "UPDATED" : "POSTED", id)
      .run();
    await addDocketEvent(env, id, ctx.user.id, eventType, "Public docket embed synced to Discord.", { action: result.action });
    await audit(env, eventType, { docket_id: id, discord_channel_id: result.channelId, discord_message_id: result.messageId }, ctx.user.id);
  } catch (cause) {
    const existingMessage = Boolean(docket.discordMessageId);
    const syncStatus = existingMessage ? "REPOST_REQUIRED" : "FAILED";
    await env.DB!.prepare("UPDATE docket_entries SET discord_sync_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(syncStatus, id)
      .run();
    const eventType = existingMessage ? "DOCKET_DISCORD_UPDATE_FAILED" : "DOCKET_DISCORD_POST_FAILED";
    const reasonStr = safeError(cause);
    await addDocketEvent(env, id, ctx.user.id, eventType, "Discord docket sync failed. Staff may retry from the dashboard.", { reason: reasonStr });
    await audit(env, eventType, { docket_id: id, reason: reasonStr }, ctx.user.id);
    return errorJson("DISCORD_SYNC_FAILED", reasonStr, 500);
  }
  return json({ data: await loadDocketDetail(env, id) });
}

export async function getDocketEvents(request: Request, env: Env, id: string): Promise<Response> {
  requireDocketManager(await requireAuth(request, env));
  return json({ data: await docketEvents(env, id) });
}

export async function addDocketEventNote(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  const body = (await request.json()) as { message?: string };
  const message = clean(body.message);
  if (!message) return errorJson("VALIDATION_ERROR", "Message is required.", 400);
  await addDocketEvent(env, id, ctx.user.id, "DOCKET_NOTE", message, {});
  return json({ data: await docketEvents(env, id) }, { status: 201 });
}

export async function createDocketFromRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const ctx = requireDocketManager(await requireAuth(request, env));
  const detail = await getServiceRequestDetail(env, requestId);
  if (!detail) return errorJson("NOT_FOUND", "Service request not found.", 404);
  const suggestion = docketSuggestionFromRequest(detail);
  const response = await createDocket(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...suggestion, status: "DRAFT", isPublic: false })
    }),
    env
  );
  if (response.ok) {
    await addServiceRequestEvent(env, requestId, ctx.user.id, "DOCKET_CREATED_FROM_REQUEST", "A docket entry was created from this service request.", {});
    await env.DB!.prepare("UPDATE service_requests SET status = CASE WHEN status = 'SUBMITTED' THEN 'UNDER_REVIEW' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(requestId)
      .run();
  }
  return response;
}

async function prepareInput(env: Env, input: CreateDocketInput, existingId: string | null): Promise<{ ok: true; value: PreparedDocketInput } | DocketValidationFailure> {
  const title = clean(input.title);
  if (!title) return { ok: false as const, message: "Title is required.", field: "title" };
  const caseType = normalizeCaseTypeInput(input.caseType);
  const proceedingType = normalizeProceedingTypeInput(input.proceedingType);
  if (!caseType) return { ok: false as const, message: "Invalid case type.", field: "caseType", details: input.caseType };
  if (!proceedingType) return { ok: false as const, message: "Invalid proceeding type.", field: "proceedingType", details: input.proceedingType };
  const status = input.status && DOCKET_STATUSES.includes(input.status) ? input.status : "DRAFT";
  const docketNumber = clean(input.docketNumber) || (await nextDocketNumber(env, caseType));
  const duplicate = await env.DB!.prepare("SELECT id FROM docket_entries WHERE docket_number = ? AND id != ?").bind(docketNumber, existingId ?? "").first<{ id: string }>();
  if (duplicate) return { ok: false as const, message: "Docket number is already in use.", field: "docketNumber", details: docketNumber };
  const serialized = JSON.stringify(input);
  if (serialized.length > JSON_LIMIT) return { ok: false as const, message: "Docket entry is too large.", field: "payload" };
  if (/<[^>]+>/.test(serialized)) return { ok: false as const, message: "HTML is not allowed in docket fields.", field: "payload" };
  const linkedServiceRequestInput = clean(input.linkedServiceRequestId);
  const linkedServiceRequest = await resolveServiceRequestReference(env, linkedServiceRequestInput);
  if (!linkedServiceRequest.ok) return linkedServiceRequest;
  const linkedPetitionUrl = clean(input.linkedPetitionUrl);
  if (linkedPetitionUrl && !isValidHttpUrl(linkedPetitionUrl)) {
    return { ok: false as const, message: "Linked petition URL must be a valid http(s) URL.", field: "linkedPetitionUrl" };
  }
  const linkedPrivateTicketChannelId = clean(input.linkedPrivateTicketChannelId);
  if (linkedPrivateTicketChannelId && !validDiscordId(linkedPrivateTicketChannelId)) {
    return { ok: false as const, message: "Private ticket channel must be a Discord channel ID.", field: "linkedPrivateTicketChannelId", details: linkedPrivateTicketChannelId };
  }
  let judgeUserId = clean(input.judgeUserId);
  let judgeName = clean(input.judgeName);
  if (judgeUserId) {
    const judgeDiscordId = validDiscordId(judgeUserId) ? judgeUserId : await discordIdForPortalUserId(env, judgeUserId);
    if (!judgeDiscordId) return { ok: false as const, message: "Selected judge is not currently eligible.", field: "judgeUserId", details: judgeUserId };
    const judge = await resolveEligibleJudge(env, judgeDiscordId);
    if (!judge) return { ok: false as const, message: "Selected judge is not currently eligible.", field: "judgeUserId", details: judgeUserId };
    judgeUserId = judge.portalUserId ?? await portalUserIdForDiscordId(env, judge.discordUserId);
    judgeName = judge.displayName;
  }
  return {
    ok: true as const,
    value: {
      docketNumber,
      title,
      caseType,
      proceedingType,
      status,
      plaintiff: clean(input.plaintiff),
      defendant: clean(input.defendant),
      individualsInvolved: (input.individualsInvolved ?? []).map(clean).filter((value): value is string => Boolean(value)).slice(0, 20),
      judgeUserId,
      judgeName,
      filedOn: clean(input.filedOn) || new Date().toISOString().slice(0, 10),
      schedule: buildSchedule(input.scheduledLocalDate, input.scheduledLocalTime, clean(input.scheduledTimezone) || DEFAULT_DOCKET_TIMEZONE),
      summaryMarkdown: clean(input.summaryMarkdown) || "Summary restricted until further order of the Court.",
      publicNotesMarkdown: clean(input.publicNotesMarkdown),
      privateNotesMarkdown: clean(input.privateNotesMarkdown),
      linkedServiceRequestId: linkedServiceRequest.id,
      linkedPrivateTicketChannelId,
      linkedPetitionUrl,
      isPublic: Boolean(input.isPublic),
      isArchived: Boolean(input.isArchived)
    }
  };
}

async function prepareDocketInputOrError(
  env: Env,
  ctx: AuthContext,
  action: string,
  input: CreateDocketInput,
  existingId: string | null
): Promise<{ ok: true; value: PreparedDocketInput } | DocketValidationFailure | Response> {
  try {
    return await prepareInput(env, input, existingId);
  } catch (cause) {
    return docketOperationError(ctx, `${action}_prepare`, input, cause);
  }
}

function docketValidationError(failure: DocketValidationFailure, ctx: AuthContext, action: string, input: CreateDocketInput): Response {
  console.warn(JSON.stringify({
    event: "docket_validation_failed",
    action,
    userId: ctx.user.id,
    field: failure.field ?? null,
    details: failure.details ?? null,
    payloadShape: docketPayloadShape(input)
  }));
  return json({
    error: failure.message,
    field: failure.field ?? null,
    details: failure.details ?? null,
    fieldErrors: failure.field ? { [failure.field]: failure.message } : {}
  }, { status: 400 });
}

function docketOperationError(ctx: AuthContext, action: string, input: CreateDocketInput, cause: unknown): Response {
  const reason = safeError(cause);
  console.error(JSON.stringify({
    event: "docket_operation_failed",
    action,
    userId: ctx.user.id,
    reason,
    payloadShape: docketPayloadShape(input)
  }));
  return errorJson("DOCKET_SAVE_FAILED", reason, 500);
}

function docketPayloadShape(input: CreateDocketInput): Record<string, unknown> {
  return {
    hasDocketNumber: Boolean(clean(input.docketNumber)),
    hasTitle: Boolean(clean(input.title)),
    caseType: input.caseType,
    proceedingType: input.proceedingType,
    status: input.status ?? null,
    hasJudgeUserId: Boolean(clean(input.judgeUserId)),
    hasJudgeName: Boolean(clean(input.judgeName)),
    scheduledLocalDate: clean(input.scheduledLocalDate),
    scheduledLocalTime: clean(input.scheduledLocalTime),
    scheduledTimezone: clean(input.scheduledTimezone),
    linkedServiceRequestBlank: !clean(input.linkedServiceRequestId),
    privateTicketChannelBlank: !clean(input.linkedPrivateTicketChannelId),
    internalUrlBlank: !clean(input.linkedPetitionUrl),
    hasLinkedServiceRequestId: Boolean(clean(input.linkedServiceRequestId)),
    hasLinkedPrivateTicketChannelId: Boolean(clean(input.linkedPrivateTicketChannelId)),
    linkedPrivateTicketChannelIdLooksValid: clean(input.linkedPrivateTicketChannelId) ? validDiscordId(clean(input.linkedPrivateTicketChannelId)) : null,
    hasLinkedPetitionUrl: Boolean(clean(input.linkedPetitionUrl)),
    isPublic: Boolean(input.isPublic),
    isArchived: Boolean(input.isArchived)
  };
}

async function resolveServiceRequestReference(env: Env, value: string | null): Promise<{ ok: true; id: string | null } | DocketValidationFailure> {
  if (!value) return { ok: true, id: null };
  const row = await env.DB!.prepare("SELECT id, request_number as requestNumber FROM service_requests WHERE id = ? OR request_number = ?")
    .bind(value, value)
    .first<{ id: string; requestNumber: string }>();
  if (!row) return { ok: false, message: "Linked service request not found", field: "linkedServiceRequest", details: value };
  return { ok: true, id: row.id };
}

async function nextDocketNumber(env: Env, caseType: DocketCaseType): Promise<string> {
  const prefix = CASE_TYPE_PREFIX[caseType] ?? "DKT";
  const year = new Date().getUTCFullYear();
  const row = await env.DB!.prepare(
    `INSERT INTO docket_number_counters (id, prefix, year, last_number, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(prefix, year) DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING last_number as lastNumber`
  )
    .bind(`${prefix}-${year}`, prefix, year)
    .first<{ lastNumber: number }>();
  if (!row) throw new Error("Could not generate docket number.");
  return `${prefix}-${year}-${String(row.lastNumber).padStart(4, "0")}`;
}

async function recordRequestLink(env: Env, ctx: AuthContext, docketId: string, requestId: string) {
  await addDocketEvent(env, docketId, ctx.user.id, "DOCKET_LINKED_TO_REQUEST", "Docket entry linked to a service request.", { request_id: requestId });
  await addServiceRequestEvent(env, requestId, ctx.user.id, "DOCKET_LINKED", "Service request linked to a docket entry.", { docket_id: docketId });
  await audit(env, "DOCKET_LINKED_TO_SERVICE_REQUEST", { docket_id: docketId, request_id: requestId }, ctx.user.id);
}

async function loadDocketDetail(env: Env, id: string): Promise<DocketDetail | null> {
  const row = await loadDocketRow(env, id);
  return row ? rowToDetail(row, "staff") : null;
}

async function loadDocketRow(env: Env, id: string): Promise<DocketRow | null> {
  if (!env.DB) return null;
  return env.DB.prepare(`${selectDocket()} WHERE de.id = ? OR de.docket_number = ?`).bind(id, id).first<DocketRow>();
}

function publicFilters(url: URL) {
  const filters = ["(de.is_public = 1 OR de.visibility = 'PUBLIC')", "de.is_archived = 0", "de.deleted_at IS NULL"];
  const params: string[] = [];
  for (const [key, column] of [
    ["status", "de.status"],
    ["caseType", "de.case_type"],
    ["proceedingType", "de.proceeding_type"],
    ["judge", "de.judge_name"]
  ] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      filters.push(`${column} LIKE ?`);
      params.push(`%${normalizeDocketFilterValue(key, value)}%`);
    }
  }
  const search = url.searchParams.get("q");
  if (search) {
    filters.push("(de.docket_number LIKE ? OR de.title LIKE ? OR de.plaintiff LIKE ? OR de.defendant LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  return { where: `WHERE ${filters.join(" AND ")}`, params };
}

function selectDocket(): string {
  return `SELECT de.id, de.docket_number as docketNumber, de.case_id as caseId, de.title, de.entry_type as entryType,
    de.case_type as caseType, de.proceeding_type as proceedingType, de.plaintiff, de.defendant,
    de.individuals_involved_json as individualsInvolvedJson, de.judge_user_id as judgeUserId, de.judge_name as judgeName,
    de.status, de.filed_on as filedOn, de.scheduled_for as scheduledFor, de.scheduled_timezone as scheduledTimezone,
    de.scheduled_discord_timestamp as scheduledDiscordTimestamp, de.scheduled_discord_relative as scheduledDiscordRelative,
    de.summary, de.summary_markdown as summaryMarkdown, de.public_notes_markdown as publicNotesMarkdown,
    de.private_notes_markdown as privateNotesMarkdown, de.linked_service_request_id as linkedServiceRequestId,
    sr.request_number as linkedRequestNumber, de.linked_private_ticket_channel_id as linkedPrivateTicketChannelId,
    de.linked_petition_url as linkedPetitionUrl, de.discord_message_id as discordMessageId, de.discord_channel_id as discordChannelId,
    de.discord_posted_at as discordPostedAt, de.discord_updated_at as discordUpdatedAt, de.discord_sync_status as discordSyncStatus,
    de.is_public as isPublic, de.is_archived as isArchived, de.visibility, de.published_at as publishedAt, de.closed_at as closedAt,
    de.deleted_at as deletedAt, de.deleted_by_user_id as deletedByUserId, de.deleted_by_display_name as deletedByDisplayName,
    de.delete_reason as deleteReason, de.created_at as createdAt, de.updated_at as updatedAt
    FROM docket_entries de LEFT JOIN service_requests sr ON sr.id = de.linked_service_request_id`;
}

function rowToSummary(row: DocketRow) {
  return {
    id: row.id,
    docketNumber: row.docketNumber,
    caseId: row.caseId,
    title: row.title,
    caseType: normalizeCaseType(row.caseType),
    proceedingType: normalizeProceedingType(row.proceedingType),
    status: normalizeStatus(row.status),
    filedOn: row.filedOn,
    scheduledFor: row.scheduledFor,
    scheduledTimezone: row.scheduledTimezone,
    scheduledDiscordTimestamp: row.scheduledDiscordTimestamp,
    scheduledDiscordRelative: row.scheduledDiscordRelative,
    judgeUserId: row.judgeUserId,
    judgeName: row.judgeName,
    plaintiff: row.plaintiff,
    defendant: row.defendant,
    publicSummary: row.summaryMarkdown || row.summary || "",
    publicNotesMarkdown: row.publicNotesMarkdown,
    linkedServiceRequestId: row.linkedServiceRequestId,
    linkedRequestNumber: row.linkedRequestNumber,
    discordSyncStatus: normalizeDiscordSync(row.discordSyncStatus),
    discordMessageId: row.discordMessageId,
    discordChannelId: row.discordChannelId,
    discordPostedAt: row.discordPostedAt,
    discordUpdatedAt: row.discordUpdatedAt,
    isPublic: Boolean(row.isPublic || row.visibility === "PUBLIC"),
    isArchived: Boolean(row.isArchived),
    publishedAt: row.publishedAt,
    closedAt: row.closedAt,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
    deletedByDisplayName: row.deletedByDisplayName,
    deleteReason: row.deleteReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function rowToDetail(row: DocketRow, mode: "public" | "staff"): DocketDetail {
  const summary = rowToSummary(row);
  const detail: DocketDetail = {
    ...summary,
    individualsInvolved: parseArray(row.individualsInvolvedJson),
    summaryMarkdown: row.summaryMarkdown || row.summary || "",
    previewText: ""
  };
  detail.previewText = generateDocketText(detail);
  if (mode === "staff") {
    detail.privateNotesMarkdown = row.privateNotesMarkdown;
    detail.linkedPrivateTicketChannelId = row.linkedPrivateTicketChannelId;
    detail.linkedPetitionUrl = row.linkedPetitionUrl;
  }
  return detail;
}

async function docketEvents(env: Env, id: string) {
  const result = await env.DB!.prepare(
    "SELECT id, docket_entry_id as docketEntryId, actor_user_id as actorUserId, event_type as eventType, message, metadata_json as metadataJson, created_at as createdAt FROM docket_events WHERE docket_entry_id = ? ORDER BY created_at ASC"
  )
    .bind(id)
    .all<{ id: string; docketEntryId: string; actorUserId: string | null; eventType: string; message: string | null; metadataJson: string; createdAt: string }>();
  return result.results.map((event) => ({ ...event, metadata: parseObject(event.metadataJson) }));
}

async function addDocketEvent(env: Env, docketId: string, actorUserId: string | null, eventType: string, message: string, metadata: Record<string, unknown>) {
  await env.DB!.prepare("INSERT INTO docket_events (id, docket_entry_id, actor_user_id, event_type, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), docketId, actorUserId, eventType, message, JSON.stringify(metadata))
    .run();
}

function requireDocketManager(ctx: AuthContext): AuthContext {
  return requireAnyPermission(ctx, ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]);
}

function canManageDocket(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "CREATE_DOCKET") || hasActionPermission(ctx, "PUBLISH_DOCKET") || hasActionPermission(ctx, "ADMIN");
}

async function optionalAuth(request: Request, env: Env): Promise<AuthContext | null> {
  try {
    return await requireAuth(request, env);
  } catch {
    return null;
  }
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeCaseType(value: string): DocketCaseType {
  return DOCKET_CASE_TYPES.includes(value as DocketCaseType) ? (value as DocketCaseType) : "OTHER";
}

function normalizeProceedingType(value: string): DocketProceedingType {
  return DOCKET_PROCEEDING_TYPES.includes(value as DocketProceedingType) ? (value as DocketProceedingType) : "OTHER";
}

function normalizeCaseTypeInput(value: unknown): DocketCaseType | null {
  const canonical = canonicalDocketEnumValue(value);
  return DOCKET_CASE_TYPES.includes(canonical as DocketCaseType) ? (canonical as DocketCaseType) : null;
}

function normalizeProceedingTypeInput(value: unknown): DocketProceedingType | null {
  const canonical = canonicalDocketEnumValue(value);
  return DOCKET_PROCEEDING_TYPES.includes(canonical as DocketProceedingType) ? (canonical as DocketProceedingType) : null;
}

function normalizeDocketFilterValue(key: string, value: string): string {
  if (key === "caseType" || key === "proceedingType") return canonicalDocketEnumValue(value);
  return value;
}

function canonicalDocketEnumValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeStatus(value: string): DocketStatus {
  return DOCKET_STATUSES.includes(value as DocketStatus) ? (value as DocketStatus) : "DRAFT";
}

function normalizeDiscordSync(value: string): DiscordSyncStatus {
  return ["NOT_POSTED", "POSTED", "UPDATED", "FAILED", "REPOST_REQUIRED"].includes(value) ? (value as DiscordSyncStatus) : "NOT_POSTED";
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, 3000) : null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function discordIdForPortalUserId(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_id as discordId FROM users WHERE id = ?")
    .bind(userId)
    .first<{ discordId: string }>();
  return validDiscordId(row?.discordId) ? row.discordId : null;
}

function validDiscordId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 180) : "Unknown error";
}

interface DocketRow {
  id: string;
  docketNumber: string;
  caseId: string | null;
  title: string;
  entryType: string;
  caseType: string;
  proceedingType: string;
  plaintiff: string | null;
  defendant: string | null;
  individualsInvolvedJson: string;
  judgeUserId: string | null;
  judgeName: string | null;
  status: string;
  filedOn: string | null;
  scheduledFor: string | null;
  scheduledTimezone: string | null;
  scheduledDiscordTimestamp: string | null;
  scheduledDiscordRelative: string | null;
  summary: string;
  summaryMarkdown: string;
  publicNotesMarkdown: string | null;
  privateNotesMarkdown: string | null;
  linkedServiceRequestId: string | null;
  linkedRequestNumber: string | null;
  linkedPrivateTicketChannelId: string | null;
  linkedPetitionUrl: string | null;
  discordMessageId: string | null;
  discordChannelId: string | null;
  discordPostedAt: string | null;
  discordUpdatedAt: string | null;
  discordSyncStatus: string;
  isPublic: number;
  isArchived: number;
  visibility: string;
  publishedAt: string | null;
  closedAt: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PreparedDocketInput {
  docketNumber: string;
  title: string;
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status: DocketStatus;
  plaintiff: string | null;
  defendant: string | null;
  individualsInvolved: string[];
  judgeUserId: string | null;
  judgeName: string | null;
  filedOn: string;
  schedule: ReturnType<typeof buildSchedule>;
  summaryMarkdown: string;
  publicNotesMarkdown: string | null;
  privateNotesMarkdown: string | null;
  linkedServiceRequestId: string | null;
  linkedPrivateTicketChannelId: string | null;
  linkedPetitionUrl: string | null;
  isPublic: boolean;
  isArchived: boolean;
}

interface DocketValidationFailure {
  ok: false;
  message: string;
  field?: string;
  details?: unknown;
}
