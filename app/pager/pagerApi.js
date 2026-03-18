const PAGER_ENDPOINT = "/api/pager";
const PAGER_STATUS_ENDPOINT = "/api/pager/status";

function getApiErrorMessage(json, fallbackMessage) {
  return String(json?.detail || json?.error || fallbackMessage || "").trim();
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export async function sendPagerMessage({ text, username, password, signal }) {
  const res = await fetch(PAGER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildBasicAuthHeader(username, password),
    },
    body: JSON.stringify({ text }),
    signal,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(getApiErrorMessage(json, "Failed to send pager message."));
  }

  const trackingKey = String(json?.trackingKey || "").trim();
  if (!trackingKey) {
    throw new Error("Pager API did not return a tracking key.");
  }

  return {
    ok: Boolean(json?.ok),
    text: String(json?.text || ""),
    timestamp: String(json?.timestamp || "").trim(),
    trackingKey,
  };
}

export async function fetchPagerDeliveryStatus({ trackingKey, signal }) {
  const safeTrackingKey = String(trackingKey || "").trim();
  if (!safeTrackingKey) {
    throw new Error("Tracking key is required for pager status polling.");
  }

  const requestUrl = `${PAGER_STATUS_ENDPOINT}?trackingKey=${encodeURIComponent(safeTrackingKey)}`;
  const res = await fetch(requestUrl, {
    method: "GET",
    signal,
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (res.status === 404) {
    return {
      ok: false,
      notFound: true,
      telemetryConfigured: Boolean(json?.telemetryConfigured),
    };
  }

  if (!res.ok) {
    throw new Error(getApiErrorMessage(json, "Failed to load pager status."));
  }

  return {
    ok: true,
    telemetryConfigured: Boolean(json?.telemetryConfigured),
    acceptedAt: String(json?.acceptedAt || "").trim(),
    updatedAt: String(json?.updatedAt || "").trim(),
    stages:
      json?.stages && typeof json.stages === "object" && !Array.isArray(json.stages)
        ? json.stages
        : {},
  };
}
