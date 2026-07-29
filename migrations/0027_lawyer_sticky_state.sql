CREATE TABLE IF NOT EXISTS discord_sticky_messages (
  mapping_key TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  last_posted_at TEXT,
  last_checked_at TEXT,
  last_trigger_message_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
