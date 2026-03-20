import { useCallback, useEffect, useRef, useState } from "react";

function normalizeCatalogueTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function buildWorldCatalogueStatsMap(items) {
  const next = {};
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id) continue;
    next[item.id] = {
      firstCreatedAt: normalizeCatalogueTimestamp(item.firstCreatedAt),
      lastCreatedAt: normalizeCatalogueTimestamp(item.lastCreatedAt),
      createdCount: Math.max(0, Math.floor(Number(item.createdCount) || 0)),
    };
  }
  return next;
}

async function putRemoteCatalogueEvents(ids, { keepalive = false } = {}) {
  const response = await fetch("/api/reactor/catalogue", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    cache: "no-store",
    keepalive,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useReactorWorldSync({
  catalogueOpen,
  pollMs,
  flushMs,
  retryMs,
  batchMax,
}) {
  const [worldCatalogueStatsById, setWorldCatalogueStatsById] = useState({});
  const [worldCatalogueBadgeVisible, setWorldCatalogueBadgeVisible] =
    useState(false);

  const worldCatalogueBadgeTimerRef = useRef(null);
  const remoteCataloguePendingRef = useRef(new Map());
  const remoteCatalogueFlushTimerRef = useRef(null);
  const remoteCatalogueFlushInFlightRef = useRef(false);

  const showWorldCatalogueUpdatedReadout = useCallback(() => {
    if (worldCatalogueBadgeTimerRef.current) {
      window.clearTimeout(worldCatalogueBadgeTimerRef.current);
      worldCatalogueBadgeTimerRef.current = null;
    }
    setWorldCatalogueBadgeVisible(true);
    worldCatalogueBadgeTimerRef.current = window.setTimeout(() => {
      worldCatalogueBadgeTimerRef.current = null;
      setWorldCatalogueBadgeVisible(false);
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (worldCatalogueBadgeTimerRef.current) {
        window.clearTimeout(worldCatalogueBadgeTimerRef.current);
        worldCatalogueBadgeTimerRef.current = null;
      }
      if (remoteCatalogueFlushTimerRef.current) {
        window.clearTimeout(remoteCatalogueFlushTimerRef.current);
        remoteCatalogueFlushTimerRef.current = null;
      }
    };
  }, []);

  const flushRemoteCatalogueEvents = useCallback(
    async ({ keepalive = false, retryDelayMs = retryMs } = {}) => {
      const pendingSnapshot = Array.from(remoteCataloguePendingRef.current.values())
        .filter((row) => Math.max(0, Math.floor(Number(row?.count) || 0)) > 0)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const pendingIds = [];
      const sentCounts = [];
      for (const row of pendingSnapshot) {
        if (pendingIds.length >= batchMax) break;
        const takeCount = Math.min(
          Math.max(0, Math.floor(Number(row.count) || 0)),
          batchMax - pendingIds.length,
        );
        if (takeCount <= 0) continue;
        sentCounts.push({ id: row.id, count: takeCount });
        for (let i = 0; i < takeCount; i += 1) pendingIds.push(row.id);
      }

      if (pendingIds.length <= 0) return;
      if (remoteCatalogueFlushInFlightRef.current) return;

      if (remoteCatalogueFlushTimerRef.current) {
        window.clearTimeout(remoteCatalogueFlushTimerRef.current);
        remoteCatalogueFlushTimerRef.current = null;
      }

      remoteCatalogueFlushInFlightRef.current = true;
      try {
        const result = await putRemoteCatalogueEvents(pendingIds, { keepalive });
        if (Array.isArray(result?.items) && result.items.length > 0) {
          const updated = buildWorldCatalogueStatsMap(result.items);
          setWorldCatalogueStatsById((prev) => ({ ...prev, ...updated }));
          showWorldCatalogueUpdatedReadout();
        }
        for (const sent of sentCounts) {
          const current = remoteCataloguePendingRef.current.get(sent.id);
          if (!current) continue;
          const remaining =
            Math.max(0, Math.floor(Number(current.count) || 0)) - sent.count;
          if (remaining <= 0) {
            remoteCataloguePendingRef.current.delete(sent.id);
          } else {
            current.count = remaining;
          }
        }
      } catch {
        if (
          typeof window !== "undefined" &&
          !remoteCatalogueFlushTimerRef.current
        ) {
          remoteCatalogueFlushTimerRef.current = window.setTimeout(() => {
            remoteCatalogueFlushTimerRef.current = null;
            void flushRemoteCatalogueEvents();
          }, retryDelayMs);
        }
      } finally {
        remoteCatalogueFlushInFlightRef.current = false;
        if (
          typeof window !== "undefined" &&
          Array.from(remoteCataloguePendingRef.current.values()).some(
            (row) => Math.max(0, Math.floor(Number(row?.count) || 0)) > 0,
          ) &&
          !remoteCatalogueFlushTimerRef.current
        ) {
          remoteCatalogueFlushTimerRef.current = window.setTimeout(() => {
            remoteCatalogueFlushTimerRef.current = null;
            void flushRemoteCatalogueEvents();
          }, flushMs);
        }
      }
    },
    [batchMax, flushMs, retryMs, showWorldCatalogueUpdatedReadout],
  );

  const scheduleRemoteCatalogueFlush = useCallback(
    (delayMs = flushMs) => {
      if (typeof window === "undefined") return;
      if (remoteCatalogueFlushTimerRef.current) return;
      remoteCatalogueFlushTimerRef.current = window.setTimeout(
        () => {
          remoteCatalogueFlushTimerRef.current = null;
          void flushRemoteCatalogueEvents();
        },
        Math.max(250, Math.floor(Number(delayMs) || flushMs)),
      );
    },
    [flushMs, flushRemoteCatalogueEvents],
  );

  const loadWorldCatalogueStats = useCallback(async () => {
    const response = await fetch("/api/reactor/catalogue", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setWorldCatalogueStatsById(buildWorldCatalogueStatsMap(payload?.items));
  }, []);

  useEffect(() => {
    if (!catalogueOpen) return undefined;
    let cancelled = false;
    let inFlight = false;

    const refresh = async () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        await loadWorldCatalogueStats();
      } catch {}
      finally {
        inFlight = false;
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      void refresh();
    }, pollMs);
    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [catalogueOpen, loadWorldCatalogueStats, pollMs]);

  const queueRemoteCatalogueEvents = useCallback(
    (ids) => {
      const normalizedIds = (Array.isArray(ids) ? ids : [])
        .map((id) => String(id).trim())
        .filter(Boolean);
      if (normalizedIds.length <= 0) return;

      for (const id of normalizedIds) {
        const existing = remoteCataloguePendingRef.current.get(id);
        if (!existing) {
          remoteCataloguePendingRef.current.set(id, {
            id,
            count: 1,
          });
          continue;
        }
        existing.count += 1;
      }

      let pendingEventCount = 0;
      for (const row of remoteCataloguePendingRef.current.values()) {
        pendingEventCount += Math.max(0, Math.floor(Number(row?.count) || 0));
      }

      if (pendingEventCount >= batchMax) {
        void flushRemoteCatalogueEvents();
        return;
      }

      scheduleRemoteCatalogueFlush();
    },
    [batchMax, flushRemoteCatalogueEvents, scheduleRemoteCatalogueFlush],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const flushNow = () => {
      void flushRemoteCatalogueEvents({
        keepalive: true,
        retryDelayMs: retryMs,
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushNow();
    };

    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushRemoteCatalogueEvents, retryMs]);

  return {
    worldCatalogueStatsById,
    worldCatalogueBadgeVisible,
    queueRemoteCatalogueEvents,
  };
}

