ALTER TABLE service_requests ADD COLUMN assigned_judge_user_id TEXT;
ALTER TABLE service_requests ADD COLUMN assigned_judge_display_name TEXT;
ALTER TABLE service_requests ADD COLUMN assigned_judge_discord_id TEXT;
ALTER TABLE service_requests ADD COLUMN assigned_judge_assigned_at TEXT;
ALTER TABLE service_requests ADD COLUMN assigned_judge_assigned_by_user_id TEXT;

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, notes, is_reference_only, updated_at) VALUES
('channel-criminal-trials-transcripts', 'criminal-trials-transcripts', 'criminal-trials-transcripts', '', 'Private transcript archive for criminal trial tickets', 1, CURRENT_TIMESTAMP),
('channel-civil-cases-transcripts', 'civil-cases-transcripts', 'civil-cases-transcripts', '', 'Private transcript archive for civil case tickets', 1, CURRENT_TIMESTAMP),
('channel-subpoena-transcripts', 'subpoena-transcripts', 'subpoena-transcripts', '', 'Private transcript archive for subpoena tickets', 1, CURRENT_TIMESTAMP),
('channel-warrants-executed-transcripts', 'warrants-executed-transcripts', 'warrants-executed-transcripts', '', 'Private transcript archive for warrant tickets', 1, CURRENT_TIMESTAMP),
('channel-expungement-records', 'expungement-records', 'expungement-records', '', 'Private transcript archive for expungement tickets', 1, CURRENT_TIMESTAMP),
('channel-certificates-issued-transcripts', 'certificates-issued-transcripts', 'certificates-issued-transcripts', '', 'Private transcript archive for marriage and divorce certificate tickets', 1, CURRENT_TIMESTAMP),
('channel-bar-exam-transcripts', 'bar-exam-transcripts', 'bar-exam-transcripts', '', 'Private transcript archive for Bar Exam follow-up tickets', 1, CURRENT_TIMESTAMP);
