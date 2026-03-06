import { NextResponse } from "next/server";
import {
  getAllPlaylistItems,
  normalizeLimit,
  trimString,
} from "@/lib/spotify";
import {
  loadLocalSpotifySnapshot,
  shouldUseSnapshotSource,
} from "@/lib/spotifySnapshot";

export const runtime = "nodejs";
const PLAYLIST_CACHE_TTL_MS = 90_000;
const PLAYLIST_CACHE_STALE_FALLBACK_MS = 10 * 60 * 1000;

function getPlaylistCacheStore() {
  const key = "__spotifyPlaylistRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = {
      fullCache: new Map(),
      inflight: new Map(),
    };
  }
  return globalThis[key];
}

function getFullPlaylistCacheKey(playlistId, source = "live") {
  return `${source}:${playlistId}`;
}

function resolvePlaylistId(searchParams) {
  const directId = trimString(searchParams.get("playlistId"));
  if (directId) return directId;

  const playlistUrl = trimString(searchParams.get("playlistUrl"));
  if (!playlistUrl) return "";

  try {
    const url = new URL(playlistUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.findIndex(
      (segment) => segment.toLowerCase() === "playlist",
    );
    if (playlistIndex >= 0) {
      return trimString(parts[playlistIndex + 1] || "");
    }
  } catch {
    const match = playlistUrl.match(/playlist\/([A-Za-z0-9]+)/i);
    return trimString(match?.[1] || "");
  }

  return "";
}

function parseTrackIdFromUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw.startsWith("spotify:track:")) return "";
  return raw.split(":").pop() || "";
}

function mapPlaylistTrack(item) {
  const track = item?.item || item?.track || {};
  const trackId = track?.id || "";
  const trackUri = track?.uri || "";
  const resolvedTrackId = trackId || parseTrackIdFromUri(trackUri);
  return {
    id: resolvedTrackId || trackUri,
    spotifyTrackId: resolvedTrackId,
    spotifyTrackUri: trackUri,
    title: track?.name || "",
    artists: Array.isArray(track?.artists)
      ? track.artists.map((x) => x?.name).filter(Boolean)
      : [],
    previewUrl: track?.preview_url || "",
    albumTitle: track?.album?.name || "",
    year: String(track?.album?.release_date || "").slice(0, 4),
    addedAt: trimString(item?.added_at),
    externalUrl: track?.external_urls?.spotify || "",
  };
}

