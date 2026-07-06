import type { ServiceRequestType } from "@shotta-doj/shared";

export interface ServiceDefinition {
  type: ServiceRequestType;
  prefix: string;
  label: string;
  publicChannelKey: string;
  categoryKey?: string;
  discordWorkflow: "CHANNEL_POST" | "PRIVATE_TICKET";
  templateUrl?: string;
  requiredFields: string[];
  mainPartyField: string;
  shortTitleFields: string[];
  documentRequired?: boolean;
  confirmFields?: string[];
}

export const SERVICE_DEFINITIONS: Record<ServiceRequestType, ServiceDefinition> = {
  LAWYER: {
    type: "LAWYER",
    prefix: "LAW",
    label: "Defense Counsel Request",
    publicChannelKey: "REQUEST_LAWYER",
    discordWorkflow: "CHANNEL_POST",
    requiredFields: [
      "characterFullName",
      "citizenId",
      "representationType",
      "preferredRepresentation",
      "inCustody",
      "urgency",
      "briefDescription",
      "preferredContactMethod"
    ],
    mainPartyField: "characterFullName",
    shortTitleFields: ["characterFullName", "representationType"]
  },
  CRIMINAL_TRIAL: {
    type: "CRIMINAL_TRIAL",
    prefix: "CRT",
    label: "Court Hearing Request",
    publicChannelKey: "REQUEST_CRIMINAL_TRIAL",
    categoryKey: "CRIMINAL_TRIALS_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    requiredFields: ["arrestReportNumber", "defendantName", "allegedCharges", "briefSummary"],
    mainPartyField: "defendantName",
    shortTitleFields: ["defendantName", "arrestReportNumber"]
  },
  CIVIL_CASE: {
    type: "CIVIL_CASE",
    prefix: "CIV",
    label: "Civil Claim",
    publicChannelKey: "REQUEST_CIVIL_CASE",
    categoryKey: "CIVIL_CASES_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1QJrKqGkk8kg_DwyM2eHZQGQbrTbv9MhciUWfNJj8Zys/edit?usp=sharing",
    requiredFields: ["plaintiffFullName", "defendantName", "complaintType", "documentUrl", "filingSummary"],
    mainPartyField: "plaintiffFullName",
    shortTitleFields: ["plaintiffFullName", "defendantName"],
    documentRequired: true,
    confirmFields: ["confirmCopy", "confirmRenamed", "confirmEditorPermissions"]
  },
  SUBPOENA: {
    type: "SUBPOENA",
    prefix: "SUB",
    label: "Subpoena Request",
    publicChannelKey: "REQUEST_SUBPOENA",
    categoryKey: "SUBPOENAS_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1q29NqE0Qyt_vFRbbjjjI-lvJQnDOjkw8RnBngeThigk/edit?usp=sharing",
    requiredFields: ["submittingParty", "caseSubject", "recipient", "subpoenaType", "documentUrl", "relevanceSummary"],
    mainPartyField: "caseSubject",
    shortTitleFields: ["caseSubject", "recipient"],
    documentRequired: true,
    confirmFields: ["confirmCopy", "confirmRenamed", "confirmEditorPermissions"]
  },
  ARREST_WARRANT: {
    type: "ARREST_WARRANT",
    prefix: "AWR",
    label: "Warrant Request",
    publicChannelKey: "REQUEST_WARRANT",
    categoryKey: "WARRANTS_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1pxrO2_reBG5p-txAI8h8ipgBZXQqb_wS3j4NXb75tWE/edit?usp=sharing",
    requiredFields: ["caseNumber", "defendantName", "charges", "probableCauseSummary", "confirmAccurateTimely"],
    mainPartyField: "defendantName",
    shortTitleFields: ["defendantName", "caseNumber"],
    confirmFields: ["confirmAccurateTimely"]
  },
  SEARCH_SEIZURE_WARRANT: {
    type: "SEARCH_SEIZURE_WARRANT",
    prefix: "SWR",
    label: "Search and Seizure Review",
    publicChannelKey: "REQUEST_SEARCH_SEIZURE",
    categoryKey: "WARRANTS_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1VoF1wJW9RwrQ5BiD8EnpYX7AtjFxQ_Z2hxmNZDYKAi4/edit?usp=sharing",
    requiredFields: ["caseNumber", "target", "requestingOfficerAgency", "probableCauseFacts", "evidenceRequested", "documentUrl"],
    mainPartyField: "target",
    shortTitleFields: ["target", "caseNumber"],
    documentRequired: true,
    confirmFields: ["confirmCopy", "confirmRenamed", "confirmEditorPermissions"]
  },
  EXPUNGEMENT: {
    type: "EXPUNGEMENT",
    prefix: "EXP",
    label: "Expungement Request",
    publicChannelKey: "REQUEST_EXPUNGEMENT",
    categoryKey: "EXPUNGEMENTS_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1ulbN1y152M8sKnSsotZmM7zJUWO0p1QySUvJ1UtsFik/edit?usp=sharing",
    requiredFields: ["applicantFullName", "applicantCitizenId", "offenses", "reasonForExpungement", "documentUrl"],
    mainPartyField: "applicantFullName",
    shortTitleFields: ["applicantFullName", "applicantCitizenId"],
    documentRequired: true,
    confirmFields: ["confirmCrimeFree", "confirmWitnesses", "confirmRehabilitation", "confirmCourtFee", "confirmCopy", "confirmRenamed", "confirmEditorPermissions"]
  },
  MARRIAGE: {
    type: "MARRIAGE",
    prefix: "MAR",
    label: "Marriage Certificate Review",
    publicChannelKey: "REQUEST_MARRIAGE",
    categoryKey: "MARRIAGE_DIVORCE_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    templateUrl: "https://docs.google.com/document/d/1HvTZUS91APs-8zukUqMWK8MCU86FVwZLFjEkdrPmqKw/edit?usp=sharing",
    requiredFields: ["spouseOneName", "spouseOneCitizenId", "spouseTwoName", "spouseTwoCitizenId", "ceremonyDateTime", "contactInfo"],
    mainPartyField: "spouseOneName",
    shortTitleFields: ["spouseOneName", "spouseTwoName"]
  },
  DIVORCE: {
    type: "DIVORCE",
    prefix: "DIV",
    label: "Divorce Review",
    publicChannelKey: "REQUEST_DIVORCE",
    categoryKey: "MARRIAGE_DIVORCE_CATEGORY",
    discordWorkflow: "PRIVATE_TICKET",
    requiredFields: ["petitionerName", "petitionerCitizenId", "respondentName", "reasonForDivorce", "contactInfo"],
    mainPartyField: "petitionerName",
    shortTitleFields: ["petitionerName", "respondentName"]
  },
  GENERAL: {
    type: "GENERAL",
    prefix: "GEN",
    label: "General DOJ Request",
    publicChannelKey: "ADMIN_LOG",
    discordWorkflow: "CHANNEL_POST",
    requiredFields: ["mainParty", "summary"],
    mainPartyField: "mainParty",
    shortTitleFields: ["mainParty"]
  }
};

export function serviceDefinition(type: string): ServiceDefinition | null {
  return Object.prototype.hasOwnProperty.call(SERVICE_DEFINITIONS, type)
    ? SERVICE_DEFINITIONS[type as ServiceRequestType]
    : null;
}
