import type { ServiceRequestDetail } from "@shotta-doj/shared";
import { discordApi, fetchBotUser, requireEnv } from "./discord";
import { SERVICE_DEFINITIONS } from "./serviceDefinitions";
import type { Env } from "./types";

const VIEW_CHANNEL = 1024n;
const SEND_MESSAGES = 2048n;
const MANAGE_MESSAGES = 8192n;
const EMBED_LINKS = 16384n;
const READ_HISTORY = 65536n;
const MANAGE_CHANNELS = 16n;
const MANAGE_ROLES = 268435456n;
const DOJ_NEON_PINK = 0xff2fae;
const LAWYER_STICKY_MAPPING_KEY = "REQUEST_LAWYER";
const LAWYER_STICKY_COOLDOWN_MS = 8_000;
const LAWYER_STICKY_MESSAGE = "Please submit lawyer requests through the DOJ portal:\nhttps://miami-stories-doj.pages.dev/services/lawyer\n\nFree-typed requests in this channel may not be answered.";
const REQUIRED_PERMISSION_BITS = {
  viewChannels: VIEW_CHANNEL,
  manageChannels: MANAGE_CHANNELS,
  managePermissions: MANAGE_ROLES,
  manageMessages: MANAGE_MESSAGES,
  sendMessages: SEND_MESSAGES,
  embedLinks: EMBED_LINKS,
  readMessageHistory: READ_HISTORY
} as const;

interface TicketConfig {
  categoryId: string;
  roleIds: string[];
  requesterDiscordId: string;
  existingChannelId?: string | null;
}

export interface ServiceRequestMentions {
  userIds: string[];
  roleIds: string[];
}

interface DiscordStickyState {
  mappingKey: string;
  channelId: string;
  messageId: string | null;
  lastPostedAt: string | null;
  lastCheckedAt: string | null;
  lastTriggerMessageId: string | null;
}

interface DiscordMessage {
  id: string;
  type?: number;
  content?: string;
  webhook_id?: string | null;
  author?: {
    id: string;
    username?: string;
    bot?: boolean;
  };
}

export interface LawyerStickyResult {
  ok: boolean;
  action: "posted" | "skipped";
  channelId?: string;
  messageId?: string;
  deletedPrevious?: boolean;
  deleteWarning?: string;
  reason?: string;
}

export async function createServiceRequestTicketChannel(env: Env, request: ServiceRequestDetail, config: TicketConfig) {
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const actionContext = {
    action: "create_private_channel",
    endpoint: `/guilds/${guildId}/channels`,
    guildId,
    categoryId: config.categoryId,
    requestId: request.id,
    requestNumber: request.requestNumber,
    channelName: channelName(request),
    likelyFixContext: "ticket_category"
  };
  if (!config.categoryId) {
    throw discordConfigurationError({
      ...actionContext,
      discordMessage: "No private Discord category is configured for this request type.",
      likelyFix: "Configure a private ticket parent category mapping for this service type. Do not use a public request/panel text channel as parent_id."
    });
  }
  const botUser = await fetchBotUser(env);
  const name = actionContext.channelName;
  const channels = await listGuildChannels(env, guildId, actionContext);
  if (config.existingChannelId) {
    const existingById = channels.find((channel) => channel.id === config.existingChannelId && channel.type === 0);
    if (existingById) return { id: existingById.id, name: existingById.name };
  }
  const category = channels.find((channel) => channel.id === config.categoryId);
  if (!category) {
    throw discordConfigurationError({
      ...actionContext,
      discordMessage: "Configured private ticket parent category was not found or is not visible to the bot.",
      likelyFix: "Verify the configured category ID exists in the guild and the bot can view it."
    });
  }
  if (category.type !== 4) {
    throw discordConfigurationError({
      ...actionContext,
      discordMessage: `Configured private ticket parent is a ${channelTypeLabel(category.type)}, not a category.`,
      likelyFix: "Use the Discord category ID for private ticket parent_id. Public request/panel text channel IDs cannot be used as parent_id."
    });
  }
  const existing = findExistingTicketChannel(channels, config.categoryId, name);
  if (existing) return existing;
  const allow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY).toString();
  const botAllow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY | MANAGE_CHANNELS | MANAGE_ROLES).toString();
  const roles = await fetchGuildRoles(env, guildId, actionContext);
  const botMember = await fetchGuildMember(env, guildId, botUser.id, actionContext);
  const requesterMember = await fetchGuildMember(env, guildId, config.requesterDiscordId, actionContext).catch(() => null);
  const overwriteBuild = buildPermissionOverwrites({
    guildId,
    botUserId: botUser.id,
    requesterDiscordId: config.requesterDiscordId,
    roleIds: config.roleIds,
    roles,
    botMember,
    requesterMember,
    allow,
    botAllow
  });
  const endpoint = `/guilds/${guildId}/channels`;
  const payloadBase = {
    name,
    type: 0,
    parent_id: config.categoryId,
    topic: `Private DOJ service request ${request.requestNumber}. Do not share outside authorized DOJ workflow.`
  };
  const response = await discordApi(env, endpoint, {
    method: "POST",
    body: JSON.stringify({
      ...payloadBase,
      permission_overwrites: overwriteBuild.overwrites
    })
  });
  if (response.ok) return (await response.json()) as { id: string; name: string };
  const primaryError = await DiscordApiError.fromResponse(response, {
    action: "create_private_channel",
    endpoint,
    guildId,
    categoryId: config.categoryId,
    requestId: request.id,
    requestNumber: request.requestNumber,
    channelName: name,
    likelyFixContext: "ticket_category",
    overwriteDiagnostics: overwriteBuild.diagnostics,
    overwriteWarnings: overwriteBuild.warnings,
    createChannelPayloadSummary: payloadSummary(payloadBase, overwriteBuild.overwrites)
  });
  const canFallback = primaryError.details.status === 403 && primaryError.details.discordCode === "50013";
  if (!canFallback) throw primaryError;
  const fallbackOverwrites = overwriteBuild.minimalOverwrites;
  const fallbackResponse = await discordApi(env, endpoint, {
    method: "POST",
    body: JSON.stringify({
      ...payloadBase,
      permission_overwrites: fallbackOverwrites
    })
  });
  if (fallbackResponse.ok) {
    const created = (await fallbackResponse.json()) as { id: string; name: string };
    return {
      ...created,
      warning: "Created with minimal bot-only overwrites; staff/requester overwrites were skipped due to Discord 403. Configure staff overwrites manually or fix role IDs.",
      overwriteDiagnostics: overwriteBuild.diagnostics,
      overwriteWarnings: overwriteBuild.warnings,
      createChannelPayloadSummary: payloadSummary(payloadBase, fallbackOverwrites),
      primaryError: primaryError.details
    };
  }
  throw await DiscordApiError.fromResponse(fallbackResponse, {
    action: "create_private_channel_fallback",
    endpoint,
    guildId,
    categoryId: config.categoryId,
    requestId: request.id,
    requestNumber: request.requestNumber,
    channelName: name,
    likelyFixContext: "ticket_category",
    overwriteDiagnostics: overwriteBuild.diagnostics,
    overwriteWarnings: overwriteBuild.warnings,
    createChannelPayloadSummary: payloadSummary(payloadBase, fallbackOverwrites),
    primaryError: primaryError.details
  });
}

