"use client";

import { useEffect, useState } from "react";


// Adds ?view= to the watch URL (the viewer reads it: auto picks by device, 2d or 3d forces one).
function withView(url, view) {
  if (view === "auto") return url;
  try {
    const u = new URL(url);
    u.searchParams.set("view", view);
    return u.toString();
  } catch {
    return url;
  }
}

export default function PipetsFrame({ src }) {
  const [view, setView] = useState("auto");
  const origin = (() => {
    try {
      return new URL(src).origin;
    } catch {
      return "";
    }
  })();

  // iPhone has no page full screen: the viewer asks its host to open the world as its own page
  useEffect(() => {
    const onMessage = (e) => {
      if (origin && e.origin !== origin) return;
      const d = e.data;
      if (d && d.type === "pw:fullPage" && typeof d.url === "string") {
        try {
          if (new URL(d.url).origin === origin) window.location.href = d.url;
        } catch {
          /* bad url */
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  const pick = (v) => {
    setView(v);
  };

  return (
    <>
      <label className="petViewPick">
        View{" "}
        <select value={view} onChange={(e) => pick(e.target.value)}>
          <option value="auto">Auto</option>
          <option value="2d">2D</option>
          <option value="3d">3D</option>
        </select>
      </label>
      <div className="petFrameWrap">
        <iframe
          key={view}
          className="petFrame"
          src={withView(src, view)}
          title="Pipets live view"
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </>
  );
}
