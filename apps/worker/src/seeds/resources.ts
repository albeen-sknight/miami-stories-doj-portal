import type { ResourceDocument } from "@shotta-doj/shared";

export const resourceDocumentsSeed: ResourceDocument[] = [
  {
    id: "charter-rights",
    title: "Charter and Declaration of Rights",
    category: "LEGAL_AUTHORITY",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1iwj52akac2ctqS7vF3L01aaSQTVsz4qQhRuU4B-avu8/edit?usp=sharing",
    description: "Foundational rights document for Miami Stories legal authority and protected RP rights.",
    isPublic: true
  },
  {
    id: "sources-of-law",
    title: "Sources of Law",
    category: "LEGAL_AUTHORITY",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1YoMANNUPte9UsS_c2mqqYBQG7dZnCkznyaObvIDMa4o/edit",
    description: "Recognized hierarchy and sources of law used by the DOJ.",
    isPublic: true
  },
  {
    id: "master-penal-code",
    title: "Master Penal Code",
    category: "LEGAL_AUTHORITY",
    version: "v1.0",
    url: "https://docs.google.com/spreadsheets/d/1MIzJyh0acUGM53-vwQ9tnx5qYWfwlnaPvlmEIbJShic/edit?usp=sharing",
    description: "Miami Stories legal code reference for criminal charges and RP-friendly classifications.",
    isPublic: true
  },
  {
    id: "doj-interpretations",
    title: "DOJ Interpretations",
    category: "DOJ_PROCEDURE",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1F6jsSghsG5b48SwBFfV--Ou837h2jgZaE-QGQ13ades/edit?usp=sharing",
    description: "Official DOJ interpretation guidance for procedures and legal standards.",
    isPublic: true
  },
  {
    id: "doj-sop",
    title: "DOJ Standard Operating Procedure",
    category: "DOJ_PROCEDURE",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1k9i0XFuigdLe-jGlYYHp5w23mxvuYgs1KitEFWIP884/edit?usp=sharing",
    description: "Standard Operating Procedure for DOJ operations, ethics, evidence, and court workflow.",
    isPublic: true
  },
  {
    id: "structure-governance",
    title: "DOJ Structure and Governance Model",
    category: "ORGANIZATION_REGULATION",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1H6FMrTQrGG2mXa-5DpvPzGRQ6RnGaVLLElySgUvw1vo/edit?usp=sharing",
    description: "DOJ hierarchy, branches, authority, and governance model.",
    isPublic: true
  },
  {
    id: "firearms-licensing",
    title: "Firearms Licensing Guidelines",
    category: "ORGANIZATION_REGULATION",
    version: "v1.1",
    url: "https://docs.google.com/document/d/1xY7EHJtZH7XAwIcRE8nGFejzdbKbAg66OVVzNh0HIT8/edit?usp=sharing",
    description: "Florida-inspired RP guidance for weapons review, licensing concepts, and administrative requirements.",
    isPublic: true
  },
  {
    id: "attorney-handbook",
    title: "Attorney Training and Practice Handbook",
    category: "ATTORNEY_TRAINING",
    version: "v1.1",
    url: "https://docs.google.com/document/d/1pEf85SFSXhcstil41CjM08QgLp1rL_Fnsf6SOwdg6ng/edit?usp=sharing",
    description: "Training and practice handbook for attorneys, public defenders, prosecutors, and Bar candidates.",
    isPublic: true
  },
  {
    id: "resource-guide",
    title: "DOJ Resources Portal Complete Guide",
    category: "FAQ",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1SDBioLlv9tFqZxJpHfubHMNRtmtwpvi54PaW4FVZYBo/edit?usp=drivesdk",
    description: "Complete legacy DOJ resources portal reference document.",
    isPublic: true
  },
  {
    id: "civil-case-template",
    title: "Civil Claim Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1QJrKqGkk8kg_DwyM2eHZQGQbrTbv9MhciUWfNJj8Zys/edit?usp=sharing",
    description: "Template for filing a Miami Stories civil claim.",
    isPublic: true
  },
  {
    id: "subpoena-template",
    title: "Subpoena Request Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1q29NqE0Qyt_vFRbbjjjI-lvJQnDOjkw8RnBngeThigk/edit?usp=sharing",
    description: "Template for requesting a subpoena for testimony, records, or evidence.",
    isPublic: true
  },
  {
    id: "arrest-warrant-template",
    title: "Warrant Request Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1pxrO2_reBG5p-txAI8h8ipgBZXQqb_wS3j4NXb75tWE/edit?usp=sharing",
    description: "Template for requesting Miami Stories warrant review.",
    isPublic: true
  },
  {
    id: "search-seizure-template",
    title: "Search and Seizure Review Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1VoF1wJW9RwrQ5BiD8EnpYX7AtjFxQ_Z2hxmNZDYKAi4/edit?usp=sharing",
    description: "Template for requesting Miami Stories search and seizure review.",
    isPublic: true
  },
  {
    id: "expungement-template",
    title: "Expungement Request Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1ulbN1y152M8sKnSsotZmM7zJUWO0p1QySUvJ1UtsFik/edit?usp=sharing",
    description: "Template for filing or requesting an expungement.",
    isPublic: true
  },
  {
    id: "marriage-script-template",
    title: "Marriage Officiation Script Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1tp7AUS-YNIEj9rgim6DG4IfkbLnQJP1BlMSIylt_OVA/edit?usp=sharing",
    description: "Template/script for marriage officiation ceremonies.",
    isPublic: true
  },
  {
    id: "marriage-certificate-template",
    title: "Marriage Certificate Template",
    category: "TEMPLATES",
    version: "v1.0",
    url: "https://docs.google.com/document/d/1HvTZUS91APs-8zukUqMWK8MCU86FVwZLFjEkdrPmqKw/edit?usp=sharing",
    description: "Template for issuing marriage certificates.",
    isPublic: true
  }
];
