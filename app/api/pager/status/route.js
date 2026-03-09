import { NextResponse } from "next/server";
import { getPagerStatus } from "@/lib/pagerDeliveryStatusStore";

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

function hasTelemetrySecret() {
  return Boolean(safeTrim(process.env.PAGER_TELEMETRY_SECRET));
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const text = safeTrim(body.text);
    const timestamp = normalizeTimestamp(body.timestamp);
    if (!text || !timestamp) {
      return NextResponse.json(
        { error: "Text and timestamp are required." },
        { status: 400 },
      );
    }

    const status = await getPagerStatus({ text, timestamp });
    if (!status) {
      return NextResponse.json(
        {
          error: "No status found for this pager message.",
          telemetryConfigured: hasTelemetrySecret(),
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        telemetryConfigured: hasTelemetrySecret(),
        acceptedAt: status.acceptedAt || null,
        updatedAt: status.updatedAt || null,
        stages: status.stages || {},
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load pager status.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
