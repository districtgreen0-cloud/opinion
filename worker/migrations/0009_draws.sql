-- Hex lottery: one verifiable draw at a time (commit-reveal, SHA-256), one entry per account (src/draw.ts).
ALTER TABLE accounts ADD COLUMN x_handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_x_handle ON accounts(x_handle) WHERE x_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS draws (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prize TEXT NOT NULL,
  x_account TEXT NOT NULL,          -- X handle entrants must follow (no @)
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  commit_hash TEXT,                 -- sha256(seed), published before entries close
  committed_at INTEGER,
  seed TEXT,                        -- 32 random bytes (hex); revealed only after the draw
  anchor TEXT,                      -- public randomness nobody controls (Solana block hash) at reveal time
  entries_root TEXT,                -- merkle root of the frozen entry leaves
  entries_count INTEGER NOT NULL DEFAULT 0,
  winner_index INTEGER,
  winner_account TEXT,
  winner_leaf TEXT,
  drawn_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS draw_entries (
  draw_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  x_handle TEXT NOT NULL,
  cell TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (draw_id, account_id)
);
CREATE INDEX IF NOT EXISTS draw_entries_order ON draw_entries(draw_id, created_at, account_id);
