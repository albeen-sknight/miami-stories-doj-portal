DROP INDEX IF EXISTS idx_bar_exam_attempt_identity_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_exam_attempt_identity_active
ON bar_exam_attempts(identity_lock_key)
WHERE status IN (
  'OPENED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'PASSED',
  'FAILED',
  'REFERRED_FOR_INTERVIEW',
  'NEEDS_CANDIDATE_FOLLOW_UP',
  'REOPENED'
);

INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES
('channel-general-chat', 'GENERAL_CHAT', 'general-chat', '', 0, 'General chat fallback for minimal non-sensitive Bar Exam follow-up mentions only. Do not post scores, answers, keys, rubrics, or reviewer notes here.', CURRENT_TIMESTAMP);
