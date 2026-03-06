import styles from "../mixtape.module.css";
import ModalShell from "./ModalShell";

export default function SongInfoModal({
  infoDetails,
  infoError,
  infoLoading,
  infoTarget,
  onClose,
  onPlay,
}) {
  if (!infoTarget) return null;

  const resolvedTrackId = String(
    infoDetails?.trackId || infoTarget?.spotifyTrackId || "",
  ).trim();

  return (
    <ModalShell title="Song details" onClose={onClose} zIndex={10001}>
      {infoLoading ? (
        <div className="ui-searchMeta">Loading Spotify details...</div>
      ) : null}

      {!infoLoading && infoError ? (
        <div className="ui-errorInline">{infoError}</div>
      ) : null}

      {!infoLoading && !infoError && !infoDetails ? (
        <div className="ui-searchMeta">No Spotify details found for this entry.</div>
      ) : null}

      {!infoLoading && !infoError && infoDetails ? (
        <div className="ui-infoGrid">
          {infoDetails.albumCoverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={infoDetails.albumCoverUrl}
                alt={infoDetails.albumTitle || "Album cover"}
                className="ui-infoCover"
              />
            </>
          ) : (
            <div className="ui-infoCover ui-infoCoverEmpty">No cover</div>
          )}

          <div className="ui-infoMeta">
            <div>
              <strong>Song:</strong> {infoDetails.title || infoTarget.title}
            </div>
            <div>
              <strong>Artist:</strong>{" "}
              {(Array.isArray(infoDetails.artists) ? infoDetails.artists : []).join(
                ", ",
              ) || infoTarget.artist}
            </div>
            <div>
              <strong>Album:</strong> {infoDetails.albumTitle || "Unknown"}
            </div>
            <div>
              <strong>Year:</strong> {infoDetails.year || "Unknown"}
            </div>
            <div>
              {infoDetails.externalUrl ? (
                <a
                  href={infoDetails.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  Open in Spotify
                </a>
              ) : (
                <span className="ui-searchMeta">Spotify link unavailable.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`ui-actionRow ${styles.infoActionRow}`}>
        <button
          type="button"
          onClick={onPlay}
          disabled={infoLoading || !resolvedTrackId}
        >
          Play
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}
