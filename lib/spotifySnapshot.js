import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SNAPSHOT_RELATIVE_PATH = "data/spotify_playlist_snapshot.json";
const SNAPSHOT_CACHE_TTL_MS = 30_000;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const snapshotCache = {
  filePath: "",
  expiresAtMs: 0,
  payload: null,
};

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeTrim(item)).filter(Boolean);
  }
  const single = safeTrim(value);
  return single ? [single] : [];
}

function parseSpotifyIdFromUri(uri, prefix) {
  const raw = safeTrim(uri);
  const expectedPrefix = `spotify:${prefix}:`;
  if (!raw.startsWith(expectedPrefix)) return "";
  return safeTrim(raw.slice(expectedPrefix.length));
}

function parseTrackIdFromExternalUrl(url) {
  const raw = safeTrim(url);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "track") return "";
    return safeTrim(parts[1]);
  } catch {
    return "";
  }
}

function pickAlbumCoverUrl(value) {
  if (typeof value === "string") {
    return safeTrim(value);
  }

  const sources = Array.isArray(value?.sources)
    ? value.sources
    : Array.isArray(value)
      ? value
      : [];
  if (sources.length === 0) return "";

  const sorted = [...sources].sort((a, b) => (a?.width || 0) - (b?.width || 0));
  return safeTrim(sorted[1]?.url || sorted[0]?.url || "");
}

function parseYear(value) {
  const raw = safeTrim(value);
  if (!raw) return "";
  const year = raw.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function normalizeTrack(track, index, playlistId) {
  const title = safeTrim(track?.title || track?.name);

  const artists =
    Array.isArray(track?.artists) && track.artists.length > 0
      ? track.artists
          .map((item) =>
            typeof item === "string" ? item : safeTrim(item?.name || item?.profile?.name),
          )
          .filter(Boolean)
      : normalizeStringList(track?.artist);

  const artistIds =
    Array.isArray(track?.artistIds) && track.artistIds.length > 0
      ? normalizeStringList(track.artistIds)
      : Array.isArray(track?.artists)
        ? track.artists
            .map((item) =>
              safeTrim(item?.id || parseSpotifyIdFromUri(item?.uri, "artist")),
            )
            .filter(Boolean)
        : [];

  const spotifyTrackId = safeTrim(
    track?.spotifyTrackId ||
      track?.trackId ||
      track?.id ||
      parseSpotifyIdFromUri(track?.spotifyTrackUri || track?.uri, "track") ||
      parseTrackIdFromExternalUrl(track?.externalUrl),
  );

  const spotifyTrackUri = safeTrim(
    track?.spotifyTrackUri || track?.uri || (spotifyTrackId ? `spotify:track:${spotifyTrackId}` : ""),
  );

  const externalUrl = safeTrim(
    track?.externalUrl ||
      track?.url ||
      (spotifyTrackId ? `https://open.spotify.com/track/${spotifyTrackId}` : ""),
  );

  const albumTitle = safeTrim(
    track?.albumTitle || track?.album || track?.albumName || track?.albumOfTrack?.name,
  );

  const albumCoverUrl = pickAlbumCoverUrl(
    track?.albumCoverUrl || track?.albumCover || track?.albumOfTrack?.coverArt,
  );

  const previewUrl = safeTrim(track?.previewUrl || track?.preview_url);
  const year = parseYear(track?.year || track?.releaseDate || track?.release_date);
  const addedAt = safeTrim(track?.addedAt || track?.added_at);

  return {
    id: spotifyTrackId || safeTrim(track?.id || `snapshot-track-${index + 1}`),
    spotifyTrackId,
    spotifyTrackUri,
    title,
    artists,
    artistIds,
    previewUrl,
    albumTitle,
    albumCoverUrl,
    year,
    addedAt,
    externalUrl,
    sourcePlaylistId: safeTrim(track?.sourcePlaylistId || playlistId),
  };
}

function normalizeSnapshotPayload(raw) {
  if (!raw || typeof raw !== "object") return null;

  const playlistId = safeTrim(raw.playlistId || raw.id);
  const itemsInput = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsInput
    .map((item, index) => normalizeTrack(item, index, playlistId))
    .filter((item) => item.title && item.spotifyTrackId);

  const declaredTotal = Math.max(
    0,
    Number(raw.declaredTotal || raw.total || items.length) || items.length,
  );
  const partial = Boolean(raw.partial) || declaredTotal > items.length;
  const total = partial ? items.length : Math.max(items.length, declaredTotal);

  return {
    playlistId,
    name: safeTrim(raw.playlistName || raw.name),
    total,
    declaredTotal,
    partial,
    generatedAt: safeTrim(raw.generatedAt),
    items,
  };
}

function resolveSnapshotPath() {
  const configured = safeTrim(process.env.SPOTIFY_PLAYLIST_SNAPSHOT_PATH);
  const resolved = configured || DEFAULT_SNAPSHOT_RELATIVE_PATH;
  return path.isAbsolute(resolved)
    ? resolved
    : path.join(process.cwd(), resolved);
}

export function shouldUseSnapshotSource(value) {
  return TRUE_VALUES.has(safeTrim(value).toLowerCase());
}

export async function loadLocalSpotifySnapshot() {
  const filePath = resolveSnapshotPath();
  const now = Date.now();

  if (
    snapshotCache.payload &&
    snapshotCache.filePath === filePath &&
    snapshotCache.expiresAtMs > now
  ) {
    return snapshotCache.payload;
  }

  try {
    const rawFile = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(rawFile);
    const normalized = normalizeSnapshotPayload(parsed);
    snapshotCache.filePath = filePath;
    snapshotCache.payload = normalized;
    snapshotCache.expiresAtMs = now + SNAPSHOT_CACHE_TTL_MS;
    return normalized;
  } catch {
    snapshotCache.filePath = filePath;
    snapshotCache.payload = null;
    snapshotCache.expiresAtMs = now + SNAPSHOT_CACHE_TTL_MS;
    return null;
  }
}

export async function getSnapshotPlaylistPage(
  playlistId,
  { offset = 0, limit = 25 } = {},
) {
  const snapshot = await loadLocalSpotifySnapshot();
  if (!snapshot || !Array.isArray(snapshot.items)) return null;

  const requestedId = safeTrim(playlistId);
  if (requestedId && snapshot.playlistId && requestedId !== snapshot.playlistId) {
    return null;
  }

  const boundedOffset = Math.max(
    0,
    Math.min(Number(offset) || 0, snapshot.items.length),
  );
  const boundedLimit = Math.max(1, Number(limit) || 25);
  const pageItems = snapshot.items.slice(
    boundedOffset,
    Math.min(snapshot.items.length, boundedOffset + boundedLimit),
  );

  return {
    items: pageItems,
    total: snapshot.total,
    declaredTotal: snapshot.declaredTotal,
    partial: snapshot.partial,
    offset: boundedOffset,
    limit: boundedLimit,
    generatedAt: snapshot.generatedAt,
  };
}

function normalizeSearchQuery(query) {
  return safeTrim(query).toLowerCase();
}

export async function searchSnapshotTracks(query, limit = 7) {
  const snapshot = await loadLocalSpotifySnapshot();
  if (!snapshot || !Array.isArray(snapshot.items)) return [];

  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return [];

  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 7));
  const results = [];

  for (const item of snapshot.items) {
    const haystack = [
      item.title,
      ...normalizeStringList(item.artists),
      item.albumTitle,
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(normalizedQuery)) continue;

    results.push({
      id: item.spotifyTrackId || item.id,
      title: item.title,
      artists: normalizeStringList(item.artists),
      artistIds: normalizeStringList(item.artistIds),
      album: item.albumTitle || "",
      externalUrl: item.externalUrl || "",
      snapshot: true,
    });

    if (results.length >= boundedLimit) break;
  }

  return results;
}

