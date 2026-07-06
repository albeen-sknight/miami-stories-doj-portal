import { discordApi } from "./discord";
import type { AuthContext, Env } from "./types";

const MAX_TRANSCRIPT_MESSAGES = 500;

export interface TranscriptEntry {
  id: string;
  transcriptKind: "message" | "system";
  type?: number | null;
  author: {
    id: string;
    username: string;
    displayName?: string | null;
    globalName?: string | null;
    bot?: boolean;
  } | null;
  content: string;
  timestamp: string;
  editedTimestamp?: string | null;
  attachments: TranscriptAttachment[];
  embeds: TranscriptEmbed[];
  mentions: TranscriptMention[];
  mentionRoles: string[];
  components: unknown[];
  reactions: TranscriptReaction[];
  systemEvent?: {
    label: string;
    actorDisplayName?: string | null;
    actorUserId?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
}

interface TranscriptAttachment {
  id?: string | null;
  filename: string;
  url: string;
  contentType?: string | null;
  size?: number | null;
}

interface TranscriptEmbed {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  color?: number | null;
  timestamp?: string | null;
  author?: { name?: string | null; url?: string | null; iconUrl?: string | null } | null;
  footer?: { text?: string | null; iconUrl?: string | null } | null;
  image?: { url?: string | null } | null;
  thumbnail?: { url?: string | null } | null;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

interface TranscriptMention {
  id: string;
  username?: string | null;
  displayName?: string | null;
  globalName?: string | null;
  bot?: boolean;
}

interface TranscriptReaction {
  count: number;
  emoji: {
    id?: string | null;
    name?: string | null;
    animated?: boolean;
  };
}

interface DiscordApiMessage {
  id: string;
  type?: number;
  author?: DiscordUser;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  attachments?: Array<{
    id?: string;
    url?: string;
    filename?: string;
    content_type?: string | null;
    size?: number | null;
  }>;
  embeds?: DiscordApiEmbed[];
  mentions?: DiscordUser[];
  mention_roles?: string[];
  components?: unknown[];
  reactions?: Array<{
    count?: number;
    emoji?: {
      id?: string | null;
      name?: string | null;
      animated?: boolean;
    };
  }>;
}

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
  display_name?: string | null;
  bot?: boolean;
}

interface DiscordApiEmbed {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  color?: number | null;
  timestamp?: string | null;
  author?: { name?: string | null; url?: string | null; icon_url?: string | null } | null;
  footer?: { text?: string | null; icon_url?: string | null } | null;
  image?: { url?: string | null } | null;
  thumbnail?: { url?: string | null } | null;
  fields?: Array<{ name?: string | null; value?: string | null; inline?: boolean }>;
}

export async function fetchChannelTranscriptEntries(env: Env, channelId: string): Promise<TranscriptEntry[]> {
  const all: DiscordApiMessage[] = [];
  let before: string | null = null;
  while (all.length < MAX_TRANSCRIPT_MESSAGES) {
    const query = before ? `?limit=100&before=${encodeURIComponent(before)}` : "?limit=100";
    const response = await discordApi(env, `/channels/${channelId}/messages${query}`);
    if (!response.ok) throw new Error(`Discord transcript fetch failed with ${response.status}`);
    const messages = await response.json() as DiscordApiMessage[];
    if (messages.length === 0) break;
    all.push(...messages);
    before = messages[messages.length - 1]?.id ?? null;
    if (messages.length < 100 || !before) break;
  }
  return all.slice(0, MAX_TRANSCRIPT_MESSAGES).reverse().map(normalizeDiscordMessage);
}

export function transcriptSystemEvent(label: string, ctx: AuthContext, source: string, metadata: Record<string, unknown> = {}): TranscriptEntry {
  return {
    id: `system-${crypto.randomUUID()}`,
    transcriptKind: "system",
    type: null,
    author: null,
    content: label,
    timestamp: new Date().toISOString(),
    editedTimestamp: null,
    attachments: [],
    embeds: [],
    mentions: [],
    mentionRoles: [],
    components: [],
    reactions: [],
    systemEvent: {
      label,
      actorDisplayName: ctx.user.displayName,
      actorUserId: ctx.user.id,
      source,
      metadata
    }
  };
}

export async function appendTranscriptSystemEvent(env: Env, transcriptId: string, event: TranscriptEntry): Promise<void> {
  if (!env.DB) return;
  const row = await env.DB.prepare("SELECT transcript_json as transcriptJson FROM discord_ticket_transcripts WHERE id = ?")
    .bind(transcriptId)
    .first<{ transcriptJson: string | null }>();
  if (!row) return;
  const entries = parseTranscriptEntries(row.transcriptJson);
  entries.push(event);
  await env.DB.prepare("UPDATE discord_ticket_transcripts SET transcript_json = ?, message_count = ? WHERE id = ?")
    .bind(JSON.stringify(entries), entries.length, transcriptId)
    .run();
}

function parseTranscriptEntries(value: string | null): TranscriptEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is TranscriptEntry => Boolean(entry && typeof entry === "object")) : [];
  } catch {
    return [];
  }
}

