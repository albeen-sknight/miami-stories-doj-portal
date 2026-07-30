CREATE TABLE IF NOT EXISTS discord_moderation_cases (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  moderator_user_id TEXT,
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_discord_moderation_cases_target
ON discord_moderation_cases(guild_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_discord_moderation_cases_action
ON discord_moderation_cases(guild_id, action_type, created_at);

CREATE TABLE IF NOT EXISTS discord_admin_actions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_user_id TEXT,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discord_admin_actions_actor
ON discord_admin_actions(guild_id, actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_discord_admin_actions_target
ON discord_admin_actions(guild_id, target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS discord_message_logs (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  author_user_id TEXT,
  action_type TEXT NOT NULL,
  before_content TEXT,
  after_content TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discord_message_logs_channel
ON discord_message_logs(guild_id, channel_id, created_at);

INSERT OR IGNORE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, created_at, updated_at)
VALUES
  ('channel-admin-log-channel-id', 'ADMIN_LOG_CHANNEL_ID', 'admin-log-channel-id', '', 1, 'Optional admin action log channel for Discord bot commands.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('channel-discord-admin-log-channel-id', 'DISCORD_ADMIN_LOG_CHANNEL_ID', 'discord-admin-log-channel-id', '', 1, 'General fallback Discord admin log channel.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('channel-mod-log-channel-id', 'MOD_LOG_CHANNEL_ID', 'mod-log-channel-id', '', 1, 'Optional moderation action log channel for Discord bot commands.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('channel-message-log-channel-id', 'MESSAGE_LOG_CHANNEL_ID', 'message-log-channel-id', '', 1, 'Reserved for future Gateway deleted/edited message logging.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('channel-member-log-channel-id', 'MEMBER_LOG_CHANNEL_ID', 'member-log-channel-id', '', 1, 'Reserved for future Gateway member join/leave logging.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
