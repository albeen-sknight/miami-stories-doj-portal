CREATE UNIQUE INDEX IF NOT EXISTS idx_attorney_profiles_discord_user_id
ON attorney_profiles(discord_user_id)
WHERE discord_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attorney_profiles_last_role_sync
ON attorney_profiles(last_role_sync_at);

UPDATE attorney_profiles
SET status = 'published',
    is_public = 1,
    branch = COALESCE(branch, 'Judicial Branch'),
    affiliations_json = CASE
      WHEN affiliations_json IS NULL OR affiliations_json = '[]' THEN '["Judicial Branch"]'
      ELSE affiliations_json
    END
WHERE id = 'profile-alvaro-serrano-castro'
  AND discord_user_id IS NULL;
