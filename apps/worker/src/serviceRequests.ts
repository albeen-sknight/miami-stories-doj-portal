/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Service Request API and Discord Ticket Workflow
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type {
  CreateServiceRequestInput,
  DiscordTicketStatus,
  EligibleJudge,
  ServiceRequestDetail,
  ServiceRequestStatus,
  ServiceRequestSummary,
  ServiceRequestType
} from "@shotta-doj/shared";
import { audit } from "./audit";
import { requireAuth } from "./auth";
import { avatarUrl, discordApi, requireEnv } from "./discord";
import { errorJson, json } from "./http";
import { hasActionPermission, requirePermission } from "./permissions";
import { createServiceRequestTicketChannel, discordDiagnostics, discordFailureDetails, formatDiscordFailure, postServiceRequestEmbedToPrivateTicket, postServiceRequestEmbedToRequestChannel, type ServiceRequestMentions } from "./serviceDiscord";
import { serviceDefinition } from "./serviceDefinitions";
import { appendTranscriptSystemEvent, fetchChannelTranscriptEntries, transcriptSystemEvent } from "./ticketTranscriptCapture";
import type { AuthContext, Env } from "./types";

const JSON_LIMIT = 16_000;
const VALID_STATUSES: ServiceRequestStatus[] = [
  "SUBMITTED",
  "RECEIVED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "ASSIGNED",
  "APPROVED",
  "DENIED",
  "SCHEDULED",
  "CLOSED",
  "CANCELLED"
];
const SERVICE_PING_ROLE_NAMES: Partial<Record<ServiceRequestType, string[]>> = {
  LAWYER: ["Bar Association Member", "DOJ Portal Admin"],
  CRIMINAL_TRIAL: ["Judicial Branch"],
  CIVIL_CASE: ["Judicial Branch"],
  SUBPOENA: ["Judicial Branch"],
  ARREST_WARRANT: ["Judicial Branch", "ATF Special Agent", "Judge"],
  SEARCH_SEIZURE_WARRANT: ["Judicial Branch", "ATF Special Agent", "Judge"],
  EXPUNGEMENT: ["Judicial Branch"],
  MARRIAGE: ["Judicial Branch"],
  DIVORCE: ["Judicial Branch"]
};
const LAWYER_PROFILE_FIELDS = ["lawyerProfileId", "selectedLawyerId", "attorneyProfileId", "lawyerProfileSlug", "selectedLawyerSlug", "attorneyBarId", "lawyerBarId", "barNumber"];
const LAWYER_DISCORD_ID_FIELDS = ["lawyerDiscordId", "attorneyDiscordId", "representativeDiscordId", "counselDiscordId"];

export async function createRequest(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  const input = (await request.json()) as CreateServiceRequestInput;
  const result = await createServiceRequestForContext(env, ctx, input);
  if (!result.ok) return errorJson(result.code, result.message, result.status);
  return json({ data: result.data }, { status: 201 });
}

