INSERT INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, created_at, updated_at) VALUES
('role-judicial-branch', 'Judicial Branch', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-da-paralegal', 'DA Paralegal', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-executive-branch', 'Executive Branch', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-defense-paralegal', 'Defense Paralegal', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-defense-branch', 'Defense Branch', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-atf-special-agent', 'ATF Special Agent', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-pd-high-command', 'PD High Command', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-pd-liaison', 'PD Liaison', '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(discord_role_id) DO UPDATE SET
  role_name = excluded.role_name,
  is_reference_only = CASE
    WHEN role_mappings.permission_key IS NULL THEN 1
    ELSE role_mappings.is_reference_only
  END,
  updated_at = CURRENT_TIMESTAMP;
