"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import PublicationTitle from "@/components/publications/PublicationTitle";
import styles from "./publications.module.css";

function getTagCounts(publications) {
  const counts = new Map();

  for (const publication of publications) {
    for (const tag of publication.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return counts;
}

function sortTags(tags = []) {
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export default function PublicationsClient({ publications }) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const tagCounts = useMemo(() => getTagCounts(publications), [publications]);
  const allTags = useMemo(
    () => Array.from(tagCounts.keys()).sort((a, b) => a.localeCompare(b)),
    [tagCounts],
  );

  const toggleTag = (tag) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag],
    );
  };

  const filteredPublications = useMemo(() => {
    if (!selectedTags.length) return publications;
    return publications.filter((publication) =>
      selectedTags.some((tag) => (publication.tags || []).includes(tag)),
    );
  }, [selectedTags, publications]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setIsDropdownOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDropdownOpen]);

  return (
    <>
      <div className={styles.filterBar} aria-label="Filter publications by tag">
        <div className={styles.filterDropdown} ref={dropdownRef}>
          <button
            type="button"
            className={styles.filterDropdownSummary}
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            onClick={() => setIsDropdownOpen((open) => !open)}
          >
            Filter tags {selectedTags.length ? `(${selectedTags.length} selected)` : "(all)"}
          </button>
          {isDropdownOpen ? (
            <div
              className={styles.filterDropdownPanel}
              role="listbox"
              aria-multiselectable="true"
            >
              {allTags.map((tag) => (
                <label key={`option-${tag}`} className={styles.filterOption}>
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                  <span>
                    {tag} ({tagCounts.get(tag)})
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.filterClearBtn}
          onClick={() => setSelectedTags([])}
          disabled={!selectedTags.length}
        >
          Clear filters
        </button>
      </div>

      <div className={styles.activeTagRow}>
        {selectedTags.length ? selectedTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`${styles.publicationTag} ${styles.activeTagPill}`}
            onClick={() => toggleTag(tag)}
          >
            {tag} x
          </button>
        )) : <span className={styles.showingAll}>Showing all tags</span>}
      </div>

      <div className={styles.publicationsGrid}>
        {filteredPublications.map((publication) => {
          const previewHref = publication.pdfPath || publication.sourceUrl;
          const hasPdf = Boolean(publication.pdfPath);

          return (
            <article className={`card ${styles.publicationCard}`} key={publication.slug}>
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.publicationPreviewLink}
                aria-label={`Open ${hasPdf ? "PDF" : "source page"} for ${publication.title}`}
              >
                {publication.previewPath ? (
                  <Image
                    src={publication.previewPath}
                    alt={`Preview image for ${publication.title}`}
                    fill
                    sizes="(max-width: 900px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className={styles.publicationPreviewImage}
                  />
                ) : (
                  <div className={styles.publicationPreviewFallback}>
                    <span>Preview coming soon</span>
                  </div>
                )}
              </a>
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.publicationTitleLink}
                aria-label={`Open ${hasPdf ? "PDF" : "source page"} for ${publication.title}`}
              >
                <PublicationTitle
                  title={publication.title}
                  className={styles.publicationTitle}
                  formulaClassName={styles.chemFormula}
                  subClassName={styles.chemSub}
                />
              </a>
              <p className={styles.publicationMeta}>
                <a
                  href={publication.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.publicationMetaLink}
                >
                  {publication.journal} {publication.year ? `(${publication.year})` : ""}
                </a>
              </p>
              <div className={styles.publicationTagRow}>
                {sortTags(publication.tags || []).map((tag) => (
                  <button
                    key={`${publication.slug}-${tag}`}
                    type="button"
                    className={styles.publicationTag}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {!filteredPublications.length ? (
        <div className={`card ${styles.emptyState}`}>
          No publications match the selected tags.
        </div>
      ) : null}
    </>
  );
}
