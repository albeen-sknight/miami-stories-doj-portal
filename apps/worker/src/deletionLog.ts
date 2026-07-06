import { audit } from "./audit";
import { requireAuth } from "./auth";
import { errorJson, json } from "./http";
import { PermissionError, requireAnyPermission } from "./permissions";
import type { AuthContext, Env } from "./types";
import type { ActionPermission } from "@shotta-doj/shared";

type EntityType = "docket" | "request" | "faq" | "resource" | "bar_exam_attempt" | "bar_exam_version" | "judicial_record";
export type DeletionEntityType = EntityType;

interface DeleteConfig {
  entityType: EntityType;
  table: string;
  idColumn: string;
  numberColumn?: string;
  titleColumn?: string;
  deletePermissions: ActionPermission[];
  snapshotColumns?: string[];
}

const CONFIGS: Record<EntityType, DeleteConfig> = {
  docket: {
    entityType: "docket",
    table: "docket_entries",
    idColumn: "id",
    numberColumn: "docket_number",
    titleColumn: "title",
    deletePermissions: ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]
  },
  request: {
    entityType: "request",
    table: "service_requests",
    idColumn: "id",
    numberColumn: "request_number",
    titleColumn: "public_summary",
    deletePermissions: ["MANAGE_REQUESTS", "ADMIN"]
  },
  faq: {
    entityType: "faq",
    table: "faq_entries",
    idColumn: "id",
    numberColumn: "id",
    titleColumn: "question",
    deletePermissions: ["MANAGE_FAQ", "ADMIN"]
  },
  resource: {
    entityType: "resource",
    table: "resource_documents",
    idColumn: "id",
    numberColumn: "id",
    titleColumn: "title",
    deletePermissions: ["MANAGE_RESOURCES", "ADMIN"]
  },
  bar_exam_attempt: {
    entityType: "bar_exam_attempt",
    table: "bar_exam_attempts",
    idColumn: "id",
    numberColumn: "attempt_number",
    titleColumn: "candidate_name",
    deletePermissions: ["REVIEW_BAR_EXAMS", "ADMIN"],
    snapshotColumns: [
      "id",
      "attempt_number",
      "user_id",
      "discord_user_id",
      "discord_username",
      "candidate_name",
      "exam_track",
      "version_id",
      "version_label",
      "status",
      "started_at",
      "deadline_at",
      "submitted_at",
      "final_score",
      "decision",
      "reviewer_user_id",
      "reviewer_name",
      "discord_notification_channel_id",
      "discord_notification_message_id",
      "followup_channel_id",
      "deleted_at",
      "created_at",
      "updated_at"
    ]
  },
  bar_exam_version: {
    entityType: "bar_exam_version",
    table: "bar_exam_versions",
    idColumn: "id",
    numberColumn: "version_label",
    titleColumn: "title",
    deletePermissions: ["REVIEW_BAR_EXAMS", "ADMIN"],
    snapshotColumns: ["id", "version_key", "exam_track", "version_code", "version_label", "title", "description", "status", "is_active", "deleted_at", "created_at", "updated_at"]
  },
  judicial_record: {
    entityType: "judicial_record",
    table: "judicial_records",
    idColumn: "id",
    numberColumn: "record_number",
    titleColumn: "title",
    deletePermissions: ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"],
    snapshotColumns: [
      "id",
      "record_number",
      "record_type",
      "category",
      "title",
      "summary",
      "body_markdown",
      "holding_markdown",
      "reasoning_markdown",
      "tags_json",
      "status",
      "visibility",
      "linked_docket_id",
      "linked_docket_number",
      "linked_request_id",
      "linked_request_number",
      "subject_name",
      "subject_cid",
      "issued_by_user_id",
      "issued_by_display_name",
      "published_by_user_id",
      "published_at",
      "archived_at",
      "discord_channel_id",
      "discord_message_id",
      "discord_sync_status",
      "deleted_at",
      "created_at",
      "updated_at"
    ]
  }
};

