import {
  RANGE_DURATION_MS,
  VALUE_BUCKET_MS,
  VALUE_SERIES_POINTS,
  VALUE_SERIES_RANGE_OPTIONS,
} from "./buttonConstants";

export function normalizeShame(shame) {
  const rows = Array.isArray(shame) ? shame : [];
  return rows
    .map((row) => {
      if (!row) return null;
      if (typeof row === "string") {
        try {
          return JSON.parse(row);
        } catch {
          return null;
        }
      }
      return row;
    })
    .filter(Boolean);
}

export function normalizeValueSeries(rawSeries) {
  const rows = Array.isArray(rawSeries) ? rawSeries : [];
  const out = [];

  for (const row of rows) {
    const at = String(row?.at ?? "");
    const ms = Date.parse(at);
    if (!at || !Number.isFinite(ms)) continue;

    const valueRaw = Number(row?.value ?? 0);
    const value = Number.isFinite(valueRaw)
      ? Math.max(0, Math.floor(valueRaw))
      : 0;

    out.push({ at: new Date(ms).toISOString(), ms, value });
  }

  out.sort((a, b) => a.ms - b.ms);
  return out.slice(-VALUE_SERIES_POINTS);
}

export function upsertValueSeriesPoint(prevSeries, atIso, valueRaw, bucketMsRaw) {
  const value = Number.isFinite(Number(valueRaw))
    ? Math.max(0, Math.floor(Number(valueRaw)))
    : 0;

  const parsedAtMs = Date.parse(String(atIso || ""));
  const atMs = Number.isFinite(parsedAtMs) ? parsedAtMs : Date.now();
  const bucketMsSize = Number.isFinite(Number(bucketMsRaw))
    ? Math.max(60_000, Math.floor(Number(bucketMsRaw)))
    : VALUE_BUCKET_MS;
  const bucketStartMs = Math.floor(atMs / bucketMsSize) * bucketMsSize;
  const bucketIso = new Date(bucketStartMs).toISOString();

  const next = normalizeValueSeries(prevSeries).map((point) => ({ ...point }));
  const existingIdx = next.findIndex((point) => point.ms === bucketStartMs);

  if (existingIdx >= 0) {
    next[existingIdx].value = value;
  } else {
    next.push({ at: bucketIso, ms: bucketStartMs, value });
    next.sort((a, b) => a.ms - b.ms);
  }

  return next.slice(-VALUE_SERIES_POINTS);
}

export function getAvailableRangeOptions(historySpanMsRaw) {
  const spanMs = Number.isFinite(Number(historySpanMsRaw))
    ? Math.max(0, Number(historySpanMsRaw))
    : 0;

  if (VALUE_SERIES_RANGE_OPTIONS.length <= 0) return [];

  const allOption = VALUE_SERIES_RANGE_OPTIONS.find((opt) => opt.value === "all");
  const progressiveOptions = VALUE_SERIES_RANGE_OPTIONS.filter(
    (opt) => opt.value !== "all",
  );

  if (progressiveOptions.length <= 0) {
    return allOption ? [allOption] : [];
  }

  const available = [progressiveOptions[0]];
  for (let i = 1; i < progressiveOptions.length; i += 1) {
    const prev = progressiveOptions[i - 1];
    const requiredMs = RANGE_DURATION_MS[prev.value];
    if (!Number.isFinite(requiredMs) || spanMs < requiredMs) break;
    available.push(progressiveOptions[i]);
  }

  if (allOption) available.push(allOption);
  return available;
}
