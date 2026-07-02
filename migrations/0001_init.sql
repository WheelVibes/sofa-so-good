-- Sofa So Good — initial D1 schema.
-- Accounts are admin-created only (no public signup); saved layouts round-trip
-- the client SerializedState (src/state/schema.ts) as JSON; favourites mirror
-- the two client lists (furniture + finish).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,           -- uuid
  email         TEXT NOT NULL UNIQUE,        -- stored lower-cased
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  password_hash TEXT NOT NULL,               -- base64 PBKDF2 derived key
  password_salt TEXT NOT NULL,               -- base64 random salt
  iterations    INTEGER NOT NULL,            -- PBKDF2 iterations used
  created_at    TEXT NOT NULL,               -- ISO timestamp
  created_by    TEXT                         -- admin user id (null for the seed)
);

CREATE TABLE IF NOT EXISTS designs (
  id       TEXT PRIMARY KEY,                 -- uuid
  user_id  TEXT NOT NULL,
  slot     TEXT NOT NULL,                    -- 'autosave' or a named slot id
  name     TEXT NOT NULL DEFAULT '',
  json     TEXT NOT NULL,                    -- serialized SerializedState
  version  INTEGER NOT NULL DEFAULT 2,       -- schema version
  saved_at TEXT NOT NULL,                    -- ISO timestamp
  UNIQUE (user_id, slot),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_designs_user ON designs(user_id);

CREATE TABLE IF NOT EXISTS favourites (
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,                  -- 'furniture' | 'finish'
  def_id     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, def_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
