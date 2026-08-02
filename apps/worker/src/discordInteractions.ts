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
  ServiceRequestDetail,
  ServiceRequestStatus,
  ServiceRequestType
} from "@shotta-doj/shared";
import { BAR_EXAM_ATTEMPT_STATUSES, DOCKET_CASE_TYPES, DOCKET_PROCEEDING_TYPES, DOCKET_STATUSES } from "@shotta-doj/shared";
import { audit } from "./audit";
import { archiveMappingKeyForServiceRequestType, createServiceRequestForContext, getServiceRequestDetail, getServiceRequestDetailByTicketChannel, addServiceRequestEvent, closeServiceRequestTicketForContext, latestServiceRequestTicketClaim } from "./serviceRequests";
import { postLawyerSticky, postServiceRequestEmbedToPrivateTicket } from "./serviceDiscord";
import { discordApi, fetchBotUser, fetchGuildMember, MissingEnvironmentError, requireEnv } from "./discord";
import { CASE_TYPE_PREFIX, docketSuggestionFromRequest } from "./docketDefinitions";
import { errorJson } from "./http";
import { hasActionPermission, isActionPermission, isLogicalPermission, mergeActionPermissions, PermissionError, requireAnyPermission, requirePermission } from "./permissions";
import { serviceDefinition } from "./serviceDefinitions";
import { softDeleteEntityForContext, restoreEntityForContext, type DeletionEntityType } from "./deletionLog";
import { appendTranscriptSystemEvent, fetchChannelTranscriptEntries, transcriptSystemEvent } from "./ticketTranscriptCapture";
import type { AuthContext, AuthUser, CachedRole, Env } from "./types";

const EPHEMERAL = 1 << 6;
const DISCORD_API_BASE = "https://discord.com/api/v10";
const VIEW_CHANNEL = 1024n;
const SEND_MESSAGES = 2048n;
const EMBED_LINKS = 16384n;
const ATTACH_FILES = 32768n;
const READ_HISTORY = 65536n;
const MANAGE_CHANNELS = 16n;
const MANAGE_ROLES = 268435456n;
const GUILD_TEXT_CHANNEL = 0;
const GUILD_CATEGORY_CHANNEL = 4;
const ANNOUNCEMENT_THREAD = 10;
const PUBLIC_THREAD = 11;
const PRIVATE_THREAD = 12;
const CHANNEL_ACCESS_ALLOW = VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY;
const MAX_LAYOUT_CHANNELS = 20;
const SAFE_LAYOUT_CHANNELS = 10;
const MAX_BULK_DELETE_CHANNELS = 20;
const DISCORD_TIMEOUT_MAX_SECONDS = 28 * 24 * 60 * 60;
const TICKET_MANAGEMENT_PERMISSIONS: ActionPermission[] = ["MANAGE_REQUESTS", "ADMIN"];
const DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS: ActionPermission[] = ["MANAGE_DISCORD_CHANNELS", "ADMIN"];
const DISCORD_MODERATION_PERMISSIONS: ActionPermission[] = ["MANAGE_DISCORD_MODERATION", "ADMIN"];
const DISCORD_ANNOUNCEMENT_PERMISSIONS: ActionPermission[] = ["MANAGE_ANNOUNCEMENTS", "MANAGE_DISCORD_CHANNELS", "ADMIN"];
const DISCORD_STAFF_ROLE_PERMISSION_KEYS = [
  "ADMIN",
  "CHIEF_JUSTICE",
  "JUSTICE",
  "JUDGE",
  "PROSECUTOR",
  "MANAGE_REQUESTS",
  "MANAGE_DISCORD_CHANNELS",
  "MANAGE_DISCORD_MODERATION",
  "MANAGE_DISCORD_LOGS"
] as const;
// Message/member event logging needs a Discord Gateway listener; this Worker only receives interactions.
const PROTECTED_CATEGORY_MAPPING_KEYS = [
  "CRIMINAL_TRIALS_CATEGORY",
  "CIVIL_CASES_CATEGORY",
  "SUBPOENAS_CATEGORY",
  "WARRANTS_CATEGORY",
  "EXPUNGEMENTS_CATEGORY",
  "MARRIAGE_DIVORCE_CATEGORY",
  "BAR_EXAM_FOLLOWUP_CATEGORY",
  "REQUEST_LAWYER_CATEGORY",
  "LAWYER_REQUESTS_CATEGORY"
] as const;
const LAWYER_RESPONSE_EVENT_TYPES = ["LAWYER_RESPONSE_CLAIMED", "LAWYER_RESPONSE_THREAD_CREATED_BY_STAFF"] as const;
const LAWYER_RESPONSE_OPENING_POSTED_EVENT = "LAWYER_RESPONSE_OPENING_POSTED";
const LAWYER_RESPONSE_PANEL_POSTED_EVENT = "LAWYER_RESPONSE_PANEL_POSTED";
const LAWYER_RESPONSE_DETAILS_POSTED_EVENT = "LAWYER_RESPONSE_DETAILS_POSTED";
const LAWYER_RESPONSE_MESSAGE_POST_FAILED_EVENT = "LAWYER_RESPONSE_MESSAGE_POST_FAILED";
const LAWYER_RESPONSE_SPACE_CLOSED_EVENT = "LAWYER_RESPONSE_SPACE_CLOSED";
const LAWYER_RESPONSE_DETAILS_NOTE = "These details are posted only inside this private attorney response space. Do not repost them publicly.";
const LAWYER_RESPONSE_DETAILS_MAX_EMBEDS = 8;
const LAWYER_RESPONSE_DETAILS_MAX_FIELD_NAME = 256;
const LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE = 1000;
const LAWYER_RESPONSE_DETAILS_MAX_FIELDS_PER_EMBED = 4;
const REQUEST_PANEL_STATUS_OPTIONS: ServiceRequestStatus[] = ["RECEIVED", "UNDER_REVIEW", "NEEDS_INFO", "CLOSED"];
const LAWYER_RESPONSE_PERMISSIONS: LogicalPermission[] = [
  "BAR_ACTIVE",
  "PUBLIC_DEFENDER_CERTIFIED",
  "DEFENSE_ATTORNEY",
  "BAR_ASSOCIATION_MEMBER",
  "ADMIN"
];
const LAWYER_RESPONSE_PARTICIPANT_PERMISSIONS: LogicalPermission[] = [
  "BAR_ACTIVE",
  "PUBLIC_DEFENDER_CERTIFIED",
  "DEFENSE_ATTORNEY",
  "BAR_ASSOCIATION_MEMBER",
  "PROSECUTOR",
  "JUDGE",
  "JUSTICE",
  "CHIEF_JUSTICE",
  "ADMIN"
];
const LAWYER_RESPONSE_CATEGORY_KEYS = ["REQUEST_LAWYER_CATEGORY", "LAWYER_REQUESTS_CATEGORY"] as const;
const LAWYER_CORE_DETAIL_FIELDS: LawyerPayloadFieldSpec[] = [
  { key: "characterFullName", label: "Character Full Name", inline: true },
  { key: "citizenId", label: "Citizen ID", inline: true },
  { key: "representationType", label: "Representation Type", inline: true },
  { key: "representationSubtype", label: "Representation Subtype", inline: true },
  { key: "preferredRepresentation", label: "Preferred Representation", inline: true },
  { key: "urgency", label: "Urgency", inline: true },
  { key: "publicSummary", label: "Public Summary" },
  { key: "briefDescription", label: "Private Case Details" },
  { key: "preferredContactMethod", label: "Preferred Contact Method", inline: true }
];
const LAWYER_ROUTE_DETAIL_FIELDS: Record<string, LawyerPayloadFieldSpec[]> = {
  "Criminal / Cellside": [
    { key: "inCustody", label: "In Custody?", inline: true },
    { key: "agencyHolding", label: "Agency Holding / Arresting Agency", inline: true },
    { key: "chargesReason", label: "Charges or Reason for Detention" },
    { key: "arrestingOfficer", label: "Arresting Officer", inline: true },
    { key: "caseNumber", label: "Case / MDT / Court / Request Number", inline: true },
    { key: "evidenceLinks", label: "Evidence / Document Links" }
  ],
  "Civil advice": [
    { key: "opposingParty", label: "Opposing Party / Respondent", inline: true },
    { key: "agencyDepartmentInvolved", label: "Agency or Department Involved", inline: true },
    { key: "formalCivilFiled", label: "Formal Civil Case Filed?", inline: true },
    { key: "desiredOutcome", label: "Desired Outcome" },
    { key: "caseNumber", label: "Case / MDT / Court / Request Number", inline: true },
    { key: "evidenceLinks", label: "Evidence / Document Links" }
  ],
  "General legal advice": [
    { key: "topicCategory", label: "Topic / Category", inline: true },
    { key: "relatedPeopleAgencies", label: "Related People or Agencies", inline: true },
    { key: "desiredOutcome", label: "Desired Outcome" }
  ],
  "Expungement advice": [
    { key: "priorChargesCases", label: "Prior Charges / Cases" },
    { key: "approximateCaseDate", label: "Date or Approximate Date of Case", inline: true },
    { key: "currentStatus", label: "Current Status", inline: true },
    { key: "desiredOutcome", label: "Desired Outcome" },
    { key: "caseNumber", label: "Case / MDT / Court / Request Number", inline: true },
    { key: "evidenceLinks", label: "Evidence / Document Links" }
  ],
  "Warrant/subpoena/evidence advice": [
    { key: "processInvolved", label: "Process Involved", inline: true },
    { key: "agencyRequestingParty", label: "Agency or Requesting Party", inline: true },
    { key: "legalAdviceNeeded", label: "Legal Advice Needed" },
    { key: "caseNumber", label: "Case / MDT / Court / Request Number", inline: true },
    { key: "evidenceLinks", label: "Evidence / Document Links" }
  ]
};

type InteractionType = 1 | 2 | 3 | 5;
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
    name?: string;
    custom_id?: string;
    values?: string[];
    components?: DiscordComponent[];
    options?: Array<{ name: string; type: number; value?: OptionValue; options?: Array<{ name: string; type: number; value?: OptionValue }> }>;
  };
  message?: {
    id: string;
    channel_id?: string;
  };
}

interface DiscordInteractionUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordInteractionResponse {
  type: 1 | 4 | 5 | 6 | 7 | 9;
  data?: {
    content?: string;
    flags?: number;
    components?: DiscordComponent[];
    allowed_mentions?: { parse?: string[]; users?: string[]; roles?: string[] };
    custom_id?: string;
    title?: string;
  };
}

