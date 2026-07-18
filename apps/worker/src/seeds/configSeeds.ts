export const roleMappingsSeed = [
  ["Civilian", "", "CIVILIAN"],
  ["Bar Candidate", "", "BAR_CANDIDATE"],
  ["Bar Eligible", "", "BAR_ELIGIBLE"],
  ["Bar Licensed", "", "BAR_ACTIVE"],
  ["Private Practitioner", "", "BAR_ACTIVE"],
  ["Defense Attorney", "", "DEFENSE_ATTORNEY"],
  ["Public Defender", "", "PUBLIC_DEFENDER_CERTIFIED"],
  ["Attorney General", "", "PROSECUTOR"],
  ["Assistant Attorney General", "", "PROSECUTOR"],
  ["District Attorney", "", "PROSECUTOR"],
  ["Assistant District Attorney", "", "PROSECUTOR"],
  ["Judge", "", "JUDGE"],
  ["Supreme Court Justice", "", "JUSTICE"],
  ["Bar Association Member", "", "BAR_ASSOCIATION_MEMBER"],
  ["Chief Justice", "", "CHIEF_JUSTICE"],
  ["DOJ Portal Admin", "", "ADMIN"]
] as const;

export const referenceRoleMappingsSeed = [
  ["Judicial Branch", "1523778635104780429"],
  ["DA Paralegal", ""],
  ["Executive Branch", "1523779395716776016"],
  ["Defense Paralegal", ""],
  ["Defense Branch", "1523782369461403888"],
  ["ATF Special Agent", ""],
  ["PD High Command", ""],
  ["PD Liaison", ""]
] as const;

export const discordChannelMappingsSeed = [
  ["BAR_EXAM_SUBMISSIONS", "", "Primary Bar Exam submissions channel"],
  ["GENERAL_CHAT", "", "General chat fallback for safe non-sensitive candidate follow-up mentions"],
  ["DOJ_DOCKET", "", "Public docket publishing channel"],
  ["JUDICIAL_RECORDS", "", "Public judicial records publishing channel"],
  ["REQUEST_LAWYER", "", "Lawyer request intake"],
  ["REQUEST_CRIMINAL_TRIAL", "", "Criminal trial request intake"],
  ["REQUEST_CIVIL_CASE", "", "Civil case request intake"],
  ["REQUEST_SUBPOENA", "", "Subpoena request intake"],
  ["REQUEST_WARRANT", "", "Warrant request intake"],
  ["REQUEST_SEARCH_SEIZURE", "", "Search and seizure warrant request intake"],
  ["REQUEST_EXPUNGEMENT", "", "Expungement request intake"],
  ["REQUEST_MARRIAGE", "", "Marriage request intake"],
  ["REQUEST_DIVORCE", "", "Divorce request intake"],
  ["ADMIN_LOG", "", "Administrative audit channel"]
] as const;

export const discordCategoryMappingsSeed = [
  ["CRIMINAL_TRIALS_CATEGORY", "", "Private ticket parent category for criminal trial requests"],
  ["CIVIL_CASES_CATEGORY", "", "Private ticket parent category for civil case requests"],
  ["SUBPOENAS_CATEGORY", "", "Private ticket parent category for subpoena requests"],
  ["WARRANTS_CATEGORY", "", "Private ticket parent category for arrest and search/seizure warrant requests"],
  ["EXPUNGEMENTS_CATEGORY", "", "Private ticket parent category for expungement requests"],
  ["MARRIAGE_DIVORCE_CATEGORY", "", "Private ticket parent category for marriage and divorce requests"],
  ["BAR_EXAM_FOLLOWUP_CATEGORY", "", "Private ticket parent category for Bar Exam follow-up channels"],
  ["REQUEST_LAWYER_CATEGORY", "", "Deprecated reference only. Lawyer requests post directly to REQUEST_LAWYER and do not create private child channels"],
  ["LAWYER_REQUESTS_CATEGORY", "", "Deprecated legacy alias. Lawyer requests post directly to REQUEST_LAWYER and do not create private child channels"]
] as const;

export const referenceDiscordChannelsSeed = [
  ["announcements", ""],
  ["resource-compendium", ""],
  ["faq", ""],
  ["doj-bar-exam", ""],
  ["welcome", ""],
  ["general-chat", ""],
  ["role-request", ""],
  ["command-general", ""],
  ["request-search-seizure", ""],
  ["internal-announcements", ""],
  ["prosecution-general-chat", ""],
  ["defense-general-chat", ""],
  ["doj-gen-chat", ""],
  ["case-assignments", ""],
  ["training-and-resources", ""],
  ["doj-questions-and-claims", ""],
  ["judge-chambers", ""],
  ["bar-exam-template", ""],
  ["bar-exam-responses", ""],
  ["leo-doj-liaison", ""],
  ["warrant-approvals", ""],
  ["criminal-trials-transcripts", ""],
  ["civil-cases-transcripts", ""],
  ["subpoena-transcripts", ""],
  ["warrants-executed-transcripts", ""],
  ["expungement-records", ""],
  ["certificates-issued-transcripts", ""],
  ["bar-exam-transcripts", ""],
  ["admin-log", ""]
] as const;
