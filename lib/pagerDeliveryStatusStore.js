import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";

const STORE_KEY = "__pagerDeliveryStatusStore";
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;
const RECORD_TTL_SEC = Math.floor(RECORD_TTL_MS / 1000);
const KV_RECENT_LIST_KEY = "pager:status:v1:recent";
const KV_RECENT_LIST_MAX = 500;

function nowIso() {
  return new Date().toISOString();
}

function asIsoOrNow(value) {
  const raw = String(value || "").trim();
  if (!raw) return nowIso();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return nowIso();
  return parsed.toISOString();
}

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = new Map();
  }
  return globalThis[STORE_KEY];
}

function pruneStore(map) {
  const cutoff = Date.now() - RECORD_TTL_MS;
  for (const [key, value] of map.entries()) {
    const acceptedAtMs = new Date(value?.acceptedAt || 0).getTime();
    if (!Number.isFinite(acceptedAtMs) || acceptedAtMs < cutoff) {
      map.delete(key);
    }
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractTelemetryTextFromDetail(detail) {
  const raw = String(detail || "");
  const quoted = raw.match(/text:"([^"]+)"/i);
  if (quoted?.[1]) return normalizeTextForMatch(quoted[1]);

  const loose = raw.match(/text:([^|]+?)(?:\s+source:|$)/i);
  if (loose?.[1]) return normalizeTextForMatch(loose[1]);

  return "";
}

function normalizeTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function toEpochMs(value) {
  const parsed = new Date(value || 0).getTime();
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function getPagerStatusStoreBackend() {
  return hasKvConfig() ? "kv" : "memory";
}

function getKvRecordKey(trackingKey) {
  return `pager:status:v1:rec:${trackingKey}`;
}

function normalizeStagePayload(payload) {
  const at = normalizeTimestamp(payload?.at) || "";
  const detail = String(payload?.detail || "").trim().slice(0, 400);
  return { at, detail };
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  const trackingKey = String(record.trackingKey || "").trim();
  const text = normalizeText(record.text);
  const timestamp = normalizeTimestamp(record.timestamp);
  if (!trackingKey || !text || !timestamp) return null;

  const acceptedAt = asIsoOrNow(record.acceptedAt);
  const updatedAt = asIsoOrNow(record.updatedAt || acceptedAt);
  const stages = record.stages && typeof record.stages === "object" ? record.stages : {};

  return {
    trackingKey,
    text,
    timestamp,
    acceptedAt,
    updatedAt,
    stages: {
      gateway_received: normalizeStagePayload(stages.gateway_received),
      mmdvm_tx_started: normalizeStagePayload(stages.mmdvm_tx_started),
      mmdvm_tx_completed: normalizeStagePayload(stages.mmdvm_tx_completed),
    },
  };
}

async function kvPutRecord(record) {
  const normalized = normalizeRecord(record);
  if (!normalized) return null;

  await kv.set(getKvRecordKey(normalized.trackingKey), normalized, { ex: RECORD_TTL_SEC });
  await kv.lpush(KV_RECENT_LIST_KEY, normalized.trackingKey);
  await kv.ltrim(KV_RECENT_LIST_KEY, 0, KV_RECENT_LIST_MAX - 1);
  return normalized;
}

async function kvGetRecordByTrackingKey(trackingKey) {
  const safeKey = String(trackingKey || "").trim();
  if (!safeKey) return null;

  const record = await kv.get(getKvRecordKey(safeKey));
  return normalizeRecord(record);
}

async function kvFindMostRecentPending(maxAgeMs, expectedTextNormalized = "") {
  const safeMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : 0;
  const cutoff = safeMaxAgeMs > 0 ? Date.now() - safeMaxAgeMs : 0;
  const textKey = normalizeTextForMatch(expectedTextNormalized);

  const trackingKeys = await kv.lrange(KV_RECENT_LIST_KEY, 0, 120);
  if (!Array.isArray(trackingKeys) || trackingKeys.length === 0) return null;

  const seen = new Set();
  let newest = null;
  let newestMs = 0;

  for (const keyValue of trackingKeys) {
    const trackingKey = String(keyValue || "").trim();
    if (!trackingKey || seen.has(trackingKey)) continue;
    seen.add(trackingKey);

    const record = await kvGetRecordByTrackingKey(trackingKey);
    if (!record) continue;

    const acceptedMs = toEpochMs(record.acceptedAt);
    if (!acceptedMs || acceptedMs < cutoff) continue;

    const completedAt = String(record?.stages?.mmdvm_tx_completed?.at || "").trim();
    if (completedAt) continue;
    if (textKey && normalizeTextForMatch(record.text) !== textKey) continue;

    const sortMs = Math.max(toEpochMs(record.updatedAt), acceptedMs);
    if (!newest || sortMs > newestMs) {
      newest = record;
      newestMs = sortMs;
    }
  }

  return newest;
}

export function buildPagerTrackingKey({ text, timestamp }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  if (!safeText || !safeTimestamp) return "";

  return createHash("sha256")
    .update(`${safeTimestamp}\n${safeText}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function createInitialRecord({ text, timestamp, acceptedAt }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  const acceptedIso = asIsoOrNow(acceptedAt);
  const trackingKey = buildPagerTrackingKey({
    text: safeText,
    timestamp: safeTimestamp,
  });

  return {
    trackingKey,
    text: safeText,
    timestamp: safeTimestamp,
    acceptedAt: acceptedIso,
    updatedAt: acceptedIso,
    stages: {
      gateway_received: { at: "", detail: "" },
      mmdvm_tx_started: { at: "", detail: "" },
      mmdvm_tx_completed: { at: "", detail: "" },
    },
  };
}

export async function upsertPagerAcceptedStatus({ text, timestamp, acceptedAt }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  if (!safeText || !safeTimestamp) return null;

  const trackingKey = buildPagerTrackingKey({
    text: safeText,
    timestamp: safeTimestamp,
  });
  if (!trackingKey) return null;

  if (hasKvConfig()) {
    const existing = await kvGetRecordByTrackingKey(trackingKey);
    if (existing) {
      const next = {
        ...existing,
        acceptedAt: asIsoOrNow(acceptedAt || existing.acceptedAt),
        updatedAt: nowIso(),
        text: safeText,
        timestamp: safeTimestamp,
      };
      return kvPutRecord(next);
    }

    const initial = createInitialRecord({
      text: safeText,
      timestamp: safeTimestamp,
      acceptedAt,
    });
    return kvPutRecord(initial);
  }

  const store = getStore();
  pruneStore(store);

  const existing = store.get(trackingKey);
  if (existing) {
    const next = {
      ...existing,
      acceptedAt: asIsoOrNow(acceptedAt || existing.acceptedAt),
      updatedAt: nowIso(),
      text: safeText,
      timestamp: safeTimestamp,
    };
    store.set(trackingKey, next);
    return next;
  }

  const initial = createInitialRecord({
    text: safeText,
    timestamp: safeTimestamp,
    acceptedAt,
  });
  store.set(trackingKey, initial);
  return initial;
}

export async function getPagerStatus({ text, timestamp }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  const trackingKey = buildPagerTrackingKey({
    text: safeText,
    timestamp: safeTimestamp,
  });
  if (!trackingKey) return null;

  if (hasKvConfig()) {
    return kvGetRecordByTrackingKey(trackingKey);
  }

  const store = getStore();
  pruneStore(store);
  return store.get(trackingKey) || null;
}

export async function getPagerStatusByTrackingKey(trackingKey) {
  const safeKey = String(trackingKey || "").trim();
  if (!safeKey) return null;

  if (hasKvConfig()) {
    return kvGetRecordByTrackingKey(safeKey);
  }

  const store = getStore();
  pruneStore(store);
  return store.get(safeKey) || null;
}

export async function getMostRecentPendingPagerStatus(maxAgeMs = 10 * 60 * 1000) {
  const safeMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : 0;
  const cutoff = safeMaxAgeMs > 0 ? Date.now() - safeMaxAgeMs : 0;

  if (hasKvConfig()) {
    return kvFindMostRecentPending(safeMaxAgeMs);
  }

  const store = getStore();
  pruneStore(store);

  let newest = null;
  let newestMs = 0;

  for (const value of store.values()) {
    const acceptedMs = toEpochMs(value?.acceptedAt);
    if (!acceptedMs || acceptedMs < cutoff) continue;

    const completedAt = String(value?.stages?.mmdvm_tx_completed?.at || "").trim();
    if (completedAt) continue;

    const sortMs = Math.max(toEpochMs(value?.updatedAt), acceptedMs);
    if (!newest || sortMs > newestMs) {
      newest = value;
      newestMs = sortMs;
    }
  }

  return newest;
}

export async function getMostRecentPendingPagerStatusByText(
  text,
  maxAgeMs = 10 * 60 * 1000,
) {
  const textKey = normalizeTextForMatch(text);
  if (!textKey) return null;

  const safeMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : 0;
  const cutoff = safeMaxAgeMs > 0 ? Date.now() - safeMaxAgeMs : 0;

  if (hasKvConfig()) {
    return kvFindMostRecentPending(safeMaxAgeMs, textKey);
  }

  const store = getStore();
  pruneStore(store);

  let newest = null;
  let newestMs = 0;

  for (const value of store.values()) {
    const acceptedMs = toEpochMs(value?.acceptedAt);
    if (!acceptedMs || acceptedMs < cutoff) continue;

    const completedAt = String(value?.stages?.mmdvm_tx_completed?.at || "").trim();
    if (completedAt) continue;
    if (normalizeTextForMatch(value?.text) !== textKey) continue;

    const sortMs = Math.max(toEpochMs(value?.updatedAt), acceptedMs);
    if (!newest || sortMs > newestMs) {
      newest = value;
      newestMs = sortMs;
    }
  }

  return newest;
}

export async function applyPagerTelemetryEvent({
  trackingKey,
  text,
  timestamp,
  stage,
  at,
  detail,
}) {
  const safeStage = String(stage || "").trim();
  const allowedStages = new Set([
    "gateway_received",
    "mmdvm_tx_started",
    "mmdvm_tx_completed",
  ]);
  if (!allowedStages.has(safeStage)) return null;

  const safeTrackingKey = String(trackingKey || "").trim();
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  const detailTextMatchKey = extractTelemetryTextFromDetail(detail);
  const hasExplicitIdentity = Boolean(
    safeTrackingKey || (safeText && safeTimestamp),
  );

  let existing = await getPagerStatusByTrackingKey(safeTrackingKey);
  if (!existing && safeText && safeTimestamp) {
    existing = await getPagerStatus({ text: safeText, timestamp: safeTimestamp });
  }
  if (!existing && detailTextMatchKey) {
    existing = await getMostRecentPendingPagerStatusByText(detailTextMatchKey);
  }
  if (!existing) {
    existing = await getMostRecentPendingPagerStatus();
  }
  if (!existing) return null;

  const stageAt = asIsoOrNow(at);
  const stageDetail = String(detail || "").trim().slice(0, 400);
  if (safeStage === "gateway_received" && detailTextMatchKey && !hasExplicitIdentity) {
    const expectedTextKey = normalizeTextForMatch(existing.text);
    if (expectedTextKey && expectedTextKey !== detailTextMatchKey) {
      return existing;
    }
  }

  const nextStages = {
    ...existing.stages,
    [safeStage]: {
      at: stageAt,
      detail: stageDetail,
    },
  };

  // Compatibility: if bridge emits only mmdvm_tx_completed, expose started too.
  if (
    safeStage === "mmdvm_tx_completed" &&
    !String(nextStages?.mmdvm_tx_started?.at || "").trim()
  ) {
    nextStages.mmdvm_tx_started = {
      at: stageAt,
      detail: stageDetail,
    };
  }

  const updated = {
    ...existing,
    updatedAt: nowIso(),
    stages: nextStages,
  };

  if (hasKvConfig()) {
    return kvPutRecord(updated);
  }

  const store = getStore();
  store.set(existing.trackingKey, updated);
  return updated;
}
