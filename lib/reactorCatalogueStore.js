import { kv } from "@vercel/kv";
import REACTOR_MOLECULES from "@/data/reactor_molecules.json";

const STORE_PREFIX = "reactor:catalogue:v1";
const STORE_IDS_KEY = `${STORE_PREFIX}:ids`;
const STORE_SEEDED_KEY = `${STORE_PREFIX}:seededAt`;
const STORE_SEED_LOCK_KEY = `${STORE_PREFIX}:seedLock`;

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getStorageBackend() {
  const configured = String(process.env.REACTOR_CATALOGUE_STORAGE || "")
    .trim()
    .toLowerCase();

  if (configured === "kv" || configured === "sqlite") return configured;
  return process.env.VERCEL === "1" && hasKvConfig() ? "kv" : "sqlite";
}

function getItemKey(id) {
  return `${STORE_PREFIX}:item:${id}`;
}

function normalizeStoredRecord(value) {
  if (!value || typeof value !== "object") return null;

  const id = String(value.id || value.catalog?.id || "").trim();
  const catalog =
    value.catalog && typeof value.catalog === "object" ? value.catalog : value;

  if (!id || !catalog || typeof catalog !== "object") return null;

  return {
    ...catalog,
    id,
    firstCreatedAt:
      value.firstCreatedAt == null || value.firstCreatedAt === ""
        ? null
        : String(value.firstCreatedAt),
    lastCreatedAt:
      value.lastCreatedAt == null || value.lastCreatedAt === ""
        ? null
        : String(value.lastCreatedAt),
    createdCount: Math.max(0, Math.floor(Number(value.createdCount) || 0)),
    seededAt: String(value.seededAt || ""),
    updatedAt: String(value.updatedAt || ""),
  };
}

function buildSeedRecord(entry, seededAt) {
  const record = normalizeStoredRecord({
    id: entry.id,
    catalog: entry,
    firstCreatedAt: null,
    lastCreatedAt: null,
    createdCount: 0,
    seededAt,
    updatedAt: seededAt,
  });
  return record;
}

