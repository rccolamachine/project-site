import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const DEFAULT_CONTACT_TO = "rob@mail.rccolamachine.com";
const DEFAULT_RESEND_FROM = "Website Contact <hello@mail.rccolamachine.com>";
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;
const MESSAGE_MIN = 1;
const MESSAGE_MAX = 2000;

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isString(value) {
  return typeof value === "string";
}

function hasControlChars(value, allowNewLines = false) {
  const pattern = allowNewLines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/;
  return pattern.test(value);
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
    }

    const resendKey = process.env.RESEND_API_KEY || "";
    if (!resendKey) {
      return NextResponse.json(
        { error: "Server missing RESEND_API_KEY." },
        { status: 500 },
      );
    }

    let body = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (
      !isString(body?.name) ||
      !isString(body?.email) ||
      !isString(body?.message) ||
      (!isString(body?.phone) && body?.phone != null)
    ) {
      return NextResponse.json(
        { error: "All contact fields must be plain text." },
        { status: 400 },
      );
    }

    const name = safeTrim(body?.name);
    const email = safeTrim(body?.email);
    const phone = safeTrim(body?.phone);
    const message = safeTrim(body?.message);

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 },
      );
    }

    if (name.length > NAME_MAX) {
      return NextResponse.json(
        { error: `Name must be ${NAME_MAX} characters or fewer.` },
        { status: 400 },
      );
    }

    if (email.length > EMAIL_MAX) {
      return NextResponse.json(
        { error: `Email must be ${EMAIL_MAX} characters or fewer.` },
        { status: 400 },
      );
    }

    if (phone.length > PHONE_MAX) {
      return NextResponse.json(
        { error: `Phone must be ${PHONE_MAX} characters or fewer.` },
        { status: 400 },
      );
    }

    if (message.length < MESSAGE_MIN) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    if (message.length > MESSAGE_MAX) {
      return NextResponse.json(
        { error: `Message must be ${MESSAGE_MAX} characters or fewer.` },
        { status: 400 },
      );
    }

    if (
      hasControlChars(name) ||
      hasControlChars(email) ||
      hasControlChars(phone) ||
      hasControlChars(message, true)
    ) {
      return NextResponse.json(
        { error: "Contact fields must be plain text." },
        { status: 400 },
      );
    }

    const to = safeTrim(process.env.CONTACT_TO_EMAIL) || DEFAULT_CONTACT_TO;
    const from = safeTrim(process.env.RESEND_FROM) || DEFAULT_RESEND_FROM;

    const payload = {
      name,
      email,
      phone,
      message,
      submittedAt: new Date().toISOString(),
      source: "home-contact-panel",
    };

    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from,
      to: [to],
      subject: `Contact form: ${name}`,
      text: JSON.stringify(payload, null, 2),
      replyTo: email,
    });

    if (result?.error) {
      return NextResponse.json(
        {
          error:
            result.error.message || result.error.name || "Failed to send email.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send contact message.", detail: String(error) },
      { status: 500 },
    );
  }
}
