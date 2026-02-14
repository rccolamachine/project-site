"use client";

import React, { useEffect, useMemo, useState } from "react";

const LS_KEY = "rccolamachine.todo.v1";

const DEFAULT_ITEMS = [
  {
    id: "pb-email-fix",
    title: "Photobooth: fix email field/handling",
    area: "Photobooth",
    priority: "P1",
    status: "todo",
    notes:
      "Email input/submit isn’t correct (validation, formatting, or wiring). Fix UI + API contract and confirm it persists/gets displayed correctly.",
    links: [{ label: "Open Photobooth", href: "/photobooth" }],
  },
  {
    id: "gb-photo-storage",
    title: "Guestbook: fix photo storage",
    area: "Guestbook",
    priority: "P1",
    status: "todo",
    notes:
      "Store uploaded photos reliably (avoid huge payloads / broken persistence). Decide DB vs blob storage strategy and update API accordingly.",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "gb-get-endpoint",
    title: "Guestbook: fix GET pictures endpoint",
    area: "Guestbook",
    priority: "P1",
    status: "todo",
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
    id: "update-about-page",
    title: "About page: fill it with stuff",
    area: "About",
    priority: "P1",
    status: "todo",
    notes:
      "Add content and stylize About page. Include bio, links, and whatever else seems fun. It’s been a placeholder for too long. Add spotify playlist?",
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
    id: "add-favicon",
    title: "Add Favicon",
    area: "General",
    priority: "P3",
    status: "todo",
    notes: "Add a favicon to the site for better branding and user experience.",
  },
];

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

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

export default function TodoPage() {
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [filter, setFilter] = useState("open"); // open | all | done
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newArea, setNewArea] = useState("General");
  const [newPriority, setNewPriority] = useState("P3");

  // load from localStorage
  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LS_KEY)
        : null;
    const parsed = raw ? safeParse(raw) : null;

    if (Array.isArray(parsed) && parsed.length) {
      setItems(parsed);
    } else {
      // seed initial
      window.localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_ITEMS));
    }
  }, []);

  // persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  }, [items]);

  const openCount = useMemo(
    () => items.filter((x) => x.status !== "done").length,
    [items],
  );
  const doneCount = useMemo(
    () => items.filter((x) => x.status === "done").length,
    [items],
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items
      .filter((x) => {
        if (filter === "open") return x.status !== "done";
        if (filter === "done") return x.status === "done";
        return true;
      })
      .filter((x) => {
        if (!q) return true;
        return (
          x.title.toLowerCase().includes(q) ||
          (x.area || "").toLowerCase().includes(q) ||
          (x.notes || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // sort by priority then status then updatedAt
        const priRank = (p) =>
          p === "P1" ? 1 : p === "P2" ? 2 : p === "P3" ? 3 : 9;
        const sRank = (s) => (s === "done" ? 9 : s === "in-progress" ? 2 : 1);
        const r =
          priRank(a.priority) - priRank(b.priority) ||
          sRank(a.status) - sRank(b.status);

        if (r !== 0) return r;

        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return tb - ta;
      });
  }, [items, filter, query]);

  const setStatus = (id, status) => {
    setItems((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, status, updatedAt: nowIso() } : x,
      ),
    );
  };

  const toggleDone = (id) => {
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const nextStatus = x.status === "done" ? "todo" : "done";
        return { ...x, status: nextStatus, updatedAt: nowIso() };
      }),
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const addItem = () => {
    const title = newTitle.trim();
    if (!title) return;

    const id =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Date.now();

    const newItem = {
      id,
      title,
      area: newArea || "General",
      priority: newPriority || "P3",
      status: "todo",
      notes: "",
      links: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    setItems((prev) => [newItem, ...prev]);
    setNewTitle("");
  };

  const resetToDefaults = () => {
    setItems(DEFAULT_ITEMS);
  };

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
          <button
            className="btn"
            onClick={resetToDefaults}
            title="Reset list back to the seeded items"
          >
            Reset list
          </button>
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
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#eaeaea",
              outline: "none",
            }}
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#eaeaea",
              outline: "none",
              minWidth: 140,
            }}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="done">Done</option>
          </select>

          <div style={{ fontSize: 12, opacity: 0.85, textAlign: "right" }}>
            {visibleItems.length} shown
          </div>
        </div>

        {/* Add item */}
        {/* <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a new issue…"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#eaeaea",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
          />

          <select
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#eaeaea",
              outline: "none",
              minWidth: 140,
            }}
          >
            <option>General</option>
            <option>Photobooth</option>
            <option>Guestbook</option>
            <option>Pictures</option>
            <option>Resume</option>
            <option>Button</option>
          </select>

          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#eaeaea",
              outline: "none",
              minWidth: 90,
            }}
          >
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>

          <button className="btn" onClick={addItem} disabled={!newTitle.trim()}>
            Add
          </button>
        </div> */}
      </div>

      {/* Items */}
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {visibleItems.map((it) => {
          const isDone = it.status === "done";

          return (
            <div
              key={it.id}
              className="card"
              style={{
                opacity: isDone ? 0.65 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260, flex: 1 }}>
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
                    <span
                      style={{
                        ...pillStyle("P3"),
                        opacity: 0.85,
                      }}
                    >
                      {it.status || "todo"}
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

                  <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                    {it.updatedAt
                      ? `updated ${new Date(it.updatedAt).toLocaleString()}`
                      : null}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  {/* <button className="btn" onClick={() => toggleDone(it.id)}>
                    {isDone ? "Re-open" : "Done"}
                  </button> */}

                  {/* <select
                    value={it.status || "todo"}
                    onChange={(e) => setStatus(it.id, e.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.25)",
                      color: "#eaeaea",
                      outline: "none",
                      minWidth: 160,
                    }}
                  >
                    <option value="todo">todo</option>
                    <option value="in-progress">in-progress</option>
                    <option value="blocked">blocked</option>
                    <option value="done">done</option>
                  </select> */}

                  {/* <button
                    className="btn"
                    onClick={() => removeItem(it.id)}
                    title="Remove from list"
                    style={{
                      borderColor: "rgba(255, 79, 216, 0.35)",
                      background: "rgba(255, 79, 216, 0.10)",
                    }}
                  >
                    Remove
                  </button> */}
                </div>
              </div>
            </div>
          );
        })}

        {!visibleItems.length ? (
          <div className="card" style={{ opacity: 0.85 }}>
            Nothing here with the current filter/search.
          </div>
        ) : null}
      </div>
    </section>
  );
}
