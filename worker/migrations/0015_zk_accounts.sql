-- Chat keys belong to accounts: a handle lookup returns the key of the account that owns the handle (most recently active device).
ALTER TABLE zk_keys ADD COLUMN account_id TEXT;
ALTER TABLE zk_keys ADD COLUMN seen_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_zk_keys_account ON zk_keys (account_id, seen_at);