export async function postServiceRequestEmbedToPrivateTicket(
  env: Env,
  request: ServiceRequestDetail,
  channelId: string,
  mentions: ServiceRequestMentions
) {
  const shouldPing = !request.discordTicketMessageId;
  const content = serviceRequestMentionContent(request, mentions, shouldPing);
  const endpoint = request.discordTicketMessageId ? `/channels/${channelId}/messages/${request.discordTicketMessageId}` : `/channels/${channelId}/messages`;
  const response = await discordApi(env, endpoint, {
    method: request.discordTicketMessageId ? "PATCH" : "POST",
    body: JSON.stringify({
      content,
      allowed_mentions: shouldPing ? allowedMentions(mentions) : allowedMentions({ userIds: [], roleIds: [] }),
      embeds: [privateServiceRequestEmbed(env, request)]
    })
  });
  if (!response.ok) throw await DiscordApiError.fromResponse(response, {
    action: request.discordTicketMessageId ? "update_private_embed" : "post_private_embed",
    endpoint,
    channelId,
    requestId: request.id,
    requestNumber: request.requestNumber,
    messageId: request.discordTicketMessageId ?? undefined,
    likelyFixContext: "ticket_channel"
  });
  return (await response.json()) as { id: string };
}

export async function maintainLawyerSticky(env: Env): Promise<LawyerStickyResult> {
  if (!env.DB) return { ok: false, action: "skipped", reason: "D1 is not configured." };
  const channelId = await lawyerStickyChannelId(env);
  if (!channelId) return { ok: false, action: "skipped", reason: "REQUEST_LAWYER channel mapping is not configured." };

  const state = await readLawyerStickyState(env);
  const messages = await recentChannelMessages(env, channelId);
  await recordLawyerStickyCheck(env, channelId);
  const botUserId = await fetchBotUser(env).then((user) => user.id).catch(() => null);
  const latest = messages[0];
  if (!latest) return { ok: true, action: "skipped", channelId, reason: "No recent messages found." };
  if (!normalHumanMessage(latest, botUserId)) {
    return { ok: true, action: "skipped", channelId, reason: "Latest message is not a normal user message." };
  }
  if (cooldownActive(state, Date.now())) {
    return { ok: true, action: "skipped", channelId, reason: "Sticky cooldown is active." };
  }
  return postLawyerSticky(env, { channelId, triggerMessageId: latest.id });
}

export async function postLawyerSticky(
  env: Env,
  input: { channelId?: string; triggerMessageId?: string; force?: boolean } = {}
): Promise<LawyerStickyResult> {
  if (!env.DB) return { ok: false, action: "skipped", reason: "D1 is not configured." };
  const channelId = input.channelId || await lawyerStickyChannelId(env);
  if (!channelId) return { ok: false, action: "skipped", reason: "REQUEST_LAWYER channel mapping is not configured." };
  const state = await readLawyerStickyState(env);
  if (!input.force && cooldownActive(state, Date.now())) {
    return { ok: true, action: "skipped", channelId, reason: "Sticky cooldown is active." };
  }

  let deletedPrevious = false;
  let deleteWarning: string | undefined;
  if (state?.messageId && state.channelId === channelId) {
    const deleted = await deleteLawyerStickyMessage(env, channelId, state.messageId);
    deletedPrevious = deleted.deleted;
    deleteWarning = deleted.warning;
  }

  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: LAWYER_STICKY_MESSAGE,
      allowed_mentions: allowedMentions({ userIds: [], roleIds: [] })
    })
  });
  if (!response.ok) throw await DiscordApiError.fromResponse(response, {
    action: "post_lawyer_sticky",
    endpoint: `/channels/${channelId}/messages`,
    channelId,
    likelyFixContext: "lawyer_sticky"
  });
  const message = await response.json() as { id: string };
  await writeLawyerStickyState(env, channelId, message.id, input.triggerMessageId ?? null);
  return { ok: true, action: "posted", channelId, messageId: message.id, deletedPrevious, deleteWarning };
}

