/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Public Navigation and Form Data
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import {
  BadgeCheck,
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  FileCheck,
  FileSearch,
  Gavel,
  HeartHandshake,
  Landmark,
  LibraryBig,
  Scale,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";
import type { ComponentType } from "react";

export const publicNav = [
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "Docket", href: "/docket" },
  { label: "Lawyers", href: "/lawyers" },
  { label: "Services", href: "/services" }
];

export const divisions = [
  ["Judicial Division", "Court coordination, rulings, hearings, and judicial review.", Landmark],
  ["Executive / Prosecution", "Prosecutor review, charging support, warrant review, and public safety coordination.", Scale],
  ["Bar Association / Attorney Licensing", "Bar status, practice standards, and attorney registry support.", BadgeCheck],
  ["Defense Counsel", "Public defense, private practice, access to counsel, and representation pathways.", ShieldCheck],
  ["Civil and Administrative Proceedings", "Civil claims, certificates, expungements, subpoenas, and hearings.", BriefcaseBusiness],
  ["Records, Dockets, and Transparency", "Published resources, public notices, docket references, and audit-ready records.", LibraryBig]
] satisfies [string, string, ComponentType<{ className?: string }>][];

export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "url";

export interface ServiceFieldCondition {
  field: string;
  values: string[];
}

export interface ServiceFieldDynamicText {
  field: string;
  values: Record<string, string>;
}

export interface ServiceField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  requiredWhen?: ServiceFieldCondition[];
  visibleWhen?: ServiceFieldCondition[];
  options?: string[];
  help?: string;
  helpWhen?: ServiceFieldDynamicText;
  placeholder?: string;
  placeholderWhen?: ServiceFieldDynamicText;
  maxLength?: number;
}

export interface ServiceFormDefinition {
  slug: string;
  title: string;
  type:
    | "LAWYER"
    | "CRIMINAL_TRIAL"
    | "CIVIL_CASE"
    | "SUBPOENA"
    | "ARREST_WARRANT"
    | "SEARCH_SEIZURE_WARRANT"
    | "EXPUNGEMENT"
    | "MARRIAGE"
    | "DIVORCE"
    | "GENERAL";
  group: string;
  prefix: string;
  who: string;
  prepare: string[];
  guidance: string[];
  templateUrl?: string;
  fields: ServiceField[];
  icon: ComponentType<{ className?: string }>;
}

const urgencyOptions = ["Emergency / currently detained", "Same day", "Normal"];
const yesNo = ["yes", "no"];
const lawyerRepresentationTypes = ["Criminal / Cellside", "Civil advice", "General legal advice", "Expungement advice", "Warrant/subpoena/evidence advice"];
const criminalCourtRequestTypes = ["Preliminary Probable Cause Review", "Trial / Court Hearing Request", "Criminal Case Status / Scheduling Question"];
const criminalRepresentation = [{ field: "representationType", values: ["Criminal / Cellside"] }];
const civilRepresentation = [{ field: "representationType", values: ["Civil advice"] }];
const generalRepresentation = [{ field: "representationType", values: ["General legal advice"] }];
const expungementRepresentation = [{ field: "representationType", values: ["Expungement advice"] }];
const processRepresentation = [{ field: "representationType", values: ["Warrant/subpoena/evidence advice"] }];
const nonGeneralCaseNumberRepresentation = [{ field: "representationType", values: ["Criminal / Cellside", "Civil advice", "Expungement advice", "Warrant/subpoena/evidence advice"] }];
const evidenceRepresentation = [{ field: "representationType", values: ["Criminal / Cellside", "Civil advice", "Warrant/subpoena/evidence advice"] }];
const templateConfirms: ServiceField[] = [
  { name: "confirmCopy", label: "I made a copy of the template", kind: "checkbox", required: true },
  { name: "confirmRenamed", label: "I renamed it correctly", kind: "checkbox", required: true },
{ name: "confirmEditorPermissions", label: "I will share the completed document only with the assigned DOJ reviewer, court official, or authorized party", kind: "checkbox", required: true }
];

function withTemplate(fields: ServiceField[]) {
  return [...fields, ...templateConfirms];
}

