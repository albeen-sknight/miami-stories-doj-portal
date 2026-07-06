import type { DocketCaseType, DocketProceedingType, ServiceRequestDetail, ServiceRequestType } from "@shotta-doj/shared";

export const DEFAULT_DOCKET_TIMEZONE = "America/New_York";

export const CASE_TYPE_PREFIX: Record<DocketCaseType, string> = {
  CRIMINAL: "CR",
  CIVIL: "CV",
  ADMINISTRATIVE: "DKT",
  CONSTITUTIONAL: "DKT",
  BAR_DISCIPLINE: "DKT",
  WARRANT: "WAR",
  SUBPOENA: "SUB",
  EXPUNGEMENT: "EXP",
  MARRIAGE: "MAR",
  DIVORCE: "DIV",
  NAME_CHANGE: "NC",
  OTHER: "DKT"
};

export const CASE_TYPE_LABELS: Record<DocketCaseType, string> = {
  CRIMINAL: "Criminal",
  CIVIL: "Civil",
  ADMINISTRATIVE: "Administrative",
  CONSTITUTIONAL: "Constitutional",
  BAR_DISCIPLINE: "Bar Discipline",
  WARRANT: "Warrant",
  SUBPOENA: "Subpoena",
  EXPUNGEMENT: "Expungement",
  MARRIAGE: "Marriage",
  DIVORCE: "Divorce",
  NAME_CHANGE: "Name Change",
  OTHER: "Other"
};

export const PROCEEDING_LABELS: Record<DocketProceedingType, string> = {
  PROBABLE_CAUSE_REVIEW: "Probable Cause Review",
  CUSTODY_ADVISORY: "Custody Advisory",
  ARRAIGNMENT: "Arraignment",
  PRELIMINARY_HEARING: "Preliminary Hearing",
  WARRANT_REVIEW: "Warrant Review",
  SEARCH_SEIZURE_REVIEW: "Search and Seizure Review",
  SUBPOENA_REVIEW: "Subpoena Review",
  CIVIL_CASE_REVIEW: "Civil Case Review",
  MOTION_HEARING: "Motion Hearing",
  TRIAL: "Trial",
  VERDICT: "Verdict",
  SENTENCING: "Sentencing",
  EXPUNGEMENT_HEARING: "Expungement Hearing",
  MARRIAGE_CERTIFICATE_REVIEW: "Marriage Certificate Review",
  DIVORCE_REVIEW: "Divorce Review",
  LEGAL_NAME_CHANGE: "Petition for Legal Name Change",
  TEMPORARY_DEFENSE_REPRESENTATION: "Temporary Defense Representation",
  ADMINISTRATIVE_REVIEW: "Administrative Review",
  OTHER: "Other"
};

export const REQUEST_DOCKET_SUGGESTIONS: Record<ServiceRequestType, { caseType: DocketCaseType; proceedingType: DocketProceedingType }> = {
  LAWYER: { caseType: "OTHER", proceedingType: "TEMPORARY_DEFENSE_REPRESENTATION" },
  CRIMINAL_TRIAL: { caseType: "CRIMINAL", proceedingType: "PRELIMINARY_HEARING" },
  CIVIL_CASE: { caseType: "CIVIL", proceedingType: "CIVIL_CASE_REVIEW" },
  SUBPOENA: { caseType: "SUBPOENA", proceedingType: "SUBPOENA_REVIEW" },
  ARREST_WARRANT: { caseType: "WARRANT", proceedingType: "WARRANT_REVIEW" },
  SEARCH_SEIZURE_WARRANT: { caseType: "WARRANT", proceedingType: "SEARCH_SEIZURE_REVIEW" },
  EXPUNGEMENT: { caseType: "EXPUNGEMENT", proceedingType: "EXPUNGEMENT_HEARING" },
  MARRIAGE: { caseType: "MARRIAGE", proceedingType: "MARRIAGE_CERTIFICATE_REVIEW" },
  DIVORCE: { caseType: "DIVORCE", proceedingType: "DIVORCE_REVIEW" },
  GENERAL: { caseType: "OTHER", proceedingType: "ADMINISTRATIVE_REVIEW" }
};

export function docketSuggestionFromRequest(detail: ServiceRequestDetail) {
  const suggestion = REQUEST_DOCKET_SUGGESTIONS[detail.requestType];
  const payload = detail.payload;
  const plaintiff = readString(payload, "plaintiffFullName") || readString(payload, "submittingParty") || readString(payload, "applicantFullName") || readString(payload, "petitionerName") || null;
  const defendant = readString(payload, "defendantName") || readString(payload, "respondentName") || readString(payload, "target") || null;
  const titleParts = [detail.shortTitle, detail.requestNumber].filter(Boolean);
  const publicSummary = `The Court has received ${detail.requestNumber} for judicial review. Public docket text should be finalized by the assigned judicial officer before publication.`;
  return {
    ...suggestion,
    title: titleParts.join(" / "),
    plaintiff,
    defendant,
    summaryMarkdown: publicSummary,
    publicNotesMarkdown: "",
    linkedServiceRequestId: detail.id,
    linkedPrivateTicketChannelId: detail.discordTicketChannelId,
    linkedPetitionUrl: detail.documentUrl,
    individualsInvolved: [plaintiff, defendant, detail.requesterDiscordUsername].filter((value): value is string => Boolean(value))
  };
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}
