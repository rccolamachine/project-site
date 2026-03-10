export function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeIsoTimestamp(value) {
  const raw = safeTrim(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function sanitizeDetailText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
}

export function normalizeTelemetryMatchText(value) {
  return sanitizeDetailText(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parsePagerTelemetryDetail(detail) {
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const structured = {
      target: safeTrim(detail.target),
      text: sanitizeDetailText(detail.text),
      source: safeTrim(detail.source),
      event: safeTrim(detail.event),
    };
    return Object.fromEntries(
      Object.entries(structured).filter(([, value]) => Boolean(value)),
    );
  }

  const raw = safeTrim(detail);
  if (!raw) return {};

  const parsed = {};
  const targetMatch = raw.match(/(?:^|\s)target:([^\s|]+)/i);
  const textQuotedMatch = raw.match(/text:"([^"]+)"/i);
  const textLooseMatch = raw.match(/text:([^|]+?)(?:\s+source:|$)/i);
  const sourceMatch = raw.match(/(?:^|\s)source:([^\s|]+)/i);
  const eventMatch = raw.match(/(?:^|\s)event:([^\s|]+)/i);

  if (targetMatch?.[1]) parsed.target = sanitizeDetailText(targetMatch[1]);
  if (textQuotedMatch?.[1]) {
    parsed.text = sanitizeDetailText(textQuotedMatch[1]);
  } else if (textLooseMatch?.[1]) {
    parsed.text = sanitizeDetailText(textLooseMatch[1]);
  }
  if (sourceMatch?.[1]) parsed.source = sanitizeDetailText(sourceMatch[1]);
  if (eventMatch?.[1]) parsed.event = sanitizeDetailText(eventMatch[1]);

  return parsed;
}

export function extractPagerTelemetryText(detail) {
  const parsed = parsePagerTelemetryDetail(detail);
  return safeTrim(parsed.text);
}

export function isPagerGatewayTextMatch({ stages, expectedText }) {
  const safeStages =
    stages && typeof stages === "object" && !Array.isArray(stages) ? stages : {};
  const gatewayAt = safeTrim(safeStages?.gateway_received?.at);
  if (!gatewayAt) return false;

  const expected = normalizeTelemetryMatchText(expectedText);
  const detailText = normalizeTelemetryMatchText(
    extractPagerTelemetryText(safeStages?.gateway_received?.detail),
  );

  return Boolean(expected) && Boolean(detailText) && expected === detailText;
}

export function isPagerTelemetryFullConfirmation({ stages, expectedText }) {
  const safeStages =
    stages && typeof stages === "object" && !Array.isArray(stages) ? stages : {};
  const txStartedAt = safeTrim(safeStages?.mmdvm_tx_started?.at);
  const txCompletedAt = safeTrim(safeStages?.mmdvm_tx_completed?.at);
  if (txStartedAt || txCompletedAt) return true;
  return isPagerGatewayTextMatch({ stages: safeStages, expectedText });
}
