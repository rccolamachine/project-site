const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthyEnvValue(value) {
  return TRUTHY_ENV_VALUES.has(String(value || "").trim().toLowerCase());
}

export const MIXTAPE_PLAYLIST_ID = "4X8HWeNNCCc1sdVQA4NQOo";
export const PLAYLIST_PAGE_SIZE = 25;
export const CLIENT_SPOTIFY_MOCK_MODE = isTruthyEnvValue(
  process.env.NEXT_PUBLIC_SPOTIFY_MOCK_MODE,
);
export const CLIENT_SPOTIFY_MOCK_TOTAL = Math.max(
  1,
  Number(process.env.NEXT_PUBLIC_SPOTIFY_MOCK_TOTAL || 260),
);
export const CLIENT_SHOW_FULL_MIXTAPE_PANEL = isTruthyEnvValue(
  process.env.NEXT_PUBLIC_SHOW_FULL_MIXTAPE_PANEL,
);
export const PLAYER_LOADING_RETRY_MESSAGE =
  "Spotify player is still loading. Click play again in a second.";
