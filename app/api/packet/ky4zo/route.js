import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const APRS_FI_API_URL = "https://api.aprs.fi/api/get";
const CALLSIGN_ROOT = "KY4ZO";
const CALLSIGN_PREFIX = `${CALLSIGN_ROOT}-`;
const MIN_SSID = 1;
const MAX_SSID = 20;
const CACHE_TTL_MS = 60_000;
const SYMBOL_SPEC_PATH = path.join(process.cwd(), "data", "packet_symbolsX.txt");
const SYMBOL_LINE_PATTERN =
  /^\s*(\/.)\s+\S+\s*(.*?)\s{2,}(\\.)\s+\S+\s*(.*?)\s*$/;

function safeTrim(value) {
  return String(value || "").trim();
}

function parseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIsoFromUnixSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";

  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function sortBySsid(a, b) {
  const aBase = safeTrim(a).toUpperCase();
  const bBase = safeTrim(b).toUpperCase();
  const aSsid = Number(aBase.split("-")[1] || "");
  const bSsid = Number(bBase.split("-")[1] || "");

  if (Number.isFinite(aSsid) && Number.isFinite(bSsid) && aSsid !== bSsid) {
    return aSsid - bSsid;
  }

  if (aBase < bBase) return -1;
  if (aBase > bBase) return 1;
  return 0;
}

function normalizeSymbolDescription(value) {
  return safeTrim(value).replace(/\s+/g, " ").replace(/\s+<==.*$/, "");
}

function getSymbolLookup() {
  const key = "__packetSymbolLookupStore";
  if (globalThis[key]) {
    return globalThis[key];
  }

  const lookup = new Map();

  try {
    const text = readFileSync(SYMBOL_SPEC_PATH, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const match = line.match(SYMBOL_LINE_PATTERN);
      if (!match) return;

      const primaryCode = safeTrim(match[1]);
      const primaryDesc = normalizeSymbolDescription(match[2]);
      const secondaryCode = safeTrim(match[3]);
      const secondaryDesc = normalizeSymbolDescription(match[4]);

      if (primaryCode.length === 2 && primaryDesc) {
        lookup.set(primaryCode, primaryDesc);
      }
      if (secondaryCode.length === 2 && secondaryDesc) {
        lookup.set(secondaryCode, secondaryDesc);
      }
    });
  } catch {
    // Leave lookup empty; client can still show the symbol code itself.
  }

  globalThis[key] = lookup;
  return lookup;
}

function parseSymbolInfo(symbolRaw, symbolLookup) {
  const raw = safeTrim(symbolRaw);
  if (raw.length < 2) {
    return {
      symbolCode: "",
      symbolBaseCode: "",
      symbolTable: "",
      symbolTableId: null,
      symbolChar: "",
      symbolOverlay: "",
      symbolDescription: "Unknown/Unassigned",
      symbolSpriteCol: null,
      symbolSpriteRow: null,
    };
  }

  const tableByte = raw[0];
  const symbolChar = raw[1];
  const isOverlayByte = /^[0-9A-Z]$/i.test(tableByte);
  const overlayChar = isOverlayByte ? tableByte.toUpperCase() : "";
  const tableSelector = tableByte === "/" ? "/" : "\\";
  const baseCode = `${tableSelector}${symbolChar}`;
  const charCode = symbolChar.charCodeAt(0);
  const spriteIndex = charCode >= 33 && charCode <= 126 ? charCode - 33 : null;
  const symbolDescriptionBase =
    symbolLookup.get(raw) ||
    symbolLookup.get(baseCode) ||
    "Unknown/Unassigned";

  return {
    symbolCode: raw,
    symbolBaseCode: baseCode,
    symbolTable: tableSelector === "/" ? "primary" : "secondary",
    symbolTableId: tableSelector === "/" ? 0 : 1,
    symbolChar,
    symbolOverlay: overlayChar,
    symbolDescription: overlayChar
      ? `${symbolDescriptionBase} (overlay ${overlayChar})`
      : symbolDescriptionBase,
    symbolSpriteCol: spriteIndex === null ? null : spriteIndex % 16,
    symbolSpriteRow: spriteIndex === null ? null : Math.floor(spriteIndex / 16),
  };
}

function getStore() {
  const key = "__packetKy4zoRouteStore";
  if (!globalThis[key]) {
    globalThis[key] = {
      cache: null,
      inflight: null,
    };
  }

  return globalThis[key];
}

