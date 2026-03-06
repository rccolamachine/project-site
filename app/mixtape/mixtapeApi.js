export async function getApiErrorMessage(res, fallbackMessage) {
  const json = await res.json().catch(() => null);
  return json?.detail || json?.error || fallbackMessage;
}

export function buildSpotifyApiUrl(pathname, params) {
  const searchParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function fetchJsonOrThrow(url, options, fallbackMessage) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, fallbackMessage));
  }

  return res.json().catch(() => null);
}

export async function fetchSongsList() {
  const json = await fetchJsonOrThrow(
    "/api/songs",
    { cache: "no-store" },
    "Failed to load songs.",
  );

  return Array.isArray(json?.items) ? json.items : [];
}

export async function createSongEntry(payload) {
  const json = await fetchJsonOrThrow(
    "/api/songs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Failed to add song entry.",
  );

  return json?.item || null;
}

export async function deleteSongEntry(payload) {
  return fetchJsonOrThrow(
    "/api/songs",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Failed to delete song.",
  );
}

export async function searchSpotifyTracks({ query, limit = 7, signal }) {
  const json = await fetchJsonOrThrow(
    buildSpotifyApiUrl("/api/spotify/search", {
      q: query,
      limit,
    }),
    {
      cache: "no-store",
      signal,
    },
    "Spotify search failed.",
  );

  return Array.isArray(json?.tracks) ? json.tracks : [];
}

export async function lookupSpotifyTrack({ trackId, title, artist, signal }) {
  const json = await fetchJsonOrThrow(
    buildSpotifyApiUrl("/api/spotify/lookup", {
      trackId,
      title,
      artist,
    }),
    {
      cache: "no-store",
      signal,
    },
    "Spotify lookup failed.",
  );

  return json?.item || null;
}

export async function fetchSpotifyPlaylistPage({
  playlistId,
  offset,
  limit,
  signal,
}) {
  return fetchJsonOrThrow(
    buildSpotifyApiUrl("/api/spotify/playlist", {
      playlistId,
      offset,
      limit,
    }),
    {
      cache: "no-store",
      signal,
    },
    "Failed to load playlist tracks.",
  );
}