export async function listDeletionLog(request: Request, env: Env): Promise<Response> {
  const ctx = await requireTrashAccess(request, env);
  const result = await env.DB!.prepare(
    `SELECT id, entity_type as entityType, entity_id as entityId, entity_number as entityNumber, entity_title as entityTitle,
      deleted_by_user_id as deletedByUserId, deleted_by_display_name as deletedByDisplayName, delete_reason as deleteReason,
      metadata_json as metadataJson, created_at as createdAt, restored_at as restoredAt,
      restored_by_user_id as restoredByUserId, restored_by_display_name as restoredByDisplayName, restore_reason as restoreReason
     FROM deletion_log ORDER BY created_at DESC LIMIT 250`
  ).all<DeletionLogRow>();
  await audit(env, "DELETION_LOG_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map((row) => logRow(row)) });
}

export async function deletionLogDetail(request: Request, env: Env, id: string): Promise<Response> {
  await requireTrashAccess(request, env);
  const row = await env.DB!.prepare(
    `SELECT id, entity_type as entityType, entity_id as entityId, entity_number as entityNumber, entity_title as entityTitle,
      deleted_by_user_id as deletedByUserId, deleted_by_display_name as deletedByDisplayName, delete_reason as deleteReason,
      snapshot_json as snapshotJson, metadata_json as metadataJson, created_at as createdAt, restored_at as restoredAt,
      restored_by_user_id as restoredByUserId, restored_by_display_name as restoredByDisplayName, restore_reason as restoreReason
     FROM deletion_log WHERE id = ?`
  ).bind(id).first<DeletionLogRow>();
  if (!row) return errorJson("NOT_FOUND", "Deletion log entry not found.", 404);
  return json({ data: logRow(row, true) });
}

export async function restoreFromDeletionLog(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = await requireTrashAccess(request, env);
  const body = await safeJson(request) as { reason?: string };
  const reason = cleanReason(body.reason);
  if (!reason) return errorJson("VALIDATION_ERROR", "Restore reason is required.", 400);
  const row = await env.DB!.prepare("SELECT id, entity_type as entityType, entity_id as entityId FROM deletion_log WHERE id = ?")
    .bind(id)
    .first<{ id: string; entityType: EntityType; entityId: string }>();
  if (!row) return errorJson("NOT_FOUND", "Deletion log entry not found.", 404);
  const config = CONFIGS[row.entityType];
  if (!config) return errorJson("VALIDATION_ERROR", "Unsupported deletion log entity type.", 400);
  const restored = await restoreEntity(env, ctx, config, row.entityId, reason);
  if (!restored) return errorJson("NOT_FOUND", "Deleted record could not be restored because it no longer exists.", 404);
  await env.DB!.prepare(
    `UPDATE deletion_log SET restored_at = COALESCE(restored_at, CURRENT_TIMESTAMP), restored_by_user_id = ?,
      restored_by_display_name = ?, restore_reason = ? WHERE id = ?`
  ).bind(ctx.user.id, ctx.user.displayName, reason, id).run();
  return json({ data: await latestLog(env, row.entityType, row.entityId) });
}

export async function softDeleteEntityRoute(request: Request, env: Env, entityType: EntityType, id: string): Promise<Response> {
  const config = CONFIGS[entityType];
  const ctx = requireAnyPermission(await requireAuth(request, env), config.deletePermissions);
  const body = await safeJson(request) as { reason?: string };
  const reason = cleanReason(body.reason);
  if (!reason) return errorJson("VALIDATION_ERROR", "Reason for deletion is required.", 400);
  const log = await softDeleteEntity(env, ctx, config, id, reason);
  if (!log) return errorJson("NOT_FOUND", "Record not found.", 404);
  return json({ data: log });
}

export async function softDeleteEntityForContext(env: Env, ctx: AuthContext, entityType: EntityType, idOrNumber: string, reason: string) {
  const config = CONFIGS[entityType];
  requireAnyPermission(ctx, config.deletePermissions);
  const id = await resolveEntityId(env, config, idOrNumber);
  if (!id) return null;
  return softDeleteEntity(env, ctx, config, id, reason);
}

export async function restoreEntityForContext(env: Env, ctx: AuthContext, entityType: EntityType, idOrNumber: string, reason: string) {
  if (!(ctx.permissions.includes("CHIEF_JUSTICE") || ctx.permissions.includes("JUSTICE"))) throw new PermissionError("JUSTICE_OR_CHIEF_JUSTICE");
  const config = CONFIGS[entityType];
  const id = await resolveEntityId(env, config, idOrNumber);
  if (!id) return null;
  const restored = await restoreEntity(env, ctx, config, id, reason);
  return restored ? latestLog(env, entityType, id) : null;
}

export async function restoreEntityRoute(request: Request, env: Env, entityType: EntityType, id: string): Promise<Response> {
  const ctx = await requireTrashAccess(request, env);
  const body = await safeJson(request) as { reason?: string };
  const reason = cleanReason(body.reason);
  if (!reason) return errorJson("VALIDATION_ERROR", "Restore reason is required.", 400);
  const config = CONFIGS[entityType];
  const restored = await restoreEntity(env, ctx, config, id, reason);
  if (!restored) return errorJson("NOT_FOUND", "Deleted record could not be restored because it no longer exists.", 404);
  return json({ data: await latestLog(env, entityType, id) });
}

async function softDeleteEntity(env: Env, ctx: AuthContext, config: DeleteConfig, id: string, reason: string) {
  const row = await loadEntity(env, config, id);
  if (!row) return null;
  const nowMetadata = {
    discordChannelId: row.discord_ticket_channel_id ?? row.discord_channel_id ?? row.discord_notification_channel_id ?? row.followup_channel_id ?? null,
    discordMessageId: row.discord_ticket_message_id ?? row.discord_message_id ?? row.discord_notification_message_id ?? null,
    wasPublic: Boolean(row.is_public || row.visibility === "PUBLIC"),
    status: row.status ?? null
  };
  const logId = crypto.randomUUID();
  const result = await env.DB!.prepare(
    `UPDATE ${config.table} SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?, deleted_by_display_name = ?,
      delete_reason = ?, deleted_metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE ${config.idColumn} = ? AND deleted_at IS NULL`
  ).bind(ctx.user.id, ctx.user.displayName, reason, JSON.stringify(nowMetadata), id).run();
  if (result.meta.changes === 0 && row.deleted_at) return latestLog(env, config.entityType, id);
  await env.DB!.prepare(
    `INSERT INTO deletion_log (id, entity_type, entity_id, entity_number, entity_title, deleted_by_user_id,
      deleted_by_display_name, delete_reason, snapshot_json, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    logId,
    config.entityType,
    id,
    entityNumber(row, config),
    entityTitle(row, config),
    ctx.user.id,
    ctx.user.displayName,
    reason,
    JSON.stringify(sanitizeSnapshot(row, config)),
    JSON.stringify(nowMetadata)
  ).run();
  await audit(env, "ENTITY_SOFT_DELETED", { entity_type: config.entityType, entity_id: id, reason }, ctx.user.id);
  return latestLog(env, config.entityType, id);
}

async function restoreEntity(env: Env, ctx: AuthContext, config: DeleteConfig, id: string, reason: string): Promise<boolean> {
  const result = await env.DB!.prepare(
    `UPDATE ${config.table} SET deleted_at = NULL, deleted_by_user_id = NULL, deleted_by_display_name = NULL,
      delete_reason = NULL, deleted_metadata_json = NULL, updated_at = CURRENT_TIMESTAMP WHERE ${config.idColumn} = ?`
  ).bind(id).run();
  if (result.meta.changes === 0) return false;
  await env.DB!.prepare(
    `UPDATE deletion_log SET restored_at = COALESCE(restored_at, CURRENT_TIMESTAMP), restored_by_user_id = ?,
      restored_by_display_name = ?, restore_reason = ?
     WHERE entity_type = ? AND entity_id = ? AND restored_at IS NULL`
  ).bind(ctx.user.id, ctx.user.displayName, reason, config.entityType, id).run();
  await audit(env, "ENTITY_RESTORED", { entity_type: config.entityType, entity_id: id, reason }, ctx.user.id);
  return true;
}

async function loadEntity(env: Env, config: DeleteConfig, id: string): Promise<Record<string, unknown> | null> {
  const columns = config.snapshotColumns?.join(", ") ?? "*";
  return env.DB!.prepare(`SELECT ${columns} FROM ${config.table} WHERE ${config.idColumn} = ?`).bind(id).first<Record<string, unknown>>();
}

async function resolveEntityId(env: Env, config: DeleteConfig, idOrNumber: string): Promise<string | null> {
  const value = idOrNumber.trim();
  if (!value) return null;
  if (!config.numberColumn || config.numberColumn === config.idColumn) {
    const row = await env.DB!.prepare(`SELECT ${config.idColumn} as id FROM ${config.table} WHERE ${config.idColumn} = ?`).bind(value).first<{ id: string }>();
    return row?.id ?? null;
  }
  const row = await env.DB!.prepare(`SELECT ${config.idColumn} as id FROM ${config.table} WHERE ${config.idColumn} = ? OR ${config.numberColumn} = ?`).bind(value, value).first<{ id: string }>();
  return row?.id ?? null;
}

async function latestLog(env: Env, entityType: EntityType, id: string) {
  const row = await env.DB!.prepare(
    `SELECT id, entity_type as entityType, entity_id as entityId, entity_number as entityNumber, entity_title as entityTitle,
      deleted_by_user_id as deletedByUserId, deleted_by_display_name as deletedByDisplayName, delete_reason as deleteReason,
      snapshot_json as snapshotJson, metadata_json as metadataJson, created_at as createdAt, restored_at as restoredAt,
      restored_by_user_id as restoredByUserId, restored_by_display_name as restoredByDisplayName, restore_reason as restoreReason
     FROM deletion_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(entityType, id).first<DeletionLogRow>();
  return row ? logRow(row, true) : null;
}

async function requireTrashAccess(request: Request, env: Env): Promise<AuthContext> {
  const ctx = await requireAuth(request, env);
  if (ctx.permissions.includes("CHIEF_JUSTICE") || ctx.permissions.includes("JUSTICE")) return ctx;
  throw new PermissionError("JUSTICE_OR_CHIEF_JUSTICE");
}

function entityNumber(row: Record<string, unknown>, config: DeleteConfig): string | null {
  return config.numberColumn && typeof row[config.numberColumn] === "string" ? row[config.numberColumn] as string : null;
}

function entityTitle(row: Record<string, unknown>, config: DeleteConfig): string | null {
  return config.titleColumn && typeof row[config.titleColumn] === "string" ? row[config.titleColumn] as string : null;
}

function sanitizeSnapshot(row: Record<string, unknown>, config: DeleteConfig): Record<string, unknown> {
  const copy = { ...row };
  if (config.entityType === "bar_exam_attempt") {
    delete copy.answer_key_json;
    delete copy.reviewer_payload_json;
    delete copy.auto_score_json;
    delete copy.reviewer_notes;
  }
  if (config.entityType === "bar_exam_version") {
    delete copy.answer_key_json;
    delete copy.reviewer_payload_json;
    delete copy.candidate_payload_json;
  }
  return copy;
}

function logRow(row: DeletionLogRow, includeSnapshot = false) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityNumber: row.entityNumber,
    entityTitle: row.entityTitle,
    deletedByUserId: row.deletedByUserId,
    deletedByDisplayName: row.deletedByDisplayName,
    deleteReason: row.deleteReason,
    metadata: parseJson(row.metadataJson),
    snapshot: includeSnapshot ? parseJson(row.snapshotJson ?? "{}") : undefined,
    createdAt: row.createdAt,
    restoredAt: row.restoredAt,
    restoredByUserId: row.restoredByUserId,
    restoredByDisplayName: row.restoredByDisplayName,
    restoreReason: row.restoreReason
  };
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function cleanReason(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, 1000) : null;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

interface DeletionLogRow {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityNumber: string | null;
  entityTitle: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string;
  snapshotJson?: string;
  metadataJson: string;
  createdAt: string;
  restoredAt: string | null;
  restoredByUserId: string | null;
  restoredByDisplayName: string | null;
  restoreReason: string | null;
}
