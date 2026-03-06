import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PLAYLIST_URL =
  "https://open.spotify.com/playlist/4X8HWeNNCCc1sdVQA4NQOo";
const DEFAULT_OUTPUT_RELATIVE = "data/spotify_playlist_snapshot.json";
const DEFAULT_ENV_FILES = [".env.local", ".env.development.local"];
const SPOTIFY_API_PAGE_SIZE = 50;

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseYear(value) {
  const raw = safeTrim(value);
  if (!raw) return "";
  const year = raw.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function stripWrappingQuotes(value) {
  const raw = safeTrim(value);
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

async function loadEnvFiles(baseDir) {
  for (const relativePath of DEFAULT_ENV_FILES) {
    const filePath = path.join(baseDir, relativePath);
    let text = "";
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const withoutExport = trimmed.startsWith("export ")
        ? trimmed.slice("export ".length)
        : trimmed;
      const separatorIndex = withoutExport.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = withoutExport.slice(0, separatorIndex).trim();
      if (!key || process.env[key] != null) continue;

      const rawValue = withoutExport.slice(separatorIndex + 1);
      process.env[key] = stripWrappingQuotes(rawValue);
    }
  }
}

function parseArgs(argv) {
  const options = {
    playlist: DEFAULT_PLAYLIST_URL,
    out: DEFAULT_OUTPUT_RELATIVE,
    html: "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--playlist=")) {
      options.playlist = safeTrim(arg.slice("--playlist=".length)) || options.playlist;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.out = safeTrim(arg.slice("--out=".length)) || options.out;
      continue;
    }
    if (arg.startsWith("--html=")) {
      options.html = safeTrim(arg.slice("--html=".length));
    }
  }

  return options;
}

function parsePlaylistId(input) {
  const raw = safeTrim(input);
  if (!raw) return "";
  if (/^[A-Za-z0-9]{10,}$/.test(raw) && !raw.includes("/")) return raw;

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.findIndex((part) => part === "playlist");
    if (playlistIndex >= 0) {
      return safeTrim(parts[playlistIndex + 1] || "");
    }
  } catch {
    const match = raw.match(/playlist\/([A-Za-z0-9]+)/i);
    return safeTrim(match?.[1] || "");
  }

  return "";
}

function parseSpotifyIdFromUri(uri, prefix) {
  const raw = safeTrim(uri);
  const expected = `spotify:${prefix}:`;
  if (!raw.startsWith(expected)) return "";
  return safeTrim(raw.slice(expected.length));
}

function parseSpotifyIdFromExternalUrl(url, prefix) {
  const raw = safeTrim(url);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== prefix) return "";
    return safeTrim(parts[1]);
  } catch {
    return "";
  }
}

function pickImageUrl(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const sorted = [...sources].sort((a, b) => (a?.width || 0) - (b?.width || 0));
  return safeTrim(sorted[1]?.url || sorted[0]?.url || "");
}

function mapPublicTrackItem(item, playlistId) {
  const track = item?.itemV2?.data;
  if (!track || track.__typename !== "Track") return null;

  const spotifyTrackUri = safeTrim(track.uri);
  const spotifyTrackId = parseSpotifyIdFromUri(spotifyTrackUri, "track");
  if (!spotifyTrackId) return null;

  const artists = Array.isArray(track?.artists?.items)
    ? track.artists.items.map((artist) => safeTrim(artist?.profile?.name)).filter(Boolean)
    : [];

  const artistIds = Array.isArray(track?.artists?.items)
    ? track.artists.items
        .map((artist) => parseSpotifyIdFromUri(artist?.uri, "artist"))
        .filter(Boolean)
    : [];

  return {
    id: spotifyTrackId,
    spotifyTrackId,
    spotifyTrackUri,
    title: safeTrim(track.name),
    artists,
    artistIds,
    previewUrl: safeTrim(track?.previews?.audioPreviews?.items?.[0]?.url),
    albumTitle: safeTrim(track?.albumOfTrack?.name),
    albumCoverUrl: pickImageUrl(track?.albumOfTrack?.coverArt?.sources),
    year: "",
    addedAt: "",
    externalUrl: `https://open.spotify.com/track/${spotifyTrackId}`,
    sourcePlaylistId: playlistId,
  };
}

function mapApiTrackItem(item, playlistId) {
  const track = item?.track || item?.item || {};
  const spotifyTrackUri = safeTrim(track?.uri);
  const spotifyTrackId =
    safeTrim(track?.id) ||
    parseSpotifyIdFromUri(spotifyTrackUri, "track") ||
    parseSpotifyIdFromExternalUrl(track?.external_urls?.spotify, "track");
  if (!spotifyTrackId) return null;

  const artists = Array.isArray(track?.artists)
    ? track.artists.map((artist) => safeTrim(artist?.name)).filter(Boolean)
    : [];
  const artistIds = Array.isArray(track?.artists)
    ? track.artists.map((artist) => safeTrim(artist?.id)).filter(Boolean)
    : [];

  return {
    id: spotifyTrackId,
    spotifyTrackId,
    spotifyTrackUri: spotifyTrackUri || `spotify:track:${spotifyTrackId}`,
    title: safeTrim(track?.name),
    artists,
    artistIds,
    previewUrl: safeTrim(track?.preview_url),
    albumTitle: safeTrim(track?.album?.name),
    albumCoverUrl: pickImageUrl(track?.album?.images),
    year: parseYear(track?.album?.release_date),
    addedAt: safeTrim(item?.added_at),
    externalUrl:
      safeTrim(track?.external_urls?.spotify) ||
      `https://open.spotify.com/track/${spotifyTrackId}`,
    sourcePlaylistId: playlistId,
  };
}