export async function postServiceRequestEmbedToRequestChannel(
  env: Env,
  request: ServiceRequestDetail,
  channelId: string,
  mentions: ServiceRequestMentions
): Promise<{ id: string; staleMessageReposted?: boolean; staleMessageId?: string }> {
  const shouldPing = !request.discordTicketMessageId;
  const content = serviceRequestMentionContent(request, mentions, shouldPing);
  const endpoint = request.discordTicketMessageId ? `/channels/${channelId}/messages/${request.discordTicketMessageId}` : `/channels/${channelId}/messages`;
  const response = await discordApi(env, endpoint, {
    method: request.discordTicketMessageId ? "PATCH" : "POST",
    body: JSON.stringify({
      content,
      allowed_mentions: shouldPing ? allowedMentions(mentions) : allowedMentions({ userIds: [], roleIds: [] }),
      embeds: [publicServiceRequestEmbed(request)]
    })
  });
  if (!response.ok) {
    const error = await DiscordApiError.fromResponse(response, {
      action: request.discordTicketMessageId ? "update_request_channel_embed" : "post_request_channel_embed",
      endpoint,
      channelId,
      requestId: request.id,
      requestNumber: request.requestNumber,
      messageId: request.discordTicketMessageId ?? undefined,
      likelyFixContext: "ticket_channel"
    });
    if (isUnknownMessageError(error) && request.discordTicketMessageId) {
      const repostEndpoint = `/channels/${channelId}/messages`;
      const repostResponse = await discordApi(env, repostEndpoint, {
        method: "POST",
        body: JSON.stringify({
          content: serviceRequestMentionContent(request, mentions, true),
          allowed_mentions: allowedMentions(mentions),
          embeds: [publicServiceRequestEmbed(request)]
        })
      });
      if (!repostResponse.ok) throw await DiscordApiError.fromResponse(repostResponse, {
        action: "repost_request_channel_embed_after_stale_message",
        endpoint: repostEndpoint,
        channelId,
        requestId: request.id,
        requestNumber: request.requestNumber,
        messageId: request.discordTicketMessageId,
        likelyFixContext: "ticket_channel",
        primaryError: error.details
      });
      const message = await repostResponse.json() as { id: string };
      return { id: message.id, staleMessageReposted: true, staleMessageId: request.discordTicketMessageId };
    }
    throw error;
  }
  return (await response.json()) as { id: string };
}

export async function discordDiagnostics(env: Env) {
  const hasBotToken = Boolean(env.DISCORD_BOT_TOKEN);
  const hasGuildId = Boolean(env.DISCORD_GUILD_ID);
  const guildId = env.DISCORD_GUILD_ID ?? null;
  const checks: Array<Record<string, unknown>> = [
    { name: "DISCORD_BOT_TOKEN configured", ok: hasBotToken },
    { name: "DISCORD_GUILD_ID configured", ok: hasGuildId, guildId }
  ];
  if (!hasBotToken || !hasGuildId || !env.DB) {
    return { ok: false, guildId, checks, channels: [], permissions: null };
  }

  const guild = await safeDiscordJson(env, `/guilds/${guildId}`, "read_guild");
  checks.push(checkFromResult("Bot can access guild", guild, { guildId }));
  const bot = await safeDiscordJson(env, "/users/@me", "read_bot_user");
  checks.push(checkFromResult("Bot identity readable", bot, {}));

  const channels = await safeDiscordJson(env, `/guilds/${guildId}/channels`, "list_guild_channels");
  checks.push(checkFromResult("Bot can list guild channels", channels, { guildId }));
  const channelList = Array.isArray(channels.data) ? channels.data as DiscordChannel[] : [];
  const mappingRows = await env.DB.prepare(
    `SELECT mapping_key as mappingKey, discord_channel_id as discordChannelId, is_reference_only as isReferenceOnly
     FROM discord_channel_mappings
     WHERE mapping_key IN (
       'CRIMINAL_TRIALS_CATEGORY','CIVIL_CASES_CATEGORY','SUBPOENAS_CATEGORY','WARRANTS_CATEGORY','EXPUNGEMENTS_CATEGORY','MARRIAGE_DIVORCE_CATEGORY',
       'REQUEST_LAWYER','REQUEST_CRIMINAL_TRIAL','REQUEST_CIVIL_CASE','REQUEST_SUBPOENA','REQUEST_WARRANT','REQUEST_SEARCH_SEIZURE','REQUEST_EXPUNGEMENT','REQUEST_MARRIAGE','REQUEST_DIVORCE','ADMIN_LOG','GENERAL_CHAT'
     )
     ORDER BY mapping_key`
  ).all<{ mappingKey: string; discordChannelId: string; isReferenceOnly: number }>();
  const mappedChannels = mappingRows.results.map((row) => {
    const found = channelList.find((channel) => channel.id === row.discordChannelId);
    const expectedCategory = row.mappingKey.endsWith("_CATEGORY");
    const expected = expectedCategory ? "category" : "text channel";
    const actual = found ? channelTypeLabel(found.type) : row.discordChannelId ? "missing" : "blank";
    const ok = Boolean(found) && (expectedCategory ? found?.type === 4 : found?.type !== 4);
    return {
      mappingKey: row.mappingKey,
      id: row.discordChannelId,
      exists: Boolean(found),
      type: found?.type ?? null,
      actual,
      name: found?.name ?? null,
      parentId: found?.parent_id ?? null,
      expected,
      isCategoryMapping: expectedCategory,
      isPostDestination: !expectedCategory,
      ok,
      problem: channelMappingProblem(row.mappingKey, row.discordChannelId, found, expectedCategory),
      likelyFix: channelMappingLikelyFix(row.mappingKey, row.discordChannelId, found, expectedCategory)
    };
  });

  let permissions: Record<string, unknown> | null = null;
  let overwriteChecks: Array<Record<string, unknown>> = [];
  if (bot.ok && typeof bot.data === "object" && bot.data && "id" in bot.data) {
    const member = await safeDiscordJson(env, `/guilds/${guildId}/members/${String((bot.data as { id: string }).id)}`, "read_bot_member");
    const roles = await safeDiscordJson(env, `/guilds/${guildId}/roles`, "list_guild_roles");
    checks.push(checkFromResult("Bot guild member readable", member, { guildId }));
    checks.push(checkFromResult("Guild roles readable", roles, { guildId }));
    permissions = summarizePermissions(guildId!, member.data, roles.data);
    if (Array.isArray(roles.data) && member.data && typeof member.data === "object") {
      overwriteChecks = await privateTicketOverwriteDiagnostics(env, guildId!, String((bot.data as { id: string }).id), roles.data as DiscordRole[], member.data as DiscordMember, channelList);
    }
  }

  return {
    ok: checks.every((check) => check.ok !== false) && mappedChannels.every((channel) => channel.ok),
    guildId,
    checks,
    channels: mappedChannels,
    privateTicketOverwrites: overwriteChecks,
    permissions
  };
}

