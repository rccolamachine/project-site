import { kv } from "@vercel/kv";

const SONGS_LIST_KEY = "mixtape:wakeupSongs:ids";
const SONGS_NEXT_ID_KEY = "mixtape:wakeupSongs:nextId";
const SONGS_MIGRATED_KEY = "mixtape:wakeupSongs:migratedFromSqlite";
const SONGS_MIGRATION_LOCK_KEY = "mixtape:wakeupSongs:migrationLock";

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getStorageBackend() {
  const configured = String(process.env.SONGS_STORAGE || "")
    .trim()
    .toLowerCase();

  if (configured === "kv" || configured === "sqlite") {
    return configured;
  }

  return hasKvConfig() ? "kv" : "sqlite";
}

function getSongKey(id) {
  return `mixtape:wakeupSongs:item:${id}`;
}

function compareSongsDesc(a, b) {
  return (
    String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
    String(b.date || "").localeCompare(String(a.date || "")) ||
    Number(b.id || 0) - Number(a.id || 0)
  );
}

function normalizeSongRecord(value) {
  if (!value || typeof value !== "object") return null;

  const id = Number(value.id);
  const title = String(value.title ?? "");
  const artist = String(value.artist ?? "");
  const date = String(value.date ?? "");
  const created_at = String(value.created_at ?? "");

  if (!Number.isInteger(id) || id <= 0) return null;
  if (!title || !artist || !date || !created_at) return null;

  const spotifyTrackId =
    value.spotifyTrackId == null || value.spotifyTrackId === ""
      ? null
      : String(value.spotifyTrackId);
  const spotifyArtistId =
    value.spotifyArtistId == null || value.spotifyArtistId === ""
      ? null
      : String(value.spotifyArtistId);

  return {
    id,
    title,
    artist,
    date,
    spotifyTrackId,
    spotifyArtistId,
    created_at,
  };
}

function sortSongs(items) {
  return [...items].sort(compareSongsDesc);
}

async function getSqliteDb() {
  const mod = await import("./db");
  return mod.default;
}

async function listSqliteSongs() {
  const db = await getSqliteDb();
  const items = db
    .prepare(
      `
        SELECT
          id,
          song_title AS title,
          artist,
          song_date AS date,
          spotify_track_id AS spotifyTrackId,
          spotify_artist_id AS spotifyArtistId,
          created_at
        FROM wakeup_songs
        ORDER BY created_at DESC, song_date DESC, id DESC
      `,
    )
    .all();

  return items.map(normalizeSongRecord).filter(Boolean);
}

