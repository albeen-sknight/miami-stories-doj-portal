/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Judicial Records API
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import { audit } from "./audit";
import { requireAuth } from "./auth";
import { discordApi, MissingEnvironmentError } from "./discord";
import { errorJson, json } from "./http";
import { hasActionPermission, hasLogicalPermission, requireAnyPermission } from "./permissions";
import { softDeleteEntityForContext, restoreEntityForContext } from "./deletionLog";
import type { AuthContext, Env } from "./types";

const RECORD_TYPES = [
  "Court Order",
  "Ruling",
  "Standing Order",
  "Judicial Interpretation",
  "Sentencing Guidance",
  "Procedural Order",
  "Advisory Notice"
] as const;

const CATEGORIES = [
  "Court Opinion",
  "Standing Order",
  "Judicial Interpretation",
  "Appeal Decision",
  "Sentencing Guidance",
  "Procedural Rule",
  "Case Law Summary",
  "Precedent / Binding Authority",
  "Advisory Notice"
] as const;

export async function listJudicialRecords(request: Request, env: Env): Promise<Response> {
  const ctx = requireJudicialViewer(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for judicial records.", 503);
  const url = new URL(request.url);
  const { where, params } = recordFilters(url, false);
  const result = await env.DB.prepare(`${selectRecords()} ${where} ORDER BY jr.published_at DESC, jr.updated_at DESC LIMIT 150`)
    .bind(...params)
    .all<JudicialRecordRow>();
  await audit(env, "JUDICIAL_RECORDS_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map(rowToRecord) });
}

export async function judicialRecordDetail(request: Request, env: Env, id: string): Promise<Response> {
  requireJudicialViewer(await requireAuth(request, env));
  const row = await loadRecord(env, id);
  if (!row || row.deletedAt || row.status !== "PUBLISHED") return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  return json({ data: rowToRecord(row) });
}

export async function adminJudicialRecords(request: Request, env: Env): Promise<Response> {
  requireJudicialEditor(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for judicial records.", 503);
  const url = new URL(request.url);
  const { where, params } = recordFilters(url, true);
  const result = await env.DB.prepare(`${selectRecords()} ${where} ORDER BY jr.updated_at DESC LIMIT 200`)
    .bind(...params)
    .all<JudicialRecordRow>();
  return json({ data: result.results.map(rowToRecord), recordTypes: RECORD_TYPES, categories: CATEGORIES });
}

export async function adminJudicialRecordDetail(request: Request, env: Env, id: string): Promise<Response> {
  requireJudicialEditor(await requireAuth(request, env));
  const row = await loadRecord(env, id);
  if (!row) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  return json({ data: rowToRecord(row) });
}

export async function createJudicialRecord(request: Request, env: Env): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for judicial records.", 503);
  const input = await prepareInput(env, await safeJson(request), null);
  if (!input.ok) return validationError(input.message, input.field);
  const id = crypto.randomUUID();
  const recordNumber = await nextRecordNumber(env);
  await env.DB.prepare(
    `INSERT INTO judicial_records (
      id, record_number, record_type, category, title, summary, body_markdown, holding_markdown, reasoning_markdown,
      tags_json, status, visibility, linked_docket_id, linked_docket_number, linked_request_id, linked_request_number,
      subject_name, subject_cid, issued_by_user_id, issued_by_display_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    recordNumber,
    input.value.recordType,
    input.value.category,
    input.value.title,
    input.value.summary,
    input.value.bodyMarkdown,
    input.value.holdingMarkdown,
    input.value.reasoningMarkdown,
    JSON.stringify(input.value.tags),
    input.value.visibility,
    input.value.linkedDocketId,
    input.value.linkedDocketNumber,
    input.value.linkedRequestId,
    input.value.linkedRequestNumber,
    input.value.subjectName,
    input.value.subjectCid,
    ctx.user.id,
    ctx.user.displayName
  ).run();
  await audit(env, "JUDICIAL_RECORD_CREATED", { id, record_number: recordNumber }, ctx.user.id);
  return json({ data: rowToRecord((await loadRecord(env, id))!) }, { status: 201 });
}

export async function updateJudicialRecord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  const existing = await loadRecord(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  if (existing.deletedAt) return errorJson("VALIDATION_ERROR", "Restore this judicial record before editing it.", 400);
  const input = await prepareInput(env, await safeJson(request), id);
  if (!input.ok) return validationError(input.message, input.field);
  await env.DB!.prepare(
    `UPDATE judicial_records SET record_type = ?, category = ?, title = ?, summary = ?, body_markdown = ?,
      holding_markdown = ?, reasoning_markdown = ?, tags_json = ?, visibility = ?, linked_docket_id = ?,
      linked_docket_number = ?, linked_request_id = ?, linked_request_number = ?, subject_name = ?, subject_cid = ?,
      discord_sync_status = CASE WHEN status = 'PUBLISHED' THEN 'REPOST_REQUIRED' ELSE discord_sync_status END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    input.value.recordType,
    input.value.category,
    input.value.title,
    input.value.summary,
    input.value.bodyMarkdown,
    input.value.holdingMarkdown,
    input.value.reasoningMarkdown,
    JSON.stringify(input.value.tags),
    input.value.visibility,
    input.value.linkedDocketId,
    input.value.linkedDocketNumber,
    input.value.linkedRequestId,
    input.value.linkedRequestNumber,
    input.value.subjectName,
    input.value.subjectCid,
    id
  ).run();
  await audit(env, "JUDICIAL_RECORD_UPDATED", { id }, ctx.user.id);
  return json({ data: rowToRecord((await loadRecord(env, id))!) });
}

export async function publishJudicialRecord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireJudicialPublisher(await requireAuth(request, env));
  const existing = await loadRecord(env, id);
  if (!existing || existing.deletedAt) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  await env.DB!.prepare(
    `UPDATE judicial_records SET status = 'PUBLISHED', visibility = CASE WHEN visibility = 'PRIVATE' THEN 'LAWYER_VISIBLE' ELSE visibility END,
      published_at = COALESCE(published_at, CURRENT_TIMESTAMP), published_by_user_id = ?, archived_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(ctx.user.id, id).run();
  let discordStatus = "NOT_CONFIGURED";
  try {
    discordStatus = await postJudicialRecordToDiscord(env, rowToRecord((await loadRecord(env, id))!));
  } catch (cause) {
    discordStatus = safeError(cause);
    await env.DB!.prepare("UPDATE judicial_records SET discord_sync_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }
  await audit(env, "JUDICIAL_RECORD_PUBLISHED", { id, discord_status: discordStatus }, ctx.user.id);
  return json({ data: rowToRecord((await loadRecord(env, id))!), discordStatus });
}

export async function archiveJudicialRecord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  const existing = await loadRecord(env, id);
  if (!existing || existing.deletedAt) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  await env.DB!.prepare("UPDATE judicial_records SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(id)
    .run();
  await audit(env, "JUDICIAL_RECORD_ARCHIVED", { id }, ctx.user.id);
  return json({ data: rowToRecord((await loadRecord(env, id))!) });
}

export async function deleteJudicialRecord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  const body = await safeJson(request) as { reason?: string };
  const reason = clean(body.reason, 1000);
  if (!reason) return errorJson("VALIDATION_ERROR", "Reason for deletion is required.", 400);
  const log = await softDeleteEntityForContext(env, ctx, "judicial_record", id, reason);
  if (!log) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  return json({ data: log });
}

export async function restoreJudicialRecord(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  const body = await safeJson(request) as { reason?: string };
  const reason = clean(body.reason, 1000);
  if (!reason) return errorJson("VALIDATION_ERROR", "Restore reason is required.", 400);
  const log = await restoreEntityForContext(env, ctx, "judicial_record", id, reason);
  if (!log) return errorJson("NOT_FOUND", "Judicial record not found.", 404);
  return json({ data: log });
}

export async function judicialHistorySearch(request: Request, env: Env): Promise<Response> {
  const ctx = requireJudicialEditor(await requireAuth(request, env));
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for judicial history search.", 503);
  const url = new URL(request.url);
  const raw = clean(url.searchParams.get("q"), 120);
  if (!raw || raw.length < 2) return json({ data: { query: raw ?? "", dockets: [], requests: [], judicialRecords: [], barExamAttempts: [] } });
  const like = `%${raw}%`;
  const dockets = await env.DB.prepare(
    `SELECT id, docket_number as docketNumber, title, case_type as caseType, proceeding_type as proceedingType,
      status, plaintiff, defendant, judge_name as judgeName, published_at as publishedAt, updated_at as updatedAt
     FROM docket_entries
     WHERE deleted_at IS NULL AND (docket_number LIKE ? OR title LIKE ? OR plaintiff LIKE ? OR defendant LIKE ? OR individuals_involved_json LIKE ?)
     ORDER BY updated_at DESC LIMIT 15`
  ).bind(like, like, like, like, like).all();
  const requests = await env.DB.prepare(
    `SELECT id, request_number as requestNumber, request_type as requestType, status, requester_display_name as requesterDisplayName,
      requester_discord_username as requesterDiscordUsername, created_at as createdAt, updated_at as updatedAt
     FROM service_requests
     WHERE deleted_at IS NULL AND (request_number LIKE ? OR requester_display_name LIKE ? OR requester_discord_username LIKE ? OR requester_contact LIKE ? OR payload_json LIKE ?)
     ORDER BY updated_at DESC LIMIT 15`
  ).bind(like, like, like, like, like).all();
  const records = await env.DB.prepare(
    `${selectRecords()} WHERE jr.deleted_at IS NULL AND (jr.record_number LIKE ? OR jr.title LIKE ? OR jr.subject_name LIKE ? OR jr.subject_cid LIKE ? OR jr.summary LIKE ? OR jr.body_markdown LIKE ? OR jr.tags_json LIKE ?)
     ORDER BY jr.updated_at DESC LIMIT 15`
  ).bind(like, like, like, like, like, like, like).all<JudicialRecordRow>();
  const barExamAttempts = await safeBarExamHistory(env, ctx, like);
  await audit(env, "JUDICIAL_HISTORY_SEARCHED", { query_length: raw.length, docket_count: dockets.results.length, request_count: requests.results.length }, ctx.user.id);
  return json({
    data: {
      query: raw,
      dockets: dockets.results,
      requests: requests.results,
      judicialRecords: records.results.map(rowToRecord),
      barExamAttempts
    }
  });
}

async function prepareInput(env: Env, body: unknown, existingId: string | null): Promise<{ ok: true; value: PreparedRecord } | { ok: false; message: string; field: string }> {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = clean(input.title, 220);
  if (!title) return { ok: false, message: "Title is required.", field: "title" };
  const category = clean(input.category, 120) || "Court Opinion";
  const recordType = clean(input.recordType, 120) || "Court Order";
  const summary = clean(input.summary, 2000) || "";
  const bodyMarkdown = clean(input.bodyMarkdown ?? input.body, 15000) || "";
  if (!summary && !bodyMarkdown) return { ok: false, message: "Summary or body is required.", field: "summary" };
  const linkedDocket = await resolveDocket(env, clean(input.linkedDocketNumber ?? input.linkedDocketId, 80), existingId);
  const linkedRequest = await resolveRequest(env, clean(input.linkedRequestNumber ?? input.linkedRequestId, 80));
  return {
    ok: true,
    value: {
      recordType,
      category,
      title,
      summary,
      bodyMarkdown,
      holdingMarkdown: clean(input.holdingMarkdown ?? input.holding, 7000),
      reasoningMarkdown: clean(input.reasoningMarkdown ?? input.reasoning, 7000),
      tags: normalizeTags(input.tags ?? input.tagsText),
      visibility: normalizeVisibility(input.visibility),
      linkedDocketId: linkedDocket.id,
      linkedDocketNumber: linkedDocket.number,
      linkedRequestId: linkedRequest.id,
      linkedRequestNumber: linkedRequest.number,
      subjectName: clean(input.subjectName, 160),
      subjectCid: clean(input.subjectCid, 80)
    }
  };
}

async function resolveDocket(env: Env, value: string | null, existingId: string | null): Promise<{ id: string | null; number: string | null }> {
  if (!value) return { id: null, number: null };
  const row = await env.DB!.prepare("SELECT id, docket_number as number FROM docket_entries WHERE (id = ? OR docket_number = ?) AND (? IS NULL OR id != ?)")
    .bind(value, value, existingId, existingId)
    .first<{ id: string; number: string }>();
  return { id: row?.id ?? null, number: row?.number ?? value };
}

async function resolveRequest(env: Env, value: string | null): Promise<{ id: string | null; number: string | null }> {
  if (!value) return { id: null, number: null };
  const row = await env.DB!.prepare("SELECT id, request_number as number FROM service_requests WHERE id = ? OR request_number = ?")
    .bind(value, value)
    .first<{ id: string; number: string }>();
  return { id: row?.id ?? null, number: row?.number ?? value };
}

async function nextRecordNumber(env: Env): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await env.DB!.prepare(
    `INSERT INTO judicial_record_counters (id, year, last_number, updated_at)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(year) DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING last_number as lastNumber`
  ).bind(`JUD-${year}`, year).first<{ lastNumber: number }>();
  if (!row) throw new Error("Could not generate judicial record number.");
  return `JUD-${year}-${String(row.lastNumber).padStart(4, "0")}`;
}

async function postJudicialRecordToDiscord(env: Env, record: JudicialRecord) {
  const channel = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = 'JUDICIAL_RECORDS' AND discord_channel_id != ''")
    .first<{ id: string }>();
  if (!channel?.id) {
    await env.DB!.prepare("UPDATE judicial_records SET discord_sync_status = 'NOT_CONFIGURED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id).run();
    return "NOT_CONFIGURED";
  }
  const embed = judicialRecordEmbed(env, record);
  const existingMessageId = record.discordMessageId;
  const endpoint = existingMessageId ? `/channels/${channel.id}/messages/${existingMessageId}` : `/channels/${channel.id}/messages`;
  const response = await discordApi(env, endpoint, {
    method: existingMessageId ? "PATCH" : "POST",
    body: JSON.stringify({ embeds: [embed] })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord ${response.status}: ${text.slice(0, 180)}`);
  }
  const payload = await response.json() as { id?: string };
  const messageId = payload.id ?? existingMessageId;
  await env.DB!.prepare(
    `UPDATE judicial_records SET discord_channel_id = ?, discord_message_id = ?, discord_posted_at = COALESCE(discord_posted_at, CURRENT_TIMESTAMP),
      discord_sync_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(channel.id, messageId, existingMessageId ? "UPDATED" : "POSTED", record.id).run();
  return existingMessageId ? "UPDATED" : "POSTED";
}

function judicialRecordEmbed(env: Env, record: JudicialRecord) {
  const fields = [
    { name: "Record", value: record.recordNumber, inline: true },
    { name: "Category", value: record.category, inline: true },
    { name: "Issued By", value: record.issuedByDisplayName ?? "DOJ Judiciary", inline: true }
  ];
  if (record.linkedDocketNumber) fields.push({ name: "Linked Docket", value: record.linkedDocketNumber, inline: true });
  if (record.linkedRequestNumber) fields.push({ name: "Linked Request", value: record.linkedRequestNumber, inline: true });
  if (record.holdingMarkdown) fields.push({ name: "Holding / Rule", value: truncate(record.holdingMarkdown, 1000), inline: false });
  const portalUrl = env.PUBLIC_APP_URL ? `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/dashboard/judicial` : null;
  return {
    title: record.title,
    description: truncate(record.summary || record.bodyMarkdown || "Published judicial record.", 1800),
    color: 0xff2fae,
    fields,
    url: portalUrl ?? undefined,
    timestamp: new Date().toISOString(),
    footer: { text: "Miami Stories DOJ Judicial Records" }
  };
}

async function safeBarExamHistory(env: Env, ctx: AuthContext, like: string) {
  if (!(hasActionPermission(ctx, "REVIEW_BAR_EXAMS") || hasLogicalPermission(ctx, "BAR_ASSOCIATION_MEMBER"))) return [];
  try {
    const result = await env.DB!.prepare(
      `SELECT id, attempt_number as attemptNumber, discord_username as discordUsername, candidate_name as candidateName,
        exam_track as examTrack, version_label as versionLabel, status, submitted_at as submittedAt,
        final_score as finalScore, decision
       FROM bar_exam_attempts
       WHERE deleted_at IS NULL AND (attempt_number LIKE ? OR discord_username LIKE ? OR candidate_name LIKE ?)
       ORDER BY updated_at DESC LIMIT 10`
    ).bind(like, like, like).all();
    return result.results;
  } catch {
    return [];
  }
}

function recordFilters(url: URL, admin: boolean) {
  const filters = admin ? ["1 = 1"] : ["jr.deleted_at IS NULL", "jr.status = 'PUBLISHED'", "jr.visibility IN ('PUBLIC', 'LAWYER_VISIBLE')"];
  const params: string[] = [];
  if (admin && url.searchParams.get("includeDeleted") !== "true") filters.push("jr.deleted_at IS NULL");
  for (const [key, column] of [["status", "jr.status"], ["category", "jr.category"], ["recordType", "jr.record_type"], ["visibility", "jr.visibility"]] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      filters.push(`${column} = ?`);
      params.push(value);
    }
  }
  const search = clean(url.searchParams.get("q"), 120);
  if (search) {
    filters.push("(jr.record_number LIKE ? OR jr.title LIKE ? OR jr.summary LIKE ? OR jr.body_markdown LIKE ? OR jr.tags_json LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  return { where: `WHERE ${filters.join(" AND ")}`, params };
}

function selectRecords(): string {
  return `SELECT jr.id, jr.record_number as recordNumber, jr.record_type as recordType, jr.category, jr.title, jr.summary,
    jr.body_markdown as bodyMarkdown, jr.holding_markdown as holdingMarkdown, jr.reasoning_markdown as reasoningMarkdown,
    jr.tags_json as tagsJson, jr.status, jr.visibility, jr.linked_docket_id as linkedDocketId,
    COALESCE(de.docket_number, jr.linked_docket_number) as linkedDocketNumber, jr.linked_request_id as linkedRequestId,
    COALESCE(sr.request_number, jr.linked_request_number) as linkedRequestNumber, jr.subject_name as subjectName,
    jr.subject_cid as subjectCid, jr.issued_by_user_id as issuedByUserId, jr.issued_by_display_name as issuedByDisplayName,
    jr.published_by_user_id as publishedByUserId, jr.archived_at as archivedAt, jr.published_at as publishedAt,
    jr.discord_channel_id as discordChannelId, jr.discord_message_id as discordMessageId, jr.discord_posted_at as discordPostedAt,
    jr.discord_sync_status as discordSyncStatus, jr.deleted_at as deletedAt, jr.deleted_by_user_id as deletedByUserId,
    jr.deleted_by_display_name as deletedByDisplayName, jr.delete_reason as deleteReason, jr.created_at as createdAt,
    jr.updated_at as updatedAt
    FROM judicial_records jr
    LEFT JOIN docket_entries de ON de.id = jr.linked_docket_id
    LEFT JOIN service_requests sr ON sr.id = jr.linked_request_id`;
}

async function loadRecord(env: Env, id: string): Promise<JudicialRecordRow | null> {
  if (!env.DB) return null;
  return env.DB.prepare(`${selectRecords()} WHERE jr.id = ? OR jr.record_number = ?`).bind(id, id).first<JudicialRecordRow>();
}

function rowToRecord(row: JudicialRecordRow): JudicialRecord {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    recordType: row.recordType,
    category: row.category,
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.bodyMarkdown,
    holdingMarkdown: row.holdingMarkdown,
    reasoningMarkdown: row.reasoningMarkdown,
    tags: parseArray(row.tagsJson),
    status: row.status,
    visibility: row.visibility,
    linkedDocketId: row.linkedDocketId,
    linkedDocketNumber: row.linkedDocketNumber,
    linkedRequestId: row.linkedRequestId,
    linkedRequestNumber: row.linkedRequestNumber,
    subjectName: row.subjectName,
    subjectCid: row.subjectCid,
    issuedByUserId: row.issuedByUserId,
    issuedByDisplayName: row.issuedByDisplayName,
    publishedByUserId: row.publishedByUserId,
    archivedAt: row.archivedAt,
    publishedAt: row.publishedAt,
    discordChannelId: row.discordChannelId,
    discordMessageId: row.discordMessageId,
    discordPostedAt: row.discordPostedAt,
    discordSyncStatus: row.discordSyncStatus,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
    deletedByDisplayName: row.deletedByDisplayName,
    deleteReason: row.deleteReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function requireJudicialViewer(ctx: AuthContext): AuthContext {
  if (
    hasActionPermission(ctx, "ADMIN") ||
    hasActionPermission(ctx, "CREATE_DOCKET") ||
    hasActionPermission(ctx, "PUBLISH_DOCKET") ||
    hasLogicalPermission(ctx, "BAR_ACTIVE") ||
    hasLogicalPermission(ctx, "BAR_ASSOCIATION_MEMBER") ||
    hasLogicalPermission(ctx, "DEFENSE_ATTORNEY") ||
    hasLogicalPermission(ctx, "PUBLIC_DEFENDER_CERTIFIED") ||
    hasLogicalPermission(ctx, "JUDGE") ||
    hasLogicalPermission(ctx, "JUSTICE") ||
    hasLogicalPermission(ctx, "CHIEF_JUSTICE")
  ) return ctx;
  return requireAnyPermission(ctx, ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]);
}

function requireJudicialEditor(ctx: AuthContext): AuthContext {
  return requireAnyPermission(ctx, ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]);
}

function requireJudicialPublisher(ctx: AuthContext): AuthContext {
  return requireAnyPermission(ctx, ["PUBLISH_DOCKET", "ADMIN"]);
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => clean(item, 40)).filter((item): item is string => Boolean(item)).slice(0, 12);
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => clean(item, 40)).filter((item): item is string => Boolean(item)).slice(0, 12);
  return [];
}

function normalizeVisibility(value: unknown): string {
  return typeof value === "string" && ["PRIVATE", "LAWYER_VISIBLE", "PUBLIC"].includes(value) ? value : "LAWYER_VISIBLE";
}

function validationError(message: string, field: string): Response {
  return json({ error: message, field, fieldErrors: { [field]: message } }, { status: 400 });
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function clean(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, limit) : null;
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function safeError(cause: unknown): string {
  if (cause instanceof MissingEnvironmentError) return `Missing ${cause.key}`;
  return cause instanceof Error ? cause.message.slice(0, 180) : "Unknown Discord sync error";
}

interface PreparedRecord {
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown: string | null;
  reasoningMarkdown: string | null;
  tags: string[];
  visibility: string;
  linkedDocketId: string | null;
  linkedDocketNumber: string | null;
  linkedRequestId: string | null;
  linkedRequestNumber: string | null;
  subjectName: string | null;
  subjectCid: string | null;
}

interface JudicialRecordRow {
  id: string;
  recordNumber: string;
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown: string | null;
  reasoningMarkdown: string | null;
  tagsJson: string;
  status: string;
  visibility: string;
  linkedDocketId: string | null;
  linkedDocketNumber: string | null;
  linkedRequestId: string | null;
  linkedRequestNumber: string | null;
  subjectName: string | null;
  subjectCid: string | null;
  issuedByUserId: string | null;
  issuedByDisplayName: string | null;
  publishedByUserId: string | null;
  archivedAt: string | null;
  publishedAt: string | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordPostedAt: string | null;
  discordSyncStatus: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JudicialRecord {
  id: string;
  recordNumber: string;
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown: string | null;
  reasoningMarkdown: string | null;
  tags: string[];
  status: string;
  visibility: string;
  linkedDocketId: string | null;
  linkedDocketNumber: string | null;
  linkedRequestId: string | null;
  linkedRequestNumber: string | null;
  subjectName: string | null;
  subjectCid: string | null;
  issuedByUserId: string | null;
  issuedByDisplayName: string | null;
  publishedByUserId: string | null;
  archivedAt: string | null;
  publishedAt: string | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordPostedAt: string | null;
  discordSyncStatus: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}
