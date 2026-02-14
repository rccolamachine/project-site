"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/photobooth/page.js
 *
 * Adds requested email behavior:
 * - Always email the submission to: robert.chapleski@gmail.com
 * - Add checkbox in modal: if checked, ALSO email the submission to the user-provided email
 *
 * Client behavior:
 * - Adds lead.emailSelf checkbox
 * - Sends emailSelf=1/0 with the FormData
 *
 * Note: the server endpoint must implement:
 * - always email Rob
 * - if emailSelf=1, also email the submitter
 */

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hash2(ix, iy, seed) {
  let x = ix | 0;
  let y = iy | 0;
  let h = (seed | 0) ^ (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function exportTinyGridToBlob(
  tinyCanvas,
  { outW = 1024, mime = "image/png", quality } = {},
) {
  return new Promise((resolve, reject) => {
    try {
      if (!tinyCanvas?.width || !tinyCanvas?.height) {
        return reject(new Error("Nothing to export"));
      }

      const w = tinyCanvas.width;
      const h = tinyCanvas.height;
      const outH = Math.round((outW * h) / w);

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = outW;
      exportCanvas.height = outH;

      const ctx = exportCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(tinyCanvas, 0, 0, outW, outH);

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("toBlob() returned null"));
          resolve({ blob, outW, outH });
        },
        mime,
        quality,
      );
    } catch (e) {
      reject(e);
    }
  });
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

