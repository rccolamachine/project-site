// app/api/pictures/[id]/route.js
import { NextResponse } from "next/server";
import path from "path";
import { unlink } from "fs/promises";
import db from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

function getIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const fromXff = (xff.split(",")[0] || "").trim();
  return fromXff || "local";
}

function tooMany({ resetMs }) {
  return new NextResponse("Too Many Requests", {
    status: 429,
    headers: {
      "Retry-After": String(Math.ceil(resetMs / 1000)),
    },
  });
}

function getIdFromContextOrUrl(params, req) {
  const fromParams = params?.id;
  if (typeof fromParams === "string" && fromParams.trim())
    return fromParams.trim();

  const pathname = req.nextUrl?.pathname || "";
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

// ✅ Avoid 405 on preflight
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function DELETE(req, ctx) {
  try {
    const ip = getIp(req);
    const sid = req.cookies.get("gb_sid")?.value || "nosid";

    // ✅ Rate limit deletes: 10/min per IP AND per (IP+sid)
    const rlIp = rateLimit(`pictures:del:ip:${ip}`, 10, 60_000);
    if (!rlIp.ok) return tooMany(rlIp);

    const rlSid = rateLimit(`pictures:del:ipsid:${ip}:${sid}`, 10, 60_000);
    if (!rlSid.ok) return tooMany(rlSid);

    const id = getIdFromContextOrUrl(ctx?.params, req);
    if (!id) return new NextResponse("Missing id", { status: 400 });

    if (!sid || sid === "nosid") {
      return new NextResponse("No session", { status: 401 });
    }

    const row = db
      .prepare(
        `
        SELECT id, image_url, session_id
        FROM photobooth_submissions
        WHERE id = ?
      `,
      )
      .get(id);

    if (!row) return new NextResponse("Not found", { status: 404 });

    // ✅ Ownership check: only same session can delete
    if (!row.session_id || row.session_id !== sid) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    db.prepare(`DELETE FROM photobooth_submissions WHERE id = ?`).run(id);

    // Best-effort file delete in local dev
    if (row.image_url?.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", row.image_url);
      try {
        await unlink(filePath);
      } catch {
        // ignore missing file / permission issues
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return new NextResponse(`Delete failed: ${e?.message || String(e)}`, {
      status: 500,
    });
  }
}
