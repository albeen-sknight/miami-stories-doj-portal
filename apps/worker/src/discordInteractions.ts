/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Discord Slash Command Interactions
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: (c) 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type {
  ActionPermission,
  BarExamAttemptStatus,
  DocketCaseType,
  DocketProceedingType,
  DocketStatus,
  LogicalPermission,
  ServiceRequestType
} from "@shotta-doj/shared";
import { BAR_EXAM_ATTEMPT_STATUSES, DOCKET_CASE_TYPES, DOCKET_PROCEEDING_TYPES, DOCKET_STATUSES } from "@shotta-doj/shared";
import { audit } from "./audit";
import { archiveMappingKeyForServiceRequestType, createServiceRequestForContext, getServiceRequestDetail, addServiceRequestEvent, closeServiceRequestTicketForContext } from "./serviceRequests";
import { discordApi, requireEnv } from "./discord";
import { CASE_TYPE_PREFIX } from "./docketDefinitions";
import { errorJson } from "./http";
import { deriveActionPermissions, hasActionPermission, PermissionError, requireAnyPermission, requirePermission } from "./permissions";
import { serviceDefinition } from "./serviceDefinitions";
import { softDeleteEntityForContext, restoreEntityForContext, type DeletionEntityType } from "./deletionLog";
import { appendTranscriptSystemEvent, fetchChannelTranscriptEntries, transcriptSystemEvent } from "./ticketTranscriptCapture";
import type { AuthContext, AuthUser, CachedRole, Env } from "./types";

const EPHEMERAL = 1 << 6;
const DISCORD_API_BASE = "https://discord.com/api/v10";

type InteractionType = 1 | 2 | 3;
type OptionValue = string | number | boolean;

interface DiscordInteraction {
  id: string;
  type: InteractionType;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: DiscordInteractionUser;
    nick?: string | null;
    roles?: string[];
  };
  user?: DiscordInteractionUser;
  data?: {
    name: string;
    custom_id?: string;
    options?: Array<{ name: string; type: number; value?: OptionValue; options?: Array<{ name: string; type: number; value?: OptionValue }> }>;
  };
}

interface DiscordInteractionUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordInteractionResponse {
  type: 1 | 4 | 5 | 6 | 7;
  data?: {
    content?: string;
    flags?: number;
    components?: DiscordComponent[];
  };
}

interface DiscordComponent {
  type: number;
  components?: Array<{ type: number; style: number; label: string; custom_id: string }>;
}

export async function discordInteractions(request: Request, env: Env, executionCtx?: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return errorJson("METHOD_NOT_ALLOWED", "Use POST for Discord interactions.", 405);
  let interaction: DiscordInteraction | null = null;
  let commandName: string | null = null;
  let actorDiscordId: string | null = null;
  try {
    const rawBody = await request.text();
    const verified = await verifyDiscordRequest(request, env, rawBody);
    if (!verified) return new Response("Bad request signature", { status: 401 });

    interaction = JSON.parse(rawBody) as DiscordInteraction;
    commandName = interaction.data?.name ?? null;
    actorDiscordId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
    if (interaction.type === 1) return loggedInteractionResponse(interaction, { type: 1 }, null);
    if (interaction.type === 3) return handleComponentInteraction(env, interaction, executionCtx);
    if (interaction.type !== 2 || !interaction.data?.name) {
      return loggedInteractionResponse(interaction, messageResponse("Unsupported Discord interaction.", true), null);
    }

    const publicResponse = handlePublicCommand(env, interaction);
    if (publicResponse) return loggedInteractionResponse(interaction, publicResponse, null);

    if (executionCtx) {
      const response = deferredResponse(true);
      logInteraction(interaction, response, null);
      executionCtx.waitUntil(processDeferredCommand(env, interaction, commandName, actorDiscordId));
      return interactionJson(response);
    }

    const response = await processCommand(env, interaction);
    return interactionJson(response);
  } catch (cause) {
    if (cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")) {
      const response = messageResponse("You do not have permission to use this command.", true);
      logInteraction(interaction, response, null, safeError(cause));
      return interactionJson(response);
    }
    const response = messageResponse("An internal error occurred while handling this command. Staff can check Worker logs.", true);
    logInteraction(interaction, response, null, safeError(cause), commandName, actorDiscordId);
    console.error(JSON.stringify({
      event: "discord_interaction_failed",
      interactionType: interaction?.type ?? null,
      command: commandName,
      actorDiscordUserId: actorDiscordId,
      responseType: response.type,
      cause: safeError(cause)
    }));
    return interactionJson(response);
  }
}

async function processDeferredCommand(env: Env, interaction: DiscordInteraction, commandName: string | null, actorDiscordId: string | null) {
  try {
    const response = await processCommand(env, interaction);
    await editOriginalInteractionResponse(env, interaction, response);
  } catch (cause) {
    const response = cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")
      ? messageResponse("You do not have permission to use this command.", true)
      : messageResponse("An internal error occurred while handling this command. Staff can check Worker logs.", true);
    logInteraction(interaction, response, null, safeError(cause), commandName, actorDiscordId);
    console.error(JSON.stringify({
      event: "discord_deferred_interaction_failed",
      interactionType: interaction.type,
      command: commandName,
      actorDiscordUserId: actorDiscordId,
      cause: safeError(cause)
    }));
    await editOriginalInteractionResponse(env, interaction, response);
  }
}

async function processCommand(env: Env, interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const ctx = await authContextFromInteraction(env, interaction);
  const response = normalizeInteractionResponse(await handleCommand(env, ctx, interaction));
  logInteraction(interaction, response, ctx);
  return response;
}

