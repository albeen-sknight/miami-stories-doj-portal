ALTER TABLE docket_entries ADD COLUMN case_id TEXT;
ALTER TABLE docket_entries ADD COLUMN case_type TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE docket_entries ADD COLUMN proceeding_type TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE docket_entries ADD COLUMN plaintiff TEXT;
ALTER TABLE docket_entries ADD COLUMN defendant TEXT;
ALTER TABLE docket_entries ADD COLUMN individuals_involved_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE docket_entries ADD COLUMN judge_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE docket_entries ADD COLUMN judge_name TEXT;
ALTER TABLE docket_entries ADD COLUMN filed_on TEXT;
ALTER TABLE docket_entries ADD COLUMN scheduled_for TEXT;
ALTER TABLE docket_entries ADD COLUMN scheduled_timezone TEXT;
ALTER TABLE docket_entries ADD COLUMN scheduled_discord_timestamp TEXT;
ALTER TABLE docket_entries ADD COLUMN scheduled_discord_relative TEXT;
ALTER TABLE docket_entries ADD COLUMN summary_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE docket_entries ADD COLUMN public_notes_markdown TEXT;
ALTER TABLE docket_entries ADD COLUMN private_notes_markdown TEXT;
ALTER TABLE docket_entries ADD COLUMN linked_service_request_id TEXT REFERENCES service_requests(id) ON DELETE SET NULL;
ALTER TABLE docket_entries ADD COLUMN linked_private_ticket_channel_id TEXT;
ALTER TABLE docket_entries ADD COLUMN linked_petition_url TEXT;
ALTER TABLE docket_entries ADD COLUMN discord_channel_id TEXT;
ALTER TABLE docket_entries ADD COLUMN discord_posted_at TEXT;
ALTER TABLE docket_entries ADD COLUMN discord_updated_at TEXT;
ALTER TABLE docket_entries ADD COLUMN discord_sync_status TEXT NOT NULL DEFAULT 'NOT_POSTED';
ALTER TABLE docket_entries ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE docket_entries ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE docket_entries ADD COLUMN closed_at TEXT;
ALTER TABLE docket_entries ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

UPDATE docket_entries
SET
  case_type = CASE
    WHEN entry_type IS NOT NULL AND entry_type != '' THEN entry_type
    ELSE 'OTHER'
  END,
  proceeding_type = 'OTHER',
  summary_markdown = summary,
  public_notes_markdown = summary,
  is_public = CASE WHEN visibility = 'PUBLIC' THEN 1 ELSE 0 END,
  discord_sync_status = 'NOT_POSTED'
WHERE summary_markdown = '';

CREATE TABLE IF NOT EXISTS docket_events (
  id TEXT PRIMARY KEY,
  docket_entry_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(docket_entry_id) REFERENCES docket_entries(id),
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS docket_number_counters (
  id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prefix, year)
);

CREATE INDEX IF NOT EXISTS idx_docket_public_status ON docket_entries(is_public, is_archived, status, published_at);
CREATE INDEX IF NOT EXISTS idx_docket_case_type ON docket_entries(case_type, proceeding_type, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_docket_linked_request ON docket_entries(linked_service_request_id);
CREATE INDEX IF NOT EXISTS idx_docket_events_entry ON docket_events(docket_entry_id, created_at);
