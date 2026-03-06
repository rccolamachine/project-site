import { NextResponse } from "next/server";
import {
  mapTrackForSearch,
  normalizeLimit,
  searchTracks,
  trimString,
} from "@/lib/spotify";
import {
  searchSnapshotTracks,
  shouldUseSnapshotSource,
} from "@/lib/spotifySnapshot";

export const runtime = "nodejs";
const SEARCH_CACHE_TTL_MS = 45_000;
const SEARCH_CACHE_STALE_FALLBACK_MS = 5 * 60 * 1000;
function buildMockSpotifyId(seed, index = 0) {
  const cleaned = String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const base = `${cleaned}${String(index + 1)}abcdefghijklmnopqrstuv0123456789`;
  return base.slice(0, 22).padEnd(22, "0");
}

function buildMockSearchTracks(query, limit) {
  const count = Math.max(1, Math.min(10, Number(limit) || 7));
  const tracks = [];
  for (let i = 0; i < count; i += 1) {
    const trackId = buildMockSpotifyId(query, i);
    tracks.push({
      id: trackId,
      title: `Mock ${query} ${i + 1}`,
      artists: [`Mock Artist ${String((i % 9) + 1).padStart(2, "0")}`],
      artistIds: [buildMockSpotifyId(`artist${query}`, i)],
      album: `Mock Album ${String((i % 6) + 1).padStart(2, "0")}`,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
      mock: true,
    });
  }
  return tracks;
}

function getSearchStore() {
  const key = "__spotifySearchRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalThis[key];
}

function getSearchCacheKey(query, limit) {
  return `${String(query || "").toLowerCase()}::${Number(limit) || 0}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = trimString(searchParams.get("q"));
  const limit = normalizeLimit(searchParams.get("limit"));
  const useSnapshot =
    shouldUseSnapshotSource(searchParams.get("snapshot")) ||
    shouldUseSnapshotSource(process.env.SPOTIFY_SNAPSHOT_MODE);
  const useMock =
    !useSnapshot &&
    (shouldUseSnapshotSource(searchParams.get("mock")) ||
      shouldUseSnapshotSource(process.env.SPOTIFY_MOCK_MODE));
  const now = Date.now();
  const store = getSearchStore();
  const cacheStore = store.cache;
  const inflightStore = store.inflight;
  const cacheKey = getSearchCacheKey(query, limit);

  if (query.length < 2) {
    return NextResponse.json(
      { tracks: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    if (useSnapshot) {
      const tracks = await searchSnapshotTracks(query, limit);
      return NextResponse.json(
        { tracks, snapshot: true },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Spotify-Cache": "SNAPSHOT",
          },
        },
      );
    }

    if (useMock) {
      return NextResponse.json(
        { tracks: buildMockSearchTracks(query, limit), mock: true },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Spotify-Cache": "MOCK",
          },
        },
      );
    }

    const cached = cacheStore.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return NextResponse.json(
        { tracks: cached.tracks },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Spotify-Cache": "HIT",
          },
        },
      );
    }

    const existingInflight = inflightStore.get(cacheKey);
    if (existingInflight) {
      const payload = await existingInflight;
      return NextResponse.json(payload, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Spotify-Cache": "DEDUPED",
        },
      });
    }

    const loadPromise = (async () => {
      const rawTracks = await searchTracks(query, limit);
      const tracks = rawTracks
        .map(mapTrackForSearch)
        .filter((x) => x.id && x.title);
      const payload = { tracks };
      const nowMs = Date.now();
      cacheStore.set(cacheKey, {
        ...payload,
        cachedAtMs: nowMs,
        expiresAtMs: nowMs + SEARCH_CACHE_TTL_MS,
      });
      return payload;
    })();
    inflightStore.set(cacheKey, loadPromise);
    const payload = await loadPromise;
    inflightStore.delete(cacheKey);

    return NextResponse.json(
      payload,
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Spotify-Cache": "MISS",
        },
      },
    );
  } catch (err) {
    inflightStore.delete(cacheKey);
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
    const cached = cacheStore.get(cacheKey);
    const nowMs = Date.now();

    if (
      status === 429 &&
      cached &&
      nowMs - Number(cached.cachedAtMs || 0) <= SEARCH_CACHE_STALE_FALLBACK_MS
    ) {
      return NextResponse.json(
        {
          tracks: cached.tracks,
          stale: true,
          retryAfterSeconds: retryAfterSeconds || null,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Spotify-Cache": "STALE",
            ...(retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {}),
          },
        },
      );
    }

    if (useSnapshot && (status === 429 || status === 403 || status >= 500)) {
      const tracks = await searchSnapshotTracks(query, limit);
      if (tracks.length > 0) {
        return NextResponse.json(
          {
            tracks,
            snapshot: true,
            stale: true,
            retryAfterSeconds: retryAfterSeconds || null,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "X-Spotify-Cache": "SNAPSHOT-FALLBACK",
              ...(retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {}),
            },
          },
        );
      }
    }

    return NextResponse.json(
      {
        error: "Spotify search failed.",
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
