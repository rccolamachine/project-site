import styles from "../mixtape.module.css";
import {
  formatArtistList,
  formatPlaylistAddedAt,
  getSpotifyTrackIdFromEntry,
} from "../mixtapeUtils";

export default function PlaylistPanel({
  isBootstrappingError,
  loading,
  onPlayRandom,
  onRowClick,
  onRowPlay,
  onScroll,
  playbackError,
  playerTrackId,
  playlistBodyRef,
  playlistError,
  playlistRandomLoading,
  playlistReadout,
  playlistTotal,
  tracks,
}) {
  return (
    <section className={`card ui-logPanel ${styles.panelSpacing} ${styles.mixtapePanel}`}>
      <div className="ui-logHeader">
        <div className={styles.panelHeaderGrid}>
          <span className={styles.panelTitle}>RANDOM ROB SH!T</span>
          <div className={`${styles.panelHeaderAction} ui-toolbarActions`}>
            <button
              type="button"
              onClick={onPlayRandom}
              disabled={loading || playlistRandomLoading || playlistTotal <= 0}
            >
              {playlistRandomLoading ? "Picking..." : "Play Random"}
            </button>
          </div>
          <div className={styles.panelDescription}>
            A playlist I&apos;ve been curating for the last ten years.
          </div>
          <div className={`${styles.panelReadout} ${styles.panelReadoutRight}`}>
            {playlistReadout}
          </div>
        </div>
      </div>

      {playlistError ? (
        <div className={styles.panelMessage}>
          <div className="ui-errorInline">{playlistError}</div>
        </div>
      ) : null}

      {!playlistError && playbackError && !isBootstrappingError ? (
        <div className={styles.panelPlaybackError}>
          <div className="ui-errorInline">{playbackError}</div>
        </div>
      ) : null}

      {!loading && !playlistError && tracks.length === 0 ? (
        <div className={`${styles.panelMessage} ui-searchMeta`}>No tracks found.</div>
      ) : null}

      {!playlistError && tracks.length > 0 ? (
        <div
          ref={playlistBodyRef}
          className={`ui-logBody ${styles.tracklistBody}`}
          onScroll={onScroll}
        >
          {tracks.map((track, idx) => {
            const listNumber = idx + 1;
            const trackSpotifyId = getSpotifyTrackIdFromEntry(track);
            const isTrackInPlayer = playerTrackId === trackSpotifyId;

            return (
              <div
                key={`${track.id || trackSpotifyId || listNumber}-${idx}`}
                className={`ui-logRow ${styles.playlistRow}`}
                onClick={() => onRowClick(track, listNumber)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(track, listNumber);
                  }
                }}
                role="button"
                tabIndex={0}
                title="Click for info"
              >
                <span
                  className={`ui-logDate ${styles.trackDateCell}`}
                  title={track.addedAt || ""}
                >
                  {formatPlaylistAddedAt(track.addedAt) || "--"}
                </span>
                <button
                  type="button"
                  onClick={(event) => onRowPlay(track, listNumber, event)}
                  title={
                    trackSpotifyId
                      ? isTrackInPlayer
                        ? "Reload in player"
                        : "Play in mini player"
                      : "Track ID unavailable"
                  }
                  disabled={!trackSpotifyId}
                  className={`btn ${styles.trackPlayButton} ${
                    trackSpotifyId ? "" : styles.trackPlayButtonMuted
                  }`.trim()}
                >
                  {isTrackInPlayer ? "\u25B8" : "\u25B6"}
                </button>
                <span className={`ui-logTitle ${styles.trackTitlePadded}`}>
                  {track.title || "Unknown song"}
                </span>
                <span className="ui-logArtist">
                  {formatArtistList(track.artists) || "Unknown artist"}
                </span>
              </div>
            );
          })}

          {loading ? (
            <div className={`${styles.loadingMore} ui-searchMeta`}>
              Loading more tracks...
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
