ALTER TABLE service_requests ADD COLUMN public_tracking_code TEXT;
ALTER TABLE service_requests ADD COLUMN requester_discord_username TEXT;
ALTER TABLE service_requests ADD COLUMN requester_contact TEXT;
ALTER TABLE service_requests ADD COLUMN document_url TEXT;
ALTER TABLE service_requests ADD COLUMN template_url TEXT;
ALTER TABLE service_requests ADD COLUMN discord_public_channel_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_channel_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_message_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_category_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ping_role_id TEXT;
ALTER TABLE service_requests ADD COLUMN discord_ticket_status TEXT NOT NULL DEFAULT 'NOT_ATTEMPTED';
ALTER TABLE service_requests ADD COLUMN posted_to_discord_at TEXT;
ALTER TABLE service_requests ADD COLUMN assigned_role_key TEXT;

CREATE TABLE IF NOT EXISTS service_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES service_requests(id),
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS request_number_counters (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_type, year)
);

CREATE INDEX IF NOT EXISTS idx_service_requests_requester ON service_requests(requester_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_requests_status_type ON service_requests(status, request_type, created_at);
CREATE INDEX IF NOT EXISTS idx_service_request_events_request ON service_request_events(request_id, created_at);

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES
('channel-request-search-seizure', 'REQUEST_SEARCH_SEIZURE', 'request-search-seizure', '', 0, 'Search and seizure warrant request public entry channel; never post full request details here.', CURRENT_TIMESTAMP),
('category-criminal-trials', 'CRIMINAL_TRIALS_CATEGORY', 'Criminal Trials', '', 1, 'Private ticket parent category for criminal trial requests.', CURRENT_TIMESTAMP),
('category-civil-cases', 'CIVIL_CASES_CATEGORY', 'Civil Cases', '', 1, 'Private ticket parent category for civil case requests.', CURRENT_TIMESTAMP),
('category-subpoenas', 'SUBPOENAS_CATEGORY', 'Subpoenas', '', 1, 'Private ticket parent category for subpoena requests.', CURRENT_TIMESTAMP),
('category-warrants', 'WARRANTS_CATEGORY', 'Warrants', '', 1, 'Private ticket parent category for arrest and search/seizure warrant requests.', CURRENT_TIMESTAMP),
('category-expungements', 'EXPUNGEMENTS_CATEGORY', 'Expungements', '', 1, 'Private ticket parent category for expungement requests.', CURRENT_TIMESTAMP),
('category-marriage-divorce', 'MARRIAGE_DIVORCE_CATEGORY', 'Marriage & Divorce Certificates', '', 1, 'Private ticket parent category for marriage and divorce requests.', CURRENT_TIMESTAMP),
('category-bar-exam-followup', 'BAR_EXAM_FOLLOWUP_CATEGORY', 'Bar Exam Follow-up', '', 1, 'Private ticket parent category for Bar Exam follow-up channels.', CURRENT_TIMESTAMP),
('category-lawyer-requests', 'LAWYER_REQUESTS_CATEGORY', 'Lawyer Requests', '', 1, 'Optional private ticket parent category for lawyer requests. Configure before enabling private channel creation for lawyer requests.', CURRENT_TIMESTAMP);