export async function createServiceRequestForContext(
  env: Env,
  ctx: AuthContext,
  input: CreateServiceRequestInput
): Promise<{ ok: true; data: ServiceRequestDetail } | { ok: false; code: string; message: string; status: number }> {
  if (!env.DB) return { ok: false, code: "D1_UNAVAILABLE", message: "D1 is required for service requests.", status: 503 };
  const validated = validateInput(input);
  if (!validated.ok) return { ok: false, code: "VALIDATION_ERROR", message: validated.message, status: 400 };

  const def = serviceDefinition(input.requestType);
  if (!def) return { ok: false, code: "INVALID_REQUEST_TYPE", message: "Unsupported service request type.", status: 400 };
  const sanitizedPayload = sanitizePayload(input.payload);
  const payloadJson = JSON.stringify(sanitizedPayload);
  const requesterContact = cleanOptional(input.requesterContact);
  const documentUrl = cleanOptional(input.documentUrl ?? readString(input.payload, "documentUrl"));
  const duplicate = await findRecentDuplicateRequest(env, ctx, input.requestType, payloadJson, requesterContact, documentUrl);
  if (duplicate) {
    await audit(env, "SERVICE_REQUEST_DUPLICATE_SUPPRESSED", {
      request_id: duplicate.id,
      request_number: duplicate.requestNumber,
      request_type: duplicate.requestType
    }, ctx.user.id);
    return { ok: true, data: duplicate };
  }
  const requestNumber = await nextRequestNumber(env, input.requestType, def.prefix);
  const id = crypto.randomUUID();
  const trackingCode = crypto.randomUUID();
  const mainParty = readString(sanitizedPayload, def.mainPartyField) || "Unknown";
  const shortTitle = def.shortTitleFields.map((field) => readString(sanitizedPayload, field)).filter(Boolean).join(" / ") || def.label;
  const publicChannelId = await mappingId(env, def.publicChannelKey);
  const categoryId = def.categoryKey ? await mappingId(env, def.categoryKey) : null;
  const selectedRoleId = await selectedPingRoleId(env, input.requestType, sanitizedPayload);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO service_requests (
      id, request_number, request_type, status, requester_user_id, requester_display_name,
      requester_discord_username, requester_contact, payload_json, public_summary, document_url, template_url,
      discord_public_channel_id, discord_ticket_category_id, discord_ping_role_id, discord_ticket_status,
      assigned_role_key, created_at, updated_at, public_tracking_code
    ) VALUES (?, ?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`
  )
    .bind(
      id,
      requestNumber,
      input.requestType,
      ctx.user.id,
      ctx.user.displayName,
      ctx.user.discordUsername,
      requesterContact,
      payloadJson,
      shortTitle,
      documentUrl,
      def.templateUrl ?? null,
      publicChannelId,
      categoryId,
      selectedRoleId,
      selectedRoleId,
      now,
      now,
      trackingCode
    )
    .run();
  await addServiceRequestEvent(env, id, ctx.user.id, "REQUEST_CREATED", "Service request submitted through the DOJ Portal.", {
    request_number: requestNumber,
    request_type: input.requestType
  });
  await audit(env, "SERVICE_REQUEST_CREATED", { request_number: requestNumber, request_type: input.requestType }, ctx.user.id);

  let detail = await getServiceRequestDetail(env, id);
  if (!detail) throw new Error("Created request could not be loaded.");
  try {
    if (isChannelPostRequest(detail)) {
      detail = await postRequestChannelEmbed(env, ctx, detail);
    } else {
      detail = await createDiscordTicket(env, ctx, detail);
      detail = await postPrivateTicketEmbed(env, ctx, detail);
    }
  } catch {
    detail = (await getServiceRequestDetail(env, id)) ?? detail;
  }

  return { ok: true, data: detail };
}

async function findRecentDuplicateRequest(
  env: Env,
  ctx: AuthContext,
  requestType: ServiceRequestType,
  payloadJson: string,
  requesterContact: string | null,
  documentUrl: string | null
): Promise<ServiceRequestDetail | null> {
  const row = await env.DB!.prepare(
    `SELECT id
     FROM service_requests
     WHERE requester_user_id = ?
       AND request_type = ?
       AND payload_json = ?
       AND COALESCE(requester_contact, '') = COALESCE(?, '')
       AND COALESCE(document_url, '') = COALESCE(?, '')
       AND deleted_at IS NULL
       AND julianday(created_at) >= julianday('now', '-45 seconds')
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(ctx.user.id, requestType, payloadJson, requesterContact, documentUrl)
    .first<{ id: string }>();
  return row?.id ? await getServiceRequestDetail(env, row.id) : null;
}

export async function myRequests(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for service requests.", 503);
  const result = await env.DB.prepare(baseSelect("WHERE sr.requester_user_id = ? AND sr.deleted_at IS NULL ORDER BY sr.created_at DESC"))
    .bind(ctx.user.id)
    .all<RequestRow>();
  return json({ data: result.results.map(rowToSummary) });
}

export async function publicRequestDetail(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = await requireAuth(request, env);
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Request not found.", 404);
  if (detail.deletedAt && !hasActionPermission(ctx, "MANAGE_REQUESTS")) return errorJson("NOT_FOUND", "Request not found.", 404);
  if (detail.requesterUserId !== ctx.user.id && !hasActionPermission(ctx, "MANAGE_REQUESTS")) {
    await audit(env, "SERVICE_REQUEST_VIEW_FORBIDDEN", { request_id: id, route: new URL(request.url).pathname }, ctx.user.id);
    return errorJson("FORBIDDEN", "You cannot view another user's service request.", 403);
  }
  return json({ data: detail });
}

export async function adminRequests(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for service requests.", 503);
  const url = new URL(request.url);
  const filters: string[] = ["sr.deleted_at IS NULL"];
  const params: string[] = [];
  for (const [key, column] of [
    ["type", "sr.request_type"],
    ["status", "sr.status"],
    ["priority", "json_extract(sr.payload_json, '$.urgency')"]
  ] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      filters.push(`${column} = ?`);
      params.push(value);
    }
  }
  const search = url.searchParams.get("q");
  if (search) {
    filters.push("(sr.request_number LIKE ? OR sr.payload_json LIKE ? OR u.discord_id LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(baseSelect(`${where} ORDER BY sr.created_at DESC LIMIT 100`)).bind(...params).all<RequestRow>();
  await audit(env, "SERVICE_REQUEST_ADMIN_LIST_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map(rowToSummary) });
}

export async function adminRequestDetail(request: Request, env: Env, id: string): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Request not found.", 404);
  return json({ data: detail });
}

export async function updateRequestStatus(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const body = (await request.json()) as { status?: ServiceRequestStatus };
  if (!body.status || !VALID_STATUSES.includes(body.status)) return errorJson("VALIDATION_ERROR", "Invalid status.", 400);
  await env.DB!.prepare("UPDATE service_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, id).run();
  await addServiceRequestEvent(env, id, ctx.user.id, "STATUS_CHANGED", `Status changed to ${body.status}.`, { status: body.status });
  await audit(env, "SERVICE_REQUEST_STATUS_CHANGED", { request_id: id, status: body.status }, ctx.user.id);
  return json({ data: await getServiceRequestDetail(env, id) });
}

export async function assignRequest(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = await requireAuth(request, env);
  if (!canAssignJudge(ctx)) return errorJson("FORBIDDEN", "Only authorized DOJ staff, judges, justices, or admins can assign a judge.", 403);
  const body = (await request.json().catch(() => ({}))) as { judgeDiscordId?: string; assignment?: string };
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Request not found.", 404);
  const requestedDiscordId = cleanOptional(body.judgeDiscordId) ?? (body.assignment === "self" ? ctx.user.discordId : null);
  if (!requestedDiscordId || !validDiscordId(requestedDiscordId)) return errorJson("VALIDATION_ERROR", "Select an eligible judge to assign.", 400);
  if (!canAssignAnyJudge(ctx) && requestedDiscordId !== ctx.user.discordId) {
    return errorJson("FORBIDDEN", "Judges may only claim requests for themselves. Request staff/admin may assign another eligible judge.", 403);
  }
  const selectedJudge = await resolveEligibleJudge(env, requestedDiscordId);
  if (!selectedJudge) return errorJson("VALIDATION_ERROR", "Selected user is not currently an eligible Judge role member.", 400);
  const previous = detail.assignedJudgeDisplayName ?? null;
  const assignedName = selectedJudge.displayName;
  const message = previous
    ? `Reassigned from ${previous} to ${assignedName}.`
    : `Assigned to ${assignedName}.`;
  await env.DB!.prepare(
    `UPDATE service_requests
     SET assigned_role_key = NULL,
         assigned_judge_user_id = ?,
         assigned_judge_display_name = ?,
         assigned_judge_discord_id = ?,
         assigned_judge_assigned_at = CURRENT_TIMESTAMP,
         assigned_judge_assigned_by_user_id = ?,
         status = 'ASSIGNED',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(selectedJudge.discordUserId, assignedName, selectedJudge.discordUserId, ctx.user.id, id)
    .run();
  await addServiceRequestEvent(env, id, ctx.user.id, "ASSIGNED", message, {
    assigned_judge_user_id: selectedJudge.discordUserId,
    assigned_judge_display_name: assignedName,
    assigned_judge_discord_id: selectedJudge.discordUserId,
    previous_assignee: previous
  });
  await audit(env, "SERVICE_REQUEST_ASSIGNED", { request_id: id, assigned_judge_user_id: selectedJudge.discordUserId, assigned_judge_display_name: assignedName, previous_assignee: previous }, ctx.user.id);
  await postJudgeAssignmentPing(env, detail, selectedJudge.discordUserId, assignedName).catch((cause) =>
    addServiceRequestEvent(env, id, ctx.user.id, "ASSIGNMENT_PING_FAILED", "Assigned judge ping could not be posted to Discord.", { reason: safeError(cause) })
  );
  return json({ data: await getServiceRequestDetail(env, id) });
}

export async function eligibleJudgesRoute(request: Request, env: Env): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  try {
    return json({ data: await listEligibleJudges(env) });
  } catch (cause) {
    return errorJson("ELIGIBLE_JUDGES_UNAVAILABLE", safeError(cause), 502);
  }
}

export async function addAdminRequestEvent(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const body = (await request.json()) as { message?: string };
  const message = cleanOptional(body.message);
  if (!message) return errorJson("VALIDATION_ERROR", "Message is required.", 400);
  await addServiceRequestEvent(env, id, ctx.user.id, "ADMIN_NOTE", message, {});
  return json({ data: await requestEvents(env, id) }, { status: 201 });
}

export async function getAdminRequestEvents(request: Request, env: Env, id: string): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  return json({ data: await requestEvents(env, id) });
}

export async function createDiscordChannelRoute(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Request not found.", 404);
  if (isChannelPostRequest(detail)) {
    return errorJson("CHANNEL_POST_WORKFLOW", "This request type posts directly to its configured Discord channel and does not create private child channels.", 400);
  }
  return json({ data: await createDiscordTicket(env, ctx, detail) });
}

export async function postDiscordTicketRoute(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Request not found.", 404);
  if (isChannelPostRequest(detail)) return json({ data: await postRequestChannelEmbed(env, ctx, detail) });
  return json({ data: await postPrivateTicketEmbed(env, ctx, detail) });
}

export async function closeDiscordTicketRoute(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_REQUESTS");
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = cleanOptional(body.reason);
  if (!reason) return errorJson("VALIDATION_ERROR", "A close reason is required.", 400);
  try {
    const result = await closeServiceRequestTicketForContext(env, ctx, id, reason, "portal");
    return json({ data: result.detail, close: result.close });
  } catch (cause) {
    return errorJson("TICKET_CLOSE_FAILED", safeError(cause), 409);
  }
}

export async function discordDiagnosticsRoute(request: Request, env: Env): Promise<Response> {
  requirePermission(await requireAuth(request, env), "ADMIN");
  return json({ data: await discordDiagnostics(env) });
}

export async function closeServiceRequestTicketForContext(env: Env, ctx: AuthContext, id: string, reason: string, source: "portal" | "discord", context: { commandName?: string; interactionId?: string } = {}) {
  if (!env.DB) throw new Error("D1 is required for service request close workflow.");
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) throw new Error("Service request not found.");
  const cleanedReason = cleanOptional(reason) ?? "Closed by authorized DOJ staff.";

  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_CLOSE_REQUESTED", "Service request close workflow requested.", {
    source,
    reason: cleanedReason,
    channel_id: detail.discordTicketChannelId
  });

  if (!detail.discordTicketChannelId) {
    await markServiceRequestClosedOnly(env, detail.id, ctx, cleanedReason, "No private Discord ticket channel is linked; no channel deletion was performed.");
    return {
      detail: await getServiceRequestDetail(env, detail.id) ?? detail,
      close: {
        closed: true,
        deletedChannel: false,
        transcriptId: null,
        archiveChannelId: null,
        archiveMessageId: null,
        message: "Request closed. No private ticket channel was linked, so no Discord channel was deleted."
      }
    };
  }

  const safeTarget = await getServiceRequestDetailByTicketChannel(env, detail.discordTicketChannelId);
  if (!safeTarget || safeTarget.id !== detail.id) {
    throw new Error("Linked Discord channel did not resolve back to this service request. Channel deletion was refused.");
  }

  const transcript = await createServiceRequestTranscript(env, detail, ctx, source, context);
  const archive = await postServiceRequestTranscriptArchive(env, detail, transcript);
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    `Transcript archive message posted to <#${archive.channelId}>.`,
    ctx,
    source,
    { requestNumber: detail.requestNumber, archiveChannelId: archive.channelId, archiveMessageId: archive.messageId }
  ));
  await markServiceRequestClosedOnly(env, detail.id, ctx, cleanedReason, `Private Discord ticket transcript ${transcript.id} stored before close.`);

  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    `Ticket channel deletion requested for ${detail.requestNumber}.`,
    ctx,
    source,
    { requestNumber: detail.requestNumber, channelId: detail.discordTicketChannelId }
  ));
  const deleteResponse = await discordApi(env, `/channels/${detail.discordTicketChannelId}`, { method: "DELETE" });
  if (!deleteResponse.ok) {
    const text = await deleteResponse.text().catch(() => "");
    await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
      `Ticket channel deletion failed with Discord ${deleteResponse.status}.`,
      ctx,
      source,
      { requestNumber: detail.requestNumber, channelId: detail.discordTicketChannelId, status: deleteResponse.status, response: text.slice(0, 180) }
    ));
    throw new Error(`Discord ticket channel delete failed with ${deleteResponse.status}: ${text.slice(0, 180)}`);
  }
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    "Ticket channel deleted after successful transcript archive.",
    ctx,
    source,
    { requestNumber: detail.requestNumber, channelId: detail.discordTicketChannelId }
  ));

  await env.DB.prepare(
    "UPDATE service_requests SET discord_ticket_deleted_at = CURRENT_TIMESTAMP, discord_ticket_deleted_by_user_id = ?, discord_ticket_delete_reason = ?, discord_ticket_transcript_id = ?, discord_ticket_status = 'POSTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(ctx.user.id, cleanedReason, transcript.id, detail.id)
    .run();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "PRIVATE_CHANNEL_DELETED", "Private Discord ticket channel deleted after transcript capture.", {
    reason: cleanedReason,
    channel_id: detail.discordTicketChannelId,
    transcript_id: transcript.id,
    archive_channel_id: archive.channelId,
    archive_message_id: archive.messageId
  });
  await audit(env, "SERVICE_REQUEST_TICKET_CLOSED_AND_DELETED", {
    request_id: detail.id,
    request_number: detail.requestNumber,
    transcript_id: transcript.id,
    archive_channel_id: archive.channelId,
    archive_message_id: archive.messageId,
    source
  }, ctx.user.id);

  return {
    detail: await getServiceRequestDetail(env, detail.id) ?? detail,
    close: {
      closed: true,
      deletedChannel: true,
      transcriptId: transcript.id,
      archiveChannelId: archive.channelId,
      archiveMessageId: archive.messageId,
      message: "Request closed, transcript archived, and private Discord ticket channel deleted."
    }
  };
}

