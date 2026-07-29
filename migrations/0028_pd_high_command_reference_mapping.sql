-- Reference-only placeholder for Phase 3 criminal trial auto-access.
-- Fill discord_role_id with the real PD High Command role snowflake to enable
-- automatic private ticket access for PD High Command requesters.
INSERT OR IGNORE INTO role_mappings (
  id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at
) VALUES (
  'role-pd-high-command',
  'PD High Command',
  'reference-pd-high-command',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

UPDATE role_mappings
SET role_name = 'PD High Command',
    permission_key = NULL,
    is_reference_only = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'role-pd-high-command'
  AND (discord_role_id = '' OR discord_role_id = 'reference-pd-high-command');
