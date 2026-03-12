"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageIntro from "@/components/PageIntro";
import AprsLeafletMap from "./AprsLeafletMap";
import styles from "./aprs.module.css";

const REFRESH_INTERVAL_MS = 60_000;
const SNAPSHOT_CACHE_KEY = "aprs_ky4zo_snapshot_v2";
const DEFAULT_DURATION_HOURS = 24;
const DURATION_CANDIDATE_HOURS = [1, 3, 6, 12, 24, 48, 72, 168, 336];

function formatTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "--";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function formatLatitude(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${Math.abs(numeric).toFixed(5)}\u00B0 ${numeric >= 0 ? "N" : "S"}`;
}

function formatLongitude(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${Math.abs(numeric).toFixed(5)}\u00B0 ${numeric >= 0 ? "E" : "W"}`;
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toFixed(digits);
}

function parseIsoToMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  return Date.parse(raw);
}

function hasMappableCoordinates(entry) {
  const lat = Number(entry?.latitude);
  const lon = Number(entry?.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

function formatDurationLabel(hours) {
  const numeric = Number(hours);
  if (!Number.isFinite(numeric) || numeric <= 0) return "All";
  if (numeric < 24) return `Past ${numeric} hour${numeric === 1 ? "" : "s"}`;

  const days = numeric / 24;
  if (Number.isInteger(days)) {
    return `Past ${days} day${days === 1 ? "" : "s"}`;
  }

  return `Past ${numeric} hours`;
}

function hasSymbolSprite(entry) {
  const tableId = Number(entry?.symbolTableId);
  const col = Number(entry?.symbolSpriteCol);
  const row = Number(entry?.symbolSpriteRow);
  return (
    (tableId === 0 || tableId === 1) &&
    Number.isFinite(col) &&
    Number.isFinite(row)
  );
}

function SymbolCell({ entry }) {
  const symbolCode = String(entry?.symbolCode || "").trim();
  const overlay = String(entry?.symbolOverlay || "").trim();
  const hasSprite = hasSymbolSprite(entry);

  return (
    <div className={styles.symbolCell}>
      <span
        className={styles.tableSymbolBadge}
        aria-label={symbolCode || "APRS symbol"}
        title={symbolCode || "APRS symbol"}
      >
        {hasSprite ? (
          <span
            className={styles.tableSymbolSprite}
            style={{
              backgroundImage: `url('/aprs/aprs-symbols-24-${Number(entry.symbolTableId)}.png')`,
              "--aprs-col": Number(entry.symbolSpriteCol),
              "--aprs-row": Number(entry.symbolSpriteRow),
            }}
          />
        ) : (
          <span className={styles.tableSymbolFallback}>
            {symbolCode || "--"}
          </span>
        )}
        {overlay ? (
          <span className={styles.tableSymbolOverlay}>{overlay}</span>
        ) : null}
      </span>
    </div>
  );
}

export default function AprsPage() {
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [callsigns, setCallsigns] = useState([]);
  const [discoverySource, setDiscoverySource] = useState("");
  const [configuredRange, setConfiguredRange] = useState(null);
  const [fetchedAt, setFetchedAt] = useState("");
  const [mapDurationHours, setMapDurationHours] = useState(
    String(DEFAULT_DURATION_HOURS),
  );
  const [selectedCallsign, setSelectedCallsign] = useState("");

  const applySnapshot = useCallback((payload) => {
    const nextResults = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.devices)
        ? payload.devices
        : [];
    const nextCallsigns = Array.isArray(payload?.callsigns)
      ? payload.callsigns
      : nextResults
          .map((entry) => String(entry?.callsign || "").trim())
          .filter(Boolean);

    setResults(nextResults);
    setCallsigns(nextCallsigns);
    setDiscoverySource(String(payload?.discoverySource || ""));
    setConfiguredRange(
      payload?.configuredRange && typeof payload.configuredRange === "object"
        ? payload.configuredRange
        : null,
    );
    setFetchedAt(String(payload?.fetchedAt || ""));
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
        const response = await fetch("/api/aprs/ky4zo", {
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

        applySnapshot(payload);
        try {
          window.sessionStorage.setItem(
            SNAPSHOT_CACHE_KEY,
            JSON.stringify({
              results: payload?.results,
              devices: payload?.devices,
              callsigns: payload?.callsigns,
              discoverySource: payload?.discoverySource,
              configuredRange: payload?.configuredRange,
              fetchedAt: payload?.fetchedAt,
            }),
          );
        } catch {
          // Ignore storage errors.
        }
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
    let usedCache = false;
    try {
      const cachedRaw = window.sessionStorage.getItem(SNAPSHOT_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached === "object") {
          applySnapshot(cached);
          setLoading(false);
          usedCache = true;
        }
      }
    } catch {
      // Ignore cache read/parse errors.
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

  const rangeLabel = useMemo(() => {
    const min = Number(configuredRange?.minSsid);
    const max = Number(configuredRange?.maxSsid);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return "--";
    return `${min}..${max}`;
  }, [configuredRange]);

  const locatedCount = useMemo(
    () => results.filter((entry) => Boolean(entry?.hasLocation)).length,
    [results],
  );
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

  useEffect(() => {
    if (!selectedCallsign) return;
    const stillExists = results.some(
      (entry) => String(entry?.callsign || "").trim() === selectedCallsign,
    );
    if (!stillExists) {
      setSelectedCallsign("");
    }
  }, [results, selectedCallsign]);

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

  const mapPointCount = filteredMapResults.length;
  const mapLoading = loading && results.length === 0;
  const handleSelectCallsign = useCallback((callsign) => {
    const next = String(callsign || "").trim();
    if (!next) return;
    setSelectedCallsign(next);
  }, []);

  return (
    <section className="page">
      <PageIntro
        title="APRS"
        lede="Live KY4ZO positions from APRS internet service."
      />
      <p className={`lede ${styles.contextBlurb}`}>
        I am a ham with my Amateur Extra radio license, and my callsign is
        KY4ZO. APRS (Automatic Packet Reporting System) is a digital radio data
        network used to share position, telemetry, weather, and short status
        packets. Stations transmit small bursts of data that are relayed by
        digipeaters and iGates, then aggregated by services like APRS-IS so
        nearby and internet users can view live activity on a map.
      </p>

      <div className="ui-pillRow ui-mb12">
        <div className="ui-pill" data-tone="primary">
          {locatedCount} with location
        </div>
        <div className="ui-pill" data-tone="muted">
          {results.length || callsigns.length} total rows
        </div>
        <div className="ui-pill" data-tone="muted">
          KY4ZO range: {rangeLabel}
        </div>
        <div className="ui-pill" data-tone="muted">
          Discovery: {discoverySource || "--"}
        </div>
        <div className="ui-pill" data-tone="muted">
          Updated: {formatTimestamp(fetchedAt)}
        </div>
      </div>

      {error ? (
        <div className="card ui-errorCard">
          <h2>Unable to load APRS data</h2>
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
              onClick={() => loadSnapshot().catch(() => {})}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
        </div>
        <div className={`ui-helperText ${styles.mapMeta}`}>
          Showing {mapPointCount} map point{mapPointCount === 1 ? "" : "s"} for
          selected duration.
        </div>
        <AprsLeafletMap
          results={filteredMapResults}
          isLoading={mapLoading}
          selectedCallsign={selectedCallsign}
          onSelectCallsign={handleSelectCallsign}
        />
      </div>

      <div className={`card ${styles.tableCard}`}>
        <h2 className={styles.cardHeading}>Device Results</h2>
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
              {results.map((entry) => (
                <tr
                  key={entry.callsign}
                  className={`${entry.hasLocation ? "" : styles.rowNoFix} ${
                    selectedCallsign === entry.callsign
                      ? styles.rowSelected
                      : ""
                  }`.trim()}
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
                  <td>{formatNumber(entry.speedKmh, 1)}</td>
                  <td>
                    {Number.isFinite(Number(entry.courseDegrees))
                      ? `${formatNumber(entry.courseDegrees, 0)} deg`
                      : "--"}
                  </td>
                  <td>{formatTimestamp(entry.lastSeenIso)}</td>
                  <td>
                    <div className={styles.tableLinks}>
                      <a
                        className={styles.tableLinkBtn}
                        href={entry.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        APRS.fi map
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {results.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyRow}>
                    {loading ? "Loading rows..." : "No APRS rows returned."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
