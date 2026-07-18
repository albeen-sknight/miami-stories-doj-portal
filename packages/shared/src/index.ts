export const RESOURCE_CATEGORIES = [
  "LEGAL_AUTHORITY",
  "DOJ_PROCEDURE",
  "ORGANIZATION_REGULATION",
  "ATTORNEY_TRAINING",
  "TEMPLATES",
  "FAQ"
] as const;

export const SERVICE_REQUEST_TYPES = [
  "LAWYER",
  "CRIMINAL_TRIAL",
  "CIVIL_CASE",
  "SUBPOENA",
  "ARREST_WARRANT",
  "SEARCH_SEIZURE_WARRANT",
  "EXPUNGEMENT",
  "MARRIAGE",
  "DIVORCE",
  "GENERAL"
] as const;

export const SERVICE_REQUEST_STATUSES = [
  "SUBMITTED",
  "RECEIVED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "ASSIGNED",
  "APPROVED",
  "DENIED",
  "SCHEDULED",
  "CLOSED",
  "CANCELLED"
] as const;

export const DISCORD_TICKET_STATUSES = ["NOT_ATTEMPTED", "PENDING", "CREATED", "POSTED", "FAILED"] as const;

export const DOCKET_CASE_TYPES = [
  "CRIMINAL",
  "CIVIL",
  "ADMINISTRATIVE",
  "CONSTITUTIONAL",
  "BAR_DISCIPLINE",
  "WARRANT",
  "SUBPOENA",
  "EXPUNGEMENT",
  "MARRIAGE",
  "DIVORCE",
  "NAME_CHANGE",
  "OTHER"
] as const;

export const DOCKET_PROCEEDING_TYPES = [
  "PROBABLE_CAUSE_REVIEW",
  "CUSTODY_ADVISORY",
  "ARRAIGNMENT",
  "PRELIMINARY_HEARING",
  "WARRANT_REVIEW",
  "SEARCH_SEIZURE_REVIEW",
  "SUBPOENA_REVIEW",
  "CIVIL_CASE_REVIEW",
  "MOTION_HEARING",
  "TRIAL",
  "VERDICT",
  "SENTENCING",
  "EXPUNGEMENT_HEARING",
  "MARRIAGE_CERTIFICATE_REVIEW",
  "DIVORCE_REVIEW",
  "LEGAL_NAME_CHANGE",
  "TEMPORARY_DEFENSE_REPRESENTATION",
  "ADMINISTRATIVE_REVIEW",
  "OTHER"
] as const;

export const DOCKET_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PENDING",
  "IN_REVIEW",
  "RESOLVED",
  "CONTINUED",
  "DISMISSED",
  "APPROVED",
  "DENIED",
  "CLOSED",
  "ARCHIVED"
] as const;

export const DISCORD_SYNC_STATUSES = ["NOT_POSTED", "POSTED", "UPDATED", "FAILED", "REPOST_REQUIRED"] as const;

export const BAR_EXAM_TRACKS = ["DOJ", "DEFENSE"] as const;

export const BAR_EXAM_ATTEMPT_STATUSES = [
  "OPENED",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "PASSED",
  "FAILED",
  "REFERRED_FOR_INTERVIEW",
  "VOIDED",
  "EXPIRED",
  "REOPENED",
  "NEEDS_CANDIDATE_FOLLOW_UP"
] as const;

export const LOGICAL_PERMISSIONS = [
  "PUBLIC",
  "CIVILIAN",
  "BAR_CANDIDATE",
  "BAR_ELIGIBLE",
  "BAR_ACTIVE",
  "PUBLIC_DEFENDER_CERTIFIED",
  "DEFENSE_ATTORNEY",
  "PROSECUTOR",
  "JUDGE",
  "JUSTICE",
  "BAR_ASSOCIATION_MEMBER",
  "CHIEF_JUSTICE",
  "ADMIN",
  "REVIEW_BAR_EXAMS"
] as const;

