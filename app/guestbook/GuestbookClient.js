// app/guestbook/GuestbookClient.jsx
"use client";

import React, { useEffect, useState } from "react";

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function GuestbookClient() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/pictures", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load (${res.status})`);
      }
      const json = await res.json(); // { items }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id) => {
    if (!id) return;
    const ok = window.confirm(
      "Delete this guestbook entry? This cannot be undone.",
    );
    if (!ok) return;

    setDeletingId(id);
    setErr("");

    try {
      const res = await fetch(`/api/pictures/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Delete failed (${res.status})`);
      }

      // Optimistic remove
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div
        className="card"
        style={{
          marginTop: 16,
          borderColor: "rgba(255,0,0,0.25)",
        }}
      >
        <div style={{ marginBottom: 10, color: "#ffb4b4" }}>{err}</div>
        <button onClick={load}>Retry</button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        No entries yet. Go snap a photo and save it.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button onClick={load}>Refresh</button>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Showing <strong>{items.length}</strong> entr
          {items.length === 1 ? "y" : "ies"}
        </div>
      </div>

      <div className="grid">
        {items.map((it) => (
          <figure key={it.id} className="tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.image_url} alt={`Photobooth by ${it.name}`} />

            <figcaption>
              <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="capTitle">{it.name}</div>
                  <div className="capMeta">
                    {formatDate(it.created_at)}
                    {it.pixel_size ? ` • ${it.pixel_size}px` : ""}
                  </div>
                </div>

                {it.can_delete ? (
                  <button
                    onClick={() => onDelete(it.id)}
                    disabled={deletingId === it.id}
                    title="You can delete entries created in your current session"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.2)",
                      color: "#eaeaea",
                      cursor: deletingId === it.id ? "not-allowed" : "pointer",
                      opacity: deletingId === it.id ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {deletingId === it.id ? "Deleting…" : "Delete"}
                  </button>
                ) : null}
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {it.linkedin_url ? (
                  <div style={{ fontSize: 14, opacity: 0.92 }}>
                    <span style={{ opacity: 0.75 }}>LinkedIn: </span>
                    <a href={it.linkedin_url} target="_blank" rel="noreferrer">
                      {it.linkedin_url}
                    </a>
                  </div>
                ) : null}

                {it.message ? (
                  <div
                    style={{
                      fontSize: 14,
                      opacity: 0.92,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <span style={{ opacity: 0.75 }}>Message: </span>
                    {it.message}
                  </div>
                ) : null}

                {!it.linkedin_url && !it.message ? (
                  <div style={{ fontSize: 14, opacity: 0.75 }}>
                    (No message.)
                  </div>
                ) : null}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
