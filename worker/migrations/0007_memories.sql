-- Memories: one camera photo per person per hex, max 3 per person per day. Images live in R2 (MEDIA).
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  avatar TEXT NOT NULL,
  cell TEXT NOT NULL,
  full_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (account_id, cell)
);
CREATE INDEX idx_memories_cell ON memories (cell, hidden, created_at);
CREATE INDEX idx_memories_account ON memories (account_id, created_at);
CREATE TABLE memory_reports (memory_id TEXT NOT NULL, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (memory_id, account_id));