interface DiscordComponent {
  type: number;
  style?: number;
  label?: string;
  custom_id?: string;
  value?: string;
  url?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  options?: Array<{ label: string; value: string; description?: string }>;
  components?: DiscordComponent[];
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
    if (interaction.type === 5) return handleModalSubmitInteraction(env, interaction, executionCtx);
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
      const response = messageResponse("You are not authorized to use this command.", true);
      logInteraction(interaction, response, null, safeError(cause));
      return interactionJson(response);
    }
    const commandError = commandErrorResponse(cause);
    if (commandError) {
      logInteraction(interaction, commandError, null, safeError(cause), commandName, actorDiscordId);
      return interactionJson(commandError);
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
      ? messageResponse("You are not authorized to use this command.", true)
      : commandErrorResponse(cause) ?? messageResponse("An internal error occurred while handling this command. Staff can check Worker logs.", true);
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
  if (customId.startsWith("lawyer_response:")) {
    return handleLawyerResponseComponent(env, interaction, executionCtx);
  }
  if (customId.startsWith("req:")) {
    return handleRequestPanelComponent(env, interaction, executionCtx);
  }
  if (customId.startsWith("law:")) {
    return handleLawyerPanelComponent(env, interaction, executionCtx);
  }
  if (customId.startsWith("ticket_action:")) {
    return handleTicketActionComponent(env, interaction, executionCtx);
  }
  if (!customId.startsWith("ticket_close:") && !customId.startsWith("tc:")) {
    return loggedInteractionResponse(interaction, messageResponse("Unsupported DOJ ticket action.", true), null);
  }
  const parsed = parseCloseTicketCustomId(customId);
  const actorDiscordId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  if (!parsed || !actorDiscordId || parsed.actorDiscordId !== actorDiscordId) {
    return loggedInteractionResponse(interaction, updateMessageResponse("This close confirmation belongs to another user or has expired. Run `/close-ticket` again."), null);
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

function handleTicketActionComponent(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const parsed = parseTicketActionCustomId(interaction.data?.custom_id ?? "");
  if (!parsed) return loggedInteractionResponse(interaction, messageResponse("Unsupported DOJ ticket action.", true), null);
  if (parsed.action === "close") {
    return loggedInteractionResponse(interaction, messageResponse("Run `/close` in this ticket to confirm closure with a reason. A transcript will be created before deletion.", true), null);
  }
  const response = deferredResponse(true);
  logInteraction(interaction, response, null);
  const work = processTicketActionComponent(env, interaction, parsed.action, parsed.requestId);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

function handleLawyerResponseComponent(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const parsed = parseLawyerResponseCustomId(interaction.data?.custom_id ?? "");
  if (!parsed) return loggedInteractionResponse(interaction, messageResponse("Unsupported lawyer request action.", true), null);
  const response = deferredResponse(true);
  logInteraction(interaction, response, null);
  const work = processLawyerResponseComponent(env, interaction, parsed.requestId);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

function handleRequestPanelComponent(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const parsed = parsePanelCustomId(interaction.data?.custom_id ?? "", "req");
  if (!parsed) return loggedInteractionResponse(interaction, messageResponse("Unsupported request panel action.", true), null);
  if (["addUser", "addRole", "createDocket", "close"].includes(parsed.action)) {
    const modal = requestPanelModal(parsed.action, parsed.requestId);
    return loggedInteractionResponse(interaction, modal ?? messageResponse("Unsupported request panel modal.", true), null);
  }
  const response = deferredResponse(true);
  logInteraction(interaction, response, null);
  const work = processRequestPanelComponent(env, interaction, parsed);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

function handleLawyerPanelComponent(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const parsed = parsePanelCustomId(interaction.data?.custom_id ?? "", "law");
  if (!parsed) return loggedInteractionResponse(interaction, messageResponse("Unsupported lawyer panel action.", true), null);
  if (["addCounsel", "addOversight", "addJudge", "close"].includes(parsed.action)) {
    const modal = lawyerPanelModal(parsed.action, parsed.requestId);
    return loggedInteractionResponse(interaction, modal ?? messageResponse("Unsupported lawyer panel modal.", true), null);
  }
  const response = deferredResponse(true);
  logInteraction(interaction, response, null);
  const work = processLawyerPanelComponent(env, interaction, parsed);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

function handleModalSubmitInteraction(env: Env, interaction: DiscordInteraction, executionCtx?: ExecutionContext): Response {
  const customId = interaction.data?.custom_id ?? "";
  const parsed = parsePanelModalCustomId(customId);
  if (!parsed) return loggedInteractionResponse(interaction, messageResponse("Unsupported DOJ modal action.", true), null);
  const response = deferredResponse(true);
  logInteraction(interaction, response, null);
  const work = processPanelModalSubmit(env, interaction, parsed);
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return interactionJson(response);
  }
  void work;
  return interactionJson(response);
}

async function processLawyerResponseComponent(env: Env, interaction: DiscordInteraction, requestId: string) {
  try {
    const ctx = await authContextFromInteraction(env, interaction);
    const result = await ensureLawyerResponseSpace(env, ctx, requestId, ctx.user.discordId, {
      eventType: "LAWYER_RESPONSE_CLAIMED",
      source: "lawyer-response-button",
      duplicateMode: "block-other-attorney",
      originalChannelId: interaction.message?.channel_id ?? interaction.channel_id ?? null,
      originalMessageId: interaction.message?.id ?? null
    });
    await editOriginalInteractionResponse(env, interaction, result.ok ? messageResponse(result.message, true) : result.response);
  } catch (cause) {
    await editOriginalInteractionResponse(env, interaction, messageResponse(`Lawyer response claim failed: ${safeError(cause)}`, true));
  }
}

async function processTicketActionComponent(env: Env, interaction: DiscordInteraction, action: "claim" | "transcript", requestId: string) {
  try {
    const ctx = requireAnyPermission(await authContextFromInteraction(env, interaction), TICKET_MANAGEMENT_PERMISSIONS);
    const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
    if (!detail || detail.id !== requestId) {
      await editOriginalInteractionResponse(env, interaction, messageResponse("This button is no longer linked to the current private DOJ ticket.", true));
      return;
    }
    const response = action === "claim"
      ? await claimTicketForDetail(env, ctx, detail, "", "ticket-button-claim")
      : await transcriptTicketForDetail(env, ctx, detail, "ticket-button-transcript");
    await editOriginalInteractionResponse(env, interaction, response);
  } catch (cause) {
    const response = cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")
      ? messageResponse("You do not have permission to use this ticket action.", true)
      : messageResponse(`Ticket action failed: ${safeError(cause)}`, true);
    await editOriginalInteractionResponse(env, interaction, response);
  }
}

async function processRequestPanelComponent(env: Env, interaction: DiscordInteraction, parsed: PanelCustomId) {
  try {
    const ctx = await authContextFromInteraction(env, interaction);
    const detail = await requestPanelDetail(env, interaction, parsed.requestId);
    if (!detail) {
      await editOriginalInteractionResponse(env, interaction, messageResponse("This panel is no longer linked to a live private DOJ request ticket.", true));
      return;
    }
    if (parsed.action === "status") {
      const status = normalizeRequestPanelStatus(interaction.data?.values?.[0] ?? "");
      if (!status) {
        await editOriginalInteractionResponse(env, interaction, messageResponse("That status is not supported from Discord.", true));
        return;
      }
      await updateRequestStatusFromPanel(env, ctx, detail, status, {
        channelId: detail.discordTicketChannelId ?? "",
        eventType: "REQUEST_STATUS_UPDATED",
        auditType: "SERVICE_REQUEST_STATUS_UPDATED_FROM_DISCORD_PANEL"
      });
      await editOriginalInteractionResponse(env, interaction, messageResponse(`Status updated to **${status}** for **${detail.requestNumber}**.`, true));
      return;
    }
    if (parsed.action === "claim") {
      const response = await claimOrUnclaimRequestFromPanel(env, ctx, detail);
      await editOriginalInteractionResponse(env, interaction, response);
      return;
    }
    if (parsed.action === "transcript") {
      requireRequestPanelChannelAction(ctx, detail);
      const response = await transcriptTicketForDetail(env, ctx, detail, "request-panel-transcript");
      await editOriginalInteractionResponse(env, interaction, response);
      return;
    }
    await editOriginalInteractionResponse(env, interaction, messageResponse("Unsupported request panel action.", true));
  } catch (cause) {
    const response = cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")
      ? messageResponse("You do not have permission to use this request panel action.", true)
      : messageResponse(`Request panel action failed: ${safeError(cause)}`, true);
    await editOriginalInteractionResponse(env, interaction, response);
  }
}

async function processLawyerPanelComponent(env: Env, interaction: DiscordInteraction, parsed: PanelCustomId) {
  try {
    const ctx = await authContextFromInteraction(env, interaction);
    const linked = await linkedLawyerResponseSpace(env, interaction.channel_id);
    if (!linked || linked.detail.id !== parsed.requestId) {
      await editOriginalInteractionResponse(env, interaction, messageResponse("This lawyer panel is no longer linked to this private attorney response space.", true));
      return;
    }
    if (parsed.action === "status") {
      const status = normalizeRequestPanelStatus(interaction.data?.values?.[0] ?? "");
      if (!status) {
        await editOriginalInteractionResponse(env, interaction, messageResponse("That lawyer request status is not supported from Discord.", true));
        return;
      }
      requireLawyerPanelAction(ctx, linked.detail, linked.space);
      await updateRequestStatusFromPanel(env, ctx, linked.detail, status, {
        channelId: lawyerResponseSpaceChannelId(linked.space),
        eventType: "LAWYER_STATUS_UPDATED",
        auditType: "LAWYER_STATUS_UPDATED_FROM_DISCORD_PANEL",
        skipPrivateEmbedRefresh: true,
        skipPermissionCheck: true
      });
      await editOriginalInteractionResponse(env, interaction, messageResponse(`Lawyer request status updated to **${status}** for **${linked.detail.requestNumber}**.`, true));
      return;
    }
    await editOriginalInteractionResponse(env, interaction, messageResponse("Unsupported lawyer panel action.", true));
  } catch (cause) {
    const response = cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")
      ? messageResponse("You do not have permission to use this lawyer panel action.", true)
      : messageResponse(`Lawyer panel action failed: ${safeError(cause)}`, true);
    await editOriginalInteractionResponse(env, interaction, response);
  }
}

async function processPanelModalSubmit(env: Env, interaction: DiscordInteraction, parsed: PanelModalCustomId) {
  try {
    const ctx = await authContextFromInteraction(env, interaction);
    const values = modalValueMap(interaction);
    const response = parsed.scope === "req"
      ? await processRequestPanelModal(env, ctx, interaction, parsed, values)
      : await processLawyerPanelModal(env, ctx, interaction, parsed, values);
    await editOriginalInteractionResponse(env, interaction, response);
  } catch (cause) {
    const response = cause instanceof PermissionError || (cause instanceof Error && cause.name === "PermissionError")
      ? messageResponse("You do not have permission to submit this DOJ panel action.", true)
      : messageResponse(`Panel modal action failed: ${safeError(cause)}`, true);
    await editOriginalInteractionResponse(env, interaction, response);
  }
}

async function processRequestPanelModal(env: Env, ctx: AuthContext, interaction: DiscordInteraction, parsed: PanelModalCustomId, values: Map<string, string>): Promise<DiscordInteractionResponse> {
  const detail = await requestPanelDetail(env, interaction, parsed.requestId);
  if (!detail) return messageResponse("This panel is no longer linked to a live private DOJ request ticket.", true);
  switch (parsed.action) {
    case "addUser": {
      const userId = extractDiscordId(values.get("user") ?? "");
      if (!userId) return messageResponse("Enter a valid Discord user ID or @mention.", true);
      return addUserToPrivateRequestTicketFromPanel(env, ctx, detail, userId, values.get("reason") ?? "");
    }
    case "addRole": {
      const roleId = extractDiscordId(values.get("role") ?? "");
      if (!roleId) return messageResponse("Enter a valid Discord role ID or @role mention.", true);
      return addRoleToPrivateRequestTicketFromPanel(env, ctx, detail, roleId, values.get("reason") ?? "");
    }
    case "createDocket":
      return createDocketFromRequestPanel(env, ctx, detail, values);
    case "close":
      return closeRequestFromPanel(env, ctx, detail, values.get("reason") ?? "");
    default:
      return messageResponse("Unsupported request panel modal.", true);
  }
}

async function processLawyerPanelModal(env: Env, ctx: AuthContext, interaction: DiscordInteraction, parsed: PanelModalCustomId, values: Map<string, string>): Promise<DiscordInteractionResponse> {
  const linked = await linkedLawyerResponseSpace(env, interaction.channel_id);
  if (!linked || linked.detail.id !== parsed.requestId) return messageResponse("This lawyer panel is no longer linked to this private attorney response space.", true);
  switch (parsed.action) {
    case "addCounsel":
    case "addOversight":
    case "addJudge": {
      requireLawyerPanelAction(ctx, linked.detail, linked.space);
      const userId = extractDiscordId(values.get("user") ?? "");
      if (!userId) return messageResponse("Enter a valid Discord user ID or @mention.", true);
      const added = await addUserToLawyerResponseSpace(env, ctx, linked.detail, linked.space, userId, {
        reason: values.get("reason") ?? "",
        purpose: parsed.action,
        actorCanOverrideParticipantGate: canOverrideLawyerParticipantGate(ctx)
      });
      return messageResponse(added.message, true);
    }
    case "close":
      return closeLawyerRequestFromPanel(env, ctx, linked.detail, linked.space, values.get("reason") ?? "");
    default:
      return messageResponse("Unsupported lawyer panel modal.", true);
  }
}

async function processCloseTicketConfirmation(env: Env, interaction: DiscordInteraction, requestId: string, reason: string, commandName: string | null) {
  try {
    const ctx = requirePermission(await authContextFromInteraction(env, interaction), "MANAGE_REQUESTS");
    if (isLawyerResponseCloseTargetRef(requestId)) {
      const response = await closeLawyerResponseSpaceFromCloseCommand(env, ctx, decodeLawyerResponseCloseTargetRef(requestId), interaction.channel_id, reason, commandName ?? "close");
      await editOriginalInteractionResponse(env, interaction, response);
      return;
    }
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
          "`/add-user`, `/add-role`, `/rename-ticket`, `/claim-ticket`, `/unclaim-ticket`",
          "`/create-channel`, `/create-private-channel`, `/create-category`, `/create-category-layout`",
          "`/delete-category-layout`, `/bulk-delete-channels`, `/announce`",
          "`/kick`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/mute`, `/unmute`, `/warn`, `/mod-note`",
          "`/claim-lawyer-request`, `/lawyer-thread`",
          "`/delete-record`, `/restore-record`",
          "`/post-faq`, `/post-faq-category`, `/post-resources`, `/post-lawyer-sticky`"
        ].join("\n"),
        true
      );
    case "request-lawyer":
      return requestLawyer(env, ctx, options);
    case "request-service":
      return requestService(env, ctx, options);
    case "create-docket":
      return createDocketFromDiscord(env, ctx, options);
    case "create-channel":
      return createChannelCommand(env, ctx, interaction, options);
    case "create-private-channel":
      return createPrivateChannelCommand(env, ctx, interaction, options);
    case "create-category":
      return createCategoryCommand(env, ctx, interaction, options);
    case "create-category-layout":
      return createCategoryLayoutCommand(env, ctx, interaction, options);
    case "delete-category-layout":
      return deleteCategoryLayoutCommand(env, ctx, interaction, options);
    case "bulk-delete-channels":
      return bulkDeleteChannelsCommand(env, ctx, interaction, options);
    case "kick":
      return kickCommand(env, ctx, interaction, options);
    case "ban":
      return banCommand(env, ctx, interaction, options);
    case "unban":
      return unbanCommand(env, ctx, interaction, options);
    case "timeout":
      return timeoutCommand(env, ctx, interaction, options);
    case "untimeout":
      return untimeoutCommand(env, ctx, interaction, options);
    case "mute":
      return muteCommand(env, ctx, interaction, options);
    case "unmute":
      return unmuteCommand(env, ctx, interaction, options);
    case "warn":
      return warnCommand(env, ctx, interaction, options);
    case "mod-note":
      return modNoteCommand(env, ctx, interaction, options);
    case "announce":
      return announceCommand(env, ctx, interaction, options);
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
    case "add-user":
      return addUserToTicket(env, ctx, interaction, options);
    case "add-role":
      return addRoleToTicket(env, ctx, interaction, options);
    case "rename-ticket":
      return renameTicket(env, ctx, interaction, options);
    case "claim-ticket":
      return claimTicket(env, ctx, interaction, options);
    case "unclaim-ticket":
      return unclaimTicket(env, ctx, interaction, options);
    case "claim-lawyer-request":
      return claimLawyerRequestCommand(env, ctx, interaction, options);
    case "lawyer-thread":
      return lawyerThreadCommand(env, ctx, interaction, options);
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
    case "post-lawyer-sticky":
      return postLawyerStickyCommand(env, ctx);
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
      representationSubtype: "Not sure what to file",
      preferredRepresentation: "No preference",
      topicCategory: "General legal advice",
      desiredOutcome: "Speak with counsel about legal options.",
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
  const now = new Date().toISOString();
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
    now.slice(0, 10),
    scheduledAt || null,
    summary,
    summary,
    stringOption(options, "location"),
    linkedRequest?.id ?? null,
    linkedRequest?.discordTicketChannelId ?? null,
    linkedRequest?.documentUrl ?? null,
    isPublic ? 1 : 0,
    isPublic ? "PUBLIC" : "PRIVATE",
    now,
    JSON.stringify({ source: "discord_slash_command", channel_id: options.get("_channel_id") ?? null })
  ).run();
  await audit(env, "DOCKET_CREATED_FROM_DISCORD", { docket_id: id, docket_number: docketNumber }, ctx.user.id);
  return messageResponse(`Docket created: **${docketNumber}**${isPublic ? " and marked public." : "."}`, true);
}

async function createChannelCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const name = sanitizeDiscordChannelName(stringOption(options, "name"));
  if (!name) return messageResponse("Channel name must include at least one letter or number.", true);
  const category = optionalDiscordIdValidation(options, "category", "Category");
  if (!category.ok) return messageResponse(category.message, true);
  const allowedRoles = parseIdList(stringOption(options, "allowed_roles"), "role");
  const deniedRoles = parseIdList(stringOption(options, "denied_roles"), "role");
  const validation = idListError(allowedRoles, "allowed_roles", guildId) || idListError(deniedRoles, "denied_roles", guildId);
  if (validation) return messageResponse(validation, true);
  const staffOnly = booleanOption(options, "staff_only", false);
  const staffRoles = staffOnly ? await configuredStaffRoleIds(env) : [];
  const overwrites = channelOverwrites(guildId, {
    everyoneDenied: staffOnly,
    roleAllowIds: [...staffRoles, ...allowedRoles.ids],
    roleDenyIds: deniedRoles.ids
  });
  const channel = await createGuildChannel(env, guildId, channelCreatePayload({
    name,
    type: GUILD_TEXT_CHANNEL,
    topic: cleanTextOption(options, "topic", 1024),
    parentId: category.id,
    permissionOverwrites: overwrites
  }), cleanTextOption(options, "reason", 512));
  await recordDiscordAdminAction(env, ctx, "CHANNEL_CREATED", "channel", channel.id, `Created channel #${channel.name ?? name}.`, {
    channel_id: channel.id,
    channel_name: channel.name ?? name,
    category_id: category.id || null,
    staff_only: staffOnly,
    allowed_role_ids: allowedRoles.ids,
    denied_role_ids: deniedRoles.ids,
    reason: cleanTextOption(options, "reason", 512) || null
  }, "ADMIN");
  return messageResponse(`Created channel <#${channel.id}>.`, true);
}

async function createPrivateChannelCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const name = sanitizeDiscordChannelName(stringOption(options, "name"));
  if (!name) return messageResponse("Channel name must include at least one letter or number.", true);
  const users = parseIdList(stringOption(options, "users"), "user");
  const roles = parseIdList(stringOption(options, "roles"), "role");
  const validation = idListError(users, "users") || idListError(roles, "roles", guildId);
  if (validation) return messageResponse(validation, true);
  const category = optionalDiscordIdValidation(options, "category", "Category");
  if (!category.ok) return messageResponse(category.message, true);
  const staffRoles = await configuredStaffRoleIds(env);
  const channel = await createGuildChannel(env, guildId, channelCreatePayload({
    name,
    type: GUILD_TEXT_CHANNEL,
    topic: cleanTextOption(options, "topic", 1024),
    parentId: category.id,
    permissionOverwrites: channelOverwrites(guildId, {
      everyoneDenied: true,
      userAllowIds: users.ids,
      roleAllowIds: [...staffRoles, ...roles.ids]
    })
  }), cleanTextOption(options, "reason", 512));
  await recordDiscordAdminAction(env, ctx, "PRIVATE_CHANNEL_CREATED", "channel", channel.id, `Created private channel #${channel.name ?? name}.`, {
    channel_id: channel.id,
    channel_name: channel.name ?? name,
    category_id: category.id || null,
    user_ids: users.ids,
    role_ids: roles.ids,
    staff_role_ids: staffRoles,
    reason: cleanTextOption(options, "reason", 512) || null
  }, "ADMIN");
  return messageResponse(`Created private channel <#${channel.id}>.`, true);
}

async function createCategoryCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const name = sanitizeDiscordChannelName(stringOption(options, "name"));
  if (!name) return messageResponse("Category name must include at least one letter or number.", true);
  const visibility = normalizeCategoryVisibility(stringOption(options, "visibility"));
  if (!visibility) return messageResponse("Choose a valid visibility: public, staff_only, private_roles, or private_users_and_roles.", true);
  const users = parseIdList(stringOption(options, "users"), "user");
  const roles = parseIdList(stringOption(options, "roles"), "role");
  const validation = idListError(users, "users") || idListError(roles, "roles", guildId) || categoryVisibilityError(visibility, users.ids, roles.ids);
  if (validation) return messageResponse(validation, true);
  const category = await createGuildChannel(env, guildId, {
    name,
    type: GUILD_CATEGORY_CHANNEL,
    permission_overwrites: await categoryPermissionOverwrites(env, guildId, visibility, users.ids, roles.ids)
  }, cleanTextOption(options, "reason", 512));
  await recordDiscordAdminAction(env, ctx, "CATEGORY_CREATED", "category", category.id, `Created category ${category.name ?? name}.`, {
    category_id: category.id,
    category_name: category.name ?? name,
    visibility,
    user_ids: users.ids,
    role_ids: roles.ids,
    purpose: cleanTextOption(options, "purpose", 1000) || null,
    reason: cleanTextOption(options, "reason", 512) || null
  }, "ADMIN");
  return messageResponse(`Created category **${category.name ?? name}** (${category.id}).`, true);
}

async function createCategoryLayoutCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const categoryName = sanitizeDiscordChannelName(stringOption(options, "category_name"));
  if (!categoryName) return messageResponse("Category name must include at least one letter or number.", true);
  const visibility = normalizeCategoryVisibility(stringOption(options, "visibility"));
  if (!visibility) return messageResponse("Choose a valid visibility: public, staff_only, private_roles, or private_users_and_roles.", true);
  const purpose = cleanTextOption(options, "purpose", 1000);
  if (!purpose) return messageResponse("Purpose is required for a category layout.", true);
  const users = parseIdList(stringOption(options, "users"), "user");
  const roles = parseIdList(stringOption(options, "roles"), "role");
  const validation = idListError(users, "users") || idListError(roles, "roles", guildId) || categoryVisibilityError(visibility, users.ids, roles.ids);
  if (validation) return messageResponse(validation, true);
  const parsedChannels = parseLayoutChannelNames(stringOption(options, "channels"));
  if (parsedChannels.names.length === 0) return messageResponse("Provide at least one valid channel name.", true);
  if (parsedChannels.names.length > MAX_LAYOUT_CHANNELS) return messageResponse(`This layout would create more than ${MAX_LAYOUT_CHANNELS} channels. Please split it into smaller batches.`, true);
  if (parsedChannels.names.length > SAFE_LAYOUT_CHANNELS) return messageResponse("This layout would create more than 10 channels. Please split it into smaller batches.", true);
  const category = await createGuildChannel(env, guildId, {
    name: categoryName,
    type: GUILD_CATEGORY_CHANNEL,
    permission_overwrites: await categoryPermissionOverwrites(env, guildId, visibility, users.ids, roles.ids)
  }, cleanTextOption(options, "reason", 512));
  const created: DiscordCreatedChannel[] = [];
  const failed: string[] = [];
  for (const channelName of parsedChannels.names) {
    try {
      const channel = await createGuildChannel(env, guildId, {
        name: channelName,
        type: GUILD_TEXT_CHANNEL,
        parent_id: category.id,
        topic: purpose
      }, cleanTextOption(options, "reason", 512));
      created.push(channel);
      await postDiscordChannelMessage(env, channel.id, `Purpose: ${truncate(purpose, 1000)}`, {});
    } catch (cause) {
      failed.push(`${channelName}: ${safeError(cause)}`);
    }
  }
  await recordDiscordAdminAction(env, ctx, "CATEGORY_LAYOUT_CREATED", "category", category.id, `Created category layout ${category.name ?? categoryName} with ${created.length} channels.`, {
    category_id: category.id,
    category_name: category.name ?? categoryName,
    channel_ids: created.map((channel) => channel.id),
    skipped_names: parsedChannels.skipped,
    failed,
    visibility,
    role_ids: roles.ids,
    user_ids: users.ids,
    purpose,
    reason: cleanTextOption(options, "reason", 512) || null
  }, "ADMIN");
  return messageResponse([
    `Created category **${category.name ?? categoryName}** (${category.id}).`,
    `Created channels: ${created.length ? created.map((channel) => `<#${channel.id}>`).join(", ") : "none"}.`,
    roles.ids.length ? `Roles granted: ${roles.ids.map((id) => `<@&${id}>`).join(", ")}` : null,
    users.ids.length ? `Users granted: ${users.ids.map((id) => `<@${id}>`).join(", ")}` : null,
    parsedChannels.skipped.length ? `Skipped invalid names: ${parsedChannels.skipped.join(", ")}` : null,
    failed.length ? `Failures: ${truncate(failed.join("; "), 500)}` : null
  ].filter(Boolean).join("\n"), true);
}

async function deleteCategoryLayoutCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const categoryId = optionalDiscordIdOption(options, "category");
  if (!categoryId) return messageResponse("Category must be a valid Discord category ID.", true);
  const deleteChannels = booleanOption(options, "delete_channels", false);
  const expectedConfirm = deleteChannels ? "DELETE CATEGORY AND CHANNELS" : "DELETE CATEGORY";
  if (stringOption(options, "confirm") !== expectedConfirm) return messageResponse(`Confirmation must exactly equal: ${expectedConfirm}`, true);
  const protectedIds = await protectedDiscordCategoryIds(env);
  if (protectedIds.has(categoryId)) return messageResponse("That category is protected and cannot be deleted by this command.", true);
  const category = await fetchDiscordChannel(env, categoryId);
  if (category.type !== GUILD_CATEGORY_CHANNEL) return messageResponse("That ID is not a Discord category.", true);
  const children = (await fetchGuildChannels(env, guildId)).filter((channel) => channel.parent_id === categoryId);
  if (!deleteChannels && children.length > 0) return messageResponse(`Category has ${children.length} child channels. Set delete_channels true and use the stronger confirmation phrase if you intend to delete them.`, true);
  if (deleteChannels && children.length > MAX_BULK_DELETE_CHANNELS) return messageResponse(`This category has more than ${MAX_BULK_DELETE_CHANNELS} child channels. Split the cleanup into smaller batches.`, true);
  const reason = cleanTextOption(options, "reason", 512) || "Deleted by DOJ Discord admin command.";
  const deletedChildren: string[] = [];
  for (const child of children) {
    await deleteDiscordChannel(env, child.id, reason);
    deletedChildren.push(child.id);
    await recordDiscordAdminAction(env, ctx, "CHANNEL_DELETED", "channel", child.id, `Deleted child channel ${child.name ?? child.id}.`, {
      channel_id: child.id,
      channel_name: child.name ?? null,
      parent_id: categoryId,
      reason
    }, "ADMIN");
  }
  await deleteDiscordChannel(env, categoryId, reason);
  await recordDiscordAdminAction(env, ctx, "CATEGORY_DELETED", "category", categoryId, `Deleted category ${category.name ?? categoryId}.`, {
    category_id: categoryId,
    category_name: category.name ?? null,
    delete_channels: deleteChannels,
    deleted_child_channel_ids: deletedChildren,
    reason
  }, "ADMIN");
  return messageResponse(`Deleted category **${category.name ?? categoryId}**.${deletedChildren.length ? ` Deleted ${deletedChildren.length} child channels first.` : ""}`, true);
}

