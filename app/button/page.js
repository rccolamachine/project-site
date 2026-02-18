"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DesktopBadge from "../../components/DesktopBadge";
import { fetchCounterState, postCounterIncrement } from "./buttonApi";
import ResetModal from "./components/ResetModal";
import ShameWall from "./components/ShameWall";
import ValueTimelineChart from "./components/ValueTimelineChart";
import {
  getAvailableRangeOptions,
  normalizeShame,
  normalizeValueSeries,
  upsertValueSeriesPoint,
} from "./buttonUtils";
import styles from "./button.module.css";

export default function ButtonGamePage() {
  const [value, setValue] = useState(0);
  const [max, setMax] = useState(0);
  const [maxAt, setMaxAt] = useState("");
  const [valueSeries, setValueSeries] = useState([]);
  const [valueSeriesMeta, setValueSeriesMeta] = useState(null);
  const [valueSeriesRange, setValueSeriesRange] = useState("all");
  const [shame, setShame] = useState([]);
  const [err, setErr] = useState("");

  const pendingRef = useRef(0);
  const timerRef = useRef(null);
  const [pendingUi, setPendingUi] = useState(0);
  const [lastClickAt, setLastClickAt] = useState("");

  const [showReset, setShowReset] = useState(false);

  const stateInFlightRef = useRef(null);
  const stateInFlightRangeRef = useRef("");
  const lastStateAtRef = useRef(0);

  const displayValue = useMemo(() => value + pendingUi, [value, pendingUi]);

  const displayValueSeries = useMemo(
    () =>
      upsertValueSeriesPoint(
        valueSeries,
        new Date().toISOString(),
        displayValue,
        valueSeriesMeta?.bucketMs,
      ),
    [valueSeries, displayValue, valueSeriesMeta?.bucketMs],
  );

  const availableRangeOptions = useMemo(
    () => getAvailableRangeOptions(valueSeriesMeta?.historySpanMs),
    [valueSeriesMeta?.historySpanMs],
  );

  const activeValueSeriesRange = useMemo(() => {
    if (availableRangeOptions.length <= 0) return "30m";
    const hasCurrent = availableRangeOptions.some(
      (opt) => opt.value === valueSeriesRange,
    );
    if (hasCurrent) return valueSeriesRange;
    return availableRangeOptions[availableRangeOptions.length - 1]?.value || "30m";
  }, [availableRangeOptions, valueSeriesRange]);

  const applyState = useCallback((state) => {
    setValue(Number(state?.value ?? 0));
    setMax(Number(state?.max ?? 0));
    setMaxAt(String(state?.maxAt ?? ""));
    setValueSeries(normalizeValueSeries(state?.valueSeries));
    setValueSeriesMeta(
      state?.valueSeriesMeta && typeof state.valueSeriesMeta === "object"
        ? state.valueSeriesMeta
        : null,
    );
    setLastClickAt(String(state?.lastClickAt ?? ""));
    setShame(normalizeShame(state?.shame));
  }, []);

  const syncState = useCallback(
    async (opts = {}) => {
      const { force = false, minGapMs = 2000, range = activeValueSeriesRange } =
        opts;
      const now = Date.now();

      if (!force && now - lastStateAtRef.current < minGapMs) return;

      const normalizedRange = String(range || "all");
      if (
        stateInFlightRef.current &&
        stateInFlightRangeRef.current === normalizedRange
      ) {
        return stateInFlightRef.current;
      }

      stateInFlightRef.current = (async () => {
        lastStateAtRef.current = Date.now();
        stateInFlightRangeRef.current = normalizedRange;

        const nextState = await fetchCounterState(range);
        applyState(nextState);
        setErr("");
        return nextState;
      })()
        .catch((error) => {
          setErr(error?.message || String(error));
          throw error;
        })
        .finally(() => {
          stateInFlightRef.current = null;
          stateInFlightRangeRef.current = "";
        });

      return stateInFlightRef.current;
    },
    [activeValueSeriesRange, applyState],
  );

  useEffect(() => {
    let alive = true;

    const load = async (force = false) => {
      try {
        if (!alive) return;
        await syncState({ force, minGapMs: 1500, range: activeValueSeriesRange });
      } catch {
        // Error is already persisted in component state.
      }
    };

    load(true);

    const pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load(false);
    }, 15000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        load(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      alive = false;
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeValueSeriesRange, syncState]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const flushIncrements = useCallback(async () => {
    const delta = pendingRef.current;
    if (!delta) return;

    pendingRef.current = 0;
    setPendingUi(0);

    try {
      const data = await postCounterIncrement(delta);
      setValue(Number(data.value ?? 0));
      setMax(Number(data.max ?? 0));
      setMaxAt(String(data.maxAt ?? ""));
      setLastClickAt(String(data.lastClickAt ?? ""));
      setValueSeries((prev) =>
        upsertValueSeriesPoint(
          prev,
          String(data.lastClickAt ?? new Date().toISOString()),
          Number(data.value ?? 0),
          valueSeriesMeta?.bucketMs,
        ),
      );
      setErr("");
    } catch (error) {
      setErr(error?.message || String(error));
      try {
        await syncState({ force: true });
      } catch {
        // Keep latest error already set.
      }
    }
  }, [syncState, valueSeriesMeta?.bucketMs]);

  const handleIncrement = () => {
    setErr("");
    setLastClickAt(new Date().toISOString());

    pendingRef.current += 1;
    setPendingUi((pending) => pending + 1);

    if (timerRef.current) return;

    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      await flushIncrements();
    }, 5000);
  };

  const openResetModal = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    pendingRef.current = 0;
    setPendingUi(0);

    try {
      await syncState({ force: true });
    } catch {
      // Leave modal usable even if sync fails.
    }

    setShowReset(true);
  };

  const handleResetSubmitted = useCallback(
    (entry) => {
      setValue(0);
      setErr("");
      setValueSeries((prev) =>
        upsertValueSeriesPoint(
          prev,
          String(entry?.resetAt ?? new Date().toISOString()),
          0,
          valueSeriesMeta?.bucketMs,
        ),
      );
      setShame((prev) => [entry, ...(Array.isArray(prev) ? prev : [])]);

      setTimeout(() => {
        syncState({ force: true }).catch(() => {});
      }, 1200);
    },
    [syncState, valueSeriesMeta?.bucketMs],
  );

  return (
    <section className={`page ${styles.page}`}>
      <header className={styles.header}>
        <h1>Button</h1>
        <p className="lede">
          Shared counter for everyone. Batches increments every 5 seconds.
        </p>
      </header>

      <DesktopBadge />

      {err ? <div className={styles.errorBanner}>{err}</div> : null}

      <div className={styles.controlsBleed}>
        <div className={styles.controlsOuter}>
          <div className={styles.controlsInner}>
            <div className={styles.controlsGrid}>
              <button
                className={`btn ${styles.heroButton} ${styles.incrementPulse}`}
                onClick={handleIncrement}
              >
                Increment <br />
                (Current += 1)
              </button>

              <button
                className={`btn ${styles.heroButton} ${styles.resetPulse}`}
                onClick={openResetModal}
              >
                Reset <br />
                (Current = 0)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.statsInner}>
        <div className={styles.statsGrid}>
          <div className="card" style={{ textAlign: "right" }}>
            <div className={styles.metricLabel}>Current</div>
            <div className={`${styles.metricValue} ${styles.metricValueCurrent}`}>
              {displayValue}
            </div>
            <div className={styles.metricMeta}>
              {pendingUi
                ? `pending +${pendingUi}`
                : lastClickAt
                  ? `last increment: ${new Date(lastClickAt).toLocaleString()}`
                  : "-"}
            </div>
          </div>

          <div className="card">
            <div className={styles.chartHeader}>
              <span className={styles.chartTitle}>
                <span className={styles.newBadge}>NEW</span>
                <span className={styles.metricLabel}>Count over time</span>
              </span>

              {availableRangeOptions.length > 1 ? (
                <select
                  value={activeValueSeriesRange}
                  onChange={(event) =>
                    setValueSeriesRange(String(event.target.value || "30m"))
                  }
                  className={styles.chartRangeSelect}
                >
                  {availableRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <ValueTimelineChart series={displayValueSeries} meta={valueSeriesMeta} />
          </div>

          <div className="card">
            <div className={styles.metricLabel}>Max</div>
            <div className={styles.metricValue}>{max}</div>
            <div className={styles.metricMeta}>
              {maxAt ? new Date(maxAt).toLocaleString() : "-"}
            </div>
          </div>
        </div>
      </div>

      <h2 className={styles.shameHeading}>Wall of Shame</h2>
      <ShameWall entries={shame} />

      <ResetModal
        isOpen={showReset}
        currentValue={value}
        onClose={() => setShowReset(false)}
        onSubmitted={handleResetSubmitted}
      />
    </section>
  );
}
