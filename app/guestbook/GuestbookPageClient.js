"use client";

import React, { useState } from "react";
import GuestbookSubmissionModal from "../../components/GuestbookSubmissionModal";
import GuestbookClient from "./GuestbookClient";
import {
  EMPTY_GUESTBOOK_LEAD,
  appendGuestbookLead,
  isValidGuestbookEmail,
} from "@/lib/guestbook";

const guestbookCtaBtnStyle = {
  height: 40,
  lineHeight: 1,
};

export default function GuestbookPageClient() {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResult, setSaveResult] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lead, setLead] = useState(() => ({ ...EMPTY_GUESTBOOK_LEAD }));

  const openSaveModal = () => {
    setSaveError("");
    setSaveResult(null);
    setShowSaveModal(true);
  };

  const submitSave = async () => {
    if (!lead.name.trim()) return setSaveError("Name is required.");
    if (!lead.email.trim()) return setSaveError("Email is required.");
    if (!isValidGuestbookEmail(lead.email)) {
      return setSaveError("Enter a valid email address.");
    }

    setSaving(true);
    setSaveError("");

    try {
      const formData = appendGuestbookLead(new FormData(), lead);
      const res = await fetch("/api/pictures", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const json = await res.json();
      setSaveResult({
        url: json.url || "",
        tone: json.emailWarning ? "warning" : "success",
        message: json.emailWarning || "Saved to guestbook. Notification email sent.",
      });
      setLead({ ...EMPTY_GUESTBOOK_LEAD });
      setShowSaveModal(false);
      setRefreshToken((prev) => prev + 1);
    } catch (error) {
      setSaveError(error?.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="guestbookCtaRow">
        <a className="btn" href="/pixelbooth" style={guestbookCtaBtnStyle}>
          Go to Pixelbooth
        </a>
        <button
          className="btn"
          onClick={openSaveModal}
          style={guestbookCtaBtnStyle}
        >
          Leave a Message
        </button>
      </div>

      {saveResult ? (
        <div className="ui-feedback" data-tone={saveResult.tone}>
          {saveResult.message}{" "}
          {saveResult.url ? (
            <a href={saveResult.url} target="_blank" rel="noreferrer">
              {saveResult.url}
            </a>
          ) : null}
        </div>
      ) : null}

      <GuestbookSubmissionModal
        open={showSaveModal}
        title="Sign the guestbook"
        lead={lead}
        setLead={setLead}
        saving={saving}
        saveError={saveError}
        canSubmit={
          lead.name.trim().length > 0 && isValidGuestbookEmail(lead.email)
        }
        onClose={() => setShowSaveModal(false)}
        onSubmit={submitSave}
      />

      <GuestbookClient refreshToken={refreshToken} />
    </>
  );
}
