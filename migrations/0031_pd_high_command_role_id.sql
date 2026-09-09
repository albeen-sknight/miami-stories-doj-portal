INSERT INTO role_mappings (
  id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at
) VALUES (
  'role-pd-high-command',
  'PD High Command',
  '1531977170686316624',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  role_name = excluded.role_name,
  discord_role_id = excluded.discord_role_id,
  permission_key = excluded.permission_key,
  is_reference_only = excluded.is_reference_only,
  updated_at = CURRENT_TIMESTAMP;
