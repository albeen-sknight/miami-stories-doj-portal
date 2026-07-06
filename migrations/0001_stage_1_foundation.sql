CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_role_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_role_id TEXT NOT NULL,
  role_name TEXT,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, discord_role_id)
);

CREATE TABLE IF NOT EXISTS role_mappings (
  id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  discord_role_id TEXT NOT NULL UNIQUE,
  permission_key TEXT,
  is_reference_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS resource_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faq_entries (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attorney_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bar_number TEXT UNIQUE,
  practice_areas_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  requester_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  requester_display_name TEXT,
  payload_json TEXT NOT NULL,
  public_summary TEXT,
  discord_channel_key TEXT,
  discord_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS docket_entries (
  id TEXT PRIMARY KEY,
  docket_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  related_request_id TEXT REFERENCES service_requests(id) ON DELETE SET NULL,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bar_exam_versions (
  id TEXT PRIMARY KEY,
  version_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  time_limit_minutes INTEGER NOT NULL DEFAULT 1440,
  passing_score INTEGER NOT NULL DEFAULT 80,
  public_instructions_markdown TEXT NOT NULL DEFAULT '',
  reviewer_metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bar_exam_attempts (
  id TEXT PRIMARY KEY,
  attempt_number TEXT NOT NULL UNIQUE,
  version_id TEXT NOT NULL REFERENCES bar_exam_versions(id),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  character_name TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  identity_lock_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPENED',
  score INTEGER,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bar_exam_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES bar_exam_attempts(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  score INTEGER,
  reviewer_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_channel_mappings (
  id TEXT PRIMARY KEY,
  mapping_key TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  discord_channel_id TEXT NOT NULL,
  is_reference_only INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_role_cache_user ON user_role_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_public_category ON resource_documents(is_public, category);
CREATE INDEX IF NOT EXISTS idx_faq_public_sort ON faq_entries(is_public, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_requests_type_status ON service_requests(request_type, status);
CREATE INDEX IF NOT EXISTS idx_docket_visibility_published ON docket_entries(visibility, published_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_exam_attempt_identity_active
ON bar_exam_attempts(identity_lock_key)
WHERE status IN (
  'OPENED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'PASSED',
  'FAILED',
  'REFERRED_FOR_INTERVIEW'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_exam_answers_attempt_question
ON bar_exam_answers(attempt_id, question_key);