function handleComponentInteraction(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const customId = interaction.data?.custom_id ?? "";
  if (!customId.startsWith("ticket_close:")) {
    return loggedInteractionResponse(interaction, messageResponse("Unsupported DOJ ticket action.", true), null);
  }
  const parsed = parseCloseTicketCustomId(customId);
  const actorDiscordId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  if (!parsed || !actorDiscordId || parsed.actorDiscordId !== actorDiscordId) {
    return loggedInteractionResponse(interaction, updateMessageResponse("This close confirmation belongs to another user or has expired. Run `/close` again."), null);
  }
  if (parsed.action === "cancel") {
    return loggedInteractionResponse(interaction, updateMessageResponse("Ticket close cancelled. No transcript was created and no channel was deleted."), null);
  }
  const response = deferredUpdateResponse();
  logInteraction(interaction, response, null);
  const work = processCloseTicketConfirmation(env, interaction, parsed.requestId, decodeCloseReason(parsed.reasonToken), parsed.commandName);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

async function processCloseTicketConfirmation(env: Env, interaction: DiscordInteraction, requestId: string, reason: string, commandName: string | null) {
  try {
    const ctx = requirePermission(await authContextFromInteraction(env, interaction), "MANAGE_REQUESTS");
    const result = await closeServiceRequestTicketForContext(env, ctx, requestId, reason, "discord", {
      commandName: commandName ?? "close",
      interactionId: interaction.id
    });
    const close = result.close;
    await editOriginalInteractionResponse(env, interaction, messageResponse([
      `Ticket close completed for **${result.detail.requestNumber}**.`,
      close.transcriptId ? `Transcript: **${close.transcriptId}**` : null,
      close.archiveChannelId ? `Archive: <#${close.archiveChannelId}>` : null,
      close.deletedChannel ? "Private Discord ticket channel deleted." : "No private Discord channel was deleted."
    ].filter(Boolean).join("\n"), true));
  } catch (cause) {
    await editOriginalInteractionResponse(env, interaction, messageResponse(`Ticket close failed: ${safeError(cause)}\nThe channel was not deleted unless transcript/archive and DB close had already completed.`, true));
  }
}

function handlePublicCommand(env: Env, interaction: DiscordInteraction): DiscordInteractionResponse | null {
  const command = interaction.data?.name ?? "";
  if (command === "help") {
    return messageResponse(
      [
        "**Miami Stories DOJ Portal**",
        "Use the web portal for full DOJ services: requests, legal resources, public docket, lawyer directory, and Bar Exam.",
        "Common actions: request a lawyer, file DOJ service requests, view the public docket, take the Bar Exam, and contact staff through service tickets.",
        env.PUBLIC_APP_URL ? `Portal: ${env.PUBLIC_APP_URL}` : ""
      ].filter(Boolean).join("\n"),
      true
    );
  }
  if (command === "bar-help") {
    return messageResponse("Bar Exam candidates should use the DOJ Portal Bar Exam page. Reviewers should use `/lookup-bar-attempt` or the reviewer dashboard. Answer keys and rubrics are never posted to Discord.", true);
  }
  return null;
}

async function handleCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const command = interaction.data?.name ?? "";
  const options = optionMap(interaction);
  switch (command) {
    case "help":
      return handlePublicCommand(env, interaction) ?? messageResponse("Use the DOJ Portal for help.", true);
    case "hcommand":
      requireAnyPermission(ctx, ["VIEW_DASHBOARD", "MANAGE_REQUESTS", "CREATE_DOCKET", "REVIEW_BAR_EXAMS", "MANAGE_FAQ", "MANAGE_RESOURCES", "ADMIN"]);
      return messageResponse(
        [
          "**DOJ Staff Commands**",
          "`/create-docket`, `/lookup-request`, `/lookup-docket`, `/lookup-bar-attempt`",
          "`/close`, `/close-ticket`, `/transcript-ticket`, `/delete-ticket`",
          "`/delete-record`, `/restore-record`",
          "`/post-faq`, `/post-faq-category`, `/post-resources`"
        ].join("\n"),
        true
      );
    case "request-lawyer":
      return requestLawyer(env, ctx, options);
    case "request-service":
      return requestService(env, ctx, options);
    case "create-docket":
      return createDocketFromDiscord(env, ctx, options);
    case "close":
      return closeTicket(env, ctx, interaction, options);
    case "lookup-request":
      return lookupRequest(env, ctx, options);
    case "lookup-docket":
      return lookupDocket(env, ctx, options);
    case "lookup-bar-attempt":
      return lookupBarAttempt(env, ctx, options);
    case "close-ticket":
      return closeTicket(env, ctx, interaction, options);
    case "transcript-ticket":
      return transcriptTicket(env, ctx, interaction, options);
    case "delete-ticket":
      return deleteTicket(env, ctx, interaction, options);
    case "delete-record":
      return deleteRecord(env, ctx, options);
    case "restore-record":
      return restoreRecord(env, ctx, options);
    case "post-faq":
      return postFaq(env, ctx, options);
    case "post-faq-category":
      return postFaqCategory(env, ctx, options);
    case "post-resources":
      return postResources(env, ctx, options);
    case "bar-help":
      return handlePublicCommand(env, interaction) ?? messageResponse("Use the DOJ Portal Bar Exam page.", true);
    default:
      return messageResponse("Unknown DOJ command.", true);
  }
}

async function requestLawyer(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  const name = stringOption(options, "in_city_name") || ctx.user.displayName;
  const input = {
    requestType: "LAWYER" as const,
    payload: {
      characterFullName: name,
      citizenId: "Discord slash command",
      representationType: "General legal advice",
      preferredRepresentation: "No preference",
      inCustody: "no",
      urgency: stringOption(options, "urgency") || "Normal",
      publicSummary: "Seeking legal counsel through the DOJ lawyer request process.",
      briefDescription: stringOption(options, "reason") || "Lawyer requested from Discord.",
      preferredContactMethod: stringOption(options, "phone_or_contact") || "Discord",
      notes: stringOption(options, "notes") || ""
    },
    requesterContact: stringOption(options, "phone_or_contact") || undefined
  };
  const result = await createServiceRequestForContext(env, ctx, input);
  if (!result.ok) return messageResponse(result.message, true);
  return messageResponse(`Lawyer request created: **${result.data.requestNumber}**. Staff will follow up in the request-a-lawyer channel.`, true);
}