function buildConfiguredCallsigns() {
  return Array.from({ length: MAX_SSID - MIN_SSID + 1 }, (_, index) => {
    const ssid = MIN_SSID + index;
    return `${CALLSIGN_ROOT}-${ssid}`;
  });
}

function buildApiUrl({ name, apikey, limit = 200 }) {
  const params = new URLSearchParams({
    name,
    what: "loc",
    apikey,
    format: "json",
    limit: String(limit),
  });

  return `${APRS_FI_API_URL}?${params.toString()}`;
}

async function fetchPacketEntries({ name, apikey, limit }) {
  const response = await fetch(buildApiUrl({ name, apikey, limit }), {
    cache: "no-store",
    headers: {
      "User-Agent": "rcpacketmachine-packet-map/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`APRS.fi request failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("APRS.fi response was not valid JSON.");
  }

  if (safeTrim(payload.result).toLowerCase() !== "ok") {
    const code = safeTrim(payload.code);
    const description = safeTrim(payload.description);
    throw new Error(
      description || code
        ? `APRS.fi returned ${code || "an error"}: ${description || "unknown reason"}`
        : "APRS.fi returned a failure response.",
    );
  }

  return Array.isArray(payload.entries) ? payload.entries : [];
}

function buildResultEntry(entry, callsignFallback, symbolLookup) {
  const callsign = safeTrim(callsignFallback || entry?.name).toUpperCase();
  if (!callsign.startsWith(CALLSIGN_PREFIX)) return null;

  const latitude = parseNumber(entry?.lat);
  const longitude = parseNumber(entry?.lng);
  const hasLocation =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  return {
    callsign,
    hasLocation,
    latitude: hasLocation ? latitude : null,
    longitude: hasLocation ? longitude : null,
    altitudeMeters: parseNumber(entry?.altitude),
    speedKmh: parseNumber(entry?.speed),
    courseDegrees: parseNumber(entry?.course),
    ...parseSymbolInfo(entry?.symbol, symbolLookup),
    lastSeenIso:
      toIsoFromUnixSeconds(entry?.lasttime) ||
      toIsoFromUnixSeconds(entry?.time) ||
      "",
    mapUrl: `https://aprs.fi/#!call=${encodeURIComponent(callsign)}`,
  };
}

async function loadKy4zoLocationSnapshot(apikey) {
  const requestedCallsigns = buildConfiguredCallsigns();
  const symbolLookup = getSymbolLookup();
  const entries = await fetchPacketEntries({
    name: requestedCallsigns.join(","),
    apikey,
    limit: requestedCallsigns.length,
  });

  const entryByCallsign = new Map(
    entries
      .map((entry) => {
        const callsign = safeTrim(entry?.name).toUpperCase();
        return [callsign, entry];
      })
      .filter(([callsign]) => callsign),
  );

  const resultCallsigns = [...entryByCallsign.keys()]
    .filter((callsign) => callsign.startsWith(CALLSIGN_PREFIX))
    .sort(sortBySsid);

  const results = resultCallsigns
    .map((callsign) =>
      buildResultEntry(entryByCallsign.get(callsign), callsign, symbolLookup),
    )
    .filter(Boolean)
    .sort((a, b) => sortBySsid(a.callsign, b.callsign));

  return {
    fetchedAt: new Date().toISOString(),
    results,
  };
}

async function getSnapshotWithCache(apikey) {
  const store = getStore();
  const now = Date.now();

  if (store.cache && store.cache.expiresAtMs > now) {
    return {
      cacheStatus: "HIT",
      payload: store.cache.payload,
    };
  }

  if (store.inflight) {
    const payload = await store.inflight;
    return {
      cacheStatus: "DEDUPED",
      payload,
    };
  }

  const loadPromise = loadKy4zoLocationSnapshot(apikey)
    .then((payload) => {
      store.cache = {
        payload,
        expiresAtMs: Date.now() + CACHE_TTL_MS,
      };
      return payload;
    })
    .finally(() => {
      store.inflight = null;
    });

  store.inflight = loadPromise;
  const payload = await loadPromise;

  return {
    cacheStatus: "MISS",
    payload,
  };
}

export async function GET() {
  const apikey = safeTrim(process.env.APRS_FI_API_KEY);
  if (!apikey) {
    return NextResponse.json(
      {
        error: "APRS_FI_API_KEY is not configured.",
        detail:
          "Add APRS_FI_API_KEY to .env.local so the server can query APRS.fi official API.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { payload, cacheStatus } = await getSnapshotWithCache(apikey);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Packet-Cache": cacheStatus,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load Packet data.",
        detail: err?.message || String(err),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
