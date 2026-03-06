import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const DEFAULT_INBOUND_ALIAS = "rob@mail.rccolamachine.com";
const DEFAULT_FORWARD_TO = "robert.chapleski@gmail.com";
const DEFAULT_FORWARD_FROM = `Mail Router <${DEFAULT_INBOUND_ALIAS}>`;

function readHeader(req, name) {
  return req.headers.get(name) || "";
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req) {
  const resendKey = process.env.RESEND_API_KEY || "";
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || "";

  if (!resendKey) {
    return NextResponse.json(
      { error: "Server missing RESEND_API_KEY." },
      { status: 500 },
    );
  }

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Server missing RESEND_WEBHOOK_SECRET." },
      { status: 500 },
    );
  }

  const resend = new Resend(resendKey);
  const payload = await req.text();

  let event;
  try {
    event = resend.webhooks.verify({
      webhookSecret,
      payload,
      headers: {
        id: readHeader(req, "svix-id"),
        timestamp: readHeader(req, "svix-timestamp"),
        signature: readHeader(req, "svix-signature"),
      },
    });
  } catch (error) {
    console.error("Resend inbound webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event?.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const inboundAlias = normalizeAddress(
    process.env.RESEND_INBOUND_ALIAS || DEFAULT_INBOUND_ALIAS,
  );
  const forwardTo = normalizeAddress(
    process.env.RESEND_INBOUND_FORWARD_TO || DEFAULT_FORWARD_TO,
  );
  const forwardFrom =
    process.env.RESEND_INBOUND_FORWARD_FROM || DEFAULT_FORWARD_FROM;

  const recipients = Array.isArray(event.data?.to)
    ? event.data.to.map(normalizeAddress)
    : [];

  if (!recipients.includes(inboundAlias)) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "Recipient not handled by this route." },
      { status: 200 },
    );
  }

  const result = await resend.emails.receiving.forward({
    emailId: event.data.email_id,
    from: forwardFrom,
    to: [forwardTo],
    passthrough: true,
  });

  if (result?.error) {
    console.error("Resend inbound forward failed", result.error);
    return NextResponse.json(
      {
        error: "Inbound forward failed.",
        detail: result.error.message || result.error.name || "Unknown error.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      forwarded: true,
      to: forwardTo,
      alias: inboundAlias,
    },
    { status: 200 },
  );
}