export const serviceFormDefinitions: Record<string, ServiceFormDefinition> = {
  lawyer: {
    slug: "lawyer",
    title: "Defense Counsel Request",
    type: "LAWYER",
    group: "Representation",
    prefix: "LAW",
    icon: UserRoundCheck,
    who: "Miami Stories residents seeking legal advice or representation, especially for cellside, interrogation, custody, criminal defense, or legal guidance before deciding what to file.",
    prepare: [
      "Character identity",
      "Representation type and situation",
      "Urgency and contact method",
      "A short, general public summary only"
    ],
    guidance: [
      "Use this page to request legal advice or representation. Pick a quick-start option, then complete only the fields that apply."
    ],
    fields: [
      {
        name: "characterFullName",
        label: "Character full name",
        kind: "text",
        required: true,
        placeholder: "Mateo Rivera",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "Serena Vale",
            "General legal advice": "Elias Monroe",
            "Expungement advice": "Naomi Cross",
            "Warrant/subpoena/evidence advice": "Elias Monroe"
          }
        }
      },
      {
        name: "citizenId",
        label: "Citizen ID",
        kind: "text",
        required: true,
        placeholder: "MR-20491",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "SV-88210",
            "General legal advice": "EM-11870",
            "Expungement advice": "NC-55830",
            "Warrant/subpoena/evidence advice": "EM-11870"
          }
        }
      },
      { name: "representationType", label: "Type of representation", kind: "select", required: true, options: lawyerRepresentationTypes, placeholder: "Select the kind of legal help needed" },
      { name: "representationSubtype", label: "Situation subtype", kind: "select", required: true, options: [], placeholder: "Select the closest situation" },
      { name: "preferredRepresentation", label: "Preferred representation", kind: "select", required: true, options: ["Public Defender", "Private Defense Attorney", "No preference"], placeholder: "Select preferred counsel route" },
      { name: "inCustody", label: "In custody?", kind: "select", requiredWhen: criminalRepresentation, visibleWhen: criminalRepresentation, options: yesNo, placeholder: "Select custody status" },
      { name: "agencyHolding", label: "Agency holding / arresting agency, if applicable", kind: "text", visibleWhen: criminalRepresentation, placeholder: "MPD Mission Row" },
      { name: "chargesReason", label: "Charges or reason for detention", kind: "textarea", requiredWhen: criminalRepresentation, visibleWhen: criminalRepresentation, placeholder: "Armed robbery allegation; restricted weapon allegation" },
      { name: "arrestingOfficer", label: "Arresting officer, if known", kind: "text", visibleWhen: criminalRepresentation, placeholder: "Officer Lina Park" },
      { name: "opposingParty", label: "Opposing party / respondent, if known", kind: "text", visibleWhen: civilRepresentation, placeholder: "Northline Towing LLC" },
      { name: "agencyDepartmentInvolved", label: "Agency or department involved, if applicable", kind: "text", visibleWhen: civilRepresentation, placeholder: "Northline Towing LLC or MPD Traffic Division" },
      { name: "formalCivilFiled", label: "Is a formal civil case already filed?", kind: "select", visibleWhen: civilRepresentation, options: ["yes", "no", "unknown"], placeholder: "Select civil filing status" },
      { name: "topicCategory", label: "Topic / category", kind: "text", requiredWhen: generalRepresentation, visibleWhen: generalRepresentation, placeholder: "Attorney licensing question after academy coursework" },
      { name: "relatedPeopleAgencies", label: "Related people or agencies, if any", kind: "text", visibleWhen: generalRepresentation, placeholder: "DOJ Bar Association, Eclipse Towers Security Office" },
      { name: "priorChargesCases", label: "Prior charges / cases, if known", kind: "textarea", requiredWhen: expungementRepresentation, visibleWhen: expungementRepresentation, placeholder: "CRT-2026-0014, misdemeanor trespass" },
      { name: "approximateCaseDate", label: "Date or approximate date of case", kind: "text", visibleWhen: expungementRepresentation, placeholder: "June 12, 2026" },
      { name: "currentStatus", label: "Current status", kind: "text", visibleWhen: expungementRepresentation, placeholder: "Dismissed" },
      { name: "processInvolved", label: "Which process is involved?", kind: "select", requiredWhen: processRepresentation, visibleWhen: processRepresentation, options: ["Warrant", "Search/seizure", "Subpoena", "Evidence/bodycam/CCTV", "Other"], placeholder: "Select warrant, subpoena, search/seizure, or evidence issue" },
      { name: "agencyRequestingParty", label: "Agency or requesting party, if known", kind: "text", visibleWhen: processRepresentation, placeholder: "Attorney Elias Monroe" },
      { name: "legalAdviceNeeded", label: "What legal advice is needed?", kind: "textarea", requiredWhen: processRepresentation, visibleWhen: processRepresentation, placeholder: "I need help deciding whether a subpoena is proper for Eclipse Towers security footage in a civil property damage case." },
      {
        name: "desiredOutcome",
        label: "Desired outcome",
        kind: "textarea",
        requiredWhen: [{ field: "representationType", values: ["Civil advice", "General legal advice", "Expungement advice"] }],
        visibleWhen: [{ field: "representationType", values: ["Civil advice", "General legal advice", "Expungement advice"] }],
        placeholder: "Help identifying the correct DOJ filing route and next steps.",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "Advice on whether to file a civil claim and what evidence I need.",
            "Expungement advice": "Advice on whether the dismissed case can be cleared before I file."
          }
        }
      },
      {
        name: "caseNumber",
        label: "Case / MDT / court / request number, if known",
        kind: "text",
        visibleWhen: nonGeneralCaseNumberRepresentation,
        placeholder: "MPD-2026-0719-044",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "CIV-2026-0032",
            "Expungement advice": "CRT-2026-0014",
            "Warrant/subpoena/evidence advice": "CIV-2026-0032"
          }
        }
      },
      {
        name: "evidenceLinks",
        label: "Related document / evidence / bodycam / report links",
        kind: "textarea",
        visibleWhen: evidenceRepresentation,
        placeholder: "https://docs.google.com/document/d/example-vespucci-liquor-evidence",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "https://docs.google.com/document/d/example-northline-towing-claim",
            "Warrant/subpoena/evidence advice": "https://docs.google.com/document/d/example-eclipse-towers-subpoena"
          }
        }
      },
      { name: "urgency", label: "Urgency", kind: "select", required: true, options: urgencyOptions, placeholder: "Select request urgency" },
      {
        name: "publicSummary",
        label: "Public summary",
        kind: "textarea",
        required: true,
        maxLength: 240,
        placeholder: "I am detained and need legal representation for a pending criminal matter.",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "I need advice about a possible civil claim involving property damage.",
            "General legal advice": "I need legal advice before deciding which DOJ service fits my situation.",
            "Expungement advice": "I need advice about clearing a dismissed case from public records.",
            "Warrant/subpoena/evidence advice": "I need advice about requesting legal process for evidence."
          }
        },
        help: "Public summary is visible in the lawyer request channel. Keep it short and general. Put sensitive details in the private details field."
      },
      {
        name: "briefDescription",
        label: "Private case details for DOJ staff",
        kind: "textarea",
        required: true,
        placeholder: "I was arrested near Alta Street after officers said my vehicle matched a robbery report. I need help reviewing the charges, evidence, and whether the search was valid.",
        placeholderWhen: {
          field: "representationType",
          values: {
            "Civil advice": "Northline Towing allegedly damaged my vehicle during a tow at Eclipse Towers and refused reimbursement after I provided repair estimates.",
            "General legal advice": "I completed academy coursework and need guidance on the correct DOJ filing or licensing route before I submit anything formal.",
            "Expungement advice": "A misdemeanor trespass case was dismissed after correction, but I need guidance before filing an expungement request.",
            "Warrant/subpoena/evidence advice": "I need help deciding whether a subpoena is proper for Eclipse Towers security footage in a civil property damage case."
          }
        },
        help: "Use this private field for facts DOJ staff need to route the request. It is not copied into the public lawyer request post."
      },
      { name: "preferredContactMethod", label: "Preferred contact method", kind: "text", required: true, placeholder: "Discord DM to eliasmonroe or phone 555-0142" }
    ]
  },
  "criminal-trial": {
    slug: "criminal-trial",
    title: "Criminal Court Request",
    type: "CRIMINAL_TRIAL",
    group: "Court Proceedings",
    prefix: "CRT",
    icon: Gavel,
    who: "Prosecutors, officers, defense counsel, defendants, or authorized parties requesting Miami-based criminal court coordination.",
    prepare: ["Request type", "Arrest report number", "Defendant details", "Charges", "Initial evidence or court scheduling notes"],
    guidance: [
      "Preliminary Probable Cause Review is an initial court review of the filing, charges, and submitted evidence to decide whether the case can move forward. It is not a trial, not a full hearing, and not the final discovery deadline.",
      "Use Trial / Court Hearing Request only when the matter is ready for scheduling. Defense gets case access once the matter is ready to move forward or when defense is added to the case ticket.",
      "Discovery closes 24 hours before trial unless the Court allows late evidence for fairness."
    ],
    fields: [
      {
        name: "criminalRequestType",
        label: "Request Type",
        kind: "select",
        required: true,
        options: criminalCourtRequestTypes,
        placeholder: "Select preliminary review, hearing, or status question",
        help: "Use Preliminary Probable Cause Review when submitting an initial criminal filing for court screening before trial scheduling."
      },
      { name: "arrestReportNumber", label: "Arrest Report Number", kind: "text", required: true, placeholder: "MPD-2026-0719-044" },
      { name: "defendantName", label: "Defendant Name", kind: "text", required: true, placeholder: "Mateo Rivera" },
      { name: "defendantCitizenId", label: "Defendant Citizen ID, if known", kind: "text", placeholder: "MR-20491" },
      { name: "allegedCharges", label: "Alleged Charges / Penal Code citations", kind: "textarea", required: true, placeholder: "PC 210 Armed Robbery; PC 305 Possession of Restricted Weapon" },
      {
        name: "briefSummary",
        label: "Probable cause summary / case notes",
        kind: "textarea",
        required: true,
        placeholder: "Officer Park reports that the suspect matching the Vespucci Liquor robbery description was stopped near Alta Street in a blue Sultan. Bodycam, store CCTV, and one witness statement are attached for preliminary review.",
        placeholderWhen: {
          field: "criminalRequestType",
          values: {
            "Trial / Court Hearing Request": "Defense has been added to the case ticket and both sides are ready for the Court to schedule a hearing on the Vespucci Liquor robbery charges.",
            "Criminal Case Status / Scheduling Question": "Requesting confirmation that the Vespucci Liquor filing has completed preliminary review and is ready for the next scheduling step."
          }
        },
        help: "For preliminary review, summarize the initial filing and evidence. Do not treat this field as a defendant discovery deadline."
      },
      { name: "arrestingAgencyOfficer", label: "Arresting agency/officer, if known", kind: "text", placeholder: "Officer Lina Park, MPD" },
      {
        name: "schedulingNotes",
        label: "Requested scheduling notes",
        kind: "textarea",
        placeholder: "Requesting preliminary probable cause review before trial scheduling.",
        placeholderWhen: {
          field: "criminalRequestType",
          values: {
            "Trial / Court Hearing Request": "Requesting trial/hearing date after defense access is confirmed.",
            "Criminal Case Status / Scheduling Question": "Requesting status on whether the case is ready for scheduling."
          }
        }
      },
      { name: "evidenceLink", label: "Evidence/discovery link, if available", kind: "url", placeholder: "https://docs.google.com/document/d/example-vespucci-liquor-evidence" }
    ]
  },
  "civil-case": {
    slug: "civil-case",
    title: "Civil Claim",
    type: "CIVIL_CASE",
    group: "Court Proceedings",
    prefix: "CIV",
    icon: BriefcaseBusiness,
templateUrl: "https://docs.google.com/document/d/1R9qLC1au8b5ri0OZRv41jnmIMiTPETbyHRaIKLiR6R8/edit?usp=sharing",
    who: "Parties or attorneys formally filing civil claims, protective or restraining order requests, trespass/order issues, permit or licensing disputes, contract/business contract matters, civil lawsuits against PD/government actors, civil lawsuits between civilians, or civil issues involving PD members.",
    prepare: ["Make a copy of the template", "Rename it PLAINTIFF vs. DEFENDANT - CIVIL CASE", "Set permissions to Anyone with the link -> Editor", "Label exhibits Exhibit A, Exhibit B, Exhibit C", "Describe the civil filing route you are requesting"],
    guidance: [
      "Use this page for formal civil intake and filings. Request-a-Lawyer is for counsel or advice before deciding what to file.",
      "Civil filings may include broader civil claims, protective or restraining order requests, trespass/order issues, permit or licensing disputes, contract or business contract disputes, lawsuits involving PD/government actors, lawsuits between civilians, and civil issues involving PD members.",
      "Incomplete filings may be delayed, returned for correction, or dismissed."
    ],
    fields: withTemplate([
      { name: "plaintiffFullName", label: "Plaintiff full name", kind: "text", required: true, placeholder: "Serena Vale" },
      { name: "plaintiffCitizenId", label: "Plaintiff Citizen ID", kind: "text", placeholder: "SV-88210" },
      { name: "defendantName", label: "Defendant full name / agency / business", kind: "text", required: true, placeholder: "Northline Towing LLC" },
      { name: "complaintType", label: "Complaint type", kind: "text", required: true, placeholder: "Property damage / contract dispute" },
      { name: "harmDate", label: "Date harm occurred or became known", kind: "text", placeholder: "July 18, 2026" },
      { name: "documentUrl", label: "Completed civil case document link", kind: "url", required: true, placeholder: "https://docs.google.com/document/d/example-northline-towing-claim" },
      { name: "filingSummary", label: "Short filing summary", kind: "textarea", required: true, placeholder: "Plaintiff alleges Northline Towing improperly towed and damaged her vehicle outside Eclipse Towers, then refused reimbursement after receiving repair estimates." },
      { name: "submittingParty", label: "Submitting party or attorney name", kind: "text", placeholder: "Serena Vale" },
      { name: "attorneyBarId", label: "Attorney Bar ID, if applicable", kind: "text", placeholder: "MS-BAR-014, if represented" },
      { name: "witnessesEvidence", label: "Witnesses/evidence summary", kind: "textarea", placeholder: "Garage CCTV, tow receipt, mechanic invoice, and two witness statements." },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea", placeholder: "Requesting civil intake review and case number assignment." }
    ])
  },
  subpoena: {
    slug: "subpoena",
    title: "Subpoena Request",
    type: "SUBPOENA",
    group: "Warrants and Subpoenas",
    prefix: "SUB",
    icon: FileSearch,
templateUrl: "https://docs.google.com/document/d/1wytrLiS_3Aj7Ve9UOe7hf5_B__xN46qmp0HY3ry8HWk/edit?usp=sharing",
    who: "Parties requesting specific testimony, records, objects, digital evidence, inspections, or similar process.",
    prepare: ["Make a copy of the template", "Rename it CASE SUBJECT - SUBPOENA REQUEST - PERSON OR EVIDENCE REQUESTED", "Set permissions to Anyone with the link -> Editor"],
    guidance: ["Be specific and reasonably limited. Broad, irrelevant, privileged, untimely, or unsupported requests may be modified, returned, or denied."],
    fields: withTemplate([
      { name: "submittingParty", label: "Submitting attorney / party", kind: "text", required: true, placeholder: "Attorney Elias Monroe" },
      { name: "caseNumber", label: "Case or incident number", kind: "text", placeholder: "CIV-2026-0032" },
      { name: "caseSubject", label: "Case caption / subject", kind: "text", required: true, placeholder: "Serena Vale v. Northline Towing LLC" },
      { name: "recipient", label: "Person, agency, business, or records custodian to be served", kind: "text", required: true, placeholder: "Eclipse Towers Security Office" },
      { name: "subpoenaType", label: "Subpoena type", kind: "select", required: true, options: ["Appearance to testify", "Appearance for deposition", "Production of documents / records / objects / digital evidence", "Inspection of premises", "Other"], placeholder: "Select records, testimony, inspection, or other process" },
      { name: "complianceDetails", label: "Date/time/place of compliance", kind: "text", placeholder: "July 18, 2026, 9:30 PM-10:15 PM, Eclipse Towers parking garage" },
      { name: "relevanceSummary", label: "Reason material is relevant and necessary", kind: "textarea", required: true, placeholder: "The footage may show whether the tow truck damaged the plaintiff's vehicle before leaving the property." },
      { name: "documentUrl", label: "Completed subpoena document link", kind: "url", required: true, placeholder: "https://docs.google.com/document/d/example-eclipse-towers-subpoena" },
      { name: "legalBasis", label: "Supporting evidence or legal basis summary", kind: "textarea", placeholder: "The footage directly relates to the disputed tow and claimed vehicle damage." },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea", placeholder: "Requesting service before the next civil status review." }
    ])
  },
  warrant: {
    slug: "warrant",
    title: "Warrant Request",
    type: "ARREST_WARRANT",
    group: "Warrants and Subpoenas",
    prefix: "AWR",
    icon: FileCheck,
templateUrl: "https://docs.google.com/document/d/1bS2RHhE6gu93rdDNRmm2IejJRmMEMmhL1foKoMTb2-o/edit?usp=sharing",
    who: "Law enforcement, prosecutors, or authorized legal actors requesting judicial review of an arrest warrant.",
    prepare: ["Use the arrest warrant template when available", "List each offense clearly", "Explain probable cause for each charge", "Avoid duplicative charge stacking without separate legal basis"],
    guidance: ["Probable cause, targets, and evidence links are sent only to the private warrant ticket channel."],
    fields: [
      { name: "caseNumber", label: "MDT / Case Number", kind: "text", required: true, placeholder: "MDPD-2026-0721-118" },
      { name: "defendantName", label: "Defendant Name", kind: "text", required: true, placeholder: "Suspect tied to Unit 4B, Del Perro Apartments" },
      { name: "charges", label: "Charges / Penal Codes with counts", kind: "textarea", required: true, placeholder: "PC 210 Armed Robbery; PC 305 Possession of Restricted Weapon" },
      { name: "probableCauseSummary", label: "Probable cause summary", kind: "textarea", required: true, placeholder: "Detective Quinn reports phone pings, a witness ID, and a controlled purchase connecting the suspect to stolen firearm evidence and robbery clothing." },
      { name: "documentUrl", label: "Completed arrest warrant document link, if available", kind: "url", placeholder: "https://docs.google.com/document/d/example-del-perro-warrant" },
      { name: "confirmAccurateTimely", label: "I confirm facts are accurate and the request is timely", kind: "checkbox", required: true }
    ]
  },
  "search-seizure": {
    slug: "search-seizure",
    title: "Search and Seizure Review",
    type: "SEARCH_SEIZURE_WARRANT",
    group: "Warrants and Subpoenas",
    prefix: "SWR",
    icon: FileCheck,
templateUrl: "https://docs.google.com/document/d/16z1LOsOib_QBqbq8cbR1oLEj6rpfsIOAeoGLGNsq88U/edit?usp=sharing",
    who: "Law enforcement, prosecutors, or authorized legal actors requesting search and seizure review for defined targets and evidence.",
    prepare: ["Make a copy of the template", "Rename it TARGET NAME OR LOCATION - SEARCH WARRANT REQUEST", "Set permissions to Anyone with the link -> Editor", "Write facts, not conclusions"],
    guidance: ["Target locations, probable cause, evidence links, and document links are never posted publicly."],
    fields: withTemplate([
      { name: "caseNumber", label: "MDT / Case Number", kind: "text", required: true, placeholder: "MPD-2026-0722-063" },
      { name: "target", label: "Person, place, vehicle, device, account, property, or location to be searched", kind: "text", required: true, placeholder: "Locked glovebox search involving Darius Cole / DC-77102" },
      { name: "requestingOfficerAgency", label: "Requesting officer / agency", kind: "text", required: true, placeholder: "Officer Maren Holt, MPD" },
      { name: "probableCauseFacts", label: "Facts establishing probable cause", kind: "textarea", required: true, placeholder: "The vehicle was stopped for expired registration near Little Seoul. The driver disputes consent and requests review of the locked glovebox search." },
      { name: "evidenceRequested", label: "Exact evidence/property requested for seizure", kind: "textarea", required: true, placeholder: "Locked glovebox contents and phone" },
      { name: "documentUrl", label: "Completed search warrant document link", kind: "url", required: true, placeholder: "https://docs.google.com/document/d/example-little-seoul-search-review" },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea", placeholder: "Requesting review before the seized phone or glovebox contents are used in court." }
    ])
  },
  expungement: {
    slug: "expungement",
    title: "Expungement Request",
    type: "EXPUNGEMENT",
    group: "Records and Certificates",
    prefix: "EXP",
    icon: BookOpen,
templateUrl: "https://docs.google.com/document/d/1Mo3ZfAB2UsfqqUQ0fqyylhSzYLEQYX-ReKsQ2YANPWw/edit?usp=sharing",
    who: "Applicants or attorneys requesting discretionary record relief after meeting eligibility expectations.",
    prepare: ["Make a copy of the petition", "Rename it FULL NAME - EXPUNGEMENT PETITION", "Set permissions to Anyone with the link -> Editor", "List the prior case number, case date, and current status if known"],
    guidance: ["Expungement is discretionary and not guaranteed. DOJ processing target is 7 working days after approval and payment."],
    fields: withTemplate([
      { name: "applicantFullName", label: "Applicant full name", kind: "text", required: true, placeholder: "Naomi Cross" },
      { name: "applicantCitizenId", label: "Applicant Citizen ID", kind: "text", required: true, placeholder: "NC-55830" },
      { name: "priorCaseNumber", label: "Prior case/request number, if known", kind: "text", placeholder: "CRT-2026-0014" },
      { name: "offenses", label: "Offenses", kind: "textarea", required: true, placeholder: "Misdemeanor trespass" },
      { name: "approximateCaseDate", label: "Approximate case date", kind: "text", placeholder: "June 12, 2026" },
      { name: "currentCaseStatus", label: "Current case status", kind: "text", placeholder: "Dismissed after corrected filing" },
      { name: "reasonForExpungement", label: "Reason for expungement", kind: "textarea", required: true, placeholder: "Applicant is seeking DOJ licensing review and requests removal of dismissed case records from public-facing search." },
      { name: "confirmCrimeFree", label: "I confirm 21 consecutive city days without new charges/convictions", kind: "checkbox", required: true },
      { name: "confirmWitnesses", label: "I confirm three character witnesses are included", kind: "checkbox", required: true },
      { name: "confirmRehabilitation", label: "I confirm rehabilitation/community contribution evidence is included", kind: "checkbox", required: true },
      { name: "confirmCourtFee", label: "I understand the $1,000,000 court fee", kind: "checkbox", required: true },
      { name: "documentUrl", label: "Completed expungement petition link", kind: "url", required: true, placeholder: "https://docs.google.com/document/d/example-naomi-cross-expungement" },
      { name: "supportingFacts", label: "Supporting facts", kind: "textarea", placeholder: "The trespass charge was dismissed after a corrected filing. Applicant has no new charges and included character witness statements." }
    ])
  },
  marriage: {
    slug: "marriage",
    title: "Marriage Certificate Review",
    type: "MARRIAGE",
    group: "Records and Certificates",
    prefix: "MAR",
    icon: HeartHandshake,
templateUrl: "https://docs.google.com/document/d/17L5lsoakMuEyJEBL-wQZAQg0qFLyx1WNY6JJOTjoNrw/edit?usp=sharing",
    who: "Spouses or authorized officiants requesting DOJ review and certificate issuance.",
    prepare: ["Names and Citizen IDs for both spouses", "Ceremony details", "Witness details if known", "Certificate document link if already prepared"],
    guidance: ["DOJ staff verifies information, drafts/reviews internally, and delivers the certificate in the private channel."],
    fields: [
      { name: "spouseOneName", label: "Spouse One full legal name", kind: "text", required: true, placeholder: "Adrian Fox" },
      { name: "spouseOneCitizenId", label: "Spouse One Citizen ID", kind: "text", required: true, placeholder: "AF-30911" },
      { name: "spouseTwoName", label: "Spouse Two full legal name", kind: "text", required: true, placeholder: "Lina Mercado" },
      { name: "spouseTwoCitizenId", label: "Spouse Two Citizen ID", kind: "text", required: true, placeholder: "LM-44280" },
      { name: "ceremonyDateTime", label: "Ceremony date/time", kind: "text", required: true, placeholder: "July 25, 2026, after 7:00 PM" },
      { name: "ceremonyLocation", label: "Ceremony location", kind: "text", placeholder: "Miami courthouse ceremony room" },
      { name: "officiant", label: "Officiant full name and title, if known", kind: "text", placeholder: "Judge Marisol Vega, if available" },
      { name: "documentUrl", label: "Completed certificate document link, if already prepared", kind: "url", placeholder: "https://docs.google.com/document/d/example-fox-mercado-marriage" },
      { name: "contactInfo", label: "Contact info for certificate delivery", kind: "text", required: true, placeholder: "Discord DM to adrianfox or phone 555-0188" }
    ]
  },
  divorce: {
    slug: "divorce",
    title: "Divorce Review",
    type: "DIVORCE",
    group: "Records and Certificates",
    prefix: "DIV",
    icon: Banknote,
    who: "Petitioners requesting divorce certificate or legal separation review.",
    prepare: ["Both parties' names", "Marriage certificate or record number if available", "Divorce type", "Reason for request", "Property/asset issues if any"],
    guidance: ["Divorce party details and marriage record information remain private inside the DOJ ticket channel."],
    fields: [
      { name: "petitionerName", label: "Petitioner full legal name", kind: "text", required: true, placeholder: "Carmen Wells" },
      { name: "petitionerCitizenId", label: "Petitioner Citizen ID", kind: "text", required: true, placeholder: "CW-61502" },
      { name: "respondentName", label: "Respondent full legal name", kind: "text", required: true, placeholder: "Tobias Wells" },
      { name: "respondentCitizenId", label: "Respondent Citizen ID, if known", kind: "text", placeholder: "TW-71944" },
      { name: "marriageRecordNumber", label: "Marriage record/case number, if known", kind: "text", placeholder: "MAR-2026-0021" },
      { name: "divorceType", label: "Divorce type", kind: "select", options: ["Uncontested", "Contested", "Legal separation", "Unknown"], placeholder: "Select divorce route" },
      { name: "reasonForDivorce", label: "Reason for divorce or legal separation request", kind: "textarea", required: true, placeholder: "Both parties agree to separate and report no shared property dispute requiring court division." },
      { name: "requestedAction", label: "Requested action", kind: "textarea", placeholder: "Requesting review and divorce decree processing." },
      { name: "contactInfo", label: "Contact information", kind: "text", required: true, placeholder: "Discord DM to carmenwells or phone 555-0194" },
      { name: "notes", label: "Notes", kind: "textarea", placeholder: "Respondent has been notified and does not object to the uncontested filing." }
    ]
  }
};

export const serviceGroups = ["Representation", "Court Proceedings", "Warrants and Subpoenas", "Records and Certificates"] as const;

export const dashboardRoutes = [
  "/dashboard",
  "/dashboard/bar",
  "/dashboard/bar-exam",
  "/dashboard/judicial",
  "/dashboard/docket",
  "/dashboard/requests",
  "/dashboard/discord",
  "/dashboard/deletion-log",
  "/dashboard/transcripts",
  "/dashboard/resources",
  "/dashboard/faq",
  "/dashboard/lawyers",
  "/dashboard/admin",
  "/dashboard/admin/roles",
  "/dashboard/admin/channels",
  "/dashboard/admin/audit"
];

export const serviceCards = Object.values(serviceFormDefinitions).map((service) => ({
  title: service.title,
  href: `/services/${service.slug}`,
  description: service.who,
  icon: service.icon,
  group: service.group
}));

export const requestForms = serviceFormDefinitions;


