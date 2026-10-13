-- Earn mode: opt-in, consented data contribution. See src/earn.ts for the rules.

-- Consent ledger. Rows are never deleted: a withdrawal sets withdrawn_at (proof of what was agreed and when).
-- receipt = SHA-256 of the canonical consent record, returned to the user.
CREATE TABLE earn_consents (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  version TEXT NOT NULL,
  tiers TEXT NOT NULL,          -- JSON {"presence":bool,"observations":bool,"interests":bool}
  granted_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  receipt TEXT NOT NULL
);
CREATE INDEX idx_earn_consents_account ON earn_consents (account_id, withdrawn_at);

-- Raw contributions. Pseudonymous: subject = HMAC(EARN_SALT, account id); no account id, email, IP or raw GPS here.
-- cell is coarsened to H3 res 8 (~0.7 km²); bucket is the hour (ms, floored). Deleted after 90 days.
CREATE TABLE earn_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  tier TEXT NOT NULL,           -- presence | observations | interests
  kind TEXT NOT NULL,           -- dwell | busy | post | follow
  cell TEXT,
  bucket INTEGER NOT NULL,
  value TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_earn_events_subject ON earn_events (subject);
CREATE INDEX idx_earn_events_bucket ON earn_events (bucket);

-- What buyers may see: per day × cell (res 8) × metric, only when ≥ K distinct people, with Laplace noise.
CREATE TABLE earn_aggregates (
  day INTEGER NOT NULL,         -- UTC day start (ms)
  cell TEXT NOT NULL,
  metric TEXT NOT NULL,         -- people | busy_avg | interest:<cat>
  value REAL NOT NULL,
  n INTEGER NOT NULL,           -- noised contributor count
  PRIMARY KEY (day, cell, metric)
);
CREATE TABLE earn_runs (day INTEGER PRIMARY KEY, ran_at INTEGER NOT NULL, cells INTEGER NOT NULL, suppressed INTEGER NOT NULL);
