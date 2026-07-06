import type { TicketTranscriptDetail, TicketTranscriptMessage, TicketTranscriptSummary } from "@shotta-doj/shared";
import { requireAuth } from "./auth";
import { errorJson, json } from "./http";
import { requireAnyPermission } from "./permissions";
import type { AuthContext, Env } from "./types";

const TRANSCRIPT_PERMISSIONS = ["MANAGE_REQUESTS", "CREATE_DOCKET", "PUBLISH_DOCKET", "REVIEW_BAR_EXAMS", "ADMIN"] as const;

export async function listTicketTranscripts(request: Request, env: Env): Promise<Response> {
  const ctx = await requireTranscriptAccess(request, env);
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for ticket transcripts.", 503);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const params: string[] = [];
  let where = "";
  if (query) {
    where = "WHERE id LIKE ? OR source_number LIKE ? OR discord_channel_name LIKE ? OR discord_channel_id LIKE ?";
    const like = `%${query}%`;
    params.push(like, like, like, like);
  }
  const result = await env.DB.prepare(
    `SELECT ${transcriptMetadataColumns()} FROM discord_ticket_transcripts ${where} ORDER BY created_at DESC LIMIT 200`
  )
    .bind(...params)
    .all<TranscriptRow>();
  console.info(JSON.stringify({ event: "ticket_transcripts_listed", userId: ctx.user.id, count: result.results.length, hasQuery: Boolean(query) }));
  return json({ data: result.results.map(rowToSummary) });
}

export async function ticketTranscriptDetail(request: Request, env: Env, id: string): Promise<Response> {
  await requireTranscriptAccess(request, env);
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for ticket transcripts.", 503);
  const row = await env.DB.prepare(`SELECT ${transcriptMetadataColumns()}, transcript_json as transcriptJson FROM discord_ticket_transcripts WHERE id = ?`)
    .bind(id)
    .first<TranscriptRow & { transcriptJson: string }>();
  if (!row) return errorJson("NOT_FOUND", "Ticket transcript not found.", 404);
  return json({ data: rowToDetail(row) });
}

async function requireTranscriptAccess(request: Request, env: Env): Promise<AuthContext> {
  return requireAnyPermission(await requireAuth(request, env), [...TRANSCRIPT_PERMISSIONS]);
}

function transcriptMetadataColumns(): string {
  return `
    id,
    source_type as sourceType,
    source_id as sourceId,
    source_number as sourceNumber,
    discord_channel_id as discordChannelId,
    discord_channel_name as discordChannelName,
    message_count as messageCount,
    archive_channel_id as archiveChannelId,
    archive_message_id as archiveMessageId,
    created_by_display_name as createdByDisplayName,
    created_at as createdAt,
    metadata_json as metadataJson`;
}

function rowToSummary(row: TranscriptRow): TicketTranscriptSummary {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceNumber: row.sourceNumber,
    discordChannelId: row.discordChannelId,
    discordChannelName: row.discordChannelName,
    messageCount: Number(row.messageCount) || 0,
    archiveChannelId: row.archiveChannelId,
    archiveMessageId: row.archiveMessageId,
    createdByDisplayName: row.createdByDisplayName,
    createdAt: row.createdAt,
    metadata: parseMetadata(row.metadataJson)
  };
}

function rowToDetail(row: TranscriptRow & { transcriptJson: string }): TicketTranscriptDetail {
  return {
    ...rowToSummary(row),
    messages: parseMessages(row.transcriptJson)
  };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseMessages(value: string | null): TicketTranscriptMessage[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMessage).filter((message): message is TicketTranscriptMessage => Boolean(message));
  } catch {
    return [];
  }
}

function normalizeMessage(value: unknown): TicketTranscriptMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const author = normalizeAuthor(record.author);
  return {
    id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
    transcriptKind: record.transcriptKind === "system" ? "system" : "message",
    type: typeof record.type === "number" ? record.type : null,
    author,
    content: typeof record.content === "string" ? record.content : "",
    timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
    editedTimestamp: typeof record.editedTimestamp === "string" ? record.editedTimestamp : null,
    attachments: Array.isArray(record.attachments) ? record.attachments.map(normalizeAttachment).filter((attachment): attachment is NonNullable<TicketTranscriptMessage["attachments"][number]> => Boolean(attachment)) : [],
    embeds: Array.isArray(record.embeds) ? record.embeds.map(normalizeEmbed) : [],
    mentions: Array.isArray(record.mentions) ? record.mentions.map(normalizeMention).filter((mention): mention is TicketTranscriptMessage["mentions"][number] => Boolean(mention)) : [],
    mentionRoles: Array.isArray(record.mentionRoles) ? record.mentionRoles.filter((role): role is string => typeof role === "string") : [],
    components: Array.isArray(record.components) ? record.components : [],
    reactions: Array.isArray(record.reactions) ? record.reactions.map(normalizeReaction).filter((reaction): reaction is TicketTranscriptMessage["reactions"][number] => Boolean(reaction)) : [],
    systemEvent: normalizeSystemEvent(record.systemEvent)
  };
}

