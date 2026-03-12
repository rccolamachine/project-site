export const DEFAULT_DURATION_HOURS = 24;
export const DURATION_CANDIDATE_HOURS = [1, 3, 6, 12, 24, 48, 72, 168, 336];
export const SPRITE_MAX_COL = 15;
export const SPRITE_MAX_ROW = 5;

export function parseIsoToMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  return Date.parse(raw);
}

export function hasMappableCoordinates(entry) {
  const lat = Number(entry?.latitude);
  const lon = Number(entry?.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

export function hasSymbolSprite(entry) {
  const tableId = Number(entry?.symbolTableId);
  const col = Number(entry?.symbolSpriteCol);
  const row = Number(entry?.symbolSpriteRow);
  return (
    (tableId === 0 || tableId === 1) &&
    Number.isFinite(col) &&
    Number.isFinite(row) &&
    col >= 0 &&
    col <= SPRITE_MAX_COL &&
    row >= 0 &&
    row <= SPRITE_MAX_ROW
  );
}

export function formatTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "--";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

export function formatTimestampParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return { date: "--", time: "" };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: raw, time: "" };

  return {
    date: parsed.toLocaleDateString(),
    time: parsed.toLocaleTimeString(),
  };
}

export function formatLatitude(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${Math.abs(numeric).toFixed(5)}\u00B0 ${numeric >= 0 ? "N" : "S"}`;
}

export function formatLongitude(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${Math.abs(numeric).toFixed(5)}\u00B0 ${numeric >= 0 ? "E" : "W"}`;
}

export function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toFixed(digits);
}

export function formatDurationLabel(hours) {
  const numeric = Number(hours);
  if (!Number.isFinite(numeric) || numeric <= 0) return "All";
  if (numeric < 24) return `Past ${numeric} hour${numeric === 1 ? "" : "s"}`;

  const days = numeric / 24;
  if (Number.isInteger(days)) {
    return `Past ${days} day${days === 1 ? "" : "s"}`;
  }

  return `Past ${numeric} hours`;
}

export function getSymbolRenderData(entry) {
  const symbolCode = String(entry?.symbolCode || "").trim();
  const symbolOverlay = String(entry?.symbolOverlay || "").trim();
  const symbolTableId = Number(entry?.symbolTableId);
  const symbolSpriteCol = Number(entry?.symbolSpriteCol);
  const symbolSpriteRow = Number(entry?.symbolSpriteRow);

  return {
    symbolCode,
    symbolOverlay,
    symbolTableId,
    symbolSpriteCol,
    symbolSpriteRow,
    hasSprite: hasSymbolSprite(entry),
  };
}

export function getSymbolSpriteStyleVars(entry) {
  const render = getSymbolRenderData(entry);
  if (!render.hasSprite) return {};

  return {
    "--packet-col": render.symbolSpriteCol,
    "--packet-row": render.symbolSpriteRow,
  };
}

export function getSymbolSpriteStyleAttr(entry) {
  const render = getSymbolRenderData(entry);
  if (!render.hasSprite) return "";
  return `--packet-col:${render.symbolSpriteCol};--packet-row:${render.symbolSpriteRow};`;
}
