import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS wakeup_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_title TEXT NOT NULL,
    artist TEXT NOT NULL,
    song_date TEXT NOT NULL,
    spotify_track_id TEXT,
    spotify_artist_id TEXT,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reactor_catalogue_molecules (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    formula TEXT NOT NULL,
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    first_created_at TEXT,
    last_created_at TEXT,
    created_count INTEGER NOT NULL DEFAULT 0,
    seeded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wakeup_songs_song_date
    ON wakeup_songs(song_date DESC, created_at DESC);
  `);
} catch {}

try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reactor_catalogue_fingerprint
    ON reactor_catalogue_molecules(fingerprint);
  `);
} catch {}

try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reactor_catalogue_last_created
    ON reactor_catalogue_molecules(last_created_at DESC, id ASC);
  `);
} catch {}

try {
  db.exec(`ALTER TABLE wakeup_songs ADD COLUMN spotify_track_id TEXT;`);
} catch {}

try {
  db.exec(`ALTER TABLE wakeup_songs ADD COLUMN spotify_artist_id TEXT;`);
} catch {}

export default db;
