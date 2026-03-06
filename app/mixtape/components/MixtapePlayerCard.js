import styles from "../mixtape.module.css";

function getPlayerLabel(currentContextLabel, currentListNumber) {
  if (currentContextLabel) {
    return `Now queued in player: ${currentContextLabel}`;
  }

  if (currentListNumber > 0) {
    return `Now queued in player: ${String(currentListNumber).padStart(3, "0")}`;
  }

  return "Now queued in player.";
}

export default function MixtapePlayerCard({
  currentContextLabel,
  currentListNumber,
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
          <div className={styles.playerLabel}>
            {getPlayerLabel(currentContextLabel, currentListNumber)}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.playerClose}
            title="Close player"
            aria-label="Close player"
          >
            X
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