export async function postPublicPortalPanelMessage(): Promise<never> {
  throw new Error("Public portal panel posting is intentionally scaffolded for a later admin-only stage.");
}

export async function postAdminLogEmbed(): Promise<never> {
  throw new Error("Admin log embed posting is scaffolded for a later stage.");
}

async function lawyerStickyChannelId(env: Env): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ? AND discord_channel_id != ''")
    .bind(LAWYER_STICKY_MAPPING_KEY)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function readLawyerStickyState(env: Env): Promise<DiscordStickyState | null> {
  return await env.DB!.prepare(
    `SELECT mapping_key as mappingKey, channel_id as channelId, message_id as messageId,
      last_posted_at as lastPostedAt, last_checked_at as lastCheckedAt,
      last_trigger_message_id as lastTriggerMessageId
     FROM discord_sticky_messages
     WHERE mapping_key = ?`
  ).bind(LAWYER_STICKY_MAPPING_KEY).first<DiscordStickyState>();
}

async function writeLawyerStickyState(env: Env, channelId: string, messageId: string, triggerMessageId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.DB!.prepare(
    `INSERT INTO discord_sticky_messages (
      mapping_key, channel_id, message_id, last_posted_at, last_checked_at, last_trigger_message_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(mapping_key) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      last_posted_at = excluded.last_posted_at,
      last_checked_at = excluded.last_checked_at,
      last_trigger_message_id = excluded.last_trigger_message_id,
      updated_at = CURRENT_TIMESTAMP`
  ).bind(LAWYER_STICKY_MAPPING_KEY, channelId, messageId, now, now, triggerMessageId).run();
}

