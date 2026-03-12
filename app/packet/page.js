"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DesktopBadge from "../../components/DesktopBadge";
import PacketLeafletMap from "./PacketLeafletMap";
import PacketArchitectureDiagram from "./components/PacketArchitectureDiagram";
import {
  DEFAULT_DURATION_HOURS,
  DURATION_CANDIDATE_HOURS,
  formatDurationLabel,
  formatLatitude,
  formatLongitude,
  formatNumber,
  formatTimestamp,
  formatTimestampParts,
  getSymbolRenderData,
  getSymbolSpriteStyleVars,
  hasMappableCoordinates,
  parseIsoToMs,
} from "./packetShared";
import styles from "./packet.module.css";

const REFRESH_INTERVAL_MS = 60_000;
const SNAPSHOT_CACHE_KEY = "packet_ky4zo_snapshot_v1";

function readSnapshotCache() {
  try {
    const cachedRaw = window.sessionStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!cachedRaw) return null;
    const cached = JSON.parse(cachedRaw);
    if (!cached || typeof cached !== "object") return null;
    return normalizeSnapshotPayload(cached);
  } catch {
    return null;
  }
}

function writeSnapshotCache(snapshot) {
  try {
    window.sessionStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors.
  }
}

function SymbolCell({ entry }) {
  const render = getSymbolRenderData(entry);
  const spriteTableClass =
    render.symbolTableId === 0
      ? styles.packetSpriteTable0
      : render.symbolTableId === 1
        ? styles.packetSpriteTable1
        : "";
  const spriteClassName = [styles.tableSymbolSprite, spriteTableClass]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.symbolCell}>
      <span
        className={styles.tableSymbolBadge}
        aria-label={render.symbolCode || "Packet symbol"}
        title={render.symbolCode || "Packet symbol"}
      >
        {render.hasSprite ? (
          <span
            className={spriteClassName}
            style={getSymbolSpriteStyleVars(entry)}
          />
        ) : (
          <span className={styles.tableSymbolFallback}>
            {render.symbolCode || "--"}
          </span>
        )}
        {render.symbolOverlay ? (
          <span className={styles.tableSymbolOverlay}>
            {render.symbolOverlay}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function LastSeenCell({ value }) {
  const parts = formatTimestampParts(value);

  return (
    <span className={styles.lastSeenCell}>
      <span>{parts.date}</span>
      {parts.time ? (
        <span className={styles.lastSeenTime}>{parts.time}</span>
      ) : null}
    </span>
  );
}

function normalizeSnapshotPayload(payload) {
  const nextResults = Array.isArray(payload?.results) ? payload.results : [];
  return {
    results: nextResults,
    fetchedAt: String(payload?.fetchedAt || ""),
  };
}

export default function PacketPage() {
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [mapDurationHours, setMapDurationHours] = useState(
    String(DEFAULT_DURATION_HOURS),
  );
  const [selectedCallsign, setSelectedCallsign] = useState("");
  const [showArchitecture, setShowArchitecture] = useState(true);

  const applySnapshot = useCallback((payload) => {
    const snapshot = normalizeSnapshotPayload(payload);
    setResults(snapshot.results);
    setFetchedAt(snapshot.fetchedAt);
  }, []);

  const loadSnapshot = useCallback(
    async ({ silent = false } = {}) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch("/api/packet/ky4zo", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload?.detail ||
              payload?.error ||
              `Request failed (${response.status}).`,
          );
        }

        if (controller.signal.aborted || requestId !== requestIdRef.current)
          return;

        const snapshot = normalizeSnapshotPayload(payload);
        applySnapshot(snapshot);
        writeSnapshotCache(snapshot);
        setError("");
      } catch (err) {
        if (controller.signal.aborted || requestId !== requestIdRef.current)
          return;
        setError(err?.message || String(err));
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    const cachedSnapshot = readSnapshotCache();
    const usedCache = Boolean(cachedSnapshot);

    if (cachedSnapshot) {
      applySnapshot(cachedSnapshot);
      setLoading(false);
    }

    loadSnapshot({ silent: usedCache }).catch(() => {});

    const interval = setInterval(() => {
      loadSnapshot({ silent: true }).catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [applySnapshot, loadSnapshot]);

  const mapDurationOptions = useMemo(() => {
    const fetchedAtMs = parseIsoToMs(fetchedAt);
    const anchorMs = Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now();
    const agesHours = results
      .filter(hasMappableCoordinates)
      .map((entry) => {
        const seenMs = parseIsoToMs(entry?.lastSeenIso);
        if (!Number.isFinite(seenMs)) return null;
        return Math.max(0, (anchorMs - seenMs) / 3_600_000);
      })
      .filter((value) => value !== null);

    const oldestHours =
      agesHours.length > 0 ? Math.max(...agesHours) : DEFAULT_DURATION_HOURS;
    const options = DURATION_CANDIDATE_HOURS.filter(
      (hours) => hours <= oldestHours,
    );

    if (!options.includes(DEFAULT_DURATION_HOURS)) {
      options.push(DEFAULT_DURATION_HOURS);
    }

    options.sort((a, b) => a - b);
    const uniqueOptions = [...new Set(options)];
    const allHours = Math.max(DEFAULT_DURATION_HOURS, Math.ceil(oldestHours));

    return [
      ...uniqueOptions.map((hours) => ({
        value: String(hours),
        label: formatDurationLabel(hours),
      })),
      {
        value: "all",
        label: `All available (${formatDurationLabel(allHours).replace("Past ", "")})`,
      },
    ];
  }, [fetchedAt, results]);

  useEffect(() => {
    const exists = mapDurationOptions.some(
      (option) => option.value === mapDurationHours,
    );
    if (!exists) {
      setMapDurationHours(String(DEFAULT_DURATION_HOURS));
    }
  }, [mapDurationHours, mapDurationOptions]);

  const filteredMapResults = useMemo(() => {
    const fetchedAtMs = parseIsoToMs(fetchedAt);
    const anchorMs = Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now();
    const selectedAll = mapDurationHours === "all";
    const selectedHours = Number(mapDurationHours);
    const cutoffMs =
      !selectedAll && Number.isFinite(selectedHours) && selectedHours > 0
        ? anchorMs - selectedHours * 3_600_000
        : Number.NEGATIVE_INFINITY;

    return results.filter((entry) => {
      if (!hasMappableCoordinates(entry)) return false;
      if (selectedAll) return true;

      const seenMs = parseIsoToMs(entry?.lastSeenIso);
      if (!Number.isFinite(seenMs)) return false;
      return seenMs >= cutoffMs;
    });
  }, [fetchedAt, mapDurationHours, results]);

  useEffect(() => {
    if (!selectedCallsign) return;
    const stillExists = filteredMapResults.some(
      (entry) => String(entry?.callsign || "").trim() === selectedCallsign,
    );
    if (!stillExists) {
      setSelectedCallsign("");
    }
  }, [filteredMapResults, selectedCallsign]);

  const mapPointCount = filteredMapResults.length;
  const mapLoading = loading && results.length === 0;
  const selectedDurationLabel = useMemo(() => {
    const selected = mapDurationOptions.find(
      (option) => option.value === mapDurationHours,
    );
    return String(selected?.label || "Selected duration").toLowerCase();
  }, [mapDurationHours, mapDurationOptions]);
  const handleSelectCallsign = useCallback((callsign) => {
    const next = String(callsign || "").trim();
    if (!next) return;
    setSelectedCallsign(next);
  }, []);

  const handleRefreshNow = useCallback(() => {
    loadSnapshot().catch(() => {});
  }, [loadSnapshot]);

  return (
    <section className="page">
      <header className={styles.pageHeader}>
        <h1>Packets</h1>
        <p className="lede">Live KY4ZO positions from APRS internet service.</p>
      </header>
      <p className={`lede ${styles.contextBlurb}`}>
        Rob is a ham operator with his Amateur Extra radio license, callsign
        KY4ZO. APRS (Automatic Packet Reporting System) is a digital radio data
        network used to share position, telemetry, weather, and short status
        packets. My little radio stations with GPS transmit small bursts of data
        that are relayed by digipeaters and iGates, then aggregated by services
        like APRS-IS so nearby and internet users can view live activity on a
        map.
      </p>
      <DesktopBadge />

      {error ? (
        <div className="card ui-errorCard">
          <h2>Unable to load Packet data</h2>
          <p className="ui-errorDetail">{error}</p>
          <p className="ui-helperText">
            Set <code>APRS_FI_API_KEY</code> in <code>.env.local</code> and
            refresh.
          </p>
        </div>
      ) : null}

      <div className={`card ${styles.mapCard}`}>
        <div className={styles.mapCardHeader}>
          <h2 className={styles.cardHeading}>Live Map</h2>
          <div className={styles.mapControls}>
            <label className={styles.durationControl}>
              <span className={styles.durationLabel}>Duration</span>
              <select
                id="packet-map-duration"
                name="mapDurationHours"
                className={styles.durationSelect}
                value={mapDurationHours}
                onChange={(event) => setMapDurationHours(event.target.value)}
              >
                {mapDurationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleRefreshNow}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
        </div>
        <PacketLeafletMap
          results={filteredMapResults}
          isLoading={mapLoading}
          selectedCallsign={selectedCallsign}
          onSelectCallsign={handleSelectCallsign}
        />
        <div className={styles.mapFooter}>
          <div className={`ui-helperText ${styles.mapSummary}`}>
            Showing {mapPointCount} map point{mapPointCount === 1 ? "" : "s"}{" "}
            for {selectedDurationLabel}.
          </div>
          <div className={`ui-helperText ${styles.mapAttribution}`}>
            Data from{" "}
            <a href="https://aprs.fi/" target="_blank" rel="noreferrer">
              APRS.fi API
            </a>
            .
          </div>
        </div>
      </div>

      <div className={`card ${styles.tableCard}`}>
        <h2 className={styles.cardHeading}>Rob&apos;s Radios</h2>
        <div className={styles.tableWrap}>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Callsign</th>
                <th>Symbol</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Altitude</th>
                <th>Speed</th>
                <th>Course</th>
                <th>Last Seen</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {filteredMapResults.map((entry) => (
                <tr
                  key={entry.callsign}
                  className={
                    selectedCallsign === entry.callsign
                      ? styles.rowSelected
                      : ""
                  }
                  tabIndex={0}
                  role="button"
                  aria-pressed={selectedCallsign === entry.callsign}
                  onClick={() => handleSelectCallsign(entry.callsign)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectCallsign(entry.callsign);
                    }
                  }}
                >
                  <td>{entry.callsign}</td>
                  <td>
                    <SymbolCell entry={entry} />
                  </td>
                  <td>{formatLatitude(entry.latitude)}</td>
                  <td>{formatLongitude(entry.longitude)}</td>
                  <td>
                    {Number.isFinite(Number(entry.altitudeMeters))
                      ? `${formatNumber(entry.altitudeMeters, 0)} m`
                      : "--"}
                  </td>
                  <td>
                    {Number.isFinite(Number(entry.speedKmh))
                      ? `${formatNumber(entry.speedKmh, 1)} km/h`
                      : "--"}
                  </td>
                  <td>
                    {Number.isFinite(Number(entry.courseDegrees))
                      ? `${formatNumber(entry.courseDegrees, 0)} deg`
                      : "--"}
                  </td>
                  <td>
                    <LastSeenCell value={entry.lastSeenIso} />
                  </td>
                  <td>
                    <div className={styles.tableLinks}>
                      <a
                        className={styles.tableLinkBtn}
                        href={entry.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        APRS.fi
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMapResults.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyRow}>
                    {loading
                      ? "Loading rows..."
                      : "No Packet rows for selected duration."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className={`ui-helperText ${styles.tableUpdated}`}>
          Updated: {formatTimestamp(fetchedAt)}
        </div>
      </div>

      <div className={`card ${styles.diagramCard}`}>
        <div className={styles.diagramHeader}>
          <div>
            <h2 className={styles.diagramTitle}>Architecture Diagram</h2>
            <p className={`ui-helperText ${styles.diagramSubtitle}`}>
              What&apos;s going on under the hood?
            </p>
          </div>
          <button
            type="button"
            className={styles.diagramToggle}
            onClick={() => setShowArchitecture((prev) => !prev)}
            aria-expanded={showArchitecture}
            aria-controls="packet-architecture-diagram"
          >
            {showArchitecture ? "Hide" : "Show"}
          </button>
        </div>
        {showArchitecture ? (
          <div id="packet-architecture-diagram">
            <PacketArchitectureDiagram />
          </div>
        ) : null}
      </div>
    </section>
  );
}