function mapSnapshotTrackToDetails(item) {
  if (!item) return null;
  return {
    trackId: item.spotifyTrackId || item.id || "",
    title: item.title || "",
    artists: normalizeStringList(item.artists),
    artistIds: normalizeStringList(item.artistIds),
    albumTitle: item.albumTitle || "",
    albumCoverUrl: item.albumCoverUrl || "",
    year: item.year || "",
    externalUrl:
      item.externalUrl ||
      (item.spotifyTrackId ? `https://open.spotify.com/track/${item.spotifyTrackId}` : ""),
  };
}

export async function lookupSnapshotTrack({ trackId, title, artist } = {}) {
  const snapshot = await loadLocalSpotifySnapshot();
  if (!snapshot || !Array.isArray(snapshot.items)) return null;

  const normalizedTrackId = safeTrim(trackId);
  if (normalizedTrackId) {
    const byTrackId = snapshot.items.find(
      (item) =>
        item.spotifyTrackId === normalizedTrackId ||
        item.id === normalizedTrackId ||
        parseTrackIdFromExternalUrl(item.externalUrl) === normalizedTrackId,
    );
    return mapSnapshotTrackToDetails(byTrackId);
  }

  const query = normalizeSearchQuery([title, artist].filter(Boolean).join(" "));
  if (!query) return null;

  const byQuery = snapshot.items.find((item) => {
    const haystack = [item.title, ...normalizeStringList(item.artists), item.albumTitle]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
  return mapSnapshotTrackToDetails(byQuery);
}
