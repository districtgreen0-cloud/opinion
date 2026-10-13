-- Seed data: 6 NYC events around the East Village (40.7265, -73.9815) and epochs.
-- Times are relative to when the seed is applied.
INSERT INTO events (id, city, title, host, venue, lat, lng, starts_at, ends_at, status, cover, luma_url, attendees) VALUES
 ('evt_rooftop_sunset', 'nyc', 'Rooftop Sunset Sessions', 'Dusk Collective', 'The Wild Hive Rooftop', 40.7271, -73.9822,
   (unixepoch() - 3600) * 1000, (unixepoch() + 3 * 3600) * 1000, 'live', 'https://picsum.photos/seed/opinion-1/800/450', 'https://lu.ma/opinion-rooftop', 142),
 ('evt_noodle_night', 'nyc', 'Midnight Noodle Pop-up', 'Ramen Club NYC', 'St. Marks Place Alley', 40.7285, -73.9884,
   (unixepoch() - 1800) * 1000, (unixepoch() + 4 * 3600) * 1000, 'live', 'https://picsum.photos/seed/opinion-2/800/450', 'https://lu.ma/opinion-noodles', 87),
 ('evt_vinyl_swap', 'nyc', 'Vinyl Swap & Listening Party', 'Basement Records', 'Tompkins Square Park', 40.7265, -73.9817,
   (unixepoch() - 7200) * 1000, (unixepoch() + 2 * 3600) * 1000, 'live', 'https://picsum.photos/seed/opinion-3/800/450', 'https://lu.ma/opinion-vinyl', 213),
 ('evt_solana_mixer', 'nyc', 'Solana Builders Mixer', 'Onchain NYC', 'Ludlow House', 40.7216, -73.9873,
   (unixepoch() + 26 * 3600) * 1000, (unixepoch() + 30 * 3600) * 1000, 'upcoming', 'https://picsum.photos/seed/opinion-4/800/450', 'https://lu.ma/opinion-solana', 64),
 ('evt_art_walk', 'nyc', 'East Village Gallery Walk', 'Lower East Arts', 'Alphabet City Gallery', 40.7234, -73.9786,
   (unixepoch() + 50 * 3600) * 1000, (unixepoch() + 54 * 3600) * 1000, 'upcoming', 'https://picsum.photos/seed/opinion-5/800/450', 'https://lu.ma/opinion-art', 118),
 ('evt_techno_warehouse', 'nyc', 'Warehouse Techno: Phase 3', 'Static Signal', 'Undisclosed - East River', 40.7202, -73.9745,
   (unixepoch() + 74 * 3600) * 1000, (unixepoch() + 82 * 3600) * 1000, 'upcoming', 'https://picsum.photos/seed/opinion-6/800/450', 'https://lu.ma/opinion-techno', 305);

-- Epoch 6 already ended, Epoch 7 is active (pool in whole tokens).
INSERT INTO epochs (n, starts_at, ends_at, pool) VALUES
 (6, (unixepoch() - 9 * 86400) * 1000, (unixepoch() - 2 * 86400) * 1000, 50000),
 (7, (unixepoch() - 2 * 86400) * 1000, (unixepoch() + 5 * 86400) * 1000, 50000);
