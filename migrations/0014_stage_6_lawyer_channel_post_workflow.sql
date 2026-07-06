UPDATE discord_channel_mappings
SET
  notes = 'Deprecated reference only. Lawyer requests post/repost/update directly in REQUEST_LAWYER and do not create private child channels.',
  is_reference_only = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE mapping_key IN ('REQUEST_LAWYER_CATEGORY', 'LAWYER_REQUESTS_CATEGORY');

UPDATE discord_channel_mappings
SET
  notes = 'Lawyer request post destination text channel. Lawyer requests use direct channel posting and do not create private child channels.',
  is_reference_only = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE mapping_key = 'REQUEST_LAWYER';
