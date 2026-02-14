"use client";

import React, { useMemo, useState, useEffect } from "react";

const PAGE_SIZE = 6;

const ITEMS = [
  {
    id: "pb-email-fix",
    title: "Photobooth: fix email field/handling",
    area: "Photobooth",
    priority: "P1",
    status: "inProgress", // todo | inProgress | done
    notes:
      "Email input/submit isn’t correct (validation, formatting, or wiring). Fix UI + API contract and confirm it persists/gets displayed correctly. Progress update: emails are currently being sent to the user when specified, but never to Rob's email.",
    links: [{ label: "Open Photobooth", href: "/photobooth" }],
  },
  {
    id: "gb-photo-storage",
    title: "Guestbook: fix photo storage",
    area: "Guestbook",
    priority: "P1",
    status: "done",
    notes:
      "Store uploaded photos reliably (avoid huge payloads / broken persistence). Decide DB vs blob storage strategy and update API accordingly.",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "gb-get-endpoint",
    title: "Guestbook: fix GET pictures endpoint",
    area: "Guestbook",
    priority: "P1",
    status: "done",
    notes:
      "GET should return the correct shape, newest-first ordering, and include photo URLs/data consistently. Confirm caching headers for Vercel.",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "pics-move-to-db",
    title: "Pictures page: move photos to database",
    area: "Pictures",
    priority: "P1",
    status: "todo",
    notes:
      "Stop hardcoding/local-file listing for the public gallery. Store metadata in DB, load via API, and render grid from DB results.",
    links: [{ label: "Open Pictures", href: "/pictures" }],
  },
  {
    id: "reactor-page-in-mobile",
    title: "Fix Reactor page on mobile",
    area: "Reactor",
    priority: "P3",
    status: "todo",
    notes:
      "Currently the Reactor page is pretty broken on mobile (overflow, controls hard to use). Make it responsive and usable on smaller screens, or disable the page on mobile with a message. It’s a bit of a niche use case but would be nice to have it work decently.",
    links: [{ label: "Open Reactor", href: "/reactor" }],
  },
  {
    id: "update-about-page",
    title: "About page: fill it with stuff",
    area: "About",
    priority: "P1",
    status: "todo",
    notes:
      "Add content and stylize About page. Include bio, links, and whatever else seems fun. It’s been a placeholder for too long. Add spotify playlist? Fix Links.",
    links: [{ label: "Open About", href: "/about" }],
  },
  {
    id: "populate-pictures-page",
    title: "Pictures page: populate with photos",
    area: "Pictures",
    priority: "P2",
    status: "todo",
    notes:
      "Add albums/content for the Pictures page. Take and add pictures. Add Pixel art gallery? Make it easy to add new photos/albums over time.",
    links: [{ label: "Open Pictures", href: "/pictures" }],
  },
  {
    id: "standardize-page-headers",
    title: "Standardize page headers",
    area: "General",
    priority: "P2",
    status: "todo",
    notes:
      "Inconsistent header styles across pages. Standardize on a style for H1s and ledes, and update all pages to match for a more cohesive feel.",
  },
  {
    id: "add-aprs-page",
    title: "Add APRS page",
    area: "Ham radio",
    priority: "P3",
    status: "todo",
    notes:
      "Add page exhibiting live APRS data from local iGate. Try to get a map working with real-time position updates. Could be fun and also a neat demo of live data handling.",
  },
  {
    id: "add-pager-page",
    title: "Add Pager page",
    area: "General",
    priority: "P3",
    status: "todo",
    notes:
      "I have some POCSAG, FLEX, and Zebra pagers that I'd like to get working with Javascript SDKs. Hope to chronicle my efforts.",
  },
  {
    id: "add-print-postcard-functionality",
    title: "Add Postcard printing functionality to Photobooth",
    area: "Photobooth",
    priority: "P3",
    status: "todo",
    notes:
      "Add CUPS printing support to the Photobooth app. Users will be able to print their photos as postcards directly from the browser to a thermal printer in Rob's apartment.",
    links: [{ label: "Open Photobooth", href: "/photobooth" }],
  },
  {
    id: "photobooth-style-upgrade",
    title: "Photobooth: style upgrade and UI polish",
    area: "Photobooth",
    priority: "P4",
    status: "todo", // todo | inProgress | done
    notes:
      "Make some design tweaks on the Photobooth page, including the Pixelation slider.",
    links: [{ label: "Open Photobooth", href: "/photobooth" }],
  },
  {
    id: "add-favicon",
    title: "Add Favicon",
    area: "General",
    priority: "P3",
    status: "todo",
    notes: "Add a favicon to the site for better branding and user experience.",
  },
];

function pillStyle(priority) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    fontSize: 11,
    opacity: 0.95,
    whiteSpace: "nowrap",
  };

  if (priority === "P1") {
    return {
      ...base,
      border: "1px solid rgba(255,79,216,0.35)",
      background: "rgba(255,79,216,0.10)",
    };
  }
  if (priority === "P2") {
    return {
      ...base,
      border: "1px solid rgba(45,226,230,0.35)",
      background: "rgba(45,226,230,0.08)",
    };
  }
  return base;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function prettyStatus(s) {
  if (s === "inProgress") return "in progress";
  return s || "todo";
}

