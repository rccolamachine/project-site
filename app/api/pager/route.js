import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/serverRateLimit";
import { upsertPagerAcceptedStatus } from "@/lib/pagerDeliveryStatusStore";

export const runtime = "nodejs";

const HAMPAGER_CALLS_URL = "https://hampager.de/api/calls";
const DEFAULT_CALL_SIGN_NAME = "KQ4CWZ";
const DEFAULT_TRANSMITTER_GROUP_NAME = "all";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitCsv(input) {
  return String(input || "")
    .split(",")
    .map((value) => safeTrim(value))
    .filter(Boolean);
}

function getConfiguredGateUsername() {
  return (
    safeTrim(process.env.SONGS_API_USERNAME) ||
    safeTrim(process.env.SONGS_USERNAME)
  );
}

function getConfiguredGatePassword() {
  return (
    safeTrim(process.env.SONGS_API_PASSWORD) ||
    safeTrim(process.env.SONGS_PASSWORD)
  );
}

function getHamPagerUsername() {
  return (
    safeTrim(process.env.HAMPAGER_API_USERNAME) ||
    safeTrim(process.env.HAMPAGER_USERNAME)
  );
}

function getHamPagerPassword() {
  return (
    safeTrim(process.env.HAMPAGER_API_PASSWORD) ||
    safeTrim(process.env.HAMPAGER_PASSWORD)
  );
}

function getCallSignNames() {
  const configured = splitCsv(process.env.HAMPAGER_CALLSIGN_NAMES);
  if (configured.length > 0) return configured;
  return [DEFAULT_CALL_SIGN_NAME];
}

function getTransmitterGroupNames() {
  const configured = splitCsv(process.env.HAMPAGER_TRANSMITTER_GROUP_NAMES);
  if (configured.length > 0) return configured;
  return [DEFAULT_TRANSMITTER_GROUP_NAME];
}

function getOwnerName(callSignNames) {
  return (
    safeTrim(process.env.HAMPAGER_OWNER_NAME) ||
    safeTrim(callSignNames?.[0]) ||
    DEFAULT_CALL_SIGN_NAME
  );
}

function decodeBasicCredentials(req) {
  const authHeader = safeTrim(req.headers.get("authorization"));
  if (!authHeader || !authHeader.toLowerCase().startsWith("basic ")) {
    return null;
  }

  const encoded = safeTrim(authHeader.slice(6));
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex <= 0) return null;

    return {
      username: safeTrim(decoded.slice(0, separatorIndex)),
      password: safeTrim(decoded.slice(separatorIndex + 1)),
    };
  } catch {
    return null;
  }
}

async function extractErrorMessage(res) {
  const contentType = safeTrim(res.headers.get("content-type")).toLowerCase();
  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => null);
    return safeTrim(json?.detail || json?.error || "");
  }

  const text = safeTrim(await res.text().catch(() => ""));
  return text.slice(0, 500);
}

export async function POST(req) {
  try {
    const shortWindowLimit = await limitRequest(req, "pager:post:3s", 1, 3);
    if (!shortWindowLimit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Limit is 1 request every 3 seconds." },
        {
          status: 429,
          headers: { "Retry-After": String(shortWindowLimit.retryAfterSec) },
        },
      );
    }

    const minuteLimit = await limitRequest(req, "pager:post:60s", 10, 60);
    if (!minuteLimit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Limit is 10 requests per minute." },
        {
          status: 429,
          headers: { "Retry-After": String(minuteLimit.retryAfterSec) },
        },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const bodyKeys = Object.keys(body);
    if (
      bodyKeys.length !== 1 ||
      !Object.prototype.hasOwnProperty.call(body, "text")
    ) {
      return NextResponse.json(
        { error: 'Request body must include only the "text" field.' },
        { status: 400 },
      );
    }

    const text = safeTrim(body.text);
    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    if (text.length > 80) {
      return NextResponse.json(
        { error: "Text must be 80 characters or fewer." },
        { status: 400 },
      );
    }

    const configuredGateUsername = getConfiguredGateUsername();
    const configuredGatePassword = getConfiguredGatePassword();
    if (!configuredGateUsername || !configuredGatePassword) {
      return NextResponse.json(
        {
          error:
            "Pager gate credentials are not configured. Set SONGS_API_USERNAME and SONGS_API_PASSWORD.",
        },
        { status: 500 },
      );
    }

    const suppliedCredentials = decodeBasicCredentials(req);
    if (!suppliedCredentials?.username || !suppliedCredentials?.password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Pager API"' } },
      );
    }

    if (
      suppliedCredentials.username !== configuredGateUsername ||
      suppliedCredentials.password !== configuredGatePassword
    ) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const hamPagerUsername = getHamPagerUsername();
    const hamPagerPassword = getHamPagerPassword();
    if (!hamPagerUsername || !hamPagerPassword) {
      return NextResponse.json(
        {
          error:
            "HamPager credentials are not configured. Set HAMPAGER_USERNAME and HAMPAGER_PASSWORD.",
        },
        { status: 500 },
      );
    }

    const callSignNames = getCallSignNames();
    const transmitterGroupNames = getTransmitterGroupNames();
    const payload = {
      text,
      callSignNames,
      transmitterGroupNames,
      emergency: false,
      timestamp: new Date().toISOString(),
      ownerName: getOwnerName(callSignNames),
    };

    const upstreamRes = await fetch(HAMPAGER_CALLS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${hamPagerUsername}:${hamPagerPassword}`,
          "utf8",
        ).toString("base64")}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      const detail = await extractErrorMessage(upstreamRes);
      return NextResponse.json(
        {
          error: "Failed to send pager call.",
          detail: detail || `Upstream request failed (${upstreamRes.status}).`,
        },
        { status: 502 },
      );
    }

    const upstreamJson = await upstreamRes.json().catch(() => null);
    const upstreamTimestamp = safeTrim(
      upstreamJson?.timestamp || upstreamJson?.data?.timestamp,
    );
    const trackingTimestamp = upstreamTimestamp || payload.timestamp;
    upsertPagerAcceptedStatus({
      text,
      timestamp: trackingTimestamp,
      acceptedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        text,
        timestamp: upstreamTimestamp || null,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Pager request failed.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
