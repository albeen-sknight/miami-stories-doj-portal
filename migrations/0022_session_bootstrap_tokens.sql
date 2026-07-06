CREATE TABLE IF NOT EXISTS session_bootstrap_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_bootstrap_tokens_hash ON session_bootstrap_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_session_bootstrap_tokens_expires ON session_bootstrap_tokens(expires_at);