function sortRecords(items) {
  return [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function getSqliteDb() {
  const mod = await import("./db");
  return mod.default;
}

async function ensureSqliteSeeded() {
  const db = await getSqliteDb();
  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM reactor_catalogue_molecules`)
    .get();
  const count = Number(countRow?.count || 0);
  if (count >= REACTOR_MOLECULES.length) return;

  const seededAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO reactor_catalogue_molecules (
      id,
      fingerprint,
      formula,
      name,
      payload_json,
      first_created_at,
      last_created_at,
      created_count,
      seeded_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?)
  `);

  const tx = db.transaction((items) => {
    for (const entry of items) {
      insert.run(
        entry.id,
        entry.fingerprint || "",
        entry.formula || "",
        entry.name || entry.formula || entry.id,
        JSON.stringify(entry),
        seededAt,
        seededAt,
      );
    }
  });

  tx(REACTOR_MOLECULES);
}

function parseSqliteRow(row) {
  if (!row) return null;

  let catalog = null;
  try {
    catalog = JSON.parse(String(row.payload_json || "{}"));
  } catch {
    catalog = null;
  }

  return normalizeStoredRecord({
    id: row.id,
    catalog,
    firstCreatedAt: row.first_created_at,
    lastCreatedAt: row.last_created_at,
    createdCount: row.created_count,
    seededAt: row.seeded_at,
    updatedAt: row.updated_at,
  });
}

async function listSqliteMolecules(ids = null) {
  await ensureSqliteSeeded();
  const db = await getSqliteDb();

  let rows = [];
  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    rows = db
      .prepare(
        `
          SELECT *
          FROM reactor_catalogue_molecules
          WHERE id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...ids);
  } else {
    rows = db
      .prepare(
        `
          SELECT *
          FROM reactor_catalogue_molecules
          ORDER BY id ASC
        `,
      )
      .all();
  }

  return rows.map(parseSqliteRow).filter(Boolean);
}

async function updateSqliteCreationEvents(events) {
  await ensureSqliteSeeded();
  const db = await getSqliteDb();
  const now = new Date().toISOString();
  const getRow = db.prepare(
    `SELECT * FROM reactor_catalogue_molecules WHERE id = ?`,
  );
  const update = db.prepare(`
    UPDATE reactor_catalogue_molecules
    SET
      first_created_at = ?,
      last_created_at = ?,
      created_count = ?,
      updated_at = ?
    WHERE id = ?
  `);

  const tx = db.transaction((rows) => {
    for (const event of rows) {
      const existing = parseSqliteRow(getRow.get(event.id));
      if (!existing) continue;
      const firstCreatedAt =
        existing.firstCreatedAt && existing.firstCreatedAt <= event.firstCreatedAt
          ? existing.firstCreatedAt
          : event.firstCreatedAt;
      const lastCreatedAt =
        existing.lastCreatedAt && existing.lastCreatedAt >= event.lastCreatedAt
          ? existing.lastCreatedAt
          : event.lastCreatedAt;
      update.run(
        firstCreatedAt,
        lastCreatedAt,
        Math.max(0, (existing.createdCount || 0) + (event.count || 0)),
        now,
        event.id,
      );
    }
  });

  tx(events);
  return listSqliteMolecules(events.map((event) => event.id));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForKvSeed() {
  for (let i = 0; i < 20; i += 1) {
    const [seededAt, lockValue] = await Promise.all([
      kv.get(STORE_SEEDED_KEY),
      kv.get(STORE_SEED_LOCK_KEY),
    ]);
    if (seededAt || !lockValue) return;
    await sleep(100);
  }
}

async function ensureKvSeeded() {
  if (await kv.get(STORE_SEEDED_KEY)) return;

  const lockAcquired = Number(
    await kv.setnx(STORE_SEED_LOCK_KEY, new Date().toISOString()),
  );
  if (lockAcquired !== 1) {
    await waitForKvSeed();
    return;
  }

  try {
    if (await kv.get(STORE_SEEDED_KEY)) return;

    const existingIds = await kv.lrange(STORE_IDS_KEY, 0, 0);
    if (Array.isArray(existingIds) && existingIds.length > 0) {
      await kv.set(STORE_SEEDED_KEY, new Date().toISOString());
      return;
    }

    const seededAt = new Date().toISOString();
    const chunks = [];
    for (let i = 0; i < REACTOR_MOLECULES.length; i += 100) {
      chunks.push(REACTOR_MOLECULES.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map((entry) => kv.set(getItemKey(entry.id), buildSeedRecord(entry, seededAt))),
      );
    }

    await kv.rpush(STORE_IDS_KEY, ...REACTOR_MOLECULES.map((entry) => entry.id));
    await kv.set(STORE_SEEDED_KEY, seededAt);
  } finally {
    await kv.del(STORE_SEED_LOCK_KEY);
  }
}

async function listKvMolecules(ids = null) {
  await ensureKvSeeded();

  const targetIds =
    Array.isArray(ids) && ids.length > 0
      ? ids
      : await kv.lrange(STORE_IDS_KEY, 0, -1);

  if (!Array.isArray(targetIds) || targetIds.length <= 0) return [];

  const uniqueIds = [...new Set(targetIds.map((id) => String(id)).filter(Boolean))];
  const rows = await Promise.all(uniqueIds.map((id) => kv.get(getItemKey(id))));
  return sortRecords(rows.map(normalizeStoredRecord).filter(Boolean));
}

function coerceEventRows(events) {
  const byId = new Map();

  for (const raw of Array.isArray(events) ? events : []) {
    const id = String(raw?.id || "").trim();
    if (!id) continue;
    const observedAtRaw =
      raw?.lastCreatedAt ?? raw?.observedAt ?? raw?.firstCreatedAt ?? null;
    const observedAtMs =
      typeof observedAtRaw === "string" ? Date.parse(observedAtRaw) : Number.NaN;
    if (!Number.isFinite(observedAtMs)) continue;

    const firstCreatedAtRaw =
      typeof raw?.firstCreatedAt === "string" ? raw.firstCreatedAt : null;
    const firstCreatedAtMs = firstCreatedAtRaw
      ? Date.parse(firstCreatedAtRaw)
      : observedAtMs;
    const firstCreatedAt = new Date(
      Number.isFinite(firstCreatedAtMs) ? firstCreatedAtMs : observedAtMs,
    ).toISOString();
    const lastCreatedAt = new Date(observedAtMs).toISOString();
    const count = Math.max(1, Math.floor(Number(raw?.count) || 1));

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, firstCreatedAt, lastCreatedAt, count });
      continue;
    }

    if (firstCreatedAt < existing.firstCreatedAt) {
      existing.firstCreatedAt = firstCreatedAt;
    }
    if (lastCreatedAt > existing.lastCreatedAt) {
      existing.lastCreatedAt = lastCreatedAt;
    }
    existing.count += count;
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function updateKvCreationEvents(events) {
  await ensureKvSeeded();

  const ids = events.map((event) => event.id);
  const existingRows = await listKvMolecules(ids);
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const now = new Date().toISOString();
  const nextRows = [];

  for (const event of events) {
    const existing = existingById.get(event.id);
    if (!existing) continue;
    nextRows.push({
      id: existing.id,
      catalog: REACTOR_MOLECULES.find((entry) => entry.id === existing.id) || existing,
      firstCreatedAt:
        existing.firstCreatedAt && existing.firstCreatedAt <= event.firstCreatedAt
          ? existing.firstCreatedAt
          : event.firstCreatedAt,
      lastCreatedAt:
        existing.lastCreatedAt && existing.lastCreatedAt >= event.lastCreatedAt
          ? existing.lastCreatedAt
          : event.lastCreatedAt,
      createdCount: Math.max(0, (existing.createdCount || 0) + (event.count || 0)),
      seededAt: existing.seededAt,
      updatedAt: now,
    });
  }

  if (nextRows.length > 0) {
    await Promise.all(
      nextRows.map((row) =>
        kv.set(
          getItemKey(row.id),
          normalizeStoredRecord(row),
        ),
      ),
    );
  }

  return listKvMolecules(ids);
}

export async function listReactorCatalogueRecords(ids = null) {
  const uniqueIds = Array.isArray(ids)
    ? [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
    : null;
  return getStorageBackend() === "kv"
    ? listKvMolecules(uniqueIds)
    : listSqliteMolecules(uniqueIds);
}

export async function getReactorCatalogueRecord(id) {
  const rows = await listReactorCatalogueRecords([id]);
  return rows[0] || null;
}

export async function updateReactorCatalogueCreationEvents(events) {
  const rows = coerceEventRows(events);
  if (rows.length <= 0) return [];

  return getStorageBackend() === "kv"
    ? updateKvCreationEvents(rows)
    : updateSqliteCreationEvents(rows);
}