export const ACTION_PERMISSIONS = [
  "VIEW_DASHBOARD",
  "SUBMIT_SERVICE_REQUEST",
  "VIEW_OWN_REQUESTS",
  "MANAGE_REQUESTS",
  "CREATE_DOCKET",
  "PUBLISH_DOCKET",
  "START_BAR_EXAM",
  "REVIEW_BAR_EXAMS",
  "MANAGE_RESOURCES",
  "MANAGE_FAQ",
  "MANAGE_ATTORNEY_REGISTRY",
  "MANAGE_ROLE_MAPPINGS",
  "MANAGE_DISCORD_CHANNELS",
  "VIEW_AUDIT_LOGS",
  "ADMIN"
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
export type DiscordTicketStatus = (typeof DISCORD_TICKET_STATUSES)[number];
export type DocketCaseType = (typeof DOCKET_CASE_TYPES)[number];
export type DocketProceedingType = (typeof DOCKET_PROCEEDING_TYPES)[number];
export type DocketStatus = (typeof DOCKET_STATUSES)[number];
export type DiscordSyncStatus = (typeof DISCORD_SYNC_STATUSES)[number];
export type BarExamTrack = (typeof BAR_EXAM_TRACKS)[number];
export type BarExamAttemptStatus = (typeof BAR_EXAM_ATTEMPT_STATUSES)[number];
export type LogicalPermission = (typeof LOGICAL_PERMISSIONS)[number];
export type ActionPermission = (typeof ACTION_PERMISSIONS)[number];

export interface ResourceDocument {
  id: string;
  title: string;
  category: ResourceCategory;
  version: string;
  url: string;
  description: string;
  isPublic: boolean;
  updatedAt?: string;
}

export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answerMarkdown: string;
  sortOrder: number;
}

export interface DocketEntry {
  id: string;
  docketNumber: string;
  title: string;
  entryType: string;
  status: string;
  summary: string;
  publishedAt: string;
}

