// app/api/counter/state/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_MAX = "game:counter:max";
const KEY_MAX_AT = "game:counter:maxAt";
const KEY_SHAME = "game:counter:shame";
const KEY_LAST_CLICK_AT = "game:counter:lastClickAt";

export async function GET() {
  try {
    const [value, max, maxAt, shameRaw, lastClickAt] = await Promise.all([
      kv.get(KEY_VALUE),
      kv.get(KEY_MAX),
      kv.get(KEY_MAX_AT),
      kv.lrange(KEY_SHAME, 0, 49),
      kv.get(KEY_LAST_CLICK_AT),
    ]);

    const shame = (Array.isArray(shameRaw) ? shameRaw : [])
      .map((s) => {
        try {
          return typeof s === "string" ? JSON.parse(s) : s;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({
      value: Number(value ?? 0),
      max: Number(max ?? 0),
      maxAt: String(maxAt ?? ""),
      shame,
      lastClickAt: String(lastClickAt ?? ""),
    });
  } catch (e) {
    return new NextResponse(`State failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
