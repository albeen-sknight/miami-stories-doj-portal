import type {
  CreateDocketInput,
  DocketCaseType,
  DocketDraftResponse,
  DocketDraftTranscriptInfo,
  DocketProceedingType,
  DocketStatus,
  ServiceRequestDetail
} from "@shotta-doj/shared";
import { CASE_TYPE_LABELS, DEFAULT_DOCKET_TIMEZONE, PROCEEDING_LABELS, REQUEST_DOCKET_SUGGESTIONS } from "./docketDefinitions";
import type { Env } from "./types";

const KNOWN_TRANSCRIPT_ARCHIVE_CHANNEL_ID = "1395632345436131389";
const DEFAULT_GEMINI_DOCKET_MODEL = "gemini-3.7-flash";
const GEMINI_TIMEOUT_MS = 12_000;
const DEFAULT_PRESIDING_JUDGE = "Honorable Chief Justice Álvaro Castro";
const DEFAULT_SCHEDULED_FOR = "Pending scheduling";

interface RequestFacts {
  arrestReportNumber: string | null;
  defendantName: string | null;
  defendantCitizenId: string | null;
  allegedCharges: string | null;
  briefSummary: string | null;
  arrestingAgencyOfficer: string | null;
  schedulingNotes: string | null;
  evidenceLink: string | null;
  publicSummary: string | null;
  privateDetails: string | null;
  plaintiff: string | null;
  respondent: string | null;
  preferredContactMethod: string | null;
  allText: string;
}

interface DraftClassification {
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status: DocketStatus;
  summaryKind: "preliminary" | "final_disposition" | "warrant" | "pending_contact" | "general";
}

interface TranscriptRow {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  discordChannelId: string | null;
  archiveChannelId: string | null;
  archiveMessageId: string | null;
  metadataJson: string;
  createdAt: string;
}

interface GeminiFailureDetails {
  message: string;
  errorType: string;
  status: number | null;
  timeout: boolean;
}

interface GeminiDocketJson {
  title?: unknown;
  body?: unknown;
  caseType?: unknown;
  proceeding?: unknown;
  status?: unknown;
  presidingJudge?: unknown;
  scheduledFor?: unknown;
  closedTicketTranscript?: unknown;
  relatedRequestNumber?: unknown;
  incidentNumber?: unknown;
  mainParty?: unknown;
  charges?: unknown;
  confidence?: unknown;
  needsStaffReview?: unknown;
}

interface ValidatedAiDocketDraft {
  title: string;
  body: string;
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status: DocketStatus;
  plaintiff: string | null;
  defendant: string | null;
  presidingJudge: string;
  confidence: "low" | "medium" | "high";
  needsStaffReview: string[];
}

class GeminiDraftFailure extends Error {
  constructor(message: string, public readonly details: Omit<GeminiFailureDetails, "message">) {
    super(message);
    this.name = "GeminiDraftFailure";
  }
}

export async function buildDocketDraftFromRequest(env: Env, detail: ServiceRequestDetail): Promise<DocketDraftResponse> {
  const rulesDraft = await buildRulesDocketDraftFromRequest(env, detail);
  const model = geminiModel(env);
  if (!env.GEMINI_API_KEY) {
    return {
      ...rulesDraft,
      source: { ...rulesDraft.source, model, fallbackReason: "Gemini is not configured." },
      ai: { used: false, model, confidence: null, needsStaffReview: [], failure: null }
    };
  }
  try {
    return await buildGeminiEnhancedDraft(env, detail, rulesDraft, model);
  } catch (cause) {
    const fallback = geminiFailureDetails(cause);
    return {
      ...rulesDraft,
      source: { ...rulesDraft.source, model, fallbackReason: fallback.message },
      ai: {
        used: false,
        model,
        confidence: null,
        needsStaffReview: [`Gemini enhancement was unavailable; rules-based draft used. ${fallback.message}`],
        failure: { errorType: fallback.errorType, status: fallback.status, timeout: fallback.timeout }
      }
    };
  }
}

async function buildRulesDocketDraftFromRequest(env: Env, detail: ServiceRequestDetail): Promise<DocketDraftResponse> {
  const facts = extractRequestFacts(detail);
  const classification = classifyRequest(detail, facts);
  const transcript = await findRequestTranscript(env, detail);
  const title = draftTitle(detail, facts, classification);
  const plaintiff = draftPlaintiff(detail, facts, classification.caseType);
  const defendant = draftDefendant(facts);
  const privateNotesMarkdown = buildPrivateNotes(detail, facts, transcript);
  const input: CreateDocketInput = {
    title,
    caseType: classification.caseType,
    proceedingType: classification.proceedingType,
    status: classification.status,
    plaintiff: plaintiff ?? undefined,
    defendant: defendant ?? undefined,
    individualsInvolved: peopleList([
      detail.assignedJudgeDisplayName,
      plaintiff,
      defendant,
      facts.defendantCitizenId ? `Citizen ID ${facts.defendantCitizenId}` : null,
      facts.arrestingAgencyOfficer,
      detail.requesterDiscordUsername
    ]),
    judgeUserId: detail.assignedJudgeUserId ?? undefined,
    judgeName: detail.assignedJudgeDisplayName ?? DEFAULT_PRESIDING_JUDGE,
    filedOn: new Date().toISOString().slice(0, 10),
    scheduledTimezone: DEFAULT_DOCKET_TIMEZONE,
    summaryMarkdown: buildSummary(detail, facts, classification),
    publicNotesMarkdown: "",
    privateNotesMarkdown,
    linkedServiceRequestId: detail.id,
    linkedPrivateTicketChannelId: detail.discordTicketChannelId ?? undefined,
    linkedPetitionUrl: detail.documentUrl ?? undefined,
    isPublic: false,
    isArchived: false
  };
  return {
    input,
    source: {
      requestId: detail.id,
      requestNumber: detail.requestNumber,
      requestType: detail.requestType,
      generatedAt: new Date().toISOString(),
      generator: "rules",
      model: null,
      fallbackReason: null
    },
    extracted: {
      arrestReportNumber: facts.arrestReportNumber,
      defendantName: facts.defendantName,
      defendantCitizenId: facts.defendantCitizenId,
      allegedCharges: facts.allegedCharges,
      arrestingAgencyOfficer: facts.arrestingAgencyOfficer,
      evidenceLink: facts.evidenceLink
    },
    transcript,
    warning: "Generated draft. Review and edit before posting.",
    publicBodyIncludesTranscriptLink: false,
    ai: {
      used: false,
      model: null,
      confidence: null,
      needsStaffReview: [],
      failure: null
    }
  };
}

