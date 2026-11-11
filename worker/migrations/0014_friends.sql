-- Real friend requests between accounts. One row per pair: from_id asked to_id; 'pending' until to_id accepts.
CREATE TABLE IF NOT EXISTS friend_links (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'friends'
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_links_to ON friend_links(to_id, status);
