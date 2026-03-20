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
  const wakeupReadout =
    songs.length === 0 ? "Showing 0 of 0" : `Showing ${songs.length} of ${songs.length}`;

  return (
    <div className={styles.stackSpacing}>
      <section className={`card ui-logPanel ${styles.mixtapePanel}`}>
        <div className="ui-logHeader">
          <div className={styles.panelHeaderGrid}>
            <span className={styles.panelTitle}>WAKEUP MIXTAPE LOG</span>
            <div className={`${styles.panelHeaderAction} ui-toolbarActions`}>
              <button
                type="button"
                className={styles.headerActionButton}
                onClick={onAddSong}
              >
                Add Song
              </button>
            </div>
            <div className={styles.panelDescription}>
              Most days, I wake up with a song in my head. These are those songs.
            </div>
            <div className={`${styles.panelReadout} ${styles.panelReadoutRight}`}>
              {wakeupReadout}
            </div>
          </div>
        </div>

        {songs.length > 0 ? (
          <div className={styles.columnHeaderRow} aria-hidden="true">
            <span className={styles.columnHeaderDate}>Date Added</span>
            <span className={styles.columnHeaderSpacer} />
            <span>Song</span>
            <span className={styles.columnHeaderArtist}>Artist</span>
          </div>
        ) : null}

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
              <span className={`ui-logDate ${styles.trackDateCell}`}>
                {formatSongDate(song.date)}
              </span>
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