async function bulkDeleteChannelsCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_CHANNEL_MANAGEMENT_PERMISSIONS);
  requireGuildInteraction(env, interaction);
  if (stringOption(options, "confirm") !== "DELETE CHANNELS") return messageResponse("Confirmation must exactly equal: DELETE CHANNELS", true);
  const parsed = parseIdList(stringOption(options, "channels"), "channel");
  const validation = idListError(parsed, "channels");
  if (validation) return messageResponse(validation, true);
  if (parsed.ids.length === 0) return messageResponse("Provide at least one valid channel ID or mention.", true);
  if (parsed.ids.length > MAX_BULK_DELETE_CHANNELS) return messageResponse(`You can delete at most ${MAX_BULK_DELETE_CHANNELS} channels per command.`, true);
  const protectedIds = await protectedDiscordCategoryIds(env);
  const channels = await Promise.all(parsed.ids.map((id) => fetchDiscordChannel(env, id)));
  const blocked = channels.find((channel) => channel.type === GUILD_CATEGORY_CHANNEL || protectedIds.has(channel.parent_id ?? "") || protectedIds.has(channel.id));
  if (blocked) return messageResponse(`Refusing to bulk-delete protected/category channel ${blocked.name ?? blocked.id}. Use the category delete command for categories.`, true);
  const reason = cleanTextOption(options, "reason", 512) || "Bulk deleted by DOJ Discord admin command.";
  const deleted: string[] = [];
  for (const channel of channels) {
    await deleteDiscordChannel(env, channel.id, reason);
    deleted.push(channel.id);
    await recordDiscordAdminAction(env, ctx, "CHANNEL_DELETED", "channel", channel.id, `Bulk-deleted channel ${channel.name ?? channel.id}.`, {
      channel_id: channel.id,
      channel_name: channel.name ?? null,
      reason
    }, "ADMIN");
  }
  return messageResponse(`Deleted ${deleted.length} channels: ${deleted.map((id) => `\`${id}\``).join(", ")}`, true);
}

async function kickCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "kick", true);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  await dmUser(env, targetId, `You were kicked from Miami Stories DOJ Discord.\nReason: ${reason}`);
  const response = await discordApi(env, `/guilds/${guildId}/members/${targetId}`, {
    method: "DELETE",
    headers: { "X-Audit-Log-Reason": discordAuditReason(reason) }
  });
  if (!response.ok) throw new Error(`Discord kick failed with ${response.status}: ${await responseTextSnippet(response)}`);
  await recordModerationCase(env, ctx, guildId, targetId, "KICK", reason, null, null, {});
  await recordDiscordAdminAction(env, ctx, "KICK", "user", targetId, `Kicked <@${targetId}>.`, { target_user_id: targetId, reason }, "MOD");
  return messageResponse(`Kicked <@${targetId}>.`, true);
}

async function banCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const days = Math.max(0, Math.min(7, integerOption(options, "delete_message_days", 0)));
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "ban", false);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  await dmUser(env, targetId, `You were banned from Miami Stories DOJ Discord.\nReason: ${reason}`);
  const response = await discordApi(env, `/guilds/${guildId}/bans/${targetId}`, {
    method: "PUT",
    headers: { "X-Audit-Log-Reason": discordAuditReason(reason) },
    body: JSON.stringify({ delete_message_seconds: days * 24 * 60 * 60 })
  });
  if (!response.ok) throw new Error(`Discord ban failed with ${response.status}: ${await responseTextSnippet(response)}`);
  await recordModerationCase(env, ctx, guildId, targetId, "BAN", reason, null, null, { delete_message_days: days });
  await recordDiscordAdminAction(env, ctx, "BAN", "user", targetId, `Banned <@${targetId}>.`, { target_user_id: targetId, reason, delete_message_days: days }, "MOD");
  return messageResponse(`Banned <@${targetId}>.`, true);
}

async function unbanCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = stringOption(options, "user_id");
  const reason = cleanTextOption(options, "reason", 512);
  if (!validDiscordId(targetId) || !reason) return messageResponse("Valid user_id and reason are required.", true);
  const response = await discordApi(env, `/guilds/${guildId}/bans/${targetId}`, {
    method: "DELETE",
    headers: { "X-Audit-Log-Reason": discordAuditReason(reason) }
  });
  if (!response.ok) throw new Error(`Discord unban failed with ${response.status}: ${await responseTextSnippet(response)}`);
  await recordModerationCase(env, ctx, guildId, targetId, "UNBAN", reason, null, null, {});
  await recordDiscordAdminAction(env, ctx, "UNBAN", "user", targetId, `Unbanned Discord user ${targetId}.`, { target_user_id: targetId, reason }, "MOD");
  return messageResponse(`Unbanned Discord user \`${targetId}\`.`, true);
}

async function timeoutCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  const duration = parseDurationSeconds(stringOption(options, "duration"));
  if (!targetId || !reason || !duration.ok) return messageResponse(duration.ok ? "User and reason are required." : duration.message, true);
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "timeout", true);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  const expiresAt = new Date(Date.now() + duration.seconds * 1000).toISOString();
  await updateMemberTimeout(env, guildId, targetId, expiresAt, reason);
  await dmUser(env, targetId, `You were timed out in Miami Stories DOJ Discord until ${expiresAt}.\nReason: ${reason}`);
  await recordModerationCase(env, ctx, guildId, targetId, "TIMEOUT", reason, duration.seconds, expiresAt, {});
  await recordDiscordAdminAction(env, ctx, "TIMEOUT", "user", targetId, `Timed out <@${targetId}> for ${duration.seconds} seconds.`, { target_user_id: targetId, reason, duration_seconds: duration.seconds, expires_at: expiresAt }, "MOD");
  return messageResponse(`Timed out <@${targetId}> until ${expiresAt}.`, true);
}

async function untimeoutCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "untimeout", true);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  await updateMemberTimeout(env, guildId, targetId, null, reason);
  await recordModerationCase(env, ctx, guildId, targetId, "UNTIMEOUT", reason, null, null, {});
  await recordDiscordAdminAction(env, ctx, "UNTIMEOUT", "user", targetId, `Removed timeout from <@${targetId}>.`, { target_user_id: targetId, reason }, "MOD");
  return messageResponse(`Removed timeout from <@${targetId}>.`, true);
}

async function muteCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "mute", true);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  const muteRoleId = await configuredMuteRoleId(env);
  const durationText = stringOption(options, "duration");
  const duration = durationText ? parseDurationSeconds(durationText) : { ok: true as const, seconds: 60 * 60 };
  if (!duration.ok) return messageResponse(duration.message, true);
  if (muteRoleId) {
    const response = await discordApi(env, `/guilds/${guildId}/members/${targetId}/roles/${muteRoleId}`, {
      method: "PUT",
      headers: { "X-Audit-Log-Reason": discordAuditReason(reason) }
    });
    if (!response.ok) throw new Error(`Discord mute role apply failed with ${response.status}: ${await responseTextSnippet(response)}`);
    await recordModerationCase(env, ctx, guildId, targetId, "MUTE", reason, durationText ? duration.seconds : null, null, { mute_role_id: muteRoleId, duration_auto_remove: false });
    await recordDiscordAdminAction(env, ctx, "MUTE", "user", targetId, `Applied mute role to <@${targetId}>.`, { target_user_id: targetId, reason, mute_role_id: muteRoleId, duration_seconds: durationText ? duration.seconds : null }, "MOD");
    return messageResponse(`Applied mute role to <@${targetId}>.${durationText ? " Duration was recorded, but role auto-removal requires a separate scheduled unmute workflow." : ""}`, true);
  }
  const expiresAt = new Date(Date.now() + duration.seconds * 1000).toISOString();
  await updateMemberTimeout(env, guildId, targetId, expiresAt, reason);
  await recordModerationCase(env, ctx, guildId, targetId, "MUTE_TIMEOUT", reason, duration.seconds, expiresAt, {});
  await recordDiscordAdminAction(env, ctx, "MUTE_TIMEOUT", "user", targetId, `Muted <@${targetId}> by timeout.`, { target_user_id: targetId, reason, duration_seconds: duration.seconds, expires_at: expiresAt }, "MOD");
  return messageResponse(`Muted <@${targetId}> by timeout until ${expiresAt}.`, true);
}

async function unmuteCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 512);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const hierarchy = await ensureModerationHierarchy(env, ctx, interaction, targetId, "unmute", true);
  if (!hierarchy.ok) return messageResponse(hierarchy.message, true);
  const muteRoleId = await configuredMuteRoleId(env);
  if (muteRoleId) {
    const response = await discordApi(env, `/guilds/${guildId}/members/${targetId}/roles/${muteRoleId}`, {
      method: "DELETE",
      headers: { "X-Audit-Log-Reason": discordAuditReason(reason) }
    });
    if (!response.ok && response.status !== 404) throw new Error(`Discord mute role remove failed with ${response.status}: ${await responseTextSnippet(response)}`);
  } else {
    await updateMemberTimeout(env, guildId, targetId, null, reason);
  }
  await recordModerationCase(env, ctx, guildId, targetId, "UNMUTE", reason, null, null, { mute_role_id: muteRoleId ?? null });
  await recordDiscordAdminAction(env, ctx, "UNMUTE", "user", targetId, `Unmuted <@${targetId}>.`, { target_user_id: targetId, reason, mute_role_id: muteRoleId ?? null }, "MOD");
  return messageResponse(`Unmuted <@${targetId}>.`, true);
}

async function warnCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const reason = cleanTextOption(options, "reason", 1000);
  if (!targetId || !reason) return messageResponse("User and reason are required.", true);
  const caseId = await recordModerationCase(env, ctx, guildId, targetId, "WARN", reason, null, null, {});
  await dmUser(env, targetId, `You received a DOJ Discord warning.\nReason: ${reason}`);
  if (booleanOption(options, "public", false) && interaction.channel_id) {
    await postDiscordChannelMessage(env, interaction.channel_id, `<@${targetId}> has received a staff warning. Please check DMs and follow server rules.`, { users: [targetId] });
  }
  await recordDiscordAdminAction(env, ctx, "WARN", "user", targetId, `Warned <@${targetId}>.`, { target_user_id: targetId, case_id: caseId, public_notice: booleanOption(options, "public", false), reason }, "MOD");
  return messageResponse(`Warning recorded for <@${targetId}>. Case: \`${caseId}\`.`, true);
}

async function modNoteCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_MODERATION_PERMISSIONS);
  const guildId = requireGuildInteraction(env, interaction);
  const targetId = snowflakeOption(options, "user");
  const note = cleanTextOption(options, "note", 1000);
  if (!targetId || !note) return messageResponse("User and note are required.", true);
  const caseId = await recordModerationCase(env, ctx, guildId, targetId, "MOD_NOTE", note, null, null, { internal: true });
  await recordDiscordAdminAction(env, ctx, "MOD_NOTE", "user", targetId, `Added internal moderation note for <@${targetId}>.`, { target_user_id: targetId, case_id: caseId }, "MOD");
  return messageResponse(`Internal moderation note recorded for <@${targetId}>. Case: \`${caseId}\`.`, true);
}

async function announceCommand(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireAnyPermission(ctx, DISCORD_ANNOUNCEMENT_PERMISSIONS);
  requireGuildInteraction(env, interaction);
  const channelId = optionalDiscordIdOption(options, "channel");
  const message = cleanTextOption(options, "message", 3900);
  const title = cleanTextOption(options, "title", 256);
  if (!channelId || !message) return messageResponse("Channel and message are required.", true);
  const mentionMode = stringOption(options, "mention") || "none";
  const roleId = snowflakeOption(options, "role");
  const mention = announcementMention(ctx, mentionMode, roleId);
  if (!mention.ok) return messageResponse(mention.message, true);
  const content = [mention.content, title ? "" : message].filter(Boolean).join("\n");
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: truncate(content, 2000),
      allowed_mentions: mention.allowedMentions,
      ...(title ? { embeds: [{ title, description: message }] } : {})
    })
  });
  if (!response.ok) throw new Error(`Discord announcement failed with ${response.status}: ${await responseTextSnippet(response)}`);
  const posted = await response.json().catch(() => ({})) as { id?: string };
  if (booleanOption(options, "pin", false) && posted.id) {
    const pin = await discordApi(env, `/channels/${channelId}/pins/${posted.id}`, { method: "PUT" });
    if (!pin.ok) throw new Error(`Discord announcement pin failed with ${pin.status}: ${await responseTextSnippet(pin)}`);
  }
  await recordDiscordAdminAction(env, ctx, "ANNOUNCEMENT_POSTED", "channel", channelId, `Posted announcement in <#${channelId}>.`, {
    channel_id: channelId,
    message_id: posted.id ?? null,
    title: title || null,
    mention: mentionMode,
    role_id: roleId || null,
    pinned: booleanOption(options, "pin", false),
    reason: cleanTextOption(options, "reason", 512) || null
  }, "ADMIN");
  return messageResponse(`Announcement posted in <#${channelId}>.${posted.id ? ` Message ID: \`${posted.id}\`.` : ""}`, true);
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
  if (!target || !target.sourceId) {
    return messageResponse("This command only closes linked DOJ service request private ticket channels or lawyer attorney response spaces.", true);
  }
  const reason = stringOption(options, "reason") || "Confirmed from Discord close command.";
  const actorId = ctx.user.discordId;
  const reasonToken = encodeCloseReason(reason);
  if (target.sourceType === "lawyer_response") {
    return messageResponse(
      `Are you sure you want to close the attorney response space for **${target.sourceNumber ?? target.sourceId}**?\nA transcript will be created first. Private threads are archived and locked; fallback private channels are deleted only after transcript storage.`,
      true,
      closeTicketComponents(actorId, lawyerResponseCloseTargetRef(target), reasonToken, interaction.data?.name ?? "close")
    );
  }
  if (target.sourceType !== "request") {
    return messageResponse("This command only closes linked DOJ service request private ticket channels or lawyer attorney response spaces.", true);
  }
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

async function requestPanelDetail(env: Env, interaction: DiscordInteraction, requestId: string): Promise<ServiceRequestDetail | null> {
  const detail = await getServiceRequestDetail(env, requestId);
  if (!detail?.discordTicketChannelId || detail.discordTicketDeletedAt) return null;
  if (interaction.channel_id && detail.discordTicketChannelId !== interaction.channel_id) return null;
  return detail;
}

async function updateRequestStatusFromPanel(
  env: Env,
  ctx: AuthContext,
  detail: ServiceRequestDetail,
  status: ServiceRequestStatus,
  options: { channelId: string; eventType: string; auditType: string; skipPrivateEmbedRefresh?: boolean; skipPermissionCheck?: boolean }
): Promise<ServiceRequestDetail> {
  if (!options.skipPermissionCheck) requireRequestPanelStatusAction(ctx, detail);
  if (!env.DB) throw new Error("D1 is required for request status updates.");
  await env.DB.prepare("UPDATE service_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, detail.id)
    .run();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, options.eventType, `Status updated to ${status} from Discord request panel.`, {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    status,
    channelId: options.channelId,
    actorDiscordId: ctx.user.discordId
  });
  await audit(env, options.auditType, { request_id: detail.id, request_number: detail.requestNumber, status, channel_id: options.channelId }, ctx.user.id);
  if (validDiscordId(options.channelId)) {
    await postTicketMessage(env, options.channelId, `Status updated to **${status}** by ${ctx.user.displayName}.`, {});
  }
  const refreshed = await getServiceRequestDetail(env, detail.id) ?? { ...detail, status };
  if (!options.skipPrivateEmbedRefresh) await refreshPrivateTicketPanel(env, refreshed);
  return refreshed;
}

async function refreshPrivateTicketPanel(env: Env, detail: ServiceRequestDetail): Promise<void> {
  if (!detail.discordTicketChannelId || !detail.discordTicketMessageId) return;
  await postServiceRequestEmbedToPrivateTicket(env, detail, detail.discordTicketChannelId, { userIds: [], roleIds: [] }).catch((cause) => {
    console.warn(JSON.stringify({
      event: "request_action_panel_refresh_failed",
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      cause: safeError(cause)
    }));
  });
}

async function claimOrUnclaimRequestFromPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail): Promise<DiscordInteractionResponse> {
  requireRequestPanelAction(ctx, detail);
  const current = await latestServiceRequestTicketClaim(env, detail.id);
  if (current && (current.actorUserId === ctx.user.id || current.staffDiscordId === ctx.user.discordId)) {
    await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_UNCLAIMED", "Request claim cleared from Discord action panel.", {
      channel_id: detail.discordTicketChannelId,
      staffDiscordId: ctx.user.discordId,
      staffDisplayName: ctx.user.displayName,
      previousStaffDiscordId: current.staffDiscordId,
      previousStaffDisplayName: current.staffDisplayName
    });
    if (detail.discordTicketChannelId) await postTicketMessage(env, detail.discordTicketChannelId, `Request unclaimed by ${ctx.user.displayName}.`, {});
    await audit(env, "SERVICE_REQUEST_UNCLAIMED_FROM_DISCORD_PANEL", { request_id: detail.id, channel_id: detail.discordTicketChannelId }, ctx.user.id);
    return messageResponse(`Request unclaimed for **${detail.requestNumber}**.`, true);
  }
  return claimTicketForDetail(env, ctx, detail, "", "request-panel-claim");
}

async function addUserToPrivateRequestTicketFromPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, userId: string, reason: string): Promise<DiscordInteractionResponse> {
  requireRequestPanelAccessAction(ctx, detail);
  if (!detail.discordTicketChannelId) return linkedTicketOnlyResponse();
  const allow = await ticketAccessAllow(env, detail.discordTicketChannelId);
  await putTicketPermissionOverwrite(env, detail.discordTicketChannelId, userId, 1, allow);
  await postTicketMessage(env, detail.discordTicketChannelId, withReason(`Added <@${userId}> to this ticket from the action panel.`, reason), { users: [userId] });
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_PERSON_ADDED", "Discord user added to private ticket from action panel.", {
    channel_id: detail.discordTicketChannelId,
    discord_user_id: userId,
    reason: reason || null,
    allow_permissions: allow.toString()
  });
  await audit(env, "SERVICE_REQUEST_PERSON_ADDED_FROM_DISCORD_PANEL", { request_id: detail.id, channel_id: detail.discordTicketChannelId, discord_user_id: userId, reason: reason || null }, ctx.user.id);
  return messageResponse(`Added user to **${detail.requestNumber}**.`, true);
}

async function addRoleToPrivateRequestTicketFromPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, roleId: string, reason: string): Promise<DiscordInteractionResponse> {
  requireRequestPanelAccessAction(ctx, detail);
  if (!detail.discordTicketChannelId) return linkedTicketOnlyResponse();
  const allow = await ticketAccessAllow(env, detail.discordTicketChannelId);
  await putTicketPermissionOverwrite(env, detail.discordTicketChannelId, roleId, 0, allow);
  await postTicketMessage(env, detail.discordTicketChannelId, withReason(`Added role <@&${roleId}> to this ticket from the action panel.`, reason), {});
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_ROLE_ADDED", "Discord role added to private ticket from action panel.", {
    channel_id: detail.discordTicketChannelId,
    discord_role_id: roleId,
    reason: reason || null,
    allow_permissions: allow.toString()
  });
  await audit(env, "SERVICE_REQUEST_ROLE_ADDED_FROM_DISCORD_PANEL", { request_id: detail.id, channel_id: detail.discordTicketChannelId, discord_role_id: roleId, reason: reason || null }, ctx.user.id);
  return messageResponse(`Added role to **${detail.requestNumber}**.`, true);
}

async function closeRequestFromPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, reason: string): Promise<DiscordInteractionResponse> {
  requireRequestPanelAction(ctx, detail);
  const cleanedReason = reason.trim() || "Closed from Discord request action panel.";
  const result = await closeServiceRequestTicketForContext(env, ctx, detail.id, cleanedReason, "discord", { commandName: "request-panel-close" });
  return messageResponse([
    `Request closed for **${result.detail.requestNumber}**.`,
    result.close.transcriptId ? `Transcript: **${result.close.transcriptId}**` : null,
    result.close.archiveChannelId ? `Archive: <#${result.close.archiveChannelId}>` : null,
    result.close.deletedChannel ? "Private Discord ticket channel deleted." : "No private Discord channel was deleted."
  ].filter(Boolean).join("\n"), true);
}

async function closeLawyerRequestFromPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace, reason: string): Promise<DiscordInteractionResponse> {
  return closeLawyerResponseSpace(env, ctx, detail, space, reason, "lawyer-panel-close");
}

async function closeLawyerResponseSpaceFromCloseCommand(env: Env, ctx: AuthContext, requestIdOrNumber: string, currentChannelId: string | undefined, reason: string, commandName: string): Promise<DiscordInteractionResponse> {
  const linked = await linkedLawyerResponseSpace(env, currentChannelId);
  if (!linked) return messageResponse("This close confirmation is no longer linked to an attorney response space. Run `/close-ticket` again inside the private attorney response space.", true);
  if (linked.detail.id !== requestIdOrNumber && linked.detail.requestNumber !== requestIdOrNumber) {
    return messageResponse("This close confirmation no longer matches the current attorney response space. Run `/close-ticket` again inside the correct space.", true);
  }
  return closeLawyerResponseSpace(env, ctx, linked.detail, linked.space, reason, commandName);
}

