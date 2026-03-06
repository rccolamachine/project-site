import { NextResponse } from "next/server";
import {
  getTrackById,
  mapTrackForDetails,
  searchTracks,
  trimString,
} from "@/lib/spotify";
import {
  lookupSnapshotTrack,
  shouldUseSnapshotSource,
} from "@/lib/spotifySnapshot";

export const runtime = "nodejs";
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKUP_CACHE_STALE_FALLBACK_MS = 20 * 60 * 1000;
function buildMockSpotifyId(seed) {
  const cleaned = String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const base = `${cleaned}abcdefghijklmnopqrstuv0123456789`;
  return base.slice(0, 22).padEnd(22, "0");
}

function buildMockLookupItem({ trackId, title, artist }) {
  const query = [title, artist].filter(Boolean).join(" ").trim();
  const resolvedTrackId = trimString(trackId) || buildMockSpotifyId(query || "mocktrack");
  const resolvedTitle = trimString(title) || `Mock Track ${resolvedTrackId.slice(0, 6)}`;
  const resolvedArtist = trimString(artist) || "Mock Artist 01";
  const mockArtistId = buildMockSpotifyId(`artist${resolvedArtist}`);
  return {
    trackId: resolvedTrackId,
    title: resolvedTitle,
    artists: [resolvedArtist],
    artistIds: [mockArtistId],
    albumTitle: "Mock Album 01",
    albumCoverUrl: "",
    year: "2000",
    externalUrl: `https://open.spotify.com/track/${resolvedTrackId}`,
    mock: true,
  };
}

function getLookupStore() {
  const key = "__spotifyLookupRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalThis[key];
}

function getLookupCacheKey(trackId, title, artist) {
  const safeTrackId = trimString(trackId);
  if (safeTrackId) return `track:${safeTrackId}`;
  const query = [trimString(title), trimString(artist)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return `query:${query}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const trackId = trimString(searchParams.get("trackId"));
  const title = trimString(searchParams.get("title"));
  const artist = trimString(searchParams.get("artist"));
  const useSnapshot =
    shouldUseSnapshotSource(searchParams.get("snapshot")) ||
    shouldUseSnapshotSource(process.env.SPOTIFY_SNAPSHOT_MODE);
  const useMock =
    !useSnapshot &&
    (shouldUseSnapshotSource(searchParams.get("mock")) ||
      shouldUseSnapshotSource(process.env.SPOTIFY_MOCK_MODE));
  const query = [title, artist].filter(Boolean).join(" ").trim();
  const cacheKey = getLookupCacheKey(trackId, title, artist);
  const now = Date.now();
  const store = getLookupStore();
  const cacheStore = store.cache;
  const inflightStore = store.inflight;

  if (!trackId && !query) {
    return NextResponse.json(
      { error: "Provide trackId or title/artist." },
      { status: 400 },
    );
  }

  try {
    if (useSnapshot) {
      const item = await lookupSnapshotTrack({ trackId, title, artist });
      return NextResponse.json(
        {
          item,
          source: trackId ? "trackId" : "query",
          snapshot: true,
        },
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
        {
          item: buildMockLookupItem({ trackId, title, artist }),
          source: trackId ? "trackId" : "query",
          mock: true,
        },
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
        cached.payload,
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
      return NextResponse.json(
        payload,
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Spotify-Cache": "DEDUPED",
          },
        },
      );
    }

    const loadPromise = (async () => {
      if (trackId) {
        const track = await getTrackById(trackId);
        const payload = track
          ? { item: mapTrackForDetails(track), source: "trackId" }
          : { item: null, source: "trackId" };

        const nowMs = Date.now();
        cacheStore.set(cacheKey, {
          payload,
          cachedAtMs: nowMs,
          expiresAtMs: nowMs + LOOKUP_CACHE_TTL_MS,
        });
        return payload;
      }

      const tracks = await searchTracks(query, 1);
      const first = tracks[0];
      const payload = {
        item: first ? mapTrackForDetails(first) : null,
        source: "query",
      };

      const nowMs = Date.now();
      cacheStore.set(cacheKey, {
        payload,
        cachedAtMs: nowMs,
        expiresAtMs: nowMs + LOOKUP_CACHE_TTL_MS,
      });
      return payload;
    })();
    inflightStore.set(cacheKey, loadPromise);
    const payload = await loadPromise;
    inflightStore.delete(cacheKey);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Spotify-Cache": "MISS",
      },
    });
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
      nowMs - Number(cached.cachedAtMs || 0) <= LOOKUP_CACHE_STALE_FALLBACK_MS
    ) {
      return NextResponse.json(
        {
          ...cached.payload,
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
      const item = await lookupSnapshotTrack({ trackId, title, artist });
      if (item) {
        return NextResponse.json(
          {
            item,
            source: trackId ? "trackId" : "query",
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
        error: "Spotify lookup failed.",
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
