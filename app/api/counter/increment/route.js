// app/api/counter/increment/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_MAX = "game:counter:max";
const KEY_MAX_AT = "game:counter:maxAt";

// simple per-IP rate limit: 10 requests / 60 seconds
async function rateLimit(req, limit = 10, windowSec = 60) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || "").trim() || "unknown";
  const key = `rl:counter:inc:${ip}`;

  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, windowSec);
  return { ok: n <= limit, remaining: Math.max(0, limit - n), ip };
}

export async function POST(req) {
  try {
    const rl = await rateLimit(req, 10, 60);
    if (!rl.ok) {
      return new NextResponse("Too many requests. Try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const deltaRaw = Number(body?.delta ?? 1);
    const delta = Number.isFinite(deltaRaw)
      ? Math.max(1, Math.min(100, Math.floor(deltaRaw)))
      : 1;

    // incrby is supported by Redis; @vercel/kv exposes it.
    // If your typings complain, it still works at runtime.
    const newValue = await kv.incrby(KEY_VALUE, delta);

    const currentMax = Number((await kv.get(KEY_MAX)) ?? 0);
    if (newValue > currentMax) {
      const now = new Date().toISOString();
      await Promise.all([kv.set(KEY_MAX, newValue), kv.set(KEY_MAX_AT, now)]);
    }

    const [max, maxAt] = await Promise.all([
      kv.get(KEY_MAX),
      kv.get(KEY_MAX_AT),
    ]);

    return NextResponse.json({
      value: Number(newValue),
      max: Number(max ?? 0),
      maxAt: String(maxAt ?? ""),
      remaining: rl.remaining,
    });
  } catch (e) {
    return new NextResponse(`Increment failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
