import styles from "../mixtape.module.css";
import { MIXTAPE_PLAYLIST_URL } from "../mixtapeConstants";
import {
  formatArtistList,
  formatPlaylistAddedAt,
  getSpotifyTrackIdFromEntry,
} from "../mixtapeUtils";

function SpotifyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.spotifyIcon}
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M16.9 15.86a.9.9 0 0 1-1.24.3c-2.77-1.69-6.26-2.07-10.35-1.14a.9.9 0 1 1-.4-1.75c4.57-1.04 8.52-.59 11.69 1.34a.9.9 0 0 1 .3 1.25Z"
        fill="#05040a"
      />
      <path
        d="M18.68 11.95a1.13 1.13 0 0 1-1.55.37c-3.17-1.94-8-2.5-11.75-1.35a1.13 1.13 0 0 1-.66-2.16c4.33-1.31 9.72-.68 13.58 1.68.53.33.7 1.02.38 1.46Z"
        fill="#05040a"
      />
      <path
        d="M18.83 8.18C15.03 5.92 8.76 5.71 5.13 6.82a1.35 1.35 0 1 1-.79-2.58C8.52 2.95 15.47 3.2 20.21 6a1.35 1.35 0 0 1-1.38 2.18Z"
        fill="#05040a"
      />
    </svg>
  );
}

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
          <div
            className={`${styles.panelHeaderAction} ${styles.panelHeaderButtons} ui-toolbarActions`}
          >
            <button
              type="button"
              className={styles.headerActionButton}
              onClick={onPlayRandom}
              disabled={loading || playlistRandomLoading || playlistTotal <= 0}
            >
              {playlistRandomLoading ? "Picking..." : "Play Random"}
            </button>
            <a
              className={`btn ${styles.spotifyActionButton}`}
              href={MIXTAPE_PLAYLIST_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open mixtape playlist on Spotify"
              title="Open playlist on Spotify"
            >
              <SpotifyIcon />
            </a>
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
        <>
          <div className={styles.columnHeaderRow} aria-hidden="true">
            <span className={styles.columnHeaderDate}>Date Added</span>
            <span className={styles.columnHeaderSpacer} />
            <span>Song</span>
            <span className={styles.columnHeaderArtist}>Artist</span>
          </div>
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
        </>
      ) : null}
    </section>
  );
}
