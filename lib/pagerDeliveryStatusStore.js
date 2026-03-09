import { createHash } from "node:crypto";

const STORE_KEY = "__pagerDeliveryStatusStore";
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

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

export function upsertPagerAcceptedStatus({ text, timestamp, acceptedAt }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  if (!safeText || !safeTimestamp) return null;

  const store = getStore();
  pruneStore(store);

  const trackingKey = buildPagerTrackingKey({
    text: safeText,
    timestamp: safeTimestamp,
  });
  if (!trackingKey) return null;

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

export function getPagerStatus({ text, timestamp }) {
  const safeText = normalizeText(text);
  const safeTimestamp = normalizeTimestamp(timestamp);
  const trackingKey = buildPagerTrackingKey({
    text: safeText,
    timestamp: safeTimestamp,
  });
  if (!trackingKey) return null;

  const store = getStore();
  pruneStore(store);
  return store.get(trackingKey) || null;
}

export function getPagerStatusByTrackingKey(trackingKey) {
  const safeKey = String(trackingKey || "").trim();
  if (!safeKey) return null;

  const store = getStore();
  pruneStore(store);
  return store.get(safeKey) || null;
}

export function getMostRecentPendingPagerStatus(maxAgeMs = 10 * 60 * 1000) {
  const safeMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : 0;
  const cutoff = safeMaxAgeMs > 0 ? Date.now() - safeMaxAgeMs : 0;

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

export function applyPagerTelemetryEvent({
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

  let existing = getPagerStatusByTrackingKey(trackingKey);
  if (!existing) {
    existing = getPagerStatus({ text, timestamp });
  }
  if (!existing) {
    existing = getMostRecentPendingPagerStatus();
  }
  if (!existing) return null;

  const stageAt = asIsoOrNow(at);
  const stageDetail = String(detail || "").trim().slice(0, 400);
  const updated = {
    ...existing,
    updatedAt: nowIso(),
    stages: {
      ...existing.stages,
      [safeStage]: {
        at: stageAt,
        detail: stageDetail,
      },
    },
  };

  const store = getStore();
  store.set(existing.trackingKey, updated);
  return updated;
}
