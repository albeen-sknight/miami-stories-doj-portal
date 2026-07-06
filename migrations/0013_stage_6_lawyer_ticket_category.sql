INSERT OR REPLACE INTO discord_channel_mappings (
  id,
  mapping_key,
  channel_name,
  discord_channel_id,
  is_reference_only,
  notes,
  updated_at
) VALUES (
  'category-request-lawyer',
  'REQUEST_LAWYER_CATEGORY',
  'Lawyer Requests',
  '',
  1,
  'Private ticket parent category for lawyer requests. Uses Criminal Trials category because PROJECT_CONFIG_FOR_CODEX.md does not define a dedicated lawyer category. REQUEST_LAWYER remains the public panel text channel.',
  CURRENT_TIMESTAMP
);

UPDATE discord_channel_mappings
SET
  discord_channel_id = '',
  notes = 'Legacy alias for REQUEST_LAWYER_CATEGORY. Do not use REQUEST_LAWYER public panel text channel as a private ticket parent_id.',
  updated_at = CURRENT_TIMESTAMP
WHERE mapping_key = 'LAWYER_REQUESTS_CATEGORY';