async function buildGeminiEnhancedDraft(env: Env, detail: ServiceRequestDetail, rulesDraft: DocketDraftResponse, model: string): Promise<DocketDraftResponse> {
  const facts = extractRequestFacts(detail);
  const context = geminiRequestContext(detail, facts, rulesDraft);
  const response = await callGemini(env, model, context);
  const parsed = parseGeminiJson(response);
  const aiDraft = validateGeminiDraft(parsed, detail, facts, rulesDraft);
  return {
    ...rulesDraft,
    input: {
      ...rulesDraft.input,
      title: aiDraft.title,
      caseType: aiDraft.caseType,
      proceedingType: aiDraft.proceedingType,
      status: aiDraft.status,
      plaintiff: aiDraft.plaintiff ?? rulesDraft.input.plaintiff,
      defendant: aiDraft.defendant ?? rulesDraft.input.defendant,
      individualsInvolved: peopleList([
        rulesDraft.input.judgeName,
        aiDraft.plaintiff,
        aiDraft.defendant,
        facts.defendantCitizenId ? `Citizen ID ${facts.defendantCitizenId}` : null,
        facts.arrestingAgencyOfficer,
        detail.requesterDiscordUsername
      ]),
      judgeName: aiDraft.presidingJudge || rulesDraft.input.judgeName || DEFAULT_PRESIDING_JUDGE,
      summaryMarkdown: aiDraft.body,
      publicNotesMarkdown: "",
      privateNotesMarkdown: appendReviewNotes(rulesDraft.input.privateNotesMarkdown ?? "", aiDraft.needsStaffReview),
      isPublic: false
    },
    source: {
      ...rulesDraft.source,
      generator: "gemini",
      model,
      fallbackReason: null,
      generatedAt: new Date().toISOString()
    },
    warning: "AI-assisted draft. Review and edit before posting. Do not publish unsupported facts.",
    publicBodyIncludesTranscriptLink: false,
    ai: {
      used: true,
      model,
      confidence: aiDraft.confidence,
      needsStaffReview: aiDraft.needsStaffReview,
      failure: null
    }
  };
}

function geminiModel(env: Env): string {
  return cleanField(env.GEMINI_MODEL, 120) || DEFAULT_GEMINI_DOCKET_MODEL;
}

function geminiRequestContext(detail: ServiceRequestDetail, facts: RequestFacts, rulesDraft: DocketDraftResponse) {
  return {
    request: {
      id: detail.id,
      requestNumber: detail.requestNumber,
      requestType: detail.requestType,
      status: detail.status,
      shortTitle: detail.shortTitle,
      requesterDiscordUsername: detail.requesterDiscordUsername,
      assignedJudgeDisplayName: detail.assignedJudgeDisplayName,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt
    },
    extractedFacts: {
      arrestReportNumber: facts.arrestReportNumber,
      defendantName: facts.defendantName,
      defendantCitizenId: facts.defendantCitizenId,
      allegedCharges: facts.allegedCharges,
      briefSummary: facts.briefSummary,
      arrestingAgencyOfficer: facts.arrestingAgencyOfficer,
      schedulingNotes: facts.schedulingNotes,
      evidenceLink: facts.evidenceLink,
      publicSummary: facts.publicSummary,
      privateDetails: facts.privateDetails,
      plaintiff: facts.plaintiff,
      respondent: facts.respondent,
      preferredContactMethod: facts.preferredContactMethod
    },
    payloadFields: sanitizePayloadForAi(detail.payload),
    events: detail.events.slice(-25).map((event) => ({
      eventType: event.eventType,
      message: cleanField(event.message, 600),
      createdAt: event.createdAt,
      metadata: sanitizeEventMetadataForAi(event.metadata)
    })),
    ticketMetadata: {
      publicChannelId: detail.discordPublicChannelId,
      privateTicketChannelId: detail.discordTicketChannelId,
      privateTicketMessageId: detail.discordTicketMessageId,
      privateTicketTranscriptId: detail.discordTicketTranscriptId,
      discordTicketStatus: detail.discordTicketStatus
    },
    closedTicketTranscript: rulesDraft.transcript
      ? {
          available: true,
          id: rulesDraft.transcript.id,
          url: rulesDraft.transcript.discordJumpUrl || rulesDraft.transcript.portalUrl,
          visibility: rulesDraft.transcript.visibility,
          publiclyIncludedByDefault: false
        }
      : { available: false, note: "No closed-ticket transcript is available yet.", publiclyIncludedByDefault: false },
    rulesFallbackDraft: {
      title: rulesDraft.input.title,
      body: rulesDraft.input.summaryMarkdown,
      caseType: CASE_TYPE_LABELS[rulesDraft.input.caseType],
      proceeding: PROCEEDING_LABELS[rulesDraft.input.proceedingType],
      status: statusLabel(rulesDraft.input.status ?? "DRAFT"),
      presidingJudge: rulesDraft.input.judgeName || DEFAULT_PRESIDING_JUDGE,
      scheduledFor: DEFAULT_SCHEDULED_FOR
    },
    styleRules: [
      "Return strict JSON only.",
      "Write one formal court docket paragraph in body; do not use bullets or Discord recap language.",
      "Use only the provided facts. Do not invent charges, evidence, plea terms, warrant numbers, hearing dates, or transcript links.",
      "Use neutral phrases such as The Court received, the State submitted, probable cause was preliminarily established, and subject to clarification.",
      "Do not state guilt unless the provided request/events clearly show a guilty plea or final disposition.",
      "Closed ticket transcript links are staff/internal metadata by default and must not be inserted into the public body."
    ]
  };
}

