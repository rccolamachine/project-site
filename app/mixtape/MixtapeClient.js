"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddSongModal from "./components/AddSongModal";
import DeleteSongModal from "./components/DeleteSongModal";
import MixtapePlayerCard from "./components/MixtapePlayerCard";
import PlaylistPanel from "./components/PlaylistPanel";
import SongInfoModal from "./components/SongInfoModal";
import WakeupLogPanel from "./components/WakeupLogPanel";
import {
  createSongEntry,
  deleteSongEntry,
  fetchSongsList,
  fetchSpotifyPlaylistPage,
  lookupSpotifyTrack,
  searchSpotifyTracks,
} from "./mixtapeApi";
import {
  CLIENT_SHOW_FULL_MIXTAPE_PANEL,
  CLIENT_SPOTIFY_MOCK_MODE,
  CLIENT_SPOTIFY_MOCK_TOTAL,
  MIXTAPE_PLAYLIST_ID,
  PLAYLIST_PAGE_SIZE,
} from "./mixtapeConstants";
import styles from "./mixtape.module.css";
import useSpotifyPlayer from "./useSpotifyPlayer";
import {
  formatArtistList,
  formatSongDate,
  getSpotifyTrackIdFromEntry,
  initialFormState,
  promptForCredentials,
} from "./mixtapeUtils";

function createInfoTargetFromTrack(track, listNumber = 0) {
  return {
    title: track?.title || "",
    artist: formatArtistList(track?.artists || track?.artist),
    date: track?.date || "",
    spotifyTrackId: getSpotifyTrackIdFromEntry(track),
    mixtapeListNumber:
      Number.isFinite(Number(listNumber)) && Number(listNumber) > 0
        ? Number(listNumber)
        : 0,
  };
}

