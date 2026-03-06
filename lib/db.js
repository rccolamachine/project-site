// lib/db.js
//
// Simple SQLite (better-sqlite3) helper for a small Next.js hobby site.
// - Stores pixelbooth submissions
// - Includes a safe one-time migration for session_id
//
// Install:
//   npm i better-sqlite3
//
// Notes:
// - This must run on Node (NOT edge). Your route handlers already set:
//     export const runtime = "nodejs";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Put the DB file somewhere stable in your project.
// For dev: this lives in your repo at /data/app.sqlite
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.sqlite");

// Create a single shared instance (module singleton)
const db = new Database(dbPath);

// Improve durability/perf for a small app
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create the table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS photobooth_submissions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    image_url TEXT NOT NULL,

    name TEXT NOT NULL,
    email TEXT NOT NULL,
    linkedin_url TEXT,
    message TEXT,

    session_id TEXT,

    pixel_size INTEGER,
    tiny_w INTEGER,
    tiny_h INTEGER,
    out_w INTEGER,
    out_h INTEGER,

    user_agent TEXT,
    ip TEXT
  );
`);

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

// Safe migration for older DBs created before session_id existed
try {
  // If the column already exists, SQLite throws; we ignore.
  db.exec(`ALTER TABLE photobooth_submissions ADD COLUMN session_id TEXT;`);
} catch {}

// Helpful indexes (optional but nice)
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_photobooth_created_at ON photobooth_submissions(created_at);`);
} catch {}

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wakeup_songs_song_date ON wakeup_songs(song_date DESC, created_at DESC);`);
} catch {}

try {
  db.exec(`ALTER TABLE wakeup_songs ADD COLUMN spotify_track_id TEXT;`);
} catch {}

try {
  db.exec(`ALTER TABLE wakeup_songs ADD COLUMN spotify_artist_id TEXT;`);
} catch {}

export default db;