async function callGemini(env: Env, model: string, context: unknown): Promise<unknown> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiDraftFailure("Gemini API key is not configured.", { errorType: "missing_key", status: null, timeout: false });
  }
  const modelResource = model.startsWith("models/") ? model : `models/${model}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelResource}:generateContent`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: geminiSystemInstruction() }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(context) }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.15,
          maxOutputTokens: 1800
        }
      })
    });
    if (!response.ok) {
      const snippet = await responseTextSnippet(response);
      const errorType = response.status === 429 ? "rate_limited" : `http_${response.status}`;
      throw new GeminiDraftFailure(`Gemini returned ${response.status}${snippet ? `: ${snippet}` : ""}`, { errorType, status: response.status, timeout: false });
    }
    return await response.json();
  } catch (cause) {
    if (cause instanceof GeminiDraftFailure) throw cause;
    if (isAbortError(cause)) {
      throw new GeminiDraftFailure("Gemini request timed out.", { errorType: "timeout", status: null, timeout: true });
    }
    throw new GeminiDraftFailure("Gemini request failed.", { errorType: "network_error", status: null, timeout: false });
  } finally {
    clearTimeout(timeoutId);
  }
}

function geminiSystemInstruction(): string {
  return [
    "You draft Miami Stories Department of Justice docket entries for authorized staff review.",
    "Return only valid JSON with these keys: title, body, caseType, proceeding, status, presidingJudge, scheduledFor, closedTicketTranscript, relatedRequestNumber, incidentNumber, mainParty, charges, confidence, needsStaffReview.",
    "The body must be one formal docket paragraph. Do not use markdown, bullets, headings, Discord recap phrasing, or police-report style narration.",
    "Use only facts in the supplied request. If a necessary fact is missing, use a bracketed placeholder such as [defendant name needed], [incident number needed], [charges need staff review], [warrant number needed], or [sentence/fine needs staff review].",
    "For initial criminal filings, use preliminary probable-cause review language and state that the entry is not a hearing, arraignment, or trial notice.",
    "Use negotiated guilty plea, sentencing, dismissal, warrant, or failure-to-appear language only when the supplied request or events clearly support it.",
    "Closed ticket transcript links are staff/internal metadata by default. Do not include transcript links in body unless the supplied data says public inclusion is already authorized.",
    `Default Presiding Judge to ${DEFAULT_PRESIDING_JUDGE}. Default Scheduled For to ${DEFAULT_SCHEDULED_FOR}.`
  ].join(" ");
}

function parseGeminiJson(response: unknown): GeminiDocketJson {
  const responseObject = asRecord(response);
  const candidates = Array.isArray(responseObject.candidates) ? responseObject.candidates : [];
  const candidate = asRecord(candidates[0]);
  const finishReason = cleanField(candidate.finishReason, 80);
  if (finishReason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/i.test(finishReason)) {
    throw new GeminiDraftFailure(`Gemini response blocked with finish reason ${finishReason}.`, { errorType: "safety_block", status: null, timeout: false });
  }
  const content = asRecord(candidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => cleanField(asRecord(part).text, 4000))
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .trim();
  if (!text) {
    throw new GeminiDraftFailure("Gemini response did not include JSON text.", { errorType: "empty_response", status: null, timeout: false });
  }
  try {
    const parsed = JSON.parse(stripJsonFence(text));
    if (!isRecord(parsed)) throw new Error("not_object");
    return parsed as GeminiDocketJson;
  } catch {
    throw new GeminiDraftFailure("Gemini returned malformed JSON.", { errorType: "malformed_json", status: null, timeout: false });
  }
}

function validateGeminiDraft(parsed: GeminiDocketJson, detail: ServiceRequestDetail, facts: RequestFacts, rulesDraft: DocketDraftResponse): ValidatedAiDocketDraft {
  const title = stripDocketPrefix(cleanField(parsed.title, 320) || "");
  const body = cleanDocketBody(parsed.body);
  const caseType = docketCaseTypeFromLabel(parsed.caseType);
  const proceedingType = docketProceedingFromLabel(parsed.proceeding);
  const status = docketStatusFromLabel(parsed.status);
  if (!title) throw new GeminiDraftFailure("Gemini draft was missing a title.", { errorType: "invalid_response", status: null, timeout: false });
  if (!body) throw new GeminiDraftFailure("Gemini draft was missing a body.", { errorType: "invalid_response", status: null, timeout: false });
  if (!caseType || !proceedingType || !status) {
    throw new GeminiDraftFailure("Gemini draft used an unsupported docket metadata value.", { errorType: "invalid_metadata", status: null, timeout: false });
  }
  assertGeminiDraftIsSupported(parsed, `${title} ${body}`, detail, facts, rulesDraft);
  const confidence = confidenceValue(parsed.confidence);
  const reviewNotes = reviewNotesValue(parsed.needsStaffReview);
  const scheduledFor = cleanField(parsed.scheduledFor, 160);
  if (scheduledFor && scheduledFor !== DEFAULT_SCHEDULED_FOR && !facts.schedulingNotes) {
    reviewNotes.push(`Review unsupported scheduled-for value before posting: ${scheduledFor}`);
  }
  return {
    title,
    body,
    caseType,
    proceedingType,
    status,
    plaintiff: caseType === "CRIMINAL" || caseType === "WARRANT" ? "State of Miami Stories" : facts.plaintiff,
    defendant: cleanField(parsed.mainParty, 120) || draftDefendant(facts),
    presidingJudge: cleanField(parsed.presidingJudge, 160) || DEFAULT_PRESIDING_JUDGE,
    confidence,
    needsStaffReview: reviewNotes
  };
}

