/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Frontend API Client
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type {
  AdminBarExamAttemptDetail,
  AdminBarExamAttemptSummary,
  ApiListResponse,
  AttorneyProfile,
  BarExamCandidateAttempt,
  BarExamStatusResponse,
  BarExamTrack,
  CreateServiceRequestInput,
  CreateDocketInput,
  CurrentUserResponse,
  DocketDetail,
  DocketSummary,
  EligibleJudge,
  FaqEntry,
  MyProfessionalProfileResponse,
  ProfessionalProfileAdminRecord,
  ProfessionalProfileInput,
  ResourceDocument,
  ResourceCategory,
  SaveBarExamDraftInput,
  ServiceRequestDetail,
  ServiceRequestStatus,
  ServiceRequestSummary,
  StartBarExamInput,
  TicketTranscriptDetail,
  TicketTranscriptSummary
} from "@shotta-doj/shared";

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
export const API_BASE = API_BASE_URL;

const htmlApiError = "API returned HTML instead of JSON. The frontend is probably pointing at the Pages origin instead of the Worker API. Set VITE_API_BASE_URL to the deployed Worker URL.";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function fetchResources() {
  return fetchList<ResourceDocument>("/api/resources");
}

export interface AdminResourceDocument extends ResourceDocument {
  sortOrder: number;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
}

export interface AdminResourceInput {
  title: string;
  category: ResourceCategory;
  version: string;
  url: string;
  description: string;
  sortOrder: number;
  isPublic: boolean;
}

export async function fetchAdminResources(params = ""): Promise<{ data: AdminResourceDocument[] }> {
  return apiFetch(`/api/admin/resources${params}`);
}

