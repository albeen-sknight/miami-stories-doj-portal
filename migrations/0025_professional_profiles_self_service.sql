ALTER TABLE attorney_profiles ADD COLUMN discord_user_id TEXT;
ALTER TABLE attorney_profiles ADD COLUMN branch TEXT;
ALTER TABLE attorney_profiles ADD COLUMN affiliations_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE attorney_profiles ADD COLUMN experience_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE attorney_profiles ADD COLUMN education_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE attorney_profiles ADD COLUMN achievements_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE attorney_profiles ADD COLUMN professional_history_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE attorney_profiles ADD COLUMN profile_image_url TEXT;
ALTER TABLE attorney_profiles ADD COLUMN last_role_sync_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attorney_profiles_discord_user_id
ON attorney_profiles(discord_user_id)
WHERE discord_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attorney_profiles_branch_status
ON attorney_profiles(branch, status, is_public, deleted_at);

UPDATE attorney_profiles
SET status = 'published'
WHERE status = 'active' AND is_public = 1;

UPDATE attorney_profiles
SET
  branch = COALESCE(branch, 'Judicial Branch'),
  affiliations_json = CASE
    WHEN affiliations_json IS NULL OR affiliations_json = '[]' THEN '["Judicial Branch"]'
    ELSE affiliations_json
  END
WHERE id = 'profile-alvaro-serrano-castro';

UPDATE role_mappings
SET role_name = 'Judicial Branch',
    discord_role_id = '1523778635104780429',
    permission_key = NULL,
    is_reference_only = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'role-judicial-branch' OR role_name = 'Judicial Branch';

INSERT OR IGNORE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at)
VALUES ('role-judicial-branch', 'Judicial Branch', '1523778635104780429', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE role_mappings
SET role_name = 'Executive Branch',
    discord_role_id = '1523779395716776016',
    permission_key = NULL,
    is_reference_only = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'role-executive-branch' OR role_name IN ('Executive Branch', 'Executive / Prosecutorial Branch');

INSERT OR IGNORE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at)
VALUES ('role-executive-branch', 'Executive Branch', '1523779395716776016', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE role_mappings
SET role_name = 'Defense Branch',
    discord_role_id = '1523782369461403888',
    permission_key = NULL,
    is_reference_only = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'role-defense-branch' OR role_name = 'Defense Branch';

INSERT OR IGNORE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at)
VALUES ('role-defense-branch', 'Defense Branch', '1523782369461403888', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