function assertGeminiDraftIsSupported(
  parsed: GeminiDocketJson,
  combinedOutput: string,
  detail: ServiceRequestDetail,
  facts: RequestFacts,
  rulesDraft: DocketDraftResponse
): void {
  const corpus = facts.allText.toLowerCase();
  if (!/guilty plea|plea agreement|negotiated final|final disposition|sentenc|resolved by plea/.test(corpus) && /\b(guilty|convicted|sentenced|admitted|confessed|proved|confirmed guilt)\b/i.test(combinedOutput)) {
    throw new GeminiDraftFailure("Gemini draft used guilt or final-disposition language unsupported by the request.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  if (!/bench warrant|failure to appear|\bfta\b|warrant issued/.test(corpus) && /\b(bench warrant|failure to appear|FTA)\b/i.test(combinedOutput)) {
    throw new GeminiDraftFailure("Gemini draft used warrant or failure-to-appear language unsupported by the request.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  if (!/dismiss|drop(?:ped)? charges|charges dropped|declin(?:ed|ation)/.test(corpus) && /\b(dismissed|dismissal|dropped all charges|drop all charges)\b/i.test(combinedOutput)) {
    throw new GeminiDraftFailure("Gemini draft used dismissal language unsupported by the request.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  if (rulesDraft.transcript && /discord\.com\/channels|\/dashboard\/transcripts\//i.test(combinedOutput)) {
    throw new GeminiDraftFailure("Gemini draft tried to include a staff/internal transcript link in the public body.", { errorType: "private_link_in_body", status: null, timeout: false });
  }
  const incidentFromAi = nonPlaceholder(cleanField(parsed.incidentNumber, 80));
  const outputIncidents = [...combinedOutput.matchAll(/Incident\s*#\s*([A-Z0-9-]{2,40})/gi)].map((match) => match[1]);
  const expectedIncident = normalizeLoose(facts.arrestReportNumber);
  if (expectedIncident) {
    if (incidentFromAi && normalizeLoose(incidentFromAi) !== expectedIncident) {
      throw new GeminiDraftFailure("Gemini draft changed the incident number.", { errorType: "unsupported_fact", status: null, timeout: false });
    }
    if (outputIncidents.some((incident) => normalizeLoose(incident) !== expectedIncident)) {
      throw new GeminiDraftFailure("Gemini draft included a mismatched incident number.", { errorType: "unsupported_fact", status: null, timeout: false });
    }
  } else if (incidentFromAi || outputIncidents.length > 0) {
    throw new GeminiDraftFailure("Gemini draft invented an incident number.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  const charges = Array.isArray(parsed.charges) ? parsed.charges.map((charge) => cleanField(charge, 160)).filter((charge): charge is string => Boolean(charge)) : [];
  if (charges.some((charge) => !chargeSupportedByRequest(charge, facts))) {
    throw new GeminiDraftFailure("Gemini draft included charges unsupported by the request.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  const transcript = asRecord(parsed.closedTicketTranscript);
  const transcriptUrl = nonPlaceholder(cleanField(transcript.url, 600));
  const transcriptId = nonPlaceholder(cleanField(transcript.id, 160));
  if ((transcriptUrl || transcriptId) && !rulesDraft.transcript) {
    throw new GeminiDraftFailure("Gemini draft invented transcript metadata.", { errorType: "unsupported_fact", status: null, timeout: false });
  }
  if (transcriptUrl && rulesDraft.transcript) {
    const allowed = [rulesDraft.transcript.discordJumpUrl, rulesDraft.transcript.portalUrl].filter(Boolean);
    if (!allowed.includes(transcriptUrl)) {
      throw new GeminiDraftFailure("Gemini draft changed the transcript link.", { errorType: "unsupported_fact", status: null, timeout: false });
    }
  }
  if (detail.requestNumber && !combinedOutput.includes(detail.requestNumber)) {
    throw new GeminiDraftFailure("Gemini draft omitted the source request number.", { errorType: "invalid_response", status: null, timeout: false });
  }
}

function cleanDocketBody(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (/^\s*(?:[-*]|\d+[.)])\s+/m.test(raw)) {
    throw new GeminiDraftFailure("Gemini draft used bullet or numbered notes.", { errorType: "invalid_body_style", status: null, timeout: false });
  }
  return normalizeWhitespace(raw).slice(0, 3000);
}

function docketCaseTypeFromLabel(value: unknown): DocketCaseType | null {
  const key = canonicalDocketKey(value);
  const aliases: Record<string, DocketCaseType> = {
    CR: "CRIMINAL",
    CRIMINAL: "CRIMINAL",
    CV: "CIVIL",
    CIVIL: "CIVIL",
    ADMINISTRATIVE: "ADMINISTRATIVE",
    WARRANT: "WARRANT",
    SUBPOENA: "SUBPOENA",
    EXPUNGEMENT: "EXPUNGEMENT",
    OTHER: "OTHER"
  };
  if (aliases[key]) return aliases[key];
  for (const [caseType, label] of Object.entries(CASE_TYPE_LABELS) as Array<[DocketCaseType, string]>) {
    if (canonicalDocketKey(label) === key || canonicalDocketKey(caseType) === key) return caseType;
  }
  return null;
}

function docketProceedingFromLabel(value: unknown): DocketProceedingType | null {
  const key = canonicalDocketKey(value);
  const aliases: Record<string, DocketProceedingType> = {
    PRELIMINARY_PROBABLE_CAUSE_REVIEW: "PROBABLE_CAUSE_REVIEW",
    PROBABLE_CAUSE_REVIEW: "PROBABLE_CAUSE_REVIEW",
    SENTENCING: "SENTENCING",
    WARRANT_REVIEW: "WARRANT_REVIEW",
    ADMINISTRATIVE_REVIEW: "ADMINISTRATIVE_REVIEW",
    TRIAL: "TRIAL",
    CIVIL_REVIEW: "CIVIL_CASE_REVIEW",
    CIVIL_CASE_REVIEW: "CIVIL_CASE_REVIEW",
    EXPUNGEMENT_REVIEW: "EXPUNGEMENT_HEARING",
    EXPUNGEMENT_HEARING: "EXPUNGEMENT_HEARING",
    SUBPOENA_REVIEW: "SUBPOENA_REVIEW",
    SEARCH_SEIZURE_REVIEW: "SEARCH_SEIZURE_REVIEW",
    SEARCH_AND_SEIZURE_REVIEW: "SEARCH_SEIZURE_REVIEW"
  };
  if (aliases[key]) return aliases[key];
  for (const [type, label] of Object.entries(PROCEEDING_LABELS) as Array<[DocketProceedingType, string]>) {
    if (canonicalDocketKey(label) === key || canonicalDocketKey(type) === key) return type;
  }
  return null;
}

function docketStatusFromLabel(value: unknown): DocketStatus | null {
  const key = canonicalDocketKey(value);
  const aliases: Record<string, DocketStatus> = {
    IN_REVIEW: "IN_REVIEW",
    PENDING: "PENDING",
    RESOLVED: "RESOLVED",
    DISMISSED: "DISMISSED",
    CLOSED: "CLOSED",
    SCHEDULED: "SCHEDULED"
  };
  return aliases[key] ?? null;
}

function canonicalDocketKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function confidenceValue(value: unknown): "low" | "medium" | "high" {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "low" || text === "medium" || text === "high" ? text : "medium";
}

function reviewNotesValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanField(item, 240)).filter((item): item is string => Boolean(item)).slice(0, 8);
}

function appendReviewNotes(privateNotes: string, notes: string[]): string {
  if (notes.length === 0) return privateNotes;
  return [privateNotes.trim(), "AI needs staff review:", ...notes.map((note) => `- ${note}`)].filter(Boolean).join("\n");
}

function stripDocketPrefix(title: string): string {
  return title.replace(/^[A-Z]{2,5}-\d{4}-\d{4}\s*[-–—]\s*/i, "").trim();
}

function nonPlaceholder(value: string | null): string | null {
  if (!value || /^\[[^\]]+\]$/.test(value.trim())) return null;
  return value;
}

function sanitizePayloadForAi(payload: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|password|cookie|session|authorization/i.test(key)) continue;
    const text = cleanField(value, 1200);
    if (text) sanitized[key] = text;
  }
  return sanitized;
}

function sanitizeEventMetadataForAi(metadata: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const allowed = new Set([
    "request_id",
    "request_number",
    "channel_id",
    "message_id",
    "responseSpaceId",
    "responseSpaceType",
    "responseThreadId",
    "responseChannelId",
    "transcript_id",
    "transcriptId",
    "archive_channel_id",
    "archive_message_id",
    "reason",
    "status"
  ]);
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.has(key) || /token|secret|password|cookie|session|authorization/i.test(key)) continue;
    if (typeof value === "string") result[key] = cleanField(value, 300);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

function chargeSupportedByRequest(charge: string, facts: RequestFacts): boolean {
  if (/\[[^\]]+\]/.test(charge)) return true;
  const source = normalizeLoose([facts.allegedCharges, facts.allText].filter(Boolean).join(" "));
  const normalizedCharge = normalizeLoose(charge);
  if (!normalizedCharge || source.includes(normalizedCharge)) return true;
  const words = normalizedCharge.split(" ").filter((word) => word.length > 2);
  return words.length > 0 && words.every((word) => source.includes(word));
}

function normalizeLoose(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

async function responseTextSnippet(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function geminiFailureDetails(cause: unknown): GeminiFailureDetails {
  if (cause instanceof GeminiDraftFailure) {
    const parts = [`Gemini ${cause.details.errorType}`];
    if (cause.details.status) parts.push(`status ${cause.details.status}`);
    if (cause.details.timeout) parts.push("timeout yes");
    return {
      message: `${parts.join(" ")}; rules-based fallback used.`,
      errorType: cause.details.errorType,
      status: cause.details.status,
      timeout: cause.details.timeout
    };
  }
  return {
    message: "Gemini unavailable; rules-based fallback used.",
    errorType: "unknown",
    status: null,
    timeout: false
  };
}

function extractRequestFacts(detail: ServiceRequestDetail): RequestFacts {
  const payload = detail.payload;
  const allText = requestCorpus(detail);
  return {
    arrestReportNumber: cleanField(payloadField(payload, ["arrestReportNumber", "arrestReport", "reportNumber", "incidentNumber", "incident", "incidentNumberOrReport"]) || regexValue(allText, /\b(?:incident|arrest report|report)\s*(?:number|#|no\.?)?\s*[:#-]?\s*([A-Z0-9-]{2,32})/i)),
    defendantName: cleanField(payloadField(payload, ["defendantName", "defendantFullName", "characterFullName", "mainParty", "target", "suspectFullName"]) || regexValue(allText, /\b(?:defendant|suspect|target)(?:'s)?\s+(?:full\s+)?name\s*[:#-]?\s*([A-Z][A-Za-z0-9 .,'-]{1,80})/i)),
    defendantCitizenId: cleanField(payloadField(payload, ["defendantCitizenId", "citizenId", "cid", "defendantCid", "citizenID"]) || regexValue(allText, /\b(?:citizen\s*id|cid)\s*[:#-]?\s*([A-Z0-9-]{2,32})/i)),
    allegedCharges: cleanField(payloadField(payload, ["allegedCharges", "charges", "chargesApplied", "criminalCharges", "requestedCharges"]) || regexValue(allText, /\b(?:charges?|charges applied|alleged charges)\s*[:#-]?\s*([A-Za-z0-9 ,;/'()-]{3,220})/i)),
    briefSummary: cleanField(payloadField(payload, ["briefSummary", "briefDescription", "summary", "publicSummary", "incidentSummary", "narrative"]), 1200),
    arrestingAgencyOfficer: cleanField(payloadField(payload, ["arrestingAgencyOfficer", "officer", "officerName", "arrestingOfficer", "submittingOfficer"]) || regexValue(allText, /\b(?:officer|arresting officer)(?:'s)?\s+(?:full\s+)?name\s*[:#-]?\s*([A-Z][A-Za-z0-9 .,'-]{1,80})/i)),
    schedulingNotes: cleanField(payloadField(payload, ["schedulingNotes", "availability", "hearingNotes", "courtSchedulingNotes"]), 600),
    evidenceLink: cleanField(payloadField(payload, ["evidenceLink", "evidenceUrl", "evidence", "attachmentUrl"]) || regexValue(allText, /(https?:\/\/\S+)/i), 1000),
    publicSummary: cleanField(payloadField(payload, ["publicSummary", "summary"]), 600) || cleanField(detail.shortTitle, 600),
    privateDetails: cleanField(payloadField(payload, ["briefDescription", "privateDetails", "privateCaseDetails", "caseDetails"]), 1200),
    plaintiff: cleanField(payloadField(payload, ["plaintiffFullName", "plaintiff", "petitionerName", "submittingParty", "applicantFullName"])),
    respondent: cleanField(payloadField(payload, ["respondentName", "respondent", "opposingParty", "defendantName"])),
    preferredContactMethod: cleanField(payloadField(payload, ["preferredContactMethod", "requesterContact", "contactMethod"]), 300),
    allText
  };
}

function classifyRequest(detail: ServiceRequestDetail, facts: RequestFacts): DraftClassification {
  const suggestion = REQUEST_DOCKET_SUGGESTIONS[detail.requestType] ?? REQUEST_DOCKET_SUGGESTIONS.GENERAL;
  let caseType = suggestion.caseType;
  let proceedingType = suggestion.proceedingType;
  const text = facts.allText.toLowerCase();
  const repText = [
    payloadField(detail.payload, ["representationType", "representationSubtype", "preferredRepresentation"]),
    facts.allegedCharges
  ].join(" ").toLowerCase();
  if (detail.requestType === "LAWYER") {
    if (repText.includes("civil")) {
      caseType = "CIVIL";
      proceedingType = "CIVIL_CASE_REVIEW";
    } else if (repText.includes("expungement")) {
      caseType = "EXPUNGEMENT";
      proceedingType = "EXPUNGEMENT_HEARING";
    } else if (repText.includes("subpoena")) {
      caseType = "SUBPOENA";
      proceedingType = "SUBPOENA_REVIEW";
    } else if (repText.includes("warrant") || repText.includes("evidence") || repText.includes("criminal") || facts.allegedCharges) {
      caseType = "CRIMINAL";
      proceedingType = "PROBABLE_CAUSE_REVIEW";
    }
  }
  if (detail.requestType === "CRIMINAL_TRIAL") {
    caseType = "CRIMINAL";
    proceedingType = "PROBABLE_CAUSE_REVIEW";
  }
  if (detail.requestType === "SEARCH_SEIZURE_WARRANT") proceedingType = "SEARCH_SEIZURE_REVIEW";
  if (detail.requestType === "ARREST_WARRANT") proceedingType = "WARRANT_REVIEW";
  if (/bench warrant|failure to appear|\bfta\b|warrant issued/.test(text)) {
    return { caseType: caseType === "OTHER" ? "WARRANT" : caseType, proceedingType: "WARRANT_REVIEW", status: "PENDING", summaryKind: "warrant" };
  }
  if (/guilty plea|plea agreement|negotiated final|final disposition|sentenc/.test(text)) {
    return { caseType, proceedingType: "SENTENCING", status: detail.status === "CLOSED" ? "RESOLVED" : "IN_REVIEW", summaryKind: "final_disposition" };
  }
  if (/ready to proceed|pending defendant|defendant contact|awaiting defendant|pending participation/.test(text)) {
    return { caseType, proceedingType: "ADMINISTRATIVE_REVIEW", status: "PENDING", summaryKind: "pending_contact" };
  }
  if (detail.status === "NEEDS_INFO") return { caseType, proceedingType, status: "IN_REVIEW", summaryKind: caseType === "CRIMINAL" ? "preliminary" : "general" };
  return { caseType, proceedingType, status: detail.status === "CLOSED" ? "CLOSED" : "IN_REVIEW", summaryKind: caseType === "CRIMINAL" ? "preliminary" : "general" };
}

function buildSummary(detail: ServiceRequestDetail, facts: RequestFacts, classification: DraftClassification): string {
  const request = detail.requestNumber || "[request number needed]";
  const incident = facts.arrestReportNumber ? `Incident #${facts.arrestReportNumber}` : "Incident #[incident number needed]";
  const incidentClause = ` arising from ${incident}`;
  const charges = facts.allegedCharges ? formatCharges(facts.allegedCharges) : "[charges need staff review]";
  const defendant = facts.defendantName ? ` involving ${facts.defendantName}` : "";
  const evidence = evidenceClause(facts);
  let body: string;
  if (classification.summaryKind === "final_disposition") {
    body = `This docket is updated from preliminary probable-cause review to negotiated final disposition. The Court previously reviewed ${request}${incidentClause}${defendant} and found probable cause supporting ${charges}, subject to the record then before the Court. The submitted materials indicate the matter has moved toward plea, sentencing, or other final disposition review. The negotiated disposition remains subject to [sentence/fine needs staff review], staff verification, and judicial confirmation before publication.`;
  } else if (classification.summaryKind === "warrant") {
    const warrantNumber = regexValue(facts.allText, /\b(?:bench\s+)?warrant\s*(?:number|#|no\.?)?\s*[:#-]?\s*([A-Z0-9-]{2,40})/i);
    body = `The Court previously completed or is reviewing preliminary probable-cause materials for ${request}${incidentClause}${defendant}. The submitted record indicates a failure-to-appear or bench-warrant issue related to ${charges}. ${warrantNumber ? `A bench warrant, ${warrantNumber}, is referenced in the request materials.` : "Any bench warrant number remains subject to [warrant number needed] and staff confirmation."} The underlying matter remains open pending execution, defendant contact, or further proceedings.`;
  } else if (classification.summaryKind === "pending_contact") {
    body = `The Court previously completed or is reviewing preliminary probable-cause materials for ${request}${incidentClause}${defendant}. Probable cause was preliminarily established for ${charges}, subject to staff verification and judicial confirmation. The submitted record indicates the matter is ready to proceed but remains pending defendant participation, contact, or scheduling, and any proposed next setting remains subject to [scheduled date needed].`;
  } else if (classification.summaryKind === "preliminary") {
    body = `The Court received ${request} for preliminary probable-cause review${incidentClause}${defendant}. The State submitted ${evidence} and alleged ${charges}. Based on the submitted request materials, probable cause was preliminarily established subject to charging clarification, evidence review, and judicial confirmation. This entry records review of the State's initial filing and is not a notice of a hearing, arraignment, or trial date.`;
  } else {
    body = `The Court received ${request} for ${PROCEEDING_LABELS[classification.proceedingType].toLowerCase()}${defendant}. The submitted materials identify ${facts.publicSummary || facts.privateDetails || detail.shortTitle || "[matter type needed]"}. This entry records intake and preliminary review only, and the matter remains subject to staff verification, judicial review, and scheduling confirmation.`;
  }
  return body;
}

function buildPrivateNotes(detail: ServiceRequestDetail, facts: RequestFacts, transcript: DocketDraftTranscriptInfo | null): string {
  const lines = [
    "Generated docket draft from submitted request/ticket contents. Review and edit before posting. Do not publish unsupported facts.",
    `Related request: ${detail.requestNumber} (${detail.id})`,
    facts.arrestReportNumber ? `Incident/arrest report number: ${facts.arrestReportNumber}` : null,
    facts.defendantCitizenId ? `Defendant Citizen ID: ${facts.defendantCitizenId}` : null,
    facts.allegedCharges ? `Alleged charges: ${facts.allegedCharges}` : null,
    facts.arrestingAgencyOfficer ? `Arresting agency/officer: ${facts.arrestingAgencyOfficer}` : null,
    facts.evidenceLink ? `Evidence link: ${facts.evidenceLink}` : null,
    facts.preferredContactMethod ? `Preferred contact method: ${facts.preferredContactMethod}` : null,
    transcript ? `Closed ticket transcript: ${transcript.discordJumpUrl || transcript.portalUrl || transcript.id}` : "Closed ticket transcript: No closed-ticket transcript is available yet.",
    transcript?.id ? `Transcript ID: ${transcript.id}` : null,
    transcript ? "Transcript visibility: staff/internal. Review transcript visibility before including this in a public docket entry." : null
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

async function findRequestTranscript(env: Env, detail: ServiceRequestDetail): Promise<DocketDraftTranscriptInfo | null> {
  const ids = transcriptCandidateIds(detail);
  if (env.DB) {
    for (const id of ids) {
      const row = await env.DB.prepare(
        `SELECT id, source_type as sourceType, source_id as sourceId, source_number as sourceNumber,
          discord_channel_id as discordChannelId, archive_channel_id as archiveChannelId,
          archive_message_id as archiveMessageId, metadata_json as metadataJson, created_at as createdAt
         FROM discord_ticket_transcripts WHERE id = ? LIMIT 1`
      ).bind(id).first<TranscriptRow>();
      if (row) return transcriptInfo(env, row);
    }
    const row = await env.DB.prepare(
      `SELECT id, source_type as sourceType, source_id as sourceId, source_number as sourceNumber,
        discord_channel_id as discordChannelId, archive_channel_id as archiveChannelId,
        archive_message_id as archiveMessageId, metadata_json as metadataJson, created_at as createdAt
       FROM discord_ticket_transcripts
       WHERE source_id = ? OR source_number = ?
          OR json_extract(metadata_json, '$.requestId') = ?
          OR json_extract(metadata_json, '$.requestNumber') = ?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(detail.id, detail.requestNumber, detail.id, detail.requestNumber).first<TranscriptRow>();
    if (row) return transcriptInfo(env, row);
  }
  const fallbackId = ids[0];
  return fallbackId ? transcriptInfo(env, { id: fallbackId, sourceType: "request", sourceId: detail.id, sourceNumber: detail.requestNumber, discordChannelId: null, archiveChannelId: null, archiveMessageId: null, metadataJson: "{}", createdAt: "" }) : null;
}

function transcriptCandidateIds(detail: ServiceRequestDetail): string[] {
  const ids = new Set<string>();
  if (detail.discordTicketTranscriptId) ids.add(detail.discordTicketTranscriptId);
  for (const event of detail.events) {
    for (const key of ["transcript_id", "transcriptId", "discordTicketTranscriptId"]) {
      const value = event.metadata[key];
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }
  return [...ids];
}

function transcriptInfo(env: Env, row: TranscriptRow): DocketDraftTranscriptInfo {
  const archiveChannelId = validDiscordId(row.archiveChannelId) ? row.archiveChannelId : null;
  const archiveMessageId = validDiscordId(row.archiveMessageId) ? row.archiveMessageId : null;
  const discordJumpUrl = archiveChannelId && archiveMessageId && env.DISCORD_GUILD_ID
    ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${archiveChannelId}/${archiveMessageId}`
    : null;
  const portalUrl = portalUrlFor(env, `/dashboard/transcripts/${encodeURIComponent(row.id)}`);
  const visibility = archiveChannelId ? "STAFF_INTERNAL" : "UNKNOWN";
  return {
    id: row.id,
    portalUrl,
    discordJumpUrl,
    archiveChannelId,
    archiveMessageId,
    visibility: archiveChannelId === KNOWN_TRANSCRIPT_ARCHIVE_CHANNEL_ID || archiveChannelId ? visibility : "UNKNOWN",
    note: discordJumpUrl || portalUrl || row.id
  };
}

function draftTitle(detail: ServiceRequestDetail, facts: RequestFacts, classification: DraftClassification): string {
  const { caseType, summaryKind } = classification;
  const defendant = draftDefendant(facts) || "[defendant name needed]";
  const request = detail.requestNumber || "[request number needed]";
  if (caseType === "CRIMINAL" || caseType === "WARRANT") {
    const incident = facts.arrestReportNumber || "[incident number needed]";
    if (summaryKind === "final_disposition") return `State of Miami Stories v. ${defendant} — Negotiated Guilty Plea & Final Disposition — Incident #${incident} / ${request}`;
    if (summaryKind === "warrant") return `State of Miami Stories v. ${defendant} — Active Bench Warrant / Failure to Appear — Incident #${incident} / ${request}`;
    if (summaryKind === "pending_contact") return `State of Miami Stories v. ${defendant} — Pending Defendant Contact / Scheduling Compliance — Incident #${incident} / ${request}`;
    return `State of Miami Stories v. ${defendant} — Incident #${incident} / ${request}`;
  }
  if (caseType === "CIVIL") {
    return `${facts.plaintiff || "[plaintiff needed]"} v. ${facts.respondent || defendant || "[defendant needed]"} — ${facts.publicSummary || "[matter type needed]"} / ${request}`;
  }
  return `${detail.shortTitle || detail.requestType.replaceAll("_", " ")} — ${request}`;
}

function draftPlaintiff(detail: ServiceRequestDetail, facts: RequestFacts, caseType: DocketCaseType): string | null {
  if (caseType === "CRIMINAL" || caseType === "WARRANT" || detail.requestType === "CRIMINAL_TRIAL") return "State of Miami Stories";
  return facts.plaintiff;
}

function draftDefendant(facts: RequestFacts): string | null {
  return facts.defendantName || facts.respondent;
}

function evidenceClause(facts: RequestFacts): string {
  const pieces = [
    facts.briefSummary || facts.privateDetails ? "an incident narrative" : null,
    facts.evidenceLink ? "a supporting evidence link" : null,
    facts.arrestingAgencyOfficer ? `officer submission from ${facts.arrestingAgencyOfficer}` : null
  ].filter(Boolean);
  return pieces.length ? pieces.join(", ") : "the initial filing and available supporting materials";
}

function formatCharges(value: string): string {
  const charges = value.split(/\r?\n|;|,/).map((item) => item.trim()).filter(Boolean);
  if (charges.length === 0) return value;
  if (charges.length === 1) return charges[0];
  return `${charges.slice(0, -1).join(", ")} and ${charges[charges.length - 1]}`;
}

function payloadField(payload: Record<string, unknown>, keys: string[]): string | null {
  const wanted = keys.map(normalizeKey);
  for (const [key, value] of Object.entries(payload)) {
    const normalized = normalizeKey(key);
    if (!wanted.includes(normalized)) continue;
    const text = valueText(value);
    if (text) return text;
  }
  return null;
}

function requestCorpus(detail: ServiceRequestDetail): string {
  const payloadText = Object.entries(detail.payload).map(([key, value]) => `${key}: ${valueText(value)}`).join("\n");
  const eventText = detail.events.map((event) => `${event.eventType}: ${event.message ?? ""} ${JSON.stringify(event.metadata)}`).join("\n");
  return normalizeWhitespace([detail.requestNumber, detail.requestType, detail.status, detail.shortTitle, payloadText, eventText].filter(Boolean).join("\n")).slice(0, 12000);
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function cleanField(value: unknown, max = 240): string | null {
  const text = normalizeWhitespace(typeof value === "string" ? value : valueText(value));
  return text ? text.slice(0, max).trim() : null;
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/[\u0000-\u001f]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

function regexValue(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

function peopleList(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => cleanField(value, 120)).filter((value): value is string => Boolean(value)))].slice(0, 12);
}

function statusLabel(status: DocketStatus): string {
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function portalUrlFor(env: Env, path: string): string | null {
  const base = env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

function validDiscordId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}
