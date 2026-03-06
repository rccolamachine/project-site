import { readSpotifyEnvValue } from "./spotifyAuth.js";

const TOKEN_SAFETY_BUFFER_MS = 60_000;
const RATE_LIMIT_RETRY_ATTEMPTS = 2;
const SERVER_RETRY_ATTEMPTS = 1;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1_200;
const MAX_RATE_LIMIT_WAIT_MS = 10 * 60 * 1000;
const GLOBAL_RATE_LIMIT_GRACE_MS = 120;
const MAX_BLOCKING_WAIT_MS = 2_500;
const SPOTIFY_FETCH_TIMEOUT_MS = 12_000;
const BACKOFF_BASE_MS = 350;
const BACKOFF_MAX_MS = 4_000;

let spotifyRateLimitedUntilMs = 0;

const tokenCaches = {
  app: {
    accessToken: "",
    expiresAtMs: 0,
  },
  user: {
    accessToken: "",
    expiresAtMs: 0,
  },
};

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBackoffDelayMs(attempt) {
  const exp = Math.max(0, Number(attempt) - 1);
  const withoutJitter = BACKOFF_BASE_MS * (2 ** exp);
  const jitter = Math.floor(Math.random() * 180);
  return Math.min(BACKOFF_MAX_MS, withoutJitter + jitter);
}

async function fetchWithTimeout(url, options, { context, timeoutMs } = {}) {
  const effectiveTimeoutMs = Math.max(
    1_000,
    Number(timeoutMs || SPOTIFY_FETCH_TIMEOUT_MS),
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw createSpotifyError({
        context: context || "Spotify request",
        status: 504,
        message: `${context || "Spotify request"} timed out after ${Math.ceil(
          effectiveTimeoutMs / 1000,
        )}s.`,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function setGlobalRateLimitWindow(waitMs) {
  const boundedWaitMs = Math.max(0, Number(waitMs) || 0);
  if (!boundedWaitMs) return;
  const nextUntil = Date.now() + boundedWaitMs + GLOBAL_RATE_LIMIT_GRACE_MS;
  spotifyRateLimitedUntilMs = Math.max(spotifyRateLimitedUntilMs, nextUntil);
}

async function waitForGlobalRateLimitWindow() {
  const remainingMs = spotifyRateLimitedUntilMs - Date.now();
  if (remainingMs <= 0) return;

  if (remainingMs > MAX_BLOCKING_WAIT_MS) {
    throw createSpotifyError({
      context: "Spotify rate limit",
      status: 429,
      message:
        "Spotify rate limit cooldown is active. Retry after the provided delay.",
      retryAfterMs: remainingMs,
    });
  }

  await wait(remainingMs);
}

function parseRetryAfterMs(retryAfterHeader) {
  const raw = safeTrim(retryAfterHeader);
  if (!raw) return DEFAULT_RATE_LIMIT_WAIT_MS;

  const secondsValue = Number(raw);
  if (Number.isFinite(secondsValue) && secondsValue > 0) {
    return clampNumber(secondsValue * 1000, 300, MAX_RATE_LIMIT_WAIT_MS);
  }

  const absoluteMs = Date.parse(raw);
  if (Number.isFinite(absoluteMs)) {
    const deltaMs = absoluteMs - Date.now();
    if (deltaMs > 0) {
      return clampNumber(deltaMs, 300, MAX_RATE_LIMIT_WAIT_MS);
    }
  }

  return DEFAULT_RATE_LIMIT_WAIT_MS;
}

function parseErrorMessage(rawDetail) {
  const text = safeTrim(rawDetail);
  if (!text) return "";

  try {
    const json = JSON.parse(text);
    return (
      safeTrim(json?.error?.message) ||
      safeTrim(json?.message) ||
      text
    );
  } catch {
    return text;
  }
}

async function readErrorMessage(res) {
  const raw = await res.text().catch(() => "");
  return parseErrorMessage(raw);
}

function createSpotifyError({
  context,
  status,
  message,
  retryAfterMs = 0,
  retryAfterHeader = "",
}) {
  const fallback = `${context} failed (${status}).`;
  const err = new Error(safeTrim(message) || fallback);
  err.status = status;
  if (retryAfterMs > 0) {
    err.retryAfterMs = retryAfterMs;
  }
  if (safeTrim(retryAfterHeader)) {
    err.retryAfterHeader = safeTrim(retryAfterHeader);
  }
  return err;
}

async function spotifyApiFetch(url, { accessToken, context }) {
  let rateLimitRetries = 0;
  let transientRetries = 0;

  while (true) {
    await waitForGlobalRateLimitWindow();

    let res;
    try {
      res = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
        { context },
      );
    } catch (err) {
      const errStatus = Number(err?.status) || 0;
      const isTransient = errStatus === 504 || errStatus === 502;
      if (isTransient && transientRetries < SERVER_RETRY_ATTEMPTS) {
        transientRetries += 1;
        await wait(getBackoffDelayMs(transientRetries));
        continue;
      }
      throw err;
    }

    if (res.ok) return res;

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
      setGlobalRateLimitWindow(retryAfterMs);
      if (
        rateLimitRetries < RATE_LIMIT_RETRY_ATTEMPTS &&
        retryAfterMs <= MAX_BLOCKING_WAIT_MS
      ) {
        rateLimitRetries += 1;
        await waitForGlobalRateLimitWindow();
        continue;
      }

      const message =
        (await readErrorMessage(res)) ||
        "Too many requests from Spotify. Wait a few seconds and retry.";
      throw createSpotifyError({
        context,
        status: 429,
        message,
        retryAfterMs,
        retryAfterHeader,
      });
    }

    if (res.status >= 500 && res.status <= 599) {
      if (transientRetries < SERVER_RETRY_ATTEMPTS) {
        transientRetries += 1;
        await wait(getBackoffDelayMs(transientRetries));
        continue;
      }
    }

    const message = await readErrorMessage(res);
    throw createSpotifyError({
      context,
      status: res.status,
      message,
    });
  }
}

function parseYear(releaseDate) {
  const raw = safeTrim(releaseDate);
  if (!raw) return "";
  const [year] = raw.split("-");
  return /^\d{4}$/.test(year) ? year : "";
}

function pickAlbumCoverUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return "";
  const sorted = [...images].sort(
    (a, b) => (a?.width || 0) - (b?.width || 0),
  );
  return sorted[1]?.url || sorted[0]?.url || "";
}

export function normalizeLimit(raw, fallback = 7, min = 1, max = 10) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return Math.max(min, Math.min(max, value));
}

