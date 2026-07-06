CREATE TABLE IF NOT EXISTS discord_ticket_transcripts (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_number TEXT,
  discord_channel_id TEXT NOT NULL,
  discord_channel_name TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  transcript_json TEXT NOT NULL DEFAULT '[]',
  archive_channel_id TEXT,
  archive_message_id TEXT,
  created_by_user_id TEXT,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_channel ON discord_ticket_transcripts(discord_channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_source ON discord_ticket_transcripts(source_type, source_id, created_at);

ALTER TABLE service_requests ADD COLUMN discord_ticket_closed_at TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_closed_by_user_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_close_reason TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_deleted_at TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_deleted_by_user_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_delete_reason TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_transcript_id TEXT;

ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_closed_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_closed_by_user_id TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_close_reason TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_deleted_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_deleted_by_user_id TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_delete_reason TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN followup_channel_transcript_id TEXT;