export async function createAdminResource(input: AdminResourceInput): Promise<{ data: AdminResourceDocument }> {
  return apiFetch("/api/admin/resources", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAdminResource(id: string, input: AdminResourceInput): Promise<{ data: AdminResourceDocument }> {
  return apiFetch(`/api/admin/resources/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function publishAdminResource(id: string): Promise<{ data: AdminResourceDocument }> {
  return apiFetch(`/api/admin/resources/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function unpublishAdminResource(id: string): Promise<{ data: AdminResourceDocument }> {
  return apiFetch(`/api/admin/resources/${encodeURIComponent(id)}/unpublish`, { method: "POST" });
}

export async function archiveAdminResource(id: string): Promise<{ data: AdminResourceDocument }> {
  return apiFetch(`/api/admin/resources/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export async function deleteAdminResource(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/resources/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function fetchFaq() {
  return fetchList<FaqEntry>("/api/faq");
}

export interface AdminFaqEntry extends FaqEntry {
  isPublic: boolean;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
}

export interface AdminFaqInput {
  category: string;
  question: string;
  answerMarkdown: string;
  sortOrder: number;
  isPublic: boolean;
}

export async function fetchAdminFaq(params = ""): Promise<{ data: AdminFaqEntry[] }> {
  return apiFetch(`/api/admin/faq${params}`);
}

export async function createAdminFaq(input: AdminFaqInput): Promise<{ data: AdminFaqEntry }> {
  return apiFetch("/api/admin/faq", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAdminFaq(id: string, input: AdminFaqInput): Promise<{ data: AdminFaqEntry }> {
  return apiFetch(`/api/admin/faq/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function publishAdminFaq(id: string): Promise<{ data: AdminFaqEntry }> {
  return apiFetch(`/api/admin/faq/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function unpublishAdminFaq(id: string): Promise<{ data: AdminFaqEntry }> {
  return apiFetch(`/api/admin/faq/${encodeURIComponent(id)}/unpublish`, { method: "POST" });
}

export async function archiveAdminFaq(id: string): Promise<{ data: AdminFaqEntry }> {
  return apiFetch(`/api/admin/faq/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export async function deleteAdminFaq(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/faq/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function importAdminFaq(): Promise<{ ok: boolean; command: string; message: string }> {
  return apiFetch("/api/admin/faq/import", { method: "POST" });
}

export async function fetchDocket(params = ""): Promise<ApiListResponse<DocketSummary>> {
  return fetchList<DocketSummary>(`/api/docket${params}`);
}

export async function fetchPublicDocketDetail(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/docket/${id}`);
}

export async function fetchLawyers() {
  return fetchList<AttorneyProfile>("/api/lawyers");
}

export async function fetchLawyerProfile(slug: string): Promise<{ data: AttorneyProfile; source: "d1" | "seed" }> {
  return apiFetch(`/api/lawyers/${encodeURIComponent(slug)}`);
}

export async function fetchMyProfessionalProfile(): Promise<MyProfessionalProfileResponse> {
  return apiFetch("/api/profile/me");
}

export async function updateMyProfessionalProfile(input: ProfessionalProfileInput): Promise<MyProfessionalProfileResponse> {
  return apiFetch("/api/profile/me", { method: "PATCH", body: JSON.stringify(input) });
}

export async function fetchAdminProfiles(params = ""): Promise<{ data: ProfessionalProfileAdminRecord[]; branches: string[] }> {
  return apiFetch(`/api/admin/profiles${params}`);
}

export async function fetchAdminProfile(id: string): Promise<{ data: ProfessionalProfileAdminRecord; branches: string[] }> {
  return apiFetch(`/api/admin/profiles/${encodeURIComponent(id)}`);
}

export async function createAdminProfile(input: ProfessionalProfileInput): Promise<{ data: ProfessionalProfileAdminRecord }> {
  return apiFetch("/api/admin/profiles", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAdminProfile(id: string, input: ProfessionalProfileInput): Promise<{ data: ProfessionalProfileAdminRecord }> {
  return apiFetch(`/api/admin/profiles/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function publishAdminProfile(id: string): Promise<{ data: ProfessionalProfileAdminRecord }> {
  return apiFetch(`/api/admin/profiles/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function unpublishAdminProfile(id: string): Promise<{ data: ProfessionalProfileAdminRecord }> {
  return apiFetch(`/api/admin/profiles/${encodeURIComponent(id)}/unpublish`, { method: "POST" });
}

export async function markAdminProfileInactive(id: string): Promise<{ data: ProfessionalProfileAdminRecord }> {
  return apiFetch(`/api/admin/profiles/${encodeURIComponent(id)}/inactive`, { method: "POST" });
}

export async function fetchMe(): Promise<CurrentUserResponse> {
  return apiFetch("/api/me");
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return apiFetch("/api/health");
}

export async function logout(): Promise<{ ok: boolean }> {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export async function bootstrapSession(token: string): Promise<{ ok: boolean; authenticated: boolean }> {
  return apiFetch("/api/auth/session-bootstrap", { method: "POST", body: JSON.stringify({ token }) });
}

export async function refreshRoles(): Promise<CurrentUserResponse> {
  return apiFetch("/api/auth/refresh-roles", { method: "POST" });
}

export function authStartUrl(returnTo?: string) {
  const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "";
  const query = safeReturnTo ? `?redirect=${encodeURIComponent(safeReturnTo)}` : "";
  return apiUrl(`/api/auth/discord/start${query}`);
}

export async function createServiceRequest(input: CreateServiceRequestInput): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch("/api/requests", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchMyRequests(): Promise<{ data: ServiceRequestSummary[] }> {
  return apiFetch("/api/requests/mine");
}

export async function fetchRequest(id: string): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/requests/${id}`);
}

export async function fetchAdminRequests(params = ""): Promise<{ data: ServiceRequestSummary[] }> {
  return apiFetch(`/api/admin/requests${params}`);
}

export async function fetchAdminRequest(id: string): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/admin/requests/${id}`);
}

export async function deleteAdminRequest(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/requests/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function updateRequestStatus(id: string, status: ServiceRequestStatus): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/admin/requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function fetchEligibleJudges(): Promise<{ data: EligibleJudge[] }> {
  return apiFetch("/api/admin/requests/eligible-judges");
}

export async function assignRequest(id: string, judgeDiscordId: string): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/admin/requests/${id}/assign`, { method: "PATCH", body: JSON.stringify({ judgeDiscordId }) });
}

export async function createDiscordTicket(id: string): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/admin/requests/${id}/create-discord-channel`, { method: "POST" });
}

export async function postDiscordTicketEmbed(id: string): Promise<{ data: ServiceRequestDetail }> {
  return apiFetch(`/api/admin/requests/${id}/post-to-discord-ticket`, { method: "POST" });
}

export async function closeDiscordTicket(id: string, reason: string): Promise<{ data: ServiceRequestDetail; close: Record<string, unknown> }> {
  return apiFetch(`/api/admin/requests/${encodeURIComponent(id)}/close-ticket`, { method: "POST", body: JSON.stringify({ reason }) });
}

export interface DiscordDiagnosticsResponse {
  ok: boolean;
  guildId: string | null;
  checks: Array<Record<string, unknown>>;
  channels: Array<Record<string, unknown>>;
  privateTicketOverwrites?: Array<Record<string, unknown>>;
  permissions: Record<string, unknown> | null;
}

export async function fetchDiscordDiagnostics(): Promise<{ data: DiscordDiagnosticsResponse }> {
  return apiFetch("/api/admin/discord/diagnostics");
}

export async function fetchTicketTranscripts(params = ""): Promise<{ data: TicketTranscriptSummary[] }> {
  return apiFetch(`/api/admin/transcripts${params}`);
}

export async function fetchTicketTranscript(id: string): Promise<{ data: TicketTranscriptDetail }> {
  return apiFetch(`/api/admin/transcripts/${encodeURIComponent(id)}`);
}

export async function addRequestEvent(id: string, message: string): Promise<{ data: unknown[] }> {
  return apiFetch(`/api/admin/requests/${id}/events`, { method: "POST", body: JSON.stringify({ message }) });
}

export async function fetchBarExamStatus(): Promise<BarExamStatusResponse> {
  return apiFetch("/api/bar-exam/status");
}

export async function fetchBarExamResources(): Promise<{ data: Array<{ title: string; category: string; url: string; description: string }> }> {
  return apiFetch("/api/bar-exam/resources");
}

export async function startBarExam(input: StartBarExamInput): Promise<{ data: BarExamCandidateAttempt }> {
  return apiFetch("/api/bar-exam/start", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchBarExamAttempt(track?: BarExamTrack): Promise<{ data: BarExamCandidateAttempt }> {
  return apiFetch(`/api/bar-exam/attempt${track ? `?track=${track}` : ""}`);
}

export async function saveBarExamDraft(input: SaveBarExamDraftInput, track?: BarExamTrack): Promise<{ data: BarExamCandidateAttempt }> {
  return apiFetch(`/api/bar-exam/attempt/draft${track ? `?track=${track}` : ""}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function submitBarExam(input: SaveBarExamDraftInput, track?: BarExamTrack): Promise<{ data: BarExamCandidateAttempt }> {
  return apiFetch(`/api/bar-exam/attempt/submit${track ? `?track=${track}` : ""}`, { method: "POST", body: JSON.stringify(input) });
}

export async function fetchAdminBarExamAttempts(params = ""): Promise<{ data: AdminBarExamAttemptSummary[] }> {
  return apiFetch(`/api/admin/bar-exam/attempts${params}`);
}

export async function fetchAdminBarExamAttempt(id: string): Promise<{ data: AdminBarExamAttemptDetail }> {
  return apiFetch(`/api/admin/bar-exam/attempts/${id}`);
}

export async function scoreBarExamAttempt(id: string, scores: Array<{ questionKey: string; pointsAwarded: number; reviewerNotes?: string }>): Promise<{ data: AdminBarExamAttemptDetail }> {
  return apiFetch(`/api/admin/bar-exam/attempts/${id}/score`, { method: "PATCH", body: JSON.stringify({ scores }) });
}

export async function markBarExamAttempt(id: string, action: "mark-under-review" | "pass" | "fail" | "refer" | "void" | "reopen", message?: string): Promise<{ data: AdminBarExamAttemptDetail }> {
  return apiFetch(`/api/admin/bar-exam/attempts/${id}/${action}`, { method: "POST", body: JSON.stringify({ message }) });
}

export async function createBarExamFollowupChannel(id: string): Promise<{ data: AdminBarExamAttemptDetail }> {
  return apiFetch(`/api/admin/bar-exam/attempts/${id}/create-followup-channel`, { method: "POST" });
}

export async function deleteBarExamAttempt(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/bar-exam/attempts/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export interface AdminBarExamVersionSummary {
  id: string;
  examTrack: BarExamTrack;
  versionCode: string;
  versionLabel: string;
  title: string;
  description: string | null;
  status: string;
  totalPoints: number;
  passingScore: number;
  timeLimitMinutes: number;
  isActive: number;
  questionCount: number;
  hasServerAnswerKey: number;
  isImported: number;
  isPlaceholder: number;
  updatedAt: string;
}

export async function fetchAdminBarExamVersions(): Promise<{ data: AdminBarExamVersionSummary[] }> {
  return apiFetch("/api/admin/bar-exam/versions");
}

export interface AdminBarSummary {
  versions: Array<{
    id: string;
    versionLabel: string;
    title: string;
    examTrack: BarExamTrack;
    isActive: number;
    status: string;
    questionCount: number;
    isImported: number;
    isPlaceholder: number;
  }>;
  activeVersion: {
    id: string;
    versionLabel: string;
    title: string;
    examTrack: BarExamTrack;
    isActive: number;
    status: string;
    questionCount: number;
    isImported: number;
    isPlaceholder: number;
  } | null;
  attempts: { total: number; submitted: number; pendingReview: number; passed: number; failed: number; referred: number };
  attorneys: { publicCount: number; activeCount: number };
}

export async function fetchAdminBarSummary(): Promise<{ data: AdminBarSummary }> {
  return apiFetch("/api/admin/bar");
}

export async function seedBarExamVersions(): Promise<{ ok: boolean; count: number }> {
  return apiFetch("/api/admin/bar-exam/versions/seed", { method: "POST" });
}

export async function publishBarExamVersion(id: string): Promise<{ ok: boolean; id: string; isActive: boolean }> {
  return apiFetch(`/api/admin/bar-exam/versions/${encodeURIComponent(id)}/activate`, { method: "POST" });
}

export async function unpublishBarExamVersion(id: string): Promise<{ ok: boolean; id: string; isActive: boolean }> {
  return apiFetch(`/api/admin/bar-exam/versions/${encodeURIComponent(id)}/deactivate`, { method: "POST" });
}

export async function deleteBarExamVersion(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/bar-exam/versions/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function fetchAdminDocket(params = ""): Promise<{ data: DocketSummary[] }> {
  return apiFetch(`/api/admin/docket${params}`);
}

export interface JudicialRecord {
  id: string;
  recordNumber: string;
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown: string | null;
  reasoningMarkdown: string | null;
  tags: string[];
  status: string;
  visibility: string;
  linkedDocketId: string | null;
  linkedDocketNumber: string | null;
  linkedRequestId: string | null;
  linkedRequestNumber: string | null;
  subjectName: string | null;
  subjectCid: string | null;
  issuedByDisplayName: string | null;
  archivedAt: string | null;
  publishedAt: string | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordPostedAt: string | null;
  discordSyncStatus: string;
  deletedAt: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JudicialRecordInput {
  recordType: string;
  category: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  holdingMarkdown?: string;
  reasoningMarkdown?: string;
  tags?: string[];
  tagsText?: string;
  visibility: string;
  linkedDocketNumber?: string;
  linkedRequestNumber?: string;
  subjectName?: string;
  subjectCid?: string;
}

export interface JudicialHistorySearchResponse {
  query: string;
  dockets: Array<Record<string, unknown>>;
  requests: Array<Record<string, unknown>>;
  judicialRecords: JudicialRecord[];
  barExamAttempts: Array<Record<string, unknown>>;
}

export async function fetchJudicialRecords(params = ""): Promise<{ data: JudicialRecord[] }> {
  return apiFetch(`/api/judicial-records${params}`);
}

export async function fetchAdminJudicialRecords(params = ""): Promise<{ data: JudicialRecord[]; recordTypes: string[]; categories: string[] }> {
  return apiFetch(`/api/admin/judicial-records${params}`);
}

export async function createJudicialRecord(input: JudicialRecordInput): Promise<{ data: JudicialRecord }> {
  return apiFetch("/api/admin/judicial-records", { method: "POST", body: JSON.stringify(input) });
}

export async function updateJudicialRecord(id: string, input: JudicialRecordInput): Promise<{ data: JudicialRecord }> {
  return apiFetch(`/api/admin/judicial-records/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function publishJudicialRecord(id: string): Promise<{ data: JudicialRecord; discordStatus: string }> {
  return apiFetch(`/api/admin/judicial-records/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function archiveJudicialRecord(id: string): Promise<{ data: JudicialRecord }> {
  return apiFetch(`/api/admin/judicial-records/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export async function deleteJudicialRecord(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/judicial-records/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function restoreJudicialRecord(id: string, reason: string): Promise<{ data: DeletionLogEntry | null }> {
  return apiFetch(`/api/admin/judicial-records/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function searchJudicialHistory(query: string): Promise<{ data: JudicialHistorySearchResponse }> {
  return apiFetch(`/api/admin/judicial-history/search?q=${encodeURIComponent(query)}`);
}

export async function fetchAdminDocketDetail(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}`);
}

export async function createDocketEntry(input: CreateDocketInput): Promise<{ data: DocketDetail }> {
  return apiFetch("/api/admin/docket", { method: "POST", body: JSON.stringify(input) });
}

export async function updateDocketEntry(id: string, input: CreateDocketInput): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function publishDocketEntry(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}/publish`, { method: "POST" });
}

export async function unpublishDocketEntry(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}/unpublish`, { method: "POST" });
}

export async function archiveDocketEntry(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}/archive`, { method: "POST" });
}

export async function closeDocketEntry(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}/close`, { method: "POST" });
}

export async function postDocketToDiscord(id: string, repost = false): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/docket/${id}/post-to-discord`, { method: "POST", body: JSON.stringify({ repost }) });
}

export async function deleteDocketEntry(id: string, reason: string): Promise<{ data: DeletionLogEntry }> {
  return apiFetch(`/api/admin/docket/${encodeURIComponent(id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function createDocketFromRequest(id: string): Promise<{ data: DocketDetail }> {
  return apiFetch(`/api/admin/requests/${id}/create-docket`, { method: "POST" });
}

export interface DeletionLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityNumber: string | null;
  entityTitle: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string;
  metadata: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  createdAt: string;
  restoredAt: string | null;
  restoredByUserId: string | null;
  restoredByDisplayName: string | null;
  restoreReason: string | null;
}

export async function fetchDeletionLog(): Promise<{ data: DeletionLogEntry[] }> {
  return apiFetch("/api/admin/deletion-log");
}

export async function restoreDeletionLogEntry(id: string, reason: string): Promise<{ data: DeletionLogEntry | null }> {
  return apiFetch(`/api/admin/deletion-log/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ reason }) });
}

async function fetchList<T>(path: string): Promise<ApiListResponse<T>> {
  return apiFetch<ApiListResponse<T>>(path);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const trimmed = text.trimStart();
  if (contentType.includes("text/html") || trimmed.toLowerCase().startsWith("<!doctype") || trimmed.toLowerCase().startsWith("<html")) {
    throw new Error(htmlApiError);
  }

  const payload = parseJsonPayload(text);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, response.status));
  }
  return payload as T;
}

function parseJsonPayload(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("API returned invalid JSON. Check that VITE_API_BASE_URL points to the deployed Worker API.");
  }
}

function apiErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") {
      const field = typeof record.field === "string" ? `${record.field}: ` : "";
      const details = typeof record.details === "string" ? ` (${record.details})` : "";
      return `${field}${record.error}${details}`;
    }
    if (record.error && typeof record.error === "object") {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === "string") {
        return error.message;
      }
      if (typeof error.code === "string") {
        return error.code;
      }
    }
    if (typeof record.message === "string") {
      return record.message;
    }
  }
  return `Request failed with ${status}`;
}
