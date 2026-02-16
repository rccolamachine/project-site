"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function GuestbookClient() {
  const mySid = useMemo(() => readCookie("gb_sid"), []);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null); // deleting id
  const [expandedItem, setExpandedItem] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/pictures?limit=50", { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Failed to load (${res.status})`);
      }
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setLoadError(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const closeExpanded = useCallback(() => {
    setExpandedItem(null);
  }, []);

  useEffect(() => {
    if (!expandedItem) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeExpanded();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedItem, closeExpanded]);

  const onDelete = useCallback(
    async (id) => {
      if (!id) return;
      if (!confirm("Delete this guestbook entry? This cannot be undone."))
        return;

      setBusyId(id);
      try {
        const res = await fetch(`/api/pictures?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Delete failed (${res.status})`);
        }

        // optimistic update
        setItems((prev) => prev.filter((x) => x.id !== id));
        setExpandedItem((prev) => (prev?.id === id ? null : prev));
      } catch (e) {
        alert(e?.message || String(e));
      } finally {
        setBusyId(null);
      }
    },
    [setItems],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button onClick={fetchItems} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>

        <div style={{ opacity: 0.85, fontSize: 12 }}>
          {loading
            ? "Loading…"
            : `Showing ${items.length} entr${items.length === 1 ? "y" : "ies"}`}
        </div>
      </div>

      {loadError ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#2a1414",
            border: "1px solid #5a2b2b",
            color: "#ffd5d5",
          }}
        >
          <div style={{ marginBottom: 8 }}>Failed to load</div>
          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>
            {loadError}
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={fetchItems} disabled={loading}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {items.map((it) => {
          const canDelete = !!mySid && !!it.sid && mySid === it.sid;

          return (
            <figure
              key={it.id} // ✅ unique
              className="tile"
              style={{
                margin: 0,
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.18)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedItem(it)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "zoom-in",
                  lineHeight: 0,
                }}
                title="Click to view full image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.image_url}
                  alt={`Pixelbooth by ${it.name || "Guest"}`}
                  style={{
                    width: "100%",
                    height: 220,
                    objectFit: "cover",
                    display: "block",
                    imageRendering: "pixelated",
                    filter: "grayscale(1)",
                  }}
                />
              </button>

              <figcaption style={{ padding: 12, display: "grid", gap: 6 }}>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 10 }}
                >
                  <div style={{ fontWeight: 700 }}>{it.name || "Guest"}</div>
                  <div
                    style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}
                  >
                    {formatDate(it.created_at || it.uploadedAt)}
                  </div>
                </div>

                {it.message ? (
                  <div
                    style={{
                      fontSize: 13,
                      opacity: 0.92,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {it.message}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    (No message.)
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    marginTop: 6,
                  }}
                >
                  {it.linkedinUrl ? (
                    <a
                      href={it.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, opacity: 0.9 }}
                    >
                      LinkedIn
                    </a>
                  ) : null}

                  <div style={{ marginLeft: "auto" }} />

                  {canDelete ? (
                    <button
                      onClick={() => onDelete(it.id)}
                      disabled={busyId === it.id}
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,90,90,0.45)",
                        background: "rgba(120, 20, 20, 0.35)",
                      }}
                      title="You can delete entries you created in this browser session."
                    >
                      {busyId === it.id ? "Deleting…" : "Delete"}
                    </button>
                  ) : null}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      {expandedItem ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeExpanded();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(0,0,0,0.78)",
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(1080px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#0f1118",
              boxShadow: "0 24px 80px rgba(0,0,0,0.58)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {expandedItem.name || "Guest"}
              </div>
              <div style={{ opacity: 0.82, fontSize: 12 }}>
                {formatDate(expandedItem.created_at || expandedItem.uploadedAt)}
              </div>
              <button onClick={closeExpanded} style={{ marginLeft: "auto" }}>
                Close
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={expandedItem.image_url}
              alt={`Pixelbooth by ${expandedItem.name || "Guest"}`}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "78vh",
                objectFit: "contain",
                imageRendering: "pixelated",
                filter: "grayscale(1)",
                background: "#000",
                borderRadius: 8,
              }}
            />

            {expandedItem.message ? (
              <div style={{ whiteSpace: "pre-wrap", opacity: 0.9, fontSize: 13 }}>
                {expandedItem.message}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
