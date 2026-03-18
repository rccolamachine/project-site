import { NextResponse } from "next/server";
import {
  getPagerStatus,
  getPagerStatusByTrackingKey,
  getPagerStatusStoreBackend,
} from "@/lib/pagerDeliveryStatusStore";
import {
  normalizeIsoTimestamp,
  parsePagerTelemetryDetail,
  safeTrim,
} from "@/lib/pagerTelemetryUtils";

export const runtime = "nodejs";

function hasTelemetrySecret() {
  return Boolean(safeTrim(process.env.PAGER_TELEMETRY_SECRET));
}

function buildPublicStage(sourceStage) {
  return {
    at: normalizeIsoTimestamp(sourceStage?.at),
    detail: parsePagerTelemetryDetail(sourceStage?.detail),
  };
}

function buildPublicStages(stages) {
  const source =
    stages && typeof stages === "object" && !Array.isArray(stages) ? stages : {};
  return {
    gateway_received: buildPublicStage(source.gateway_received),
    mmdvm_tx_started: buildPublicStage(source.mmdvm_tx_started),
  };
}

function buildSuccessResponse(status) {
  return NextResponse.json(
    {
      ok: true,
      telemetryConfigured: hasTelemetrySecret(),
      storeBackend: getPagerStatusStoreBackend(),
      acceptedAt: status.acceptedAt || null,
      updatedAt: status.updatedAt || null,
      stages: buildPublicStages(status.stages),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

function buildNotFoundResponse() {
  return NextResponse.json(
    {
      error: "No status found for this pager message.",
      telemetryConfigured: hasTelemetrySecret(),
      storeBackend: getPagerStatusStoreBackend(),
    },
    { status: 404 },
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const trackingKey = safeTrim(searchParams.get("trackingKey"));
    if (!trackingKey) {
      return NextResponse.json(
        { error: "trackingKey query parameter is required." },
        { status: 400 },
      );
    }

    const status = await getPagerStatusByTrackingKey(trackingKey);
    if (!status) {
      return buildNotFoundResponse();
    }

    return buildSuccessResponse(status);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load pager status.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const trackingKey = safeTrim(body.trackingKey);
    let status = null;

    if (trackingKey) {
      status = await getPagerStatusByTrackingKey(trackingKey);
    } else {
      const text = safeTrim(body.text);
      const timestamp = normalizeIsoTimestamp(body.timestamp);
      if (!text || !timestamp) {
        return NextResponse.json(
          { error: "Tracking key or text and timestamp are required." },
          { status: 400 },
        );
      }
      status = await getPagerStatus({ text, timestamp });
    }

    if (!status) {
      return buildNotFoundResponse();
    }

    return buildSuccessResponse(status);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load pager status.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
