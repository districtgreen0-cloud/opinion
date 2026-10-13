-- Global job index (hex rooms hold the thread copy; this table drives the escrow state machine).
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  cell TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  price_usdc REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'funded', 'taken', 'delivered', 'paid', 'cancelled')),
  poster_handle TEXT NOT NULL,
  poster_avatar TEXT NOT NULL DEFAULT '',
  poster_wallet TEXT NOT NULL,
  worker_handle TEXT,
  worker_wallet TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_jobs_status_created ON jobs (status, created_at DESC);

-- Feed index now carries post kind (NULL = legacy note row).
ALTER TABLE comments_index ADD COLUMN kind TEXT;
ALTER TABLE comments_index ADD COLUMN title TEXT;
ALTER TABLE comments_index ADD COLUMN price_usdc REAL;
