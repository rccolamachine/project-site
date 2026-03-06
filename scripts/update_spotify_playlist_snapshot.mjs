import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PLAYLIST_URL =
  "https://open.spotify.com/playlist/4X8HWeNNCCc1sdVQA4NQOo";
const DEFAULT_OUTPUT_RELATIVE = "data/spotify_playlist_snapshot.json";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
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

function pickImageUrl(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const sorted = [...sources].sort((a, b) => (a?.width || 0) - (b?.width || 0));
  return safeTrim(sorted[1]?.url || sorted[0]?.url || "");
}

function mapTrackItem(item, playlistId) {
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
    externalUrl: `https://open.spotify.com/track/${spotifyTrackId}`,
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
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

  const html = await loadPlaylistHtml({
    playlistUrl,
    htmlPath: options.html,
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
    .map((item) => mapTrackItem(item, playlistId))
    .filter(Boolean);

  const declaredTotal = Math.max(
    0,
    Number(playlistEntity?.content?.totalCount || items.length) || items.length,
  );
  const partial = declaredTotal > items.length;
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "spotify-public-playlist-page",
    sourceUrl: playlistUrl,
    playlistId,
    playlistName: safeTrim(playlistEntity?.name),
    total: items.length,
    declaredTotal,
    partial,
    items,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const summary = {
    ok: true,
    outputPath,
    playlistId,
    playlistName: snapshot.playlistName,
    itemsSaved: items.length,
    declaredTotal,
    partial,
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