async function requestService(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  const type = normalizeServiceType(stringOption(options, "service_type"));
  if (!type || type === "LAWYER" || type === "GENERAL") return messageResponse("Choose a supported service type other than LAWYER. Use `/request-lawyer` for lawyer requests.", true);
  const name = stringOption(options, "in_city_name") || ctx.user.displayName;
  const summary = stringOption(options, "summary") || "Service request submitted from Discord.";
  const documentUrl = stringOption(options, "document_url") || "";
  const payload = servicePayload(type, name, summary, documentUrl, stringOption(options, "urgency") || "Normal");
  const result = await createServiceRequestForContext(env, ctx, { requestType: type, payload, requesterContact: stringOption(options, "contact") || undefined, documentUrl: documentUrl || undefined });
  if (!result.ok) return messageResponse(result.message, true);
  const channel = result.data.discordTicketChannelId ? `\nChannel: ${discordChannelUrl(env, result.data.discordTicketChannelId)}` : "";
  return messageResponse(`Service request created: **${result.data.requestNumber}**${channel}`, true);
}

async function createDocketFromDiscord(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]);
  if (!env.DB) return messageResponse("D1 is not available.", true);
  const title = stringOption(options, "title");
  if (!title) return messageResponse("Missing required option: title.", true);
  const caseType = normalizeCaseType(stringOption(options, "case_type"));
  const status = normalizeDocketStatus(stringOption(options, "status"));
  const scheduledAt = stringOption(options, "scheduled_at");
  const linked = stringOption(options, "linked_request");
  const linkedRequest = linked ? await findRequest(env, linked) : null;
  const id = crypto.randomUUID();
  const docketNumber = await nextDocketNumber(env, caseType);
  const summary = stringOption(options, "summary") || "Docket entry created from Discord slash command.";
  const isPublic = Boolean(options.get("publish"));
  await env.DB.prepare(
    `INSERT INTO docket_entries (
      id, docket_number, case_id, title, entry_type, case_type, proceeding_type, plaintiff, defendant,
      individuals_involved_json, judge_user_id, judge_name, status, filed_on, scheduled_for, scheduled_timezone,
      scheduled_discord_timestamp, scheduled_discord_relative, summary, summary_markdown, public_notes_markdown,
      private_notes_markdown, linked_service_request_id, linked_private_ticket_channel_id, linked_petition_url,
      discord_sync_status, is_public, is_archived, visibility, published_at, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', ?, ?, ?, ?, ?, 'America/New_York', NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, 'NOT_POSTED', ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`
  ).bind(
    id,
    docketNumber,
    docketNumber,
    title,
    caseType,
    caseType,
    proceedingFromCaseType(caseType),
    ctx.user.id,
    ctx.user.displayName,
    status,
    new Date().toISOString().slice(0, 10),
    scheduledAt || null,
    summary,
    summary,
    stringOption(options, "location"),
    linkedRequest?.id ?? null,
    linkedRequest?.discordTicketChannelId ?? null,
    linkedRequest?.documentUrl ?? null,
    isPublic ? 1 : 0,
    isPublic ? "PUBLIC" : "PRIVATE",
    isPublic ? new Date().toISOString() : null,
    JSON.stringify({ source: "discord_slash_command", channel_id: options.get("_channel_id") ?? null })
  ).run();
  await audit(env, "DOCKET_CREATED_FROM_DISCORD", { docket_id: id, docket_number: docketNumber }, ctx.user.id);
  return messageResponse(`Docket created: **${docketNumber}**${isPublic ? " and marked public." : "."}`, true);
}

async function lookupRequest(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["MANAGE_REQUESTS", "CREATE_DOCKET", "PUBLISH_DOCKET", "ADMIN"]);
  const id = stringOption(options, "id_or_number");
  if (!id) return messageResponse("Missing required option: id_or_number.", true);
  const detail = await getServiceRequestDetail(env, id);
  if (!detail) return messageResponse("Request not found.", true);
  return messageResponse([
    `**${detail.requestNumber}**`,
    `Type: ${detail.requestType.replaceAll("_", " ")}`,
    `Status: ${detail.status}`,
    `Requester: ${detail.requesterDiscordUsername ?? detail.mainParty}`,
    `Submitted: ${new Date(detail.createdAt).toLocaleString()}`,
    detail.discordTicketChannelId ? `Private channel: ${discordChannelUrl(env, detail.discordTicketChannelId)}` : null
  ].filter(Boolean).join("\n"), true);
}

async function lookupDocket(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["CREATE_DOCKET", "PUBLISH_DOCKET", "MANAGE_REQUESTS", "ADMIN"]);
  const id = stringOption(options, "id_or_number");
  if (!id) return messageResponse("Missing required option: id_or_number.", true);
  if (!env.DB) return messageResponse("D1 is not available.", true);
  const row = await env.DB.prepare(
    `SELECT id, docket_number as docketNumber, title, case_type as caseType, proceeding_type as proceedingType,
      status, is_public as isPublic, scheduled_for as scheduledFor, linked_service_request_id as linkedServiceRequestId,
      deleted_at as deletedAt FROM docket_entries WHERE id = ? OR docket_number = ?`
  ).bind(id, id).first<Record<string, string | number | null>>();
  if (!row || row.deletedAt) return messageResponse("Docket not found.", true);
  return messageResponse([
    `**${row.docketNumber}**`,
    `${row.title}`,
    `Type: ${row.caseType} / ${row.proceedingType}`,
    `Status: ${row.status}`,
    `Visibility: ${row.isPublic ? "Public" : "Private"}`,
    row.scheduledFor ? `Scheduled: ${row.scheduledFor}` : null
  ].filter(Boolean).join("\n"), true);
}

async function lookupBarAttempt(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireReviewer(ctx);
  const id = stringOption(options, "id_or_number");
  if (!id) return messageResponse("Missing required option: id_or_number.", true);
  if (!env.DB) return messageResponse("D1 is not available.", true);
  const row = await env.DB.prepare(
    `SELECT id, attempt_number as attemptNumber, discord_username as discordUsername, candidate_name as candidateName,
      exam_track as examTrack, version_label as versionLabel, status, submitted_at as submittedAt,
      final_score as finalScore, decision, followup_channel_id as followupChannelId
     FROM bar_exam_attempts WHERE (id = ? OR attempt_number = ?) AND deleted_at IS NULL`
  ).bind(id, id).first<Record<string, string | number | null>>();
  if (!row) return messageResponse("Bar Exam attempt not found.", true);
  return messageResponse([
    `**${row.attemptNumber}**`,
    `Candidate: ${row.candidateName ?? row.discordUsername ?? "Unknown"}`,
    `Track/version: ${row.examTrack} / ${row.versionLabel}`,
    `Status: ${row.status}`,
    row.submittedAt ? `Submitted: ${row.submittedAt}` : null,
    row.finalScore != null ? `Score: ${row.finalScore}` : null,
    row.decision ? `Decision: ${row.decision}` : null,
    row.followupChannelId ? `Follow-up channel: ${discordChannelUrl(env, row.followupChannelId)}` : null
  ].filter(Boolean).join("\n"), true);
}

