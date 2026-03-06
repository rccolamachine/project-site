import { NextResponse } from "next/server";
import {
  getReactorCatalogueRecord,
  listReactorCatalogueRecords,
  updateReactorCatalogueCreationEvents,
} from "@/lib/reactorCatalogueStore";
import { limitRequest } from "@/lib/serverRateLimit";

export const runtime = "nodejs";

function parseIdsParam(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function GET(req) {
  try {
    const rl = await limitRequest(req, "reactor-catalogue:get", 60, 60);
    if (!rl.ok) {
      return new NextResponse("Too many requests.", {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      });
    }

    const id = String(req?.nextUrl?.searchParams?.get("id") || "").trim();
    const ids = parseIdsParam(req?.nextUrl?.searchParams?.get("ids"));

    if (id) {
      const item = await getReactorCatalogueRecord(id);
      if (!item) {
        return NextResponse.json(
          { error: "not_found", id },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { item },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const items = await listReactorCatalogueRecords(ids.length > 0 ? ids : null);
    return NextResponse.json(
      {
        items,
        count: items.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return new NextResponse(
      `Catalogue GET failed: ${error?.message || String(error)}`,
      { status: 500 },
    );
  }
}

export async function PUT(req) {
  try {
    const rl = await limitRequest(req, "reactor-catalogue:put", 24, 60);
    if (!rl.ok) {
      return new NextResponse("Too many requests.", {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const events = Array.isArray(body?.events) ? body.events : [];
    if (events.length <= 0) {
      return NextResponse.json(
        { updated: 0, items: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const limitedEvents = events.slice(0, 250);
    const items = await updateReactorCatalogueCreationEvents(limitedEvents);

    return NextResponse.json(
      {
        updated: items.length,
        items,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return new NextResponse(
      `Catalogue PUT failed: ${error?.message || String(error)}`,
      { status: 500 },
    );
  }
}
