// app/api/pictures/route.js
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { put, list, del } from "@vercel/blob";

export const runtime = "nodejs";

// ---------- helpers ----------
function isValidEmail(s) {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}
function safeTrim(v) {
  return typeof v === "string" ? v.trim() : "";
}
function safeAuthor(s) {
  return safeTrim(s) || "Guest";
}

async function putJson(pathname, obj, { token }) {
  const body = JSON.stringify(obj);
  const file = new File([body], "meta.json", { type: "application/json" });

  return put(pathname, file, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    token,
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch json (${res.status})`);
  return res.json();
}

// ---------- GET: list guestbook entries ----------
export async function GET(req) {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return NextResponse.json(
        {
          error: "Server missing BLOB_READ_WRITE_TOKEN.",
          detail:
            "Add it to .env.local (dev) and Vercel env vars (preview/prod).",
        },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.max(
      1,
      Math.min(100, Number(searchParams.get("limit") || 50)),
    );
    const cursor = searchParams.get("cursor") || undefined;

    // Pull extra so we likely get both .png and .json pairs
    const res = await list({
      prefix: "photobooth/",
      limit: Math.max(100, limit * 3),
      cursor,
      token: blobToken,
    });

    const blobs = res.blobs || [];

    const jsonById = new Map(); // id -> jsonUrl
    const imgById = new Map(); // id -> blob

    for (const b of blobs) {
      const p = b.pathname || "";
      if (p.endsWith(".json")) {
        const id =
          p
            .split("/")
            .pop()
            ?.replace(/\.json$/i, "") || "";
        if (id) jsonById.set(id, b.url);
      } else if (p.endsWith(".png")) {
        const id =
          p
            .split("/")
            .pop()
            ?.replace(/\.png$/i, "") || "";
        if (id) imgById.set(id, b);
      }
    }

    // newest-first by image uploadedAt
    const ids = Array.from(imgById.keys()).sort((a, b) => {
      const A = imgById.get(a);
      const B = imgById.get(b);
      return (
        new Date(B.uploadedAt).getTime() - new Date(A.uploadedAt).getTime()
      );
    });

    const sliced = ids.slice(0, limit);

    const items = await Promise.all(
      sliced.map(async (id) => {
        const img = imgById.get(id);
        const metaUrl = jsonById.get(id);

        let meta = null;
        if (metaUrl) {
          try {
            meta = await fetchJson(metaUrl);
          } catch {
            meta = null;
          }
        }

        const createdAt = meta?.created_at || img.uploadedAt;

        return {
          id,
          image_url: img.url,
          name: safeAuthor(meta?.name),
          message: safeTrim(meta?.message) || "",
          linkedinUrl: safeTrim(meta?.linkedinUrl) || "",
          created_at: createdAt,
          sid: safeTrim(meta?.sid) || "",

          // extras (optional)
          pathname: img.pathname,
          uploadedAt: img.uploadedAt,
        };
      }),
    );

    return NextResponse.json(
      {
        items,
        cursor: res.cursor || null,
        hasMore: !!res.cursor,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list pictures", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

// ---------- POST: upload image + metadata sidecar + email ----------
export async function POST(req) {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return NextResponse.json(
        {
          error: "Server missing BLOB_READ_WRITE_TOKEN.",
          detail:
            "Add it to .env.local (dev) and Vercel env vars (preview/prod).",
        },
        { status: 500 },
      );
    }

    const fd = await req.formData();

    const photo = fd.get("photo"); // File
    const name = safeTrim(fd.get("name"));
    const email = safeTrim(fd.get("email"));
    const linkedinUrl = safeTrim(fd.get("linkedinUrl"));
    const message = safeTrim(fd.get("message"));
    const emailSelf = safeTrim(fd.get("emailSelf")) === "1";

    const pixelSize = safeTrim(fd.get("pixelSize"));
    const tinyW = safeTrim(fd.get("tinyW"));
    const tinyH = safeTrim(fd.get("tinyH"));
    const outW = safeTrim(fd.get("outW"));
    const outH = safeTrim(fd.get("outH"));

    if (!photo || typeof photo === "string") {
      return NextResponse.json(
        { error: "Missing photo file." },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 },
      );
    }

    // session ownership
    const sid = req.cookies.get("gb_sid")?.value || "";

    // Resend optional (upload still succeeds if missing/misconfigured)
    const resendKey = process.env.RESEND_API_KEY || "";
    const resend = resendKey ? new Resend(resendKey) : null;

    // Stable id so png/json pair
    const id = crypto.randomUUID();
    const imgPath = `photobooth/${id}.png`;
    const metaPath = `photobooth/${id}.json`;

    // 1) upload image (always as .png)
    const imgBlob = await put(imgPath, photo, {
      access: "public",
      contentType: photo.type || "image/png",
      addRandomSuffix: false,
      token: blobToken,
    });

    // 2) upload metadata sidecar
    // NOTE: we do NOT store email in the public metadata file
    const meta = {
      id,
      sid,
      name,
      linkedinUrl,
      message,
      created_at: new Date().toISOString(),
      image_url: imgBlob.url,
      pixelSize,
      tinyW,
      tinyH,
      outW,
      outH,
    };

    await putJson(metaPath, meta, { token: blobToken });

    // 3) email (best effort)
    const subject = `Pixelbooth submission: ${name}`;
    const details = [
      `Name: ${name}`,
      `Email: ${email}`,
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : null,
      message ? `Message: ${message}` : null,
      "",
      `Image URL: ${imgBlob.url}`,
      "",
      `pixelSize: ${pixelSize}`,
      `tinyW x tinyH: ${tinyW} x ${tinyH}`,
      `outW x outH: ${outW} x ${outH}`,
    ]
      .filter(Boolean)
      .join("\n");

    const from =
      process.env.RESEND_FROM || "Pixelbooth <onboarding@resend.dev>";
    const toRob = "robert.chapleski@gmail.com";

    let emailWarning = null;

    if (!resend) {
      emailWarning =
        "RESEND_API_KEY not set; upload saved but no emails were sent.";
    } else {
      try {
        await resend.emails.send({ from, to: [toRob], subject, text: details });

        if (emailSelf && isValidEmail(email)) {
          await resend.emails.send({
            from,
            to: [email],
            subject: "Your Pixelbooth submission",
            text: `Here’s a copy of what you submitted:\n\n${details}`,
          });
        }
      } catch (e) {
        emailWarning = e?.message || String(e);
      }
    }

    return NextResponse.json(
      { id, url: imgBlob.url, ...(emailWarning ? { emailWarning } : {}) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Upload/email failed", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

// ---------- DELETE: delete entry only if same session ----------
export async function DELETE(req) {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return NextResponse.json(
        { error: "Server missing BLOB_READ_WRITE_TOKEN." },
        { status: 500 },
      );
    }

    const sid = req.cookies.get("gb_sid")?.value || "";
    if (!sid) {
      return NextResponse.json(
        { error: "No session cookie found." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const id = safeTrim(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const metaPath = `photobooth/${id}.json`;
    const imgPath = `photobooth/${id}.png`;

    // Find the metadata JSON blob so we can read it and verify sid
    const found = await list({
      prefix: metaPath,
      limit: 10,
      token: blobToken,
    });

    const metaBlob = (found.blobs || []).find((b) => b.pathname === metaPath);
    if (!metaBlob) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const metaRes = await fetch(metaBlob.url, { cache: "no-store" });
    if (!metaRes.ok) {
      return NextResponse.json(
        { error: "Failed to read metadata." },
        { status: 500 },
      );
    }

    const meta = await metaRes.json();
    if (!meta?.sid || meta.sid !== sid) {
      return NextResponse.json(
        { error: "Not allowed to delete this entry." },
        { status: 403 },
      );
    }

    await del([metaPath, imgPath], { token: blobToken });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Delete failed", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