function normalizeDiscordMessage(message: DiscordApiMessage): TranscriptEntry {
  return {
    id: message.id,
    transcriptKind: "message",
    type: typeof message.type === "number" ? message.type : null,
    author: normalizeAuthor(message.author),
    content: typeof message.content === "string" ? message.content : "",
    timestamp: typeof message.timestamp === "string" ? message.timestamp : "",
    editedTimestamp: typeof message.edited_timestamp === "string" ? message.edited_timestamp : null,
    attachments: (message.attachments ?? []).map(normalizeAttachment).filter((attachment): attachment is TranscriptAttachment => Boolean(attachment)),
    embeds: (message.embeds ?? []).map(normalizeEmbed),
    mentions: (message.mentions ?? []).map(normalizeMention).filter((mention): mention is TranscriptMention => Boolean(mention)),
    mentionRoles: (message.mention_roles ?? []).filter((role): role is string => typeof role === "string"),
    components: Array.isArray(message.components) ? message.components : [],
    reactions: (message.reactions ?? []).map(normalizeReaction).filter((reaction): reaction is TranscriptReaction => Boolean(reaction)),
    systemEvent: null
  };
}

function normalizeAuthor(user: DiscordUser | undefined): TranscriptEntry["author"] {
  if (!user?.id) return null;
  return {
    id: user.id,
    username: user.username ?? "Unknown user",
    displayName: user.display_name ?? null,
    globalName: user.global_name ?? null,
    bot: Boolean(user.bot)
  };
}

function normalizeMention(user: DiscordUser): TranscriptMention | null {
  if (!user.id) return null;
  return {
    id: user.id,
    username: user.username ?? null,
    displayName: user.display_name ?? null,
    globalName: user.global_name ?? null,
    bot: Boolean(user.bot)
  };
}

function normalizeAttachment(attachment: NonNullable<DiscordApiMessage["attachments"]>[number]): TranscriptAttachment | null {
  const url = typeof attachment.url === "string" ? attachment.url : "";
  if (!isSafeHttpUrl(url)) return null;
  return {
    id: attachment.id ?? null,
    filename: typeof attachment.filename === "string" && attachment.filename.trim() ? attachment.filename : "Attachment",
    url,
    contentType: attachment.content_type ?? null,
    size: typeof attachment.size === "number" ? attachment.size : null
  };
}

function normalizeEmbed(embed: DiscordApiEmbed): TranscriptEmbed {
  return {
    title: embed.title ?? null,
    description: embed.description ?? null,
    url: isOptionalSafeUrl(embed.url),
    color: typeof embed.color === "number" ? embed.color : null,
    timestamp: embed.timestamp ?? null,
    author: embed.author ? {
      name: embed.author.name ?? null,
      url: isOptionalSafeUrl(embed.author.url),
      iconUrl: isOptionalSafeUrl(embed.author.icon_url)
    } : null,
    footer: embed.footer ? {
      text: embed.footer.text ?? null,
      iconUrl: isOptionalSafeUrl(embed.footer.icon_url)
    } : null,
    image: embed.image?.url ? { url: isOptionalSafeUrl(embed.image.url) } : null,
    thumbnail: embed.thumbnail?.url ? { url: isOptionalSafeUrl(embed.thumbnail.url) } : null,
    fields: (embed.fields ?? []).map((field) => ({
      name: field.name ?? "Field",
      value: field.value ?? "",
      inline: Boolean(field.inline)
    }))
  };
}

function normalizeReaction(reaction: NonNullable<DiscordApiMessage["reactions"]>[number]): TranscriptReaction | null {
  if (!reaction.emoji) return null;
  return {
    count: typeof reaction.count === "number" ? reaction.count : 0,
    emoji: {
      id: reaction.emoji.id ?? null,
      name: reaction.emoji.name ?? null,
      animated: Boolean(reaction.emoji.animated)
    }
  };
}

function isOptionalSafeUrl(value: string | null | undefined): string | null {
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
