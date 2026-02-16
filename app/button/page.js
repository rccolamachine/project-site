"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.25)",
  color: "#eaeaea",
  outline: "none",
};

async function fetchState() {
  const r = await fetch("/api/counter/state", { cache: "no-store" });
  if (!r.ok)
    throw new Error(await r.text().catch(() => "Failed to fetch state"));
  return r.json();
}

function normalizeShame(shame) {
  const arr = Array.isArray(shame) ? shame : [];
  return arr
    .map((x) => {
      if (!x) return null;
      if (typeof x === "string") {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      }
      return x;
    })
    .filter(Boolean);
}

/**
 * iOS Safari often ignores ctx.filter="grayscale(1)" for video->canvas.
 * So we force grayscale by converting pixels in-place.
 */
function toGrayInPlace(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // perceptual luma (good-looking grayscale)
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    d[i] = y;
    d[i + 1] = y;
    d[i + 2] = y;
    // alpha unchanged
  }
}

function forceGrayscale2D(ctx, w, h) {
  if (!ctx || !w || !h) return;
  try {
    const img = ctx.getImageData(0, 0, w, h);
    toGrayInPlace(img);
    ctx.putImageData(img, 0, 0);
  } catch {
    // If getImageData fails for any reason, do nothing.
    // (It should not fail for getUserMedia video, but keep it safe.)
  }
}