export interface DocketSummary {
  id: string;
  docketNumber: string;
  caseId: string | null;
  title: string;
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status: DocketStatus;
  filedOn: string | null;
  scheduledFor: string | null;
  scheduledTimezone: string | null;
  scheduledDiscordTimestamp: string | null;
  scheduledDiscordRelative: string | null;
  judgeUserId: string | null;
  judgeName: string | null;
  plaintiff: string | null;
  defendant: string | null;
  publicSummary: string;
  publicNotesMarkdown: string | null;
  linkedServiceRequestId: string | null;
  linkedRequestNumber: string | null;
  discordSyncStatus: DiscordSyncStatus;
  discordMessageId: string | null;
  discordChannelId: string | null;
  discordPostedAt: string | null;
  discordUpdatedAt: string | null;
  isPublic: boolean;
  isArchived: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  deletedByDisplayName?: string | null;
  deleteReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocketEvent {
  id: string;
  docketEntryId: string;
  actorUserId: string | null;
  eventType: string;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DocketDetail extends DocketSummary {
  individualsInvolved: string[];
  summaryMarkdown: string;
  privateNotesMarkdown?: string | null;
  linkedPrivateTicketChannelId?: string | null;
  linkedPetitionUrl?: string | null;
  previewText: string;
  events?: DocketEvent[];
}

export interface CreateDocketInput {
  docketNumber?: string;
  title: string;
  caseType: DocketCaseType;
  proceedingType: DocketProceedingType;
  status?: DocketStatus;
  plaintiff?: string;
  defendant?: string;
  individualsInvolved?: string[];
  judgeUserId?: string;
  judgeName?: string;
  filedOn?: string;
  scheduledLocalDate?: string;
  scheduledLocalTime?: string;
  scheduledTimezone?: string;
  summaryMarkdown?: string;
  publicNotesMarkdown?: string;
  privateNotesMarkdown?: string;
  linkedServiceRequestId?: string;
  linkedPrivateTicketChannelId?: string;
  linkedPetitionUrl?: string;
  isPublic?: boolean;
  isArchived?: boolean;
}

export type AttorneyProfileKind = "JUDICIAL_OFFICER" | "ATTORNEY";

export interface AttorneyResponsibility {
  title: string;
  description: string;
}

export interface AttorneyProfile {
  id: string;
  displayName: string;
  profileSlug: string;
  title: string;
  shortTitle: string;
  office: string;
  division: string;
  branch?: string | null;
  affiliations?: string[];
  status: string;
  profileKind: AttorneyProfileKind;
  barNumber?: string | null;
  practiceAreas: string[];
  biographyMarkdown: string;
  experienceMarkdown?: string | null;
  educationMarkdown?: string | null;
  achievementsMarkdown?: string | null;
  professionalHistoryMarkdown?: string | null;
  profileImageUrl?: string | null;
  motto?: string | null;
  quote?: string | null;
  responsibilities: AttorneyResponsibility[];
  sortOrder: number;
  contact?: string;
}

export interface ProfessionalProfileInput {
  displayName: string;
  title: string;
  shortTitle?: string;
  branch?: string;
  office?: string;
  division?: string;
  status?: "draft" | "published" | "inactive";
  profileKind?: AttorneyProfileKind;
  barNumber?: string;
  practiceAreas?: string[];
  biographyMarkdown?: string;
  experienceMarkdown?: string;
  educationMarkdown?: string;
  achievementsMarkdown?: string;
  professionalHistoryMarkdown?: string;
  profileImageUrl?: string;
  motto?: string;
  quote?: string;
  responsibilities?: AttorneyResponsibility[];
  sortOrder?: number;
  contact?: string;
  discordUserId?: string;
}

export interface ProfessionalProfileAdminRecord extends AttorneyProfile {
  discordUserId: string | null;
  portalUserId: string | null;
  ownerDisplayName: string | null;
  ownerDiscordUsername: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyProfessionalProfileResponse {
  eligible: boolean;
  affiliations: string[];
  primaryBranch: string | null;
  profile: ProfessionalProfileAdminRecord | null;
}

export interface LawyerProfileResponse {
  data: AttorneyProfile;
  source: "d1" | "seed";
  viewerCanEdit?: boolean;
  viewerCanManage?: boolean;
}

export interface ProfessionalProfileSyncResponse {
  ok: boolean;
  eligibleMembersFound: number;
  profilesCreated: number;
  profilesUpdated: number;
  profilesMarkedInactive: number;
  roleCachesRefreshed: number;
  skippedMembers: number;
  errors: Array<{ discordUserId?: string; message: string }>;
}

export type CurrentUserResponse =
  | {
      authenticated: false;
      user: null;
      roles: [];
      permissions: [];
      actionPermissions: [];
      isBootstrapAdmin: false;
    }
  | {
      authenticated: true;
      user: {
    id: string;
    discordUsername: string;
    discordGlobalName: string | null;
    displayName: string;
    discordId: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
      };
      roles: Array<{
        discordRoleId: string;
        roleName: string | null;
        cachedAt: string;
      }>;
      permissions: LogicalPermission[];
      actionPermissions: ActionPermission[];
      isBootstrapAdmin: boolean;
    };

export interface ServiceRequestSummary {
  id: string;
  requestNumber: string;
  requestType: ServiceRequestType;
  status: ServiceRequestStatus;
  requesterUserId: string | null;
  requesterDiscordId: string | null;
  requesterDiscordUsername: string | null;
  requesterContact: string | null;
  documentUrl: string | null;
  templateUrl: string | null;
  discordPublicChannelId: string | null;
  discordTicketStatus: DiscordTicketStatus;
  discordTicketChannelId: string | null;
  discordTicketMessageId: string | null;
  discordTicketCategoryId: string | null;
  discordTicketClosedAt?: string | null;
  discordTicketDeletedAt?: string | null;
  discordTicketTranscriptId?: string | null;
  assignedRoleKey: string | null;
  assignedJudgeUserId?: string | null;
  assignedJudgeDisplayName?: string | null;
  assignedJudgeDiscordId?: string | null;
  assignedJudgeAssignedAt?: string | null;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  deletedByDisplayName?: string | null;
  deleteReason?: string | null;
  mainParty: string;
  shortTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestEvent {
  id: string;
  requestId: string;
  actorUserId: string | null;
  eventType: string;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ServiceRequestDetail extends ServiceRequestSummary {
  payload: Record<string, unknown>;
  events: ServiceRequestEvent[];
}

export interface EligibleJudge {
  discordUserId: string;
  portalUserId?: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  judicialRank?: string | null;
}

export interface TicketTranscriptAttachment {
  id?: string | null;
  filename: string;
  url: string;
  contentType?: string | null;
  size?: number | null;
}

export interface TicketTranscriptEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface TicketTranscriptEmbed {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  color?: number | null;
  timestamp?: string | null;
  author?: {
    name?: string | null;
    url?: string | null;
    iconUrl?: string | null;
  } | null;
  footer?: {
    text?: string | null;
    iconUrl?: string | null;
  } | null;
  image?: {
    url?: string | null;
  } | null;
  thumbnail?: {
    url?: string | null;
  } | null;
  fields: TicketTranscriptEmbedField[];
}

export interface TicketTranscriptReaction {
  count: number;
  emoji: {
    id?: string | null;
    name?: string | null;
    animated?: boolean;
  };
}

export interface TicketTranscriptMessage {
  id: string;
  transcriptKind?: "message" | "system";
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
  attachments: TicketTranscriptAttachment[];
  embeds: TicketTranscriptEmbed[];
  mentions: Array<{
    id: string;
    username?: string | null;
    displayName?: string | null;
    globalName?: string | null;
    bot?: boolean;
  }>;
  mentionRoles: string[];
  components: unknown[];
  reactions: TicketTranscriptReaction[];
  systemEvent?: {
    label: string;
    actorDisplayName?: string | null;
    actorUserId?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
}

export interface TicketTranscriptSummary {
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
  metadata: Record<string, unknown>;
}

export interface TicketTranscriptDetail extends TicketTranscriptSummary {
  messages: TicketTranscriptMessage[];
}

export interface CreateServiceRequestInput {
  requestType: ServiceRequestType;
  payload: Record<string, unknown>;
  requesterContact?: string;
  documentUrl?: string;
}

export interface BarExamChoice {
  value: string;
  label: string;
}

export interface BarExamQuestion {
  key: string;
  prompt: string;
  kind: "TEXT" | "ESSAY" | "MULTIPLE_CHOICE";
  points: number;
  choices?: BarExamChoice[];
}

export interface BarExamResource {
  title: string;
  category: string;
  url: string;
  description: string;
}

export interface BarExamAttemptSummary {
  id: string;
  attemptNumber: string;
  examTrack: BarExamTrack;
  versionLabel: string;
  status: BarExamAttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  finalScore: number | null;
  decision: string | null;
  followupChannelId?: string | null;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  deletedByDisplayName?: string | null;
  deleteReason?: string | null;
}

export interface BarExamStatusResponse {
  eligible: boolean;
  reviewer: boolean;
  availability: "not_eligible" | "no_exam_available" | "no_track_available" | "not_started" | "active_attempt";
  eligibilityMessage: string;
  tracks: BarExamTrack[];
  eligibleTracks: BarExamTrack[];
  availableTracks: BarExamTrack[];
  activeVersionCount: number;
  activeImportedVersionCount: number;
  activeAttempts: BarExamAttemptSummary[];
}

export interface BarExamAnswerDraft {
  questionKey: string;
  answerText?: string;
  selectedChoice?: string;
  draftSavedAt?: string | null;
}

export interface BarExamCandidateAttempt extends BarExamAttemptSummary {
  title: string;
  candidateInstructionsMarkdown: string;
  integrityText: string;
  questions: BarExamQuestion[];
  answers: BarExamAnswerDraft[];
  resources: BarExamResource[];
}

export interface StartBarExamInput {
  examTrack: BarExamTrack;
  integrityAccepted: boolean;
  candidateName?: string;
  candidatePhone?: string;
  candidateEmail?: string;
}

export interface SaveBarExamDraftInput {
  answers: BarExamAnswerDraft[];
}

export interface AdminBarExamAttemptSummary extends BarExamAttemptSummary {
  discordUserId: string;
  discordUsername: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  candidateEmail: string | null;
  reviewerName: string | null;
}

export interface AdminBarExamAnswer extends BarExamAnswerDraft {
  pointsAwarded: number | null;
  maxPoints: number;
  reviewerNotes: string | null;
}

export interface AdminBarExamAttemptDetail extends AdminBarExamAttemptSummary {
  title: string;
  passingScore: number;
  totalPoints: number;
  questions: BarExamQuestion[];
  answers: AdminBarExamAnswer[];
  reviewerPayload: Record<string, unknown>;
  events: Array<{
    id: string;
    eventType: string;
    message: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface ApiListResponse<T> {
  data: T[];
  source: "d1" | "seed";
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
