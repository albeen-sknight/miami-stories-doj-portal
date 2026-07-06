import type { DocketDetail, DocketProceedingType, DocketStatus } from "@shotta-doj/shared";
import { DEFAULT_DOCKET_TIMEZONE, PROCEEDING_LABELS } from "./docketDefinitions";

export interface ScheduleResult {
  scheduledFor: string | null;
  timezone: string | null;
  discordTimestamp: string | null;
  discordRelative: string | null;
}

export function buildSchedule(localDate?: string | null, localTime?: string | null, timezone?: string | null): ScheduleResult {
  if (!localDate || !localTime) {
    return { scheduledFor: null, timezone: timezone || DEFAULT_DOCKET_TIMEZONE, discordTimestamp: null, discordRelative: null };
  }
  const zone = timezone || DEFAULT_DOCKET_TIMEZONE;
  const scheduled = zonedTimeToUtc(localDate, localTime, zone);
  const unix = Math.floor(scheduled.getTime() / 1000);
  return {
    scheduledFor: scheduled.toISOString(),
    timezone: zone,
    discordTimestamp: `<t:${unix}:F>`,
    discordRelative: `<t:${unix}:R>`
  };
}

export function generateDocketText(detail: Pick<
  DocketDetail,
  | "title"
  | "filedOn"
  | "scheduledFor"
  | "scheduledTimezone"
  | "scheduledDiscordTimestamp"
  | "scheduledDiscordRelative"
  | "individualsInvolved"
  | "judgeName"
  | "proceedingType"
  | "summaryMarkdown"
  | "status"
>): string {
  const lines = [`Docket Entry - ${detail.title}`, ""];
  const filed = detail.filedOn ? formatDate(detail.filedOn, detail.scheduledTimezone || DEFAULT_DOCKET_TIMEZONE) : formatDate(new Date().toISOString(), detail.scheduledTimezone || DEFAULT_DOCKET_TIMEZONE);
  lines.push(`Date: ${filed}`);
  if (detail.scheduledDiscordTimestamp && detail.scheduledDiscordRelative) {
    lines.push(`Scheduled For: ${detail.scheduledDiscordTimestamp} (${detail.scheduledDiscordRelative})`);
  } else if (detail.scheduledFor) {
    lines.push(`Time: ${formatDateTime(detail.scheduledFor, detail.scheduledTimezone || DEFAULT_DOCKET_TIMEZONE)}`);
  }
  lines.push("", "Individuals Involved:");
  const people = [...detail.individualsInvolved];
  if (detail.judgeName && !people.some((person) => person.includes(detail.judgeName!))) people.unshift(detail.judgeName);
  if (people.length === 0) people.push("Pending assignment");
  lines.push(...people.map((person) => `- ${person}`));
  lines.push("", `Proceeding: ${proceedingLabel(detail.proceedingType)}`, "", "Summary:", detail.summaryMarkdown || "Summary restricted until further order of the Court.", "", `Status: ${statusLabel(detail.status)}`);
  return lines.join("\n");
}

export function proceedingLabel(type: DocketProceedingType): string {
  return PROCEEDING_LABELS[type] ?? type.replaceAll("_", " ");
}

export function statusLabel(status: DocketStatus): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: timezone }).format(new Date(value));
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: timezone, timeZoneName: "short" }).format(new Date(value));
}

function zonedTimeToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = new Date(desiredUtc);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(guess).map((part) => [part.type, part.value]));
  const zoneRenderedUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(guess.getTime() - (zoneRenderedUtc - desiredUtc));
}