export default function Page() {
  const stageRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);

  const offscreenRef = useRef(null); // live tiny grid
  const snapSmallRef = useRef(null); // snapped tiny grid

  const rafRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState("");
  const [slider, setSlider] = useState(35);
  const [snapped, setSnapped] = useState(false);

  // Save UI state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccessUrl, setSaveSuccessUrl] = useState("");

  const [lead, setLead] = useState({
    name: "",
    email: "",
    linkedinUrl: "",
    message: "",
    emailSelf: false, // ✅ NEW
  });

  // Lock displayed canvas height to avoid 1px strips (prefer overlap)
  const [canvasCssHeight, setCanvasCssHeight] = useState(0);
  const canvasCssHeightRef = useRef(0);

  const pixelSizeRef = useRef(16);
  const snappedRef = useRef(false);
  const snapPixelSizeRef = useRef(null);

  const hoverCellRef = useRef(null); // snapped video hover cell {cx,cy}
  const hoverBgCellRef = useRef(null); // snapped bg hover {x,y} in client coords

  const dragRef = useRef({
    isDown: false,
    isDragging: false,
    picked: null,
    drop: null,
  });

  // background state
  const bgSeedRef = useRef(Math.floor(Math.random() * 1e9));
  const bgFreezePhaseRef = useRef(null); // number|null
  const bgNeedRedrawRef = useRef(true);

  // tiny-grid cache for sampling + avg gray
  const bgSampleCacheRef = useRef({ w: 0, h: 0, data: null });
  const bgAvgGrayRef = useRef(255);

  // slider -> pixelSize (log)
  const minPx = 1;
  const maxPx = 64;
  const pixelSize = useMemo(() => {
    const t = slider / 100;
    const v = minPx * Math.pow(maxPx / minPx, t);
    return Math.max(minPx, Math.min(maxPx, Math.round(v)));
  }, [slider]);

  useEffect(() => {
    pixelSizeRef.current = pixelSize;
    bgNeedRedrawRef.current = true;
    canvasCssHeightRef.current = 0;
  }, [pixelSize]);

  useEffect(() => {
    snappedRef.current = snapped;
    bgNeedRedrawRef.current = true;
    canvasCssHeightRef.current = 0;
  }, [snapped]);

  useEffect(() => {
    offscreenRef.current = document.createElement("canvas");
    snapSmallRef.current = document.createElement("canvas");
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detach = null;

    async function start() {
      try {
        setError("");

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

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const bgCanvas = bgCanvasRef.current;
        const bgCtx = bgCanvas?.getContext("2d", { alpha: false });

        const stage = stageRef.current;

        const off = offscreenRef.current;
        const offCtx = off.getContext("2d");

        const snapSmall = snapSmallRef.current;

        if (!stage || !bgCanvas || !bgCtx) {
          throw new Error("Missing stage/background canvas refs");
        }

        const markDirty = () => {
          bgNeedRedrawRef.current = true;
          canvasCssHeightRef.current = 0;
        };
        window.addEventListener("scroll", markDirty, { passive: true });
        window.addEventListener("resize", markDirty);

        const stageRO = new ResizeObserver(() => markDirty());
        stageRO.observe(stage);

        const pointerToCell = (clientX, clientY) => {
          const rect = canvas.getBoundingClientRect();
          const mx = (clientX - rect.left) * (canvas.width / rect.width);
          const my = (clientY - rect.top) * (canvas.height / rect.height);

          const snapPx = snapPixelSizeRef.current ?? pixelSizeRef.current;

          const smallW = Math.max(1, Math.round(canvas.width / snapPx));
          const smallH = Math.max(1, Math.round(canvas.height / snapPx));

          const cellW = canvas.width / smallW;
          const cellH = canvas.height / smallH;

          const cx = Math.max(0, Math.min(smallW - 1, Math.floor(mx / cellW)));
          const cy = Math.max(0, Math.min(smallH - 1, Math.floor(my / cellH)));

          return { cx, cy, smallW, smallH, cellW, cellH };
        };

        const onMove = (e) => {
          if (!snappedRef.current) return;
          const info = pointerToCell(e.clientX, e.clientY);
          hoverCellRef.current = { cx: info.cx, cy: info.cy };

          const d = dragRef.current;
          if (d.isDown) {
            d.isDragging = true;
            d.drop = { cx: info.cx, cy: info.cy };
          }
        };

        const onLeave = () => {
          hoverCellRef.current = null;
          const d = dragRef.current;
          d.isDown = false;
          d.isDragging = false;
          d.picked = null;
          d.drop = null;
        };

        const onDown = (e) => {
          if (!snappedRef.current) return;
          if (e.button !== 0) return;
          const info = pointerToCell(e.clientX, e.clientY);
          const d = dragRef.current;
          d.isDown = true;
          d.isDragging = false;
          d.picked = { cx: info.cx, cy: info.cy };
          d.drop = { cx: info.cx, cy: info.cy };
        };

        const commitSwapInSnapSmall = (a, b) => {
          if (!a || !b) return;
          if (a.cx === b.cx && a.cy === b.cy) return;

          const sctx = snapSmall.getContext("2d", { willReadFrequently: true });
          const p1 = sctx.getImageData(a.cx, a.cy, 1, 1);
          const p2 = sctx.getImageData(b.cx, b.cy, 1, 1);

          sctx.putImageData(p1, b.cx, b.cy);
          sctx.putImageData(p2, a.cx, a.cy);

          bgNeedRedrawRef.current = true;
        };

        const onUp = () => {
          if (!snappedRef.current) return;
          const d = dragRef.current;
          if (d.isDown && d.isDragging && d.picked && d.drop) {
            commitSwapInSnapSmall(d.picked, d.drop);
          }
          d.isDown = false;
          d.isDragging = false;
          d.picked = null;
          d.drop = null;
        };

        canvas.addEventListener("mousemove", onMove);
        canvas.addEventListener("mouseleave", onLeave);
        canvas.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup", onUp);

        const onBgMove = (e) => {
          if (!snappedRef.current) return;
          hoverBgCellRef.current = { x: e.clientX, y: e.clientY };
          bgNeedRedrawRef.current = true;
        };
        const onBgLeave = () => {
          hoverBgCellRef.current = null;
          bgNeedRedrawRef.current = true;
        };
        window.addEventListener("mousemove", onBgMove);
        window.addEventListener("mouseleave", onBgLeave);

        const refreshBgSampleCache = (useSnap) => {
          const sourceCanvas = useSnap ? snapSmall : off;
          const w = sourceCanvas.width;
          const h = sourceCanvas.height;
          if (!w || !h) return;

          const sctx = sourceCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          const img = sctx.getImageData(0, 0, w, h);

          bgSampleCacheRef.current = { w, h, data: img.data };

          let sum = 0;
          const n = w * h;
          for (let i = 0; i < n; i++) sum += img.data[i * 4];
          bgAvgGrayRef.current = n ? Math.round(sum / n) : 255;
        };

        const getTinyGray = (sx, sy) => {
          const cache = bgSampleCacheRef.current;
          const w = cache.w;
          const h = cache.h;
          const data = cache.data;
          if (!w || !h || !data) return bgAvgGrayRef.current;
          const x = clamp(sx | 0, 0, w - 1);
          const y = clamp(sy | 0, 0, h - 1);
          return data[(y * w + x) * 4];
        };

        const computeBgTileGray = ({
          i,
          j,
          cxCss,
          cyCss,
          leftCss,
          topCss,
          rightCss,
          bottomCss,
          influenceRadiusCss,
          k,
          seed,
          phase,
          baseG,
        }) => {
          const nx = clamp(cxCss, leftCss, rightCss);
          const ny = clamp(cyCss, topCss, bottomCss);

          const dx = cxCss - nx;
          const dy = cyCss - ny;
          const dist = Math.hypot(dx, dy);

          if (dist >= influenceRadiusCss) return baseG;

          const u = (nx - leftCss) / Math.max(1e-6, rightCss - leftCss);
          const v = (ny - topCss) / Math.max(1e-6, bottomCss - topCss);

          const { w: sw, h: sh } = bgSampleCacheRef.current;
          let gSample = baseG;

          if (sw && sh) {
            const sx = Math.floor(clamp(u, 0, 0.999999) * sw);
            const sy = Math.floor(clamp(v, 0, 0.999999) * sh);
            gSample = getTinyGray(sx, sy);
          }

          const raw = 1 / (Math.pow(dist, 1.5) + k);
          const raw0 = 1 / (0 + k);
          const rawR = 1 / (Math.pow(influenceRadiusCss, 1.5) + k);

          let influence = (raw - rawR) / Math.max(1e-6, raw0 - rawR);
          influence = clamp(influence, 0, 1);

          const r = hash2(i, j, seed ^ (phase * 1315423911));
          const jitter = lerp(0.55, 1.0, r);

          return Math.round(
            lerp(baseG, gSample, clamp(influence * jitter, 0, 1)),
          );
        };

        const updateLockedCanvasCssHeight = () => {
          const rect = canvas.getBoundingClientRect();
          const cssW = rect.width || 384;
          const scale = canvas.width ? cssW / canvas.width : 1;
          const h = Math.max(1, Math.ceil(canvas.height * scale));
          if (h !== canvasCssHeightRef.current) {
            canvasCssHeightRef.current = h;
            setCanvasCssHeight(h);
            bgNeedRedrawRef.current = true;
          }
        };

        const renderBackground = (timeMs) => {
          if (!bgCanvas || !bgCtx || !stage) return;

          const animateHover = snappedRef.current && !!hoverBgCellRef.current;
          if (snappedRef.current) {
            if (!bgNeedRedrawRef.current && !animateHover) return;
          }
          bgNeedRedrawRef.current = false;

          const dpr = window.devicePixelRatio || 1;

          const stageRect = stage.getBoundingClientRect();
          const stageWCss = Math.max(1, stageRect.width);
          const stageHCss = Math.max(1, stageRect.height);

          const bgW = Math.max(1, Math.round(stageWCss * dpr));
          const bgH = Math.max(1, Math.round(stageHCss * dpr));

          if (bgCanvas.width !== bgW || bgCanvas.height !== bgH) {
            bgCanvas.width = bgW;
            bgCanvas.height = bgH;
          }

          const vrect = canvas.getBoundingClientRect();
          const leftCss = vrect.left - stageRect.left;
          const topCss = vrect.top - stageRect.top;
          const rightCss = leftCss + vrect.width;
          const bottomCss = topCss + vrect.height;

          const gridW = snappedRef.current
            ? snapSmallRef.current?.width || 0
            : offscreenRef.current?.width || 0;
          const gridH = snappedRef.current
            ? snapSmallRef.current?.height || 0
            : offscreenRef.current?.height || 0;

          bgCtx.setTransform(1, 0, 0, 1, 0, 0);
          bgCtx.imageSmoothingEnabled = false;

          if (!gridW || !gridH) {
            bgCtx.fillStyle = "#000";
            bgCtx.fillRect(0, 0, bgW, bgH);
            return;
          }

          refreshBgSampleCache(snappedRef.current);
          const baseG = bgAvgGrayRef.current;

          const leftDev = leftCss * dpr;
          const topDev = topCss * dpr;

          const tileDevX = (vrect.width * dpr) / gridW;
          const tileDevY = (vrect.height * dpr) / gridH;

          const originX = leftDev;
          const originY = topDev;

          bgCtx.fillStyle = `rgb(${baseG},${baseG},${baseG})`;
          bgCtx.fillRect(0, 0, bgW, bgH);

          const tileCss = vrect.width / gridW;
          const influenceRadiusCss = tileCss * 32;
          const k = Math.pow(tileCss * 1.6, 1.5);

          const seed = bgSeedRef.current | 0;
          const livePhase = Math.floor(timeMs / 180);
          const phase = snappedRef.current
            ? (bgFreezePhaseRef.current ?? livePhase)
            : livePhase;

          const iMin = Math.floor((0 - originX) / tileDevX) - 2;
          const iMax = Math.ceil((bgW - originX) / tileDevX) + 2;
          const jMin = Math.floor((0 - originY) / tileDevY) - 2;
          const jMax = Math.ceil((bgH - originY) / tileDevY) + 2;

          for (let j = jMin; j <= jMax; j++) {
            const y0 = Math.round(originY + j * tileDevY);
            const y1 = Math.round(originY + (j + 1) * tileDevY);
            const h = y1 - y0;
            if (h <= 0) continue;

            const cyCss = ((y0 + y1) * 0.5) / dpr;

            for (let i = iMin; i <= iMax; i++) {
              const x0 = Math.round(originX + i * tileDevX);
              const x1 = Math.round(originX + (i + 1) * tileDevX);
              const w = x1 - x0;
              if (w <= 0) continue;

              const cxCss = ((x0 + x1) * 0.5) / dpr;

              if (
                cxCss >= leftCss &&
                cxCss <= rightCss &&
                cyCss >= topCss &&
                cyCss <= bottomCss
              ) {
                continue;
              }

              const g = computeBgTileGray({
                i,
                j,
                cxCss,
                cyCss,
                leftCss,
                topCss,
                rightCss,
                bottomCss,
                influenceRadiusCss,
                k,
                seed,
                phase,
                baseG,
              });

              bgCtx.fillStyle = `rgb(${g},${g},${g})`;
              bgCtx.fillRect(x0, y0, w, h);
            }
          }
        };

        const renderLive = (nowMs) => {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;

          const pxNow = pixelSizeRef.current;
          const desiredW = 384;

          const smallW = Math.max(1, Math.round(desiredW / pxNow));
          const targetW = smallW * pxNow;

          const rawH = Math.round((targetW * vh) / vw);
          const smallH = Math.max(1, Math.round(rawH / pxNow));
          const targetH = smallH * pxNow;

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            bgNeedRedrawRef.current = true;
            canvasCssHeightRef.current = 0;
          }

          if (off.width !== smallW || off.height !== smallH) {
            off.width = smallW;
            off.height = smallH;
          }

          offCtx.save();
          offCtx.filter = "grayscale(1)";
          offCtx.drawImage(video, 0, 0, smallW, smallH);
          offCtx.restore();

          updateLockedCanvasCssHeight();
          renderBackground(nowMs);

          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(off, 0, 0, targetW, targetH);
          ctx.restore();
        };

        const renderSnapped = (timeMs) => {
          updateLockedCanvasCssHeight();
          renderBackground(timeMs);

          const targetW = canvas.width;
          const targetH = canvas.height;

          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(snapSmall, 0, 0, targetW, targetH);
          ctx.restore();

          const snapPx = snapPixelSizeRef.current ?? pixelSizeRef.current;
          const smallW = Math.max(1, Math.round(targetW / snapPx));
          const smallH = Math.max(1, Math.round(targetH / snapPx));

          const d = dragRef.current;
          const hover = hoverCellRef.current;
          const srcCell = d.isDown && d.picked ? d.picked : hover;
          if (!srcCell) return;

          const drawAt = d.isDown && d.picked && d.drop ? d.drop : srcCell;

          const cellW = targetW / smallW;
          const cellH = targetH / smallH;

          if (d.isDown && d.picked) {
            const ox = d.picked.cx * cellW;
            const oy = d.picked.cy * cellH;
            ctx.clearRect(ox, oy, cellW, cellH);
          }

          const x = drawAt.cx * cellW;
          const y = drawAt.cy * cellH;

          ctx.clearRect(x, y, cellW, cellH);

          const angle = (timeMs / 1000) * 3.6;
          const pop = 1.35;

          const shadowOffset = Math.max(
            2,
            Math.round(Math.min(cellW, cellH) * 0.12),
          );
          ctx.fillStyle = "rgba(0,0,0,0.80)";
          ctx.fillRect(x + shadowOffset, y + shadowOffset, cellW, cellH);

          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(x + cellW / 2, y + cellH / 2);
          ctx.rotate(angle);
          ctx.scale(pop, pop);

          ctx.drawImage(
            snapSmall,
            srcCell.cx,
            srcCell.cy,
            1,
            1,
            -cellW / 2,
            -cellH / 2,
            cellW,
            cellH,
          );

          const borderW = Math.max(
            2,
            Math.round(Math.min(cellW, cellH) * 0.08),
          );
          ctx.strokeStyle = "rgba(0,0,0,0.75)";
          ctx.lineWidth = borderW;
          ctx.strokeRect(
            -cellW / 2 + borderW / 2,
            -cellH / 2 + borderW / 2,
            cellW - borderW,
            cellH - borderW,
          );

          ctx.restore();
        };

        const loop = (t) => {
          if (!snappedRef.current) renderLive(t);
          else renderSnapped(t);
          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);

        return () => {
          canvas.removeEventListener("mousemove", onMove);
          canvas.removeEventListener("mouseleave", onLeave);
          canvas.removeEventListener("mousedown", onDown);
          window.removeEventListener("mouseup", onUp);

          window.removeEventListener("mousemove", onBgMove);
          window.removeEventListener("mouseleave", onBgLeave);

          window.removeEventListener("scroll", markDirty);
          window.removeEventListener("resize", markDirty);

          stageRO.disconnect();
        };
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied."
            : `Camera error: ${e?.message || String(e)}`,
        );
      }
    }

    start().then((cleanup) => {
      if (typeof cleanup === "function") detach = cleanup;
    });

    return () => {
      cancelled = true;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (typeof detach === "function") detach();

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
  }, []);

  useEffect(() => {
    const has = document.cookie
      .split("; ")
      .some((c) => c.startsWith("gb_sid="));
    if (!has) {
      const sid = crypto.randomUUID();
      document.cookie = `gb_sid=${sid}; Path=/; SameSite=Lax`;
    }
  }, []);

  const handleSnap = () => {
    const off = offscreenRef.current;
    const snapSmall = snapSmallRef.current;
    if (!off || !snapSmall) return;

    setSaveSuccessUrl("");
    setSaveError("");

    snapPixelSizeRef.current = pixelSizeRef.current;

    snapSmall.width = off.width;
    snapSmall.height = off.height;

    const sctx = snapSmall.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, snapSmall.width, snapSmall.height);
    sctx.drawImage(off, 0, 0);

    bgFreezePhaseRef.current = Math.floor(performance.now() / 180);
    bgNeedRedrawRef.current = true;

    hoverCellRef.current = null;
    hoverBgCellRef.current = null;
    dragRef.current.isDown = false;
    dragRef.current.isDragging = false;
    dragRef.current.picked = null;
    dragRef.current.drop = null;

    setSnapped(true);
  };

  const handleBackToLive = () => {
    hoverCellRef.current = null;
    hoverBgCellRef.current = null;
    dragRef.current.isDown = false;
    dragRef.current.isDragging = false;
    dragRef.current.picked = null;
    dragRef.current.drop = null;

    snapPixelSizeRef.current = null;
    bgFreezePhaseRef.current = null;
    bgNeedRedrawRef.current = true;

    setShowSaveModal(false);
    setSaveSuccessUrl("");
    setSaveError("");
    setSnapped(false);
  };

  const openSaveModal = () => {
    setSaveError("");
    setSaveSuccessUrl("");
    setShowSaveModal(true);
  };

  const submitSave = async () => {
    if (!snappedRef.current) return;

    const name = lead.name.trim();
    const email = lead.email.trim();
    const linkedinUrl = lead.linkedinUrl.trim();
    const message = lead.message.trim();
    const emailSelf = !!lead.emailSelf; // ✅ NEW

    if (!name) return setSaveError("Name is required.");
    if (!email) return setSaveError("Email is required.");

    const tiny = snapSmallRef.current;
    if (!tiny?.width || !tiny?.height)
      return setSaveError("Nothing to export.");

    setSaving(true);
    setSaveError("");

    try {
      const { blob, outW, outH } = await exportTinyGridToBlob(tiny, {
        outW: 1024,
      });

      const fd = new FormData();
      fd.append("photo", blob, `photobooth-${Date.now()}.png`);

      fd.append("name", name);
      fd.append("email", email);
      fd.append("linkedinUrl", linkedinUrl);
      fd.append("message", message);

      // ✅ NEW: server should always email Rob; and also email user if emailSelf=1
      fd.append("emailSelf", emailSelf ? "1" : "0");

      fd.append(
        "pixelSize",
        String(snapPixelSizeRef.current ?? pixelSizeRef.current),
      );
      fd.append("tinyW", String(tiny.width));
      fd.append("tinyH", String(tiny.height));
      fd.append("outW", String(outW));
      fd.append("outH", String(outH));

      const res = await fetch("/api/pictures", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const json = await res.json(); // { id, url }

      setSaveSuccessUrl(json.url);

      // ✅ IMPORTANT FIX: only after success, revert to Live view
      setShowSaveModal(false);
      setSaving(false);
      handleBackToLive();
    } catch (e) {
      setSaveError(e?.message || String(e));
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!showSaveModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowSaveModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSaveModal]);

  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        background: "#000",
        userSelect: "none",
      }}
    >
      <canvas
        ref={bgCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          filter: "grayscale(1)", // ✅ iOS-proof preview grayscale
          WebkitFilter: "grayscale(1)", // ✅ extra for Safari
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: 16,
          maxWidth: 900,
          margin: "0 auto",
          color: "#eaeaea",
        }}
      >
        <h1 style={{ marginBottom: 8 }}>Photobooth</h1>

        {error ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#2a1414",
              border: "1px solid #5a2b2b",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleSnap} disabled={!!error || snapped}>
            {snapped ? "Drag pixels in photo to edit" : "Snap"}
          </button>

          <button onClick={handleBackToLive} disabled={!!error || !snapped}>
            Back to Live
          </button>

          <button onClick={openSaveModal} disabled={!!error || !snapped}>
            Save to Guestbook
          </button>
          <a className="btn" href="/guestbook">
            {`--> Go to Guestbook`}
          </a>

          <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}>
            Mode:{" "}
            <strong>
              {snapped ? "Snapped (hover spins; drag swaps tiles)" : "Live"}
            </strong>
          </div>
        </div>

        {saveSuccessUrl ? (
          <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.9 }}>
            Saved!{" "}
            <a href={saveSuccessUrl} target="_blank" rel="noreferrer">
              {saveSuccessUrl}
            </a>
          </div>
        ) : null}

        <div style={{ marginBottom: 12, opacity: snapped ? 0.6 : 1 }}>
          <label style={{ display: "block", marginBottom: 6 }}>
            Pixelation (log scale): <strong>{pixelSize}px</strong>
            {snapped ? (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                (frozen after snap)
              </span>
            ) : null}
          </label>

          <input
            type="range"
            min={0}
            max={100}
            value={slider}
            disabled={snapped}
            onChange={(e) => setSlider(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <video ref={videoRef} playsInline muted style={{ display: "none" }} />

        <div
          style={{
            borderRadius: 0,
            overflow: "hidden",
            border: "none",
            background: "transparent",
            cursor: snapped ? "grab" : "default",
            lineHeight: 0,
            fontSize: 0,
            transform: "translateZ(0)",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: canvasCssHeight ? `${canvasCssHeight}px` : "auto",
              display: "block",
              background: "#000",
              imageRendering: "pixelated",
              filter: "grayscale(1)", // ✅ iOS-proof preview grayscale
              WebkitFilter: "grayscale(1)", // ✅ extra for Safari
            }}
          />
        </div>
      </div>

      {showSaveModal ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving)
              setShowSaveModal(false);
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
              width: "min(560px, 100%)",
              background: "#12141b",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Save your photo</h2>
              <button
                style={{ marginLeft: "auto" }}
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>Name</span>
                <input
                  value={lead.name}
                  onChange={(e) =>
                    setLead((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Rob"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  Email (just for Rob's records-- will not appear in Guestbook)
                </span>
                <input
                  value={lead.email}
                  onChange={(e) =>
                    setLead((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="you@example.com"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>

              {/* ✅ NEW: checkbox to also email the user */}
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!lead.emailSelf}
                  onChange={(e) =>
                    setLead((p) => ({ ...p, emailSelf: e.target.checked }))
                  }
                  disabled={saving}
                />
                <div style={{ display: "grid" }}>
                  <span style={{ fontSize: 14 }}>Email me a copy too</span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                    If checked, we will also email this submission to you at the
                    address above
                  </span>
                </div>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  LinkedIn URL (optional)
                </span>
                <input
                  value={lead.linkedinUrl}
                  onChange={(e) =>
                    setLead((p) => ({ ...p, linkedinUrl: e.target.value }))
                  }
                  placeholder="https://www.linkedin.com/in/..."
                  style={inputStyle}
                  disabled={saving}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  Message (optional)
                </span>
                <textarea
                  value={lead.message}
                  onChange={(e) =>
                    setLead((p) => ({ ...p, message: e.target.value }))
                  }
                  placeholder="Say hi…"
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  disabled={saving}
                />
              </label>

              {saveError ? (
                <div style={{ fontSize: 12, color: "#ffb4b4" }}>
                  {saveError}
                </div>
              ) : null}

              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  onClick={() => setShowSaveModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button onClick={submitSave} disabled={saving}>
                  {saving ? "Saving..." : "Submit & Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
