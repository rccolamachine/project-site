"use client";

import React, { useMemo, useState } from "react";
import PageIntro from "@/components/PageIntro";
import { SITE_TODO_ITEMS } from "@/data/siteTodoItems";

const PAGE_SIZE = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function prettyStatus(status) {
  if (status === "inProgress") return "in progress";
  return status || "todo";
}

function isOpenStatus(status) {
  return status === "todo" || status === "inProgress";
}

function getPriorityTone(priority) {
  if (priority === "P1") return "primary";
  if (priority === "P2") return "accent";
  return "default";
}

function rankPriority(priority) {
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 9;
}

function rankStatus(status) {
  if (status === "done") return 9;
  if (status === "inProgress") return 2;
  return 1;
}

export default function TodoPage() {
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const openCount = useMemo(
    () => SITE_TODO_ITEMS.filter((item) => isOpenStatus(item.status)).length,
    [],
  );
  const doneCount = useMemo(
    () => SITE_TODO_ITEMS.filter((item) => item.status === "done").length,
    [],
  );

  const filteredSortedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return SITE_TODO_ITEMS.filter((item) => {
      if (filter === "open") return isOpenStatus(item.status);
      if (filter === "done") return item.status === "done";
      return true;
    })
      .filter((item) => {
        if (!normalizedQuery) return true;
        return (
          (item.title || "").toLowerCase().includes(normalizedQuery) ||
          (item.area || "").toLowerCase().includes(normalizedQuery) ||
          (item.notes || "").toLowerCase().includes(normalizedQuery) ||
          (item.status || "").toLowerCase().includes(normalizedQuery) ||
          (item.priority || "").toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        return (
          rankPriority(a.priority) - rankPriority(b.priority) ||
          rankStatus(a.status) - rankStatus(b.status) ||
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
  }, [currentPage, filteredSortedItems]);

  const rangeText = useMemo(() => {
    if (!totalItems) return "0";
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(totalItems, currentPage * PAGE_SIZE);
    return `${start}-${end} of ${totalItems}`;
  }, [currentPage, totalItems]);

  const gotoPrev = () => setPage((value) => Math.max(1, value - 1));
  const gotoNext = () => setPage((value) => Math.min(totalPages, value + 1));
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <section className="page">
      <PageIntro
        title="to-do"
        lede="Known issues and planned improvements for rccolamachine.com."
      />

      <div className="ui-pillRow">
        <span className="ui-pill" data-tone="accent">
          open: {openCount}
        </span>
        <span className="ui-pill">done: {doneCount}</span>
      </div>

      <div className="card ui-mt16">
        <div className="ui-controlGrid">
          <input
            className="ui-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search issues..."
          />

          <select
            className="ui-input ui-select"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="done">Done</option>
          </select>

          <div className="ui-metaText ui-textRight">
            {rangeText}
          </div>
        </div>

        <div className="ui-actionBar">
          <div className="ui-metaText">
            Page <strong>{currentPage}</strong> / {totalPages}
          </div>

          <div className="ui-buttonRow">
            <button
              className="btn ui-noTransform"
              onClick={gotoPrev}
              disabled={prevDisabled}
            >
              Prev
            </button>
            <button
              className="btn ui-noTransform"
              onClick={gotoNext}
              disabled={nextDisabled}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="ui-cardStack">
        {pagedItems.map((item) => {
          const isDone = item.status === "done";

          return (
            <div
              key={item.id}
              className={`card${isDone ? " ui-cardDone" : ""}`}
            >
              <div className="ui-minWidth260">
                <div className="ui-pillRow">
                  <span
                    className="ui-pill"
                    data-tone={getPriorityTone(item.priority)}
                  >
                    {item.priority}
                  </span>
                  <span className="ui-pill" data-tone="muted">
                    {item.area || "General"}
                  </span>
                  <span className="ui-pill">{prettyStatus(item.status)}</span>
                </div>

                <div
                  className={`todoCardTitle${isDone ? " todoCardTitleDone" : ""}`}
                >
                  {item.title}
                </div>

                {item.notes ? <div className="todoCardNotes">{item.notes}</div> : null}

                {Array.isArray(item.links) && item.links.length ? (
                  <div className="ui-buttonRow ui-mt10">
                    {item.links.map((link) => (
                      <a key={`${item.id}-${link.href}`} className="btn" href={link.href}>
                        {link.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!filteredSortedItems.length ? (
          <div className="card ui-emptyCard">
            Nothing here with the current filter/search.
          </div>
        ) : null}
      </div>

      {filteredSortedItems.length ? (
        <div className="ui-centeredCard">
          <div className="card">
            <button
              className="btn ui-noTransform"
              onClick={gotoPrev}
              disabled={prevDisabled}
            >
              Prev
            </button>

            <div className="ui-metaText">
              {rangeText} | page <strong>{currentPage}</strong> / {totalPages}
            </div>

            <button
              className="btn ui-noTransform"
              onClick={gotoNext}
              disabled={nextDisabled}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