async function closeLawyerResponseSpace(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace, reason: string, commandName: string): Promise<DiscordInteractionResponse> {
  requireLawyerPanelAction(ctx, detail, space);
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) return messageResponse("Attorney response space is missing its Discord channel reference.", true);
  if (space.responseChannelId && detail.discordPublicChannelId && space.responseChannelId === detail.discordPublicChannelId) {
    return messageResponse("Refused to close the public lawyer request channel. This command only closes the private attorney response space.", true);
  }
  const cleanedReason = reason.trim() || "Closed from Discord lawyer action panel.";
  const target = ticketTargetFromLawyerResponse(detail, space);
  const transcript = await generateTranscript(env, target, ctx, commandName);
  const archive = await postTranscriptArchive(env, target, transcript, ctx);
  await updateRequestStatusFromPanel(env, ctx, detail, "CLOSED", {
    channelId,
    eventType: "LAWYER_STATUS_UPDATED",
    auditType: "LAWYER_REQUEST_CLOSED_FROM_DISCORD_PANEL",
    skipPrivateEmbedRefresh: true,
    skipPermissionCheck: true
  });
  await addServiceRequestEvent(env, detail.id, ctx.user.id, LAWYER_RESPONSE_SPACE_CLOSED_EVENT, "Private attorney response space closed from Discord.", {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    ...lawyerResponseSpaceMetadata(space),
    reason: cleanedReason,
    transcriptId: transcript.id,
    archiveChannel: archive,
    commandName
  });
  if (space.responseThreadId) {
    const archived = await archiveLawyerResponseThread(env, space);
    await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
      archived ? "Attorney response thread archived and locked after transcript storage." : "Attorney response thread archive/lock was requested but Discord did not confirm success.",
      ctx,
      "discord",
      { requestNumber: detail.requestNumber, responseSpaceId: channelId, commandName, archived }
    ));
    await audit(env, LAWYER_RESPONSE_SPACE_CLOSED_EVENT, { request_id: detail.id, request_number: detail.requestNumber, response_space_id: channelId, response_space_type: "thread", transcript_id: transcript.id }, ctx.user.id);
    return messageResponse([
      `Lawyer response space closed for **${detail.requestNumber}**.`,
      `Transcript: **${transcript.id}**`,
      archive ? `Archive: ${archive}` : "Archive channel is not configured.",
      archived ? "Private attorney response thread archived and locked." : "Thread archive/lock was not confirmed by Discord; check bot Manage Threads permissions."
    ].join("\n"), true);
  }
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    "Fallback private attorney response channel deletion requested after transcript storage.",
    ctx,
    "discord",
    { requestNumber: detail.requestNumber, responseSpaceId: channelId, commandName }
  ));
  const deleteResponse = await discordApi(env, `/channels/${channelId}`, { method: "DELETE" });
  if (!deleteResponse.ok) {
    const text = await deleteResponse.text().catch(() => "");
    await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
      `Attorney response channel deletion failed with Discord ${deleteResponse.status}.`,
      ctx,
      "discord",
      { requestNumber: detail.requestNumber, responseSpaceId: channelId, status: deleteResponse.status, response: text.slice(0, 180), commandName }
    ));
    throw new Error(`Discord attorney response channel delete failed with ${deleteResponse.status}: ${text.slice(0, 180)}`);
  }
  await appendTranscriptSystemEvent(env, transcript.id, transcriptSystemEvent(
    "Fallback private attorney response channel deleted after transcript storage.",
    ctx,
    "discord",
    { requestNumber: detail.requestNumber, responseSpaceId: channelId, commandName }
  ));
  await audit(env, LAWYER_RESPONSE_SPACE_CLOSED_EVENT, { request_id: detail.id, request_number: detail.requestNumber, response_space_id: channelId, response_space_type: "channel", transcript_id: transcript.id }, ctx.user.id);
  return messageResponse([
    `Lawyer response space closed for **${detail.requestNumber}**.`,
    `Transcript: **${transcript.id}**`,
    archive ? `Archive: ${archive}` : "Archive channel is not configured.",
    "Fallback private attorney response channel deleted."
  ].join("\n"), true);
}

async function archiveLawyerResponseThread(env: Env, space: LawyerResponseSpace): Promise<boolean> {
  if (!validDiscordId(space.responseThreadId)) return false;
  const response = await discordApi(env, `/channels/${space.responseThreadId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true, locked: true })
  });
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: "lawyer_response_thread_archive_failed",
      responseThreadId: space.responseThreadId,
      status: response.status,
      details: (await response.text().catch(() => "")).slice(0, 180)
    }));
    return false;
  }
  return true;
}

async function createDocketFromRequestPanel(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, values: Map<string, string>): Promise<DiscordInteractionResponse> {
  requireRequestPanelDocketAction(ctx, detail);
  if (!env.DB) return messageResponse("D1 is not available.", true);
  const title = (values.get("title") ?? "").trim();
  if (!title) return messageResponse("Docket title is required.", true);
  const suggestion = docketSuggestionFromRequest(detail);
  const rawCaseType = (values.get("caseType") ?? "").trim();
  const caseType = rawCaseType ? normalizeCaseType(rawCaseType) : suggestion.caseType;
  const proceedingType = rawCaseType ? proceedingFromCaseType(caseType) : suggestion.proceedingType;
  const status = normalizeDocketStatus(values.get("status") ?? "");
  const summary = (values.get("summary") ?? "").trim() || suggestion.summaryMarkdown || `Public docket entry linked to ${detail.requestNumber}.`;
  const assignedJudge = extractDiscordId(values.get("judge") ?? "");
  const docketNumber = await nextDocketNumber(env, caseType);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO docket_entries (
      id, docket_number, case_id, title, entry_type, case_type, proceeding_type, plaintiff, defendant,
      individuals_involved_json, judge_user_id, judge_name, status, filed_on, scheduled_for, scheduled_timezone,
      scheduled_discord_timestamp, scheduled_discord_relative, summary, summary_markdown, public_notes_markdown,
      private_notes_markdown, linked_service_request_id, linked_private_ticket_channel_id, linked_petition_url,
      discord_sync_status, is_public, is_archived, visibility, published_at, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'America/New_York', NULL, NULL, ?, ?, '', ?, ?, ?, ?, 'NOT_POSTED', 0, 0, 'PRIVATE', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`
  ).bind(
    id,
    docketNumber,
    docketNumber,
    title,
    caseType,
    caseType,
    proceedingType,
    suggestion.plaintiff ?? null,
    suggestion.defendant ?? null,
    JSON.stringify(suggestion.individualsInvolved ?? [detail.mainParty, detail.requesterDiscordUsername].filter(Boolean)),
    assignedJudge || ctx.user.id,
    assignedJudge ? `Discord ${assignedJudge}` : ctx.user.displayName,
    status,
    new Date().toISOString().slice(0, 10),
    summary,
    summary,
    `Created from private Discord request action panel for ${detail.requestNumber}.`,
    detail.id,
    detail.discordTicketChannelId,
    detail.documentUrl,
    JSON.stringify({ source: "discord_request_action_panel", requestId: detail.id, requestNumber: detail.requestNumber })
  ).run();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "REQUEST_DOCKET_CREATED", "Docket entry created from Discord request action panel.", {
    docketId: id,
    docketNumber,
    channel_id: detail.discordTicketChannelId
  });
  await audit(env, "REQUEST_DOCKET_CREATED_FROM_DISCORD_PANEL", { request_id: detail.id, docket_id: id, docket_number: docketNumber }, ctx.user.id);
  await env.DB.prepare("UPDATE service_requests SET status = CASE WHEN status = 'SUBMITTED' THEN 'UNDER_REVIEW' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(detail.id)
    .run();
  const portal = docketPortalUrl(env, id);
  if (detail.discordTicketChannelId) {
    await postTicketMessage(env, detail.discordTicketChannelId, `Private docket entry **${docketNumber}** created from this request.${portal ? `\n${portal}` : ""}`, {});
  }
  return messageResponse(`Docket created: **${docketNumber}**${portal ? `\n${portal}` : ""}`, true);
}

async function addUserToTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  const lawyerSpace = await linkedLawyerResponseSpace(env, interaction.channel_id);
  if (lawyerSpace) return addUserToLawyerResponseSpaceCommand(env, ctx, lawyerSpace, options);
  const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
  if (!detail?.discordTicketChannelId && await isCurrentChannelThread(env, interaction.channel_id)) {
    return messageResponse("This command must be used in a ticket channel, not inside a thread.", true);
  }
  requireTicketManagement(ctx);
  if (!detail?.discordTicketChannelId) return linkedTicketOnlyResponse();
  const userId = snowflakeOption(options, "user");
  if (!userId) return messageResponse("Missing required option: user.", true);
  const reason = stringOption(options, "reason");
  const allow = await ticketAccessAllow(env, detail.discordTicketChannelId);
  await putTicketPermissionOverwrite(env, detail.discordTicketChannelId, userId, 1, allow);
  const content = withReason(`Added <@${userId}> to this ticket.`, reason);
  await postTicketMessage(env, detail.discordTicketChannelId, content, { users: [userId] });
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_USER_ADDED", "Discord user added to private ticket channel.", {
    channel_id: detail.discordTicketChannelId,
    discord_user_id: userId,
    reason: reason || null,
    allow_permissions: allow.toString()
  });
  await audit(env, "SERVICE_REQUEST_TICKET_USER_ADDED", { request_id: detail.id, channel_id: detail.discordTicketChannelId, discord_user_id: userId, reason: reason || null }, ctx.user.id);
  return messageResponse(`Added user to **${detail.requestNumber}**.`, true);
}

async function addRoleToTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  const lawyerSpace = await linkedLawyerResponseSpace(env, interaction.channel_id);
  if (lawyerSpace) return addRoleToLawyerResponseSpaceCommand(env, ctx, lawyerSpace, options);
  const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
  if (!detail?.discordTicketChannelId && await isCurrentChannelThread(env, interaction.channel_id)) {
    return messageResponse("This command must be used in a ticket channel, not inside a thread.", true);
  }
  requireTicketManagement(ctx);
  if (!detail?.discordTicketChannelId) return linkedTicketOnlyResponse();
  const roleId = snowflakeOption(options, "role");
  if (!roleId) return messageResponse("Missing required option: role.", true);
  const reason = stringOption(options, "reason");
  const allow = await ticketAccessAllow(env, detail.discordTicketChannelId);
  await putTicketPermissionOverwrite(env, detail.discordTicketChannelId, roleId, 0, allow);
  const content = withReason(`Added <@&${roleId}> to this ticket.`, reason);
  await postTicketMessage(env, detail.discordTicketChannelId, content, { roles: [roleId] });
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_ROLE_ADDED", "Discord role added to private ticket channel.", {
    channel_id: detail.discordTicketChannelId,
    discord_role_id: roleId,
    reason: reason || null,
    allow_permissions: allow.toString()
  });
  await audit(env, "SERVICE_REQUEST_TICKET_ROLE_ADDED", { request_id: detail.id, channel_id: detail.discordTicketChannelId, discord_role_id: roleId, reason: reason || null }, ctx.user.id);
  return messageResponse(`Added role to **${detail.requestNumber}**.`, true);
}

async function renameTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManagement(ctx);
  const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
  if (!detail?.discordTicketChannelId) return linkedTicketOnlyResponse();
  const requestedName = stringOption(options, "name");
  if (!requestedName) return messageResponse("Missing required option: name.", true);
  const reason = stringOption(options, "reason");
  const oldChannel = await fetchDiscordChannel(env, detail.discordTicketChannelId);
  const newName = sanitizeTicketChannelName(requestedName, detail);
  const response = await discordApi(env, `/channels/${detail.discordTicketChannelId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName })
  });
  if (!response.ok) throw new Error(`Discord ticket rename failed with ${response.status}: ${await responseTextSnippet(response)}`);
  await postTicketMessage(env, detail.discordTicketChannelId, withReason(`Ticket renamed to #${newName}.`, reason), {});
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_RENAMED", `Ticket renamed to #${newName}.`, {
    channel_id: detail.discordTicketChannelId,
    old_name: oldChannel.name ?? null,
    new_name: newName,
    reason: reason || null
  });
  await audit(env, "SERVICE_REQUEST_TICKET_RENAMED", { request_id: detail.id, channel_id: detail.discordTicketChannelId, old_name: oldChannel.name ?? null, new_name: newName, reason: reason || null }, ctx.user.id);
  return messageResponse(`Ticket renamed to #${newName}.`, true);
}

async function claimTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManagement(ctx);
  const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
  if (!detail?.discordTicketChannelId) return linkedTicketOnlyResponse();
  return claimTicketForDetail(env, ctx, detail, stringOption(options, "note"), "claim-ticket");
}

async function unclaimTicket(env: Env, ctx: AuthContext, interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManagement(ctx);
  const detail = await linkedServiceTicketDetail(env, interaction.channel_id);
  if (!detail?.discordTicketChannelId) return linkedTicketOnlyResponse();
  const current = await latestServiceRequestTicketClaim(env, detail.id);
  if (!current) return messageResponse("This ticket is not currently claimed.", true);
  const note = stringOption(options, "note");
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "TICKET_UNCLAIMED", "Ticket claim cleared from Discord.", {
    channel_id: detail.discordTicketChannelId,
    staffDiscordId: ctx.user.discordId,
    staffDisplayName: ctx.user.displayName,
    previousStaffDiscordId: current.staffDiscordId,
    previousStaffDisplayName: current.staffDisplayName,
    note: note || null
  });
  await postTicketMessage(env, detail.discordTicketChannelId, withReason(`Ticket unclaimed by <@${ctx.user.discordId}>.`, note), { users: [ctx.user.discordId] });
  await audit(env, "SERVICE_REQUEST_TICKET_UNCLAIMED", { request_id: detail.id, channel_id: detail.discordTicketChannelId, previous_staff_discord_id: current.staffDiscordId, note: note || null }, ctx.user.id);
  return messageResponse(`Ticket unclaimed for **${detail.requestNumber}**.`, true);
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

async function postLawyerStickyCommand(env: Env, ctx: AuthContext) {
  requireAnyPermission(ctx, ["MANAGE_REQUESTS", "MANAGE_DISCORD_CHANNELS", "ADMIN"]);
  const result = await postLawyerSticky(env, { force: true });
  if (!result.ok || result.action !== "posted" || !result.channelId) {
    return messageResponse(result.reason ?? "Lawyer sticky was not posted.", true);
  }
  return messageResponse([
    `Lawyer sticky posted in <#${result.channelId}>.`,
    result.deletedPrevious ? "Previous sticky deleted." : "No previous sticky was deleted.",
    result.deleteWarning ?? null
  ].filter(Boolean).join("\n"), true);
}

async function claimLawyerRequestCommand(env: Env, ctx: AuthContext, _interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  const requestNumber = stringOption(options, "request_number");
  if (!requestNumber) return messageResponse("Missing required option: request_number.", true);
  const result = await ensureLawyerResponseSpace(env, ctx, requestNumber, ctx.user.discordId, {
    eventType: "LAWYER_RESPONSE_CLAIMED",
    source: "claim-lawyer-request",
    duplicateMode: "block-other-attorney"
  });
  return result.ok ? messageResponse(result.message, true) : result.response;
}

async function lawyerThreadCommand(env: Env, ctx: AuthContext, _interaction: DiscordInteraction, options: Map<string, OptionValue>) {
  requireTicketManagement(ctx);
  const requestNumber = stringOption(options, "request_number");
  const attorneyDiscordId = snowflakeOption(options, "attorney");
  if (!requestNumber) return messageResponse("Missing required option: request_number.", true);
  if (!attorneyDiscordId) return messageResponse("Missing required option: attorney.", true);
  const reason = stringOption(options, "reason");
  const result = await ensureLawyerResponseSpace(env, ctx, requestNumber, attorneyDiscordId, {
    eventType: "LAWYER_RESPONSE_THREAD_CREATED_BY_STAFF",
    source: "lawyer-thread",
    duplicateMode: "return-existing",
    reason
  });
  if (!result.ok) return result.response;

  const lines = [result.message];
  const participantPurpose = stringOption(options, "participant_purpose");
  const participants = [
    { userId: result.space.attorneyDiscordId === attorneyDiscordId ? "" : attorneyDiscordId, purpose: "staff_selected_attorney" },
    { userId: snowflakeOption(options, "secondary_counsel"), purpose: "secondary_counsel" },
    { userId: snowflakeOption(options, "judge"), purpose: "judge" },
    { userId: snowflakeOption(options, "add_user"), purpose: participantPurpose || "additional_participant" }
  ].filter((entry) => entry.userId && entry.userId !== result.space.attorneyDiscordId && entry.userId !== result.space.requesterDiscordId);

  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.userId)) continue;
    seen.add(participant.userId);
    const added = await addUserToLawyerResponseSpace(env, ctx, result.detail, result.space, participant.userId, {
      reason,
      purpose: participant.purpose,
      actorCanOverrideParticipantGate: true
    });
    if (!added.ok) return messageResponse([...lines, added.message].join("\n"), true);
    lines.push(added.message);
  }

  return messageResponse(lines.join("\n"), true);
}

async function ensureLawyerResponseSpace(
  env: Env,
  ctx: AuthContext,
  requestIdOrNumber: string,
  attorneyDiscordId: string,
  options: LawyerResponseSpaceOptions
): Promise<LawyerResponseEnsureResult> {
  if (!env.DB) return { ok: false, response: messageResponse("D1 is required for lawyer request responses.", true) };
  const detail = await getServiceRequestDetail(env, requestIdOrNumber);
  if (!detail) return { ok: false, response: messageResponse("Lawyer request not found.", true) };
  if (detail.requestType !== "LAWYER") return { ok: false, response: messageResponse("That request is not a lawyer request.", true) };
  if (!validDiscordId(attorneyDiscordId)) return { ok: false, response: messageResponse("Missing or invalid attorney Discord user.", true) };
  if (options.eventType === "LAWYER_RESPONSE_CLAIMED" && !canRespondToLawyerRequest(ctx)) {
    return { ok: false, response: messageResponse("Only authorized attorneys or DOJ legal staff may respond to lawyer requests.", true) };
  }

  const attorneyAvailability = await lawyerResponseMemberAvailability(env, attorneyDiscordId, attorneyDiscordId === ctx.user.discordId ? "attorney-self" : "attorney-other");
  if (!attorneyAvailability.ok) return { ok: false, response: messageResponse(attorneyAvailability.message, true) };

  const requesterDiscordId = validDiscordId(detail.requesterDiscordId) ? detail.requesterDiscordId : "";
  if (!requesterDiscordId) {
    return {
      ok: false,
      response: messageResponse("Cannot create a private response space because the requester's Discord account is not linked. Ask staff to contact them through the portal request record.", true)
    };
  }
  const requesterAvailability = await lawyerResponseMemberAvailability(env, requesterDiscordId, "requester");
  if (!requesterAvailability.ok) return { ok: false, response: messageResponse(requesterAvailability.message, true) };

  const existing = latestLawyerResponseSpaceFromDetail(detail);
  if (existing) {
    const availability = await fetchExistingLawyerResponseChannel(env, existing);
    if (availability.exists) {
      if (availability.channel) await reopenLawyerResponseThreadIfArchived(env, availability.channel);
      if (options.duplicateMode === "block-other-attorney" && existing.attorneyDiscordId !== attorneyDiscordId) {
        return {
          ok: false,
          response: messageResponse(`This request is already claimed by <@${existing.attorneyDiscordId}>. Staff may override or add another attorney if needed.`, true)
        };
      }
      const messagePost = await ensureLawyerResponseMessagesPosted(env, ctx, detail, existing);
      if (!messagePost.ok) {
        return {
          ok: true,
          detail,
          space: existing,
          created: false,
          message: `Private attorney response ${lawyerResponseSpaceNoun(existing)} already exists for **${detail.requestNumber}**, but the bot could not post the opening/details message: ${safeError(messagePost.cause)}\nSpace: ${lawyerResponseSpaceMention(existing)}`
        };
      }
      return {
        ok: true,
        detail,
        space: existing,
        created: false,
        message: `Private attorney response ${lawyerResponseSpaceNoun(existing)} already exists for **${detail.requestNumber}**: ${lawyerResponseSpaceMention(existing)}`
      };
    }
    await addServiceRequestEvent(env, detail.id, ctx.user.id, "LAWYER_RESPONSE_SPACE_STALE", "Stored attorney response space was not found in Discord; a new space may be created.", {
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      ...lawyerResponseSpaceMetadata(existing),
      previousAttorneyDiscordId: existing.attorneyDiscordId
    });
  }

  const originalChannelId = validDiscordId(options.originalChannelId) ? options.originalChannelId : detail.discordPublicChannelId;
  if (!validDiscordId(originalChannelId)) {
    return { ok: false, response: messageResponse("Cannot create a private response space because the public lawyer request channel is not linked to this request.", true) };
  }
  const originalMessageId = validDiscordId(options.originalMessageId) ? options.originalMessageId : detail.discordTicketMessageId;

  let created: CreatedLawyerResponseSpace;
  try {
    created = await createLawyerResponseSpace(env, detail, {
      requesterDiscordId,
      attorneyDiscordId,
      originalChannelId
    });
  } catch (cause) {
    return { ok: false, response: messageResponse(`Could not create a private attorney response space for **${detail.requestNumber}**: ${safeError(cause)}`, true) };
  }

  const createdAt = new Date().toISOString();
  const space: LawyerResponseSpace = {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    attorneyDiscordId,
    requesterDiscordId,
    responseSpaceType: created.kind,
    responseThreadId: created.kind === "thread" ? created.id : null,
    responseChannelId: created.kind === "channel" ? created.id : null,
    originalMessageId: originalMessageId ?? null,
    originalChannelId,
    eventType: options.eventType,
    actorUserId: ctx.user.id,
    createdAt
  };
  await addServiceRequestEvent(env, detail.id, ctx.user.id, options.eventType, options.eventType === "LAWYER_RESPONSE_CLAIMED" ? "Lawyer request claimed by an attorney from Discord." : "Attorney response space created by staff from Discord.", {
    attorneyDiscordId,
    requesterDiscordId,
    ...lawyerResponseSpaceMetadata(space),
    originalMessageId: space.originalMessageId,
    originalChannelId,
    requestNumber: detail.requestNumber,
    requestId: detail.id,
    createdAt,
    source: options.source,
    reason: options.reason || null,
    fallbackReason: created.fallbackReason ?? null
  });
  await audit(env, options.eventType, {
    request_id: detail.id,
    request_number: detail.requestNumber,
    attorney_discord_id: attorneyDiscordId,
    requester_discord_id: requesterDiscordId,
    response_thread_id: space.responseThreadId,
    response_channel_id: space.responseChannelId
  }, ctx.user.id);
  const messagePost = await ensureLawyerResponseMessagesPosted(env, ctx, detail, space);
  if (!messagePost.ok) {
    return {
      ok: true,
      detail,
      space,
      created: true,
      message: `Private attorney response ${lawyerResponseSpaceNoun(space)} was created, but the bot could not post the opening/details message: ${safeError(messagePost.cause)}\nSpace: ${lawyerResponseSpaceMention(space)}`
    };
  }
  await postPublicLawyerClaimNotice(env, detail, originalChannelId).catch((cause) => {
    console.warn(JSON.stringify({
      event: "lawyer_response_public_notice_failed",
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      channelId: originalChannelId,
      cause: safeError(cause)
    }));
  });

  return {
    ok: true,
    detail,
    space,
    created: true,
    message: `Private attorney response ${created.kind} created for **${detail.requestNumber}**: ${lawyerResponseSpaceMention(space)}`
  };
}

