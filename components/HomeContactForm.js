"use client";

import { useMemo, useState } from "react";

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;
const MESSAGE_MIN = 1;
const MESSAGE_MAX = 2000;

const initialForm = {
  name: "",
  email: "",
  phone: "",
  message: "",
};

export default function HomeContactForm() {
  const [form, setForm] = useState(initialForm);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState({ tone: "", message: "" });

  const canSend = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.message.trim().length >= MESSAGE_MIN
    );
  }, [form.email, form.message, form.name]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!canSend || sending) return;

    setSending(true);
    setFeedback({ tone: "", message: "" });

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
      };

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to send message.");
      }

      setForm(initialForm);
      setFeedback({ tone: "success", message: "Message sent." });
    } catch (error) {
      setFeedback({
        tone: "warning",
        message: error?.message || "Failed to send message.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="ui-form home-contactForm" onSubmit={onSubmit}>
      <label className="ui-field">
        <span className="ui-fieldLabel">Name *</span>
        <input
          className="ui-input"
          value={form.name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, name: event.target.value }))
          }
          placeholder="Your name"
          disabled={sending}
          maxLength={NAME_MAX}
          required
        />
      </label>

      <label className="ui-field">
        <span className="ui-fieldLabel">Email *</span>
        <input
          className="ui-input"
          type="email"
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          placeholder="you@example.com"
          disabled={sending}
          maxLength={EMAIL_MAX}
          required
        />
      </label>

      <label className="ui-field">
        <span className="ui-fieldLabel">Phone</span>
        <input
          className="ui-input"
          type="tel"
          value={form.phone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, phone: event.target.value }))
          }
          placeholder="(555) 555-5555"
          disabled={sending}
          maxLength={PHONE_MAX}
        />
      </label>

      <label className="ui-field">
        <span className="ui-fieldLabel">Message *</span>
        <textarea
          className="ui-input ui-inputTall"
          value={form.message}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, message: event.target.value }))
          }
          placeholder="Got a project, bug, or weird idea?"
          disabled={sending}
          minLength={MESSAGE_MIN}
          maxLength={MESSAGE_MAX}
          required
        />
      </label>

      <div className="ui-actionRow home-contactActions">
        <button
          type="submit"
          className="btn home-contactSendButton"
          disabled={!canSend || sending}
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>

      {feedback.message ? (
        <div className="ui-feedback" data-tone={feedback.tone || undefined}>
          {feedback.message}
        </div>
      ) : null}
    </form>
  );
}
