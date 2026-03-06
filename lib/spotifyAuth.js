function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEnvValue(value) {
  const trimmed = safeTrim(value);
  if (trimmed.length < 2) return trimmed;

  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (!isDoubleQuoted && !isSingleQuoted) return trimmed;

  return trimmed.slice(1, -1).trim();
}

export function readSpotifyEnvValue(name) {
  return normalizeEnvValue(process.env[name]);
}