function getCache(mode) {
  return mode === "user" ? tokenCaches.user : tokenCaches.app;
}

async function fetchSpotifyToken({ mode, clientId, clientSecret, refreshToken }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body =
    mode === "user"
      ? `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
      : "grant_type=client_credentials";

  const tokenRes = await fetchWithTimeout(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    },
    { context: "Spotify token request" },
  );

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    throw new Error(
      detail || `Spotify token request failed (${tokenRes.status}).`,
    );
  }

  const tokenJson = await tokenRes.json();
  const accessToken = safeTrim(tokenJson?.access_token);
  const expiresInSeconds = Number(tokenJson?.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("Spotify token response is missing required fields.");
  }

  const cache = getCache(mode);
  cache.accessToken = accessToken;
  cache.expiresAtMs = Date.now() + expiresInSeconds * 1000;

  return accessToken;
}

export async function getSpotifyAccessToken() {
  const now = Date.now();
  const clientId = readSpotifyEnvValue("SPOTIFY_CLIENT_ID");
  const clientSecret = readSpotifyEnvValue("SPOTIFY_CLIENT_SECRET");
  const refreshToken = readSpotifyEnvValue("SPOTIFY_REFRESH_TOKEN");
  if (!clientId || !clientSecret) {
    throw new Error(
      "Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
    );
  }

  const modeOrder = refreshToken ? ["user", "app"] : ["app"];
  let lastError = null;

  for (const mode of modeOrder) {
    const cache = getCache(mode);
    if (cache.accessToken && cache.expiresAtMs - TOKEN_SAFETY_BUFFER_MS > now) {
      return cache.accessToken;
    }

    try {
      return await fetchSpotifyToken({
        mode,
        clientId,
        clientSecret,
        refreshToken,
      });
    } catch (err) {
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error("Unable to obtain Spotify access token.")
  );
}

export function mapTrackForSearch(item) {
  return {
    id: item?.id || "",
    title: item?.name || "",
    artists: Array.isArray(item?.artists)
      ? item.artists.map((x) => x?.name).filter(Boolean)
      : [],
    artistIds: Array.isArray(item?.artists)
      ? item.artists.map((x) => x?.id).filter(Boolean)
      : [],
    album: item?.album?.name || "",
    externalUrl: item?.external_urls?.spotify || "",
  };
}

export function mapTrackForDetails(item) {
  return {
    trackId: item?.id || "",
    title: item?.name || "",
    artists: Array.isArray(item?.artists)
      ? item.artists.map((x) => x?.name).filter(Boolean)
      : [],
    artistIds: Array.isArray(item?.artists)
      ? item.artists.map((x) => x?.id).filter(Boolean)
      : [],
    albumTitle: item?.album?.name || "",
    albumCoverUrl: pickAlbumCoverUrl(item?.album?.images),
    year: parseYear(item?.album?.release_date),
    externalUrl: item?.external_urls?.spotify || "",
  };
}

export async function searchTracks(query, limit = 7) {
  const q = safeTrim(query);
  if (!q) return [];

  const accessToken = await getSpotifyAccessToken();
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", q);

  const res = await spotifyApiFetch(url.toString(), {
    accessToken,
    context: "Spotify search",
  });

  const json = await res.json();
  return Array.isArray(json?.tracks?.items) ? json.tracks.items : [];
}

export async function getTrackById(trackId) {
  const id = safeTrim(trackId);
  if (!id) return null;

  const accessToken = await getSpotifyAccessToken();
  const trackUrl = `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`;
  let res;
  try {
    res = await spotifyApiFetch(trackUrl, {
      accessToken,
      context: "Spotify track lookup",
    });
  } catch (err) {
    if (Number(err?.status) === 404) return null;
    throw err;
  }

  return res.json();
}

export async function getPlaylistItems(playlistId, { offset = 0, limit = 25 } = {}) {
  const id = safeTrim(playlistId);
  if (!id) {
    throw new Error("Playlist id is required.");
  }

  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 25));
  const boundedOffset = Math.max(0, Number(offset) || 0);

  const accessToken = await getSpotifyAccessToken();
  const url = new URL(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/items`,
  );
  url.searchParams.set("offset", String(boundedOffset));
  url.searchParams.set("limit", String(boundedLimit));

  let res;
  try {
    res = await spotifyApiFetch(url.toString(), {
      accessToken,
      context: "Spotify playlist request",
    });
  } catch (err) {
    if (Number(err?.status) === 403) {
      const forbiddenError = new Error(
        "Spotify denied playlist track access (403). This can happen even for shared/public playlists with client-credentials. Add SPOTIFY_REFRESH_TOKEN (playlist-read-private, playlist-read-collaborative) for reliable pagination.",
      );
      forbiddenError.status = 403;
      throw forbiddenError;
    }
    throw err;
  }

  const json = await res.json();
  return {
    total: Number(json?.total || 0),
    offset: Number(json?.offset || boundedOffset),
    limit: Number(json?.limit || boundedLimit),
    items: Array.isArray(json?.items) ? json.items : [],
  };
}

export async function getAllPlaylistItems(playlistId, { pageLimit = 50 } = {}) {
  const id = safeTrim(playlistId);
  if (!id) {
    throw new Error("Playlist id is required.");
  }

  const boundedPageLimit = Math.max(1, Math.min(50, Number(pageLimit) || 50));
  const firstPage = await getPlaylistItems(id, { offset: 0, limit: boundedPageLimit });
  const total = Math.max(0, Number(firstPage?.total || 0));
  const items = Array.isArray(firstPage?.items) ? [...firstPage.items] : [];

  for (let offset = items.length; offset < total; offset += boundedPageLimit) {
    const page = await getPlaylistItems(id, {
      offset,
      limit: boundedPageLimit,
    });
    if (!Array.isArray(page?.items) || page.items.length === 0) break;
    items.push(...page.items);
  }

  return {
    total,
    items,
  };
}

export function trimString(value) {
  return safeTrim(value);
}