async function createSqliteSong({
  title,
  artist,
  date,
  spotifyTrackId,
  spotifyArtistId,
}) {
  const db = await getSqliteDb();
  const createdAt = new Date().toISOString();
  const insert = db
    .prepare(
      `
        INSERT INTO wakeup_songs (
          song_title,
          artist,
          song_date,
          spotify_track_id,
          spotify_artist_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(title, artist, date, spotifyTrackId, spotifyArtistId, createdAt);

  const item = db
    .prepare(
      `
        SELECT
          id,
          song_title AS title,
          artist,
          song_date AS date,
          spotify_track_id AS spotifyTrackId,
          spotify_artist_id AS spotifyArtistId,
          created_at
        FROM wakeup_songs
        WHERE id = ?
      `,
    )
    .get(insert.lastInsertRowid);

  return normalizeSongRecord(item);
}

async function deleteSqliteSong(id) {
  const db = await getSqliteDb();
  const existing = db.prepare(`SELECT id FROM wakeup_songs WHERE id = ?`).get(id);
  if (!existing) return false;

  db.prepare(`DELETE FROM wakeup_songs WHERE id = ?`).run(id);
  return true;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForKvMigration() {
  for (let i = 0; i < 10; i += 1) {
    const [migratedAt, lockValue] = await Promise.all([
      kv.get(SONGS_MIGRATED_KEY),
      kv.get(SONGS_MIGRATION_LOCK_KEY),
    ]);

    if (migratedAt || !lockValue) return;
    await sleep(100);
  }
}

async function ensureKvSeededFromSqlite() {
  if (getStorageBackend() !== "kv") return;

  if (await kv.get(SONGS_MIGRATED_KEY)) return;

  const lockAcquired = Number(
    await kv.setnx(SONGS_MIGRATION_LOCK_KEY, new Date().toISOString()),
  );

  if (lockAcquired !== 1) {
    await waitForKvMigration();
    return;
  }

  try {
    if (await kv.get(SONGS_MIGRATED_KEY)) return;

    const existingIds = await kv.lrange(SONGS_LIST_KEY, 0, 0);
    if (Array.isArray(existingIds) && existingIds.length > 0) {
      await kv.set(SONGS_MIGRATED_KEY, new Date().toISOString());
      return;
    }

    let sqliteItems = [];
    try {
      sqliteItems = await listSqliteSongs();
    } catch {
      sqliteItems = [];
    }

    if (!sqliteItems.length) {
      await kv.set(SONGS_MIGRATED_KEY, new Date().toISOString());
      return;
    }

    await Promise.all(
      sqliteItems.map((item) => kv.set(getSongKey(item.id), item)),
    );
    await kv.rpush(
      SONGS_LIST_KEY,
      ...sqliteItems.map((item) => String(item.id)),
    );

    const maxId = sqliteItems.reduce(
      (highest, item) => Math.max(highest, Number(item.id) || 0),
      0,
    );
    const currentNextId = Number((await kv.get(SONGS_NEXT_ID_KEY)) ?? 0);
    if (maxId > currentNextId) {
      await kv.set(SONGS_NEXT_ID_KEY, maxId);
    }

    await kv.set(SONGS_MIGRATED_KEY, new Date().toISOString());
  } finally {
    await kv.del(SONGS_MIGRATION_LOCK_KEY);
  }
}

async function listKvSongs() {
  await ensureKvSeededFromSqlite();

  const ids = await kv.lrange(SONGS_LIST_KEY, 0, -1);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const uniqueIds = [...new Set(ids.map((id) => String(id)).filter(Boolean))];
  const items = await Promise.all(
    uniqueIds.map((id) => kv.get(getSongKey(id))),
  );

  return sortSongs(items.map(normalizeSongRecord).filter(Boolean));
}

async function createKvSong({
  title,
  artist,
  date,
  spotifyTrackId,
  spotifyArtistId,
}) {
  await ensureKvSeededFromSqlite();

  const id = Number(await kv.incr(SONGS_NEXT_ID_KEY));
  const item = normalizeSongRecord({
    id,
    title,
    artist,
    date,
    spotifyTrackId,
    spotifyArtistId,
    created_at: new Date().toISOString(),
  });

  await Promise.all([
    kv.set(getSongKey(id), item),
    kv.lpush(SONGS_LIST_KEY, String(id)),
    kv.set(SONGS_MIGRATED_KEY, new Date().toISOString()),
  ]);

  return item;
}

async function deleteKvSong(id) {
  await ensureKvSeededFromSqlite();

  const key = getSongKey(id);
  const existing = normalizeSongRecord(await kv.get(key));
  if (!existing) return false;

  await Promise.all([kv.del(key), kv.lrem(SONGS_LIST_KEY, 0, String(id))]);
  return true;
}

export async function listWakeupSongs() {
  return getStorageBackend() === "kv" ? listKvSongs() : listSqliteSongs();
}

export async function createWakeupSong(song) {
  return getStorageBackend() === "kv"
    ? createKvSong(song)
    : createSqliteSong(song);
}

export async function deleteWakeupSong(id) {
  return getStorageBackend() === "kv" ? deleteKvSong(id) : deleteSqliteSong(id);
}