export default function MixtapeClient() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(initialFormState);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [selectedSpotifyIds, setSelectedSpotifyIds] = useState({
    trackId: "",
    artistId: "",
  });

  const [infoTarget, setInfoTarget] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState("");
  const [infoDetails, setInfoDetails] = useState(null);

  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState("");
  const [playlistOffset, setPlaylistOffset] = useState(0);
  const [playlistTotal, setPlaylistTotal] = useState(0);
  const [playlistHasMore, setPlaylistHasMore] = useState(true);
  const [playlistRandomLoading, setPlaylistRandomLoading] = useState(false);

  const clickTimerRef = useRef(null);
  const playlistBodyRef = useRef(null);
  const playlistDidInitRef = useRef(false);

  const {
    clearPlaybackError,
    closePlayer,
    currentContextLabel,
    currentListNumber,
    currentTrackId,
    isBootstrappingError,
    playbackError,
    playerMountRef,
    playTrackById,
    showPlaybackError,
  } = useSpotifyPlayer();

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const items = await fetchSongsList();
      setSongs(items);
    } catch (err) {
      setSongs([]);
      setLoadError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const fetchPlaylistPage = useCallback(
    async ({ reset = false } = {}) => {
      if (playlistLoading) return;
      if (!reset && !playlistHasMore) return;

      setPlaylistLoading(true);
      setPlaylistError("");

      try {
        if (reset) {
          const meta = await fetchSpotifyPlaylistPage({
            playlistId: MIXTAPE_PLAYLIST_ID,
            offset: 0,
            limit: 1,
          });

          const total = Number(meta?.total || 0);
          if (total <= 0) {
            setPlaylistTracks([]);
            setPlaylistTotal(0);
            setPlaylistOffset(0);
            setPlaylistHasMore(false);
            return;
          }

          const chunkSize = Math.min(PLAYLIST_PAGE_SIZE, total);
          const requestOffset = Math.max(0, total - chunkSize);
          const page = await fetchSpotifyPlaylistPage({
            playlistId: MIXTAPE_PLAYLIST_ID,
            offset: requestOffset,
            limit: chunkSize,
          });

          const nextItems = [...(Array.isArray(page?.items) ? page.items : [])].reverse();

          setPlaylistTracks(nextItems);
          setPlaylistTotal(total);
          setPlaylistOffset(requestOffset);
          setPlaylistHasMore(requestOffset > 0 && nextItems.length > 0);
          return;
        }

        if (playlistOffset <= 0) {
          setPlaylistHasMore(false);
          return;
        }

        const chunkSize = Math.min(PLAYLIST_PAGE_SIZE, playlistOffset);
        const requestOffset = Math.max(0, playlistOffset - chunkSize);
        const page = await fetchSpotifyPlaylistPage({
          playlistId: MIXTAPE_PLAYLIST_ID,
          offset: requestOffset,
          limit: chunkSize,
        });

        const nextItems = [...(Array.isArray(page?.items) ? page.items : [])].reverse();
        const total = Number(page?.total || playlistTotal || 0);

        setPlaylistTracks((prev) => [...prev, ...nextItems]);
        setPlaylistTotal(total);
        setPlaylistOffset(requestOffset);
        setPlaylistHasMore(requestOffset > 0 && nextItems.length > 0);
      } catch (err) {
        if (reset) {
          setPlaylistTracks([]);
          setPlaylistOffset(0);
          setPlaylistTotal(0);
          setPlaylistHasMore(false);
        }
        setPlaylistError(err?.message || String(err));
      } finally {
        setPlaylistLoading(false);
      }
    },
    [playlistHasMore, playlistLoading, playlistOffset, playlistTotal],
  );

  useEffect(() => {
    if (!CLIENT_SHOW_FULL_MIXTAPE_PANEL) return;
    if (playlistDidInitRef.current) return;

    playlistDidInitRef.current = true;
    fetchPlaylistPage({ reset: true });
  }, [fetchPlaylistPage]);

  useEffect(() => {
    if (playlistLoading || !playlistHasMore || playlistError) return;
    const node = playlistBodyRef.current;
    if (!node) return;
    if (node.scrollHeight <= node.clientHeight + 8) {
      fetchPlaylistPage();
    }
  }, [
    fetchPlaylistPage,
    playlistError,
    playlistHasMore,
    playlistLoading,
    playlistTracks.length,
  ]);

  const handlePlaylistScroll = useCallback(
    (event) => {
      if (playlistLoading || !playlistHasMore || playlistError) return;

      const node = event.currentTarget;
      if (node.scrollHeight - node.scrollTop - node.clientHeight <= 80) {
        fetchPlaylistPage();
      }
    },
    [fetchPlaylistPage, playlistError, playlistHasMore, playlistLoading],
  );

  useEffect(() => {
    if (!isAddModalOpen && !deleteTarget && !infoTarget) return;

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setIsAddModalOpen(false);
      setDeleteTarget(null);
      setInfoTarget(null);
      setSubmitError("");
      setDeleteError("");
      setInfoError("");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, infoTarget, isAddModalOpen]);

  useEffect(
    () => () => {
      if (!clickTimerRef.current) return;
      clearTimeout(clickTimerRef.current);
    },
    [],
  );

  const playlistReadout = useMemo(() => {
    if (playlistLoading && playlistTracks.length === 0) {
      return "Loading playlist tracks...";
    }

    if (!playlistTracks.length) return "Showing 0 tracks";
    if (playlistHasMore) {
      return `Showing ${playlistTracks.length} of ${playlistTotal} (scroll for more)`;
    }

    return `Showing ${playlistTracks.length} of ${playlistTotal}`;
  }, [playlistHasMore, playlistLoading, playlistTotal, playlistTracks.length]);

  const closeAddSongModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSubmitError("");
    setSpotifyError("");
    setSpotifyResults([]);
    setSpotifyLoading(false);
    setSelectedSpotifyIds({ trackId: "", artistId: "" });
    setForm(initialFormState());
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError("");
  }, []);

  const closeInfoModal = useCallback(() => {
    setInfoTarget(null);
    setInfoLoading(false);
    setInfoError("");
    setInfoDetails(null);
  }, []);

  const openSongInfo = useCallback((target) => {
    setIsAddModalOpen(false);
    setDeleteTarget(null);
    setSubmitError("");
    setDeleteError("");
    setInfoTarget(target);
  }, []);

  const openAddSongModal = useCallback(() => {
    closeInfoModal();
    closeDeleteModal();
    setSubmitError("");
    setForm(initialFormState());
    setSelectedSpotifyIds({ trackId: "", artistId: "" });
    setIsAddModalOpen(true);
  }, [closeDeleteModal, closeInfoModal]);

  const handleFormFieldChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "title" || field === "artist") {
      setSelectedSpotifyIds({ trackId: "", artistId: "" });
    }
  }, []);

  const submitSong = useCallback(
    async (event) => {
      event.preventDefault();
      setSubmitError("");

      const title = form.title.trim();
      const artist = form.artist.trim();
      const date = form.date.trim();

      if (!title || !artist || !date) {
        setSubmitError("Title, artist, and date are required.");
        return;
      }

      const credentials = promptForCredentials();
      if (credentials.cancelled) return;
      if (credentials.error) {
        setSubmitError(credentials.error);
        return;
      }

      setSubmitting(true);

      try {
        await createSongEntry({
          username: credentials.username,
          password: credentials.password,
          title,
          artist,
          date,
          spotifyTrackId: selectedSpotifyIds.trackId,
          spotifyArtistId: selectedSpotifyIds.artistId,
        });

        closeAddSongModal();
        await fetchSongs();
      } catch (err) {
        setSubmitError(err?.message || String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [
      closeAddSongModal,
      fetchSongs,
      form.artist,
      form.date,
      form.title,
      selectedSpotifyIds.artistId,
      selectedSpotifyIds.trackId,
    ],
  );

  const deleteSong = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleteError("");
    const credentials = promptForCredentials();
    if (credentials.cancelled) return;
    if (credentials.error) {
      setDeleteError(credentials.error);
      return;
    }

    setDeleting(true);

    try {
      await deleteSongEntry({
        id: deleteTarget.id,
        username: credentials.username,
        password: credentials.password,
      });

      closeDeleteModal();
      await fetchSongs();
    } catch (err) {
      setDeleteError(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }, [closeDeleteModal, deleteTarget, fetchSongs]);

  const applySpotifySuggestion = useCallback((track) => {
    if (!track) return;

    setForm((prev) => ({
      ...prev,
      title: String(track.title || "").trim() || prev.title,
      artist: formatArtistList(track.artists) || prev.artist,
    }));

    setSelectedSpotifyIds({
      trackId: String(track.id || "").trim(),
      artistId: String(track.artistIds?.[0] || "").trim(),
    });
    setSpotifyError("");
    setSpotifyResults([]);
  }, []);

  useEffect(() => {
    if (!isAddModalOpen) return;

    const query = [form.title.trim(), form.artist.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (query.length < 2) {
      setSpotifyError("");
      setSpotifyResults([]);
      setSpotifyLoading(false);
      return;
    }

    const controller = new AbortController();
    const timerId = setTimeout(async () => {
      try {
        setSpotifyLoading(true);
        setSpotifyError("");

        const tracks = await searchSpotifyTracks({
          query,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setSpotifyResults(tracks);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSpotifyResults([]);
        setSpotifyError(err?.message || String(err));
      } finally {
        if (!controller.signal.aborted) {
          setSpotifyLoading(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [form.artist, form.title, isAddModalOpen]);

  useEffect(() => {
    if (!infoTarget) return;

    const controller = new AbortController();

    (async () => {
      try {
        setInfoLoading(true);
        setInfoError("");
        setInfoDetails(null);

        const item = await lookupSpotifyTrack({
          trackId: infoTarget.spotifyTrackId,
          title: infoTarget.title,
          artist: infoTarget.artist,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setInfoDetails(item);
      } catch (err) {
        if (controller.signal.aborted) return;
        setInfoError(err?.message || String(err));
      } finally {
        if (!controller.signal.aborted) {
          setInfoLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [infoTarget]);

  const handleLogRowClick = useCallback(
    (song) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      clickTimerRef.current = setTimeout(() => {
        openSongInfo(song);
      }, 220);
    },
    [openSongInfo],
  );

  const handleLogRowDoubleClick = useCallback((song) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    setIsAddModalOpen(false);
    setInfoTarget(null);
    setSubmitError("");
    setDeleteError("");
    setDeleteTarget(song);
  }, []);

  const resolveTrackIdForPlayback = useCallback(async (track) => {
    if (!track) return "";

    const directTrackId = getSpotifyTrackIdFromEntry(track);
    if (directTrackId) return directTrackId;

    const item = await lookupSpotifyTrack({
      title: String(track.title || ""),
      artist: formatArtistList(track.artists || track.artist),
    });

    return String(item?.trackId || "").trim();
  }, []);

  const handlePlaylistPlayClick = useCallback(
    async (track, listNumber, event) => {
      event.stopPropagation();
      if (!track) return;

      try {
        const trackId = await resolveTrackIdForPlayback(track);
        if (!trackId) {
          throw new Error("Could not resolve a playable Spotify track ID.");
        }

        playTrackById(trackId, listNumber);
      } catch (err) {
        showPlaybackError(
          err?.message || "Could not resolve a playable Spotify track ID.",
        );
      }
    },
    [playTrackById, resolveTrackIdForPlayback, showPlaybackError],
  );

  const handlePlayFromInfoModal = useCallback(() => {
    const trackId = String(
      infoDetails?.trackId || infoTarget?.spotifyTrackId || "",
    ).trim();

    if (!trackId) {
      setInfoError(
        "Spotify track ID is not available yet. Wait for details to load.",
      );
      return;
    }

    const listNumber = Number(infoTarget?.mixtapeListNumber || 0);
    const contextLabel =
      listNumber > 0 ? "" : formatSongDate(infoTarget?.date || "");

    setInfoError("");
    playTrackById(trackId, listNumber, contextLabel);
  }, [infoDetails, infoTarget, playTrackById]);

  const handleWakeupPlayClick = useCallback(
    async (song, event) => {
      event.stopPropagation();
      if (!song) return;

      try {
        const trackId = await resolveTrackIdForPlayback(song);
        if (!trackId) {
          throw new Error("Could not resolve a playable Spotify track ID.");
        }

        playTrackById(trackId, 0, formatSongDate(song?.date || ""));
      } catch (err) {
        showPlaybackError(
          err?.message || "Could not resolve a playable Spotify track ID.",
        );
      }
    },
    [playTrackById, resolveTrackIdForPlayback, showPlaybackError],
  );

  const playTrackByListNumber = useCallback(
    async (listNumber) => {
      if (playlistTotal <= 0) {
        showPlaybackError("Playlist is still loading. Try again.");
        return false;
      }

      const parsedListNumber = Number(listNumber);
      if (
        !Number.isFinite(parsedListNumber) ||
        parsedListNumber < 1 ||
        parsedListNumber > playlistTotal
      ) {
        showPlaybackError("No next track found in the playlist.");
        return false;
      }

      const offset = Math.max(0, playlistTotal - parsedListNumber);
      const page = await fetchSpotifyPlaylistPage({
        playlistId: MIXTAPE_PLAYLIST_ID,
        offset,
        limit: 1,
      });

      const track = Array.isArray(page?.items) ? page.items[0] : null;
      const trackId = await resolveTrackIdForPlayback(track);

      if (!trackId) {
        throw new Error("Could not resolve a playable Spotify track ID.");
      }

      return Boolean(playTrackById(trackId, parsedListNumber));
    },
    [playTrackById, playlistTotal, resolveTrackIdForPlayback, showPlaybackError],
  );

  const handlePlayRandomTrack = useCallback(async () => {
    if (playlistTotal <= 0) return;

    const randomListNumber = Math.floor(Math.random() * playlistTotal) + 1;
    setPlaylistRandomLoading(true);
    clearPlaybackError();

    try {
      await playTrackByListNumber(randomListNumber);
    } catch (err) {
      showPlaybackError(err?.message || "Failed to pick a random track.");
    } finally {
      setPlaylistRandomLoading(false);
    }
  }, [clearPlaybackError, playTrackByListNumber, playlistTotal, showPlaybackError]);

  const handlePlaylistRowClick = useCallback(
    (track, listNumber = 0) => {
      if (!track) return;
      openSongInfo(createInfoTargetFromTrack(track, listNumber));
      clearPlaybackError();
    },
    [clearPlaybackError, openSongInfo],
  );

  return (
    <section className="page">
      <header className={styles.pageHeader}>
        <h1>Mixtape</h1>
        <p className="lede">
          Most days, I wake up with a song in my head. These are those songs.
        </p>
        {CLIENT_SPOTIFY_MOCK_MODE ? (
          <div className={`ui-searchMeta ${styles.headerMeta}`}>
            Spotify mock mode enabled ({CLIENT_SPOTIFY_MOCK_TOTAL} tracks).
          </div>
        ) : null}
      </header>

      <MixtapePlayerCard
        currentContextLabel={currentContextLabel}
        currentListNumber={currentListNumber}
        currentTrackId={currentTrackId}
        isBootstrappingError={isBootstrappingError}
        playbackError={playbackError}
        playerMountRef={playerMountRef}
        onClose={closePlayer}
      />

      {CLIENT_SHOW_FULL_MIXTAPE_PANEL ? (
        <PlaylistPanel
          isBootstrappingError={isBootstrappingError}
          loading={playlistLoading}
          onPlayRandom={handlePlayRandomTrack}
          onRowClick={handlePlaylistRowClick}
          onRowPlay={handlePlaylistPlayClick}
          onScroll={handlePlaylistScroll}
          playbackError={playbackError}
          playerTrackId={currentTrackId}
          playlistBodyRef={playlistBodyRef}
          playlistError={playlistError}
          playlistRandomLoading={playlistRandomLoading}
          playlistReadout={playlistReadout}
          playlistTotal={playlistTotal}
          tracks={playlistTracks}
        />
      ) : null}

      <WakeupLogPanel
        loading={loading}
        onAddSong={openAddSongModal}
        onRowClick={handleLogRowClick}
        onRowDoubleClick={handleLogRowDoubleClick}
        onRowPlay={handleWakeupPlayClick}
        songs={songs}
      />

      {loadError ? (
        <div className={`card ui-errorCard ${styles.loadErrorCard}`}>
          <div>Failed to load songs.</div>
          <div className="ui-errorDetail">{loadError}</div>
        </div>
      ) : null}

      <AddSongModal
        form={form}
        isOpen={isAddModalOpen}
        onApplySuggestion={applySpotifySuggestion}
        onClose={closeAddSongModal}
        onFieldChange={handleFormFieldChange}
        onSubmit={submitSong}
        selectedSpotifyTrackId={selectedSpotifyIds.trackId}
        spotifyError={spotifyError}
        spotifyLoading={spotifyLoading}
        spotifyResults={spotifyResults}
        submitError={submitError}
        submitting={submitting}
      />

      <DeleteSongModal
        deleting={deleting}
        deleteError={deleteError}
        deleteTarget={deleteTarget}
        onClose={closeDeleteModal}
        onDelete={deleteSong}
      />

      <SongInfoModal
        infoDetails={infoDetails}
        infoError={infoError}
        infoLoading={infoLoading}
        infoTarget={infoTarget}
        onClose={closeInfoModal}
        onPlay={handlePlayFromInfoModal}
      />
    </section>
  );
}
