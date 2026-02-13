import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROB_EMAIL = "robert.chapleski@gmail.com";

function safeString(v, max = 2000) {
  const s = typeof v === "string" ? v : "";
  return s.trim().slice(0, max);
}

function isLikelyEmail(s) {
  // simple sanity check; don’t overdo it
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function makeBaseUrl(req) {
  // Prefer explicit env if set (recommended in prod)
  const env =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_URL;

  if (env) {
    // VERCEL_URL may be like "myapp.vercel.app" (no scheme)
    if (env.startsWith("http://") || env.startsWith("https://")) return env;
    return `https://${env}`;
  }

  // Fallback to request origin
  const origin = req.headers.get("origin");
  if (origin) return origin;

  // Worst-case default
  return "http://localhost:3000";
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function buildEmailHtml({ name, email, linkedinUrl, message, imageUrl, meta }) {
  const esc = (x) =>
    String(x || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
    <h2 style="margin: 0 0 10px;">New Photobooth Guestbook Submission</h2>

    <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 12px;">
      <tr><td style="padding: 2px 10px 2px 0;"><b>Name</b></td><td style="padding: 2px 0;">${esc(
        name,
      )}</td></tr>
      <tr><td style="padding: 2px 10px 2px 0;"><b>Email</b></td><td style="padding: 2px 0;">${esc(
        email,
      )}</td></tr>
      ${
        linkedinUrl
          ? `<tr><td style="padding: 2px 10px 2px 0;"><b>LinkedIn</b></td><td style="padding: 2px 0;">${esc(linkedinUrl)}</td></tr>`
          : ""
      }
    </table>

    ${
      message
        ? `<div style="margin: 0 0 12px;"><b>Message</b><br/>${esc(message).replaceAll("\n", "<br/>")}</div>`
        : ""
    }

    <div style="margin: 0 0 12px;">
      <b>Photo URL</b><br/>
      <div>${esc(imageUrl)}</div>
    </div>

    <div style="margin: 0 0 16px; font-size: 12px; opacity: 0.85;">
      <div><b>pixelSize</b>: ${esc(meta.pixelSize)}</div>
      <div><b>tiny</b>: ${esc(meta.tinyW)} × ${esc(meta.tinyH)}</div>
      <div><b>out</b>: ${esc(meta.outW)} × ${esc(meta.outH)}</div>
      <div><b>id</b>: ${esc(meta.id)}</div>
    </div>

    <div style="margin: 0 0 10px;"><b>Preview</b></div>
    <img alt="Photobooth submission" src="${esc(
      imageUrl,
    )}" style="max-width: 560px; width: 100%; height: auto; border: 1px solid #ddd; border-radius: 10px;" />

    <div style="margin-top: 16px; font-size: 12px; opacity: 0.7;">
      rccolamachine photobooth
    </div>
  </div>
  `;
}

async function getMailer() {
  // Choose ONE approach:
  // A) SMTP (recommended): GMAIL / custom SMTP
  //    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  //
  // B) Nodemailer "service: gmail" also works, but SMTP is more reliable.

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Email not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM).",
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: { user, pass },
  });

  const from =
    process.env.SMTP_FROM ||
    `rccolamachine <${process.env.SMTP_USER || "no-reply@example.com"}>`;

  return { transporter, from };
}

export async function POST(req) {
  try {
    const form = await req.formData();

    const file = form.get("photo");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Missing file field: photo" },
        { status: 400 },
      );
    }

    const name = safeString(form.get("name"), 200);
    const email = safeString(form.get("email"), 200);
    const linkedinUrl = safeString(form.get("linkedinUrl"), 400);
    const message = safeString(form.get("message"), 4000);
    const emailSelf = safeString(form.get("emailSelf"), 10) === "1";

    const pixelSize = safeString(form.get("pixelSize"), 20);
    const tinyW = safeString(form.get("tinyW"), 20);
    const tinyH = safeString(form.get("tinyH"), 20);
    const outW = safeString(form.get("outW"), 20);
    const outH = safeString(form.get("outH"), 20);

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!email || !isLikelyEmail(email)) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 },
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Basic file validation
    const contentType = file.type || "";
    if (!contentType.includes("png")) {
      // You can relax this if you want; your client exports PNG.
      return NextResponse.json(
        { error: "Only PNG uploads are supported." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();

    // Save under /public/uploads so it is directly served
    const uploadsDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "pictures",
    );
    await ensureDir(uploadsDir);

    const filename = `${id}.png`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, buffer);

    // Save metadata (optional but useful)
    const metaDir = path.join(process.cwd(), "data", "pictures");
    await ensureDir(metaDir);

    const meta = {
      id,
      createdAt: new Date().toISOString(),
      name,
      email, // note: you said this should not appear in guestbook, but storing server-side is fine
      linkedinUrl,
      message,
      emailSelf,
      pixelSize,
      tinyW,
      tinyH,
      outW,
      outH,
      file: `/uploads/pictures/${filename}`,
    };

    await fs.writeFile(
      path.join(metaDir, `${id}.json`),
      JSON.stringify(meta, null, 2),
      "utf8",
    );

    const baseUrl = makeBaseUrl(req);
    const url = `${baseUrl}${meta.file}`;

    // Send emails
    const { transporter, from } = await getMailer();

    const html = buildEmailHtml({
      name,
      email,
      linkedinUrl,
      message,
      imageUrl: url,
      meta: { ...meta, url },
    });

    const subject = `Photobooth submission: ${name}`;

    // Always email Rob
    await transporter.sendMail({
      from,
      to: ROB_EMAIL,
      subject,
      html,
      // also attach the image so it’s in the email even if hosting changes
      attachments: [
        {
          filename: `photobooth-${id}.png`,
          content: buffer,
          contentType: "image/png",
        },
      ],
    });

    // Optionally email the user
    if (emailSelf) {
      await transporter.sendMail({
        from,
        to: email,
        subject: `Your photobooth submission`,
        html,
        attachments: [
          {
            filename: `photobooth-${id}.png`,
            content: buffer,
            contentType: "image/png",
          },
        ],
      });
    }

    return NextResponse.json({ id, url });
  } catch (err) {
    const msg = err?.message || String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