async function recordLawyerStickyCheck(env: Env, channelId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB!.prepare(
    `INSERT INTO discord_sticky_messages (mapping_key, channel_id, last_checked_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(mapping_key) DO UPDATE SET
       channel_id = excluded.channel_id,
       last_checked_at = excluded.last_checked_at,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(LAWYER_STICKY_MAPPING_KEY, channelId, now).run();
}

async function recentChannelMessages(env: Env, channelId: string): Promise<DiscordMessage[]> {
  const endpoint = `/channels/${channelId}/messages?limit=5`;
  const response = await discordApi(env, endpoint);
  if (!response.ok) throw await DiscordApiError.fromResponse(response, {
    action: "read_lawyer_sticky_channel_messages",
    endpoint,
    channelId,
    likelyFixContext: "lawyer_sticky"
  });
  const messages = await response.json();
  return Array.isArray(messages) ? messages as DiscordMessage[] : [];
}

async function deleteLawyerStickyMessage(env: Env, channelId: string, messageId: string): Promise<{ deleted: boolean; warning?: string }> {
  const endpoint = `/channels/${channelId}/messages/${messageId}`;
  const response = await discordApi(env, endpoint, { method: "DELETE" });
  if (response.ok || response.status === 404) return { deleted: response.ok };
  if (response.status === 403) {
    const warning = "Bot could not delete the previous lawyer sticky message. Manage Messages may be missing.";
    console.warn(JSON.stringify({ event: "lawyer_sticky_delete_forbidden", channelId, messageId, warning }));
    return { deleted: false, warning };
  }
  throw await DiscordApiError.fromResponse(response, {
    action: "delete_lawyer_sticky",
    endpoint,
    channelId,
    messageId,
    likelyFixContext: "lawyer_sticky"
  });
}

function cooldownActive(state: DiscordStickyState | null, nowMs: number): boolean {
  if (!state?.lastPostedAt) return false;
  const last = new Date(state.lastPostedAt).getTime();
  return Number.isFinite(last) && nowMs - last < LAWYER_STICKY_COOLDOWN_MS;
}

function normalHumanMessage(message: DiscordMessage, botUserId: string | null): boolean {
  if (!message.id || !message.author?.id) return false;
  if (message.webhook_id) return false;
  if (message.author.bot) return false;
  if (botUserId && message.author.id === botUserId) return false;
  return message.type === undefined || message.type === 0;
}

function privateServiceRequestEmbed(env: Env, request: ServiceRequestDetail) {
  const detailChunks = detailFieldChunks(request.payload);
  const fields = [
    { name: "Request Number", value: fitFieldValue(request.requestNumber), inline: true },
    { name: "Status", value: fitFieldValue(request.status), inline: true },
    { name: "Submitted By Discord", value: fitFieldValue(request.requesterDiscordUsername ?? "Unknown"), inline: true },
    { name: "Main Party", value: fitFieldValue(request.mainParty || "Not provided"), inline: true },
    { name: "Document Link", value: fitFieldValue(request.documentUrl ?? "None"), inline: false },
    { name: "Summary", value: fitFieldValue(request.shortTitle || "No summary"), inline: false }
  ];
  const availableDetailSlots = 24 - fields.length;
  const visibleDetailChunks = detailChunks.slice(0, availableDetailSlots);
  for (const [index, chunk] of visibleDetailChunks.entries()) {
    fields.push({
      name: index === 0 ? "Full Submitted Details" : `Full Submitted Details ${index + 1}`,
      value: chunk,
      inline: false
    });
  }
  if (detailChunks.length === 0) {
    fields.push({ name: "Full Submitted Details", value: "No additional fields.", inline: false });
  }
  const truncated = detailChunks.length > visibleDetailChunks.length;
  const portalUrl = requestPortalUrl(env, request.id);
  if (portalUrl) {
    fields.push({
      name: truncated ? "More Details" : "Portal",
      value: truncated ? `Details were truncated for Discord embed limits. [View full request in portal](${portalUrl})` : `[View full request in portal](${portalUrl})`,
      inline: false
    });
  } else if (truncated) {
    fields.push({
      name: "More Details",
      value: "Details were truncated for Discord embed limits. Open the request in the DOJ Portal for the complete record.",
      inline: false
    });
  }
  return {
    title: `${request.requestNumber} - ${request.requestType.replaceAll("_", " ")}`,
    color: DOJ_NEON_PINK,
    fields: fields.slice(0, 25),
    footer: { text: "Private DOJ ticket channel. Do not repost full details publicly." },
    timestamp: request.createdAt
  };
}

function publicServiceRequestEmbed(request: ServiceRequestDetail) {
  const payload = request.payload;
  const representationType = stringField(payload, "representationType") || request.requestType.replaceAll("_", " ");
  const urgency = stringField(payload, "urgency") || "Normal";
  const summary = publicSummaryText(request);
  const fields = request.requestType === "LAWYER"
    ? [
        { name: "Main Party", value: request.mainParty || "Not provided", inline: false },
        { name: "Representation Type", value: representationType, inline: false },
        { name: "Public Summary", value: summary, inline: false },
        { name: "Urgency", value: urgency, inline: true }
      ]
    : [
        { name: "Main Party", value: request.mainParty || "Not provided", inline: false },
        { name: "Public Summary", value: summary, inline: false },
        { name: "Status", value: request.status, inline: true }
      ];
  return {
    title: `${request.requestNumber} - ${request.requestType.replaceAll("_", " ")}`,
    color: DOJ_NEON_PINK,
    fields,
    footer: { text: "Public DOJ request notice. Full private details are restricted to authorized DOJ review." },
    timestamp: request.createdAt
  };
}

function serviceRequestMentionContent(request: ServiceRequestDetail, mentions: ServiceRequestMentions, includeMentions: boolean): string {
  const userMentions = includeMentions ? mentions.userIds.map((id) => `<@${id}>`) : [];
  const roleMentions = includeMentions ? mentions.roleIds.map((id) => `<@&${id}>`) : [];
  const mentionLine = [...userMentions, ...roleMentions].join(" ");
  const title = `New ${request.requestType.replaceAll("_", " ")} Request: ${request.requestNumber}`;
  return mentionLine ? `${mentionLine}\n${title}` : title;
}

function allowedMentions(mentions: ServiceRequestMentions) {
  return {
    parse: [],
    users: mentions.userIds,
    roles: mentions.roleIds
  };
}

function detailFieldChunks(payload: Record<string, unknown>): string[] {
  const lines = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `**${humanize(key)}:** ${payloadValue(value)}`);
  return chunkLines(lines, 1000);
}

function chunkLines(lines: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const rawLine of lines) {
    const line = fitFieldValue(rawLine, maxLength);
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function payloadValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return fitFieldValue(value.map((item) => payloadValue(item)).join(", "), 700);
  if (value && typeof value === "object") return fitFieldValue(JSON.stringify(value), 700);
  return fitFieldValue(String(value), 700);
}

function fitFieldValue(value: string, maxLength = 1024): string {
  const normalized = value.replaceAll(/[\u0000-\u001f]+/g, " ").replace(/\s+\n/g, "\n").trim();
  if (!normalized) return "Not provided";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function requestPortalUrl(env: Env, requestId: string): string | null {
  const base = env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    return new URL(`/requests/${encodeURIComponent(requestId)}`, base).toString();
  } catch {
    return null;
  }
}

function publicSummaryText(request: ServiceRequestDetail): string {
  const explicit = stringField(request.payload, "publicSummary") || request.shortTitle;
  const cleaned = explicit
    .replace(/<@!?\d{17,20}>/g, "[contact redacted]")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone redacted]")
    .slice(0, 300)
    .trim();
  if (cleaned) return cleaned;
  const representationType = stringField(request.payload, "representationType") || "legal matter";
  return `Seeking legal counsel regarding ${representationType.toLowerCase()}.`;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function channelName(request: ServiceRequestDetail): string {
  return `${request.requestNumber}-${request.mainParty || request.shortTitle || "request"}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 90);
}

async function listGuildChannels(env: Env, guildId: string, context: DiscordFailureContext): Promise<DiscordChannel[]> {
  const response = await discordApi(env, `/guilds/${guildId}/channels`);
  if (!response.ok) throw await DiscordApiError.fromResponse(response, context);
  return (await response.json()) as DiscordChannel[];
}

function findExistingTicketChannel(channels: DiscordChannel[], categoryId: string, name: string): { id: string; name: string } | null {
  const existing = channels.find((channel) => channel.name === name && channel.parent_id === categoryId && channel.type === 0);
  return existing ? { id: existing.id, name: existing.name } : null;
}