async function closeTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  return closeTicketPrompt(env, ctx, interaction, options);
}

async function closeTicketPrompt(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requirePermission(ctx, "MANAGE_REQUESTS");
  const target = await resolveTicketTarget(env, options, interaction.channel_id);
  if (!target || target.sourceType !== "request" || !target.sourceId) {
    return messageResponse("This command only closes linked DOJ service request private ticket channels.", true);
  }
  const reason = stringOption(options, "reason") || "Confirmed from Discord close command.";
  const actorId = ctx.user.discordId;
  const reasonToken = encodeCloseReason(reason);
  const requestKey = target.sourceNumber ?? target.sourceId;
  return messageResponse(
    `Are you sure you want to close **${target.sourceNumber ?? target.sourceId}**?\nA transcript will be created and archived first. If transcript/archive fails, the channel will not be deleted.`,
    true,
    closeTicketComponents(actorId, requestKey, reasonToken, interaction.data?.name ?? "close")
  );
}

async function transcriptTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManager(ctx);
  const target = await resolveTicketTarget(env, options, interaction.channel_id);
  if (!target) return messageResponse("Ticket target not found.", true);
  const transcript = await generateTranscript(env, target, ctx, "transcript-ticket");
  const archive = await postTranscriptArchive(env, target, transcript, ctx);
  return messageResponse(`Transcript stored: **${transcript.id}** (${transcript.messageCount} messages).${archive ? `\nArchive: ${archive}` : "\nArchive channel is not configured."}`, true);
}

async function deleteTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManager(ctx);
  const reason = stringOption(options, "reason");
  if (!reason) return messageResponse("Missing required option: reason.", true);
  const target = await resolveTicketTarget(env, options, interaction.channel_id);
  if (!target) return messageResponse("Ticket target not found.", true);
  if (target.sourceType === "request" && target.sourceId) {
    const result = await closeServiceRequestTicketForContext(env, ctx, target.sourceId, reason, "discord", { commandName: "delete-ticket" });
    return messageResponse([
      `Ticket close completed for **${result.detail.requestNumber}**.`,
      result.close.transcriptId ? `Transcript: **${result.close.transcriptId}**` : null,
      result.close.archiveChannelId ? `Archive: <#${result.close.archiveChannelId}>` : null,
      result.close.deletedChannel ? "Private Discord ticket channel deleted." : "No private Discord channel was deleted."
    ].filter(Boolean).join("\n"), true);
  }
  const transcript = await generateTranscript(env, target, ctx, "delete-ticket");
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    `Ticket channel deletion requested by ${ctx.user.displayName}.`,
    ctx,
    "discord",
    { commandName: "delete-ticket", sourceType: target.sourceType, sourceId: target.sourceId, channelId: target.channelId }
  ));
  await discordApi(env, `/channels/${target.channelId}`, { method: "DELETE" });
  await markTicketDeleted(env, target, ctx, reason, transcript.id);
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    "Ticket channel deleted after transcript storage.",
    ctx,
    "discord",
    { commandName: "delete-ticket", sourceType: target.sourceType, sourceId: target.sourceId, channelId: target.channelId }
  ));
  return messageResponse(`Ticket channel deleted after transcript **${transcript.id}** was stored. The portal record was not deleted.`, true);
}

async function deleteRecord(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  const entityType = normalizeEntityType(stringOption(options, "entity_type"));
  const id = stringOption(options, "id_or_number");
  const reason = stringOption(options, "reason");
  if (!entityType) return messageResponse("Missing required option: entity_type.", true);
  if (!id) return messageResponse("Missing required option: id_or_number.", true);
  if (!reason) return messageResponse("Missing required option: reason.", true);
  const log = await softDeleteEntityForContext(env, ctx, entityType, id, reason);
  if (!log) return messageResponse("Record not found.", true);
  return messageResponse(`Soft-deleted **${entityType}** ${id}. It remains in the protected Trash / Deletion Log.`, true);
}

async function restoreRecord(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  const entityType = normalizeEntityType(stringOption(options, "entity_type"));
  const id = stringOption(options, "id_or_number");
  const reason = stringOption(options, "reason");
  if (!entityType) return messageResponse("Missing required option: entity_type.", true);
  if (!id) return messageResponse("Missing required option: id_or_number.", true);
  if (!reason) return messageResponse("Missing required option: reason.", true);
  const log = await restoreEntityForContext(env, ctx, entityType, id, reason);
  if (!log) return messageResponse("Deleted record not found.", true);
  return messageResponse(`Restored **${entityType}** ${id}.`, true);
}

async function postFaq(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["MANAGE_FAQ", "ADMIN"]);
  const query = stringOption(options, "query");
  const channelId = await mappedChannel(env, "faq");
  if (!channelId) return messageResponse("FAQ Discord channel is not configured.", true);
  const row = await env.DB!.prepare(
    `SELECT question, answer_markdown as answerMarkdown, category FROM faq_entries
     WHERE is_public = 1 AND deleted_at IS NULL AND (id = ? OR question LIKE ?) ORDER BY sort_order LIMIT 1`
  ).bind(query, `%${query}%`).first<{ question: string; answerMarkdown: string; category: string }>();
  if (!row) return messageResponse("FAQ entry not found.", true);
  await postEmbed(env, channelId, { title: row.question, description: truncate(row.answerMarkdown, 3900), footer: { text: row.category } });
  return messageResponse(`Posted FAQ to <#${channelId}>.`, true);
}

