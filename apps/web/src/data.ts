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

export interface ServiceField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  help?: string;
  placeholder?: string;
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
    who: "Miami Stories residents who need defense counsel, public defender review, private-practitioner support, or legal guidance.",
    prepare: [
      "Character identity",
      "Preferred counsel type",
      "Urgency and contact method",
      "A short, general public summary only"
    ],
    guidance: [
      "The public lawyer request gives attorneys only enough context to understand what type of representation may be needed.",
      "Do not include detailed allegations, incident narratives, sensitive personal information, phone numbers, addresses, confidential evidence, or unnecessary names in the public summary.",
      "Sensitive details and full case information can be provided privately through the DOJ staff review process after intake."
    ],
    fields: [
      { name: "characterFullName", label: "Character full name", kind: "text", required: true },
      { name: "citizenId", label: "Citizen ID", kind: "text", required: true },
      { name: "representationType", label: "Type of representation", kind: "select", required: true, options: ["Cellside / interrogation", "Criminal defense", "Civil matter", "Expungement", "Warrant/subpoena assistance", "General legal advice"] },
      { name: "preferredRepresentation", label: "Preferred representation", kind: "select", required: true, options: ["Public Defender", "Private Defense Attorney", "No preference"] },
      { name: "inCustody", label: "In custody?", kind: "select", required: true, options: yesNo },
      { name: "agencyHolding", label: "Agency holding them, if applicable", kind: "text" },
      { name: "chargesReason", label: "Charges or reason for detention", kind: "textarea" },
      { name: "caseNumber", label: "Case/arrest/report number, if applicable", kind: "text" },
      { name: "urgency", label: "Urgency", kind: "select", required: true, options: urgencyOptions },
      {
        name: "publicSummary",
        label: "Public summary",
        kind: "textarea",
        required: true,
        maxLength: 240,
        placeholder: "Example: Need an attorney to help me petition for a restraining or protective order.",
        help: "Short and general only. This may appear in the public lawyer request post."
      },
      {
        name: "briefDescription",
        label: "Private case details for DOJ staff",
        kind: "textarea",
        required: true,
        help: "Use this private field for facts DOJ staff need to route the request. It is not copied into the public lawyer request post."
      },
      { name: "preferredContactMethod", label: "Preferred contact method", kind: "text", required: true }
    ]
  },
  "criminal-trial": {
    slug: "criminal-trial",
    title: "Court Hearing Request",
    type: "CRIMINAL_TRIAL",
    group: "Court Proceedings",
    prefix: "CRT",
    icon: Gavel,
    who: "Defendants, counsel, prosecutors, or authorized parties requesting Miami-based court coordination for a criminal proceeding.",
    prepare: ["Arrest report number", "Defendant details", "Charges", "Discovery or evidence notes"],
    guidance: ["A private court hearing ticket is created for judge coordination. Public request channels receive no case details."],
    fields: [
      { name: "arrestReportNumber", label: "Arrest Report Number", kind: "text", required: true },
      { name: "defendantName", label: "Defendant Name", kind: "text", required: true },
      { name: "defendantCitizenId", label: "Defendant Citizen ID, if known", kind: "text" },
      { name: "allegedCharges", label: "Alleged Charges / Penal Code citations", kind: "textarea", required: true },
      { name: "briefSummary", label: "Brief Summary / Notes for Discovery", kind: "textarea", required: true },
      { name: "arrestingAgencyOfficer", label: "Arresting agency/officer, if known", kind: "text" },
      { name: "schedulingNotes", label: "Requested scheduling notes", kind: "textarea" },
      { name: "evidenceLink", label: "Evidence/discovery link, if available", kind: "url" }
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
    who: "Parties or attorneys filing Miami Stories civil claims using the DOJ civil case template.",
    prepare: ["Make a copy of the template", "Rename it PLAINTIFF vs. DEFENDANT - CIVIL CASE", "Set permissions to Anyone with the link -> Editor", "Label exhibits Exhibit A, Exhibit B, Exhibit C"],
    guidance: ["Incomplete filings may be delayed, returned for correction, or dismissed."],
    fields: withTemplate([
      { name: "plaintiffFullName", label: "Plaintiff full name", kind: "text", required: true },
      { name: "plaintiffCitizenId", label: "Plaintiff Citizen ID", kind: "text" },
      { name: "defendantName", label: "Defendant full name / agency / business", kind: "text", required: true },
      { name: "complaintType", label: "Complaint type", kind: "text", required: true },
      { name: "harmDate", label: "Date harm occurred or became known", kind: "text" },
      { name: "documentUrl", label: "Completed civil case document link", kind: "url", required: true },
      { name: "filingSummary", label: "Short filing summary", kind: "textarea", required: true },
      { name: "submittingParty", label: "Submitting party or attorney name", kind: "text" },
      { name: "attorneyBarId", label: "Attorney Bar ID, if applicable", kind: "text" },
      { name: "witnessesEvidence", label: "Witnesses/evidence summary", kind: "textarea" },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea" }
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
      { name: "submittingParty", label: "Submitting attorney / party", kind: "text", required: true },
      { name: "caseNumber", label: "Case or incident number", kind: "text" },
      { name: "caseSubject", label: "Case caption / subject", kind: "text", required: true },
      { name: "recipient", label: "Person, agency, business, or records custodian to be served", kind: "text", required: true },
      { name: "subpoenaType", label: "Subpoena type", kind: "select", required: true, options: ["Appearance to testify", "Appearance for deposition", "Production of documents / records / objects / digital evidence", "Inspection of premises", "Other"] },
      { name: "complianceDetails", label: "Date/time/place of compliance", kind: "text" },
      { name: "relevanceSummary", label: "Reason material is relevant and necessary", kind: "textarea", required: true },
      { name: "documentUrl", label: "Completed subpoena document link", kind: "url", required: true },
      { name: "legalBasis", label: "Supporting evidence or legal basis summary", kind: "textarea" },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea" }
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
      { name: "caseNumber", label: "MDT / Case Number", kind: "text", required: true },
      { name: "defendantName", label: "Defendant Name", kind: "text", required: true },
      { name: "charges", label: "Charges / Penal Codes with counts", kind: "textarea", required: true },
      { name: "probableCauseSummary", label: "Probable cause summary", kind: "textarea", required: true },
      { name: "documentUrl", label: "Completed arrest warrant document link, if available", kind: "url" },
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
      { name: "caseNumber", label: "MDT / Case Number", kind: "text", required: true },
      { name: "target", label: "Person, place, vehicle, device, account, property, or location to be searched", kind: "text", required: true },
      { name: "requestingOfficerAgency", label: "Requesting officer / agency", kind: "text", required: true },
      { name: "probableCauseFacts", label: "Facts establishing probable cause", kind: "textarea", required: true },
      { name: "evidenceRequested", label: "Exact evidence/property requested for seizure", kind: "textarea", required: true },
      { name: "documentUrl", label: "Completed search warrant document link", kind: "url", required: true },
      { name: "urgencyNotes", label: "Urgency/notes", kind: "textarea" }
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
    prepare: ["Make a copy of the petition", "Rename it FULL NAME - EXPUNGEMENT PETITION", "Set permissions to Anyone with the link -> Editor"],
    guidance: ["Expungement is discretionary and not guaranteed. DOJ processing target is 7 working days after approval and payment."],
    fields: withTemplate([
      { name: "applicantFullName", label: "Applicant full name", kind: "text", required: true },
      { name: "applicantCitizenId", label: "Applicant Citizen ID", kind: "text", required: true },
      { name: "offenses", label: "Offenses", kind: "textarea", required: true },
      { name: "reasonForExpungement", label: "Reason for expungement", kind: "textarea", required: true },
      { name: "confirmCrimeFree", label: "I confirm 21 consecutive city days without new charges/convictions", kind: "checkbox", required: true },
      { name: "confirmWitnesses", label: "I confirm three character witnesses are included", kind: "checkbox", required: true },
      { name: "confirmRehabilitation", label: "I confirm rehabilitation/community contribution evidence is included", kind: "checkbox", required: true },
      { name: "confirmCourtFee", label: "I understand the $1,000,000 court fee", kind: "checkbox", required: true },
      { name: "documentUrl", label: "Completed expungement petition link", kind: "url", required: true },
      { name: "supportingFacts", label: "Supporting facts", kind: "textarea" }
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
      { name: "spouseOneName", label: "Spouse One full legal name", kind: "text", required: true },
      { name: "spouseOneCitizenId", label: "Spouse One Citizen ID", kind: "text", required: true },
      { name: "spouseTwoName", label: "Spouse Two full legal name", kind: "text", required: true },
      { name: "spouseTwoCitizenId", label: "Spouse Two Citizen ID", kind: "text", required: true },
      { name: "ceremonyDateTime", label: "Ceremony date/time", kind: "text", required: true },
      { name: "ceremonyLocation", label: "Ceremony location", kind: "text" },
      { name: "officiant", label: "Officiant full name and title, if known", kind: "text" },
      { name: "documentUrl", label: "Completed certificate document link, if already prepared", kind: "url" },
      { name: "contactInfo", label: "Contact info for certificate delivery", kind: "text", required: true }
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
    prepare: ["Both parties' names", "Marriage certificate or record number if available", "Reason for request", "Property/asset issues if any"],
    guidance: ["Divorce party details and marriage record information remain private inside the DOJ ticket channel."],
    fields: [
      { name: "petitionerName", label: "Petitioner full legal name", kind: "text", required: true },
      { name: "petitionerCitizenId", label: "Petitioner Citizen ID", kind: "text", required: true },
      { name: "respondentName", label: "Respondent full legal name", kind: "text", required: true },
      { name: "reasonForDivorce", label: "Reason for divorce or legal separation request", kind: "textarea", required: true },
      { name: "contactInfo", label: "Contact information", kind: "text", required: true },
      { name: "notes", label: "Notes", kind: "textarea" }
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


