// app/api/counter/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_MAX = "game:counter:max";
const KEY_MAX_AT = "game:counter:maxAt";
const KEY_LAST_CLICK_AT = "game:counter:lastClickAt";

export async function GET() {
  try {
    const [value, max, maxAt, lastClickAt] = await Promise.all([
      kv.get(KEY_VALUE),
      kv.get(KEY_MAX),
      kv.get(KEY_MAX_AT),
      kv.get(KEY_LAST_CLICK_AT),
    ]);

    return NextResponse.json({
      value: Number(value ?? 0),
      max: Number(max ?? 0),
      maxAt: String(maxAt ?? ""),
      lastClickAt: String(lastClickAt ?? ""),
    });
  } catch (e) {
    return new NextResponse(`Fetch failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