async function postFaqCategory(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["MANAGE_FAQ", "ADMIN"]);
  const category = stringOption(options, "category");
  const channelId = await mappedChannel(env, "faq");
  if (!channelId) return messageResponse("FAQ Discord channel is not configured.", true);
  const result = await env.DB!.prepare(
    `SELECT question, answer_markdown as answerMarkdown FROM faq_entries
     WHERE is_public = 1 AND deleted_at IS NULL AND category = ? ORDER BY sort_order LIMIT 10`
  ).bind(category).all<{ question: string; answerMarkdown: string }>();
  if (result.results.length === 0) return messageResponse("No public FAQ entries found for that category.", true);
  for (const row of result.results) await postEmbed(env, channelId, { title: row.question, description: truncate(row.answerMarkdown, 3900), footer: { text: category } });
  return messageResponse(`Posted ${result.results.length} FAQ entries to <#${channelId}>.`, true);
}

async function postResources(env: Env, ctx: AuthContext, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, ["MANAGE_RESOURCES", "ADMIN"]);
  const category = stringOption(options, "category");
  const channelId = await mappedChannel(env, "resource-compendium");
  if (!channelId) return messageResponse("Resource Discord channel is not configured.", true);
  const result = await env.DB!.prepare(
    `SELECT title, description, url, category FROM resource_documents
     WHERE is_public = 1 AND deleted_at IS NULL AND (? = '' OR category = ?)
     ORDER BY category, sort_order, title LIMIT 10`
  ).bind(category, category).all<{ title: string; description: string; url: string; category: string }>();
  if (result.results.length === 0) return messageResponse("No public resources found for that filter.", true);
  for (const row of result.results) await postEmbed(env, channelId, { title: row.title, description: truncate(`${row.description}\n${row.url}`, 3900), footer: { text: row.category } });
  return messageResponse(`Posted ${result.results.length} resources to <#${channelId}>.`, true);
}

async function authContextFromInteraction(env: Env, interaction: DiscordInteraction): Promise<AuthContext> {
  if (!env.DB) throw new Error("D1 is required for Discord commands.");
  const sourceUser = interaction.member?.user ?? interaction.user;
  if (!sourceUser?.id) throw new Error("Discord interaction did not include a user.");
  const displayName = interaction.member?.nick || sourceUser.global_name || sourceUser.username;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, discord_id, discord_username, discord_global_name, display_name, avatar_url, email, last_login_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(discord_id) DO UPDATE SET discord_username = excluded.discord_username,
       discord_global_name = excluded.discord_global_name, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`
  ).bind(id, sourceUser.id, sourceUser.username, sourceUser.global_name ?? null, displayName).run();
  const user = await env.DB.prepare(
    "SELECT id, discord_id as discordId, discord_username as discordUsername, discord_global_name as discordGlobalName, display_name as displayName, avatar_url as avatarUrl, last_login_at as lastLoginAt FROM users WHERE discord_id = ?"
  ).bind(sourceUser.id).first<AuthUser>();
  if (!user) throw new Error("Discord command user could not be loaded.");

  const roles: CachedRole[] = [];
  for (const roleId of interaction.member?.roles ?? []) {
    const mapping = await env.DB.prepare("SELECT role_name as roleName, permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ?").bind(roleId).first<{ roleName: string | null; permissionKey: LogicalPermission | null }>();
    roles.push({ discordRoleId: roleId, roleName: mapping?.roleName ?? null, cachedAt: new Date().toISOString() });
    await env.DB.prepare(
      `INSERT INTO user_role_cache (id, user_id, discord_role_id, role_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, discord_role_id) DO UPDATE SET role_name = excluded.role_name, cached_at = CURRENT_TIMESTAMP`
    ).bind(crypto.randomUUID(), user.id, roleId, mapping?.roleName ?? null).run();
  }

  const permissions = new Set<LogicalPermission>(["PUBLIC"]);
  for (const role of roles) {
    const row = await env.DB.prepare("SELECT permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ? AND is_reference_only = 0").bind(role.discordRoleId).first<{ permissionKey: LogicalPermission | null }>();
    if (row?.permissionKey) permissions.add(row.permissionKey);
  }
  const bootstrap = (env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? "").split(",").map((value) => value.trim()).includes(user.discordId);
  if (bootstrap) {
    permissions.add("ADMIN");
    permissions.add("CHIEF_JUSTICE");
  }
  const logical = [...permissions].sort() as LogicalPermission[];
  return { authenticated: true, sessionId: `discord:${interaction.id}`, user, roles, permissions: logical, actionPermissions: deriveActionPermissions(logical), isBootstrapAdmin: bootstrap };
}

async function verifyDiscordRequest(request: Request, env: Env, rawBody: string): Promise<boolean> {
  const publicKey = env.DISCORD_PUBLIC_KEY;
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const keyBytes = hexToBytes(publicKey).buffer as ArrayBuffer;
    const signatureBytes = hexToBytes(signature).buffer as ArrayBuffer;
    const messageBytes = new TextEncoder().encode(timestamp + rawBody).buffer as ArrayBuffer;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" } as Algorithm, false, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" } as Algorithm, key, signatureBytes, messageBytes);
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_signature_verify_failed", cause: safeError(cause) }));
    return false;
  }
}

function interactionJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json; charset=utf-8" } });
}

function interactionReply(content: string, ephemeral = true): Response {
  return interactionJson(messageResponse(content, ephemeral));
}

function deferredResponse(ephemeral = true): DiscordInteractionResponse {
  return { type: 5, data: { flags: ephemeral ? EPHEMERAL : undefined } };
}

function deferredUpdateResponse(): DiscordInteractionResponse {
  return { type: 6 };
}

function updateMessageResponse(content: string, components: DiscordComponent[] = []): DiscordInteractionResponse {
  return { type: 7, data: { content: truncate(content, 1900), components } };
}

async function editOriginalInteractionResponse(env: Env, interaction: DiscordInteraction, response: DiscordInteractionResponse): Promise<void> {
  const applicationId = requireEnv(env, "DISCORD_CLIENT_ID");
  const content = response.data?.content || "Done.";
  const result = await fetch(`${DISCORD_API_BASE}/webhooks/${applicationId}/${interaction.token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: truncate(content, 1900), components: response.data?.components ?? [], allowed_mentions: { parse: [] } })
  });
  if (!result.ok) {
    const text = await result.text();
    console.warn(JSON.stringify({
      event: "discord_interaction_edit_failed",
      command: interaction.data?.name ?? null,
      status: result.status,
      details: text.slice(0, 300)
    }));
  }
}