function parseInitialState(html) {
  const match = html.match(
    /<script id="initialState" type="text\/plain">([A-Za-z0-9+/=]+)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not find initialState in Spotify playlist HTML.");
  }
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function loadPlaylistHtml({ playlistUrl, htmlPath }) {
  if (htmlPath) {
    return fs.readFile(htmlPath, "utf8");
  }

  const res = await fetch(playlistUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch playlist page (${res.status}).`);
  }
  return res.text();
}

async function loadPlaylistSnapshotFromApi(playlistId, playlistUrl) {
  const clientId = safeTrim(process.env.SPOTIFY_CLIENT_ID);
  const clientSecret = safeTrim(process.env.SPOTIFY_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return null;
  }

  const { getPlaylistItems, getSpotifyAccessToken } = await import("../lib/spotify.js");
  const accessToken = await getSpotifyAccessToken();

  const metaResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?fields=name`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (!metaResponse.ok) {
    throw new Error(`Failed to fetch playlist metadata (${metaResponse.status}).`);
  }

  const metaJson = await metaResponse.json().catch(() => null);
  const playlistName = safeTrim(metaJson?.name);

  let offset = 0;
  let total = 0;
  const rawItems = [];

  do {
    const page = await getPlaylistItems(playlistId, {
      offset,
      limit: SPOTIFY_API_PAGE_SIZE,
    });
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    total = Math.max(0, Number(page?.total || 0));
    rawItems.push(...pageItems);
    offset += pageItems.length;

    if (pageItems.length === 0) break;
  } while (offset < total);

  const items = rawItems
    .map((item) => mapApiTrackItem(item, playlistId))
    .filter(Boolean);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: "spotify-web-api-playlist-items",
    sourceUrl: playlistUrl,
    playlistId,
    playlistName,
    total: items.length,
    declaredTotal: Math.max(items.length, total),
    partial: items.length < total,
    items,
  };
}

async function loadPlaylistSnapshotFromPublicPage(playlistId, playlistUrl, htmlPath) {
  const html = await loadPlaylistHtml({
    playlistUrl,
    htmlPath,
  });
  const initialState = parseInitialState(html);

  const entityKey = `spotify:playlist:${playlistId}`;
  const playlistEntity =
    initialState?.entities?.items?.[entityKey] ||
    Object.entries(initialState?.entities?.items || {}).find(([key]) =>
      key.startsWith("spotify:playlist:"),
    )?.[1];

  if (!playlistEntity) {
    throw new Error("Playlist entity was not found in initialState payload.");
  }

  const rawItems = Array.isArray(playlistEntity?.content?.items)
    ? playlistEntity.content.items
    : [];
  const items = rawItems
    .map((item) => mapPublicTrackItem(item, playlistId))
    .filter(Boolean);

  const declaredTotal = Math.max(
    0,
    Number(playlistEntity?.content?.totalCount || items.length) || items.length,
  );

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: "spotify-public-playlist-page",
    sourceUrl: playlistUrl,
    playlistId,
    playlistName: safeTrim(playlistEntity?.name),
    total: items.length,
    declaredTotal,
    partial: declaredTotal > items.length,
    items,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFiles(process.cwd());

  const playlistId = parsePlaylistId(options.playlist);
  if (!playlistId) {
    throw new Error("Unable to parse playlist id from --playlist argument.");
  }

  const playlistUrl = options.playlist.includes("http")
    ? options.playlist
    : `https://open.spotify.com/playlist/${playlistId}`;
  const outputPath = path.isAbsolute(options.out)
    ? options.out
    : path.join(process.cwd(), options.out);

  let snapshot = null;
  let apiError = null;

  try {
    snapshot = await loadPlaylistSnapshotFromApi(playlistId, playlistUrl);
  } catch (err) {
    apiError = err;
  }

  if (!snapshot) {
    snapshot = await loadPlaylistSnapshotFromPublicPage(
      playlistId,
      playlistUrl,
      options.html,
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const summary = {
    ok: true,
    outputPath,
    playlistId,
    playlistName: snapshot.playlistName,
    itemsSaved: snapshot.items.length,
    declaredTotal: snapshot.declaredTotal,
    partial: snapshot.partial,
    source: snapshot.source,
    addedAtCount: snapshot.items.filter((item) => safeTrim(item?.addedAt)).length,
    apiError: apiError ? apiError.message || String(apiError) : "",
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err?.message || String(err),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
