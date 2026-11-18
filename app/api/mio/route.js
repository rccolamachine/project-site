import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public mioclick leaderboard API; `focus` pins a specific mio into the response.
const MIOCLICK_LEADERBOARD_URL = "https://www.mioclick.com/api/leaderboard";
const DEFAULT_MIO_ID = "a1db351f-2bf4-4424-949f-07e9000aacbb";
const MIO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIO_CACHE_TTL_MS = 60_000;
const MIO_CACHE_STALE_FALLBACK_MS = 30 * 60 * 1000;

function getMioCacheStore() {
  const key = "__mioRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = { cache: new Map(), inflight: new Map() };
  }
  return globalThis[key];
}

function mapMio(entry) {
  const bitmapHex = String(entry?.bitmapHex || "");
  return {
    id: entry?.wormId || "",
    name: String(entry?.name || ""),
    clickCount: Number(entry?.clickCount) || 0,
    rank: Number(entry?.rank) || null,
    hatchedAt: entry?.hatchedAt || "",
    liveViewUrl: String(entry?.liveViewUrl || "").startsWith("/")
      ? `https://www.mioclick.com${String(entry.liveViewUrl).replace(/^\/mio-view\.html/, "/mio-view")}`
      : "",
    leaderboardUrl: `https://www.mioclick.com/leaderboard?focus=${encodeURIComponent(entry?.wormId || "")}`,
    bitmapHex: /^[0-9a-f]{32768}$/i.test(bitmapHex) ? bitmapHex : "",
    palette: Array.isArray(entry?.palette) ? entry.palette : [],
  };
}

async function fetchMio(mioId) {
  const params = new URLSearchParams({
    includeSprite: "1",
    limit: "1",
    offset: "0",
    view: "climb",
    focus: mioId,
    ids: mioId,
  });
  const res = await fetch(`${MIOCLICK_LEADERBOARD_URL}?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    const err = new Error(body?.error || `mioclick responded ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const entry = [body?.focus, ...(body?.ranks || []), ...(body?.entries || [])]
    .find((x) => x?.wormId === mioId);
  if (!entry) {
    const err = new Error("Mio not found on mioclick.");
    err.status = 404;
    throw err;
  }
  return mapMio(entry);
}

async function getMio(mioId, store) {
  const now = Date.now();
  const cached = store.cache.get(mioId);
  if (cached && cached.expiresAtMs > now) return { mio: cached.mio, cacheState: "HIT" };

  const existing = store.inflight.get(mioId);
  if (existing) return { mio: await existing, cacheState: "DEDUPED" };

  const loadPromise = fetchMio(mioId).then((mio) => {
    const nowMs = Date.now();
    store.cache.set(mioId, {
      mio,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + MIO_CACHE_TTL_MS,
    });
    return mio;
  });
  store.inflight.set(mioId, loadPromise);
  try {
    return { mio: await loadPromise, cacheState: "MISS" };
  } finally {
    store.inflight.delete(mioId);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mioId = String(searchParams.get("id") || DEFAULT_MIO_ID).trim();
  const includeSprite = searchParams.get("sprite") !== "0";

  if (!MIO_ID_PATTERN.test(mioId)) {
    return NextResponse.json({ error: "Invalid mio id." }, { status: 400 });
  }

  const store = getMioCacheStore();
  const respond = (mio, cacheState, extra = {}) =>
    NextResponse.json(
      {
        ...(includeSprite ? mio : { ...mio, bitmapHex: undefined, palette: undefined }),
        ...extra,
      },
      { headers: { "Cache-Control": "no-store", "X-Mio-Cache": cacheState } },
    );

  try {
    const { mio, cacheState } = await getMio(mioId, store);
    return respond(mio, cacheState);
  } catch (err) {
    const cached = store.cache.get(mioId);
    if (cached && Date.now() - cached.cachedAtMs <= MIO_CACHE_STALE_FALLBACK_MS) {
      return respond(cached.mio, "STALE", { stale: true });
    }
    return NextResponse.json(
      { error: "Failed to load mio.", detail: err?.message || String(err) },
      { status: Number(err?.status) || 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