async function createLawyerResponseSpace(
  env: Env,
  detail: ServiceRequestDetail,
  input: { requesterDiscordId: string; attorneyDiscordId: string; originalChannelId: string }
): Promise<CreatedLawyerResponseSpace> {
  let threadFailure: string | null = null;
  try {
    return await createPrivateLawyerResponseThread(env, detail, input);
  } catch (cause) {
    if (cause instanceof LawyerResponseNoFallbackError) throw cause;
    threadFailure = safeError(cause);
    console.warn(JSON.stringify({
      event: "lawyer_response_thread_create_failed",
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      channelId: input.originalChannelId,
      cause: threadFailure
    }));
  }
  return createLawyerResponseFallbackChannel(env, detail, input, threadFailure);
}

async function createPrivateLawyerResponseThread(
  env: Env,
  detail: ServiceRequestDetail,
  input: { requesterDiscordId: string; attorneyDiscordId: string; originalChannelId: string }
): Promise<CreatedLawyerResponseSpace> {
  const response = await discordApi(env, `/channels/${input.originalChannelId}/threads`, {
    method: "POST",
    body: JSON.stringify({
      name: lawyerResponseSpaceName(detail),
      type: PRIVATE_THREAD,
      invitable: false,
      auto_archive_duration: 10080
    })
  });
  if (!response.ok) throw new Error(`Discord private thread create failed with ${response.status}: ${await responseTextSnippet(response)}`);
  const thread = await response.json() as { id: string; name?: string; type?: number };
  try {
    await addLawyerThreadMember(env, thread.id, input.requesterDiscordId);
    await addLawyerThreadMember(env, thread.id, input.attorneyDiscordId);
  } catch (cause) {
    const cleanup = await discordApi(env, `/channels/${thread.id}`, { method: "DELETE" }).catch((cleanupCause) => cleanupCause);
    if (!(cleanup instanceof Response) || (!cleanup.ok && cleanup.status !== 404)) {
      throw new LawyerResponseNoFallbackError(`Private attorney response thread ${thread.id} was created, but member setup failed and thread cleanup was not confirmed. No fallback channel was created. Original error: ${safeError(cause)}; cleanup: ${safeError(cleanup)}`);
    }
    throw cause;
  }
  return { kind: "thread", id: thread.id, name: thread.name ?? lawyerResponseSpaceName(detail) };
}

async function createLawyerResponseFallbackChannel(
  env: Env,
  detail: ServiceRequestDetail,
  input: { requesterDiscordId: string; attorneyDiscordId: string },
  threadFailure: string | null
): Promise<CreatedLawyerResponseSpace> {
  const categoryId = await lawyerResponseCategoryId(env);
  if (!categoryId) {
    throw new Error("Could not create a private response thread and no lawyer response category is configured for private channel fallback. Bot may need Create Private Threads, Send Messages in Threads, and Manage Threads in request-a-lawyer.");
  }
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const botUser = await fetchBotUser(env);
  const allow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY).toString();
  const botAllow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY | MANAGE_CHANNELS | MANAGE_ROLES).toString();
  const response = await discordApi(env, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: lawyerResponseSpaceName(detail),
      type: GUILD_TEXT_CHANNEL,
      parent_id: categoryId,
      topic: `Private attorney response space for ${detail.requestNumber}. Do not share private details outside authorized workflow.`,
      permission_overwrites: [
        { id: guildId, type: 0, allow: "0", deny: VIEW_CHANNEL.toString() },
        { id: botUser.id, type: 1, allow: botAllow, deny: "0" },
        { id: input.requesterDiscordId, type: 1, allow, deny: "0" },
        { id: input.attorneyDiscordId, type: 1, allow, deny: "0" }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Discord fallback response channel create failed with ${response.status}: ${await responseTextSnippet(response)}${threadFailure ? `; thread failure: ${threadFailure}` : ""}`);
  }
  const channel = await response.json() as { id: string; name?: string };
  return { kind: "channel", id: channel.id, name: channel.name ?? lawyerResponseSpaceName(detail), fallbackReason: threadFailure };
}

async function addUserToLawyerResponseSpaceCommand(env: Env, ctx: AuthContext, linked: LinkedLawyerResponseSpace, options: Map<string, OptionValue>) {
  if (!canManageLawyerResponseAccess(ctx)) return messageResponse("Only authorized legal/court staff may manage attorney response space participants.", true);
  const userId = snowflakeOption(options, "user");
  if (!userId) return messageResponse("Missing required option: user.", true);
  const added = await addUserToLawyerResponseSpace(env, ctx, linked.detail, linked.space, userId, {
    reason: stringOption(options, "reason"),
    purpose: "add-user",
    actorCanOverrideParticipantGate: canOverrideLawyerParticipantGate(ctx)
  });
  return messageResponse(added.message, true);
}

async function addRoleToLawyerResponseSpaceCommand(env: Env, ctx: AuthContext, linked: LinkedLawyerResponseSpace, options: Map<string, OptionValue>) {
  if (linked.space.responseThreadId || (linked.channel && isThreadChannel(linked.channel))) {
    return messageResponse("This command must be used in a ticket channel, not inside a thread.", true);
  }
  if (!canManageLawyerResponseAccess(ctx)) return messageResponse("Only authorized legal/court staff may manage attorney response space participants.", true);
  const roleId = snowflakeOption(options, "role");
  if (!roleId) return messageResponse("Missing required option: role.", true);
  if (!await roleAllowedInLawyerResponseSpace(env, roleId)) {
    return messageResponse("Only authorized legal/court staff may be added to attorney response spaces.", true);
  }
  const channelId = linked.space.responseChannelId;
  if (!validDiscordId(channelId)) return messageResponse("This command must be used in a ticket channel, not inside a thread.", true);
  const reason = stringOption(options, "reason");
  const allow = await ticketAccessAllow(env, channelId);
  await putTicketPermissionOverwrite(env, channelId, roleId, 0, allow);
  await postTicketMessage(env, channelId, withReason(`Added <@&${roleId}> to this attorney response space.`, reason), { roles: [roleId] });
  await logLawyerResponseParticipantAdded(env, ctx, linked.detail, linked.space, {
    participantType: "role",
    discordId: roleId,
    purpose: "add-role",
    reason,
    allowPermissions: allow.toString()
  });
  return messageResponse(`Added role to attorney response space for **${linked.detail.requestNumber}**.`, true);
}

async function addUserToLawyerResponseSpace(
  env: Env,
  ctx: AuthContext,
  detail: ServiceRequestDetail,
  space: LawyerResponseSpace,
  userId: string,
  options: { reason: string; purpose: string; actorCanOverrideParticipantGate: boolean }
): Promise<{ ok: boolean; message: string }> {
  const validation = await validateLawyerResponseUserParticipant(env, userId, options.actorCanOverrideParticipantGate);
  if (!validation.ok) return validation;
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) return { ok: false, message: "Attorney response space is missing its Discord channel reference." };
  if (space.responseThreadId) {
    await addLawyerThreadMember(env, space.responseThreadId, userId);
  } else {
    const allow = await ticketAccessAllow(env, channelId);
    await putTicketPermissionOverwrite(env, channelId, userId, 1, allow);
  }
  await postTicketMessage(env, channelId, withReason(`Added <@${userId}> to this attorney response space.`, options.reason), { users: [userId] });
  await logLawyerResponseParticipantAdded(env, ctx, detail, space, {
    participantType: "user",
    discordId: userId,
    purpose: options.purpose,
    reason: options.reason,
    allowPermissions: space.responseThreadId ? null : (await ticketAccessAllow(env, channelId)).toString()
  });
  return { ok: true, message: `Added user to attorney response space for **${detail.requestNumber}**.` };
}

async function validateLawyerResponseUserParticipant(env: Env, userId: string, actorCanOverrideParticipantGate: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const member = await fetchGuildMember(env, userId).catch(() => null);
  if (!member) return { ok: false, message: "Cannot add that user because they are not currently available in the Discord server." };
  const timeoutUntil = parseDiscordTimeout(member.communication_disabled_until);
  if (timeoutUntil && timeoutUntil.getTime() > Date.now()) {
    return { ok: false, message: "Cannot add that user because they are currently timed out in Discord." };
  }
  if (actorCanOverrideParticipantGate) return { ok: true };
  if (await memberHasAnyLogicalPermission(env, member.roles, LAWYER_RESPONSE_PARTICIPANT_PERMISSIONS)) return { ok: true };
  return { ok: false, message: "Only authorized legal/court staff may be added to attorney response spaces." };
}

async function linkedLawyerResponseSpace(env: Env, channelId: string | undefined): Promise<LinkedLawyerResponseSpace | null> {
  if (!env.DB || !validDiscordId(channelId)) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT request_id as requestId, actor_user_id as actorUserId, event_type as eventType,
        metadata_json as metadataJson, created_at as createdAt
       FROM service_request_events
       WHERE event_type IN ('LAWYER_RESPONSE_CLAIMED', 'LAWYER_RESPONSE_THREAD_CREATED_BY_STAFF')
         AND (
           json_extract(metadata_json, '$.responseThreadId') = ?
           OR json_extract(metadata_json, '$.responseChannelId') = ?
           OR json_extract(metadata_json, '$.responseSpaceId') = ?
         )
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
      .bind(channelId, channelId, channelId)
      .first<{ requestId: string; actorUserId: string | null; eventType: string; metadataJson: string; createdAt: string }>();
    if (!row) return null;
    const metadata = parseMetadataJson(row.metadataJson);
    const detail = await getServiceRequestDetail(env, row.requestId);
    if (!detail || detail.requestType !== "LAWYER") return null;
    const space = lawyerResponseSpaceFromMetadata(metadata, {
      requestId: row.requestId,
      requestNumber: detail.requestNumber,
      eventType: row.eventType,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt
    });
    if (!space) return null;
    return { detail, space, channel: await fetchDiscordChannelIfAvailable(env, channelId) };
  } catch (cause) {
    console.warn(JSON.stringify({ event: "linked_lawyer_response_space_lookup_failed", channelId, cause: safeError(cause) }));
    return null;
  }
}

async function logLawyerResponseParticipantAdded(
  env: Env,
  ctx: AuthContext,
  detail: ServiceRequestDetail,
  space: LawyerResponseSpace,
  input: { participantType: "user" | "role"; discordId: string; purpose: string; reason: string; allowPermissions: string | null }
) {
  await addServiceRequestEvent(env, detail.id, ctx.user.id, "LAWYER_RESPONSE_PARTICIPANT_ADDED", "Participant added to attorney response space from Discord.", {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    ...lawyerResponseSpaceMetadata(space),
    participantType: input.participantType,
    participantDiscordId: input.participantType === "user" ? input.discordId : null,
    participantRoleId: input.participantType === "role" ? input.discordId : null,
    participantPurpose: input.purpose || null,
    reason: input.reason || null,
    allowPermissions: input.allowPermissions,
    addedByDiscordId: ctx.user.discordId,
    attorneyDiscordId: space.attorneyDiscordId,
    requesterDiscordId: space.requesterDiscordId,
    createdAt: new Date().toISOString()
  });
  await audit(env, "LAWYER_RESPONSE_PARTICIPANT_ADDED", {
    request_id: detail.id,
    request_number: detail.requestNumber,
    response_thread_id: space.responseThreadId,
    response_channel_id: space.responseChannelId,
    participant_type: input.participantType,
    participant_discord_id: input.discordId
  }, ctx.user.id);
}

async function lawyerResponseMemberAvailability(env: Env, discordId: string, kind: "attorney-self" | "attorney-other" | "requester"): Promise<{ ok: true } | { ok: false; message: string }> {
  const member = await fetchGuildMember(env, discordId).catch(() => null);
  if (!member) {
    if (kind === "requester") return { ok: false, message: "Cannot add the requester because they are not currently available in the Discord server." };
    return { ok: false, message: "Cannot add the selected attorney because they are not currently available in the Discord server." };
  }
  const timeoutUntil = parseDiscordTimeout(member.communication_disabled_until);
  if (timeoutUntil && timeoutUntil.getTime() > Date.now()) {
    if (kind === "requester") return { ok: false, message: "The requester is currently timed out in Discord, so the bot cannot open a private response thread until the timeout expires." };
    if (kind === "attorney-self") return { ok: false, message: "You are currently timed out and cannot claim/respond to lawyer requests." };
    return { ok: false, message: "The selected attorney is currently timed out in Discord and cannot be assigned to lawyer requests until the timeout expires." };
  }
  return { ok: true };
}

async function lawyerResponseCategoryId(env: Env): Promise<string | null> {
  for (const key of LAWYER_RESPONSE_CATEGORY_KEYS) {
    const row = await env.DB!.prepare(
      "SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ? AND discord_channel_id != '' ORDER BY is_reference_only ASC, updated_at DESC LIMIT 1"
    )
      .bind(key)
      .first<{ id: string | null }>();
    if (validDiscordId(row?.id)) return row.id;
  }
  return null;
}

async function addLawyerThreadMember(env: Env, threadId: string, userId: string): Promise<void> {
  const response = await discordApi(env, `/channels/${threadId}/thread-members/${userId}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Discord thread member add failed with ${response.status}: ${await responseTextSnippet(response)}`);
}

async function postLawyerResponseOpeningMessage(env: Env, channelId: string, detail: ServiceRequestDetail): Promise<string | null> {
  return postTicketMessage(env, channelId, [
    `Private attorney response space for ${detail.requestNumber}.`,
    "",
    "Use this space for attorney-client coordination, DOJ staff oversight, and authorized legal response work. Do not repost private details publicly."
  ].join("\n"), {});
}

function lawyerResponsePanelComponents(env: Env, detail: ServiceRequestDetail): DiscordComponent[] {
  const rows: DiscordComponent[] = [{
    type: 1,
    components: [{
      type: 3,
      custom_id: `law:status:${detail.id}`,
      placeholder: "Set lawyer request status",
      min_values: 1,
      max_values: 1,
      options: [
        { label: "Received", value: "RECEIVED", description: "Mark the lawyer request as received." },
        { label: "Under Review", value: "UNDER_REVIEW", description: "Move the lawyer request into review." },
        { label: "Needs Info", value: "NEEDS_INFO", description: "Request more information." },
        { label: "Closed", value: "CLOSED", description: "Close the lawyer request without reposting private details." }
      ]
    }]
  }, {
    type: 1,
    components: [
      { type: 2, style: 2, label: "Add Co-Counsel", custom_id: `law:addCounsel:${detail.id}` },
      { type: 2, style: 2, label: "Add DOJ Oversight", custom_id: `law:addOversight:${detail.id}` },
      { type: 2, style: 2, label: "Add Judge", custom_id: `law:addJudge:${detail.id}` },
      { type: 2, style: 4, label: "Close Lawyer Request", custom_id: `law:close:${detail.id}` }
    ]
  }];
  const portalUrl = lawyerRequestPortalUrl(env, detail.id);
  if (portalUrl) {
    rows.push({
      type: 1,
      components: [{ type: 2, style: 5, label: "View Portal Request", url: portalUrl }]
    });
  }
  return rows;
}

async function ensureLawyerResponseMessagesPosted(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<{ ok: true } | { ok: false; cause: unknown }> {
  try {
    await ensureLawyerResponseOpeningPosted(env, ctx, detail, space);
    await ensureLawyerResponsePanelPosted(env, ctx, detail, space);
    await ensureLawyerResponseDetailsPosted(env, ctx, detail, space);
    return { ok: true };
  } catch (cause) {
    const channelId = lawyerResponseSpaceChannelId(space);
    await addServiceRequestEvent(env, detail.id, ctx.user.id, LAWYER_RESPONSE_MESSAGE_POST_FAILED_EVENT, "Private attorney response space was created or returned, but the bot could not post the opening/details message.", {
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      ...lawyerResponseSpaceMetadata(space),
      attorneyDiscordId: space.attorneyDiscordId,
      requesterDiscordId: space.requesterDiscordId,
      cause: safeError(cause),
      failedAt: new Date().toISOString()
    });
    console.warn(JSON.stringify({
      event: "lawyer_response_message_post_failed",
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      responseSpaceId: validDiscordId(channelId) ? channelId : null,
      cause: safeError(cause)
    }));
    return { ok: false, cause };
  }
}

async function ensureLawyerResponseOpeningPosted(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<void> {
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) throw new Error("Attorney response space is missing its Discord channel reference.");
  if (await lawyerResponseOpeningAlreadyPosted(env, detail, space)) return;

  const postedMessageId = await postLawyerResponseOpeningMessage(env, channelId, detail);
  const postedAt = new Date().toISOString();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, LAWYER_RESPONSE_OPENING_POSTED_EVENT, "Private attorney response opening message posted.", {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    ...lawyerResponseSpaceMetadata(space),
    postedMessageId,
    postedAt
  });
}

async function lawyerResponseOpeningAlreadyPosted(env: Env, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<boolean> {
  return lawyerResponseMessageEventExists(env, detail, space, LAWYER_RESPONSE_OPENING_POSTED_EVENT);
}

async function ensureLawyerResponsePanelPosted(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<void> {
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) throw new Error("Attorney response space is missing its Discord channel reference.");
  if (await lawyerResponseMessageEventExists(env, detail, space, LAWYER_RESPONSE_PANEL_POSTED_EVENT)) return;
  const postedMessageId = await postTicketMessage(env, channelId, `Lawyer request action panel for ${detail.requestNumber}.`, {}, lawyerResponsePanelComponents(env, detail));
  const postedAt = new Date().toISOString();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, LAWYER_RESPONSE_PANEL_POSTED_EVENT, "Private attorney response action panel posted.", {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    ...lawyerResponseSpaceMetadata(space),
    postedMessageId,
    postedAt
  });
}

async function ensureLawyerResponseDetailsPosted(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<void> {
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) throw new Error("Attorney response space is missing its Discord channel reference.");
  if (await lawyerResponseDetailsAlreadyPosted(env, detail, space)) return;

  const embeds = lawyerResponseDetailsEmbeds(env, detail);
  const postedMessageIds = await postLawyerResponseDetailsEmbeds(env, channelId, embeds);
  const postedAt = new Date().toISOString();
  await addServiceRequestEvent(env, detail.id, ctx.user.id, LAWYER_RESPONSE_DETAILS_POSTED_EVENT, "Private lawyer request details posted inside attorney response space.", {
    requestId: detail.id,
    requestNumber: detail.requestNumber,
    ...lawyerResponseSpaceMetadata(space),
    postedMessageId: postedMessageIds[0] ?? null,
    postedMessageIds,
    postedAt
  });
}

async function lawyerResponseDetailsAlreadyPosted(env: Env, detail: ServiceRequestDetail, space: LawyerResponseSpace): Promise<boolean> {
  return lawyerResponseMessageEventExists(env, detail, space, LAWYER_RESPONSE_DETAILS_POSTED_EVENT);
}

async function lawyerResponseMessageEventExists(env: Env, detail: ServiceRequestDetail, space: LawyerResponseSpace, eventType: string): Promise<boolean> {
  const channelId = lawyerResponseSpaceChannelId(space);
  for (const event of detail.events) {
    if (event.eventType !== eventType) continue;
    const responseThreadId = metadataString(event.metadata, "responseThreadId");
    const responseChannelId = metadataString(event.metadata, "responseChannelId");
    const responseSpaceId = metadataString(event.metadata, "responseSpaceId");
    if (validDiscordId(channelId) && (responseThreadId === channelId || responseChannelId === channelId || responseSpaceId === channelId)) return true;
  }
  if (!env.DB || !validDiscordId(channelId)) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM service_request_events
     WHERE request_id = ?
       AND event_type = ?
       AND (
         json_extract(metadata_json, '$.responseThreadId') = ?
         OR json_extract(metadata_json, '$.responseChannelId') = ?
         OR json_extract(metadata_json, '$.responseSpaceId') = ?
       )
     LIMIT 1`
  )
    .bind(detail.id, eventType, channelId, channelId, channelId)
    .first<{ id: string }>();
  return Boolean(row?.id);
}

