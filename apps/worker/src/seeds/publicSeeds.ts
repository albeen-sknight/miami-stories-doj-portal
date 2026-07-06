import type { AttorneyProfile, DocketEntry, FaqEntry } from "@shotta-doj/shared";

export const faqSeed: FaqEntry[] = [
  {
    id: "faq-general-roleplay",
    category: "General DOJ Information",
    question: "What is the Miami Stories Department of Justice?",
    answerMarkdown:
      "The Miami Stories DOJ is a fictional roleplay legal institution that supports courts, attorneys, public legal resources, and documented justice workflows inside the server.\n\nIt uses a Florida-inspired RP legal framework adapted for Miami Stories. It is not a real government body, legal service, court system, or source of real-world legal advice.",
    sortOrder: 1
  },
  {
    id: "faq-resources",
    category: "General DOJ Information",
    question: "Where can I find official DOJ resources?",
    answerMarkdown:
      "Published legal resources, templates, and guidance are available in the portal at [/resources](/resources).\n\nUse those materials for roleplay procedure only.",
    sortOrder: 2
  },
  {
    id: "faq-leadership",
    category: "DOJ Structure and Leadership",
    question: "Who oversees the DOJ?",
    answerMarkdown:
      "The DOJ structure includes judicial leadership, prosecutors, public defense, licensed private practitioners, and Bar Association functions. Portal permissions are derived from verified Discord roles.",
    sortOrder: 3
  },
  {
    id: "faq-bar",
    category: "Attorneys, Counsel, and Bar Licensing",
    question: "How do I become licensed to practice law?",
    answerMarkdown:
      "- Review official resources.\n- Take the written Bar Examination through the DOJ Portal.\n- Receive Bar Eligible status.\n- Complete any competency check.\n- Receive Bar Active status.",
    sortOrder: 4
  },
  {
    id: "faq-lawyer",
    category: "Attorneys, Counsel, and Bar Licensing",
    question: "How do I request a lawyer?",
    answerMarkdown:
      "Use the lawyer service route at [/services/lawyer](/services/lawyer). Include your character name, Citizen ID, custody status, charges or reason for detention, urgency, and contact details.",
    sortOrder: 5
  },
  {
    id: "faq-criminal-trials",
    category: "Arrests, Pleas, and Criminal Trials",
    question: "How are criminal trial requests started?",
    answerMarkdown:
      "Criminal trial requests should include the defendant, Citizen ID, arrest report number, alleged charges, arresting agency or officer, discovery notes, and scheduling notes.",
    sortOrder: 6
  },
  {
    id: "faq-civil",
    category: "Civil Cases and Protective Orders",
    question: "What should a civil case request include?",
    answerMarkdown:
      "Civil requests should identify the plaintiff, defendant, claim type, facts, date of harm, legal claims, requested relief, and available witnesses or exhibits.",
    sortOrder: 7
  },
  {
    id: "faq-subpoena",
    category: "Subpoenas",
    question: "What information is needed for a subpoena?",
    answerMarkdown:
      "A subpoena request should explain the person, entity, records, testimony, or items requested, along with relevance, necessity, legal basis, and supporting facts.",
    sortOrder: 8
  },
  {
    id: "faq-warrants",
    category: "Warrants",
    question: "Who reviews warrant requests?",
    answerMarkdown:
      "Warrant requests are reviewed by authorized judicial and prosecutorial personnel according to DOJ procedure, probable cause standards, and applicable rights protections.",
    sortOrder: 9
  },
  {
    id: "faq-evidence",
    category: "Evidence, Bodycams, and CCTV",
    question: "Should private evidence be posted publicly?",
    answerMarkdown:
      "No. Do not include confidential case information, private evidence, attorney-client communications, or active investigative details in public portal fields.",
    sortOrder: 10
  },
  {
    id: "faq-services",
    category: "Expungements, Marriage, and Other Services",
    question: "What public services are available?",
    answerMarkdown:
      "The portal supports request forms for defense counsel, court hearings, civil claims, subpoenas, warrants, expungements, marriage certificate reviews, divorce reviews, administrative review, and Bar Examination access.",
    sortOrder: 11
  },
  {
    id: "faq-accountability",
    category: "Judicial Review and Accountability",
    question: "How does the portal support accountability?",
    answerMarkdown:
      "The portal supports accountability through public resources, docket publication, documented request workflows, protected audit records, and dashboard tools for authorized DOJ personnel.",
    sortOrder: 12
  }
];

export const docketSeed: DocketEntry[] = [
  {
    id: "docket-stage-1",
    docketNumber: "DOJ-2026-0001",
    title: "DOJ Public Docket Notice",
    entryType: "PUBLIC_NOTICE",
    status: "PUBLISHED",
    summary: "The public docket lists published cases, notices, and DOJ records available for community review.",
    publishedAt: "2026-06-21T00:00:00.000Z"
  }
];

const alvaroResponsibilities = [
  {
    title: "Judicial Administration",
    description: "Court coordination, judicial standards, docket oversight, and continuity of court operations."
  },
  {
    title: "Due Process and Rights Protection",
    description: "Protection of constitutional rights, fair procedure, impartial hearings, and lawful review of government action."
  },
  {
    title: "Warrant and Subpoena Review",
    description: "Judicial review of warrants, subpoenas, detention issues, probable cause, necessity, specificity, and proportionality."
  },
  {
    title: "Bar Association Oversight",
    description: "Oversight of attorney licensing, Bar governance, professional standards, competency checks, and legal training."
  },
  {
    title: "Evidence and Procedure",
    description: "Review of evidentiary reliability, procedural compliance, suppression issues, dismissal standards, and reasoned rulings."
  },
  {
    title: "DOJ Continuity and Governance",
    description: "Development of a sustainable DOJ structure that separates judicial, prosecutorial, defense, and regulatory functions."
  }
];

export const attorneyProfilesSeed: AttorneyProfile[] = [
  {
    id: "profile-alvaro-serrano-castro",
    displayName: "Alvaro Serrano Castro",
    profileSlug: "alvaro-serrano-castro",
    title: "Chief Justice",
    shortTitle: "Chief Justice",
    office: "Office of the Chief Justice",
    division: "Judicial Division",
    status: "active",
    profileKind: "JUDICIAL_OFFICER",
    barNumber: null,
    practiceAreas: [],
    biographyMarkdown:
      "Alvaro Serrano Castro is a legal officer committed to constitutional rights, fair procedure, and disciplined judicial administration. He currently serves as Chief Justice of the Miami Stories Department of Justice, where his work focuses on building a legal system that is functional, accountable, and sustainable beyond any single officeholder.\n\nHis background includes prior historical RP service as Chief Justice in Aspen City, Circuit Court Judge in Chicago / Section 8, Assistant Attorney General, defense counsel in Power, and approximately four years in law enforcement. That experience gives him a practical understanding of courtroom procedure, police operations, evidence review, prosecution standards, defense advocacy, and departmental decision-making.\n\nHis legal philosophy is based on due process, checks and balances, proportionality, and the separation of judicial, prosecutorial, defense, and regulatory functions. He believes law enforcement must have the authority needed to protect the public, but that authority must remain subject to constitutional safeguards, judicial review, reliable evidence, and professional accountability.",
    motto: "Rights Before Assumptions.\nEvidence Before Conviction.\nJustice Without Compromise.",
    quote: "The burden belongs to the state. Your rights belong to you.",
    responsibilities: alvaroResponsibilities,
    sortOrder: 1,
    contact: ""
  }
];
