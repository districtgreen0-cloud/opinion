-- Zero-knowledge chat relay: public key directory + room membership index. Only PUBLIC keys are stored.
CREATE TABLE zk_keys (
  fp TEXT PRIMARY KEY,          -- lowercase hex SHA-256 of "<x>.<y>"
  handle TEXT NOT NULL,
  avatar TEXT NOT NULL,
  pub_json TEXT NOT NULL,       -- {kty,crv,x,y} public JWK
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_zk_keys_handle ON zk_keys (lower(handle), created_at);

CREATE TABLE zk_room_members (
  room TEXT NOT NULL,
  fp TEXT NOT NULL,
  PRIMARY KEY (room, fp)
);
CREATE INDEX idx_zk_room_members_fp ON zk_room_members (fp);