async function fetchGuildRoles(env: Env, guildId: string, context: DiscordFailureContext): Promise<DiscordRole[]> {
  const response = await discordApi(env, `/guilds/${guildId}/roles`);
  if (!response.ok) throw await DiscordApiError.fromResponse(response, { ...context, action: "list_guild_roles" });
  return (await response.json()) as DiscordRole[];
}

async function fetchGuildMember(env: Env, guildId: string, userId: string, context: DiscordFailureContext): Promise<DiscordMember> {
  const response = await discordApi(env, `/guilds/${guildId}/members/${userId}`);
  if (!response.ok) throw await DiscordApiError.fromResponse(response, { ...context, action: "read_guild_member" });
  return (await response.json()) as DiscordMember;
}

export function buildPermissionOverwrites(input: {
  guildId: string;
  botUserId: string;
  requesterDiscordId: string;
  roleIds: string[];
  roles: DiscordRole[];
  botMember: DiscordMember;
  requesterMember: DiscordMember | null;
  allow: string;
  botAllow: string;
}): PermissionOverwriteBuild {
  const roleMap = new Map(input.roles.map((role) => [role.id, role]));
  const botRolePosition = maxRolePosition(input.botMember.roles, roleMap);
  const warnings: string[] = [];
  const overwrites: DiscordOverwrite[] = [];
  const diagnostics: OverwriteDiagnostic[] = [];
  const pushDiagnostic = (item: OverwriteDiagnostic, overwrite?: DiscordOverwrite) => {
    diagnostics.push(item);
    if (overwrite) overwrites.push(overwrite);
  };

  pushDiagnostic({
    id: input.guildId,
    type: 0,
    kind: "everyone",
    label: "@everyone",
    exists: true,
    managedRole: false,
    position: roleMap.get(input.guildId)?.position ?? 0,
    botRolePosition,
    botCanManage: true,
    allow: "0",
    deny: VIEW_CHANNEL.toString(),
    source: "everyone-deny"
  }, { id: input.guildId, type: 0, allow: "0", deny: VIEW_CHANNEL.toString() });

  const requesterOk = Boolean(input.requesterDiscordId && input.requesterMember?.user?.id === input.requesterDiscordId);
  const requesterDiagnostic: OverwriteDiagnostic = {
    id: input.requesterDiscordId,
    type: 1,
    kind: "member",
    label: input.requesterMember?.user?.username ?? "requester",
    exists: requesterOk,
    managedRole: null,
    position: null,
    botRolePosition,
    botCanManage: null,
    allow: input.allow,
    deny: "0",
    source: "requester-member"
  };
  if (requesterOk) pushDiagnostic(requesterDiagnostic, { id: input.requesterDiscordId, type: 1, allow: input.allow, deny: "0" });
  else {
    warnings.push(`Requester member overwrite skipped; Discord member ${input.requesterDiscordId || "(blank)"} was not found in the guild.`);
    pushDiagnostic(requesterDiagnostic);
  }

  pushDiagnostic({
    id: input.botUserId,
    type: 1,
    kind: "member",
    label: "bot",
    exists: true,
    managedRole: null,
    position: null,
    botRolePosition,
    botCanManage: true,
    allow: input.botAllow,
    deny: "0",
    source: "bot-allow"
  }, { id: input.botUserId, type: 1, allow: input.botAllow, deny: "0" });

  for (const id of [...new Set(input.roleIds.filter(Boolean))]) {
    const role = roleMap.get(id);
    const botCanManage = role ? botRolePosition > role.position && !role.managed : false;
    const diagnostic: OverwriteDiagnostic = {
      id,
      type: 0,
      kind: "role",
      label: role?.name ?? "unknown role",
      exists: Boolean(role),
      managedRole: role?.managed ?? null,
      position: role?.position ?? null,
      botRolePosition,
      botCanManage,
      allow: input.allow,
      deny: "0",
      source: "staff-role"
    };
    if (!role) {
      warnings.push(`Role overwrite ${id} skipped; role does not exist in the guild.`);
      pushDiagnostic(diagnostic);
    } else if (role.managed) {
      warnings.push(`Role overwrite ${role.name} (${id}) skipped; managed integration roles cannot be safely assigned as ticket overwrites.`);
      pushDiagnostic(diagnostic);
    } else if (!botCanManage) {
      warnings.push(`Role overwrite ${role.name} (${id}) skipped; bot top role position ${botRolePosition} is not above role position ${role.position}.`);
      pushDiagnostic(diagnostic);
    } else {
      pushDiagnostic(diagnostic, { id, type: 0, allow: input.allow, deny: "0" });
    }
  }

  return {
    overwrites,
    minimalOverwrites: [
      { id: input.guildId, type: 0, allow: "0", deny: VIEW_CHANNEL.toString() },
      { id: input.botUserId, type: 1, allow: input.botAllow, deny: "0" }
    ],
    diagnostics,
    warnings
  };
}

function maxRolePosition(roleIds: string[], roleMap: Map<string, DiscordRole>): number {
  return roleIds.reduce((max, id) => Math.max(max, roleMap.get(id)?.position ?? 0), 0);
}

function payloadSummary(payload: Record<string, unknown>, overwrites: DiscordOverwrite[]) {
  return {
    name: payload.name,
    type: payload.type,
    parentId: payload.parent_id,
    overwriteCount: overwrites.length,
    overwrites: overwrites.map((overwrite) => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny }))
  };
}

