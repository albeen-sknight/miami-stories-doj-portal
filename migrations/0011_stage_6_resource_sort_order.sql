ALTER TABLE resource_documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_resources_admin_sort
ON resource_documents(is_public, category, sort_order, title);
