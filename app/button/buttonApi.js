const DEFAULT_RANGE = "all";
const DEFAULT_MAX_POINTS = 180;

async function parseJsonResponse(response, fallbackPrefix) {
  if (!response.ok) {
    throw new Error(
      await response.text().catch(() => `${fallbackPrefix} (${response.status})`),
    );
  }
  return response.json();
}

export async function fetchCounterState(range = DEFAULT_RANGE) {
  const query = new URLSearchParams({
    range: String(range || DEFAULT_RANGE),
    maxPoints: String(DEFAULT_MAX_POINTS),
  });

  const response = await fetch(`/api/counter/state?${query.toString()}`, {
    cache: "no-store",
  });

  return parseJsonResponse(response, "Failed to fetch state");
}

export async function postCounterIncrement(delta) {
  const response = await fetch("/api/counter/increment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta }),
  });

  return parseJsonResponse(response, "Increment failed");
}

export async function postCounterReset({ name, photoDataUrl }) {
  const response = await fetch("/api/counter/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, photoDataUrl }),
  });

  return parseJsonResponse(response, "Reset failed");
}
