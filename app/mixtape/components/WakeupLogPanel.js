import styles from "../mixtape.module.css";
import { formatSongDate } from "../mixtapeUtils";

export default function WakeupLogPanel({
  loading,
  onAddSong,
  onRowClick,
  onRowDoubleClick,
  onRowPlay,
  songs,
}) {
  return (
    <div className={styles.stackSpacing}>
      <section className="card ui-logPanel">
        <div className="ui-logHeader">
          <div className={styles.panelHeaderRow}>
            <span>WAKEUP MIXTAPE LOG</span>
            <div className="ui-toolbarActions">
              <button type="button" onClick={onAddSong}>
                Add Song
              </button>
            </div>
          </div>
        </div>

        <div className={`ui-logBody ${styles.tracklistBody}`}>
          {songs.length === 0 ? (
            <div className={`${styles.panelMessage} ui-searchMeta`}>
              {loading ? "Loading songs..." : "No songs yet."}
            </div>
          ) : null}

          {songs.map((song) => (
            <div
              key={song.id}
              className={`ui-logRow ${styles.wakeupRow}`}
              onClick={() => onRowClick(song)}
              onDoubleClick={() => onRowDoubleClick(song)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(song);
                }
              }}
              role="button"
              tabIndex={0}
              title="Click for info | Double-click to delete"
            >
              <span className="ui-logDate">{formatSongDate(song.date)}</span>
              <button
                type="button"
                onClick={(event) => onRowPlay(song, event)}
                title="Play in mini player"
                className={`btn ${styles.trackPlayButton}`}
              >
                {"\u25B6"}
              </button>
              <span className="ui-logTitle">{song.title || "Untitled"}</span>
              <span className="ui-logArtist">
                {song.artist || "Unknown Artist"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
