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
  };
}

export async function fetchPagerDeliveryStatus({ text, timestamp, signal }) {
  const res = await fetch(PAGER_STATUS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, timestamp }),
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
