import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { del, list, put } from "@vercel/blob";
import { getGuestbookDeleteCookieName } from "@/lib/guestbook";

export const runtime = "nodejs";

const DEFAULT_RESEND_FROM = "Pixelbooth <hello@mail.rccolamachine.com>";
const DELETE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeAuthor(value) {
  return safeTrim(value) || "Guest";
}

function safeTime(iso) {
  const time = Date.parse(String(iso || ""));
  return Number.isFinite(time) ? time : 0;
}

function getDeleteTokenSecret() {
  return (
    safeTrim(process.env.GUESTBOOK_DELETE_SECRET) ||
    safeTrim(process.env.BLOB_READ_WRITE_TOKEN) ||
    safeTrim(process.env.RESEND_API_KEY)
  );
}

function signDeleteToken(id) {
  const secret = getDeleteTokenSecret();
  if (!secret) {
    throw new Error(
      "Server missing a guestbook delete secret. Set GUESTBOOK_DELETE_SECRET.",
    );
  }

  return createHmac("sha256", secret)
    .update(`guestbook-delete:${id}`)
    .digest("hex");
}

function tokenMatches(expected, actual) {
  if (!expected || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

async function sendEmailOrThrow(resend, payload, label) {
  const result = await resend.emails.send(payload);
  if (result?.error) {
    throw new Error(
      `${label}: ${result.error.message || result.error.name || "Email failed."}`,
    );
  }
  return result?.data || null;
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

function buildDeleteCookie(id) {
  return {
    name: getGuestbookDeleteCookieName(id),
    value: signDeleteToken(id),
    options: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: DELETE_COOKIE_MAX_AGE_SECONDS,
    },
  };
}

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

    const result = await list({
      prefix: "photobooth/",
      limit: Math.max(100, limit * 3),
      cursor,
      token: blobToken,
    });

    const jsonById = new Map();
    const imageById = new Map();

    for (const blob of result.blobs || []) {
      const pathname = blob.pathname || "";
      if (pathname.endsWith(".json")) {
        const id = pathname.split("/").pop()?.replace(/\.json$/i, "") || "";
        if (id) jsonById.set(id, blob);
      } else if (pathname.endsWith(".png")) {
        const id = pathname.split("/").pop()?.replace(/\.png$/i, "") || "";
        if (id) imageById.set(id, blob);
      }
    }

    const ids = Array.from(new Set([...imageById.keys(), ...jsonById.keys()]));
    const items = await Promise.all(
      ids.map(async (id) => {
        const imageBlob = imageById.get(id) || null;
        const metaBlob = jsonById.get(id) || null;

        let meta = null;
        if (metaBlob?.url) {
          try {
            meta = await fetchJson(metaBlob.url);
          } catch {
            meta = null;
          }
        }

        const createdAt =
          safeTrim(meta?.created_at) ||
          imageBlob?.uploadedAt ||
          metaBlob?.uploadedAt ||
          "";

        return {
          id,
          image_url: safeTrim(meta?.image_url) || imageBlob?.url || "",
          name: safeAuthor(meta?.name),
          message: safeTrim(meta?.message) || "",
          linkedinUrl: safeTrim(meta?.linkedinUrl) || "",
          created_at: createdAt,
          entryType: safeTrim(meta?.entryType) || (imageBlob ? "photo" : "message"),
          uploadedAt: imageBlob?.uploadedAt || metaBlob?.uploadedAt || "",
        };
      }),
    );

    items.sort((a, b) => {
      const aTime = safeTime(a.created_at || a.uploadedAt);
      const bTime = safeTime(b.created_at || b.uploadedAt);
      return bTime - aTime;
    });

    return NextResponse.json(
      {
        items: items.slice(0, limit),
        cursor: result.cursor || null,
        hasMore: !!result.cursor,
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
    const photo = fd.get("photo");
    const hasPhoto =
      !!photo && typeof photo !== "string" && Number(photo.size || 0) > 0;

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

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 },
      );
    }

    const resendKey = process.env.RESEND_API_KEY || "";
    const resend = resendKey ? new Resend(resendKey) : null;
    const id = randomUUID();
    const imgPath = `photobooth/${id}.png`;
    const metaPath = `photobooth/${id}.json`;
    const entryType = hasPhoto ? "photo" : "message";

    let imageBlob = null;
    if (hasPhoto) {
      imageBlob = await put(imgPath, photo, {
        access: "public",
        contentType: photo.type || "image/png",
        addRandomSuffix: false,
        token: blobToken,
      });
    }

    const meta = {
      id,
      name,
      linkedinUrl,
      message,
      entryType,
      created_at: new Date().toISOString(),
      image_url: imageBlob?.url || "",
      pixelSize: hasPhoto ? pixelSize : "",
      tinyW: hasPhoto ? tinyW : "",
      tinyH: hasPhoto ? tinyH : "",
      outW: hasPhoto ? outW : "",
      outH: hasPhoto ? outH : "",
    };

    await putJson(metaPath, meta, { token: blobToken });

    const subject = hasPhoto
      ? `Pixelbooth submission: ${name}`
      : `Guestbook message: ${name}`;
    const details = [
      `Type: ${entryType === "photo" ? "Pixelbooth photo" : "Guestbook message"}`,
      `Name: ${name}`,
      `Email: ${email}`,
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : null,
      message ? `Message: ${message}` : null,
      hasPhoto && imageBlob?.url ? `Image URL: ${imageBlob.url}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const guestCopyDetails = [
      `Type: ${entryType === "photo" ? "Pixelbooth photo" : "Guestbook message"}`,
      `Name: ${name}`,
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : null,
      message ? `Message: ${message}` : null,
      hasPhoto ? "Your PNG photo is attached to this email." : null,
    ]
      .filter(Boolean)
      .join("\n");

    const from = process.env.RESEND_FROM || DEFAULT_RESEND_FROM;
    const toRob = "rob@mail.rccolamachine.com";
    const emailWarnings = [];

    if (!resend) {
      emailWarnings.push(
        "RESEND_API_KEY not set; upload saved but no emails were sent.",
      );
    } else {
      try {
        await sendEmailOrThrow(
          resend,
          {
            from,
            to: [toRob],
            subject,
            text: details,
            replyTo: email,
          },
          "Admin notification failed",
        );
      } catch (error) {
        console.error("Pixelbooth admin email failed", error);
        emailWarnings.push(error?.message || String(error));
      }

      if (emailSelf) {
        try {
          const attachments =
            hasPhoto && photo && typeof photo !== "string"
              ? [
                  {
                    filename: `pixelbooth-${id}.png`,
                    content: Buffer.from(await photo.arrayBuffer()).toString(
                      "base64",
                    ),
                    contentType: photo.type || "image/png",
                  },
                ]
              : undefined;

          await sendEmailOrThrow(
            resend,
            {
              from,
              to: [email],
              subject: hasPhoto
                ? "Your Pixelbooth submission"
                : "Your Guestbook submission",
              text: `Here's a copy of what you submitted:\n\n${guestCopyDetails}`,
              attachments,
            },
            "Guest copy failed",
          );
        } catch (error) {
          console.error("Pixelbooth guest copy email failed", error);
          emailWarnings.push(error?.message || String(error));
        }
      }
    }

    const response = NextResponse.json(
      {
        id,
        url: imageBlob?.url || "",
        ...(emailWarnings.length ? { emailWarning: emailWarnings.join(" ") } : {}),
      },
      { status: 200 },
    );

    const deleteCookie = buildDeleteCookie(id);
    response.cookies.set(
      deleteCookie.name,
      deleteCookie.value,
      deleteCookie.options,
    );

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "Upload/email failed", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req) {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return NextResponse.json(
        { error: "Server missing BLOB_READ_WRITE_TOKEN." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const id = safeTrim(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const cookieName = getGuestbookDeleteCookieName(id);
    const providedToken = req.cookies.get(cookieName)?.value || "";
    const expectedToken = signDeleteToken(id);

    if (!tokenMatches(expectedToken, providedToken)) {
      return NextResponse.json(
        { error: "Not allowed to delete this entry." },
        { status: 403 },
      );
    }

    const metaPath = `photobooth/${id}.json`;
    const imagePath = `photobooth/${id}.png`;
    const found = await list({
      prefix: metaPath,
      limit: 10,
      token: blobToken,
    });

    const metaBlob = (found.blobs || []).find((blob) => blob.pathname === metaPath);
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
    const pathsToDelete = [metaPath];
    if (safeTrim(meta?.image_url)) pathsToDelete.push(imagePath);

    await del(pathsToDelete, { token: blobToken });

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set(cookieName, "", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "Delete failed", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
