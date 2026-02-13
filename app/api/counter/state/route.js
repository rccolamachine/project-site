// app/api/counter/state/route.js
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KEY_VALUE = "game:counter:value";
const KEY_MAX = "game:counter:max";
const KEY_MAX_AT = "game:counter:maxAt";
const KEY_SHAME = "game:counter:shame"; // list of JSON strings

export async function GET() {
  try {
    const [value, max, maxAt, shameRaw] = await Promise.all([
      kv.get(KEY_VALUE),
      kv.get(KEY_MAX),
      kv.get(KEY_MAX_AT),
      // last 50 entries
      kv.lrange(KEY_SHAME, 0, 49).catch(() => []),
    ]);

    const shame = Array.isArray(shameRaw)
      ? shameRaw
          .map((s) => {
            try {
              return JSON.parse(s);
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      : [];

    return NextResponse.json({
      value: Number(value ?? 0),
      max: Number(max ?? 0),
      maxAt: String(maxAt ?? ""),
      shame,
    });
  } catch (e) {
    return new NextResponse(`State failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