function isOpenStatus(status) {
  return status === "todo" || status === "inProgress";
}

export default function TodoPage() {
  const [filter, setFilter] = useState("open"); // open | all | done
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1); // 1-based

  // reset to page 1 when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const openCount = useMemo(
    () => ITEMS.filter((x) => isOpenStatus(x.status)).length,
    [],
  );
  const doneCount = useMemo(
    () => ITEMS.filter((x) => x.status === "done").length,
    [],
  );

  const filteredSortedItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return ITEMS.filter((x) => {
      if (filter === "open") return isOpenStatus(x.status);
      if (filter === "done") return x.status === "done";
      return true; // all
    })
      .filter((x) => {
        if (!q) return true;
        return (
          (x.title || "").toLowerCase().includes(q) ||
          (x.area || "").toLowerCase().includes(q) ||
          (x.notes || "").toLowerCase().includes(q) ||
          (x.status || "").toLowerCase().includes(q) ||
          (x.priority || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const priRank = (p) =>
          p === "P1" ? 1 : p === "P2" ? 2 : p === "P3" ? 3 : 9;
        const sRank = (s) => (s === "done" ? 9 : s === "inProgress" ? 2 : 1);
        return (
          priRank(a.priority) - priRank(b.priority) ||
          sRank(a.status) - sRank(b.status) ||
          (a.title || "").localeCompare(b.title || "")
        );
      });
  }, [filter, query]);

  const totalItems = filteredSortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = clamp(page, 1, totalPages);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSortedItems.slice(start, start + PAGE_SIZE);
  }, [filteredSortedItems, currentPage]);

  const rangeText = useMemo(() => {
    if (!totalItems) return "0";
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(totalItems, currentPage * PAGE_SIZE);
    return `${start}-${end} of ${totalItems}`;
  }, [totalItems, currentPage]);

  const gotoPrev = () => setPage((p) => Math.max(1, p - 1));
  const gotoNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#eaeaea",
    outline: "none",
  };

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#eaeaea",
    outline: "none",
    minWidth: 140,
  };

  const pagerBtnStyle = (disabled) => ({
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    transform: "none",
  });

  return (
    <section className="page">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>to-do</h1>
          <div className="lede" style={{ marginTop: 8 }}>
            Known issues + planned improvements for rccolamachine.com.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={pillStyle("P2")}>open: {openCount}</span>
          <span style={pillStyle("P3")}>done: {doneCount}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginTop: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues…"
            style={inputStyle}
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="done">Done</option>
          </select>

          <div style={{ fontSize: 12, opacity: 0.85, textAlign: "right" }}>
            {rangeText}
          </div>
        </div>

        {/* Pagination */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Page <strong>{currentPage}</strong> / {totalPages}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn"
              onClick={gotoPrev}
              disabled={currentPage <= 1}
              style={pagerBtnStyle(currentPage <= 1)}
            >
              Prev
            </button>
            <button
              className="btn"
              onClick={gotoNext}
              disabled={currentPage >= totalPages}
              style={pagerBtnStyle(currentPage >= totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {pagedItems.map((it) => {
          const isDone = it.status === "done";

          return (
            <div
              key={it.id}
              className="card"
              style={{
                opacity: isDone ? 0.65 : 1,
              }}
            >
              <div style={{ minWidth: 260 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span style={pillStyle(it.priority)}>{it.priority}</span>

                  <span
                    style={{
                      ...pillStyle("P3"),
                      borderColor: "rgba(255,255,255,0.10)",
                      opacity: 0.9,
                    }}
                  >
                    {it.area || "General"}
                  </span>

                  <span style={{ ...pillStyle("P3"), opacity: 0.85 }}>
                    {prettyStatus(it.status)}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    lineHeight: 1.5,
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {it.title}
                </div>

                {it.notes ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      opacity: 0.85,
                      lineHeight: 1.6,
                    }}
                  >
                    {it.notes}
                  </div>
                ) : null}

                {Array.isArray(it.links) && it.links.length ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {it.links.map((l, idx) => (
                      <a key={idx} className="btn" href={l.href}>
                        {l.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!filteredSortedItems.length ? (
          <div className="card" style={{ opacity: 0.85 }}>
            Nothing here with the current filter/search.
          </div>
        ) : null}
      </div>

      {/* Bottom pager (nice on mobile) */}
      {filteredSortedItems.length ? (
        <div
          style={{ marginTop: 14, display: "flex", justifyContent: "center" }}
        >
          <div
            className="card"
            style={{
              padding: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
              width: "fit-content",
            }}
          >
            <button
              className="btn"
              onClick={gotoPrev}
              disabled={currentPage <= 1}
              style={pagerBtnStyle(currentPage <= 1)}
            >
              Prev
            </button>

            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {rangeText} • page <strong>{currentPage}</strong> / {totalPages}
            </div>

            <button
              className="btn"
              onClick={gotoNext}
              disabled={currentPage >= totalPages}
              style={pagerBtnStyle(currentPage >= totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
