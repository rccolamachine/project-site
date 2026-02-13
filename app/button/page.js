"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

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

  // reset modal
  const [showReset, setShowReset] = useState(false);
  const [resetName, setResetName] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [snapDataUrl, setSnapDataUrl] = useState("");

  // camera
  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const snapCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const displayValue = useMemo(() => value + pendingUi, [value, pendingUi]);

  // initial load + light polling
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setErr("");
        const s = await fetchState();
        if (!alive) return;
        setValue(s.value || 0);
        setMax(s.max || 0);
        setMaxAt(s.maxAt || "");
        setShame(Array.isArray(s.shame) ? s.shame : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
      }
    };

    load();
    const t = setInterval(load, 4000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

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
      setErr("");
    } catch (e) {
      // If increment fails, resync from server
      setErr(e?.message || String(e));
      try {
        const s = await fetchState();
        setValue(s.value || 0);
        setMax(s.max || 0);
        setMaxAt(s.maxAt || "");
        setShame(Array.isArray(s.shame) ? s.shame : []);
      } catch {}
    }
  };

  const handleIncrement = () => {
    setErr("");

    pendingRef.current += 1;
    setPendingUi((p) => p + 1);

    if (!timerRef.current) {
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        await flushIncrements();
      }, 5000);
    }
  };

  // reset click should cancel pending batch and resync (per your rule)
  const openResetModal = async () => {
    // cancel pending increments and revert optimistic UI
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = 0;
    setPendingUi(0);

    // resync state so user sees the real current counter before reset
    try {
      const s = await fetchState();
      setValue(s.value || 0);
      setMax(s.max || 0);
      setMaxAt(s.maxAt || "");
      setShame(Array.isArray(s.shame) ? s.shame : []);
    } catch {}

    setResetError("");
    setSnapDataUrl("");
    setShowReset(true);
  };

  // camera lifecycle for reset modal
  useEffect(() => {
    if (!showReset) return;

    let cancelled = false;

    const start = async () => {
      try {
        setResetError("");
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
        video.srcObject = stream;
        await video.play();

        const live = liveCanvasRef.current;
        const ctx = live.getContext("2d", { alpha: false });

        const draw = () => {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;

          // tiny canvas for pixel look
          const tinyW = 64;
          const tinyH = Math.max(1, Math.round((tinyW * vh) / vw));

          live.width = tinyW;
          live.height = tinyH;

          ctx.save();
          ctx.filter = "grayscale(1)";
          ctx.imageSmoothingEnabled = true; // smooth into tiny
          ctx.drawImage(video, 0, 0, tinyW, tinyH);
          ctx.restore();

          rafRef.current = requestAnimationFrame(draw);
        };

        rafRef.current = requestAnimationFrame(draw);
      } catch (e) {
        setResetError(
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

      if (videoRef.current) {
        try {
          videoRef.current.pause?.();
        } catch {}
        videoRef.current.srcObject = null;
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

    const sctx = snap.getContext("2d", { alpha: false });
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, outW, outH);
    sctx.drawImage(live, 0, 0, outW, outH);

    const url = snap.toDataURL("image/png");
    setSnapDataUrl(url);
  };

  const handleDiscard = () => {
    setSnapDataUrl("");
  };

  const submitReset = async () => {
    const name = resetName.trim();
    if (!name) return setResetError("Name is required.");
    if (!snapDataUrl) return setResetError("Photo is required. Click Snap.");

    setResetBusy(true);
    setResetError("");

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
      setSnapDataUrl("");
      setResetName("");
      setResetBusy(false);

      // update local state
      setValue(0);

      // refresh shame + max
      const s = await fetchState();
      setValue(s.value || 0);
      setMax(s.max || 0);
      setMaxAt(s.maxAt || "");
      setShame(Array.isArray(s.shame) ? s.shame : []);
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

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
      >
        <div className="card">
          <div style={{ fontSize: 12, opacity: 0.8 }}>Current</div>
          <div style={{ fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
            {displayValue}
          </div>
          {pendingUi ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              pending +{pendingUi}
            </div>
          ) : null}
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

        <div className="card">
          <div style={{ fontSize: 12, opacity: 0.8 }}>Controls</div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button className="btn" onClick={handleIncrement}>
              Increment
            </button>
            <button className="btn" onClick={openResetModal}>
              Reset
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            Reset requires a snapped photo + name.
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 18 }}>Wall of Shame</h2>
      <div className="grid" style={{ marginTop: 12 }}>
        {shame?.length ? (
          shame.map((e) => (
            <figure key={e.id} className="tile">
              <img src={e.photoDataUrl} alt={`${e.name} reset`} />
              <figcaption>
                <div className="capTitle">{e.name}</div>
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
          ))
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
                  {/* live tiny canvas scaled up via CSS for pixel look */}
                  <canvas
                    ref={liveCanvasRef}
                    style={{
                      width: "100%",
                      height: "240px",
                      display: "block",
                      imageRendering: "pixelated",
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
                    disabled={resetBusy || !!resetError}
                  >
                    Snap
                  </button>
                  <button
                    className="btn"
                    onClick={handleDiscard}
                    disabled={resetBusy || !snapDataUrl}
                  >
                    Discard
                  </button>
                </div>

                {snapDataUrl ? (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}
                    >
                      Snapshot preview
                    </div>
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
                    onChange={(e) => setResetName(e.target.value)}
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
                    disabled={resetBusy}
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
