"use client";

import React, { useEffect } from "react";

export default function GuestbookSubmissionModal({
  open,
  title,
  lead,
  setLead,
  saving,
  saveError,
  canSubmit,
  onClose,
  onSubmit,
  submitLabel = "Submit & Save",
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, saving]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="ui-modalOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="card ui-modalCard"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ui-modalHeader">
          <h2>{title}</h2>
          <button onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="ui-form">
          <label className="ui-field">
            <span className="ui-fieldLabel">Name</span>
            <input
              className="ui-input"
              value={lead.name}
              onChange={(event) =>
                setLead((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Rob"
              disabled={saving}
            />
          </label>

          <label className="ui-field">
            <span className="ui-fieldLabel">
              Email (just for Rob&apos;s records and guest copy delivery)
            </span>
            <input
              className="ui-input"
              type="email"
              value={lead.email}
              onChange={(event) =>
                setLead((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="you@example.com"
              disabled={saving}
            />
          </label>

          <label className="ui-checkboxCard">
            <input
              type="checkbox"
              checked={!!lead.emailSelf}
              onChange={(event) =>
                setLead((prev) => ({ ...prev, emailSelf: event.target.checked }))
              }
              disabled={saving}
            />
            <span className="ui-checkboxBody">
              <span className="ui-checkboxTitle">Email me a copy too</span>
              <span className="ui-helperText">
                If checked, this submission will also be emailed to the address
                above.
              </span>
            </span>
          </label>

          <label className="ui-field">
            <span className="ui-fieldLabel">LinkedIn URL (optional)</span>
            <input
              className="ui-input"
              value={lead.linkedinUrl}
              onChange={(event) =>
                setLead((prev) => ({
                  ...prev,
                  linkedinUrl: event.target.value,
                }))
              }
              placeholder="https://www.linkedin.com/in/..."
              disabled={saving}
            />
          </label>

          <label className="ui-field">
            <span className="ui-fieldLabel">Message (optional)</span>
            <textarea
              className="ui-input ui-inputTall"
              value={lead.message}
              onChange={(event) =>
                setLead((prev) => ({ ...prev, message: event.target.value }))
              }
              placeholder="Say hi..."
              disabled={saving}
            />
          </label>

          {saveError ? <div className="ui-errorInline">{saveError}</div> : null}

          <div className="ui-actionRow">
            <button onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button onClick={onSubmit} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