function loggedInteractionResponse(interaction: DiscordInteraction, response: DiscordInteractionResponse, ctx: AuthContext | null): Response {
  logInteraction(interaction, response, ctx);
  return interactionJson(response);
}

function normalizeInteractionResponse(value: unknown): DiscordInteractionResponse {
  if (isInteractionResponse(value)) return value;
  return messageResponse("An internal error occurred while handling this command. Staff can check Worker logs.", true);
}

function isInteractionResponse(value: unknown): value is DiscordInteractionResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.type === 1) return true;
  if (record.type === 5) return true;
  if (record.type === 6) return true;
  if (record.type === 7) return true;
  if (record.type !== 4) return false;
  const data = record.data;
  return Boolean(data && typeof data === "object" && typeof (data as Record<string, unknown>).content === "string");
}

function logInteraction(
  interaction: DiscordInteraction | null,
  response: DiscordInteractionResponse,
  ctx: AuthContext | null,
  caughtErrorMessage?: string,
  fallbackCommandName?: string | null,
  fallbackActorDiscordId?: string | null
) {
  const command = interaction?.data?.name ?? fallbackCommandName ?? null;
  const actorDiscordUserId = interaction?.member?.user?.id ?? interaction?.user?.id ?? ctx?.user.discordId ?? fallbackActorDiscordId ?? null;
  const subcommand = interaction?.data?.options?.find((option) => option.type === 1 || option.type === 2)?.name ?? null;
  const payload: Record<string, unknown> = {
    event: caughtErrorMessage ? "discord_interaction_error_response" : "discord_interaction_response",
    interactionType: interaction?.type ?? null,
    command,
    subcommand,
    actorDiscordUserId,
    responseType: response.type
  };
  if (caughtErrorMessage) payload.caughtErrorMessage = caughtErrorMessage;
  const line = JSON.stringify(payload);
  if (caughtErrorMessage) console.warn(line);
  else console.log(line);
}

function messageResponse(content: string, ephemeral = true, components?: DiscordComponent[]): DiscordInteractionResponse {
  return { type: 4, data: { content: truncate(content, 1900), flags: ephemeral ? EPHEMERAL : undefined, components } };
}

