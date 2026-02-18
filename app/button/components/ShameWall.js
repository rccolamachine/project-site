import styles from "../button.module.css";

export default function ShameWall({ entries }) {
  const rows = Array.isArray(entries) ? entries : [];

  if (rows.length <= 0) {
    return <div className={styles.emptyState}>No resets yet. Incredible restraint.</div>;
  }

  return (
    <div className="grid">
      {rows.slice(0, 9).map((entry, idx) => {
        const photo = entry.photoDataUrl || entry.photo || entry.photo_url || "";
        const key = entry.id ?? `${entry.resetAt ?? "x"}-${idx}`;

        return (
          <figure key={key} className={`tile ${styles.shameTile}`}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={`${entry.name || "Someone"} reset`} />
            ) : (
              <div className={styles.noPhoto}>(no photo returned by API)</div>
            )}

            <div aria-hidden="true" className={styles.shameStamp}>
              CLICKED RESET
            </div>

            <figcaption>
              <div className="capTitle">{entry.name || "-"}</div>
              <div className="capMeta">
                reset at {entry.resetAt ? new Date(entry.resetAt).toLocaleString() : "-"}
              </div>
              <div className="capMeta">
                value before reset: <strong>{Number(entry.beforeValue ?? 0)}</strong>
              </div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
