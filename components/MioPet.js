"use client";

import { useEffect, useRef, useState } from "react";

// Sprite atlas from mioclick: 128x128 palette indexes, 4x4 grid of 32px poses.
const ATLAS_SIZE = 128;
const FRAME_SIZE = 32;
const WALK_FRAMES = [0, 1, 2, 3];
const WALK_FRAME_MS = 160;
const COUNT_REFRESH_MS = 60_000;
const SHELL_COLORS = ["orange", "yellow", "blue", "pink", "white"];

function parsePalette(palette) {
  return Array.from({ length: 256 }, (_, i) => {
    const hex = palette?.[i];
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
}

function decodeFrames(bitmapHex, palette) {
  const atlas = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE);
  for (let i = 0; i < atlas.length; i += 1) {
    atlas[i] = parseInt(bitmapHex.substr(i * 2, 2), 16);
  }
  const colors = parsePalette(palette);

  return WALK_FRAMES.map((frame) => {
    const originX = (frame % 4) * FRAME_SIZE;
    const originY = Math.floor(frame / 4) * FRAME_SIZE;
    const image = new ImageData(FRAME_SIZE, FRAME_SIZE);
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      for (let x = 0; x < FRAME_SIZE; x += 1) {
        const color = colors[atlas[(originY + y) * ATLAS_SIZE + originX + x]];
        if (!color) continue;
        const offset = (y * FRAME_SIZE + x) * 4;
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;
      }
    }
    return image;
  });
}

function formatName(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

export default function MioPet({ mioId }) {
  const canvasRef = useRef(null);
  const [mio, setMio] = useState(null);
  const [error, setError] = useState("");
  const [shell, setShell] = useState(SHELL_COLORS[0]);

  useEffect(() => {
    let cancelled = false;
    const idParam = mioId ? `id=${encodeURIComponent(mioId)}&` : "";

    const load = async (includeSprite) => {
      try {
        const res = await fetch(`/api/mio?${idParam}sprite=${includeSprite ? 1 : 0}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load mio.");
        if (cancelled) return;
        setMio((prev) =>
          includeSprite || !prev
            ? body
            : { ...prev, clickCount: body.clickCount, rank: body.rank },
        );
        setError("");
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    };

    load(true);
    const timer = window.setInterval(() => {
      if (!document.hidden) load(false);
    }, COUNT_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mioId]);

  const bitmapHex = mio?.bitmapHex;
  const palette = mio?.palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !bitmapHex) return undefined;

    const frames = decodeFrames(bitmapHex, palette);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let index = 0;
    ctx.putImageData(frames[0], 0, 0);
    if (reduceMotion || frames.length < 2) return undefined;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % frames.length;
      ctx.putImageData(frames[index], 0, 0);
    }, WALK_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [bitmapHex, palette]);

  const name = formatName(mio?.name);

  return (
    <div className="mioShell" data-shell={shell} aria-busy={!mio && !error}>
      <div className="mioShellScreen">
        <div className="mioShellTop">
          {mio?.rank ? (
            <a
              className="mioShellRank"
              href={mio.leaderboardUrl}
              target="_blank"
              rel="noreferrer"
              title="See the mioclick leaderboard"
            >
              #{mio.rank.toLocaleString("en-US")} in the Yard
            </a>
          ) : (
            <span />
          )}
          <a
            className="mioShellChip"
            href={mio?.liveViewUrl || "https://www.mioclick.com"}
            target="_blank"
            rel="noreferrer"
          >
            mioclick
            <svg
              className="mioShellChipIcon"
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 2h6v6M10 2 3 9M2 4v6h6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
              />
            </svg>
          </a>
        </div>

        <canvas
          ref={canvasRef}
          className="mioShellCanvas"
          width={FRAME_SIZE}
          height={FRAME_SIZE}
          role="img"
          aria-label={name ? `${name} the mio, walking` : "Mio loading"}
        />

        <div className="mioShellInfo">
          {mio?.liveViewUrl ? (
            <a className="mioShellName" href={mio.liveViewUrl} target="_blank" rel="noreferrer">
              {name}
            </a>
          ) : (
            <div className="mioShellName">{name || (error ? "Mio" : "Loading…")}</div>
          )}
          <div className="mioShellClicks">
            {mio
              ? `${mio.clickCount.toLocaleString("en-US")} clicks`
              : error
                ? "Couldn't reach mioclick"
                : " "}
          </div>
        </div>
      </div>

      <div className="mioShellDots" role="radiogroup" aria-label="Shell color">
        {SHELL_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={shell === color}
            aria-label={`${color} shell`}
            className="mioShellDot"
            data-color={color}
            onClick={() => setShell(color)}
          />
        ))}
      </div>
    </div>
  );
}
