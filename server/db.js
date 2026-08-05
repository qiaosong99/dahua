const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'visitors.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  photo_path TEXT,
  device_user_id TEXT,
  granted_at TEXT,
  expire_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  device_removed INTEGER NOT NULL DEFAULT 0,
  face_removed INTEGER NOT NULL DEFAULT 0,
  fail_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_visitors_created ON visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON visitors(phone);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function getMeta(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

module.exports = { db, getMeta, setMeta };