async function privateTicketOverwriteDiagnostics(env: Env, guildId: string, botUserId: string, roles: DiscordRole[], botMember: DiscordMember, channels: DiscordChannel[]) {
  const roleIds = await diagnosticBaseStaffRoleIds(env);
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const categoryRows = await env.DB!.prepare("SELECT mapping_key as mappingKey, discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key IN ('CRIMINAL_TRIALS_CATEGORY','CIVIL_CASES_CATEGORY','SUBPOENAS_CATEGORY','WARRANTS_CATEGORY','EXPUNGEMENTS_CATEGORY','MARRIAGE_DIVORCE_CATEGORY')")
    .all<{ mappingKey: string; id: string }>();
  return Object.values(SERVICE_DEFINITIONS)
    .filter((definition) => definition.discordWorkflow === "PRIVATE_TICKET" && definition.categoryKey)
    .map((definition) => {
      const categoryId = categoryRows.results.find((row) => row.mappingKey === definition.categoryKey)?.id ?? "";
      const category = channels.find((channel) => channel.id === categoryId);
      const build = buildPermissionOverwrites({
        guildId,
        botUserId,
        requesterDiscordId: "",
        roleIds,
        roles,
        botMember,
        requesterMember: null,
        allow: (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY).toString(),
        botAllow: (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY | MANAGE_CHANNELS | MANAGE_ROLES).toString()
      });
      return {
        requestType: definition.type,
        categoryKey: definition.categoryKey,
        categoryId,
        categoryExists: Boolean(category),
        categoryType: category?.type ?? null,
        ok: Boolean(category && category.type === 4) && build.warnings.every((warning) => warning.startsWith("Requester member")),
        overwriteDiagnostics: build.diagnostics.filter((item) => item.source !== "requester-member"),
        overwriteWarnings: build.warnings.filter((warning) => !warning.startsWith("Requester member"))
      };
    });
}

async function diagnosticBaseStaffRoleIds(env: Env): Promise<string[]> {
  const result = await env.DB!.prepare("SELECT discord_role_id as id FROM role_mappings WHERE permission_key IN ('JUDGE','JUSTICE','CHIEF_JUSTICE','ADMIN','PROSECUTOR') AND is_reference_only = 0")
    .all<{ id: string }>();
  return [...new Set(result.results.map((row) => row.id).filter(Boolean))];
}

async function safeDiscordJson(env: Env, endpoint: string, action: string): Promise<{ ok: boolean; data: unknown; error?: DiscordFailureDetails }> {
  try {
    const response = await discordApi(env, endpoint);
    if (!response.ok) {
      const error = await DiscordApiError.fromResponse(response, { action, endpoint, likelyFixContext: "diagnostics" });
      return { ok: false, data: null, error: error.details };
    }
    return { ok: true, data: await response.json() };
  } catch (cause) {
    if (cause instanceof DiscordApiError) return { ok: false, data: null, error: cause.details };
    return { ok: false, data: null, error: detailsFromUnknown(action, endpoint, cause) };
  }
}

function checkFromResult(name: string, result: { ok: boolean; error?: DiscordFailureDetails }, context: Record<string, unknown>) {
  return {
    name,
    ok: result.ok,
    ...context,
    error: result.error ?? null,
    likelyFix: result.error?.likelyFix ?? null
  };
}

function summarizePermissions(guildId: string, memberData: unknown, rolesData: unknown): Record<string, unknown> | null {
  if (!memberData || typeof memberData !== "object" || !Array.isArray((memberData as { roles?: unknown }).roles) || !Array.isArray(rolesData)) return null;
  const roleIds = new Set<string>([guildId, ...(memberData as { roles: string[] }).roles]);
  let bits = 0n;
  for (const role of rolesData as Array<{ id: string; permissions?: string }>) {
    if (roleIds.has(role.id)) bits |= BigInt(role.permissions ?? "0");
  }
  return Object.fromEntries(Object.entries(REQUIRED_PERMISSION_BITS).map(([key, bit]) => [key, (bits & bit) === bit]));
}

export class DiscordApiError extends Error {
  constructor(public readonly details: DiscordFailureDetails) {
    super(formatDiscordFailure(details));
    this.name = "DiscordApiError";
  }

  static async fromResponse(response: Response, context: DiscordFailureContext): Promise<DiscordApiError> {
    const body = await safeResponseBody(response);
    const parsed = typeof body === "object" && body !== null ? body as { code?: unknown; message?: unknown; errors?: unknown } : {};
    const details: DiscordFailureDetails = {
      action: context.action,
      endpoint: context.endpoint,
      status: response.status,
      discordCode: typeof parsed.code === "number" || typeof parsed.code === "string" ? String(parsed.code) : null,
      discordMessage: typeof parsed.message === "string" ? parsed.message.slice(0, 500) : response.statusText || "Discord API request failed.",
      likelyFix: likelyFix(response.status, typeof parsed.code === "number" || typeof parsed.code === "string" ? String(parsed.code) : null, typeof parsed.message === "string" ? parsed.message : null, context.likelyFixContext),
      guildId: context.guildId,
      categoryId: context.categoryId,
      channelId: context.channelId,
      messageId: context.messageId,
      requestId: context.requestId,
      requestNumber: context.requestNumber,
      channelName: context.channelName,
      overwriteDiagnostics: context.overwriteDiagnostics,
      overwriteWarnings: context.overwriteWarnings,
      createChannelPayloadSummary: context.createChannelPayloadSummary,
      primaryError: context.primaryError,
      responseBody: sanitizeDiscordBody(body)
    };
    return new DiscordApiError(details);
  }
}

export function discordFailureDetails(cause: unknown, fallback: { action: string; endpoint?: string }): DiscordFailureDetails {
  if (cause instanceof DiscordApiError) return cause.details;
  return detailsFromUnknown(fallback.action, fallback.endpoint ?? "unknown", cause);
}

export function formatDiscordFailure(details: DiscordFailureDetails): string {
  const status = details.status ? `Discord ${details.status}` : "Discord request failed";
  const code = details.discordCode ? ` ${details.discordCode}` : "";
  const message = details.discordMessage ? ` ${details.discordMessage}` : "";
  return `${status}${code}:${message}`.slice(0, 260);
}

