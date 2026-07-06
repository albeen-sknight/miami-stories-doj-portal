INSERT OR REPLACE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, updated_at) VALUES
('role-civilian', 'Civilian', '', 'CIVILIAN', 0, CURRENT_TIMESTAMP),
('role-bar-candidate', 'Bar Candidate', '', 'BAR_CANDIDATE', 0, CURRENT_TIMESTAMP),
('role-bar-eligible', 'Bar Eligible', '', 'BAR_ELIGIBLE', 0, CURRENT_TIMESTAMP),
('role-bar-licensed', 'Bar Licensed', '', 'BAR_ACTIVE', 0, CURRENT_TIMESTAMP),
('role-private-practitioner', 'Private Practitioner', '', 'BAR_ACTIVE', 0, CURRENT_TIMESTAMP),
('role-defense-attorney', 'Defense Attorney', '', 'DEFENSE_ATTORNEY', 0, CURRENT_TIMESTAMP),
('role-public-defender', 'Public Defender', '', 'PUBLIC_DEFENDER_CERTIFIED', 0, CURRENT_TIMESTAMP),
('role-attorney-general', 'Attorney General', '', 'PROSECUTOR', 0, CURRENT_TIMESTAMP),
('role-assistant-attorney-general', 'Assistant Attorney General', '', 'PROSECUTOR', 0, CURRENT_TIMESTAMP),
('role-district-attorney', 'District Attorney', '', 'PROSECUTOR', 0, CURRENT_TIMESTAMP),
('role-assistant-district-attorney', 'Assistant District Attorney', '', 'PROSECUTOR', 0, CURRENT_TIMESTAMP),
('role-judge', 'Judge', '', 'JUDGE', 0, CURRENT_TIMESTAMP),
('role-supreme-court-justice', 'Supreme Court Justice', '', 'JUSTICE', 0, CURRENT_TIMESTAMP),
('role-bar-association-member', 'Bar Association Member', '', 'BAR_ASSOCIATION_MEMBER', 0, CURRENT_TIMESTAMP),
('role-chief-justice', 'Chief Justice', '', 'CHIEF_JUSTICE', 0, CURRENT_TIMESTAMP),
('role-doj-portal-admin', 'DOJ Portal Admin', '', 'ADMIN', 0, CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES
('channel-bar-exam-submissions', 'BAR_EXAM_SUBMISSIONS', 'bar-exam-responses', '', 0, 'Primary Bar Exam submissions channel', CURRENT_TIMESTAMP),
('channel-doj-docket', 'DOJ_DOCKET', 'doj-docket', '', 0, 'Public docket publishing channel', CURRENT_TIMESTAMP),
('channel-request-lawyer', 'REQUEST_LAWYER', 'request-a-lawyer', '', 0, 'Lawyer request intake', CURRENT_TIMESTAMP),
('channel-request-criminal-trial', 'REQUEST_CRIMINAL_TRIAL', 'request-criminal-trial', '', 0, 'Criminal trial request intake', CURRENT_TIMESTAMP),
('channel-request-civil-case', 'REQUEST_CIVIL_CASE', 'request-civil-case', '', 0, 'Civil case request intake', CURRENT_TIMESTAMP),
('channel-request-subpoena', 'REQUEST_SUBPOENA', 'request-subpoena', '', 0, 'Subpoena request intake', CURRENT_TIMESTAMP),
('channel-request-warrant', 'REQUEST_WARRANT', 'request-warrant', '', 0, 'Warrant request intake', CURRENT_TIMESTAMP),
('channel-request-expungement', 'REQUEST_EXPUNGEMENT', 'request-expungement', '', 0, 'Expungement request intake', CURRENT_TIMESTAMP),
('channel-request-marriage', 'REQUEST_MARRIAGE', 'request-marriage-certificate', '', 0, 'Marriage request intake', CURRENT_TIMESTAMP),
('channel-request-divorce', 'REQUEST_DIVORCE', 'request-divorce', '', 0, 'Divorce request intake', CURRENT_TIMESTAMP),
('channel-admin-log', 'ADMIN_LOG', 'admin-log', '', 0, 'Administrative audit channel', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO resource_documents (id, title, category, version, url, description, is_public) VALUES
('charter-rights', 'Charter and Declaration of Rights', 'LEGAL_AUTHORITY', 'v1.0', 'https://docs.google.com/document/d/1iwj52akac2ctqS7vF3L01aaSQTVsz4qQhRuU4B-avu8/edit?usp=sharing', 'Foundational rights document for Miami Stories legal authority and protected RP rights.', 1),
('sources-of-law', 'Sources of Law', 'LEGAL_AUTHORITY', 'v1.0', 'https://docs.google.com/document/d/1YoMANNUPte9UsS_c2mqqYBQG7dZnCkznyaObvIDMa4o/edit', 'Recognized hierarchy and sources of law used by the DOJ.', 1),
('master-penal-code', 'Master Penal Code', 'LEGAL_AUTHORITY', 'v1.0', 'https://docs.google.com/spreadsheets/d/1MIzJyh0acUGM53-vwQ9tnx5qYWfwlnaPvlmEIbJShic/edit?usp=sharing', 'Master Penal Code reference for criminal charges and classifications.', 1);

INSERT OR IGNORE INTO faq_entries (id, category, question, answer_markdown, sort_order, is_public) VALUES
('faq-general-roleplay', 'General DOJ Information', 'What is the Miami Stories Department of Justice?', 'The Miami Stories DOJ is a fictional roleplay legal institution that supports courts, attorneys, public legal resources, and documented justice workflows inside the server.\n\nIt is not a real government body, legal service, court system, or source of real-world legal advice.', 1, 1);

INSERT OR IGNORE INTO attorney_profiles (id, display_name, bar_number, practice_areas_json, status, contact, is_public) VALUES
('registry-placeholder-1', 'Bar Registry Pending Migration', 'SC-DOJ-TBD', '["Public Defense","Civil Practice","Criminal Defense"]', 'Registry Placeholder', 'Use the lawyer request service route', 1);

INSERT OR IGNORE INTO docket_entries (id, docket_number, title, entry_type, status, summary, visibility, published_at) VALUES
('docket-stage-1', 'DOJ-2026-0001', 'Stage 1 Public Docket Placeholder', 'PUBLIC_NOTICE', 'PUBLISHED', 'The public docket API and interface are ready for published cases and notices in later stages.', 'PUBLIC', '2026-06-21T00:00:00.000Z');