async function postLawyerResponseDetailsEmbeds(env: Env, channelId: string, embeds: LawyerResponseDetailsEmbed[]): Promise<string[]> {
  const messageIds: string[] = [];
  for (const embed of embeds) {
    const response = await discordApi(env, `/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] }
      })
    });
    if (!response.ok) throw new Error(`Discord lawyer private details post failed with ${response.status}: ${await responseTextSnippet(response)}`);
    const message = await response.json().catch(() => ({})) as { id?: unknown };
    if (typeof message.id === "string") messageIds.push(message.id);
  }
  return messageIds;
}

function lawyerResponseDetailsEmbeds(env: Env, detail: ServiceRequestDetail): LawyerResponseDetailsEmbed[] {
  const rawFields = lawyerResponseDetailFields(detail);
  let fields = splitLawyerDetailFields(rawFields);
  let truncated = false;
  const portalUrl = lawyerRequestPortalUrl(env, detail.id);
  const detailFieldBudget = (LAWYER_RESPONSE_DETAILS_MAX_EMBEDS * LAWYER_RESPONSE_DETAILS_MAX_FIELDS_PER_EMBED) - 1;
  if (fields.length > detailFieldBudget) {
    fields = fields.slice(0, Math.max(0, detailFieldBudget));
    truncated = true;
  }
  if (portalUrl) {
    fields.push({
      name: truncated ? "View Full Request in Portal" : "Portal Request",
      value: truncated ? `Some details were shortened for Discord limits. [View full request in portal](${portalUrl})` : `[View request in portal](${portalUrl})`,
      inline: false
    });
  } else if (truncated) {
    fields.push({
      name: "View Full Request in Portal",
      value: "Some details were shortened for Discord limits. Open the request in the DOJ Portal for the complete record.",
      inline: false
    });
  }

  const title = truncate(`Private Request Details \u2014 ${detail.requestNumber}`, 256);
  const chunks = chunkLawyerEmbedFields(fields);
  return chunks.map((chunk, index) => ({
    title: index === 0 ? title : truncate(`${title} (continued)`, 256),
    description: index === 0 ? LAWYER_RESPONSE_DETAILS_NOTE : undefined,
    color: 0xff2fae,
    fields: chunk,
    footer: { text: "Private DOJ attorney response space." },
    timestamp: detail.createdAt
  }));
}

function lawyerResponseDetailFields(detail: ServiceRequestDetail): LawyerDetailRawField[] {
  const payload = detail.payload;
  const includedPayloadKeys = new Set<string>();
  const fields: LawyerDetailRawField[] = [
    { name: "Request Number", value: detail.requestNumber, inline: true },
    { name: "Submitted By Discord", value: lawyerRequesterText(detail), inline: true },
    { name: "Status", value: detail.status, inline: true }
  ];

  for (const spec of LAWYER_CORE_DETAIL_FIELDS) {
    addLawyerPayloadDetailField(fields, includedPayloadKeys, payload, spec);
  }

  const representationType = lawyerPayloadText(payload.representationType);
  for (const spec of LAWYER_ROUTE_DETAIL_FIELDS[representationType] ?? []) {
    addLawyerPayloadDetailField(fields, includedPayloadKeys, payload, spec);
  }

  if (detail.requesterContact) {
    fields.push({ name: "Requester Contact Record", value: detail.requesterContact, inline: true });
  }
  if (detail.documentUrl) {
    fields.push({ name: "Document Link", value: detail.documentUrl, inline: false });
  }

  for (const [key, value] of Object.entries(payload)) {
    if (includedPayloadKeys.has(key)) continue;
    const text = lawyerPayloadText(value);
    if (!text) continue;
    fields.push({ name: humanizeLawyerPayloadKey(key), value: text, inline: false });
  }

  return fields;
}

function addLawyerPayloadDetailField(
  fields: LawyerDetailRawField[],
  includedPayloadKeys: Set<string>,
  payload: Record<string, unknown>,
  spec: LawyerPayloadFieldSpec
): void {
  includedPayloadKeys.add(spec.key);
  const value = lawyerPayloadText(payload[spec.key]);
  if (!value) return;
  fields.push({ name: spec.label, value, inline: spec.inline ?? false });
}

function splitLawyerDetailFields(rawFields: LawyerDetailRawField[]): DiscordEmbedField[] {
  const fields: DiscordEmbedField[] = [];
  for (const field of rawFields) {
    const chunks = chunkLawyerFieldValue(field.value);
    for (const [index, chunk] of chunks.entries()) {
      fields.push({
        name: chunks.length === 1 ? fitLawyerFieldName(field.name) : fitLawyerFieldName(`${field.name} ${index + 1}/${chunks.length}`),
        value: chunk,
        inline: field.inline && chunks.length === 1
      });
    }
  }
  return fields;
}

function chunkLawyerEmbedFields(fields: DiscordEmbedField[]): DiscordEmbedField[][] {
  const chunks: DiscordEmbedField[][] = [];
  let current: DiscordEmbedField[] = [];
  for (const field of fields) {
    if (current.length >= LAWYER_RESPONSE_DETAILS_MAX_FIELDS_PER_EMBED) {
      chunks.push(current);
      current = [];
    }
    current.push(field);
  }
  if (current.length) chunks.push(current);
  return chunks.length ? chunks : [[{ name: "Details", value: "No submitted details were available.", inline: false }]];
}

function chunkLawyerFieldValue(value: string): string[] {
  const normalized = normalizeLawyerFieldText(value);
  if (!normalized) return ["Not provided"];
  if (normalized.length <= LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE) return [normalized];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE) {
    let end = remaining.lastIndexOf(" ", LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE);
    if (end < Math.floor(LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE * 0.6)) end = LAWYER_RESPONSE_DETAILS_MAX_FIELD_VALUE;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function lawyerPayloadText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return normalizeLawyerFieldText(value);
  if (Array.isArray(value)) return value.map((item) => lawyerPayloadText(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return normalizeLawyerFieldText(JSON.stringify(value));
  return normalizeLawyerFieldText(String(value));
}

function lawyerRequesterText(detail: ServiceRequestDetail): string {
  const parts = [detail.requesterDiscordUsername, detail.requesterDiscordId ? `Discord ID ${detail.requesterDiscordId}` : ""].filter(Boolean);
  return parts.join(" / ") || "Unknown";
}

function lawyerRequestPortalUrl(env: Env, requestId: string): string | null {
  const base = env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    return new URL(`/requests/${encodeURIComponent(requestId)}`, base).toString();
  } catch {
    return null;
  }
}

function fitLawyerFieldName(value: string): string {
  const normalized = normalizeLawyerFieldText(value) || "Details";
  if (normalized.length <= LAWYER_RESPONSE_DETAILS_MAX_FIELD_NAME) return normalized;
  return `${normalized.slice(0, LAWYER_RESPONSE_DETAILS_MAX_FIELD_NAME - 3).trimEnd()}...`;
}

function normalizeLawyerFieldText(value: string): string {
  return value.replaceAll(/[\u0000-\u001f]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

function humanizeLawyerPayloadKey(key: string): string {
  return key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

async function postPublicLawyerClaimNotice(env: Env, detail: ServiceRequestDetail, channelId: string) {
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `${detail.requestNumber} has been picked up by an attorney. Private response space opened.`,
      allowed_mentions: { parse: [] }
    })
  });
  if (!response.ok) throw new Error(`Discord lawyer claim notice failed with ${response.status}: ${await responseTextSnippet(response)}`);
}

async function fetchExistingLawyerResponseChannel(env: Env, space: LawyerResponseSpace): Promise<{ exists: boolean; channel: DiscordChannelDetails | null }> {
  const channelId = lawyerResponseSpaceChannelId(space);
  if (!validDiscordId(channelId)) return { exists: false, channel: null };
  const response = await discordApi(env, `/channels/${channelId}`);
  if (response.status === 404) return { exists: false, channel: null };
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: "lawyer_response_space_fetch_failed",
      channelId,
      status: response.status,
      details: (await response.text().catch(() => "")).slice(0, 180)
    }));
    return { exists: true, channel: null };
  }
  return { exists: true, channel: await response.json() as DiscordChannelDetails };
}

async function reopenLawyerResponseThreadIfArchived(env: Env, channel: DiscordChannelDetails): Promise<void> {
  if (!isThreadChannel(channel) || !channel.thread_metadata?.archived) return;
  const response = await discordApi(env, `/channels/${channel.id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: false })
  });
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: "lawyer_response_thread_reopen_failed",
      channelId: channel.id,
      status: response.status,
      details: (await response.text().catch(() => "")).slice(0, 180)
    }));
  }
}

async function fetchDiscordChannelIfAvailable(env: Env, channelId: string | undefined): Promise<DiscordChannelDetails | null> {
  if (!validDiscordId(channelId)) return null;
  try {
    return await fetchDiscordChannel(env, channelId);
  } catch {
    return null;
  }
}

async function isCurrentChannelThread(env: Env, channelId: string | undefined): Promise<boolean> {
  const channel = await fetchDiscordChannelIfAvailable(env, channelId);
  return channel ? isThreadChannel(channel) : false;
}

function latestLawyerResponseSpaceFromDetail(detail: ServiceRequestDetail): LawyerResponseSpace | null {
  const eventTypes: readonly string[] = LAWYER_RESPONSE_EVENT_TYPES;
  for (const event of [...detail.events].reverse()) {
    if (!eventTypes.includes(event.eventType)) continue;
    const space = lawyerResponseSpaceFromMetadata(event.metadata, {
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt
    });
    if (space) return space;
  }
  return null;
}

function lawyerResponseSpaceFromMetadata(
  metadata: Record<string, unknown>,
  fallback: { requestId: string; requestNumber: string; eventType: string; actorUserId: string | null; createdAt: string }
): LawyerResponseSpace | null {
  const attorneyDiscordId = metadataString(metadata, "attorneyDiscordId");
  const requesterDiscordId = metadataString(metadata, "requesterDiscordId");
  const responseSpaceId = metadataString(metadata, "responseSpaceId");
  const explicitType = metadataString(metadata, "responseSpaceType");
  let responseThreadId = metadataString(metadata, "responseThreadId");
  let responseChannelId = metadataString(metadata, "responseChannelId");
  if (!validDiscordId(responseThreadId) && !validDiscordId(responseChannelId) && validDiscordId(responseSpaceId)) {
    if (explicitType === "thread") responseThreadId = responseSpaceId;
    if (explicitType === "channel") responseChannelId = responseSpaceId;
  }
  if (!validDiscordId(attorneyDiscordId) || !validDiscordId(requesterDiscordId)) return null;
  if (!validDiscordId(responseThreadId) && !validDiscordId(responseChannelId)) return null;
  const responseSpaceType = validDiscordId(responseThreadId) ? "thread" : "channel";
  return {
    requestId: metadataString(metadata, "requestId") || fallback.requestId,
    requestNumber: metadataString(metadata, "requestNumber") || fallback.requestNumber,
    attorneyDiscordId,
    requesterDiscordId,
    responseSpaceType,
    responseThreadId: validDiscordId(responseThreadId) ? responseThreadId : null,
    responseChannelId: validDiscordId(responseChannelId) ? responseChannelId : null,
    originalMessageId: validDiscordId(metadataString(metadata, "originalMessageId")) ? metadataString(metadata, "originalMessageId") : null,
    originalChannelId: validDiscordId(metadataString(metadata, "originalChannelId")) ? metadataString(metadata, "originalChannelId") : null,
    eventType: fallback.eventType,
    actorUserId: fallback.actorUserId,
    createdAt: metadataString(metadata, "createdAt") || fallback.createdAt
  };
}

function lawyerResponseSpaceChannelId(space: LawyerResponseSpace): string {
  return space.responseThreadId ?? space.responseChannelId ?? "";
}

function lawyerResponseSpaceMetadata(space: LawyerResponseSpace): { responseSpaceId: string | null; responseSpaceType: "thread" | "channel"; responseThreadId: string | null; responseChannelId: string | null } {
  const responseSpaceId = lawyerResponseSpaceChannelId(space);
  return {
    responseSpaceId: validDiscordId(responseSpaceId) ? responseSpaceId : null,
    responseSpaceType: space.responseSpaceType,
    responseThreadId: space.responseThreadId,
    responseChannelId: space.responseChannelId
  };
}

function lawyerResponseSpaceNoun(space: Pick<LawyerResponseSpace, "responseSpaceType">): "thread" | "channel" {
  return space.responseSpaceType;
}

function lawyerResponseSpaceMention(space: LawyerResponseSpace): string {
  const channelId = lawyerResponseSpaceChannelId(space);
  return validDiscordId(channelId) ? `<#${channelId}>` : "the private response space";
}

function lawyerResponseCloseTargetRef(target: TicketTarget): string {
  return `lawresp_${(target.sourceNumber ?? target.sourceId ?? "").replaceAll(/[^\w-]/g, "").slice(0, 40)}`;
}

function isLawyerResponseCloseTargetRef(value: string): boolean {
  return value.startsWith("lawresp_") && value.length > "lawresp_".length;
}

function decodeLawyerResponseCloseTargetRef(value: string): string {
  return value.slice("lawresp_".length);
}

function lawyerResponseSpaceName(detail: ServiceRequestDetail): string {
  return `${detail.requestNumber}-attorney-response`
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 90);
}

function canRespondToLawyerRequest(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "ADMIN")
    || hasActionPermission(ctx, "MANAGE_REQUESTS")
    || hasAnyLogicalPermission(ctx, LAWYER_RESPONSE_PERMISSIONS);
}

function canManageLawyerResponseAccess(ctx: AuthContext): boolean {
  return canOverrideLawyerParticipantGate(ctx) || hasAnyLogicalPermission(ctx, LAWYER_RESPONSE_PARTICIPANT_PERMISSIONS);
}

function canOverrideLawyerParticipantGate(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "ADMIN") || hasActionPermission(ctx, "MANAGE_REQUESTS");
}

function hasAnyLogicalPermission(ctx: AuthContext, permissions: readonly LogicalPermission[]): boolean {
  return ctx.permissions.includes("ADMIN") || permissions.some((permission) => ctx.permissions.includes(permission));
}

async function memberHasAnyLogicalPermission(env: Env, roleIds: string[], permissions: readonly LogicalPermission[]): Promise<boolean> {
  for (const roleId of roleIds) {
    const row = await env.DB!.prepare("SELECT permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ? AND is_reference_only = 0")
      .bind(roleId)
      .first<{ permissionKey: LogicalPermission | null }>();
    if (row?.permissionKey && permissions.includes(row.permissionKey)) return true;
  }
  return false;
}

async function roleAllowedInLawyerResponseSpace(env: Env, roleId: string): Promise<boolean> {
  const row = await env.DB!.prepare("SELECT permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ? AND is_reference_only = 0")
    .bind(roleId)
    .first<{ permissionKey: LogicalPermission | null }>();
  return Boolean(row?.permissionKey && LAWYER_RESPONSE_PARTICIPANT_PERMISSIONS.includes(row.permissionKey));
}

function isThreadChannel(channel: DiscordChannelDetails): boolean {
  return channel.type === ANNOUNCEMENT_THREAD || channel.type === PUBLIC_THREAD || channel.type === PRIVATE_THREAD;
}

function parseDiscordTimeout(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLawyerResponseCustomId(customId: string): { action: "claim"; requestId: string } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "lawyer_response" || parts[1] !== "claim" || !parts[2]) return null;
  return { action: "claim", requestId: parts[2] };
}

function parsePanelCustomId(customId: string, scope: "req" | "law"): PanelCustomId | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== scope || !parts[1] || !parts[2]) return null;
  return { scope, action: parts[1], requestId: parts[2] };
}

function parsePanelModalCustomId(customId: string): PanelModalCustomId | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || (parts[0] !== "req" && parts[0] !== "law") || !parts[1].endsWith("Modal") || !parts[2]) return null;
  return { scope: parts[0], action: parts[1].slice(0, -"Modal".length), requestId: parts[2] };
}

function requestPanelModal(action: string, requestId: string): DiscordInteractionResponse | null {
  if (action === "addUser") {
    return modalResponse(`req:addUserModal:${requestId}`, "Add Person", [
      textInput("user", "Discord user ID or @mention", 1, { placeholder: "123456789012345678 or @Name" }),
      textInput("reason", "Reason / access note", 2, { required: false, placeholder: "Why this person needs access" })
    ]);
  }
  if (action === "addRole") {
    return modalResponse(`req:addRoleModal:${requestId}`, "Add Role", [
      textInput("role", "Discord role ID or @role", 1, { placeholder: "123456789012345678 or @Role" }),
      textInput("reason", "Reason / access note", 2, { required: false, placeholder: "Why this role needs access" })
    ]);
  }
  if (action === "createDocket") {
    return modalResponse(`req:createDocketModal:${requestId}`, "Create Docket Entry", [
      textInput("title", "Docket title", 1, { placeholder: "State v. Name / Petition review" }),
      textInput("caseType", "Case type", 1, { required: false, placeholder: "CRIMINAL, CIVIL, WARRANT, SUBPOENA, EXPUNGEMENT" }),
      textInput("summary", "Short public docket summary", 2, { placeholder: "Public-safe summary only. No private request facts." }),
      textInput("judge", "Assigned judge/user ID", 1, { required: false, placeholder: "Optional Discord user ID or @mention" }),
      textInput("status", "Initial docket status", 1, { required: false, placeholder: "DRAFT, PENDING, IN_REVIEW, SCHEDULED" })
    ]);
  }
  if (action === "close") {
    return modalResponse(`req:closeModal:${requestId}`, "Close Request", [
      textInput("reason", "Close reason", 2, { placeholder: "Reason for closing this request/channel" })
    ]);
  }
  return null;
}

function lawyerPanelModal(action: string, requestId: string): DiscordInteractionResponse | null {
  if (action === "addCounsel" || action === "addOversight" || action === "addJudge") {
    const title = action === "addCounsel" ? "Add Co-Counsel" : action === "addOversight" ? "Add DOJ Oversight" : "Add Judge";
    return modalResponse(`law:${action}Modal:${requestId}`, title, [
      textInput("user", "Discord user ID or @mention", 1, { placeholder: "123456789012345678 or @Name" }),
      textInput("reason", "Reason / access note", 2, { required: false, placeholder: "Why this person should join the response space" })
    ]);
  }
  if (action === "close") {
    return modalResponse(`law:closeModal:${requestId}`, "Close Lawyer Request", [
      textInput("reason", "Close reason", 2, { placeholder: "Reason for closing this lawyer request" })
    ]);
  }
  return null;
}

function modalResponse(customId: string, title: string, inputs: DiscordComponent[]): DiscordInteractionResponse {
  return {
    type: 9,
    data: {
      custom_id: truncate(customId, 100),
      title: truncate(title, 45),
      components: inputs.map((input) => ({ type: 1, components: [input] }))
    }
  };
}

function textInput(
  customId: string,
  label: string,
  style: 1 | 2,
  options: { required?: boolean; placeholder?: string; minLength?: number; maxLength?: number } = {}
): DiscordComponent {
  return {
    type: 4,
    custom_id: customId,
    label,
    style,
    required: options.required ?? true,
    placeholder: options.placeholder,
    min_length: options.minLength,
    max_length: options.maxLength ?? (style === 1 ? 200 : 1000)
  };
}

