import { NextResponse } from "next/server";
import {
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

function buildPublicTelemetryDetail(detail) {
  const parsed = parsePagerTelemetryDetail(detail);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => {
      if (key === "target" || key === "source") return false;
      return Boolean(safeTrim(value));
    }),
  );
}

function buildPublicStage(sourceStage) {
  return {
    at: normalizeIsoTimestamp(sourceStage?.at),
    detail: buildPublicTelemetryDetail(sourceStage?.detail),
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
