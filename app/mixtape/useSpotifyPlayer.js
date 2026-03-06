"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYER_LOADING_RETRY_MESSAGE } from "./mixtapeConstants";
import {
  getTrackIdFromSpotifyUri,
  toSpotifyTrackUri,
} from "./mixtapeUtils";

export default function useSpotifyPlayer() {
  const [currentTrackId, setCurrentTrackId] = useState("");
  const [currentContextLabel, setCurrentContextLabel] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  const playerMountRef = useRef(null);
  const embedControllerRef = useRef(null);
  const pendingTrackIdRef = useRef("");
  const playRetryTimerRef = useRef(null);
  const playbackSnapshotRef = useRef({
    isPaused: true,
    uri: "",
  });

  const isBootstrappingError =
    !isReady && playbackError === PLAYER_LOADING_RETRY_MESSAGE;

  const clearRetryTimer = useCallback(() => {
    if (!playRetryTimerRef.current) return;
    clearTimeout(playRetryTimerRef.current);
    playRetryTimerRef.current = null;
  }, []);

  const clearPlaybackError = useCallback(() => {
    setPlaybackError("");
  }, []);

  const showPlaybackError = useCallback((message) => {
    setPlaybackError(String(message || "").trim());
  }, []);

  const playTrackById = useCallback(
    (spotifyTrackId, contextLabel = "") => {
      if (!spotifyTrackId) {
        setPlaybackError("This row is missing a valid Spotify track ID.");
        return false;
      }

      setPlaybackError("");
      pendingTrackIdRef.current = spotifyTrackId;
      setCurrentTrackId(spotifyTrackId);
      setCurrentContextLabel(String(contextLabel || "").trim());

      const embedController = embedControllerRef.current;
      if (!embedController) {
        setPlaybackError(PLAYER_LOADING_RETRY_MESSAGE);
        return false;
      }

      try {
        clearRetryTimer();

        const targetUri = toSpotifyTrackUri(spotifyTrackId);
        const attemptPlay = () => {
          if (typeof embedController.play === "function") {
            embedController.play();
          } else if (typeof embedController.resume === "function") {
            embedController.resume();
          }
        };

        embedController.loadUri(targetUri);
        attemptPlay();

        playRetryTimerRef.current = setTimeout(() => {
          const snapshot = playbackSnapshotRef.current;
          const snapshotTrackId = getTrackIdFromSpotifyUri(snapshot?.uri || "");
          if (snapshotTrackId !== spotifyTrackId || snapshot?.isPaused) {
            try {
              attemptPlay();
            } catch {
              // Keep the initial playback path as the source of truth.
            }
          }
        }, 260);

        return true;
      } catch (err) {
        setPlaybackError(
          err?.message ||
            "Could not auto-play. Press play in the Spotify mini player.",
        );
        return false;
      }
    },
    [clearRetryTimer],
  );

  const closePlayer = useCallback(() => {
    const embedController = embedControllerRef.current;

    try {
      if (typeof embedController?.pause === "function") {
        embedController.pause();
      }
    } catch {
      // Best effort pause.
    }

    clearRetryTimer();
    pendingTrackIdRef.current = "";
    setCurrentTrackId("");
    setCurrentContextLabel("");
    setPlaybackError("");
  }, [clearRetryTimer]);

  useEffect(() => {
    let cancelled = false;
    let apiScript = null;

    const initEmbedController = (iframeApi) => {
      if (
        cancelled ||
        !iframeApi ||
        typeof iframeApi.createController !== "function" ||
        !playerMountRef.current ||
        embedControllerRef.current
      ) {
        return;
      }

      iframeApi.createController(
        playerMountRef.current,
        { width: "100%", height: "80" },
        (embedController) => {
          if (cancelled) {
            if (typeof embedController?.destroy === "function") {
              embedController.destroy();
            }
            return;
          }

          embedControllerRef.current = embedController;
          setIsReady(true);

          if (typeof embedController?.addListener === "function") {
            embedController.addListener("playback_update", (event) => {
              const data = event?.data || {};
              const playingTrackId = getTrackIdFromSpotifyUri(data?.uri || "");
              if (playingTrackId) {
                setCurrentTrackId(playingTrackId);
              }

              playbackSnapshotRef.current = {
                isPaused: Boolean(data?.isPaused),
                uri: String(data?.uri || ""),
              };
            });
          }

          const pendingTrackId = pendingTrackIdRef.current;
          if (!pendingTrackId) return;

          try {
            const uri = toSpotifyTrackUri(pendingTrackId);
            embedController.loadUri(uri);

            const retry = () => {
              clearRetryTimer();
              playRetryTimerRef.current = setTimeout(() => {
                try {
                  if (typeof embedController.play === "function") {
                    embedController.play();
                  } else if (typeof embedController.resume === "function") {
                    embedController.resume();
                  }
                } catch {
                  // Best effort retry after embed init.
                }
              }, 260);
            };

            if (typeof embedController.play === "function") {
              embedController.play();
              retry();
            } else if (typeof embedController.resume === "function") {
              embedController.resume();
              retry();
            }
          } catch {
            // The click path surfaces the actionable error message.
          }
        },
      );
    };

    const previousOnReady = window.onSpotifyIframeApiReady;
    const onSpotifyIframeApiReady = (iframeApi) => {
      if (typeof previousOnReady === "function") {
        previousOnReady(iframeApi);
      }
      initEmbedController(iframeApi);
    };

    window.onSpotifyIframeApiReady = onSpotifyIframeApiReady;

    if (window.SpotifyIframeApi?.createController) {
      initEmbedController(window.SpotifyIframeApi);
    } else {
      const existingScript = document.getElementById("spotify-iframe-api");
      if (existingScript) {
        apiScript = existingScript;
      } else {
        apiScript = document.createElement("script");
        apiScript.id = "spotify-iframe-api";
        apiScript.src = "https://open.spotify.com/embed/iframe-api/v1";
        apiScript.async = true;
        document.body.appendChild(apiScript);
      }

      const onScriptLoad = () => {
        if (window.SpotifyIframeApi?.createController) {
          initEmbedController(window.SpotifyIframeApi);
        }
      };

      apiScript.addEventListener("load", onScriptLoad);

      return () => {
        cancelled = true;
        apiScript?.removeEventListener("load", onScriptLoad);
        if (window.onSpotifyIframeApiReady === onSpotifyIframeApiReady) {
          window.onSpotifyIframeApiReady = previousOnReady;
        }
        if (embedControllerRef.current?.destroy) {
          embedControllerRef.current.destroy();
        }
        embedControllerRef.current = null;
        setIsReady(false);
      };
    }

    return () => {
      cancelled = true;
      if (window.onSpotifyIframeApiReady === onSpotifyIframeApiReady) {
        window.onSpotifyIframeApiReady = previousOnReady;
      }
      if (embedControllerRef.current?.destroy) {
        embedControllerRef.current.destroy();
      }
      embedControllerRef.current = null;
      setIsReady(false);
    };
  }, [clearRetryTimer]);

  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  return {
    clearPlaybackError,
    closePlayer,
    currentContextLabel,
    currentTrackId,
    isBootstrappingError,
    isReady,
    playbackError,
    playerMountRef,
    playTrackById,
    showPlaybackError,
  };
}
