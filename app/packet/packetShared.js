export const DEFAULT_DURATION_HOURS = 24;
export const DURATION_CANDIDATE_HOURS = [1, 3, 6, 12, 24, 48, 72, 168, 336];

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
    Number.isFinite(row)
  );
}
