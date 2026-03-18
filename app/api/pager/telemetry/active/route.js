import { NextResponse } from "next/server";
import {
  getMostRecentPendingPagerStatus,
  getPagerStatusStoreBackend,
} from "@/lib/pagerDeliveryStatusStore";

export const runtime = "nodejs";

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const MIN_MAX_AGE_MS = 5 * 1000;
const MAX_MAX_AGE_MS = 30 * 60 * 1000;

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getConfiguredSecret() {
  return safeTrim(process.env.PAGER_TELEMETRY_SECRET);
}

function readProvidedSecret(req) {
  const headerSecret = safeTrim(req.headers.get("x-pager-telemetry-secret"));
  if (headerSecret) return headerSecret;

  const authHeader = safeTrim(req.headers.get("authorization"));
  if (!authHeader) return "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return safeTrim(authHeader.slice(7));
  }
  return "";
}

function parseMaxAgeMs(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_AGE_MS;
  return Math.max(MIN_MAX_AGE_MS, Math.min(MAX_MAX_AGE_MS, parsed));
}

function buildStageSummary(stages) {
  const source =
    stages && typeof stages === "object" && !Array.isArray(stages) ? stages : {};
  return {
    gateway_received: {
      at: safeTrim(source?.gateway_received?.at) || null,
    },
    mmdvm_tx_started: {
      at: safeTrim(source?.mmdvm_tx_started?.at) || null,
    },
    mmdvm_tx_completed: {
      at: safeTrim(source?.mmdvm_tx_completed?.at) || null,
    },
  };
}

export async function GET(req) {
  try {
    const configuredSecret = getConfiguredSecret();
    if (!configuredSecret) {
      return NextResponse.json(
        {
          error: "Telemetry secret not configured.",
          storeBackend: getPagerStatusStoreBackend(),
        },
        { status: 500 },
      );
    }

    const providedSecret = readProvidedSecret(req);
    if (!providedSecret || providedSecret !== configuredSecret) {
      return NextResponse.json(
        {
          error: "Invalid telemetry secret.",
          storeBackend: getPagerStatusStoreBackend(),
        },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const maxAgeMs = parseMaxAgeMs(searchParams.get("maxAgeMs"));
    const pending = await getMostRecentPendingPagerStatus(maxAgeMs);

    if (!pending) {
      return NextResponse.json(
        {
          ok: true,
          active: false,
          maxAgeMs,
          storeBackend: getPagerStatusStoreBackend(),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        active: true,
        maxAgeMs,
        storeBackend: getPagerStatusStoreBackend(),
        trackingKey: safeTrim(pending.trackingKey) || null,
        text: safeTrim(pending.text) || null,
        timestamp: safeTrim(pending.timestamp) || null,
        acceptedAt: safeTrim(pending.acceptedAt) || null,
        updatedAt: safeTrim(pending.updatedAt) || null,
        stages: buildStageSummary(pending.stages),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load active pager telemetry context.",
        detail: err?.message || String(err),
        storeBackend: getPagerStatusStoreBackend(),
      },
      { status: 500 },
    );
  }
}
