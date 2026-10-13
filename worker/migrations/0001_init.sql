CREATE TABLE users (
  wallet TEXT PRIMARY KEY,
  handle TEXT NOT NULL DEFAULT 'anon',
  avatar TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  hexes_explored INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  title TEXT NOT NULL,
  host TEXT NOT NULL,
  venue TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('live', 'upcoming')),
  cover TEXT NOT NULL DEFAULT '',
  luma_url TEXT NOT NULL DEFAULT '',
  attendees INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_city ON events (city, starts_at);

CREATE TABLE hex_visits (
  wallet TEXT NOT NULL,
  cell TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (wallet, cell)
);

CREATE TABLE epochs (
  n INTEGER PRIMARY KEY,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  pool INTEGER NOT NULL
);

CREATE TABLE claims (
  wallet TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (wallet, epoch)
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  seller TEXT NOT NULL,
  price_usdc REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'escrow', 'sold')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_listings_event ON listings (event_id, status);

-- Global activity feed: each accepted hex comment is mirrored here (hex rooms stay the source of truth).
CREATE TABLE comments_index (
  id TEXT PRIMARY KEY,
  cell TEXT NOT NULL,
  text TEXT NOT NULL,
  handle TEXT NOT NULL,
  avatar TEXT NOT NULL,
  wallet TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_index_created ON comments_index (created_at DESC);
