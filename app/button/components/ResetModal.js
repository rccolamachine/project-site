"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postCounterReset } from "../buttonApi";
import { forceGrayscale2D } from "../cameraUtils";
import styles from "../button.module.css";

function buildFallbackEntry({ name, photoDataUrl, beforeValue }) {
  return {
    id: `local-${Date.now()}`,
    name,
    photoDataUrl,
    resetAt: new Date().toISOString(),
    beforeValue,
  };
}

export default function ResetModal({ isOpen, currentValue, onClose, onSubmitted }) {
  const [resetName, setResetName] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [snapDataUrl, setSnapDataUrl] = useState("");

  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const snapCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const resetFormState = () => {
    setResetName("");
    setResetBusy(false);
    setResetError("");
    setCameraError("");
    setSnapDataUrl("");
  };

  const requestClose = useCallback(() => {
    if (resetBusy) return;
    onClose?.();
  }, [onClose, resetBusy]);

  useEffect(() => {
    if (!isOpen) return;
    resetFormState();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let videoEl = null;

    const startCamera = async () => {
      try {
        setCameraError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error("Video element unavailable.");
        videoEl = video;
        video.srcObject = stream;

        await video.play();

        const live = liveCanvasRef.current;
        if (!live) throw new Error("Live canvas unavailable.");

        const ctx = live.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });

        const draw = () => {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;

          const tinyW = 64;
          const tinyH = Math.max(1, Math.round((tinyW * vh) / vw));

          live.width = tinyW;
          live.height = tinyH;

          ctx.filter = "none";
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(video, 0, 0, tinyW, tinyH);

          forceGrayscale2D(ctx, tinyW, tinyH);

          rafRef.current = requestAnimationFrame(draw);
        };

        rafRef.current = requestAnimationFrame(draw);
      } catch (error) {
        setCameraError(
          error?.name === "NotAllowedError"
            ? "Camera permission denied."
            : `Camera error: ${error?.message || String(error)}`,
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoEl) {
        try {
          videoEl.pause?.();
        } catch {
          // Keep teardown safe across browser variants.
        }
        videoEl.srcObject = null;
      }
    };
  }, [isOpen]);

  const handleSnap = () => {
    const live = liveCanvasRef.current;
    const snap = snapCanvasRef.current;
    if (!live?.width || !live?.height || !snap) return;

    const outW = 256;
    const outH = Math.round((outW * live.height) / live.width);

    snap.width = outW;
    snap.height = outH;

    const snapCtx = snap.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });

    snapCtx.filter = "none";
    snapCtx.imageSmoothingEnabled = false;
    snapCtx.clearRect(0, 0, outW, outH);
    snapCtx.drawImage(live, 0, 0, outW, outH);

    forceGrayscale2D(snapCtx, outW, outH);

    setSnapDataUrl(snap.toDataURL("image/png"));
    setResetError("");
  };

  const handleDiscard = () => {
    setSnapDataUrl("");
  };

  const canSubmitReset =
    !resetBusy && !cameraError && resetName.trim().length > 0 && !!snapDataUrl;

  const submitReset = async () => {
    const name = resetName.trim();
    if (!name) {
      setResetError("Name is required.");
      return;
    }

    if (!snapDataUrl) {
      setResetError("Photo is required. Click Snap.");
      return;
    }

    if (cameraError) {
      setResetError("Camera is not available.");
      return;
    }

    setResetBusy(true);
    setResetError("");

    const beforeValue = Number(currentValue ?? 0);

    try {
      const result = await postCounterReset({ name, photoDataUrl: snapDataUrl });
      const fallbackEntry = buildFallbackEntry({
        name,
        photoDataUrl: snapDataUrl,
        beforeValue,
      });
      const entry = result?.entry ? result.entry : fallbackEntry;

      onSubmitted?.(entry);
      resetFormState();
      onClose?.();
    } catch (error) {
      setResetError(error?.message || String(error));
      setResetBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={styles.modalOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div className={styles.modalPanel} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeaderRow}>
          <h2 className={styles.modalTitle}>Confirm Reset</h2>
          <div className={styles.modalHeaderMeta}>
            You are resetting value <strong>{Number(currentValue ?? 0)}</strong>
          </div>
          <button className="btn" onClick={requestClose} disabled={resetBusy}>
            Close
          </button>
        </div>

        <div className={styles.modalGrid}>
          <div className="card">
            <div className={styles.modalSectionLabel}>Pixelated camera (grayscale)</div>

            <video ref={videoRef} playsInline muted className={styles.hiddenVideo} />

            <div className={styles.cameraFrame}>
              <canvas
                ref={liveCanvasRef}
                className={styles.liveCanvas}
                style={{
                  filter: "grayscale(1)",
                  WebkitFilter: "grayscale(1)",
                }}
              />
            </div>

            <canvas ref={snapCanvasRef} className={styles.hiddenCanvas} />

            <div className={styles.modalActionsRow}>
              <button
                className={`btn ${styles.modalPrimaryAction}`}
                onClick={handleSnap}
                disabled={resetBusy || !!cameraError}
              >
                Snap
              </button>
              <button
                className={`btn ${styles.modalPrimaryAction}`}
                onClick={handleDiscard}
                disabled={resetBusy || !snapDataUrl}
              >
                Discard
              </button>
            </div>

            {cameraError ? <div className={styles.modalError}>{cameraError}</div> : null}

            {snapDataUrl ? (
              <div className={styles.previewShell}>
                <div className={styles.previewLabel}>Snapshot preview</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={snapDataUrl}
                  alt="snapshot preview"
                  className={styles.previewImage}
                />
              </div>
            ) : (
              <div className={styles.previewRequired}>Photo required. Click Snap.</div>
            )}
          </div>

          <div className="card">
            <div className={styles.modalSectionLabel}>Your name (required)</div>

            <label className={styles.inputGrid}>
              <span className={styles.inputLabel}>Name</span>
              <input
                value={resetName}
                onChange={(event) => {
                  setResetName(event.target.value);
                  if (resetError) setResetError("");
                }}
                placeholder="Your name"
                className={styles.nameInput}
                disabled={resetBusy}
              />
            </label>

            {resetError ? <div className={styles.modalError}>{resetError}</div> : null}

            <div className={styles.modalFooterActions}>
              <button className="btn" onClick={requestClose} disabled={resetBusy}>
                Cancel
              </button>
              <button
                className={`btn ${styles.modalSubmit}`}
                onClick={submitReset}
                disabled={!canSubmitReset}
                title={
                  !snapDataUrl
                    ? "Snap a photo first"
                    : !resetName.trim()
                      ? "Enter your name"
                      : cameraError
                        ? "Fix camera permissions"
                        : ""
                }
              >
                {resetBusy ? "Submitting..." : "Submit and Reset"}
              </button>
            </div>

            <div className={styles.modalFootnote}>
              This will reset the shared counter to 0 and post your card on the wall.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