function modalValueMap(interaction: DiscordInteraction): Map<string, string> {
  const values = new Map<string, string>();
  const visit = (component: DiscordComponent) => {
    if (component.custom_id && typeof component.value === "string") values.set(component.custom_id, component.value.trim());
    for (const child of component.components ?? []) visit(child);
  };
  for (const component of interaction.data?.components ?? []) visit(component);
  return values;
}

function normalizeRequestPanelStatus(value: string): ServiceRequestStatus | null {
  const normalized = value.trim().toUpperCase();
  return REQUEST_PANEL_STATUS_OPTIONS.includes(normalized as ServiceRequestStatus) ? normalized as ServiceRequestStatus : null;
}

function extractDiscordId(value: string): string {
  const match = value.match(/\d{17,20}/);
  return validDiscordId(match?.[0]) ? match[0] : "";
}

function docketPortalUrl(env: Env, docketId: string): string | null {
  const base = env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    return new URL(`/dashboard/docket/${encodeURIComponent(docketId)}`, base).toString();
  } catch {
    return null;
  }
}

function requireRequestPanelStatusAction(ctx: AuthContext, detail: ServiceRequestDetail): void {
  requireRequestPanelAction(ctx, detail);
}

function requireRequestPanelChannelAction(ctx: AuthContext, detail: ServiceRequestDetail): void {
  if (canManageRequestPanelAction(ctx, detail) || hasActionPermission(ctx, "MANAGE_DISCORD_CHANNELS")) return;
  throw new PermissionError("MANAGE_REQUESTS");
}

function requireRequestPanelAccessAction(ctx: AuthContext, detail: ServiceRequestDetail): void {
  if (canManageRequestPanelAction(ctx, detail) || hasActionPermission(ctx, "MANAGE_DISCORD_CHANNELS")) return;
  throw new PermissionError("MANAGE_DISCORD_CHANNELS");
}

function requireRequestPanelDocketAction(ctx: AuthContext, detail: ServiceRequestDetail): void {
  if (canManageRequestPanelAction(ctx, detail) || hasActionPermission(ctx, "CREATE_DOCKET") || hasActionPermission(ctx, "PUBLISH_DOCKET")) return;
  throw new PermissionError("CREATE_DOCKET");
}

function requireRequestPanelAction(ctx: AuthContext, detail: ServiceRequestDetail): void {
  if (canManageRequestPanelAction(ctx, detail)) return;
  throw new PermissionError("MANAGE_REQUESTS");
}

function canManageRequestPanelAction(ctx: AuthContext, detail: ServiceRequestDetail): boolean {
  return hasActionPermission(ctx, "ADMIN")
    || hasActionPermission(ctx, "MANAGE_REQUESTS")
    || isJudicialPanelUser(ctx) && judicialRequestType(detail.requestType);
}

function requireLawyerPanelAction(ctx: AuthContext, _detail: ServiceRequestDetail, space: LawyerResponseSpace): void {
  if (canOverrideLawyerParticipantGate(ctx) || space.attorneyDiscordId === ctx.user.discordId || canManageLawyerResponseAccess(ctx)) return;
  throw new PermissionError("MANAGE_REQUESTS");
}

function isJudicialPanelUser(ctx: AuthContext): boolean {
  return ctx.permissions.includes("JUDGE") || ctx.permissions.includes("JUSTICE") || ctx.permissions.includes("CHIEF_JUSTICE") || ctx.permissions.includes("ADMIN");
}

function judicialRequestType(type: ServiceRequestType): boolean {
  return type !== "LAWYER" && type !== "GENERAL";
}

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseMetadataJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function claimTicketForDetail(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, note: string, commandName: string) {
  if (!detail.discordTicketChannelId) return linkedTicketOnlyResponse();
  const current = await latestServiceRequestTicketClaim(env, detail.id);
  if (current && (current.actorUserId === ctx.user.id || current.staffDiscordId === ctx.user.discordId)) {
    return messageResponse("You already claimed this ticket.", true);
  }
  if (current && !canOverrideTicketClaim(ctx)) {
    return messageResponse(`This ticket is already claimed by ${claimantLabel(current)}.`, true);
  }
  const eventType = current ? "TICKET_CLAIM_OVERRIDDEN" : "TICKET_CLAIMED";
  await addServiceRequestEvent(env, detail.id, ctx.user.id, eventType, current ? "Ticket claim overridden from Discord." : "Ticket claimed from Discord.", {
    channel_id: detail.discordTicketChannelId,
    staffDiscordId: ctx.user.discordId,
    staffDisplayName: ctx.user.displayName,
    previousStaffDiscordId: current?.staffDiscordId ?? null,
    previousStaffDisplayName: current?.staffDisplayName ?? null,
    note: note || null,
    commandName
  });
  await postTicketMessage(env, detail.discordTicketChannelId, withReason(`Ticket claimed by <@${ctx.user.discordId}>.`, note), { users: [ctx.user.discordId] });
  await audit(env, current ? "SERVICE_REQUEST_TICKET_CLAIM_OVERRIDDEN" : "SERVICE_REQUEST_TICKET_CLAIMED", {
    request_id: detail.id,
    channel_id: detail.discordTicketChannelId,
    staff_discord_id: ctx.user.discordId,
    previous_staff_discord_id: current?.staffDiscordId ?? null
  }, ctx.user.id);
  return messageResponse(
    current
      ? `Ticket was claimed by ${claimantLabel(current)}; claim moved to you for **${detail.requestNumber}**.`
      : `Ticket claimed by you for **${detail.requestNumber}**.`,
    true
  );
}

async function transcriptTicketForDetail(env: Env, ctx: AuthContext, detail: ServiceRequestDetail, commandName: string) {
  if (!detail.discordTicketChannelId) return linkedTicketOnlyResponse();
  const target = ticketTargetFromServiceRequest(detail);
  const transcript = await generateTranscript(env, target, ctx, commandName);
  const archive = await postTranscriptArchive(env, target, transcript, ctx);
  return messageResponse(`Transcript stored: **${transcript.id}** (${transcript.messageCount} messages).${archive ? `\nArchive: ${archive}` : "\nArchive channel is not configured."}`, true);
}

async function linkedServiceTicketDetail(env: Env, channelId: string | undefined): Promise<ServiceRequestDetail | null> {
  if (!channelId) return null;
  const detail = await getServiceRequestDetailByTicketChannel(env, channelId);
  if (!detail?.discordTicketChannelId || detail.discordTicketChannelId !== channelId || detail.discordTicketDeletedAt) return null;
  return detail;
}

function linkedTicketOnlyResponse(): DiscordInteractionResponse {
  return messageResponse("This command only works inside linked private DOJ service request ticket channels.", true);
}

function requireTicketManagement(ctx: AuthContext) {
  requireAnyPermission(ctx, TICKET_MANAGEMENT_PERMISSIONS);
}

function canOverrideTicketClaim(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "ADMIN") || hasActionPermission(ctx, "MANAGE_REQUESTS");
}

function requireGuildInteraction(env: Env, interaction: DiscordInteraction): string {
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  if (!interaction.guild_id || interaction.guild_id !== guildId || !interaction.member?.user?.id) {
    throw new PermissionError("GUILD_INTERACTION");
  }
  return guildId;
}

function cleanTextOption(options: Map<string, OptionValue>, key: string, max: number): string {
  return truncate(stringOption(options, key).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(), max);
}

function booleanOption(options: Map<string, OptionValue>, key: string, fallback = false): boolean {
  const value = options.get(key);
  return typeof value === "boolean" ? value : fallback;
}

function integerOption(options: Map<string, OptionValue>, key: string, fallback = 0): number {
  const value = options.get(key);
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function optionalDiscordIdOption(options: Map<string, OptionValue>, key: string): string {
  const value = stringOption(options, key);
  if (validDiscordId(value)) return value;
  return extractDiscordId(value) ?? "";
}

function optionalDiscordIdValidation(options: Map<string, OptionValue>, key: string, label: string): { ok: true; id: string } | { ok: false; message: string } {
  const raw = stringOption(options, key);
  if (!raw) return { ok: true, id: "" };
  const id = optionalDiscordIdOption(options, key);
  if (!id) return { ok: false, message: `${label} must be a valid Discord ID, mention, or selector value.` };
  return { ok: true, id };
}

function channelCreatePayload(input: { name: string; type: number; topic?: string; parentId?: string; permissionOverwrites?: DiscordPermissionOverwriteInput[] }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name,
    type: input.type
  };
  if (input.parentId) payload.parent_id = input.parentId;
  if (input.topic) payload.topic = input.topic;
  if (input.permissionOverwrites?.length) payload.permission_overwrites = input.permissionOverwrites;
  return payload;
}

function sanitizeDiscordChannelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .replace(/-$/g, "");
}

function parseLayoutChannelNames(value: string): { names: string[]; skipped: string[] } {
  const names: string[] = [];
  const skipped: string[] = [];
  for (const raw of value.split(/\r?\n|,/)) {
    const trimmed = raw.trim().replace(/^(?:[-*]|\d+[.)-])\s*/, "");
    if (!trimmed) continue;
    const name = sanitizeDiscordChannelName(trimmed);
    if (!name) skipped.push(truncate(trimmed, 60));
    else if (!names.includes(name)) names.push(name);
  }
  return { names, skipped };
}

function parseIdList(value: string, _kind: "user" | "role" | "channel"): ParsedDiscordIds {
  const rejectedBroad = /@everyone|@here/i.test(value);
  const ids = [...new Set((value.match(/\d{17,20}/g) ?? []).filter(validDiscordId))];
  const invalid = value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/@everyone|@here/i.test(part) && !/\d{17,20}/.test(part));
  return { ids, invalid, rejectedBroad };
}

function idListError(parsed: ParsedDiscordIds, field: string, guildId?: string): string | null {
  if (parsed.rejectedBroad) return `${field} cannot include @everyone or @here.`;
  if (guildId && parsed.ids.includes(guildId)) return `${field} cannot include the @everyone role.`;
  if (parsed.invalid.length) return `${field} contains invalid entries: ${parsed.invalid.slice(0, 4).join(", ")}`;
  return null;
}

function normalizeCategoryVisibility(value: string): DiscordCategoryVisibility | null {
  return ["public", "staff_only", "private_roles", "private_users_and_roles"].includes(value)
    ? value as DiscordCategoryVisibility
    : null;
}

function categoryVisibilityError(visibility: DiscordCategoryVisibility, userIds: string[], roleIds: string[]): string | null {
  if (visibility === "private_roles" && roleIds.length === 0) return "private_roles visibility requires at least one role.";
  if (visibility === "private_users_and_roles" && roleIds.length === 0 && userIds.length === 0) return "private_users_and_roles visibility requires at least one user or role.";
  return null;
}

async function categoryPermissionOverwrites(env: Env, guildId: string, visibility: DiscordCategoryVisibility, userIds: string[], roleIds: string[]): Promise<DiscordPermissionOverwriteInput[]> {
  if (visibility === "public") return [];
  const staffRoles = visibility === "staff_only" ? await configuredStaffRoleIds(env) : [];
  return channelOverwrites(guildId, {
    everyoneDenied: true,
    userAllowIds: userIds,
    roleAllowIds: visibility === "staff_only" ? staffRoles : roleIds
  });
}

function channelOverwrites(guildId: string, input: { everyoneDenied?: boolean; userAllowIds?: string[]; roleAllowIds?: string[]; roleDenyIds?: string[] }): DiscordPermissionOverwriteInput[] {
  const drafts = new Map<string, { id: string; type: 0 | 1; allow: bigint; deny: bigint }>();
  const merge = (id: string, type: 0 | 1, allow: bigint, deny: bigint) => {
    if (!validDiscordId(id)) return;
    if (type === 0 && id === guildId && allow !== 0n) return;
    const key = `${type}:${id}`;
    const current = drafts.get(key) ?? { id, type, allow: 0n, deny: 0n };
    current.allow |= allow;
    current.deny |= deny;
    if ((current.deny & VIEW_CHANNEL) === VIEW_CHANNEL) current.allow &= ~VIEW_CHANNEL;
    drafts.set(key, current);
  };
  if (input.everyoneDenied) merge(guildId, 0, 0n, VIEW_CHANNEL);
  for (const id of input.userAllowIds ?? []) merge(id, 1, CHANNEL_ACCESS_ALLOW, 0n);
  for (const id of input.roleAllowIds ?? []) merge(id, 0, CHANNEL_ACCESS_ALLOW, 0n);
  for (const id of input.roleDenyIds ?? []) merge(id, 0, 0n, VIEW_CHANNEL);
  return [...drafts.values()].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.toString(),
    deny: overwrite.deny.toString()
  }));
}

async function createGuildChannel(env: Env, guildId: string, payload: Record<string, unknown>, reason: string): Promise<DiscordCreatedChannel> {
  const response = await discordApi(env, `/guilds/${guildId}/channels`, {
    method: "POST",
    headers: reason ? { "X-Audit-Log-Reason": discordAuditReason(reason) } : undefined,
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw await discordCommandApiError("create channel", response);
  return await response.json() as DiscordCreatedChannel;
}

async function deleteDiscordChannel(env: Env, channelId: string, reason: string): Promise<void> {
  const response = await discordApi(env, `/channels/${channelId}`, {
    method: "DELETE",
    headers: reason ? { "X-Audit-Log-Reason": discordAuditReason(reason) } : undefined
  });
  if (!response.ok) throw await discordCommandApiError("delete channel", response);
}

async function fetchGuildChannels(env: Env, guildId: string): Promise<DiscordChannelDetails[]> {
  const response = await discordApi(env, `/guilds/${guildId}/channels`);
  if (!response.ok) throw await discordCommandApiError("list guild channels", response);
  return await response.json() as DiscordChannelDetails[];
}

async function postDiscordChannelMessage(env: Env, channelId: string, content: string, mentions: { users?: string[]; roles?: string[] }): Promise<string | null> {
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: truncate(content, 2000), allowed_mentions: safeAllowedMentions(mentions) })
  });
  if (!response.ok) throw await discordCommandApiError("post channel message", response);
  const body = await response.json().catch(() => ({})) as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

async function configuredStaffRoleIds(env: Env): Promise<string[]> {
  if (!env.DB) return [];
  const placeholders = DISCORD_STAFF_ROLE_PERMISSION_KEYS.map(() => "?").join(", ");
  try {
    const result = await env.DB.prepare(
      `SELECT discord_role_id as id FROM role_mappings
       WHERE permission_key IN (${placeholders}) AND is_reference_only = 0 AND discord_role_id != ''`
    ).bind(...DISCORD_STAFF_ROLE_PERMISSION_KEYS).all<{ id: string }>();
    return guildExistingRoleIds(env, uniqueValidDiscordIds(result.results.map((row) => row.id)));
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_staff_role_lookup_failed", cause: safeError(cause) }));
    return [];
  }
}

async function guildExistingRoleIds(env: Env, roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  try {
    const roles = await fetchGuildRoles(env);
    const existing = new Set(roles.map((role) => role.id));
    const valid = roleIds.filter((roleId) => existing.has(roleId));
    const stale = roleIds.filter((roleId) => !existing.has(roleId));
    if (stale.length) console.warn(JSON.stringify({ event: "discord_staff_role_ids_stale", staleRoleIds: stale }));
    return valid;
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_staff_role_validation_failed", cause: safeError(cause) }));
    return [];
  }
}

async function protectedDiscordCategoryIds(env: Env): Promise<Set<string>> {
  const ids = new Set<string>((env.PROTECTED_DISCORD_CATEGORY_IDS ?? "").split(",").map((value) => value.trim()).filter(validDiscordId));
  if (env.DB) {
    const placeholders = PROTECTED_CATEGORY_MAPPING_KEYS.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `SELECT discord_channel_id as id FROM discord_channel_mappings
       WHERE mapping_key IN (${placeholders}) AND discord_channel_id != ''`
    ).bind(...PROTECTED_CATEGORY_MAPPING_KEYS).all<{ id: string }>();
    for (const row of result.results) if (validDiscordId(row.id)) ids.add(row.id);
  }
  return ids;
}

async function configuredMuteRoleId(env: Env): Promise<string | null> {
  if (validDiscordId(env.MUTE_ROLE_ID)) return env.MUTE_ROLE_ID;
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    "SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = 'MUTE_ROLE_ID' AND discord_channel_id != '' LIMIT 1"
  ).first<{ id: string }>();
  return validDiscordId(row?.id) ? row.id : null;
}

async function recordModerationCase(
  env: Env,
  ctx: AuthContext,
  guildId: string,
  targetUserId: string,
  actionType: string,
  reason: string,
  durationSeconds: number | null,
  expiresAt: string | null,
  metadata: Record<string, unknown>
): Promise<string> {
  if (!env.DB) throw new Error("D1 is required for moderation cases.");
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO discord_moderation_cases
      (id, guild_id, target_user_id, moderator_user_id, action_type, reason, duration_seconds, expires_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, guildId, targetUserId, ctx.user.id, actionType, reason, durationSeconds, expiresAt, JSON.stringify(metadata)).run();
  return id;
}

async function recordDiscordAdminAction(
  env: Env,
  ctx: AuthContext,
  actionType: string,
  targetType: string,
  targetId: string | null,
  summary: string,
  metadata: Record<string, unknown>,
  logKind: DiscordLogKind
): Promise<void> {
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO discord_admin_actions
          (id, guild_id, actor_user_id, action_type, target_type, target_id, summary, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), env.DISCORD_GUILD_ID ?? "", ctx.user.id, actionType, targetType, targetId, summary, JSON.stringify(metadata)).run();
    } catch (cause) {
      console.warn(JSON.stringify({ event: "discord_admin_action_record_failed", actionType, targetType, targetId, cause: safeError(cause) }));
    }
  }
  try {
    await audit(env, `DISCORD_${actionType}`, auditSafeMetadata({ target_type: targetType, target_id: targetId, summary, ...metadata }), ctx.user.id);
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_admin_action_audit_failed", actionType, targetType, targetId, cause: safeError(cause) }));
  }
  try {
    await postDiscordLog(env, logKind, `**${actionType}** by ${ctx.user.displayName} (${ctx.user.discordId})\n${summary}`);
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_admin_action_log_post_failed", actionType, targetType, targetId, cause: safeError(cause) }));
  }
}

async function postDiscordLog(env: Env, kind: DiscordLogKind, content: string): Promise<void> {
  const channelId = await configuredLogChannelId(env, kind);
  if (!channelId) {
    console.warn(JSON.stringify({ event: "discord_log_channel_missing", kind, content: truncate(content, 500) }));
    return;
  }
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: truncate(content, 1900), allowed_mentions: { parse: [] } })
  });
  if (!response.ok) console.warn(JSON.stringify({ event: "discord_log_post_failed", kind, channelId, status: response.status, body: await responseTextSnippet(response) }));
}

async function configuredLogChannelId(env: Env, kind: DiscordLogKind): Promise<string | null> {
  type LogChannelConfigKey = "MOD_LOG_CHANNEL_ID" | "MESSAGE_LOG_CHANNEL_ID" | "MEMBER_LOG_CHANNEL_ID" | "ADMIN_LOG_CHANNEL_ID" | "DISCORD_ADMIN_LOG_CHANNEL_ID";
  const keys: Array<LogChannelConfigKey | "ADMIN_LOG"> = kind === "MOD"
    ? ["MOD_LOG_CHANNEL_ID", "DISCORD_ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG"]
    : kind === "MESSAGE"
      ? ["MESSAGE_LOG_CHANNEL_ID", "DISCORD_ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG"]
      : kind === "MEMBER"
        ? ["MEMBER_LOG_CHANNEL_ID", "DISCORD_ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG"]
        : ["ADMIN_LOG_CHANNEL_ID", "DISCORD_ADMIN_LOG_CHANNEL_ID", "ADMIN_LOG"];
  for (const key of keys) {
    const envValue = key !== "ADMIN_LOG" ? env[key] : undefined;
    if (validDiscordId(envValue)) return envValue;
    if (env.DB) {
      const mapped = await mappedChannel(env, key);
      if (validDiscordId(mapped)) return mapped;
    }
  }
  return null;
}

function auditSafeMetadata(metadata: Record<string, unknown>): Record<string, string | number | boolean | null | undefined> {
  const safe: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) safe[key] = value;
    else safe[key] = truncate(JSON.stringify(value), 500);
  }
  return safe;
}

