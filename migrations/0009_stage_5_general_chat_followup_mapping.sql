DELETE FROM discord_channel_mappings WHERE mapping_key = 'BAR_EXAM_PUBLIC_FOLLOWUP';

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES
('channel-general-chat', 'GENERAL_CHAT', 'general-chat', '', 0, 'General chat fallback for minimal non-sensitive Bar Exam follow-up mentions only. Do not post scores, answers, keys, rubrics, or reviewer notes here.', CURRENT_TIMESTAMP);
