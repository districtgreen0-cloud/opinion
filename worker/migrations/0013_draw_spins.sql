-- Slot machine (admin): every spin is logged; the admin marks a pick ineligible (respin) or confirms the winner.
CREATE TABLE IF NOT EXISTS draw_spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  pool TEXT NOT NULL,          -- 'entries' or 'opinions'
  pool_size INTEGER NOT NULL,
  verdict TEXT,                -- NULL (pending) · 'ineligible' · 'winner'
  note TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS draw_spins_draw ON draw_spins(draw_id, at);