async function updateMemberTimeout(env: Env, guildId: string, userId: string, expiresAt: string | null, reason: string): Promise<void> {
  const response = await discordApi(env, `/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    headers: { "X-Audit-Log-Reason": discordAuditReason(reason) },
    body: JSON.stringify({ communication_disabled_until: expiresAt })
  });
  if (!response.ok) throw await discordCommandApiError("update timeout", response);
}

async function dmUser(env: Env, userId: string, content: string): Promise<void> {
  try {
    const channelResponse = await discordApi(env, "/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: userId }) });
    if (!channelResponse.ok) return;
    const channel = await channelResponse.json() as { id?: string };
    if (!channel.id) return;
    await postDiscordChannelMessage(env, channel.id, content, {});
  } catch (cause) {
    console.warn(JSON.stringify({ event: "discord_dm_failed", userId, cause: safeError(cause) }));
  }
}

async function ensureModerationHierarchy(env: Env, ctx: AuthContext, interaction: DiscordInteraction, targetId: string, action: string, requireMember: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (targetId === ctx.user.discordId) return { ok: false, message: `You cannot ${action} yourself.` };
  const targetMember = await fetchGuildMember(env, targetId).catch(() => null);
  if (!targetMember && requireMember) return { ok: false, message: "That user is not currently a guild member." };
  if (!targetMember) return { ok: true };
  const roles = await fetchGuildRoles(env);
  const actorHighest = highestRolePosition(interaction.member?.roles ?? [], roles);
  const targetHighest = highestRolePosition(targetMember.roles ?? [], roles);
  const botUser = await fetchBotUser(env);
  const botMember = await fetchGuildMember(env, botUser.id).catch(() => null);
  const botHighest = highestRolePosition(botMember?.roles ?? [], roles);
  if (targetHighest >= botHighest) return { ok: false, message: `The bot cannot ${action} a member with an equal or higher Discord role.` };
  if (!hasActionPermission(ctx, "ADMIN") && targetHighest >= actorHighest) return { ok: false, message: `You cannot ${action} a member with an equal or higher Discord role.` };
  return { ok: true };
}

async function fetchGuildRoles(env: Env): Promise<DiscordGuildRole[]> {
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const response = await discordApi(env, `/guilds/${guildId}/roles`);
  if (!response.ok) throw await discordCommandApiError("fetch guild roles", response);
  return await response.json() as DiscordGuildRole[];
}

function highestRolePosition(roleIds: string[], roles: DiscordGuildRole[]): number {
  const byId = new Map(roles.map((role) => [role.id, role.position]));
  return roleIds.reduce((highest, roleId) => Math.max(highest, byId.get(roleId) ?? 0), 0);
}

function parseDurationSeconds(value: string): { ok: true; seconds: number } | { ok: false; message: string } {
  const match = value.trim().toLowerCase().match(/^(\d{1,3})(m|h|d)$/);
  if (!match) return { ok: false, message: "Duration must look like 10m, 1h, 24h, 3d, or 7d." };
  const amount = Number(match[1]);
  const unit = match[2];
  const seconds = unit === "m" ? amount * 60 : unit === "h" ? amount * 60 * 60 : amount * 24 * 60 * 60;
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, message: "Duration must be greater than zero." };
  if (seconds > DISCORD_TIMEOUT_MAX_SECONDS) return { ok: false, message: "Discord timeouts cannot exceed 28 days." };
  return { ok: true, seconds };
}

function announcementMention(ctx: AuthContext, mode: string, roleId: string): AnnouncementMentionResult {
  if (!["none", "everyone", "here", "role"].includes(mode)) return { ok: false, message: "Mention must be none, everyone, here, or role." };
  if (mode === "none") return { ok: true, content: "", allowedMentions: { parse: [] } };
  if ((mode === "everyone" || mode === "here") && !hasActionPermission(ctx, "ADMIN") && !hasActionPermission(ctx, "MANAGE_MASS_MENTIONS")) {
    return { ok: false, message: "Only admins or mass-mention managers can use @everyone or @here." };
  }
  if (mode === "everyone") return { ok: true, content: "@everyone", allowedMentions: { parse: ["everyone"] } };
  if (mode === "here") return { ok: true, content: "@here", allowedMentions: { parse: ["everyone"] } };
  if (!roleId) return { ok: false, message: "Role mention mode requires the role option." };
  return { ok: true, content: `<@&${roleId}>`, allowedMentions: { parse: [], roles: [roleId] } };
}

function discordAuditReason(reason: string): string {
  return encodeURIComponent(truncate(reason, 512));
}

function claimantLabel(claim: { staffDiscordId: string | null; staffDisplayName: string }): string {
  return claim.staffDisplayName || (claim.staffDiscordId ? `Discord user ${claim.staffDiscordId}` : "another staff member");
}

function snowflakeOption(options: Map<string, OptionValue>, key: string): string {
  const value = stringOption(options, key);
  return validDiscordId(value) ? value : "";
}

async function ticketAccessAllow(env: Env, channelId: string): Promise<bigint> {
  const channel = await fetchDiscordChannel(env, channelId);
  let allow = VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY;
  if (channelAllowsBit(channel, EMBED_LINKS)) allow |= EMBED_LINKS;
  if (channelAllowsBit(channel, ATTACH_FILES)) allow |= ATTACH_FILES;
  return allow;
}

async function fetchDiscordChannel(env: Env, channelId: string): Promise<DiscordChannelDetails> {
  const response = await discordApi(env, `/channels/${channelId}`);
  if (!response.ok) throw await discordCommandApiError("fetch channel", response);
  return await response.json() as DiscordChannelDetails;
}

function channelAllowsBit(channel: DiscordChannelDetails, bit: bigint): boolean {
  return (channel.permission_overwrites ?? []).some((overwrite) => (permissionBits(overwrite.allow) & bit) === bit);
}

async function putTicketPermissionOverwrite(env: Env, channelId: string, overwriteId: string, type: 0 | 1, allow: bigint): Promise<void> {
  const response = await discordApi(env, `/channels/${channelId}/permissions/${overwriteId}`, {
    method: "PUT",
    body: JSON.stringify({ type, allow: allow.toString(), deny: "0" })
  });
  if (!response.ok) throw new Error(`Discord permission overwrite failed with ${response.status}: ${await responseTextSnippet(response)}`);
}

async function postTicketMessage(env: Env, channelId: string, content: string, mentions: { users?: string[]; roles?: string[] }, components: DiscordComponent[] = []): Promise<string | null> {
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: truncate(content, 1900),
      allowed_mentions: safeAllowedMentions(mentions),
      ...(components.length ? { components } : {})
    })
  });
  if (!response.ok) throw new Error(`Discord ticket message post failed with ${response.status}: ${await responseTextSnippet(response)}`);
  const message = await response.json().catch(() => ({})) as { id?: unknown };
  return typeof message.id === "string" ? message.id : null;
}

function safeAllowedMentions(mentions: { users?: string[]; roles?: string[] }): { parse: string[]; users?: string[]; roles?: string[] } {
  const users = uniqueValidDiscordIds(mentions.users);
  const roles = uniqueValidDiscordIds(mentions.roles);
  return {
    parse: [],
    ...(users.length ? { users } : {}),
    ...(roles.length ? { roles } : {})
  };
}

function uniqueValidDiscordIds(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(validDiscordId))];
}

function withReason(message: string, reason: string): string {
  const cleaned = reason.trim();
  return cleaned ? `${message}\nReason: ${truncate(cleaned, 500)}` : message;
}

function sanitizeTicketChannelName(value: string, detail: ServiceRequestDetail): string {
  const cleaned = value
    .toLowerCase()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 90)
    .replaceAll(/-$/g, "");
  if (cleaned) return cleaned;
  return `${detail.requestNumber.toLowerCase()}-ticket`
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 90);
}

function ticketTargetFromServiceRequest(detail: ServiceRequestDetail): TicketTarget {
  return {
    sourceType: "request",
    sourceId: detail.id,
    sourceNumber: detail.requestNumber,
    channelId: detail.discordTicketChannelId!,
    channelName: detail.requestNumber.toLowerCase(),
    requestType: detail.requestType
  };
}

function ticketTargetFromLawyerResponse(detail: ServiceRequestDetail, space: LawyerResponseSpace): TicketTarget {
  const channelId = lawyerResponseSpaceChannelId(space);
  return {
    sourceType: "lawyer_response",
    sourceId: detail.id,
    sourceNumber: detail.requestNumber,
    channelId,
    channelName: lawyerResponseSpaceName(detail),
    requestType: "LAWYER",
    lawyerResponseSpace: space
  };
}

function permissionBits(value: string | undefined): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

async function responseTextSnippet(response: Response): Promise<string> {
  return (await response.text().catch(() => "")).slice(0, 220);
}

async function discordCommandApiError(action: string, response: Response): Promise<DiscordCommandApiError> {
  return new DiscordCommandApiError(action, response.status, await responseTextSnippet(response));
}

function commandErrorResponse(cause: unknown): DiscordInteractionResponse | null {
  if (cause instanceof DiscordCommandApiError) {
    const details = cause.details ? `\nDiscord response: ${truncate(cause.details, 900)}` : "";
    return messageResponse(`Discord ${cause.action} failed with status ${cause.status}.${details}`, true);
  }
  if (cause instanceof MissingEnvironmentError || (cause instanceof Error && cause.constructor.name === "MissingEnvironmentError")) {
    const key = cause instanceof MissingEnvironmentError ? cause.key : "required Discord setting";
    return messageResponse(`Discord command configuration is missing: ${key}.`, true);
  }
  return null;
}

class DiscordCommandApiError extends Error {
  constructor(public readonly action: string, public readonly status: number, public readonly details: string) {
    super(`Discord ${action} failed with status ${status}: ${details}`);
    this.name = "DiscordCommandApiError";
  }
}

class LawyerResponseNoFallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LawyerResponseNoFallbackError";
  }
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
  const directActions = new Set<ActionPermission>();
  for (const role of roles) {
    const row = await env.DB.prepare("SELECT permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ? AND is_reference_only = 0").bind(role.discordRoleId).first<{ permissionKey: string | null }>();
    if (isLogicalPermission(row?.permissionKey)) permissions.add(row.permissionKey);
    if (isActionPermission(row?.permissionKey)) directActions.add(row.permissionKey);
  }
  const bootstrap = (env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? "").split(",").map((value) => value.trim()).includes(user.discordId);
  if (bootstrap) {
    permissions.add("ADMIN");
    permissions.add("CHIEF_JUSTICE");
    directActions.add("ADMIN");
  }
  const logical = [...permissions].sort() as LogicalPermission[];
  return { authenticated: true, sessionId: `discord:${interaction.id}`, user, roles, permissions: logical, actionPermissions: mergeActionPermissions(logical, [...directActions]), isBootstrapAdmin: bootstrap };
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
  return { type: 4, data: { content: truncate(content, 1900), flags: ephemeral ? EPHEMERAL : undefined, components, allowed_mentions: { parse: [] } } };
}

function discordChannelUrl(env: Env, channelId: string | number): string {
  const guildId = env.DISCORD_GUILD_ID || "REPLACE_WITH_MIAMI_DISCORD_GUILD_ID";
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function closeTicketComponents(actorDiscordId: string, requestId: string, reasonToken: string, commandName = "close"): DiscordComponent[] {
  const requestToken = requestId.replaceAll(/[^\w-]/g, "").slice(0, 48) || "unknown";
  const commandToken = commandName.replaceAll(/[^\w-]/g, "").slice(0, 8) || "close";
  const compactReasonToken = reasonToken.replaceAll(/[^\w-]/g, "").slice(0, 14) || "x";
  return [{
    type: 1,
    components: [
      { type: 2, style: 4, label: "Confirm close", custom_id: `tc:c:${actorDiscordId}:${requestToken}:${compactReasonToken}:${commandToken}` },
      { type: 2, style: 2, label: "Cancel", custom_id: `tc:x:${actorDiscordId}:${requestToken}:x:${commandToken}` }
    ]
  }];
}

function parseCloseTicketCustomId(customId: string): { action: "confirm" | "cancel"; actorDiscordId: string; requestId: string; reasonToken: string; commandName: string | null } | null {
  const parts = customId.split(":");
  if (parts.length === 6 && parts[0] === "tc") {
    const action = parts[1] === "c" ? "confirm" : parts[1] === "x" ? "cancel" : null;
    if (!action || !/^\d{17,20}$/.test(parts[2]) || !parts[3]) return null;
    return { action, actorDiscordId: parts[2], requestId: parts[3], reasonToken: parts[4] || "", commandName: parts[5] || null };
  }
  if ((parts.length !== 5 && parts.length !== 6) || parts[0] !== "ticket_close") return null;
  const action = parts[1] === "confirm" || parts[1] === "cancel" ? parts[1] : null;
  if (!action || !/^\d{17,20}$/.test(parts[2]) || !parts[3]) return null;
  return { action, actorDiscordId: parts[2], requestId: parts[3], reasonToken: parts[4] || "", commandName: parts[5] || null };
}

function parseTicketActionCustomId(customId: string): { action: "claim" | "close" | "transcript"; requestId: string } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "ticket_action") return null;
  const action = parts[1] === "claim" || parts[1] === "close" || parts[1] === "transcript" ? parts[1] : null;
  if (!action || !parts[2]) return null;
  return { action, requestId: parts[2] };
}

function encodeCloseReason(reason: string): string {
  const compact = reason.replaceAll(/[^\w .,-]/g, "").trim().slice(0, 10) || "Discord";
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
      return { criminalRequestType: "Criminal Case Status / Scheduling Question", arrestReportNumber: "Discord request", defendantName: name, allegedCharges: summary, briefSummary: summary, schedulingNotes: urgency };
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
  const lawyerSpace = await linkedLawyerResponseSpace(env, currentChannelId);
  if (lawyerSpace) return ticketTargetFromLawyerResponse(lawyerSpace.detail, lawyerSpace.space);
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
  ).bind(id, target.sourceType, target.sourceId, target.sourceNumber, target.channelId, target.channelName, messages.length, JSON.stringify(messages), ctx.user.id, ctx.user.displayName, JSON.stringify({
    generated_by: "discord_slash_command",
    ...(target.lawyerResponseSpace ? lawyerResponseSpaceMetadata(target.lawyerResponseSpace) : {})
  })).run();
  if (target.sourceType === "request") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "DISCORD_TRANSCRIPT_STORED", "Discord ticket transcript stored.", { transcript_id: id, message_count: messages.length });
  } else if (target.sourceType === "lawyer_response") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "LAWYER_RESPONSE_TRANSCRIPT_STORED", "Discord attorney response space transcript stored.", {
      transcript_id: id,
      message_count: messages.length,
      ...(target.lawyerResponseSpace ? lawyerResponseSpaceMetadata(target.lawyerResponseSpace) : {})
    });
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
    body: JSON.stringify({
      content: `Transcript stored for ${target.sourceNumber ?? target.sourceId}: ${transcript.id} (${transcript.messageCount} messages).\nPortal: ${transcriptPortalUrl(env, transcript.id)}`,
      allowed_mentions: { parse: [] }
    })
  });
  if (!response.ok) throw new Error(`Discord transcript archive post failed with ${response.status}: ${await responseTextSnippet(response)}`);
  const message = await response.json() as { id: string };
  await env.DB!.prepare("UPDATE discord_ticket_transcripts SET archive_channel_id = ?, archive_message_id = ? WHERE id = ?").bind(channelId, message.id, transcript.id).run();
  if (ctx && message.id) {
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
  } else if (target.sourceType === "lawyer_response") {
    await env.DB!.prepare("UPDATE service_requests SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, LAWYER_RESPONSE_SPACE_CLOSED_EVENT, "Private attorney response space closed.", {
      reason,
      ...(target.lawyerResponseSpace ? lawyerResponseSpaceMetadata(target.lawyerResponseSpace) : { responseSpaceId: target.channelId })
    });
  } else {
    await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_closed_at = CURRENT_TIMESTAMP, followup_channel_closed_by_user_id = ?, followup_channel_close_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, target.sourceId).run();
  }
  await audit(env, "DISCORD_TICKET_CLOSED", { source_type: target.sourceType, source_id: target.sourceId, reason }, ctx.user.id);
}

async function markTicketDeleted(env: Env, target: TicketTarget, ctx: AuthContext, reason: string, transcriptId: string) {
  if (target.sourceType === "request") {
    await env.DB!.prepare("UPDATE service_requests SET discord_ticket_deleted_at = CURRENT_TIMESTAMP, discord_ticket_deleted_by_user_id = ?, discord_ticket_delete_reason = ?, discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ctx.user.id, reason, transcriptId, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, "PRIVATE_CHANNEL_DELETED", "Private Discord ticket channel deleted after transcript capture.", { reason, channel_id: target.channelId, transcript_id: transcriptId });
  } else if (target.sourceType === "lawyer_response") {
    await env.DB!.prepare("UPDATE service_requests SET status = 'CLOSED', discord_ticket_transcript_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(transcriptId, target.sourceId).run();
    await addServiceRequestEvent(env, target.sourceId ?? "", ctx.user.id, LAWYER_RESPONSE_SPACE_CLOSED_EVENT, "Private attorney response space deleted after transcript capture.", {
      reason,
      transcript_id: transcriptId,
      ...(target.lawyerResponseSpace ? lawyerResponseSpaceMetadata(target.lawyerResponseSpace) : { responseSpaceId: target.channelId })
    });
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

function validDiscordId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

interface DiscordChannelDetails {
  id: string;
  name?: string;
  type?: number;
  parent_id?: string | null;
  thread_metadata?: {
    archived?: boolean;
    locked?: boolean;
  };
  permission_overwrites?: DiscordPermissionOverwrite[];
}

interface DiscordPermissionOverwrite {
  id: string;
  type: 0 | 1;
  allow?: string;
  deny?: string;
}

interface ParsedDiscordIds {
  ids: string[];
  invalid: string[];
  rejectedBroad: boolean;
}

type DiscordCategoryVisibility = "public" | "staff_only" | "private_roles" | "private_users_and_roles";

interface DiscordPermissionOverwriteInput {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

interface DiscordCreatedChannel {
  id: string;
  name?: string;
  type?: number;
  parent_id?: string | null;
}

interface DiscordGuildRole {
  id: string;
  position: number;
}

type DiscordLogKind = "ADMIN" | "MOD" | "MESSAGE" | "MEMBER";

type AnnouncementMentionResult =
  | {
      ok: true;
      content: string;
      allowedMentions: { parse: string[]; roles?: string[] };
    }
  | {
      ok: false;
      message: string;
    };

interface TicketTarget {
  sourceType: "request" | "bar_exam_followup" | "lawyer_response";
  sourceId: string | null;
  sourceNumber: string | null;
  channelId: string;
  channelName: string | null;
  requestType: ServiceRequestType | "BAR_EXAM_FOLLOWUP";
  lawyerResponseSpace?: LawyerResponseSpace;
}

interface LawyerPayloadFieldSpec {
  key: string;
  label: string;
  inline?: boolean;
}

interface LawyerDetailRawField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface LawyerResponseDetailsEmbed {
  title: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer: { text: string };
  timestamp: string;
}

interface PanelCustomId {
  scope: "req" | "law";
  action: string;
  requestId: string;
}

interface PanelModalCustomId extends PanelCustomId {}

type LawyerResponseEventType = (typeof LAWYER_RESPONSE_EVENT_TYPES)[number];

interface LawyerResponseSpaceOptions {
  eventType: LawyerResponseEventType;
  source: string;
  duplicateMode: "block-other-attorney" | "return-existing";
  originalChannelId?: string | null;
  originalMessageId?: string | null;
  reason?: string;
}

interface LawyerResponseSpace {
  requestId: string;
  requestNumber: string;
  attorneyDiscordId: string;
  requesterDiscordId: string;
  responseSpaceType: "thread" | "channel";
  responseThreadId: string | null;
  responseChannelId: string | null;
  originalMessageId: string | null;
  originalChannelId: string | null;
  eventType: string;
  actorUserId: string | null;
  createdAt: string;
}

interface LinkedLawyerResponseSpace {
  detail: ServiceRequestDetail;
  space: LawyerResponseSpace;
  channel: DiscordChannelDetails | null;
}

type LawyerResponseEnsureResult =
  | {
      ok: true;
      detail: ServiceRequestDetail;
      space: LawyerResponseSpace;
      created: boolean;
      message: string;
    }
  | {
      ok: false;
      response: DiscordInteractionResponse;
    };

interface CreatedLawyerResponseSpace {
  kind: "thread" | "channel";
  id: string;
  name: string;
  fallbackReason?: string | null;
}
