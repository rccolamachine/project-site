"use client";

import { useEffect, useRef, useState } from "react";
import { hasMappableCoordinates } from "./packetShared";
import styles from "./packet.module.css";

const DEFAULT_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const OVERLAP_SPACING_METERS = 18;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMarkerHtml(entry, isSelected) {
  const tableId = Number(entry?.symbolTableId);
  const spriteCol = Number(entry?.symbolSpriteCol);
  const spriteRow = Number(entry?.symbolSpriteRow);
  const hasSprite =
    (tableId === 0 || tableId === 1) &&
    Number.isFinite(spriteCol) &&
    Number.isFinite(spriteRow);
  const overlay = String(entry?.symbolOverlay || "").trim();
  const symbolCode = String(entry?.symbolCode || "").trim() || "--";
  const selectedClass = isSelected ? ` ${styles.packetMarkerBadgeSelected}` : "";

  if (!hasSprite) {
    return `<div class="${styles.packetMarkerBadge}${selectedClass}"><span class="${styles.packetMarkerFallback}">${escapeHtml(symbolCode)}</span></div>`;
  }

  const spriteStyle = `background-image:url('/packet/packet-symbols-24-${tableId}.png');--packet-col:${spriteCol};--packet-row:${spriteRow};`;
  const overlayHtml = overlay
    ? `<span class="${styles.packetMarkerOverlay}">${escapeHtml(overlay)}</span>`
    : "";

  return `<div class="${styles.packetMarkerBadge}${selectedClass}"><span class="${styles.packetMarkerSprite}" style="${spriteStyle}"></span>${overlayHtml}</div>`;
}

function getCoordinateKey(entry) {
  const latitude = Number(entry?.latitude);
  const longitude = Number(entry?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function calculateSpreadOffset(index, total, spacingMeters) {
  if (total <= 1) return { xMeters: 0, yMeters: 0 };

  const rowCapacity = Math.max(2, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / rowCapacity);
  const col = index % rowCapacity;
  const usedCols = Math.min(rowCapacity, total - row * rowCapacity);
  const usedRows = Math.ceil(total / rowCapacity);

  const xMeters = (col - (usedCols - 1) / 2) * spacingMeters;
  const yMeters = (((usedRows - 1) / 2) - row) * spacingMeters;

  return { xMeters, yMeters };
}

function applyMeterOffset(latitude, longitude, xMeters, yMeters) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon };
  }

  const latRadians = (lat * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(1, metersPerDegreeLat * Math.cos(latRadians));
  const latOffset = yMeters / metersPerDegreeLat;
  const lonOffset = xMeters / metersPerDegreeLon;

  return {
    latitude: lat + latOffset,
    longitude: lon + lonOffset,
  };
}

export default function PacketLeafletMap({
  results = [],
  isLoading = false,
  selectedCallsign = "",
  onSelectCallsign,
}) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const leafletRef = useRef(null);
  const lastViewKeyRef = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [hasPlottedPoints, setHasPlottedPoints] = useState(false);
  const hasAnyMappablePoints =
    Array.isArray(results) && results.some(hasMappableCoordinates);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!rootRef.current || mapRef.current) return;

      const leafletModule = await import("leaflet");
      const L = leafletModule.default || leafletModule;
      if (cancelled || !rootRef.current) return;

      leafletRef.current = L;

      const map = L.map(rootRef.current, {
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      setTimeout(() => {
        map.invalidateSize();
      }, 0);
      setMapReady(true);
    }

    initMap().catch(() => {});

    return () => {
      cancelled = true;
      markerLayerRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const L = leafletRef.current;
    if (!map || !markerLayer || !L) return;

    markerLayer.clearLayers();

    const rows = Array.isArray(results) ? results : [];
    const validRows = rows.filter(hasMappableCoordinates);
    const overlapIndexByKey = new Map();
    const overlapTotalByKey = new Map();
    validRows.forEach((entry) => {
      const key = getCoordinateKey(entry);
      if (!key) return;
      overlapTotalByKey.set(key, (overlapTotalByKey.get(key) || 0) + 1);
    });
    const points = [];

    validRows.forEach((entry) => {
      const latitude = Number(entry.latitude);
      const longitude = Number(entry.longitude);
      const coordKey = getCoordinateKey(entry);
      const overlapIndex = overlapIndexByKey.get(coordKey) || 0;
      const overlapTotal = overlapTotalByKey.get(coordKey) || 1;
      overlapIndexByKey.set(coordKey, overlapIndex + 1);
      const spread = calculateSpreadOffset(overlapIndex, overlapTotal, OVERLAP_SPACING_METERS);
      const plotted = applyMeterOffset(latitude, longitude, spread.xMeters, spread.yMeters);
      const plottedLat = Number(plotted.latitude);
      const plottedLon = Number(plotted.longitude);
      const callsign = String(entry.callsign || "").trim() || "Unknown";
      const isSelected = callsign === selectedCallsign;

      points.push([plottedLat, plottedLon]);

      const marker = L.marker([plottedLat, plottedLon], {
        icon: L.divIcon({
          html: buildMarkerHtml(entry, isSelected),
          className: styles.packetMarkerRoot,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          tooltipAnchor: [0, -16],
        }),
      });

      marker.bindTooltip(callsign, {
        direction: "top",
        offset: [0, -10],
        opacity: 0.95,
      });
      marker.on("click", () => {
        if (typeof onSelectCallsign === "function") {
          onSelectCallsign(callsign);
        }
      });

      marker.addTo(markerLayer);
    });

    map.invalidateSize();

    if (points.length === 0) {
      lastViewKeyRef.current = "";
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
      setHasPlottedPoints(false);
      return;
    }

    const viewKey = points
      .map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`)
      .join("|");
    const shouldUpdateView = viewKey !== lastViewKeyRef.current;
    lastViewKeyRef.current = viewKey;

    if (points.length === 1) {
      if (shouldUpdateView) {
        map.setView(points[0], 11, { animate: false });
      }
      setHasPlottedPoints(true);
      return;
    }

    if (shouldUpdateView) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13, animate: false });
    }
    setHasPlottedPoints(true);
  }, [mapReady, onSelectCallsign, results, selectedCallsign]);

  const loadingVisible =
    isLoading || !mapReady || (hasAnyMappablePoints && !hasPlottedPoints);
  const loadingText = !mapReady || isLoading ? "Map and positions loading..." : "Plotting positions...";

  return (
    <div className={styles.mapShell}>
      <div
        ref={rootRef}
        className={styles.leafletMap}
        role="img"
        aria-label="Live Packet map"
      />
      <div className={styles.mapToneOverlay} aria-hidden="true" />
      <div className={styles.mapDuotoneOverlay} aria-hidden="true" />
      <div className={styles.mapGridOverlay} aria-hidden="true" />
      {loadingVisible ? (
        <div className={styles.mapLoadingOverlay}>
          <p className={styles.mapLoadingText}>{loadingText}</p>
        </div>
      ) : null}
    </div>
  );
}
