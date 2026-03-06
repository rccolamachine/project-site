import ModalShell from "./ModalShell";

export default function AddSongModal({
  form,
  isOpen,
  onApplySuggestion,
  onClose,
  onFieldChange,
  onSubmit,
  selectedSpotifyTrackId,
  spotifyError,
  spotifyLoading,
  spotifyResults,
  submitError,
  submitting,
}) {
  if (!isOpen) return null;

  return (
    <ModalShell title="Add song" onClose={onClose}>
      <form onSubmit={onSubmit} className="ui-form">
        <label className="ui-field">
          <span className="ui-fieldLabel">Song title</span>
          <input
            value={form.title}
            onChange={(event) => onFieldChange("title", event.target.value)}
            placeholder="Song title"
            className="ui-input"
            maxLength={200}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-fieldLabel">Artist</span>
          <input
            value={form.artist}
            onChange={(event) => onFieldChange("artist", event.target.value)}
            placeholder="Artist"
            className="ui-input"
            maxLength={200}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-fieldLabel">Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(event) => onFieldChange("date", event.target.value)}
            className="ui-input"
            required
          />
        </label>

        <div className="ui-searchMeta">
          Live Spotify search is enabled for song and artist.
        </div>

        {spotifyLoading ? (
          <div className="ui-searchMeta">Searching Spotify...</div>
        ) : null}

        {!spotifyLoading && spotifyResults.length > 0 ? (
          <div className="ui-searchResults">
            {spotifyResults.map((track) => (
              <button
                key={track.id}
                type="button"
                className="ui-searchRow"
                onClick={() => onApplySuggestion(track)}
                title={track.externalUrl || "Spotify match"}
              >
                <span className="ui-searchPrimary">{track.title}</span>
                <span className="ui-searchSecondary">
                  {Array.isArray(track.artists) ? track.artists.join(", ") : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedSpotifyTrackId ? (
          <div className="ui-searchMeta">
            Spotify match selected. Track ID and artist ID will be saved.
          </div>
        ) : null}

        {spotifyError ? <div className="ui-errorInline">{spotifyError}</div> : null}
        {submitError ? <div className="ui-errorInline">{submitError}</div> : null}

        <div className="ui-actionRow">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Send"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
