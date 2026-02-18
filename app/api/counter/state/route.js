// app/api/counter/state/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_MAX = "game:counter:max";
const KEY_MAX_AT = "game:counter:maxAt";
const KEY_SHAME = "game:counter:shame";
const KEY_LAST_CLICK_AT = "game:counter:lastClickAt";
const KEY_VALUE_EVENTS = "game:counter:valueEvents";
const KEY_VALUE_DAILY = "game:counter:valueDaily";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE = "all";
const DEFAULT_MAX_POINTS = 180;

const RANGE_TO_MS = Object.freeze({
  "30m": 30 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
  "1y": 365 * DAY_MS,
  "5y": 5 * 365 * DAY_MS,
});

const BUCKET_STEPS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
  30 * DAY_MS,
  90 * DAY_MS,
];

function parseRange(rangeRaw) {
  const key = String(rangeRaw || DEFAULT_RANGE).toLowerCase();
  if (key === "all") return { key: "all", ms: null };
  if (Object.hasOwn(RANGE_TO_MS, key)) return { key, ms: RANGE_TO_MS[key] };
  return { key: DEFAULT_RANGE, ms: null };
}

function parseMaxPoints(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return DEFAULT_MAX_POINTS;
  return Math.max(40, Math.min(420, Math.floor(n)));
}

function parseValueEventSnapshots(rawEvents) {
  const out = [];
  for (const raw of Array.isArray(rawEvents) ? rawEvents : []) {
    let event = raw;
    if (typeof event === "string") {
      try {
        event = JSON.parse(event);
      } catch {
        continue;
      }
    }
    if (!event || typeof event !== "object") continue;
    const tsMs = typeof event.ts === "string" ? Date.parse(event.ts) : Number.NaN;
    const valueRaw = Number(event.value);
    if (!Number.isFinite(tsMs) || !Number.isFinite(valueRaw)) continue;
    out.push({ tsMs, value: Math.max(0, Math.floor(valueRaw)) });
  }
  out.sort((a, b) => a.tsMs - b.tsMs);
  return out;
}

function parseDailySnapshots(rawDaily) {
  if (!rawDaily || typeof rawDaily !== "object") return [];
  const out = [];
  for (const [dayKey, valueAny] of Object.entries(rawDaily)) {
    const tsMs = Date.parse(`${dayKey}T23:59:59.999Z`);
    const valueRaw = Number(valueAny);
    if (!Number.isFinite(tsMs) || !Number.isFinite(valueRaw)) continue;
    out.push({ tsMs, value: Math.max(0, Math.floor(valueRaw)) });
  }
  out.sort((a, b) => a.tsMs - b.tsMs);
  return out;
}

function pickBucketMs(targetBucketMs) {
  for (const step of BUCKET_STEPS_MS) {
    if (targetBucketMs <= step) return step;
  }
  return BUCKET_STEPS_MS[BUCKET_STEPS_MS.length - 1];
}

function chooseSource(rangeMs, eventSnapshots, dailySnapshots, nowMs) {
  if (rangeMs !== null) {
    if (rangeMs <= 3 * DAY_MS) return "events";
    return dailySnapshots.length > 0 ? "daily" : "events";
  }

  const eventStart = eventSnapshots[0]?.tsMs ?? Number.POSITIVE_INFINITY;
  const dailyStart = dailySnapshots[0]?.tsMs ?? Number.POSITIVE_INFINITY;
  const earliest = Math.min(eventStart, dailyStart, nowMs);
  const span = Math.max(0, nowMs - earliest);

  if (span <= 3 * DAY_MS || dailySnapshots.length <= 0) return "events";
  return "daily";
}