async function createDiscordTicket(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<ServiceRequestDetail> {
  try {
    if (detail.discordTicketChannelId) return detail;
    const roleIds = await accessRoleIds(env, detail);
    const channel = await createServiceRequestTicketChannel(env, detail, {
      categoryId: detail.discordTicketCategoryId ?? "",
      requesterDiscordId: detail.requesterDiscordId ?? ctx.user.discordId,
      roleIds,
      existingChannelId: detail.discordTicketChannelId
    });
    await env.DB!.prepare(
      "UPDATE service_requests SET discord_ticket_channel_id = ?, discord_ticket_status = 'CREATED', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(channel.id, detail.id)
      .run();
    await addServiceRequestEvent(env, detail.id, ctx.user.id, "PRIVATE_CHANNEL_CREATED", "Private Discord ticket channel created.", {
      channel_id: channel.id,
      warning: "warning" in channel ? channel.warning : null,
      overwriteDiagnostics: "overwriteDiagnostics" in channel ? channel.overwriteDiagnostics : null,
      overwriteWarnings: "overwriteWarnings" in channel ? channel.overwriteWarnings : null,
      createChannelPayloadSummary: "createChannelPayloadSummary" in channel ? channel.createChannelPayloadSummary : null,
      primaryError: "primaryError" in channel ? channel.primaryError : null
    });
    await audit(env, "SERVICE_REQUEST_PRIVATE_CHANNEL_CREATED", { request_id: detail.id, channel_id: channel.id }, ctx.user.id);
  } catch (cause) {
    await markDiscordFailure(env, detail.id, ctx.user.id, "PRIVATE_CHANNEL_FAILED", "SERVICE_REQUEST_PRIVATE_CHANNEL_FAILED", cause);
  }
  return (await getServiceRequestDetail(env, detail.id)) ?? detail;
}

async function postPrivateTicketEmbed(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<ServiceRequestDetail> {
  try {
    if (!detail.discordTicketChannelId) throw new Error("No private ticket channel exists yet. Create/retry the private Discord channel first.");
    const mentions = await serviceRequestMentions(env, ctx, detail);
    const message = await postServiceRequestEmbedToPrivateTicket(env, detail, detail.discordTicketChannelId, mentions);
    await env.DB!.prepare(
      "UPDATE service_requests SET discord_ticket_message_id = ?, discord_ticket_status = 'POSTED', posted_to_discord_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(message.id, detail.id)
      .run();
    await addServiceRequestEvent(env, detail.id, ctx.user.id, "PRIVATE_EMBED_POSTED", "Private request embed posted to Discord ticket channel.", {
      message_id: message.id
    });
    await audit(env, "SERVICE_REQUEST_PRIVATE_EMBED_POSTED", { request_id: detail.id, message_id: message.id }, ctx.user.id);
  } catch (cause) {
    await markDiscordFailure(env, detail.id, ctx.user.id, "PRIVATE_EMBED_FAILED", "SERVICE_REQUEST_PRIVATE_EMBED_FAILED", cause);
  }
  return (await getServiceRequestDetail(env, detail.id)) ?? detail;
}

async function postRequestChannelEmbed(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<ServiceRequestDetail> {
  try {
    if (!detail.discordPublicChannelId) throw new Error("No Discord post destination channel is configured for this request type.");
    const mentions = await serviceRequestMentions(env, ctx, detail);
    const message = await postServiceRequestEmbedToRequestChannel(env, detail, detail.discordPublicChannelId, mentions);
    await env.DB!.prepare(
      "UPDATE service_requests SET discord_ticket_message_id = ?, discord_ticket_status = 'POSTED', posted_to_discord_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(message.id, detail.id)
      .run();
    if (message.staleMessageReposted) {
      await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_CHANNEL_EMBED_REPOSTED_AFTER_STALE_MESSAGE", "Stored Discord request embed message was missing; a new request embed was posted and saved.", {
        channel_id: detail.discordPublicChannelId,
        old_message_id: message.staleMessageId,
        message_id: message.id
      });
      await audit(env, "SERVICE_REQUEST_CHANNEL_EMBED_REPOSTED_AFTER_STALE_MESSAGE", { request_id: detail.id, channel_id: detail.discordPublicChannelId, old_message_id: message.staleMessageId, message_id: message.id }, ctx.user.id);
    } else {
      await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_CHANNEL_EMBED_POSTED", "Request embed posted to configured Discord request channel.", {
        channel_id: detail.discordPublicChannelId,
        message_id: message.id
      });
      await audit(env, "SERVICE_REQUEST_CHANNEL_EMBED_POSTED", { request_id: detail.id, channel_id: detail.discordPublicChannelId, message_id: message.id }, ctx.user.id);
    }
  } catch (cause) {
    await markDiscordFailure(env, detail.id, ctx.user.id, "REQUEST_CHANNEL_EMBED_FAILED", "SERVICE_REQUEST_CHANNEL_EMBED_FAILED", cause);
  }
  return (await getServiceRequestDetail(env, detail.id)) ?? detail;
}

async function markServiceRequestClosedOnly(env: Env, requestId: string, ctx: AuthContext, reason: string, message: string) {
  await env.DB!.prepare(
    "UPDATE service_requests SET status = 'CLOSED', discord_ticket_closed_at = COALESCE(discord_ticket_closed_at, CURRENT_TIMESTAMP), discord_ticket_closed_by_user_id = ?, discord_ticket_close_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(ctx.user.id, reason, requestId)
    .run();
  await addServiceRequestEvent(env, requestId, ctx.user.id, "PRIVATE_CHANNEL_CLOSED", message, { reason });
  await audit(env, "SERVICE_REQUEST_CLOSED", { request_id: requestId, reason }, ctx.user.id);
}

async function getServiceRequestDetailByTicketChannel(env: Env, channelId: string): Promise<ServiceRequestDetail | null> {
  const row = await env.DB!.prepare("SELECT id FROM service_requests WHERE discord_ticket_channel_id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(channelId)
    .first<{ id: string }>();
  return row?.id ? getServiceRequestDetail(env, row.id) : null;
}

async function createServiceRequestTranscript(env: Env, detail: ServiceRequestDetail, ctx: AuthContext, source: "portal" | "discord", context: { commandName?: string; interactionId?: string } = {}) {
  const id = crypto.randomUUID();
  const closeSource = source === "discord"
    ? `Discord ${context.commandName ? `/${context.commandName} ` : ""}close confirmation received from ${ctx.user.displayName}.`
    : `Portal close/archive requested by ${ctx.user.displayName}.`;
  const messages = [
    ...await fetchChannelTranscriptEntries(env, detail.discordTicketChannelId!),
    transcriptSystemEvent(closeSource, ctx, source, {
      requestNumber: detail.requestNumber,
      channelId: detail.discordTicketChannelId,
      commandName: context.commandName ?? null,
      interactionId: context.interactionId ?? null
    }),
    transcriptSystemEvent(`Transcript ${id} generated and stored by ${ctx.user.displayName}.`, ctx, source, {
      requestNumber: detail.requestNumber,
      transcriptId: id
    })
  ];
  await env.DB!.prepare(
    `INSERT INTO discord_ticket_transcripts (id, source_type, source_id, source_number, discord_channel_id, discord_channel_name,
      message_count, transcript_json, created_by_user_id, created_by_display_name, metadata_json)
     VALUES (?, 'request', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      detail.id,
      detail.requestNumber,
      detail.discordTicketChannelId,
      detail.requestNumber.toLowerCase(),
      messages.length,
      JSON.stringify(messages),
      ctx.user.id,
      ctx.user.displayName,
      JSON.stringify({ generated_by: source, close_workflow: true })
    )
    .run();
  await env.DB!.prepare("UPDATE service_requests SET discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(id, detail.id)
    .run();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_TRANSCRIPT_CREATED", "Discord ticket transcript created before close.", {
    transcript_id: id,
    message_count: messages.length
  });
  await audit(env, "DISCORD_TICKET_TRANSCRIPT_STORED", { source_type: "request", source_id: detail.id, transcript_id: id, message_count: messages.length }, ctx.user.id);
  return { id, messageCount: messages.length };
}

async function postServiceRequestTranscriptArchive(env: Env, detail: ServiceRequestDetail, transcript: { id: string; messageCount: number }): Promise<{ channelId: string; messageId: string }> {
  const channelId = await archiveChannelForServiceRequest(env, detail.requestType);
  if (!channelId) throw new Error(`No transcript archive channel is configured for ${detail.requestType}. Channel deletion was refused.`);
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `Transcript stored for ${detail.requestNumber}: ${transcript.id} (${transcript.messageCount} messages).\nPortal: ${transcriptPortalUrl(env, transcript.id)}`,
      allowed_mentions: { parse: [] }
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord transcript archive post failed with ${response.status}: ${text.slice(0, 180)}`);
  }
  const message = await response.json() as { id: string };
  await env.DB!.prepare("UPDATE discord_ticket_transcripts SET archive_channel_id = ?, archive_message_id = ? WHERE id = ?")
    .bind(channelId, message.id, transcript.id)
    .run();
  return { channelId, messageId: message.id };
}

function transcriptPortalUrl(env: Env, transcriptId: string): string {
  const base = (env.PUBLIC_APP_URL || "https://miami-stories-doj.pages.dev").replace(/\/+$/, "");
  return `${base}/dashboard/transcripts/${encodeURIComponent(transcriptId)}`;
}

export function archiveMappingKeyForServiceRequestType(type: ServiceRequestType | "BAR_EXAM_FOLLOWUP"): string | null {
  const keyByType: Partial<Record<ServiceRequestType | "BAR_EXAM_FOLLOWUP", string>> = {
    CRIMINAL_TRIAL: "criminal-trials-transcripts",
    CIVIL_CASE: "civil-cases-transcripts",
    SUBPOENA: "subpoena-transcripts",
    ARREST_WARRANT: "warrants-executed-transcripts",
    SEARCH_SEIZURE_WARRANT: "warrants-executed-transcripts",
    EXPUNGEMENT: "expungement-records",
    MARRIAGE: "certificates-issued-transcripts",
    DIVORCE: "certificates-issued-transcripts",
    BAR_EXAM_FOLLOWUP: "bar-exam-transcripts"
  };
  return keyByType[type] ?? null;
}

async function archiveChannelForServiceRequest(env: Env, type: ServiceRequestType): Promise<string | null> {
  const key = archiveMappingKeyForServiceRequestType(type);
  if (!key) return null;
  const row = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ? OR channel_name = ?")
    .bind(key, key)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function markDiscordFailure(env: Env, requestId: string, actorId: string, eventType: string, auditAction: string, cause: unknown) {
  await env.DB!.prepare("UPDATE service_requests SET discord_ticket_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(requestId)
    .run();
  const details = discordFailureDetails(cause, {
    action: eventType === "PRIVATE_CHANNEL_FAILED"
      ? "create_private_channel"
      : eventType === "REQUEST_CHANNEL_EMBED_FAILED"
        ? "post_request_channel_embed"
        : "post_private_embed"
  });
  await addServiceRequestEvent(env, requestId, actorId, eventType, formatDiscordFailure(details), {
    discord: details,
    reason: details.discordMessage ?? safeError(cause),
    likelyFix: details.likelyFix
  });
  await audit(env, auditAction, { request_id: requestId, reason: details.discordMessage, status: details.status, discord_code: details.discordCode }, actorId);
}

function isChannelPostRequest(detail: Pick<ServiceRequestDetail, "requestType">): boolean {
  const def = serviceDefinition(detail.requestType);
  return def?.discordWorkflow === "CHANNEL_POST";
}

export async function getServiceRequestDetail(env: Env, id: string): Promise<ServiceRequestDetail | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(baseSelect("WHERE sr.id = ? OR sr.request_number = ?")).bind(id, id).first<RequestRow>();
  if (!row) return null;
  return { ...rowToSummary(row), payload: parsePayload(row.payloadJson), events: await requestEvents(env, row.id) };
}

async function requestEvents(env: Env, id: string) {
  const result = await env.DB!.prepare(
    "SELECT id, request_id as requestId, actor_user_id as actorUserId, event_type as eventType, message, metadata_json as metadataJson, created_at as createdAt FROM service_request_events WHERE request_id = ? ORDER BY created_at ASC"
  )
    .bind(id)
    .all<{ id: string; requestId: string; actorUserId: string | null; eventType: string; message: string | null; metadataJson: string; createdAt: string }>();
  return result.results.map((event) => ({ ...event, metadata: parsePayload(event.metadataJson) }));
}

export async function addServiceRequestEvent(
  env: Env,
  requestId: string,
  actorUserId: string | null,
  eventType: string,
  message: string,
  metadata: Record<string, unknown>
) {
  await env.DB!.prepare(
    "INSERT INTO service_request_events (id, request_id, actor_user_id, event_type, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), requestId, actorUserId, eventType, message, JSON.stringify(metadata))
    .run();
}

async function nextRequestNumber(env: Env, type: ServiceRequestType, prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await env.DB!.prepare(
    `INSERT INTO request_number_counters (id, request_type, year, last_number, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(request_type, year) DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING last_number as lastNumber`
  )
    .bind(`${type}-${year}`, type, year)
    .first<{ lastNumber: number }>();
  if (!row) throw new Error("Could not generate request number.");
  return `${prefix}-${year}-${String(row.lastNumber).padStart(4, "0")}`;
}

async function mappingId(env: Env, key: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ?")
    .bind(key)
    .first<{ id: string }>();
  return row?.id || null;
}

async function roleIdsByPermissions(env: Env, permissions: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const permission of permissions) {
    const result = await env.DB!.prepare("SELECT discord_role_id as id FROM role_mappings WHERE permission_key = ? AND is_reference_only = 0")
      .bind(permission)
      .all<{ id: string }>();
    ids.push(...result.results.map((row) => row.id));
  }
  return [...new Set(ids)];
}

async function roleIdByName(env: Env, roleName: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_role_id as id FROM role_mappings WHERE role_name = ?").bind(roleName).first<{ id: string }>();
  return row?.id ?? null;
}

async function accessRoleIds(env: Env, detail: ServiceRequestDetail): Promise<string[]> {
  const base = await roleIdsByPermissions(env, ["JUDGE", "JUSTICE", "CHIEF_JUSTICE", "ADMIN"]);
  if (detail.requestType === "CRIMINAL_TRIAL" || detail.requestType.includes("WARRANT")) {
    base.push(...(await roleIdsByPermissions(env, ["PROSECUTOR"])));
  }
  const selected = await pingRoleIds(env, detail);
  return [...new Set([...base, ...selected])];
}

async function pingRoleIds(env: Env, detail: ServiceRequestDetail): Promise<string[]> {
  if (detail.requestType !== "LAWYER") {
    const selected = detail.assignedRoleKey ? await roleIdByName(env, detail.assignedRoleKey) : null;
    return selected ? [selected] : [];
  }
  const preferred = String(detail.payload.preferredRepresentation ?? "");
  const representationType = String(detail.payload.representationType ?? "");
  const inCustody = String(detail.payload.inCustody ?? "");
  const ids: string[] = [];
  const pd = await roleIdByName(env, "Public Defender");
  const defense = await roleIdByName(env, "Defense Attorney");
  if ((preferred.includes("Public Defender") || inCustody === "yes" || representationType.includes("Cellside")) && pd) ids.push(pd);
  if ((preferred.includes("Private") || representationType.includes("Civil") || representationType.includes("Expungement")) && defense) ids.push(defense);
  if (preferred.includes("No preference")) {
    if (pd) ids.push(pd);
    if (defense) ids.push(defense);
  }
  return [...new Set(ids)];
}

async function serviceRequestMentions(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<ServiceRequestMentions> {

  const requesterDiscordId =

    detail.submittedByDiscordId ||

    ctx.user?.discordId ||

    ctx.discordId ||

    "";



  const roleIds: string[] = [];



  if (detail.serviceType === "LAWYER") {

    const preferred = String(detail.payload.preferredRepresentation ?? "").toLowerCase();



    const publicDefenderRoleId = "1395614223861678160";

    const privatePractitionerRoleId = "1395614223861678159";



    if (preferred.includes("public defender")) {

      roleIds.push(publicDefenderRoleId);

    } else if (preferred.includes("private")) {

      roleIds.push(privatePractitionerRoleId);

    } else {

      roleIds.push(publicDefenderRoleId, privatePractitionerRoleId);

    }



    return {

      userIds: requesterDiscordId ? [requesterDiscordId] : [],

      roleIds: Array.from(new Set(roleIds)),

    };

  }



  return {

    userIds: requesterDiscordId ? [requesterDiscordId] : [],

    roleIds: [],

  };

}



async function serviceRequestMentions(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<ServiceRequestMentions> {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const requesterDiscordId = validDiscordId(detail.requesterDiscordId) ? detail.requesterDiscordId : validDiscordId(ctx.user.discordId) ? ctx.user.discordId : null;
  if (requesterDiscordId) userIds.add(requesterDiscordId);

  for (const id of await servicePingRoleIds(env, detail)) roleIds.add(id);
  const lawyerDiscordId = await resolveLawyerDiscordId(env, detail.payload);
  if (lawyerDiscordId) userIds.add(lawyerDiscordId);
  return {
    userIds: [...userIds],
    roleIds: [...roleIds]
  };
}?

function canAssignJudge(ctx: AuthContext): boolean {
  return canAssignAnyJudge(ctx) ||
    ctx.permissions.includes("JUDGE") ||
    ctx.permissions.includes("JUSTICE") ||
    ctx.permissions.includes("CHIEF_JUSTICE") ||
    ctx.permissions.includes("ADMIN");
}

function canAssignAnyJudge(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "ADMIN") ||
    hasActionPermission(ctx, "MANAGE_REQUESTS") ||
    ctx.isBootstrapAdmin;
}

async function listEligibleJudges(env: Env): Promise<EligibleJudge[]> {
  const roleMappings = await configuredJudicialRoleMappings(env);
  const roleIds = roleMappings.map((role) => role.id);
  if (roleIds.length === 0) throw new Error("No active Judge role mapping is configured.");
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const judges = new Map<string, EligibleJudge>();
  let after = "0";
  for (let page = 0; page < 10; page += 1) {
    const endpoint = `/guilds/${guildId}/members?limit=1000&after=${encodeURIComponent(after)}`;
    const response = await discordApi(env, endpoint);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const details = parseDiscordErrorDetails(text);
      console.warn(JSON.stringify({
        event: "discord_judge_member_list_failed",
        action: "list_eligible_judges",
        endpoint,
        guildId,
        status: response.status,
        discordCode: details.code,
        discordMessage: details.message
      }));
      if (response.status === 403) {
        const fallback = await cachedEligibleJudges(env, roleMappings);
        if (fallback.length > 0) return fallback;
        throw new Error("Discord bot cannot access guild members. Check bot guild access and enable Server Members Intent / GUILD_MEMBERS intent in the Discord Developer Portal.");
      }
      throw new Error(`Discord judge member list failed with ${response.status}: ${details.message ?? text.slice(0, 180)}`);
    }
    const members = await response.json() as Array<{ user?: { id: string; username: string; global_name?: string | null; avatar?: string | null }; roles?: string[]; nick?: string | null; avatar?: string | null }>;
    if (members.length === 0) break;
    for (const member of members) {
      const user = member.user;
      if (!user?.id || !member.roles?.some((roleId) => roleIds.includes(roleId))) continue;
      const judicialRank = judicialRankForRoles(member.roles ?? [], roleMappings);
      const displayName = formatFormalJudgeName(cleanOptional(member.nick) ?? cleanOptional(user.global_name) ?? user.username, judicialRank);
      judges.set(user.id, {
        discordUserId: user.id,
        portalUserId: await portalUserIdForDiscordId(env, user.id),
        displayName,
        username: user.username,
        judicialRank,
        avatarUrl: member.avatar
          ? `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png`
          : avatarUrl({ id: user.id, username: user.username, global_name: user.global_name ?? null, avatar: user.avatar ?? null })
      });
    }
    after = members[members.length - 1]?.user?.id ?? after;
    if (members.length < 1000) break;
  }
  return [...judges.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function cachedEligibleJudges(env: Env, roleMappings: JudicialRoleMapping[]): Promise<EligibleJudge[]> {
  const roleIds = roleMappings.map((role) => role.id);
  if (roleIds.length === 0) return [];
  const placeholders = roleIds.map(() => "?").join(", ");
  const result = await env.DB!.prepare(
    `SELECT DISTINCT
       u.id as portalUserId,
       u.discord_id as discordUserId,
       u.display_name as displayName,
       COALESCE(u.discord_username, u.display_name) as username,
       u.avatar_url as avatarUrl,
       GROUP_CONCAT(urc.discord_role_id) as roleIds,
       MAX(urc.cached_at) as cachedAt
     FROM user_role_cache urc
     JOIN users u ON u.id = urc.user_id
     WHERE urc.discord_role_id IN (${placeholders})
       AND u.discord_id IS NOT NULL
     GROUP BY u.id, u.discord_id, u.display_name, u.discord_username, u.avatar_url
     ORDER BY u.display_name ASC`
  )
    .bind(...roleIds)
    .all<{ portalUserId: string; discordUserId: string; displayName: string; username: string; avatarUrl: string | null; roleIds: string | null; cachedAt: string }>();
  return result.results
    .filter((row) => validDiscordId(row.discordUserId))
    .map((row) => {
      const matchedRoleIds = (row.roleIds ?? "").split(",").filter(Boolean);
      const judicialRank = judicialRankForRoles(matchedRoleIds, roleMappings);
      return {
        discordUserId: row.discordUserId,
        portalUserId: row.portalUserId,
        displayName: formatFormalJudgeName(row.displayName, judicialRank),
        username: row.username,
        avatarUrl: row.avatarUrl,
        judicialRank
      };
    });
}

export async function resolveEligibleJudge(env: Env, discordUserId: string): Promise<EligibleJudge | null> {
  const roleMappings = await configuredJudicialRoleMappings(env);
  const roleIds = roleMappings.map((role) => role.id);
  if (roleIds.length === 0) throw new Error("No active Judge role mapping is configured.");
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const response = await discordApi(env, `/guilds/${guildId}/members/${discordUserId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 403) return cachedEligibleJudgeByDiscordId(env, roleMappings, discordUserId);
    throw new Error(`Discord judge member fetch failed with ${response.status}: ${text.slice(0, 180)}`);
  }
  const member = await response.json() as { user?: { id: string; username: string; global_name?: string | null; avatar?: string | null }; roles?: string[]; nick?: string | null; avatar?: string | null };
  const user = member.user;
  if (!user?.id || !member.roles?.some((roleId) => roleIds.includes(roleId))) return null;
  const judicialRank = judicialRankForRoles(member.roles ?? [], roleMappings);
  const displayName = formatFormalJudgeName(cleanOptional(member.nick) ?? cleanOptional(user.global_name) ?? user.username, judicialRank);
  return {
    discordUserId: user.id,
    portalUserId: await portalUserIdForDiscordId(env, user.id),
    displayName,
    username: user.username,
    judicialRank,
    avatarUrl: member.avatar
      ? `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png`
      : avatarUrl({ id: user.id, username: user.username, global_name: user.global_name ?? null, avatar: user.avatar ?? null })
  };
}

export async function portalUserIdForDiscordId(env: Env, discordId: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT id FROM users WHERE discord_id = ?")
    .bind(discordId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function cachedEligibleJudgeByDiscordId(env: Env, roleMappings: JudicialRoleMapping[], discordUserId: string): Promise<EligibleJudge | null> {
  const judges = await cachedEligibleJudges(env, roleMappings);
  return judges.find((judge) => judge.discordUserId === discordUserId) ?? null;
}

interface JudicialRoleMapping {
  id: string;
  roleName: string;
  permissionKey: string;
}

async function configuredJudicialRoleMappings(env: Env): Promise<JudicialRoleMapping[]> {
  const result = await env.DB!.prepare(
    `SELECT discord_role_id as id, role_name as roleName, permission_key as permissionKey
     FROM role_mappings
     WHERE permission_key IN ('JUDGE', 'JUSTICE', 'CHIEF_JUSTICE')
       AND is_reference_only = 0`
  ).all<{ id: string; roleName: string; permissionKey: string }>();
  const seen = new Set<string>();
  return result.results
    .filter((row) => validDiscordId(row.id) && !seen.has(row.id) && seen.add(row.id))
    .map((row) => ({ id: row.id, roleName: row.roleName, permissionKey: row.permissionKey }));
}

export function formatFormalJudgeName(name: string, rank = "Judge"): string {
  const cleaned = stripExistingJudgeTitle(cleanOptional(name) ?? "Judge");
  return `Honorable ${rank || "Judge"} ${cleaned}`.replace(/\s+/g, " ").trim();
}

function judicialRankForRoles(roleIds: string[], mappings: JudicialRoleMapping[]): string {
  const matched = mappings.filter((mapping) => roleIds.includes(mapping.id));
  if (matched.some((mapping) => mapping.permissionKey === "CHIEF_JUSTICE")) return "Chief Justice";
  const justice = matched.find((mapping) => mapping.permissionKey === "JUSTICE");
  if (justice) return /associate/i.test(justice.roleName) ? "Associate Justice" : "Justice";
  const judge = matched.find((mapping) => mapping.permissionKey === "JUDGE");
  if (judge) return /magistrate/i.test(judge.roleName) ? "Magistrate Judge" : "Judge";
  return "Judge";
}

function stripExistingJudgeTitle(name: string): string {
  return name
    .replace(/^hon(?:\.|orable)?\s+/i, "")
    .replace(/^(chief\s+(?:of\s+)?justice|chief justice|associate justice|supreme court justice|justice|magistrate judge|judge)\s+/i, "")
    .trim();
}

function parseDiscordErrorDetails(text: string): { code: number | null; message: string | null } {
  try {
    const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
    return {
      code: typeof parsed.code === "number" ? parsed.code : null,
      message: typeof parsed.message === "string" ? parsed.message : null
    };
  } catch {
    return { code: null, message: text.slice(0, 180) || null };
  }
}

async function postJudgeAssignmentPing(env: Env, detail: ServiceRequestDetail, judgeDiscordId: string, judgeDisplayName: string): Promise<void> {
  if (!detail.discordTicketChannelId || !validDiscordId(judgeDiscordId)) return;
  const response = await discordApi(env, `/channels/${detail.discordTicketChannelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `<@${judgeDiscordId}> you have been assigned to ${detail.requestNumber}.`,
      allowed_mentions: { parse: [], users: [judgeDiscordId], roles: [] }
    })
  });
  if (!response.ok) throw new Error(`Discord judge assignment ping failed with ${response.status}`);
  await addServiceRequestEvent(env, detail.id, null, "ASSIGNED_JUDGE_PING_POSTED", "Assigned judge ping posted to private Discord ticket channel.", {
    assigned_judge_discord_id: judgeDiscordId,
    assigned_judge_display_name: judgeDisplayName,
    channel_id: detail.discordTicketChannelId
  });
}

async function servicePingRoleIds(env: Env, detail: ServiceRequestDetail): Promise<string[]> {
  const ids = await roleIdsByNames(env, SERVICE_PING_ROLE_NAMES[detail.requestType] ?? []);
  ids.push(...(await pingRoleIds(env, detail)));
  const assigned = detail.assignedRoleKey ? await roleIdByName(env, detail.assignedRoleKey) : null;
  if (assigned) ids.push(assigned);
  return [...new Set(ids.filter(validDiscordId))];
}

async function roleIdsByNames(env: Env, roleNames: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const roleName of roleNames) {
    const id = await roleIdByName(env, roleName);
    if (id) ids.push(id);
  }
  return ids;
}

async function resolveLawyerDiscordId(env: Env, payload: Record<string, unknown>): Promise<string | null> {
  for (const field of LAWYER_PROFILE_FIELDS) {
    const value = readString(payload, field);
    if (!value) continue;
    const resolved = await lawyerDiscordIdByStructuredValue(env, value);
    if (resolved) return resolved;
  }
  for (const field of LAWYER_DISCORD_ID_FIELDS) {
    const value = readString(payload, field);
    const discordId = extractDiscordUserId(value);
    if (discordId && await knownDiscordUser(env, discordId)) return discordId;
  }
  return null;
}

async function lawyerDiscordIdByStructuredValue(env: Env, value: string): Promise<string | null> {
  const row = await env.DB!.prepare(
    `SELECT u.discord_id as discordId
     FROM attorney_profiles ap
     JOIN users u ON u.id = ap.user_id
     WHERE ap.deleted_at IS NULL
       AND (ap.id = ? OR ap.profile_slug = ? OR ap.bar_number = ?)
     LIMIT 1`
  )
    .bind(value, value, value)
    .first<{ discordId: string | null }>();
  const discordId = row?.discordId ?? null;
  return validDiscordId(discordId) ? discordId : null;
}

async function knownDiscordUser(env: Env, discordId: string): Promise<boolean> {
  const row = await env.DB!.prepare("SELECT id FROM users WHERE discord_id = ? LIMIT 1").bind(discordId).first<{ id: string }>();
  return Boolean(row);
}

function extractDiscordUserId(value: string): string | null {
  const trimmed = value.trim();
  const mention = trimmed.match(/^<@!?(\d{17,20})>$/);
  const id = mention?.[1] ?? trimmed;
  return validDiscordId(id) ? id : null;
}

function validDiscordId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

async function selectedPingRoleId(env: Env, type: ServiceRequestType, payload: Record<string, unknown>): Promise<string | null> {
  if (type !== "LAWYER") return null;
  const fakeDetail = {
    requestType: "LAWYER",
    payload,
    assignedRoleKey: null
  } as ServiceRequestDetail;
  const ids = await pingRoleIds(env, fakeDetail);
  return ids[0] ?? null;
}

function validateInput(input: CreateServiceRequestInput): { ok: true } | { ok: false; message: string } {
  const def = serviceDefinition(input?.requestType);
  if (!def) return { ok: false, message: "Unsupported service request type." };
  if (!input.payload || typeof input.payload !== "object") return { ok: false, message: "Request payload is required." };
  const serialized = JSON.stringify(input.payload);
  if (serialized.length > JSON_LIMIT) return { ok: false, message: "Request payload is too large." };
  if (/<[^>]+>/.test(serialized)) return { ok: false, message: "HTML is not allowed in request fields." };
  for (const field of def.requiredFields) {
    if (!readString(input.payload, field)) return { ok: false, message: `${field} is required.` };
  }
  for (const field of def.confirmFields ?? []) {
    if (input.payload[field] !== true) return { ok: false, message: `${field} must be confirmed.` };
  }
  const documentUrl = cleanOptional(input.documentUrl ?? readString(input.payload, "documentUrl"));
  if (def.documentRequired && !documentUrl) return { ok: false, message: "Completed document link is required." };
  if (documentUrl && !isValidHttpUrl(documentUrl)) return { ok: false, message: "Document link must be a valid http(s) URL." };
  if (def.documentRequired && documentUrl && !isGoogleDocsUrl(documentUrl)) {
    return { ok: false, message: "Template-based requests must use a Google Docs link." };
  }
  const urgency = readString(input.payload, "urgency");
  if (urgency && !["Emergency / currently detained", "Same day", "Normal"].includes(urgency)) {
    return { ok: false, message: "Urgency is not valid." };
  }
  return { ok: true };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") cleaned[key] = value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, 2000);
    else if (typeof value === "boolean" || typeof value === "number") cleaned[key] = value;
  }
  return cleaned;
}

function rowToSummary(row: RequestRow): ServiceRequestSummary {
  const payload = parsePayload(row.payloadJson);
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    requestType: row.requestType,
    status: row.status,
    requesterUserId: row.requesterUserId,
    requesterDiscordId: row.requesterDiscordId,
    requesterDiscordUsername: row.requesterDiscordUsername,
    requesterContact: row.requesterContact,
    documentUrl: row.documentUrl,
    templateUrl: row.templateUrl,
    discordPublicChannelId: row.discordPublicChannelId,
    discordTicketStatus: row.discordTicketStatus,
    discordTicketChannelId: row.discordTicketChannelId,
    discordTicketMessageId: row.discordTicketMessageId,
    discordTicketCategoryId: row.discordTicketCategoryId,
    discordTicketClosedAt: row.discordTicketClosedAt,
    discordTicketDeletedAt: row.discordTicketDeletedAt,
    discordTicketTranscriptId: row.discordTicketTranscriptId,
    assignedRoleKey: row.assignedRoleKey,
    assignedJudgeUserId: row.assignedJudgeUserId,
    assignedJudgeDisplayName: row.assignedJudgeDisplayName,
    assignedJudgeDiscordId: row.assignedJudgeDiscordId,
    assignedJudgeAssignedAt: row.assignedJudgeAssignedAt,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
    deletedByDisplayName: row.deletedByDisplayName,
    deleteReason: row.deleteReason,
    mainParty: readString(payload, serviceDefinition(row.requestType)?.mainPartyField ?? "mainParty") || "Unknown",
    shortTitle: row.publicSummary || "Service request",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function baseSelect(suffix: string): string {
  return `SELECT sr.id, sr.request_number as requestNumber, sr.request_type as requestType, sr.status,
    sr.requester_user_id as requesterUserId, u.discord_id as requesterDiscordId,
    sr.requester_discord_username as requesterDiscordUsername, sr.requester_contact as requesterContact,
    sr.payload_json as payloadJson, sr.public_summary as publicSummary, sr.document_url as documentUrl,
    sr.template_url as templateUrl, sr.discord_public_channel_id as discordPublicChannelId, sr.discord_ticket_status as discordTicketStatus,
    sr.discord_ticket_channel_id as discordTicketChannelId, sr.discord_ticket_message_id as discordTicketMessageId,
    sr.discord_ticket_category_id as discordTicketCategoryId, sr.discord_ticket_closed_at as discordTicketClosedAt,
    sr.discord_ticket_deleted_at as discordTicketDeletedAt, sr.discord_ticket_transcript_id as discordTicketTranscriptId,
    sr.assigned_role_key as assignedRoleKey, sr.assigned_judge_user_id as assignedJudgeUserId,
    sr.assigned_judge_display_name as assignedJudgeDisplayName, sr.assigned_judge_discord_id as assignedJudgeDiscordId,
    sr.assigned_judge_assigned_at as assignedJudgeAssignedAt,
    sr.deleted_at as deletedAt, sr.deleted_by_user_id as deletedByUserId,
    sr.deleted_by_display_name as deletedByDisplayName, sr.delete_reason as deleteReason,
    sr.created_at as createdAt, sr.updated_at as updatedAt
    FROM service_requests sr LEFT JOIN users u ON u.id = sr.requester_user_id ${suffix}`;
}

interface RequestRow {
  id: string;
  requestNumber: string;
  requestType: ServiceRequestType;
  status: ServiceRequestStatus;
  requesterUserId: string | null;
  requesterDiscordId: string | null;
  requesterDiscordUsername: string | null;
  requesterContact: string | null;
  payloadJson: string;
  publicSummary: string | null;
  documentUrl: string | null;
  templateUrl: string | null;
  discordPublicChannelId: string | null;
  discordTicketStatus: DiscordTicketStatus;
  discordTicketChannelId: string | null;
  discordTicketMessageId: string | null;
  discordTicketCategoryId: string | null;
  discordTicketClosedAt: string | null;
  discordTicketDeletedAt: string | null;
  discordTicketTranscriptId: string | null;
  assignedRoleKey: string | null;
  assignedJudgeUserId: string | null;
  assignedJudgeDisplayName: string | null;
  assignedJudgeDiscordId: string | null;
  assignedJudgeAssignedAt: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isGoogleDocsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname === "docs.google.com";
  } catch {
    return false;
  }
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 180) : "Unknown error";
}
