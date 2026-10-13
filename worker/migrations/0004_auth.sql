-- Account sign-in: Google OAuth + email one-time codes. No passwords.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_sub TEXT UNIQUE,
  name TEXT,
  picture TEXT,
  handle TEXT UNIQUE,
  avatar TEXT,
  email_login INTEGER NOT NULL DEFAULT 0, -- 1 once the email was verified via a one-time code
  created_at INTEGER NOT NULL
);

-- Only the SHA-256 of the session token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_account ON sessions (account_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- One live code per email. code_hash = SHA-256(code + email).
CREATE TABLE email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  redirect TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Send log for the per-email hourly rate limit (max 5 codes / hour).
CREATE TABLE email_sends (
  email TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_email_sends ON email_sends (email, ts);
