export function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSongDate(input) {
  const date = new Date(`${input}T00:00:00`);
  if (Number.isNaN(date.getTime())) return input || "Unknown date";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatPlaylistAddedAt(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatArtistList(artists) {
  return Array.isArray(artists)
    ? artists.filter(Boolean).join(", ")
    : String(artists || "").trim();
}

export function getSpotifyTrackIdFromEntry(track) {
  if (!track || typeof track !== "object") return "";

  const directId = String(track.spotifyTrackId || "").trim();
  if (directId) return directId;

  const rawId = String(track.id || "").trim();
  if (/^[A-Za-z0-9]{22}$/.test(rawId)) return rawId;
  if (rawId.startsWith("spotify:track:")) {
    return rawId.split(":").pop() || "";
  }

  const rawUri = String(track.spotifyTrackUri || "").trim();
  if (rawUri.startsWith("spotify:track:")) {
    return rawUri.split(":").pop() || "";
  }

  const rawExternalUrl = String(track.externalUrl || "").trim();
  if (!rawExternalUrl) return "";

  try {
    const parsed = new URL(rawExternalUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "track" && /^[A-Za-z0-9]{22}$/.test(parts[1] || "")) {
      return parts[1];
    }
  } catch {
    return "";
  }

  return "";
}

export function toSpotifyTrackUri(trackId) {
  const safeTrackId = String(trackId || "").trim();
  return safeTrackId ? `spotify:track:${safeTrackId}` : "";
}

export function getTrackIdFromSpotifyUri(uri) {
  const value = String(uri || "").trim();
  if (!value.startsWith("spotify:track:")) return "";
  return value.split(":").pop() || "";
}

export function initialFormState() {
  return {
    title: "",
    artist: "",
    date: getTodayDateInputValue(),
  };
}

export function promptForCredentials() {
  const usernameRaw = window.prompt("Username:");
  if (usernameRaw === null) return { cancelled: true };

  const passwordRaw = window.prompt("Password:");
  if (passwordRaw === null) return { cancelled: true };

  const username = usernameRaw.trim();
  const password = passwordRaw.trim();

  if (!username || !password) {
    return {
      cancelled: false,
      error: "Username and password are required.",
    };
  }

  return {
    cancelled: false,
    username,
    password,
  };
}
