import { NextResponse } from "next/server";
import { getPlaylistItems, normalizeLimit, trimString } from "@/lib/spotify";
import {
  getSnapshotPlaylistPage,
  shouldUseSnapshotSource,
} from "@/lib/spotifySnapshot";

export const runtime = "nodejs";
const PLAYLIST_CACHE_TTL_MS = 90_000;
const PLAYLIST_CACHE_STALE_FALLBACK_MS = 10 * 60 * 1000;
const DEFAULT_MOCK_TOTAL = 260;
const MAX_MOCK_TOTAL = 5_000;

function getPlaylistCacheStore() {
  const key = "__spotifyPlaylistRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalThis[key];
}

function getPlaylistCacheKey(playlistId, offset, limit) {
  return `${playlistId}:${offset}:${limit}`;
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

function resolveMockTotal(searchParams) {
  const value = Number(searchParams.get("mockTotal"));
  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_MOCK_TOTAL;
  }
  return Math.min(value, MAX_MOCK_TOTAL);
}

function buildMockTrackId(index) {
  return `mock${String(index + 1).padStart(18, "0")}`;
}

function mapMockPlaylistTrack(playlistId, index) {
  const trackId = buildMockTrackId(index);
  return {
    id: trackId,
    spotifyTrackId: trackId,
    spotifyTrackUri: `spotify:track:${trackId}`,
    title: `Mock Track ${String(index + 1).padStart(3, "0")} lkadflksdnglksgn `,
    artists: [
      `Mock Artist ${String((index % 37) + 1).padStart(2, "0")} adjsfh lkansdj `,
    ],
    previewUrl: "",
    albumTitle: `Mock Album ${String((index % 12) + 1).padStart(2, "0")}`,
    year: String(1980 + (index % 40)),
    externalUrl: `https://open.spotify.com/track/${trackId}`,
    mock: true,
    sourcePlaylistId: playlistId,
  };
}

function buildMockPlaylistPage({ playlistId, total, offset, limit }) {
  const boundedOffset = Math.max(0, Math.min(offset, total));
  const boundedLimit = Math.max(1, limit);
  const end = Math.min(total, boundedOffset + boundedLimit);
  const items = [];
  for (let i = boundedOffset; i < end; i += 1) {
    items.push(mapMockPlaylistTrack(playlistId, i));
  }
  return {
    items,
    total,
    offset: boundedOffset,
    limit: boundedLimit,
    mock: true,
  };
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
    externalUrl: track?.external_urls?.spotify || "",
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = resolvePlaylistId(searchParams);
  const limit = normalizeLimit(searchParams.get("limit"), 25, 1, 50);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const forceMock = shouldUseSnapshotSource(searchParams.get("mock"));
  const forceSnapshot = shouldUseSnapshotSource(searchParams.get("snapshot"));
  const envMock = shouldUseSnapshotSource(process.env.SPOTIFY_MOCK_MODE);
  const envSnapshot = shouldUseSnapshotSource(process.env.SPOTIFY_SNAPSHOT_MODE);
  const useSnapshot = forceSnapshot || envSnapshot;
  const useMock = !useSnapshot && (forceMock || envMock);
  const store = getPlaylistCacheStore();
  const cacheStore = store.cache;
  const inflightStore = store.inflight;
  const cacheKey = getPlaylistCacheKey(playlistId, offset, limit);
  const now = Date.now();

  if (!playlistId) {
    return NextResponse.json(
      { error: "playlistId is required." },
      { status: 400 },
    );
  }

  try {
    if (useSnapshot) {
      const snapshotPage = await getSnapshotPlaylistPage(playlistId, {
        offset,
        limit,
      });
      if (snapshotPage) {
        return NextResponse.json(
          {
            items: snapshotPage.items,
            total: snapshotPage.total,
            declaredTotal: snapshotPage.declaredTotal,
            partial: snapshotPage.partial,
            offset: snapshotPage.offset,
            limit: snapshotPage.limit,
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
    }

    if (useMock) {
      const mockTotal = resolveMockTotal(searchParams);
      const payload = buildMockPlaylistPage({
        playlistId,
        total: mockTotal,
        offset,
        limit,
      });
      return NextResponse.json(payload, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Spotify-Cache": "MOCK",
        },
      });
    }

    const cached = cacheStore.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return NextResponse.json(
        {
          items: cached.items,
          total: cached.total,
          offset: cached.offset,
          limit: cached.limit,
        },
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
      const page = await getPlaylistItems(playlistId, { offset, limit });
      const items = page.items.map(mapPlaylistTrack).filter((x) => x.title);

      const payload = {
        items,
        total: page.total,
        offset: page.offset,
        limit: page.limit,
      };

      const nowMs = Date.now();
      cacheStore.set(cacheKey, {
        ...payload,
        cachedAtMs: nowMs,
        expiresAtMs: nowMs + PLAYLIST_CACHE_TTL_MS,
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
      nowMs - Number(cached.cachedAtMs || 0) <= PLAYLIST_CACHE_STALE_FALLBACK_MS
    ) {
      return NextResponse.json(
        {
          items: cached.items,
          total: cached.total,
          offset: cached.offset,
          limit: cached.limit,
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
      const snapshotPage = await getSnapshotPlaylistPage(playlistId, {
        offset,
        limit,
      });
      if (snapshotPage) {
        return NextResponse.json(
          {
            items: snapshotPage.items,
            total: snapshotPage.total,
            declaredTotal: snapshotPage.declaredTotal,
            partial: snapshotPage.partial,
            offset: snapshotPage.offset,
            limit: snapshotPage.limit,
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
