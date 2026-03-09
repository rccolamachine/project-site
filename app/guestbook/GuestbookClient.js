"use client";

import React, { useCallback, useEffect, useState } from "react";
import { hasGuestbookDeleteCookie } from "@/lib/guestbook";

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function GuestbookClient({ refreshToken = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/pictures?limit=50", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load (${res.status})`);
      }

      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (error) {
      setLoadError(error?.message || String(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, refreshToken]);

  const closeExpanded = useCallback(() => {
    setExpandedItem(null);
  }, []);

  useEffect(() => {
    if (!expandedItem) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeExpanded();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedItem, closeExpanded]);

  const onDelete = useCallback(async (id) => {
    if (!id) return;
    if (!confirm("Delete this guestbook entry? This cannot be undone.")) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/pictures?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Delete failed (${res.status})`);
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
      setExpandedItem((prev) => (prev?.id === id ? null : prev));
    } catch (error) {
      alert(error?.message || String(error));
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="ui-stack">
      <div className="ui-metaText">
        {loading
          ? "Loading..."
          : `Showing ${items.length} entr${items.length === 1 ? "y" : "ies"}`}
      </div>

      {loadError ? (
        <div className="card ui-errorCard">
          <div>Failed to load</div>
          <div className="ui-errorDetail">{loadError}</div>
          <div className="ui-mt10">
            <button onClick={fetchItems} disabled={loading}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="ui-galleryGrid">
        {items.map((item) => {
          const canDelete = hasGuestbookDeleteCookie(item.id);
          const hasImage = !!item.image_url;

          return (
            <figure key={item.id} className="ui-galleryTile">
              {hasImage ? (
                <button
                  type="button"
                  className="ui-galleryThumbButton"
                  onClick={() => setExpandedItem(item)}
                  title="Click to view full image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={`Pixelbooth by ${item.name || "Guest"}`}
                    className="ui-galleryImage"
                  />
                </button>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/brand/pixel-rob.png"
                  alt={`Guestbook entry by ${item.name || "Guest"}`}
                  className="ui-galleryImage"
                />
              )}

              <figcaption
                className={`ui-galleryCaption${hasImage ? "" : " ui-galleryCaptionBorder"}`}
              >
                <div className="ui-galleryHeader">
                  <div className="ui-galleryName">{item.name || "Guest"}</div>
                  <div className="ui-spacer ui-metaText">
                    {formatDate(item.created_at || item.uploadedAt)}
                  </div>
                </div>

                {item.message ? (
                  <div className="ui-galleryMessage">{item.message}</div>
                ) : (
                  <div className="ui-galleryMessageEmpty">(No message.)</div>
                )}

                <div className="ui-galleryActions">
                  {item.linkedinUrl ? (
                    <a
                      href={item.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-metaText"
                    >
                      LinkedIn
                    </a>
                  ) : null}

                  <div className="ui-spacer" />

                  {canDelete ? (
                    <button
                      className="ui-dangerButton"
                      onClick={() => onDelete(item.id)}
                      disabled={busyId === item.id}
                      title="You can delete entries created from this browser."
                    >
                      {busyId === item.id ? "Deleting..." : "Delete"}
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
          className="ui-modalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExpanded();
          }}
        >
          <div
            className="card ui-modalCard ui-modalCardWide"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ui-modalHeader">
              <div className="ui-galleryName">{expandedItem.name || "Guest"}</div>
              <div className="ui-metaText">
                {formatDate(expandedItem.created_at || expandedItem.uploadedAt)}
              </div>
              <button onClick={closeExpanded}>Close</button>
            </div>

            {expandedItem.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={expandedItem.image_url}
                alt={`Pixelbooth by ${expandedItem.name || "Guest"}`}
                className="ui-mediaImage"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/brand/pixel-rob.png"
                alt={`Guestbook entry by ${expandedItem.name || "Guest"}`}
                className="ui-mediaImage"
              />
            )}

            {expandedItem.message ? (
              <div className="ui-galleryMessage">{expandedItem.message}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