function discordChannelUrl(env: Env, channelId: string | number): string {
  const guildId = env.DISCORD_GUILD_ID || "REPLACE_WITH_MIAMI_DISCORD_GUILD_ID";
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function closeTicketComponents(actorDiscordId: string, requestId: string, reasonToken: string, commandName = "close"): DiscordComponent[] {
  const commandToken = commandName.replaceAll(/[^\w-]/g, "").slice(0, 24) || "close";
  return [{
    type: 1,
    components: [
      { type: 2, style: 4, label: "Confirm close", custom_id: `ticket_close:confirm:${actorDiscordId}:${requestId}:${reasonToken}:${commandToken}` },
      { type: 2, style: 2, label: "Cancel", custom_id: `ticket_close:cancel:${actorDiscordId}:${requestId}:x:${commandToken}` }
    ]
  }];
}

function parseCloseTicketCustomId(customId: string): { action: "confirm" | "cancel"; actorDiscordId: string; requestId: string; reasonToken: string; commandName: string | null } | null {
  const parts = customId.split(":");
  if ((parts.length !== 5 && parts.length !== 6) || parts[0] !== "ticket_close") return null;
  const action = parts[1] === "confirm" || parts[1] === "cancel" ? parts[1] : null;
  if (!action || !/^\d{17,20}$/.test(parts[2]) || !parts[3]) return null;
  return { action, actorDiscordId: parts[2], requestId: parts[3], reasonToken: parts[4] || "", commandName: parts[5] || null };
}

function encodeCloseReason(reason: string): string {
  const compact = reason.replaceAll(/[^\w .,-]/g, "").trim().slice(0, 24) || "Discord close";
  return btoa(compact).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeCloseReason(token: string): string {
  if (!token || token === "x") return "Confirmed from Discord close command.";
  try {
    const padded = token.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    return atob(padded).trim() || "Confirmed from Discord close command.";
  } catch {
    return "Confirmed from Discord close command.";
  }
}

function optionMap(interaction: DiscordInteraction): Map<string, OptionValue> {
  const map = new Map<string, OptionValue>();
  for (const option of interaction.data?.options ?? []) {
    if (option.value !== undefined) map.set(option.name, option.value);
    for (const nested of option.options ?? []) if (nested.value !== undefined) map.set(nested.name, nested.value);
  }
  if (interaction.channel_id) map.set("_channel_id", interaction.channel_id);
  return map;
}

function stringOption(options: Map<string, OptionValue>, key: string): string {
  const value = options.get(key);
  return typeof value === "string" ? value.trim().slice(0, 1800) : "";
}

function normalizeServiceType(value: string): ServiceRequestType | null {
  const normalized = value.toUpperCase().replace(/-/g, "_");
  const alias: Record<string, ServiceRequestType> = { WARRANT: "ARREST_WARRANT", SEARCH_SEIZURE: "SEARCH_SEIZURE_WARRANT" };
  const mapped = alias[normalized] ?? normalized;
  return serviceDefinition(mapped) ? (mapped as ServiceRequestType) : null;
}

function servicePayload(type: ServiceRequestType, name: string, summary: string, documentUrl: string, urgency: string): Record<string, unknown> {
  const templateConfirm = { confirmCopy: true, confirmRenamed: true, confirmEditorPermissions: true };
  switch (type) {
    case "CRIMINAL_TRIAL":
      return { arrestReportNumber: "Discord request", defendantName: name, allegedCharges: summary, briefSummary: summary, schedulingNotes: urgency };
    case "CIVIL_CASE":
      return { ...templateConfirm, plaintiffFullName: name, defendantName: "Pending", complaintType: "Discord civil case", documentUrl, filingSummary: summary };
    case "SUBPOENA":
      return { ...templateConfirm, submittingParty: name, caseSubject: summary, recipient: "Pending", subpoenaType: "Other", documentUrl, relevanceSummary: summary };
    case "ARREST_WARRANT":
      return { caseNumber: "Discord request", defendantName: name, charges: summary, probableCauseSummary: summary, confirmAccurateTimely: true };
    case "SEARCH_SEIZURE_WARRANT":
      return { ...templateConfirm, caseNumber: "Discord request", target: name, requestingOfficerAgency: "Pending", probableCauseFacts: summary, evidenceRequested: summary, documentUrl };
    case "EXPUNGEMENT":
      return { ...templateConfirm, applicantFullName: name, applicantCitizenId: "Pending", offenses: summary, reasonForExpungement: summary, documentUrl, confirmCrimeFree: true, confirmWitnesses: true, confirmRehabilitation: true, confirmCourtFee: true };
    case "MARRIAGE":
      return { spouseOneName: name, spouseOneCitizenId: "Pending", spouseTwoName: "Pending", spouseTwoCitizenId: "Pending", ceremonyDateTime: "Pending", contactInfo: "Discord", notes: summary };
    case "DIVORCE":
      return { petitionerName: name, petitionerCitizenId: "Pending", respondentName: "Pending", reasonForDivorce: summary, contactInfo: "Discord" };
    default:
      return { mainParty: name, summary };
  }
}

async function findRequest(env: Env, id: string) {
  return getServiceRequestDetail(env, id);
}

async function nextDocketNumber(env: Env, caseType: DocketCaseType): Promise<string> {
  const prefix = CASE_TYPE_PREFIX[caseType] ?? "DKT";
  const year = new Date().getUTCFullYear();
  const row = await env.DB!.prepare(
    `INSERT INTO docket_number_counters (id, prefix, year, last_number, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(prefix, year) DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING last_number as lastNumber`
  ).bind(`${prefix}-${year}`, prefix, year).first<{ lastNumber: number }>();
  if (!row) throw new Error("Could not generate docket number.");
  return `${prefix}-${year}-${String(row.lastNumber).padStart(4, "0")}`;
}

function normalizeCaseType(value: string): DocketCaseType {
  return DOCKET_CASE_TYPES.includes(value as DocketCaseType) ? value as DocketCaseType : "OTHER";
}

function normalizeDocketStatus(value: string): DocketStatus {
  return DOCKET_STATUSES.includes(value as DocketStatus) ? value as DocketStatus : "DRAFT";
}

function proceedingFromCaseType(caseType: DocketCaseType): DocketProceedingType {
  const map: Partial<Record<DocketCaseType, DocketProceedingType>> = {
    CRIMINAL: "PRELIMINARY_HEARING",
    CIVIL: "CIVIL_CASE_REVIEW",
    WARRANT: "WARRANT_REVIEW",
    SUBPOENA: "SUBPOENA_REVIEW",
    EXPUNGEMENT: "EXPUNGEMENT_HEARING",
    MARRIAGE: "MARRIAGE_CERTIFICATE_REVIEW",
    DIVORCE: "DIVORCE_REVIEW"
  };
  return DOCKET_PROCEEDING_TYPES.includes(map[caseType] ?? "OTHER") ? map[caseType] ?? "OTHER" : "OTHER";
}

function requireReviewer(ctx: AuthContext) {
  if (hasActionPermission(ctx, "REVIEW_BAR_EXAMS") || hasActionPermission(ctx, "ADMIN") || ctx.permissions.includes("BAR_ASSOCIATION_MEMBER") || ctx.permissions.includes("CHIEF_JUSTICE") || ctx.permissions.includes("JUSTICE")) return;
  throw new PermissionError("REVIEW_BAR_EXAMS");
}

function requireTicketManager(ctx: AuthContext) {
  requireAnyPermission(ctx, ["MANAGE_REQUESTS", "CREATE_DOCKET", "PUBLISH_DOCKET", "REVIEW_BAR_EXAMS", "ADMIN"]);
}

async function resolveTicketTarget(env: Env, options: Map<string, OptionValue>, currentChannelId?: string): Promise<TicketTarget | null> {
  const id = stringOption(options, "id_or_number");
  if (id) {
    const request = await getServiceRequestDetail(env, id);
    if (request?.discordTicketChannelId) return { sourceType: "request", sourceId: request.id, sourceNumber: request.requestNumber, channelId: request.discordTicketChannelId, channelName: request.requestNumber.toLowerCase(), requestType: request.requestType };
    const attempt = await env.DB!.prepare("SELECT id, attempt_number as attemptNumber, followup_channel_id as followupChannelId FROM bar_exam_attempts WHERE id = ? OR attempt_number = ?").bind(id, id).first<{ id: string; attemptNumber: string; followupChannelId: string | null }>();
    if (attempt?.followupChannelId) return { sourceType: "bar_exam_followup", sourceId: attempt.id, sourceNumber: attempt.attemptNumber, channelId: attempt.followupChannelId, channelName: attempt.attemptNumber.toLowerCase(), requestType: "BAR_EXAM_FOLLOWUP" };
  }
  if (!currentChannelId) return null;
  const request = await env.DB!.prepare("SELECT id, request_number as requestNumber, request_type as requestType, discord_ticket_channel_id as channelId FROM service_requests WHERE discord_ticket_channel_id = ?").bind(currentChannelId).first<{ id: string; requestNumber: string; requestType: ServiceRequestType; channelId: string }>();
  if (request) return { sourceType: "request", sourceId: request.id, sourceNumber: request.requestNumber, channelId: request.channelId, channelName: request.requestNumber.toLowerCase(), requestType: request.requestType };
  const attempt = await env.DB!.prepare("SELECT id, attempt_number as attemptNumber, followup_channel_id as channelId FROM bar_exam_attempts WHERE followup_channel_id = ?").bind(currentChannelId).first<{ id: string; attemptNumber: string; channelId: string }>();
  return attempt ? { sourceType: "bar_exam_followup", sourceId: attempt.id, sourceNumber: attempt.attemptNumber, channelId: attempt.channelId, channelName: attempt.attemptNumber.toLowerCase(), requestType: "BAR_EXAM_FOLLOWUP" } : null;
}

async function generateTranscript(env: Env, target: TicketTarget, ctx: AuthContext, commandName = "transcript-ticket") {
  const id = crypto.randomUUID();
  const messages = [
    ...await fetchChannelTranscriptEntries(env, target.channelId),
    transcriptSystemEvent(`Honorable transcript action /${commandName} requested by ${ctx.user.displayName}.`, ctx, "discord", {
      commandName,
      sourceType: target.sourceType,
      sourceId: target.sourceId,
      sourceNumber: target.sourceNumber,
      channelId: target.channelId
    }),
    transcriptSystemEvent(`Transcript ${id} generated and stored by ${ctx.user.displayName}.`, ctx, "discord", {
      transcriptId: id,
      sourceType: target.sourceType,
      sourceId: target.sourceId,
      sourceNumber: target.sourceNumber
    })
  ];
  await env.DB!.prepare(
    `INSERT INTO discord_ticket_transcripts (id, source_type, source_id, source_number, discord_channel_id, discord_channel_name,
      message_count, transcript_json, created_by_user_id, created_by_display_name, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, target.sourceType, target.sourceId, target.sourceNumber, target.channelId, target.channelName, messages.length, JSON.stringify(messages), ctx.user.id, ctx.user.displayName, JSON.stringify({ generated_by: "discord_slash_command" })).run();
  if (target.sourceType === "request") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "DISCORD_TRANSCRIPT_STORED", "Discord ticket transcript stored.", { transcript_id: id, message_count: messages.length });
  } else {
    await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id, target.sourceId).run();
  }
  await audit(env, "DISCORD_TICKET_TRANSCRIPT_STORED", { source_type: target.sourceType, source_id: target.sourceId, transcript_id: id, message_count: messages.length }, ctx.user.id);
  return { id, messageCount: messages.length };
}

async function postTranscriptArchive(env: Env, target: TicketTarget, transcript: { id: string; messageCount: number }, ctx?: AuthContext): Promise<string | null> {
  const channelId = await archiveChannelFor(env, target.requestType);
  if (!channelId) return null;
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: `Transcript stored for ${target.sourceNumber ?? target.sourceId}: ${transcript.id} (${transcript.messageCount} messages).\nPortal: ${transcriptPortalUrl(env, transcript.id)}` })
  });
  const message = response.ok ? await response.json() as { id: string } : null;
  await env.DB!.prepare("UPDATE discord_ticket_transcripts SET archive_channel_id = ?, archive_message_id = ? WHERE id = ?").bind(channelId, message?.id ?? null, transcript.id).run();
  if (ctx && message?.id) {
    await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
      `Transcript archive message posted to <#${channelId}>.`,
      ctx,
      "discord",
      { sourceType: target.sourceType, sourceId: target.sourceId, archiveChannelId: channelId, archiveMessageId: message.id }
    ));
  }
  return `<#${channelId}>`;
}