function buildSeriesFromSnapshots({
  snapshots,
  startMs,
  endMs,
  maxPoints,
  fallbackValue,
}) {
  const sorted = snapshots
    .filter((x) => Number.isFinite(x?.tsMs) && Number.isFinite(x?.value))
    .sort((a, b) => a.tsMs - b.tsMs);

  const safeStart = Number.isFinite(startMs) ? Math.floor(startMs) : Date.now();
  const safeEnd = Number.isFinite(endMs)
    ? Math.max(Math.floor(endMs), safeStart + 1)
    : safeStart + 1;
  const targetBucketMs = Math.max(
    1,
    Math.ceil((safeEnd - safeStart) / Math.max(1, maxPoints - 1)),
  );
  const bucketMs = pickBucketMs(targetBucketMs);
  const alignedStart = Math.floor(safeStart / bucketMs) * bucketMs;
  const alignedEnd = Math.floor(safeEnd / bucketMs) * bucketMs;

  const series = [];
  let idx = 0;
  let carry = Math.max(0, Math.floor(Number(fallbackValue) || 0));

  while (idx < sorted.length && sorted[idx].tsMs <= alignedStart) {
    carry = sorted[idx].value;
    idx += 1;
  }
  if (idx === 0 && sorted.length > 0 && sorted[0].tsMs > alignedStart) {
    carry = sorted[0].value;
  }

  for (let t = alignedStart; t <= alignedEnd; t += bucketMs) {
    const bucketEnd = t + bucketMs - 1;
    while (idx < sorted.length && sorted[idx].tsMs <= bucketEnd) {
      carry = sorted[idx].value;
      idx += 1;
    }
    series.push({
      at: new Date(t).toISOString(),
      value: carry,
    });
  }

  return {
    series: series.slice(-maxPoints),
    meta: {
      startAt: new Date(alignedStart).toISOString(),
      endAt: new Date(alignedEnd).toISOString(),
      bucketMs,
    },
  };
}

export async function GET(req) {
  try {
    const range = parseRange(req?.nextUrl?.searchParams?.get("range"));
    const maxPoints = parseMaxPoints(
      req?.nextUrl?.searchParams?.get("maxPoints"),
    );
    const valueEventScanLimit =
      range.ms !== null
        ? range.ms > 3 * DAY_MS
          ? 1500
          : Math.max(1000, Math.min(25000, Math.ceil(range.ms / 5000) + 120))
        : 2000;

    const [
      value,
      max,
      maxAt,
      shameRaw,
      lastClickAt,
      valueEventsRaw,
      valueDailyRaw,
    ] = await Promise.all([
      kv.get(KEY_VALUE),
      kv.get(KEY_MAX),
      kv.get(KEY_MAX_AT),
      kv.lrange(KEY_SHAME, 0, 49),
      kv.get(KEY_LAST_CLICK_AT),
      kv.lrange(KEY_VALUE_EVENTS, 0, valueEventScanLimit - 1),
      kv.hgetall(KEY_VALUE_DAILY),
    ]);

    const shame = (Array.isArray(shameRaw) ? shameRaw : [])
      .map((s) => {
        try {
          return typeof s === "string" ? JSON.parse(s) : s;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const currentValue = Math.max(0, Math.floor(Number(value) || 0));
    const nowMs = Date.now();

    const eventSnapshots = parseValueEventSnapshots(valueEventsRaw);
    const dailySnapshots = parseDailySnapshots(valueDailyRaw);
    const historyStartMs = Math.min(
      eventSnapshots[0]?.tsMs ?? Number.POSITIVE_INFINITY,
      dailySnapshots[0]?.tsMs ?? Number.POSITIVE_INFINITY,
      nowMs,
    );
    const historySpanMs = Math.max(0, nowMs - historyStartMs);
    const source = chooseSource(range.ms, eventSnapshots, dailySnapshots, nowMs);

    const activeSnapshots =
      source === "daily"
        ? dailySnapshots
        : eventSnapshots;

    const earliestMs = activeSnapshots[0]?.tsMs ?? nowMs;
    const startMs =
      range.ms === null ? earliestMs : Math.max(0, nowMs - range.ms);

    const withNow = activeSnapshots.concat([{ tsMs: nowMs, value: currentValue }]);
    const built = buildSeriesFromSnapshots({
      snapshots: withNow,
      startMs,
      endMs: nowMs,
      maxPoints,
      fallbackValue: currentValue,
    });

    return NextResponse.json({
      value: currentValue,
      max: Number(max ?? 0),
      maxAt: String(maxAt ?? ""),
      shame,
      lastClickAt: String(lastClickAt ?? ""),
      valueSeries: built.series,
      valueSeriesMeta: {
        ...built.meta,
        range: range.key,
        source,
        points: built.series.length,
        maxPoints,
        historyStartAt: new Date(historyStartMs).toISOString(),
        historyEndAt: new Date(nowMs).toISOString(),
        historySpanMs,
      },
    });
  } catch (e) {
    return new NextResponse(`State failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
