"use client";

import { useSyncExternalStore } from "react";
import { STORAGE_KEY } from "../lib/farm/config";
import PixelHouseIcon from "./PixelHouseIcon";

function clampHouseCount(value) {
  return Math.max(0, Math.min(2, Math.floor(Number(value || 0))));
}

function readHouseCount() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const migrated =
      parsed?.houseCount ??
      (parsed?.housePurchased || parsed?.postWinContinued ? 1 : 0);
    return clampHouseCount(migrated);
  } catch {
    return 0;
  }
}

function subscribeToStorage(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export default function FarmWinHomeCorner() {
  const houseCount = useSyncExternalStore(
    subscribeToStorage,
    readHouseCount,
    () => 0,
  );

  if (houseCount <= 0) return null;

  return (
    <div
      className="home-farm-win-corner"
      aria-label={`Farm Idle houses: ${houseCount}`}
    >
      {Array.from({ length: houseCount }).map((_, idx) => (
        <PixelHouseIcon key={`home-house-${idx}`} size={14} swapped={idx === 1} />
      ))}
    </div>
  );
}