function parseAddedAt(value) {
  const raw = trimString(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortTracksByAddedAtDesc(items) {
  return items
    .map((item, index) => ({ item, sourceIndex: index }))
    .sort((a, b) => {
      const byAddedAt =
        parseAddedAt(b?.item?.addedAt) - parseAddedAt(a?.item?.addedAt);
      if (byAddedAt !== 0) return byAddedAt;
      return Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0);
    })
    .map(({ item }) => item);
}

function paginatePlaylistItems(items, { offset, limit }) {
  const total = Array.isArray(items) ? items.length : 0;
  const boundedOffset = Math.max(0, Math.min(Number(offset) || 0, total));
  const boundedLimit = Math.max(1, Number(limit) || 25);

  return {
    items: (Array.isArray(items) ? items : []).slice(
      boundedOffset,
      Math.min(total, boundedOffset + boundedLimit),
    ),
    total,
    offset: boundedOffset,
    limit: boundedLimit,
  };
}

async function getSortedSnapshotPlaylistPayload(playlistId) {
  const snapshot = await loadLocalSpotifySnapshot();
  if (!snapshot || !Array.isArray(snapshot.items)) return null;

  const requestedId = trimString(playlistId);
  if (requestedId && snapshot.playlistId && requestedId !== snapshot.playlistId) {
    return null;
  }

  const items = sortTracksByAddedAtDesc(snapshot.items);
  return {
    items,
    total: items.length,
    declaredTotal: snapshot.declaredTotal,
    partial: snapshot.partial,
  };
}

async function getSortedLivePlaylistPayload({
  playlistId,
  cacheStore,
  inflightStore,
  now,
}) {
  const cacheKey = getFullPlaylistCacheKey(playlistId, "live");
  const cached = cacheStore.get(cacheKey);
  if (cached && cached.expiresAtMs > now) {
    return { payload: cached, cacheState: "HIT" };
  }

  const existingInflight = inflightStore.get(cacheKey);
  if (existingInflight) {
    const payload = await existingInflight;
    return { payload, cacheState: "DEDUPED" };
  }

  const loadPromise = (async () => {
    const playlist = await getAllPlaylistItems(playlistId);
    const items = sortTracksByAddedAtDesc(
      (Array.isArray(playlist?.items) ? playlist.items : [])
        .map(mapPlaylistTrack)
        .filter((item) => item.title),
    );

    const nowMs = Date.now();
    const payload = {
      items,
      total: items.length,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + PLAYLIST_CACHE_TTL_MS,
    };
    cacheStore.set(cacheKey, payload);
    return payload;
  })();

  inflightStore.set(cacheKey, loadPromise);
  try {
    const payload = await loadPromise;
    return { payload, cacheState: "MISS" };
  } finally {
    inflightStore.delete(cacheKey);
  }
}

function createPlaylistResponse(body, cacheState, retryAfterSeconds = "") {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Spotify-Cache": cacheState,
      ...(retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {}),
    },
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = resolvePlaylistId(searchParams);
  const limit = normalizeLimit(searchParams.get("limit"), 25, 1, 50);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const forceSnapshot = shouldUseSnapshotSource(searchParams.get("snapshot"));
  const envSnapshot = shouldUseSnapshotSource(process.env.SPOTIFY_SNAPSHOT_MODE);
  const useSnapshot = forceSnapshot || envSnapshot;
  const store = getPlaylistCacheStore();
  const fullCacheStore = store.fullCache;
  const inflightStore = store.inflight;
  const liveCacheKey = getFullPlaylistCacheKey(playlistId, "live");
  const now = Date.now();

  if (!playlistId) {
    return NextResponse.json(
      { error: "playlistId is required." },
      { status: 400 },
    );
  }

  try {
    if (useSnapshot) {
      const snapshotPayload = await getSortedSnapshotPlaylistPayload(playlistId);
      if (snapshotPayload) {
        const page = paginatePlaylistItems(snapshotPayload.items, { offset, limit });
        return createPlaylistResponse(
          {
            items: page.items,
            total: snapshotPayload.total,
            declaredTotal: snapshotPayload.declaredTotal,
            partial: snapshotPayload.partial,
            offset: page.offset,
            limit: page.limit,
            snapshot: true,
          },
          "SNAPSHOT",
        );
      }
    }

    const { payload, cacheState } = await getSortedLivePlaylistPayload({
      playlistId,
      cacheStore: fullCacheStore,
      inflightStore,
      now,
    });
    const page = paginatePlaylistItems(payload.items, { offset, limit });

    return createPlaylistResponse(
      {
        items: page.items,
        total: payload.total,
        offset: page.offset,
        limit: page.limit,
      },
      cacheState,
    );
  } catch (err) {
    const status = Number(err?.status) || 500;
    const retryAfterHeader = trimString(err?.retryAfterHeader);
    const retryAfterHeaderSeconds = Number(retryAfterHeader);
    const retryAfterMs = Number(err?.retryAfterMs || 0);
    const retryAfterSeconds =
      Number.isFinite(retryAfterHeaderSeconds) && retryAfterHeaderSeconds > 0
        ? String(Math.floor(retryAfterHeaderSeconds))
        : retryAfterMs > 0
          ? String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
          : "";
    const cached = fullCacheStore.get(liveCacheKey);
    const nowMs = Date.now();

    if (
      status === 429 &&
      cached &&
      nowMs - Number(cached.cachedAtMs || 0) <= PLAYLIST_CACHE_STALE_FALLBACK_MS
    ) {
      const page = paginatePlaylistItems(cached.items, { offset, limit });
      return createPlaylistResponse(
        {
          items: page.items,
          total: cached.total,
          offset: page.offset,
          limit: page.limit,
          stale: true,
          retryAfterSeconds: retryAfterSeconds || null,
        },
        "STALE",
        retryAfterSeconds,
      );
    }

    if (useSnapshot && (status === 429 || status === 403 || status >= 500)) {
      const snapshotPayload = await getSortedSnapshotPlaylistPayload(playlistId);
      if (snapshotPayload) {
        const page = paginatePlaylistItems(snapshotPayload.items, { offset, limit });
        return createPlaylistResponse(
          {
            items: page.items,
            total: snapshotPayload.total,
            declaredTotal: snapshotPayload.declaredTotal,
            partial: snapshotPayload.partial,
            offset: page.offset,
            limit: page.limit,
            snapshot: true,
            stale: true,
            retryAfterSeconds: retryAfterSeconds || null,
          },
          "SNAPSHOT-FALLBACK",
          retryAfterSeconds,
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to load playlist tracks.",
        detail:
          status === 429 && retryAfterSeconds
            ? `${err?.message || String(err)}. Retry after ${retryAfterSeconds}s.`
            : err?.message || String(err),
        retryAfterSeconds: retryAfterSeconds || null,
      },
      {
        status,
        headers: retryAfterSeconds
          ? { "Retry-After": retryAfterSeconds, "Cache-Control": "no-store" }
          : { "Cache-Control": "no-store" },
      },
    );
  }
}
