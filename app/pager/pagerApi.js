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

  return {
    ok: Boolean(json?.ok),
    text: String(json?.text || ""),
    timestamp: String(json?.timestamp || "").trim(),
    trackingKey: String(json?.trackingKey || "").trim(),
  };
}

export async function fetchPagerDeliveryStatus({
  trackingKey,
  text,
  timestamp,
  signal,
}) {
  const safeTrackingKey = String(trackingKey || "").trim();
  const useGetByTrackingKey = Boolean(safeTrackingKey);
  const requestUrl = useGetByTrackingKey
    ? `${PAGER_STATUS_ENDPOINT}?trackingKey=${encodeURIComponent(safeTrackingKey)}`
    : PAGER_STATUS_ENDPOINT;

  const requestInit = useGetByTrackingKey
    ? {
        method: "GET",
        signal,
        cache: "no-store",
      }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timestamp }),
        signal,
        cache: "no-store",
      };

  const res = await fetch(requestUrl, requestInit);

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
