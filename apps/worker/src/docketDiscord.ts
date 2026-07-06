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
  const embed = buildDocketEmbed(docket, options.judgeFallback);
  if (docket.discordChannelId && docket.discordMessageId && !options.repost) {
    const response = await discordApi(env, `/channels/${docket.discordChannelId}/messages/${docket.discordMessageId}`, {
      method: "PATCH",
      body: JSON.stringify({ embeds: [embed] })
    });
    if (!response.ok) throw new Error(`Discord docket update failed with ${response.status}`);
    const payload = (await response.json()) as { id: string; channel_id?: string };
    return { channelId: payload.channel_id || docket.discordChannelId, messageId: payload.id, action: "UPDATED" };
  }
  const response = await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [embed] })
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

function buildDocketEmbed(docket: DocketDetail, judgeFallback?: string | null) {
  const judge = docket.judgeName || judgeFallback || "Pending assignment";
  const nowUnix = Math.floor(Date.now() / 1000);
  const postedUnix = docket.discordMessageId && docket.publishedAt ? Math.floor(new Date(docket.publishedAt).getTime() / 1000) : nowUnix;
  const updatedUnix = docket.discordUpdatedAt ? Math.floor(new Date(docket.discordUpdatedAt).getTime() / 1000) : null;
  const footerParts = [`Docket ${docket.docketNumber}`, `Posted by ${judge}`, `Posted <t:${postedUnix}:f>`];
  if (updatedUnix) footerParts.push(`Last updated <t:${updatedUnix}:R>`);
  return {
    title: `${docket.docketNumber} - ${docket.title}`.slice(0, 256),
    description: (docket.publicSummary || "Summary restricted until further order of the Court.").slice(0, 4000),
    color: DOJ_NEON_PINK,
    fields: [
      { name: "Case Type", value: CASE_TYPE_LABELS[docket.caseType] ?? docket.caseType, inline: true },
      { name: "Proceeding", value: proceedingLabel(docket.proceedingType), inline: true },
      { name: "Status", value: statusLabel(docket.status), inline: true },
      { name: "Presiding Judge", value: judge, inline: false },
      {
        name: "Scheduled For",
        value: docket.scheduledDiscordTimestamp && docket.scheduledDiscordRelative ? `${docket.scheduledDiscordTimestamp} (${docket.scheduledDiscordRelative})` : "Pending scheduling",
        inline: false
      }
    ],
    footer: { text: footerParts.join(" • ") },
    timestamp: new Date().toISOString()
  };
}
