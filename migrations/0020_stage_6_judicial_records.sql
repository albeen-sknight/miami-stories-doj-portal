CREATE TABLE IF NOT EXISTS judicial_records (
  id TEXT PRIMARY KEY,
  record_number TEXT NOT NULL UNIQUE,
  record_type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  holding_markdown TEXT,
  reasoning_markdown TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  visibility TEXT NOT NULL DEFAULT 'LAWYER_VISIBLE',
  linked_docket_id TEXT REFERENCES docket_entries(id) ON DELETE SET NULL,
  linked_docket_number TEXT,
  linked_request_id TEXT REFERENCES service_requests(id) ON DELETE SET NULL,
  linked_request_number TEXT,
  subject_name TEXT,
  subject_cid TEXT,
  issued_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  issued_by_display_name TEXT,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  published_at TEXT,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  discord_posted_at TEXT,
  discord_sync_status TEXT NOT NULL DEFAULT 'NOT_POSTED',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  deleted_by_display_name TEXT,
  delete_reason TEXT,
  deleted_metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS judicial_record_counters (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year)
);

CREATE INDEX IF NOT EXISTS idx_judicial_records_status_visibility ON judicial_records(status, visibility, published_at);
CREATE INDEX IF NOT EXISTS idx_judicial_records_category ON judicial_records(category, record_type, updated_at);
CREATE INDEX IF NOT EXISTS idx_judicial_records_deleted ON judicial_records(deleted_at, status, visibility);
CREATE INDEX IF NOT EXISTS idx_judicial_records_links ON judicial_records(linked_docket_number, linked_request_number);

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES
('channel-judicial-records', 'JUDICIAL_RECORDS', 'judicial-records', '', 0, 'Public judicial records publishing channel for orders, opinions, precedent, case law, interpretations, appeal decisions, standing orders, sentencing guidance, and advisory notices.', CURRENT_TIMESTAMP);