function normalizeAuthor(value: unknown): TicketTranscriptMessage["author"] {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const username = typeof record.username === "string" ? record.username : "Unknown user";
  return {
    id: typeof record.id === "string" ? record.id : "",
    username,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    globalName: typeof record.globalName === "string" ? record.globalName : null,
    bot: Boolean(record.bot)
  };
}

function normalizeAttachment(value: unknown): TicketTranscriptMessage["attachments"][number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  if (!isSafeHttpUrl(url)) return null;
  return {
    id: typeof record.id === "string" ? record.id : null,
    filename: typeof record.filename === "string" && record.filename.trim() ? record.filename : "Attachment",
    url,
    contentType: typeof record.contentType === "string" ? record.contentType : null,
    size: typeof record.size === "number" ? record.size : null
  };
}

function normalizeMention(value: unknown): TicketTranscriptMessage["mentions"][number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;
  return {
    id,
    username: typeof record.username === "string" ? record.username : null,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    globalName: typeof record.globalName === "string" ? record.globalName : null,
    bot: Boolean(record.bot)
  };
}

function normalizeEmbed(value: unknown): TicketTranscriptMessage["embeds"][number] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const author = record.author && typeof record.author === "object" ? record.author as Record<string, unknown> : null;
  const footer = record.footer && typeof record.footer === "object" ? record.footer as Record<string, unknown> : null;
  const image = record.image && typeof record.image === "object" ? record.image as Record<string, unknown> : null;
  const thumbnail = record.thumbnail && typeof record.thumbnail === "object" ? record.thumbnail as Record<string, unknown> : null;
  return {
    title: typeof record.title === "string" ? record.title : null,
    description: typeof record.description === "string" ? record.description : null,
    url: safeOptionalUrl(record.url),
    color: typeof record.color === "number" ? record.color : null,
    timestamp: typeof record.timestamp === "string" ? record.timestamp : null,
    author: author ? {
      name: typeof author.name === "string" ? author.name : null,
      url: safeOptionalUrl(author.url),
      iconUrl: safeOptionalUrl(author.iconUrl)
    } : null,
    footer: footer ? {
      text: typeof footer.text === "string" ? footer.text : null,
      iconUrl: safeOptionalUrl(footer.iconUrl)
    } : null,
    image: image ? { url: safeOptionalUrl(image.url) } : null,
    thumbnail: thumbnail ? { url: safeOptionalUrl(thumbnail.url) } : null,
    fields: Array.isArray(record.fields) ? record.fields.map(normalizeEmbedField).filter((field): field is TicketTranscriptMessage["embeds"][number]["fields"][number] => Boolean(field)) : []
  };
}

function normalizeEmbedField(value: unknown): TicketTranscriptMessage["embeds"][number]["fields"][number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : "Field",
    value: typeof record.value === "string" ? record.value : "",
    inline: Boolean(record.inline)
  };
}

function normalizeReaction(value: unknown): TicketTranscriptMessage["reactions"][number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const emoji = record.emoji && typeof record.emoji === "object" ? record.emoji as Record<string, unknown> : {};
  return {
    count: typeof record.count === "number" ? record.count : 0,
    emoji: {
      id: typeof emoji.id === "string" ? emoji.id : null,
      name: typeof emoji.name === "string" ? emoji.name : null,
      animated: Boolean(emoji.animated)
    }
  };
}

function normalizeSystemEvent(value: unknown): TicketTranscriptMessage["systemEvent"] {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : {};
  return {
    label: typeof record.label === "string" ? record.label : "",
    actorDisplayName: typeof record.actorDisplayName === "string" ? record.actorDisplayName : null,
    actorUserId: typeof record.actorUserId === "string" ? record.actorUserId : null,
    source: typeof record.source === "string" ? record.source : null,
    metadata
  };
}

function safeOptionalUrl(value: unknown): string | null {
  return typeof value === "string" && isSafeHttpUrl(value) ? value : null;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

interface TranscriptRow {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  discordChannelId: string;
  discordChannelName: string | null;
  messageCount: number;
  archiveChannelId: string | null;
  archiveMessageId: string | null;
  createdByDisplayName: string | null;
  createdAt: string;
  metadataJson: string | null;
}
