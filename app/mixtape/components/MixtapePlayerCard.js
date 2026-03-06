import styles from "../mixtape.module.css";

function getPlayerLabel(currentContextLabel) {
  if (currentContextLabel) {
    return `Now queued in player: ${currentContextLabel}`;
  }

  return "Now queued in player.";
}

export default function MixtapePlayerCard({
  currentContextLabel,
  currentTrackId,
  isBootstrappingError,
  playbackError,
  playerMountRef,
  onClose,
}) {
  const className = [
    "card",
    styles.playerCard,
    currentTrackId ? styles.playerCardVisible : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={className}>
      <div className={styles.playerShell}>
        <div className={styles.playerHeader}>
          <div className={styles.playerMeta}>
            <div className={styles.playerLabel}>
              {getPlayerLabel(currentContextLabel)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.playerClose}
            title="Close player"
            aria-label="Close player"
          >
            ×
          </button>
        </div>

        {isBootstrappingError ? (
          <div className={`${styles.playerMount} ${styles.playerBootMessage}`}>
            <div className="ui-errorInline">{playbackError}</div>
          </div>
        ) : null}

        <div
          ref={playerMountRef}
          className={`${styles.playerMount} ${
            isBootstrappingError ? styles.playerMountHidden : ""
          }`.trim()}
        />
      </div>
    </section>
  );
}
