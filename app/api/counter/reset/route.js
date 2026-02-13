// app/api/counter/reset/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import crypto from "crypto";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_SHAME = "game:counter:shame";

// simple per-IP rate limit: 10 requests / 60 seconds (separate bucket)
async function rateLimit(req, limit = 10, windowSec = 60) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || "").trim() || "unknown";
  const key = `rl:counter:reset:${ip}`;

  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, windowSec);
  return { ok: n <= limit, remaining: Math.max(0, limit - n), ip };
}

function isDataUrlImage(s) {
  if (typeof s !== "string") return false;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s);
}

export async function POST(req) {
  try {
    const rl = await rateLimit(req, 10, 60);
    if (!rl.ok) {
      return new NextResponse("Too many resets. Try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const photoDataUrl = body?.photoDataUrl;

    if (!name) return new NextResponse("Name is required.", { status: 400 });
    if (!isDataUrlImage(photoDataUrl)) {
      return new NextResponse("Photo is required (png/jpeg data URL).", {
        status: 400,
      });
    }

    // Basic size guard: ~250 KB base64-ish (data url overhead)
    if (photoDataUrl.length > 350_000) {
      return new NextResponse(
        "Photo too large. Please use the pixelated snap.",
        { status: 413 },
      );
    }

    const beforeValue = Number((await kv.get(KEY_VALUE)) ?? 0);

    // set counter to 0
    await kv.set(KEY_VALUE, 0);

    const entry = {
      id: crypto.randomBytes(10).toString("hex"),
      name,
      photoDataUrl,
      resetAt: new Date().toISOString(),
      beforeValue,
    };

    // push newest first
    await kv.lpush(KEY_SHAME, JSON.stringify(entry));
    // keep list bounded
    await kv.ltrim(KEY_SHAME, 0, 49);

    return NextResponse.json({
      ok: true,
      value: 0,
      entry,
    });
  } catch (e) {
    return new NextResponse(`Reset failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