export default function ButtonGamePage() {
  // shared state from server
  const [value, setValue] = useState(0);
  const [max, setMax] = useState(0);
  const [maxAt, setMaxAt] = useState("");
  const [shame, setShame] = useState([]);

  const [err, setErr] = useState("");

  // optimistic local batching
  const pendingRef = useRef(0);
  const timerRef = useRef(null);
  const [pendingUi, setPendingUi] = useState(0);
  const [lastClickAt, setLastClickAt] = useState("");

  // state sync dedupe/cooldown
  const stateInFlightRef = useRef(null);
  const lastStateAtRef = useRef(0);

  // reset modal
  const [showReset, setShowReset] = useState(false);
  const [resetName, setResetName] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [snapDataUrl, setSnapDataUrl] = useState("");

  // camera
  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const snapCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const displayValue = useMemo(() => value + pendingUi, [value, pendingUi]);

  const applyState = useCallback((s) => {
    setValue(Number(s?.value ?? 0));
    setMax(Number(s?.max ?? 0));
    setMaxAt(String(s?.maxAt ?? ""));
    setLastClickAt(String(s?.lastClickAt ?? ""));
    setShame(normalizeShame(s?.shame));
  }, []);

  const syncState = useCallback(
    async (opts = {}) => {
      const { force = false, minGapMs = 2000 } = opts;
      const now = Date.now();

      if (!force && now - lastStateAtRef.current < minGapMs) return;
      if (stateInFlightRef.current) return stateInFlightRef.current;

      stateInFlightRef.current = (async () => {
        lastStateAtRef.current = Date.now();
        const s = await fetchState();
        applyState(s);
        setErr("");
        return s;
      })()
        .catch((e) => {
          setErr(e?.message || String(e));
          throw e;
        })
        .finally(() => {
          stateInFlightRef.current = null;
        });

      return stateInFlightRef.current;
    },
    [applyState],
  );

  // initial load + light polling (deduped + only when visible)
  useEffect(() => {
    let alive = true;

    const load = async (force = false) => {
      try {
        if (!alive) return;
        await syncState({ force, minGapMs: 1500 });
      } catch {
        // err already set
      }
    };

    load(true);

    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load(false);
    }, 15000);

    const onVis = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [syncState]);

  // batching flush
  const flushIncrements = async () => {
    const delta = pendingRef.current;
    if (!delta) return;

    pendingRef.current = 0;
    setPendingUi(0);

    try {
      const r = await fetch("/api/counter/increment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (!r.ok)
        throw new Error(
          await r.text().catch(() => `Increment failed (${r.status})`),
        );
      const j = await r.json();
      setValue(Number(j.value ?? 0));
      setMax(Number(j.max ?? 0));
      setMaxAt(String(j.maxAt ?? ""));
      setLastClickAt(String(j.lastClickAt ?? ""));
      setErr("");
    } catch (e) {
      setErr(e?.message || String(e));
      try {
        await syncState({ force: true });
      } catch {}
    }
  };

  const handleIncrement = () => {
    setErr("");
    setLastClickAt(new Date().toISOString());

    pendingRef.current += 1;
    setPendingUi((p) => p + 1);

    if (!timerRef.current) {
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        await flushIncrements();
      }, 5000);
    }
  };

  const openResetModal = async () => {
    // cancel pending increments and revert optimistic UI
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = 0;
    setPendingUi(0);

    // resync before showing modal (deduped)
    try {
      await syncState({ force: true });
    } catch {}

    setResetError("");
    setCameraError("");
    setSnapDataUrl("");
    setResetName("");
    setShowReset(true);
  };

  // camera lifecycle for reset modal
  useEffect(() => {
    if (!showReset) return;

    let cancelled = false;
    let videoEl = null;

    const start = async () => {
      try {
        setCameraError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error("Video element unavailable.");
        videoEl = video;
        video.srcObject = stream;

        // iOS sometimes needs this explicit play
        await video.play();

        const live = liveCanvasRef.current;
        const ctx = live.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });

        const draw = () => {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;

          // tiny canvas for pixel look
          const tinyW = 64;
          const tinyH = Math.max(1, Math.round((tinyW * vh) / vw));

          // set size BEFORE drawing
          live.width = tinyW;
          live.height = tinyH;

          // DO NOT rely on ctx.filter on iOS
          ctx.filter = "none";
          ctx.imageSmoothingEnabled = true; // smooth into tiny
          ctx.drawImage(video, 0, 0, tinyW, tinyH);

          // ✅ GUARANTEED grayscale
          forceGrayscale2D(ctx, tinyW, tinyH);

          rafRef.current = requestAnimationFrame(draw);
        };

        rafRef.current = requestAnimationFrame(draw);
      } catch (e) {
        setCameraError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied."
            : `Camera error: ${e?.message || String(e)}`,
        );
      }
    };

    start();

    return () => {
      cancelled = true;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (videoEl) {
        try {
          videoEl.pause?.();
        } catch {}
        videoEl.srcObject = null;
      }
    };
  }, [showReset]);

  const handleSnap = () => {
    const live = liveCanvasRef.current;
    const snap = snapCanvasRef.current;
    if (!live?.width || !live?.height || !snap) return;

    // Make a slightly larger exported image but still pixelated
    const outW = 256;
    const outH = Math.round((outW * live.height) / live.width);

    snap.width = outW;
    snap.height = outH;

    const sctx = snap.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });

    sctx.filter = "none";
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, outW, outH);

    // draw from live -> snap
    sctx.drawImage(live, 0, 0, outW, outH);

    // ✅ GUARANTEED grayscale export too (in case live ever isn’t)
    forceGrayscale2D(sctx, outW, outH);

    const url = snap.toDataURL("image/png");
    setSnapDataUrl(url);
    setResetError("");
  };

  const handleDiscard = () => {
    setSnapDataUrl("");
  };

  const canSubmitReset =
    !resetBusy && !cameraError && resetName.trim().length > 0 && !!snapDataUrl;

  const submitReset = async () => {
    const name = resetName.trim();
    if (!name) return setResetError("Name is required.");
    if (!snapDataUrl) return setResetError("Photo is required. Click Snap.");
    if (cameraError) return setResetError("Camera is not available.");

    setResetBusy(true);
    setResetError("");

    const before = value;

    try {
      const r = await fetch("/api/counter/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, photoDataUrl: snapDataUrl }),
      });
      if (!r.ok)
        throw new Error(
          await r.text().catch(() => `Reset failed (${r.status})`),
        );
      const j = await r.json();

      // close modal
      setShowReset(false);
      setResetBusy(false);
      setSnapDataUrl("");
      setResetName("");
      setCameraError("");
      setResetError("");

      // immediate UI update
      setValue(0);

      // optimistic shame insert from API (preferred)
      if (j?.entry) {
        setShame((prev) => [j.entry, ...(Array.isArray(prev) ? prev : [])]);
      } else {
        setShame((prev) => [
          {
            id: `local-${Date.now()}`,
            name,
            photoDataUrl: snapDataUrl,
            resetAt: new Date().toISOString(),
            beforeValue: before,
          },
          ...(Array.isArray(prev) ? prev : []),
        ]);
      }

      // resync soon (deduped) to ensure authoritative state
      setTimeout(() => {
        syncState({ force: true }).catch(() => {});
      }, 1200);
    } catch (e) {
      setResetError(e?.message || String(e));
      setResetBusy(false);
    }
  };

  // ESC to close modal
  useEffect(() => {
    if (!showReset) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !resetBusy) setShowReset(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showReset, resetBusy]);

  // Full-bleed helper: breaks out of any centered container
  const fullBleedStyle = {
    width: "100vw",
    marginLeft: "calc(50% - 50vw)",
    marginRight: "calc(50% - 50vw)",
  };

  // Shared inner width
  const innerStyle = {
    width: "min(1100px, 92vw)",
    margin: "0 auto",
  };

  const bigBtnStyle = {
    padding: "18px 22px",
    borderRadius: 18,
    fontSize: 18,
    fontWeight: 800,
    minWidth: 200,
    letterSpacing: 0.2,
  };

  return (
    <section className="page">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>button</h1>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Shared counter for everyone. Batches increments every 5 seconds.
        </div>
      </div>

      {err ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#2a1414",
            border: "1px solid #5a2b2b",
            marginTop: 12,
          }}
        >
          {err}
        </div>
      ) : null}

      {/* FULL-BLEED CONTROLS ROW */}
      <div style={{ ...fullBleedStyle, marginTop: 16 }}>
        <div
          style={{
            padding: "14px 0",
            borderTop: "1px solid rgba(255,255,255,0.10)",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          }}
        >
          <div style={innerStyle}>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                alignItems: "stretch",
              }}
            >
              <button
                className="btn"
                onClick={handleIncrement}
                style={{
                  ...bigBtnStyle,
                  width: "100%",
                  minWidth: 0,
                  justifyContent: "center",
                }}
              >
                Increment <br />
                (Current += 1)
              </button>

              <button
                className="btn"
                onClick={openResetModal}
                style={{
                  ...bigBtnStyle,
                  width: "100%",
                  minWidth: 0,
                  justifyContent: "center",
                }}
              >
                Reset <br />
                (Current = 0)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div style={{ ...innerStyle, marginTop: 14 }}>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignItems: "stretch",
          }}
        >
          <div className="card" style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Current</div>

            <div style={{ fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
              {displayValue}
            </div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              {pendingUi
                ? `pending +${pendingUi}`
                : lastClickAt
                  ? `last increment: ${new Date(lastClickAt).toLocaleString()}`
                  : "—"}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max</div>
            <div style={{ fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
              {max}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              {maxAt ? new Date(maxAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 18 }}>Wall of Shame</h2>
      <div className="grid" style={{ marginTop: 12 }}>
        {shame?.length ? (
          shame.slice(0, 9).map((e, i) => {
            const photo = e.photoDataUrl || e.photo || e.photo_url || "";
            const key = e.id ?? `${e.resetAt ?? "x"}-${i}`;
            return (
              <figure
                key={key}
                className="tile"
                style={{ position: "relative", overflow: "hidden" }}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={`${e.name || "Someone"} reset`} />
                ) : (
                  <div style={{ padding: 16, opacity: 0.8 }}>
                    (no photo returned by API)
                  </div>
                )}

                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-12%",
                    top: "18%",
                    width: "130%",
                    transform: "rotate(-25deg)",
                    textAlign: "center",
                    pointerEvents: "none",

                    color: "#ff2a2a",
                    border: "4px solid #ff2a2a",
                    borderRadius: 10,
                    padding: "10px 0",

                    fontWeight: 900,
                    letterSpacing: 2,
                    fontSize: 25,
                    textTransform: "uppercase",

                    opacity: 10,
                    background: "rgba(0,0,0,0.18)",
                    textShadow: "0 2px 0 rgba(0,0,0,0.55)",
                  }}
                >
                  CLICKED RESET
                </div>

                <figcaption>
                  <div className="capTitle">{e.name || "—"}</div>
                  <div className="capMeta">
                    reset at{" "}
                    {e.resetAt ? new Date(e.resetAt).toLocaleString() : "—"}
                  </div>
                  <div className="capMeta">
                    value before reset:{" "}
                    <strong>{Number(e.beforeValue ?? 0)}</strong>
                  </div>
                </figcaption>
              </figure>
            );
          })
        ) : (
          <div style={{ opacity: 0.8 }}>
            No resets yet. Incredible restraint.
          </div>
        )}
      </div>

      {/* RESET MODAL */}
      {showReset ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !resetBusy) setShowReset(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(720px, 100%)",
              background: "#12141b",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Confirm Reset</h2>
              <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}>
                You are resetting value <strong>{value}</strong>
              </div>
              <button
                className="btn"
                onClick={() => setShowReset(false)}
                disabled={resetBusy}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div className="card">
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                  Pixelated camera (grayscale)
                </div>

                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ display: "none" }}
                />

                <div
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#000",
                  }}
                >
                  <canvas
                    ref={liveCanvasRef}
                    style={{
                      width: "100%",
                      height: "240px",
                      display: "block",
                      imageRendering: "pixelated",
                      filter: "grayscale(1)", // ✅ iOS-proof preview grayscale
                      WebkitFilter: "grayscale(1)", // ✅ extra for Safari
                    }}
                  />
                </div>

                <canvas ref={snapCanvasRef} style={{ display: "none" }} />

                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="btn"
                    onClick={handleSnap}
                    disabled={resetBusy || !!cameraError}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontWeight: 700,
                    }}
                  >
                    Snap
                  </button>
                  <button
                    className="btn"
                    onClick={handleDiscard}
                    disabled={resetBusy || !snapDataUrl}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontWeight: 700,
                    }}
                  >
                    Discard
                  </button>
                </div>

                {cameraError ? (
                  <div
                    style={{ marginTop: 10, fontSize: 12, color: "#ffb4b4" }}
                  >
                    {cameraError}
                  </div>
                ) : null}

                {snapDataUrl ? (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}
                    >
                      Snapshot preview
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={snapDataUrl}
                      alt="snapshot preview"
                      style={{
                        width: "100%",
                        height: 180,
                        objectFit: "contain",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        imageRendering: "pixelated",
                        background: "#000",
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                    Photo required. Click Snap.
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                  Your name (required)
                </div>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>Name</span>
                  <input
                    value={resetName}
                    onChange={(e) => {
                      setResetName(e.target.value);
                      if (resetError) setResetError("");
                    }}
                    placeholder="Your name"
                    style={inputStyle}
                    disabled={resetBusy}
                  />
                </label>

                {resetError ? (
                  <div
                    style={{ marginTop: 10, fontSize: 12, color: "#ffb4b4" }}
                  >
                    {resetError}
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    gap: 10,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn"
                    onClick={() => setShowReset(false)}
                    disabled={resetBusy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn"
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
                    style={{
                      padding: "12px 16px",
                      borderRadius: 14,
                      fontWeight: 800,
                    }}
                  >
                    {resetBusy ? "Submitting..." : "Submit & Reset"}
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  This will reset the shared counter to 0 and post your card on
                  the wall.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
