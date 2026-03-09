import { NextResponse } from "next/server";
import { applyPagerTelemetryEvent } from "@/lib/pagerDeliveryStatusStore";

export const runtime = "nodejs";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value) {
  const raw = safeTrim(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
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

export async function POST(req) {
  try {
    const configuredSecret = getConfiguredSecret();
    if (!configuredSecret) {
      return NextResponse.json(
        { error: "Telemetry secret not configured." },
        { status: 500 },
      );
    }

    const providedSecret = readProvidedSecret(req);
    if (!providedSecret || providedSecret !== configuredSecret) {
      return NextResponse.json({ error: "Invalid telemetry secret." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const trackingKey = safeTrim(body.trackingKey);
    const text = safeTrim(body.text);
    const timestamp = normalizeTimestamp(body.timestamp);
    const stage = safeTrim(body.stage);
    const at = normalizeTimestamp(body.at) || new Date().toISOString();
    const detail = safeTrim(body.detail);

    if (!stage) {
      return NextResponse.json(
        { error: "Stage is required." },
        { status: 400 },
      );
    }

    const updated = await applyPagerTelemetryEvent({
      trackingKey,
      text,
      timestamp,
      stage,
      at,
      detail,
    });

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Unable to apply telemetry event. Provide trackingKey, text+timestamp, or ensure a recent pending pager request exists.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        acceptedAt: updated.acceptedAt || null,
        updatedAt: updated.updatedAt || null,
        stages: updated.stages || {},
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to ingest telemetry event.",
        detail: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}
