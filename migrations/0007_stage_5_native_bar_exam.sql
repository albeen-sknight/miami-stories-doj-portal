ALTER TABLE bar_exam_versions ADD COLUMN exam_track TEXT NOT NULL DEFAULT 'DOJ';
ALTER TABLE bar_exam_versions ADD COLUMN version_code TEXT NOT NULL DEFAULT 'A';
ALTER TABLE bar_exam_versions ADD COLUMN version_label TEXT NOT NULL DEFAULT 'DOJ-A';
ALTER TABLE bar_exam_versions ADD COLUMN description TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN total_points INTEGER NOT NULL DEFAULT 100;
ALTER TABLE bar_exam_versions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bar_exam_versions ADD COLUMN candidate_payload_json TEXT NOT NULL DEFAULT '{"instructionsMarkdown":"","questions":[]}';
ALTER TABLE bar_exam_versions ADD COLUMN reviewer_payload_json TEXT;
ALTER TABLE bar_exam_versions ADD COLUMN answer_key_json TEXT;

ALTER TABLE bar_exam_attempts ADD COLUMN discord_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bar_exam_attempts ADD COLUMN candidate_name TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN candidate_phone TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN candidate_email TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN exam_track TEXT NOT NULL DEFAULT 'DOJ';
ALTER TABLE bar_exam_attempts ADD COLUMN version_label TEXT NOT NULL DEFAULT '';
ALTER TABLE bar_exam_attempts ADD COLUMN started_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN deadline_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN graded_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN final_score REAL;
ALTER TABLE bar_exam_attempts ADD COLUMN decision TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN reviewer_name TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN integrity_acknowledged_at TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN integrity_text_version TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN discord_notification_channel_id TEXT;
ALTER TABLE bar_exam_attempts ADD COLUMN discord_notification_message_id TEXT;

ALTER TABLE bar_exam_answers ADD COLUMN answer_text TEXT;
ALTER TABLE bar_exam_answers ADD COLUMN selected_choice TEXT;
ALTER TABLE bar_exam_answers ADD COLUMN draft_saved_at TEXT;
ALTER TABLE bar_exam_answers ADD COLUMN submitted_at TEXT;
ALTER TABLE bar_exam_answers ADD COLUMN points_awarded REAL;
ALTER TABLE bar_exam_answers ADD COLUMN max_points REAL;
ALTER TABLE bar_exam_answers ADD COLUMN auto_score_json TEXT;

UPDATE bar_exam_versions
SET
  exam_track = CASE WHEN title LIKE '%Defense%' THEN 'DEFENSE' ELSE 'DOJ' END,
  version_code = CASE
    WHEN version_key LIKE '%C%' OR title LIKE '%Version C%' THEN 'C'
    WHEN version_key LIKE '%B%' OR title LIKE '%Version B%' THEN 'B'
    ELSE 'A'
  END,
  version_label = CASE
    WHEN title LIKE '%Defense%' THEN 'DEFENSE-A'
    ELSE 'DOJ-A'
  END,
  candidate_payload_json = CASE
    WHEN public_instructions_markdown IS NOT NULL AND public_instructions_markdown != ''
      THEN json_object('instructionsMarkdown', public_instructions_markdown, 'questions', json_array())
    ELSE candidate_payload_json
  END
WHERE candidate_payload_json = '{"instructionsMarkdown":"","questions":[]}';

UPDATE bar_exam_attempts
SET
  started_at = COALESCE(started_at, opened_at),
  deadline_at = COALESCE(deadline_at, datetime(opened_at, '+24 hours')),
  final_score = COALESCE(final_score, score),
  graded_at = COALESCE(graded_at, reviewed_at),
  discord_user_id = COALESCE(discord_user_id, identity_lock_key),
  candidate_name = COALESCE(candidate_name, character_name)
WHERE started_at IS NULL OR deadline_at IS NULL;

UPDATE bar_exam_answers
SET
  answer_text = COALESCE(answer_text, answer_markdown),
  points_awarded = COALESCE(points_awarded, score)
WHERE answer_text IS NULL;

CREATE TABLE IF NOT EXISTS bar_exam_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(attempt_id) REFERENCES bar_exam_attempts(id),
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bar_exam_attempt_counters (
  id TEXT PRIMARY KEY,
  exam_track TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_track, year)
);

CREATE INDEX IF NOT EXISTS idx_bar_exam_versions_track_active ON bar_exam_versions(exam_track, is_active, version_label);
CREATE INDEX IF NOT EXISTS idx_bar_exam_attempts_track_status ON bar_exam_attempts(exam_track, status, started_at);
CREATE INDEX IF NOT EXISTS idx_bar_exam_attempts_user_track ON bar_exam_attempts(user_id, exam_track, status);
CREATE INDEX IF NOT EXISTS idx_bar_exam_events_attempt ON bar_exam_events(attempt_id, created_at);
