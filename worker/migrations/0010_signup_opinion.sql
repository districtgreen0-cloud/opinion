-- Registration requires one OPINION about anything. NULL = not left yet (the app shows the mandatory gate).
ALTER TABLE accounts ADD COLUMN opinion_at INTEGER;