function transcriptPortalUrl(env: Env, transcriptId: string): string {
  const base = (env.PUBLIC_APP_URL || "https://miami-stories-doj.pages.dev").replace(/\/+$/, "");
  return `${base}/dashboard/transcripts/${encodeURIComponent(transcriptId)}`;
}

async function archiveChannelFor(env: Env, type: string): Promise<string | null> {
  return mappedChannel(env, archiveMappingKeyForServiceRequestType(type as ServiceRequestType | "BAR_EXAM_FOLLOWUP") ?? "");
}

async function mappedChannel(env: Env, key: string): Promise<string | null> {
  if (!key) return null;
  const row = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ? OR channel_name = ?").bind(key, key).first<{ id: string }>();
  return row?.id ?? null;
}

async function markTicketClosed(env: Env, target: TicketTarget, ctx: AuthContext, reason: string) {
  if (target.sourceType === "request") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_closed_at = CURRENT_TIMESTAMP, discord_ticket_closed_by_user_id = ?, discord_ticket_close_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "PRIVATE_CHANNEL_CLOSED", "Private Discord ticket channel closed.", { reason, channel_id: target.channelId });
  } else {
    await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_closed_at = CURRENT_TIMESTAMP, followup_channel_closed_by_user_id = ?, followup_channel_close_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, target.sourceId).run();
  }
  await audit(env, "DISCORD_TICKET_CLOSED", { source_type: target.sourceType, source_id: target.sourceId, reason }, ctx.user.id);
}

async function markTicketDeleted(env: Env, target: TicketTarget, ctx: AuthContext, reason: string, transcriptId: string) {
  if (target.sourceType === "request") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_deleted_at = CURRENT_TIMESTAMP, discord_ticket_deleted_by_user_id = ?, discord_ticket_delete_reason = ?, discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, transcriptId, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "PRIVATE_CHANNEL_DELETED", "Private Discord ticket channel deleted after transcript capture.", { reason, channel_id: target.channelId, transcript_id: transcriptId });
  } else {
    await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_deleted_at = CURRENT_TIMESTAMP, followup_channel_deleted_by_user_id = ?, followup_channel_delete_reason = ?, followup_channel_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, transcriptId, target.sourceId).run();
  }
  await audit(env, "DISCORD_TICKET_DELETED", { source_type: target.sourceType, source_id: target.sourceId, transcript_id: transcriptId, reason }, ctx.user.id);
}

async function postEmbed(env: Env, channelId: string, embed: Record<string, unknown>) {
  const response = await discordApi(env, `/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ embeds: [embed] }) });
  if (!response.ok) throw new Error(`Discord post failed with ${response.status}`);
}

function normalizeEntityType(value: string): DeletionEntityType | null {
  const normalized = value.toLowerCase();
  if (["docket", "request", "faq", "resource", "bar_exam_attempt", "bar_exam_version", "judicial_record"].includes(normalized)) return normalized as DeletionEntityType;
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 180) : "Unknown error";
}

interface TicketTarget {
  sourceType: "request" | "bar_exam_followup";
  sourceId: string | null;
  sourceNumber: string | null;
  channelId: string;
  channelName: string | null;
  requestType: ServiceRequestType | "BAR_EXAM_FOLLOWUP";
}