function detailsFromUnknown(action: string, endpoint: string, cause: unknown): DiscordFailureDetails {
  const message = cause instanceof Error ? cause.message : "Unknown Discord operation failure.";
  return {
    action,
    endpoint,
    status: null,
    discordCode: null,
    discordMessage: message.slice(0, 500),
    likelyFix: message.includes("DISCORD_BOT_TOKEN") ? "Worker DISCORD_BOT_TOKEN may be missing." : "Check Worker logs and Discord configuration.",
    responseBody: null
  };
}

function discordConfigurationError(details: DiscordFailureContext & { discordMessage: string; likelyFix: string }): DiscordApiError {
  return new DiscordApiError({
    ...details,
    status: null,
    discordCode: null,
    responseBody: null
  });
}

async function safeResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

function sanitizeDiscordBody(body: unknown): unknown {
  if (typeof body === "string") return body.slice(0, 1000);
  if (!body || typeof body !== "object") return body ?? null;
  return JSON.parse(JSON.stringify(body));
}

function likelyFix(status: number, code: string | null, message: string | null, context?: string): string {
  const normalized = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (status === 401) return "Worker DISCORD_BOT_TOKEN may be invalid, expired, or missing.";
  if (status === 403) return context === "ticket_category"
    ? "Bot may need View Channels, Manage Channels, and Manage Permissions in the configured ticket category. Also check role hierarchy."
    : "Bot may need View Channels, Send Messages, Embed Links, and Read Message History in the configured channel.";
  if (status === 404 && normalized.includes("unknown channel")) return "Configured category/channel ID may be wrong or not visible to the bot.";
  if (status === 404 && normalized.includes("unknown guild")) return "Configured DISCORD_GUILD_ID may be wrong or the bot is not in the guild.";
  if (status === 400) return "Discord rejected the request body. Permission overwrites, channel name, or embed payload may be malformed.";
  if (status === 429) return "Discord rate limited the bot. Wait and retry.";
  return "Check bot role hierarchy, channel/category permissions, and configured Discord IDs.";
}

function isUnknownMessageError(error: DiscordApiError): boolean {
  return error.details.status === 404 &&
    (error.details.discordCode === "10008" || (error.details.discordMessage ?? "").toLowerCase().includes("unknown message"));
}

function channelTypeLabel(type: number): string {
  if (type === 0) return "text channel";
  if (type === 4) return "category";
  if (type === 5) return "announcement channel";
  if (type === 10 || type === 11 || type === 12) return "thread";
  if (type === 13) return "stage channel";
  if (type === 15) return "forum channel";
  return `Discord channel type ${type}`;
}

function channelMappingProblem(mappingKey: string, id: string, found: DiscordChannel | undefined, expectedCategory: boolean): string | null {
  if (!id) return `${mappingKey} is blank. Private ticket creation for request types using this mapping requires an explicit category ID.`;
  if (!found) return `${mappingKey} points to a channel/category the bot cannot see, or the ID does not exist in this guild.`;
  if (expectedCategory && found.type !== 4) return `${mappingKey} is configured as a private ticket parent category but points to a ${channelTypeLabel(found.type)}.`;
  if (!expectedCategory && found.type === 4) return `${mappingKey} is configured as a post destination but points to a category.`;
  return null;
}

function channelMappingLikelyFix(mappingKey: string, id: string, found: DiscordChannel | undefined, expectedCategory: boolean): string | null {
  if (!id && expectedCategory) return `Set ${mappingKey} to a Discord category ID from PROJECT_CONFIG_FOR_CODEX.md, or leave the service type requiring manual private ticket setup.`;
  if (!id) return `Set ${mappingKey} to the intended text channel ID from PROJECT_CONFIG_FOR_CODEX.md.`;
  if (!found) return "Verify the ID belongs to DISCORD_GUILD_ID and that the bot has View Channels permission there.";
  if (expectedCategory && found.type !== 4) return "Use a private ticket category ID as parent_id. Do not use public request/panel text channel IDs.";
  if (!expectedCategory && found.type === 4) return "Use a normal text channel ID for public posts, panels, admin logs, or fallback messages.";
  return null;
}

function humanize(key: string): string {
  return key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

interface DiscordFailureContext {
  action: string;
  endpoint: string;
  guildId?: string;
  categoryId?: string;
  channelId?: string;
  messageId?: string;
  requestId?: string;
  requestNumber?: string;
  channelName?: string;
  likelyFixContext?: string;
  overwriteDiagnostics?: OverwriteDiagnostic[];
  overwriteWarnings?: string[];
  createChannelPayloadSummary?: unknown;
  primaryError?: DiscordFailureDetails;
}

export interface DiscordFailureDetails extends DiscordFailureContext {
  status: number | null;
  discordCode: string | null;
  discordMessage: string | null;
  likelyFix: string;
  responseBody: unknown;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
}

interface DiscordRole {
  id: string;
  name: string;
  position: number;
  managed?: boolean;
  permissions?: string;
}

interface DiscordMember {
  roles: string[];
  user?: {
    id: string;
    username?: string;
  };
}

interface DiscordOverwrite {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

interface OverwriteDiagnostic {
  id: string;
  type: 0 | 1;
  kind: "role" | "member" | "everyone" | "unknown";
  label: string;
  exists: boolean;
  managedRole: boolean | null;
  position: number | null;
  botRolePosition: number;
  botCanManage: boolean | null;
  allow: string;
  deny: string;
  source: string;
}

interface PermissionOverwriteBuild {
  overwrites: DiscordOverwrite[];
  minimalOverwrites: DiscordOverwrite[];
  diagnostics: OverwriteDiagnostic[];
  warnings: string[];
}
