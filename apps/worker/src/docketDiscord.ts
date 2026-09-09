import type { DocketDetail } from "@shotta-doj/shared";
import { discordApi } from "./discord";
import { CASE_TYPE_LABELS } from "./docketDefinitions";
import { proceedingLabel, statusLabel } from "./docketText";
import type { Env } from "./types";

const DOJ_NEON_PINK = 0xff2fae;

export interface DiscordDocketResult {
  channelId: string;
  messageId: string;
  action: "POSTED" | "UPDATED" | "REPOSTED";
}

export async function postOrUpdateDocketEmbed(
  env: Env,
  docket: DocketDetail,
  options: { repost?: boolean; judgeFallback?: string | null } = {}
): Promise<DiscordDocketResult> {
  const channelId = options.repost ? await docketChannelId(env) : docket.discordChannelId || (await docketChannelId(env));
  const isUpdate = Boolean(docket.discordChannelId && docket.discordMessageId && !options.repost);
  const embed = buildDocketEmbed(docket, options.judgeFallback, isUpdate);
  const body = JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } });
  if (docket.discordChannelId && docket.discordMessageId && !options.repost) {
    const response = await discordApi(env, `/channels/${docket.discordChannelId}/messages/${docket.discordMessageId}`, {
      method: "PATCH",
      body
    });
    if (!response.ok) throw new Error(`Discord docket update failed with ${response.status}`);
    const payload = (await response.json()) as { id: string; channel_id?: string };
    return { channelId: payload.channel_id || docket.discordChannelId, messageId: payload.id, action: "UPDATED" };
  }
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body
  });
  if (!response.ok) throw new Error(`Discord docket post failed with ${response.status}`);
  const payload = (await response.json()) as { id: string; channel_id?: string };
  return { channelId: payload.channel_id || channelId, messageId: payload.id, action: options.repost ? "REPOSTED" : "POSTED" };
}

async function docketChannelId(env: Env): Promise<string> {
  if (!env.DB) throw new Error("D1 is required to load the DOJ docket channel mapping.");
  const row = await env.DB.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = 'DOJ_DOCKET'")
    .first<{ id: string }>();
  if (!row?.id) throw new Error("DOJ_DOCKET channel mapping is not configured.");
  return row.id;
}

function buildDocketEmbed(docket: DocketDetail, judgeFallback?: string | null, isUpdate = false) {
  const judge = docket.judgeName || judgeFallback || "Pending assignment";
  const nowUnix = Math.floor(Date.now() / 1000);
  const postedUnix = dateToUnix(docket.discordPostedAt) ?? dateToUnix(docket.publishedAt) ?? nowUnix;
  const updatedUnix = isUpdate ? nowUnix : null;
  return {
    title: safeUserEmbedText(`${docket.docketNumber} - ${docket.title}`, 256),
    description: safeUserEmbedText(docket.publicSummary || "Summary restricted until further order of the Court.", 4000),
    color: DOJ_NEON_PINK,
    fields: [
      { name: "Case Type", value: CASE_TYPE_LABELS[docket.caseType] ?? docket.caseType, inline: true },
      { name: "Proceeding", value: proceedingLabel(docket.proceedingType), inline: true },
      { name: "Status", value: statusLabel(docket.status), inline: true },
      { name: "Presiding Judge", value: safeMetadataText(judge), inline: false },
      {
        name: "Scheduled For",
        value: docket.scheduledDiscordTimestamp && docket.scheduledDiscordRelative ? `${docket.scheduledDiscordTimestamp} (${docket.scheduledDiscordRelative})` : "Pending scheduling",
        inline: false
      },
      { name: "Docket Metadata", value: docketMetadataLine(docket.docketNumber, judge, postedUnix, updatedUnix), inline: false }
    ],
    footer: { text: `Docket ${safeMetadataText(docket.docketNumber)}` },
    timestamp: new Date().toISOString()
  };
}

function docketMetadataLine(docketNumber: string, judge: string, postedUnix: number, updatedUnix: number | null): string {
  const parts = [
    `Docket ${safeMetadataText(docketNumber)}`,
    `Posted by ${safeMetadataText(judge)}`,
    `Posted ${discordTimestamp(postedUnix, "f")}`
  ];
  if (updatedUnix) parts.push(`Last updated ${discordTimestamp(updatedUnix, "R")}`);
  return parts.join(" • ");
}

function discordTimestamp(unix: number, style: "f" | "R"): string {
  return `<t:${Math.max(0, Math.floor(unix))}:${style}>`;
}

function dateToUnix(value: string | null | undefined): number | null {
  if (!value) return null;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
}

function safeMetadataText(value: string): string {
  return value.replace(/[<>]/g, "").replace(/@/g, "@\u200b").trim().slice(0, 160) || "Pending";
}

function safeUserEmbedText(value: string, max: number): string {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/@(?=everyone|here|[!&]?\d{17,20})/gi, "@\u200b")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return (cleaned || "Pending").slice(0, max);
}
