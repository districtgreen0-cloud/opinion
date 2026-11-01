-- Permanent record of every post (comments_index is a capped feed; the text otherwise lives only in each hex room). Admin only.
CREATE TABLE IF NOT EXISTS post_log (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  handle TEXT NOT NULL,
  cell TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS post_log_time ON post_log(created_at DESC);
CREATE INDEX IF NOT EXISTS post_log_account ON post_log(account_id, created_at);

INSERT OR IGNORE INTO post_log (id, account_id, handle, cell, kind, title, text, created_at)
  SELECT c.id, a.id, c.handle, c.cell, c.kind, c.title, c.text, c.created_at
  FROM comments_index c LEFT JOIN accounts a ON a.opinion_comment = c.id OR lower(a.handle) = lower(c.handle);
