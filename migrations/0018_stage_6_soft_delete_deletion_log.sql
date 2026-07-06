ALTER TABLE docket_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE docket_entries ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE docket_entries ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE docket_entries ADD COLUMN delete_reason TEXT;
ALTER TABLE docket_entries ADD COLUMN deleted_metadata_json TEXT;

ALTER TABLE service_requests ADD COLUMN deleted_at TEXT;
ALTER TABLE service_requests ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE service_requests ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE service_requests ADD COLUMN delete_reason TEXT;
ALTER TABLE service_requests ADD COLUMN deleted_metadata_json TEXT;

ALTER TABLE faq_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE faq_entries ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE faq_entries ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE faq_entries ADD COLUMN delete_reason TEXT;
ALTER TABLE faq_entries ADD COLUMN deleted_metadata_json TEXT;

ALTER TABLE resource_documents ADD COLUMN deleted_at TEXT;
ALTER TABLE resource_documents ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE resource_documents ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE resource_documents ADD COLUMN delete_reason TEXT;
ALTER TABLE resource_documents ADD COLUMN deleted_metadata_json TEXT;

ALTER TABLE bar_exam_attempts ADD COLUMN deleted_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN delete_reason TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN deleted_metadata_json TEXT;

ALTER TABLE bar_exam_versions ADD COLUMN deleted_at TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN delete_reason TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN deleted_metadata_json TEXT;

CREATE TABLE IF NOT EXISTS deletion_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_number TEXT,
  entity_title TEXT,
  deleted_by_user_id TEXT,
  deleted_by_display_name TEXT,
  delete_reason TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  restored_at TEXT,
  restored_by_user_id TEXT,
  restored_by_display_name TEXT,
  restore_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_entity ON deletion_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deletion_log_created ON deletion_log(created_at);
CREATE INDEX IF NOT EXISTS idx_docket_deleted ON docket_entries(deleted_at, is_public, visibility);
CREATE INDEX IF NOT EXISTS idx_requests_deleted ON service_requests(deleted_at, status, request_type);
CREATE INDEX IF NOT EXISTS idx_faq_deleted ON faq_entries(deleted_at, is_public, sort_order);
CREATE INDEX IF NOT EXISTS idx_resources_deleted ON resource_documents(deleted_at, is_public, category);
CREATE INDEX IF NOT EXISTS idx_bar_attempts_deleted ON bar_exam_attempts(deleted_at, status, exam_track);
CREATE INDEX IF NOT EXISTS idx_bar_versions_deleted ON bar_exam_versions(deleted_at, is_active, exam_track);
