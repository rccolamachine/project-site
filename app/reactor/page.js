// app/reactor/page.js
"use client";

import Image from "next/image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import DesktopBadge from "../../components/DesktopBadge";
import { useReactorWorldSync } from "./hooks/useReactorWorldSync";
import { useReactorSimulationLoop } from "./hooks/useReactorSimulationLoop";
import AutomationBuilderPanel from "./components/AutomationBuilderPanel";

import {
  DEFAULT_ELEMENTS_3D,
  DEFAULT_LJ,
  addAtom3D,
  clearSim3D,
  createSim3D,
  nudgeAll,
  removeAtom3D,
  setGrab,
  setGrabTarget,
  DEFAULT_CHARGES,
} from "@/lib/sim/physics3d";
import MOLECULE_CATALOG from "@/data/reactor_molecules.json";
import { analyzeMoleculeComponents } from "@/lib/reactor/moleculeTools.mjs";
import {
  decryptCatalogueJsonPayload,
  encryptCatalogueJson,
  REACTOR_SAVE_EXPORT_FORMAT,
} from "./reactorSaveCrypto";
import {
  ATOMIC_WEIGHTS,
  catalogueNumberFromId,
  CatalogueNameCell,
  computeMolecularWeight,
  formulaWithSubscripts,
  MoleculeBallStickPreview,
  MoleculeRotatingPreview,
} from "./reactorPreviews";
import discovererMedal from "./assets/discoverer_medal.png";
import tempBathLeftIcon from "./assets/left.png";
import tempBathRightIcon from "./assets/right.png";
import "./reactor.css";

const ELEMENTS = ["S", "P", "O", "N", "C", "H"];
const ELEMENT_NAMES = Object.freeze({
  S: "Sulfur",
  P: "Phosphorus",
  O: "Oxygen",
  N: "Nitrogen",
  C: "Carbon",
  H: "Hydrogen",
});
const EMPTY_ELEMENT_COUNTS = Object.freeze(
  Object.fromEntries(ELEMENTS.map((el) => [el, 0])),
);
const ROOM_TEMP_K = 300;
const FIXED_CUTOFF = 4.2;
const DEFAULT_TEMPERATURE_K = 520;
const DEFAULT_DAMPING = 0.993;
const DEFAULT_BOND_SCALE = 3.5;
const DEFAULT_ALLOW_MULTIPLE_BONDS = true;
const DEFAULT_ADAPTIVE_FORCE_FIELD = true;
const DEFAULT_BOX_HALF_SIZE = 4.8;
const PERIODIC_REPEAT_MARGIN = 1.6;
const CATALOGUE_STORAGE_KEY = "reactor-molecule-catalogue-v1";
const LEGACY_COLLECTION_STORAGE_KEY = "reactor-molecule-collection-v1";
const COLLECTION_SCAN_INTERVAL_STEPS = 8;
const THERMO_HISTORY_WINDOW_MS = 60_000;
const THERMO_SAMPLE_MS = 1_000;
const COLLECTION_PAGE_SIZE = 36;
const FIRST_DISCOVERY_CALLOUT_MS = 5200;
const FIRST_DISCOVERY_CALLOUT_FADE_MS = 1700;
const WORLD_CATALOGUE_POLL_MS = 20_000;
const REMOTE_CATALOGUE_FLUSH_MS = 20_000;
const REMOTE_CATALOGUE_RETRY_MS = 45_000;
const REMOTE_CATALOGUE_BATCH_MAX = 120;
const REACTOR_OVERLAY_LIGHT_TEXT = "#e2e8f0";
const REACTOR_PLOT_TEMP_COLOR = "#ff4fd8";
const REACTOR_PLOT_PRESSURE_COLOR = "#2de2e6";
const MIN_CATALOGUE_VISIBLE_ROWS = 3;
const CATALOGUE_GRID_COLUMNS = "74px 92px 240px 112px 176px 176px";
const CATALOGUE_TABLE_WIDTH_PX = 926;
const CREATED_SORT_CYCLE = Object.freeze([
  "me-asc",
  "me-desc",
  "world-asc",
  "world-desc",
]);
const LIVE_SELECTION_PALETTE = Object.freeze([
  {
    atomSoft: "#86efac",
    atomBright: "#16a34a",
    bondSoft: "#86efac",
    bondBright: "#16a34a",
    rowBg: "rgba(22,163,74,0.2)",
    rowBorder: "rgba(21,128,61,0.55)",
    status: "#166534",
  },
  {
    atomSoft: "#f9a8d4",
    atomBright: "#db2777",
    bondSoft: "#f9a8d4",
    bondBright: "#db2777",
    rowBg: "rgba(236,72,153,0.2)",
    rowBorder: "rgba(190,24,93,0.55)",
    status: "#9d174d",
  },
  {
    atomSoft: "#d8b4fe",
    atomBright: "#9333ea",
    bondSoft: "#d8b4fe",
    bondBright: "#9333ea",
    rowBg: "rgba(168,85,247,0.2)",
    rowBorder: "rgba(126,34,206,0.55)",
    status: "#6b21a8",
  },
  {
    atomSoft: "#67e8f9",
    atomBright: "#0891b2",
    bondSoft: "#67e8f9",
    bondBright: "#0891b2",
    rowBg: "rgba(6,182,212,0.2)",
    rowBorder: "rgba(14,116,144,0.55)",
    status: "#155e75",
  },
  {
    atomSoft: "#fdba74",
    atomBright: "#ea580c",
    bondSoft: "#fdba74",
    bondBright: "#ea580c",
    rowBg: "rgba(249,115,22,0.2)",
    rowBorder: "rgba(194,65,12,0.55)",
    status: "#9a3412",
  },
]);

const TOOL = {
  PLACE: "place",
  DELETE: "delete",
  ROTATE: "rotate",
  SAVE: "save",
};
const TEMP_BATH_MODE = Object.freeze({
  FAST_COOL: "fast-cool",
  SLOW_COOL: "slow-cool",
  OFF: "off",
  SLOW_HEAT: "slow-heat",
  FAST_HEAT: "fast-heat",
});
const TEMP_BATH_RATE_K_PER_SEC = Object.freeze({
  [TEMP_BATH_MODE.FAST_COOL]: -150,
  [TEMP_BATH_MODE.SLOW_COOL]: -60,
  [TEMP_BATH_MODE.OFF]: 0,
  [TEMP_BATH_MODE.SLOW_HEAT]: 60,
  [TEMP_BATH_MODE.FAST_HEAT]: 150,
});
const TEMP_BATH_PULSE = Object.freeze({
  COOL: "cool",
  HEAT: "heat",
});
const TEMP_BATH_PULSE_RATE_K_PER_SEC = 220;
const TEMP_CONTROL_MIN_K = 0;
const TEMP_CONTROL_MAX_K = 1800;
const PRESSURE_BATH_MODE = Object.freeze({
  FAST_EXPAND: "fast-expand",
  SLOW_EXPAND: "slow-expand",
  OFF: "off",
  SLOW_CONTRACT: "slow-contract",
  FAST_CONTRACT: "fast-contract",
});
const PRESSURE_BATH_RATE_BOX_PER_SEC = Object.freeze({
  [PRESSURE_BATH_MODE.FAST_EXPAND]: 1.2,
  [PRESSURE_BATH_MODE.SLOW_EXPAND]: 0.45,
  [PRESSURE_BATH_MODE.OFF]: 0,
  [PRESSURE_BATH_MODE.SLOW_CONTRACT]: -0.45,
  [PRESSURE_BATH_MODE.FAST_CONTRACT]: -1.2,
});
const PRESSURE_BATH_PULSE = Object.freeze({
  EXPAND: "expand",
  CONTRACT: "contract",
});
const PRESSURE_BATH_PULSE_RATE_BOX_PER_SEC = 1.8;
const PRESSURE_CONTROL_MIN_BOX_HALF_SIZE = 2.0;
const PRESSURE_CONTROL_MAX_BOX_HALF_SIZE = 14;
const AUTOMATION_ACTION_KIND = Object.freeze({
  CONDITION: "condition",
  ATOMS: "atoms",
  WAIT: "wait",
});
const AUTOMATION_SPEED_OPTIONS = Object.freeze(["slowly", "quickly"]);
const AUTOMATION_DIRECTION_OPTIONS = Object.freeze([
  "increase",
  "decrease",
]);
const AUTOMATION_CONDITION_TARGET_OPTIONS = Object.freeze([
  "temperature",
  "volume",
]);
const AUTOMATION_DURATION_OPTIONS = Object.freeze([5, 10, 20, 30]);
const AUTOMATION_ATOM_COUNT_OPTIONS = Object.freeze([1, 2, 3, 4, 5, 10, 20]);
const AUTOMATION_ATOM_REMOVE_COUNT_OPTIONS = Object.freeze([
  1,
  2,
  3,
  4,
  5,
  10,
  20,
  "half",
  "all",
]);
const AUTOMATION_TEMPERATURE_RATE_BY_SPEED = Object.freeze({
  slowly: 60,
  quickly: 150,
});
const AUTOMATION_VOLUME_RATE_BY_SPEED = Object.freeze({
  slowly: 0.45,
  quickly: 1.2,
});

function normalizeAutomationBuilderAtomOperation(value) {
  return value === "remove" ? "remove" : "add";
}

function normalizeAutomationBuilderIncomingEdge(value) {
  return value === "while" || value === "then" ? value : null;
}

function createAutomationBuilderAtomEntry(operation = "add") {
  const op = normalizeAutomationBuilderAtomOperation(operation);
  return {
    count: op === "remove" ? "half" : 4,
    element: "H",
  };
}

function normalizeAutomationBuilderAtomEntry(rawEntry, operation = "add") {
  const op = normalizeAutomationBuilderAtomOperation(operation);
  const rawElement = String(rawEntry?.element || "H");
  const element = ELEMENTS.includes(rawElement) ? rawElement : "H";
  if (op === "remove") {
    const rawCount = rawEntry?.count;
    const count =
      rawCount === "half" || rawCount === "all"
        ? rawCount
        : Math.max(1, Math.floor(Number(rawCount) || 1));
    return { count, element };
  }
  const numericCount = Number(rawEntry?.count);
  return {
    count: Number.isFinite(numericCount)
      ? Math.max(1, Math.floor(numericCount))
      : 4,
    element,
  };
}

function normalizeAutomationBuilderAtomEntries(rawAction, operation = "add") {
  const entriesSource =
    Array.isArray(rawAction?.atomEntries) && rawAction.atomEntries.length > 0
      ? rawAction.atomEntries
      : [{ count: rawAction?.count, element: rawAction?.element }];
  const normalizedEntries = entriesSource
    .map((entry) => normalizeAutomationBuilderAtomEntry(entry, operation))
    .filter(Boolean);
  return normalizedEntries.length > 0
    ? normalizedEntries
    : [createAutomationBuilderAtomEntry(operation)];
}

function areAutomationBuilderAtomEntriesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]?.element || "") !== String(b[i]?.element || "")) return false;
    if (String(a[i]?.count ?? "") !== String(b[i]?.count ?? "")) return false;
  }
  return true;
}

function createAutomationBuilderAtomEntriesFromCounts(counts = {}) {
  return ELEMENTS.map((el) => ({
    element: el,
    count: Math.max(0, Math.floor(Number(counts?.[el]) || 0)),
  })).filter((entry) => entry.count > 0);
}

function createAutomationBuilderAction(
  id,
  kind = AUTOMATION_ACTION_KIND.CONDITION,
  incomingEdge = null,
) {
  const base = {
    id,
    incomingEdge: normalizeAutomationBuilderIncomingEdge(incomingEdge),
    whileActions: [],
    thenActions: [],
  };
  if (kind === AUTOMATION_ACTION_KIND.WAIT) {
    return {
      ...base,
      kind,
      durationSec: 5,
    };
  }
  if (kind === AUTOMATION_ACTION_KIND.ATOMS) {
    const atomEntries = [createAutomationBuilderAtomEntry("add")];
    return {
      ...base,
      kind,
      operation: "add",
      count: atomEntries[0].count,
      element: atomEntries[0].element,
      atomEntries,
    };
  }
  return {
    ...base,
    kind: AUTOMATION_ACTION_KIND.CONDITION,
    speed: "slowly",
    direction: "increase",
    target: "temperature",
    durationSec: 5,
  };
}

function createDefaultTrapBreakerAutomationBuilderActions() {
  const step1 = {
    ...createAutomationBuilderAction("builder-action-1", AUTOMATION_ACTION_KIND.CONDITION),
    speed: "quickly",
    direction: "increase",
    target: "temperature",
    durationSec: 10,
    whileActions: [
      {
        ...createAutomationBuilderAction(
          "builder-action-2",
          AUTOMATION_ACTION_KIND.CONDITION,
          "while",
        ),
        speed: "quickly",
        direction: "decrease",
        target: "volume",
        durationSec: 10,
      },
    ],
  };
  const step2 = {
    ...createAutomationBuilderAction(
      "builder-action-3",
      AUTOMATION_ACTION_KIND.WAIT,
      "then",
    ),
    durationSec: 10,
  };
  const step3 = {
    ...createAutomationBuilderAction(
      "builder-action-4",
      AUTOMATION_ACTION_KIND.CONDITION,
      "then",
    ),
    speed: "slowly",
    direction: "decrease",
    target: "temperature",
    durationSec: 10,
    whileActions: [
      {
        ...createAutomationBuilderAction(
          "builder-action-5",
          AUTOMATION_ACTION_KIND.CONDITION,
          "while",
        ),
        speed: "slowly",
        direction: "increase",
        target: "volume",
        durationSec: 10,
      },
      {
        ...createAutomationBuilderAction(
          "builder-action-6",
          AUTOMATION_ACTION_KIND.ATOMS,
          "while",
        ),
        operation: "add",
        atomEntries: createAutomationBuilderAtomEntriesFromCounts(
          AUTOMATION_FEEDS.trapBalanced.counts,
        ),
      },
    ],
  };
  return [step1, step2, step3];
}

function getAutomationBuilderNextActionSeq(actions) {
  let maxId = 0;
  const visit = (nodes) => {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const id = String(node?.id || "");
      const match = id.match(/^builder-action-(\d+)$/);
      if (match) maxId = Math.max(maxId, parseInt(match[1], 10) || 0);
      visit(node?.whileActions);
      visit(node?.thenActions);
    }
  };
  visit(actions);
  return Math.max(1, maxId + 1);
}

function computeBondScaleFromTemperature(temperatureK) {
  const t = Math.max(0, Number(temperatureK) || 0);
  if (t >= DEFAULT_TEMPERATURE_K) {
    const highDelta = t - DEFAULT_TEMPERATURE_K;
    return clamp(DEFAULT_BOND_SCALE - highDelta * 0.0009, 2.1, 5.4);
  }
  const lowDelta = DEFAULT_TEMPERATURE_K - t;
  return clamp(DEFAULT_BOND_SCALE + lowDelta * 0.0018, 2.1, 5.4);
}

function computeDampingFromTemperature(temperatureK) {
  const t = Math.max(0, Number(temperatureK) || 0);
  const delta = Math.max(0, t - DEFAULT_TEMPERATURE_K);
  return clamp(DEFAULT_DAMPING + delta * 0.0000053, DEFAULT_DAMPING, 0.9995);
}

const AUTOMATION_FEEDS = Object.freeze({
  trapBalanced: {
    label: "Trap feed",
    description: "Balanced pulse used during trap-cycle runs.",
    counts: { C: 5, N: 2, O: 3, P: 1, S: 1, H: 8 },
    jitter: 1.4,
  },
  scaffoldBuild: {
    label: "Scaffold feed",
    description: "Heavy-first scaffold mix used during scaffold stage.",
    counts: { C: 8, N: 3, O: 4, P: 1, S: 1, H: 0 },
    jitter: 1.55,
  },
  hydrogenPulse: {
    label: "Hydrogen pulse",
    description: "Hydrogen-only pulse used during cap/hydrogenation stage.",
    counts: { H: 20, C: 0, N: 0, O: 0, P: 0, S: 0 },
    jitter: 1.3,
  },
});

function getAutomationAlphabetSegment(index) {
  let cursor = Math.max(0, Math.floor(Number(index) || 0));
  let suffix = "";
  while (cursor >= 0) {
    suffix = String.fromCharCode(97 + (cursor % 26)) + suffix;
    cursor = Math.floor(cursor / 26) - 1;
  }
  return suffix;
}

const CATALOG_ID_SET = new Set(MOLECULE_CATALOG.map((entry) => entry.id));
const CATALOGUE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const CATALOGUE_DATE_ONLY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});
const CATALOGUE_TIME_ONLY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatThermoScalar(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(0);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 10) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(3);
  if (abs >= 0.01) return n.toFixed(4);
  return n.toPrecision(2);
}

function normalizeCatalogueTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeLocalCatalogueProgress(candidate) {
  const ids = new Set();
  const moleculeStatsById = {};

  if (Array.isArray(candidate)) {
    for (const id of candidate) {
      if (typeof id !== "string" || !CATALOG_ID_SET.has(id)) continue;
      ids.add(id);
    }
    return { collectedIds: Array.from(ids).sort(), moleculeStatsById };
  }

  const parsed = candidate && typeof candidate === "object" ? candidate : {};
  const idsRaw = Array.isArray(parsed?.collectedIds) ? parsed.collectedIds : [];
  for (const id of idsRaw) {
    if (typeof id !== "string" || !CATALOG_ID_SET.has(id)) continue;
    ids.add(id);
  }

  const rawStats =
    parsed?.moleculeStatsById && typeof parsed.moleculeStatsById === "object"
      ? parsed.moleculeStatsById
      : parsed?.localMoleculeStats &&
          typeof parsed.localMoleculeStats === "object"
        ? parsed.localMoleculeStats
        : {};

  for (const [id, raw] of Object.entries(rawStats)) {
    if (!CATALOG_ID_SET.has(id) || !raw || typeof raw !== "object") continue;
    let firstCreatedAt = normalizeCatalogueTimestamp(raw.firstCreatedAt);
    let lastCreatedAt = normalizeCatalogueTimestamp(raw.lastCreatedAt);
    const createdCount = Math.max(0, Math.floor(Number(raw.createdCount) || 0));

    if (!firstCreatedAt && lastCreatedAt) firstCreatedAt = lastCreatedAt;
    if (!lastCreatedAt && firstCreatedAt) lastCreatedAt = firstCreatedAt;
    if (!firstCreatedAt && !lastCreatedAt && createdCount <= 0) continue;
    if (firstCreatedAt && lastCreatedAt && firstCreatedAt > lastCreatedAt) {
      const swap = firstCreatedAt;
      firstCreatedAt = lastCreatedAt;
      lastCreatedAt = swap;
    }

    ids.add(id);
    moleculeStatsById[id] = {
      firstCreatedAt,
      lastCreatedAt,
      createdCount,
    };
  }

  return {
    collectedIds: Array.from(ids).sort(),
    moleculeStatsById,
  };
}

function readSavedCatalogueProgressFromStorage() {
  if (typeof window === "undefined") {
    return { collectedIds: [], moleculeStatsById: {} };
  }
  try {
    const raw =
      window.localStorage.getItem(CATALOGUE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_COLLECTION_STORAGE_KEY);
    if (!raw) return { collectedIds: [], moleculeStatsById: {} };
    return normalizeLocalCatalogueProgress(JSON.parse(raw));
  } catch {
    return { collectedIds: [], moleculeStatsById: {} };
  }
}

function readSavedCatalogueIdsFromStorage() {
  return readSavedCatalogueProgressFromStorage().collectedIds;
}

function formatCatalogueTimestampMinute(value) {
  const iso = normalizeCatalogueTimestamp(value);
  if (!iso) return "--";
  return CATALOGUE_TIMESTAMP_FORMATTER.format(new Date(iso));
}

function formatCatalogueDateOnly(value) {
  const iso = normalizeCatalogueTimestamp(value);
  if (!iso) return "--";
  return CATALOGUE_DATE_ONLY_FORMATTER.format(new Date(iso));
}

function formatCatalogueTimeOnly(value) {
  const iso = normalizeCatalogueTimestamp(value);
  if (!iso) return "--";
  return CATALOGUE_TIME_ONLY_FORMATTER.format(new Date(iso));
}

function compareOptionalIsoTimestamps(a, b) {
  const aHas = Boolean(a);
  const bHas = Boolean(b);
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas && !bHas) return 0;
  return String(a).localeCompare(String(b));
}

function advanceCreatedSortMode(mode) {
  const currentIndex = CREATED_SORT_CYCLE.indexOf(String(mode || ""));
  if (currentIndex < 0) return CREATED_SORT_CYCLE[0];
  return CREATED_SORT_CYCLE[(currentIndex + 1) % CREATED_SORT_CYCLE.length];
}

function createdSortBadgeLabel(mode) {
  return String(mode || "").startsWith("world-") ? "W" : "M";
}

function CreatedTimestampStack({
  label,
  timestamp,
  titlePrefix,
  align = "left",
  labelColor,
  valueColor,
}) {
  const hasTimestamp = Boolean(timestamp);
  const isRight = align === "right";
  const title = hasTimestamp
    ? `${titlePrefix}: ${formatCatalogueTimestampMinute(timestamp)}`
    : undefined;

  return (
    <div
      title={title}
      className={`reactor-created-stack${isRight ? " is-right" : ""}`}
      style={{
        "--reactor-created-label-color": labelColor,
        "--reactor-created-value-color": valueColor,
      }}
    >
      <span className="reactor-created-stack-label">{label}</span>
      <span className="reactor-created-stack-value">
        {hasTimestamp ? formatCatalogueDateOnly(timestamp) : "to-do"}
      </span>
      <span className="reactor-created-stack-time">
        {hasTimestamp ? formatCatalogueTimeOnly(timestamp) : "\u00A0"}
      </span>
    </div>
  );
}

function CreatedTimestampCell({
  meTimestamp,
  worldTimestamp,
  meTitlePrefix,
  worldTitlePrefix,
  showMedal = false,
}) {
  return (
    <div
      className={`reactor-catalogue-status-wrap reactor-created-cell${showMedal ? " has-medal" : ""}`}
    >
      <CreatedTimestampStack
        label="Me"
        timestamp={meTimestamp}
        titlePrefix={meTitlePrefix}
        align="left"
        labelColor={meTimestamp ? "#166534" : "#334155"}
        valueColor={meTimestamp ? "#166534" : "#64748b"}
      />
      {showMedal ? (
        <div title="World's First Discoverer" className="reactor-created-medal-wrap">
          <Image
            src={discovererMedal}
            alt="First discoverer medal"
            width={28}
            height={28}
            className="reactor-created-medal"
          />
        </div>
      ) : null}
      <CreatedTimestampStack
        label="World"
        timestamp={worldTimestamp}
        titlePrefix={worldTitlePrefix}
        align="right"
        labelColor="#334155"
        valueColor="#475569"
      />
    </div>
  );
}

function chooseLastCreatedCatalogueId(collectedIds, moleculeStatsById) {
  let bestId = null;
  let bestTs = "";
  for (const id of collectedIds || []) {
    const lastCreatedAt = moleculeStatsById?.[id]?.lastCreatedAt || "";
    if (!lastCreatedAt) continue;
    if (!bestId || lastCreatedAt > bestTs) {
      bestId = id;
      bestTs = lastCreatedAt;
    }
  }
  return bestId || (collectedIds?.[collectedIds.length - 1] ?? null);
}

export default function ReactorPage() {
  const MAX_ATOMS = 200;

  // tool state
  const [tool, setTool] = useState(TOOL.PLACE);
  const toolRef = useRef(tool);
  useEffect(() => void (toolRef.current = tool), [tool]);

  // placement element (only when Place selected)
  const [placeElement, setPlaceElement] = useState("C");

  // bonds toggles
  const [showBonds, setShowBonds] = useState(true);
  const showBondsRef = useRef(true);
  useEffect(() => void (showBondsRef.current = showBonds), [showBonds]);

  const allowMultipleBonds = DEFAULT_ALLOW_MULTIPLE_BONDS;
  const allowMultipleBondsRef = useRef(DEFAULT_ALLOW_MULTIPLE_BONDS);

  // sim toggles
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => void (pausedRef.current = paused), [paused]);

  // temperature control
  const [temperatureK, setTemperatureK] = useState(DEFAULT_TEMPERATURE_K);
  const [tempBathMode, setTempBathMode] = useState(TEMP_BATH_MODE.OFF);
  const [tempBathPulse, setTempBathPulse] = useState(null);
  const [automationTempVisualMode, setAutomationTempVisualMode] = useState(
    TEMP_BATH_MODE.OFF,
  );
  const [pressureBathMode, setPressureBathMode] = useState(
    PRESSURE_BATH_MODE.OFF,
  );
  const [pressureBathPulse, setPressureBathPulse] = useState(null);
  const [automationPressureVisualMode, setAutomationPressureVisualMode] =
    useState(PRESSURE_BATH_MODE.OFF);
  const damping = useMemo(
    () => computeDampingFromTemperature(temperatureK),
    [temperatureK],
  );
  const bondScale = useMemo(
    () => computeBondScaleFromTemperature(temperatureK),
    [temperatureK],
  );

  // box size (half-size)
  const [boxHalfSize, setBoxHalfSize] = useState(DEFAULT_BOX_HALF_SIZE);
  const [showBoxEdges, setShowBoxEdges] = useState(true);
  const [showPeriodicRepeats, setShowPeriodicRepeats] = useState(false);
  const showPeriodicRepeatsRef = useRef(false);
  useEffect(
    () => void (showPeriodicRepeatsRef.current = showPeriodicRepeats),
    [showPeriodicRepeats],
  );
  const adaptiveForceField = DEFAULT_ADAPTIVE_FORCE_FIELD;

  // per-element LJ defaults are fixed (no UI editor)
  const lj = useMemo(() => structuredClone(DEFAULT_LJ), []);

  // overlays (controls hidden by default for mobile friendliness)
  const [controlsOpen, setControlsOpen] = useState(false);
  const [spawnElementCount, setSpawnElementCount] = useState(5);
  const [automationBuilderActions, setAutomationBuilderActions] = useState(() => [
    ...createDefaultTrapBreakerAutomationBuilderActions(),
  ]);
  const [automationBuilderAddKind, setAutomationBuilderAddKind] = useState(
    AUTOMATION_ACTION_KIND.CONDITION,
  );
  const [automationBuilderWhilePickerForId, setAutomationBuilderWhilePickerForId] =
    useState(null);
  const [automationBuilderWhileAddKind, setAutomationBuilderWhileAddKind] =
    useState(AUTOMATION_ACTION_KIND.CONDITION);
  const [automationBuilderThenPickerForId, setAutomationBuilderThenPickerForId] =
    useState(null);
  const [automationBuilderThenAddKind, setAutomationBuilderThenAddKind] =
    useState(AUTOMATION_ACTION_KIND.CONDITION);
  const [automationBuilderRepeatCycle, setAutomationBuilderRepeatCycle] =
    useState(false);
  const [automationBuilderRunning, setAutomationBuilderRunning] =
    useState(false);
  const [automationBuilderStatus, setAutomationBuilderStatus] =
    useState("idle");
  const [automationBuilderActiveIndex, setAutomationBuilderActiveIndex] =
    useState(-1);
  const [automationBuilderActiveActionIds, setAutomationBuilderActiveActionIds] =
    useState([]);
  const [automationBuilderActiveStepCodes, setAutomationBuilderActiveStepCodes] =
    useState([]);
  const [automationBuilderRemainingMs, setAutomationBuilderRemainingMs] =
    useState(0);
  const [elementCountDeltaByElement, setElementCountDeltaByElement] =
    useState({});
  const [modeOpen, setModeOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [hasEverLocalSave, setHasEverLocalSave] = useState(false);
  const [starterSeedUsed, setStarterSeedUsed] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("number");
  const [collectionSortDir, setCollectionSortDir] = useState("asc");
  const [collectionFirstCreatedSortMode, setCollectionFirstCreatedSortMode] =
    useState("me-asc");
  const [collectionLastCreatedSortMode, setCollectionLastCreatedSortMode] =
    useState("me-asc");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectedIds, setCollectedIds] = useState([]);
  const [localCatalogueStatsById, setLocalCatalogueStatsById] = useState({});
  const [lastCataloguedId, setLastCataloguedId] = useState(null);
  const [selectedLiveIds, setSelectedLiveIds] = useState([]);
  const [liveMoleculeSummary, setLiveMoleculeSummary] = useState([]);
  const [liveMatchedIds, setLiveMatchedIds] = useState([]);
  const [liveBrightIds, setLiveBrightIds] = useState([]);
  const [liveElementCounts, setLiveElementCounts] = useState(() => ({
    ...EMPTY_ELEMENT_COUNTS,
  }));
  const [liveThermoEstimate, setLiveThermoEstimate] = useState({
    atomCount: 0,
    temperatureK: 0,
    pressureReduced: 0,
    entropyReduced: 0,
    enthalpyReduced: 0,
    totalEnergyReduced: 0,
  });
  const [liveThermoHistory, setLiveThermoHistory] = useState([]);
  const [hoverLiveTooltip, setHoverLiveTooltip] = useState(null);
  const [discoveryCallouts, setDiscoveryCallouts] = useState([]);
  const [calloutEpoch, setCalloutEpoch] = useState(0);
  const [catalogCountGlowUntilMs, setCatalogCountGlowUntilMs] = useState(0);
  const [catalogCountGlowNowMs, setCatalogCountGlowNowMs] = useState(0);
  const [catalogueSaveBusy, setCatalogueSaveBusy] = useState(false);
  const [catalogueSaveStatus, setCatalogueSaveStatus] = useState("");
  const [catalogueHydrated, setCatalogueHydrated] = useState(false);
  const [expandedSnapshot, setExpandedSnapshot] = useState(null);
  const [expandedAngles, setExpandedAngles] = useState({ x: 0, y: 0, z: 0 });
  const [expandedZoom, setExpandedZoom] = useState(1);

  useEffect(() => {
    setAutomationBuilderActions((prev) => {
      if (!Array.isArray(prev)) {
        return createDefaultTrapBreakerAutomationBuilderActions();
      }
      if (prev.length <= 0) return prev;
      let changed = false;
      const normalizeDirectionValue = (value) => {
        const key = String(value || "increase");
        if (key === "hold") return "wait";
        return key;
      };
      const normalizeAction = (rawAction, keepChildren = false) => {
        const kind = String(rawAction?.kind || "");
        const normalizedIncomingEdge = normalizeAutomationBuilderIncomingEdge(
          rawAction?.incomingEdge,
        );
        if (normalizedIncomingEdge !== (rawAction?.incomingEdge ?? null)) {
          changed = true;
        }
        const normalizedDirection = normalizeDirectionValue(rawAction?.direction);
        if (normalizedDirection !== rawAction?.direction) changed = true;
        const rawTargetKey = String(rawAction?.target || "temperature");
        let normalizedTargetKey = rawTargetKey;
        let normalizedConditionDirection = normalizedDirection;
        if (kind === AUTOMATION_ACTION_KIND.CONDITION) {
          if (rawTargetKey === "pressure") {
            normalizedTargetKey = "volume";
            if (normalizedDirection === "increase") {
              normalizedConditionDirection = "decrease";
            } else if (normalizedDirection === "decrease") {
              normalizedConditionDirection = "increase";
            }
          } else if (rawTargetKey !== "temperature" && rawTargetKey !== "volume") {
            normalizedTargetKey = "temperature";
          }
        }
        if (normalizedTargetKey !== rawTargetKey) changed = true;
        if (normalizedConditionDirection !== normalizedDirection) changed = true;
        const shouldConvertConditionToWait =
          kind === AUTOMATION_ACTION_KIND.CONDITION &&
          (normalizedConditionDirection === "wait" ||
            normalizedConditionDirection === "hold");
        if (shouldConvertConditionToWait) {
          changed = true;
          return {
            id: String(rawAction?.id || ""),
            incomingEdge: normalizedIncomingEdge,
            kind: AUTOMATION_ACTION_KIND.WAIT,
            durationSec: Math.max(
              1,
              Math.floor(Number(rawAction?.durationSec) || 5),
            ),
            whileActions: keepChildren
              ? Array.isArray(rawAction?.whileActions)
                ? rawAction.whileActions
                : []
              : [],
            thenActions: keepChildren
              ? Array.isArray(rawAction?.thenActions)
                ? rawAction.thenActions
                : []
              : [],
          };
        }
        if (
          kind !== AUTOMATION_ACTION_KIND.CONDITION &&
          kind !== AUTOMATION_ACTION_KIND.ATOMS &&
          kind !== AUTOMATION_ACTION_KIND.WAIT
        ) {
          changed = true;
          return createAutomationBuilderAction(
            String(rawAction?.id || ""),
            AUTOMATION_ACTION_KIND.CONDITION,
            normalizedIncomingEdge,
          );
        }
        const normalizedAction = {
          ...rawAction,
          incomingEdge: normalizedIncomingEdge,
          direction: normalizedConditionDirection,
          whileActions: keepChildren
            ? Array.isArray(rawAction?.whileActions)
              ? rawAction.whileActions
              : []
            : [],
          thenActions: keepChildren
            ? Array.isArray(rawAction?.thenActions)
              ? rawAction.thenActions
              : []
            : [],
        };
        if (kind === AUTOMATION_ACTION_KIND.CONDITION) {
          normalizedAction.target = normalizedTargetKey;
        }
        if (kind === AUTOMATION_ACTION_KIND.ATOMS) {
          const normalizedOperation = normalizeAutomationBuilderAtomOperation(
            rawAction?.operation,
          );
          if (normalizedOperation !== rawAction?.operation) changed = true;
          const normalizedEntries = normalizeAutomationBuilderAtomEntries(
            rawAction,
            normalizedOperation,
          );
          if (!Array.isArray(rawAction?.atomEntries)) changed = true;
          if (
            !areAutomationBuilderAtomEntriesEqual(
              rawAction?.atomEntries,
              normalizedEntries,
            )
          ) {
            changed = true;
          }
          const primaryEntry = normalizedEntries[0];
          normalizedAction.operation = normalizedOperation;
          normalizedAction.atomEntries = normalizedEntries;
          normalizedAction.count = primaryEntry.count;
          normalizedAction.element = primaryEntry.element;
        }
        return normalizedAction;
      };
      const normalizeTree = (nodes) => {
        const normalized = [];
        for (const raw of Array.isArray(nodes) ? nodes : []) {
          const normalizedParent = normalizeAction(raw, true);
          const whileActionsRaw = Array.isArray(normalizedParent?.whileActions)
            ? normalizedParent.whileActions
            : [];
          const thenActionsRaw = Array.isArray(normalizedParent?.thenActions)
            ? normalizedParent.thenActions
            : [];
          if (!Array.isArray(raw?.whileActions)) changed = true;
          if (!Array.isArray(raw?.thenActions)) changed = true;
          const normalizedWhileChildren = normalizeTree(whileActionsRaw).map(
            (child) => {
              if (child?.incomingEdge) return child;
              changed = true;
              return { ...child, incomingEdge: "while" };
            },
          );
          normalized.push({
            ...normalizedParent,
            whileActions: normalizedWhileChildren,
            thenActions: [],
          });

          const normalizedThenSiblings = normalizeTree(thenActionsRaw).map(
            (sibling) => {
              if (sibling?.incomingEdge === "then") return sibling;
              changed = true;
              return { ...sibling, incomingEdge: "then" };
            },
          );
          if (normalizedThenSiblings.length > 0) {
            changed = true;
            normalized.push(...normalizedThenSiblings);
          }
        }
        return normalized;
      };
      const next = normalizeTree(prev);
      const nextWithRootThenEdges = next.map((node, index) => {
        if (index <= 0) return node;
        if (node?.incomingEdge === "then") return node;
        changed = true;
        return { ...node, incomingEdge: "then" };
      });
      return changed ? nextWithRootThenEdges : prev;
    });
    setAutomationBuilderAddKind((prev) =>
      prev === AUTOMATION_ACTION_KIND.ATOMS ||
      prev === AUTOMATION_ACTION_KIND.WAIT
        ? prev
        : AUTOMATION_ACTION_KIND.CONDITION,
    );
    setAutomationBuilderWhileAddKind((prev) =>
      prev === AUTOMATION_ACTION_KIND.ATOMS ||
      prev === AUTOMATION_ACTION_KIND.WAIT
        ? prev
        : AUTOMATION_ACTION_KIND.CONDITION,
    );
    setAutomationBuilderThenAddKind((prev) =>
      prev === AUTOMATION_ACTION_KIND.ATOMS ||
      prev === AUTOMATION_ACTION_KIND.WAIT
        ? prev
        : AUTOMATION_ACTION_KIND.CONDITION,
    );
  }, [automationBuilderActions]);

  useEffect(() => {
    const validActionIds = new Set();
    const visit = (nodes) => {
      for (const node of Array.isArray(nodes) ? nodes : []) {
        const id = String(node?.id || "");
        if (id) validActionIds.add(id);
        visit(node?.whileActions);
        visit(node?.thenActions);
      }
    };
    visit(automationBuilderActions);
    setAutomationBuilderWhilePickerForId((current) =>
      current && !validActionIds.has(current) ? null : current,
    );
    setAutomationBuilderThenPickerForId((current) =>
      current && !validActionIds.has(current) ? null : current,
    );
  }, [automationBuilderActions]);

  const canvasCardRef = useRef(null);
  const mountRef = useRef(null);
  const catalogueImportFileRef = useRef(null);
  const rafRef = useRef(null);
  const collectedSetRef = useRef(new Set());
  const liveMoleculeSummaryKeyRef = useRef("");
  const liveMatchedIdsKeyRef = useRef("");
  const liveBrightIdsKeyRef = useRef("");
  const liveElementCountsKeyRef = useRef("");
  const liveThermoKeyRef = useRef("");
  const liveThermoEstimateRef = useRef({
    atomCount: 0,
    temperatureK: 0,
    pressureReduced: 0,
    entropyReduced: 0,
    enthalpyReduced: 0,
    totalEnergyReduced: 0,
  });
  const liveHighlightKeyRef = useRef("");
  const discoveryGlowUntilRef = useRef(new Map());
  const liveAtomToCatalogIdRef = useRef(new Map());
  const resetInProgressRef = useRef(false);
  const selectedLiveIdsRef = useRef(new Set());
  const selectedLiveIndexByIdRef = useRef(new Map());
  const selectedLivePaletteSlotByIdRef = useRef(new Map());
  const nextLivePaletteSlotRef = useRef(0);
  const discoveryCalloutsRef = useRef([]);
  const discoveryCalloutSeqRef = useRef(1);
  const liveHighlightAtomIdsRef = useRef(new Set());
  const liveHighlightBondKeysRef = useRef(new Set());
  const expandedDragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startAngles: { x: 0, y: 0, z: 0 },
  });
  const automationVisualSampleRef = useRef({
    atMs: 0,
    temperatureK: DEFAULT_TEMPERATURE_K,
    boxHalfSize: DEFAULT_BOX_HALF_SIZE,
  });
  const automationBuilderActionSeqRef = useRef(
    getAutomationBuilderNextActionSeq(automationBuilderActions),
  );
  const automationBuilderRunRef = useRef({
    running: false,
    steps: [],
    index: 0,
    actionStartedAtMs: 0,
    lastStepElapsedMs: 0,
    appliedAtomActionIds: new Set(),
  });
  const controlValuesRef = useRef({
    temperatureK: DEFAULT_TEMPERATURE_K,
    damping: DEFAULT_DAMPING,
    bondScale: DEFAULT_BOND_SCALE,
    boxHalfSize: DEFAULT_BOX_HALF_SIZE,
  });
  const elementCountDeltaTimersRef = useRef({});
  const queuedScanTimerRef = useRef(null);
  const queuedScanPendingRef = useRef(false);
  const localCatalogueStatsRef = useRef({});
  const remoteCatalogueLiveCountsRef = useRef(new Map());
  const {
    worldCatalogueStatsById,
    worldCatalogueBadgeVisible,
    queueRemoteCatalogueEvents,
  } = useReactorWorldSync({
    catalogueOpen,
    pollMs: WORLD_CATALOGUE_POLL_MS,
    flushMs: REMOTE_CATALOGUE_FLUSH_MS,
    retryMs: REMOTE_CATALOGUE_RETRY_MS,
    batchMax: REMOTE_CATALOGUE_BATCH_MAX,
  });

  const threeRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    raycaster: null,
    pointerNDC: new THREE.Vector2(),
    atomGroup: null,
    repeatAtomGroup: null,
    repeatAtomSprites: [],
    bondGroup: null,
    bondMeshes: [],
    glowSprites: new Map(),
    glowTexture: null,
    boxHelper: null,
    grid: null,
    grid2: null,
    spriteMaterials: new Map(),
    dragPlane: new THREE.Plane(),
    dragPlaneNormal: new THREE.Vector3(),
    dragHit: new THREE.Vector3(),
  });

  const simRef = useRef(createSim3D());
  const atomSpritesRef = useRef(new Map());
  const paramsRef = useRef(null);
  const prevBoxHalfSizeRef = useRef(DEFAULT_BOX_HALF_SIZE);

  const elements = useMemo(() => ({ ...DEFAULT_ELEMENTS_3D }), []);
  const catalogById = useMemo(
    () => new Map(MOLECULE_CATALOG.map((entry) => [entry.id, entry])),
    [],
  );
  const catalogByFingerprint = useMemo(
    () =>
      new Map(MOLECULE_CATALOG.map((entry) => [entry.fingerprint, entry.id])),
    [],
  );
  const collectedSet = useMemo(() => new Set(collectedIds), [collectedIds]);
  const liveCollectedSet = useMemo(
    () => new Set(liveMatchedIds),
    [liveMatchedIds],
  );
  const selectedLiveIndexById = useMemo(() => {
    const map = new Map();
    const paletteSize = Math.max(1, LIVE_SELECTION_PALETTE.length);
    for (let i = 0; i < selectedLiveIds.length; i += 1) {
      const id = selectedLiveIds[i];
      const rawSlot = selectedLivePaletteSlotByIdRef.current.get(id);
      const normalizedSlot = Number.isInteger(rawSlot)
        ? ((rawSlot % paletteSize) + paletteSize) % paletteSize
        : i % paletteSize;
      map.set(id, normalizedSlot);
    }
    return map;
  }, [selectedLiveIds]);
  const liveBrightSet = useMemo(() => new Set(liveBrightIds), [liveBrightIds]);
  const liveThermoTemperatureLabel = useMemo(() => {
    if ((liveThermoEstimate?.atomCount ?? 0) <= 0) return "--";
    return `${Math.round(Math.max(0, Number(liveThermoEstimate.temperatureK) || 0))}`;
  }, [liveThermoEstimate]);
  const liveThermoPressureLabel = useMemo(() => {
    if ((liveThermoEstimate?.atomCount ?? 0) <= 0) return "--";
    return `${(Number(liveThermoEstimate.pressureReduced) || 0).toFixed(3)}`;
  }, [liveThermoEstimate]);
  const liveThermoEntropyLabel = useMemo(() => {
    if ((liveThermoEstimate?.atomCount ?? 0) <= 0) return "--";
    return formatThermoScalar(liveThermoEstimate.entropyReduced);
  }, [liveThermoEstimate]);
  const liveThermoEnthalpyLabel = useMemo(() => {
    if ((liveThermoEstimate?.atomCount ?? 0) <= 0) return "--";
    return formatThermoScalar(liveThermoEstimate.enthalpyReduced);
  }, [liveThermoEstimate]);
  const liveThermoTotalEnergyLabel = useMemo(() => {
    if ((liveThermoEstimate?.atomCount ?? 0) <= 0) return "--";
    return formatThermoScalar(liveThermoEstimate.totalEnergyReduced);
  }, [liveThermoEstimate]);
  const thermoPlot = useMemo(() => {
    const formatPressureTick = (value) => {
      const v = Number(value) || 0;
      const abs = Math.abs(v);
      if (abs >= 1) return v.toFixed(2);
      if (abs >= 0.01) return v.toFixed(3);
      return v.toPrecision(2);
    };
    const width = 168;
    const height = 54;
    const plotInsetX = 6;
    const plotInsetTop = 10;
    const plotInsetBottom = 10;
    const plotMinX = plotInsetX;
    const plotMaxX = Math.max(plotInsetX + 1, width - plotInsetX);
    const plotMinY = plotInsetTop;
    const plotMaxY = Math.max(plotInsetTop + 1, height - plotInsetBottom);
    const nowMs = Date.now();
    const cutoffMs = nowMs - THERMO_HISTORY_WINDOW_MS;
    const rows = (
      Array.isArray(liveThermoHistory) ? liveThermoHistory : []
    ).filter((row) => Number(row?.atMs) >= cutoffMs);
    const count = rows.length;

    if (count <= 1) {
      return {
        width,
        height,
        tempPath: "",
        pressurePath: "",
        tempMin: 0,
        tempMax: 0,
        pressureMin: 0,
        pressureMax: 0,
        lastX: null,
        tempLastY: null,
        pressureLastY: null,
        pressureTopLabel: "0",
        pressureBottomLabel: "0",
      };
    }

    const tempValues = rows.map((row) =>
      Math.max(0, Number(row?.temperatureK) || 0),
    );
    const pressureValues = rows.map((row) => Number(row?.pressureReduced) || 0);

    const tempMinRaw = Math.min(...tempValues);
    const tempMaxRaw = Math.max(...tempValues);
    const pressureMinRaw = Math.min(...pressureValues);
    const pressureMaxRaw = Math.max(...pressureValues);

    const tempRangeRaw = Math.max(1, tempMaxRaw - tempMinRaw);
    const pressureRangeRaw = Math.max(1e-6, pressureMaxRaw - pressureMinRaw);
    const tempAxisMin = Math.max(0, tempMinRaw - tempRangeRaw * 0.08);
    const tempAxisMax = tempMaxRaw + tempRangeRaw * 0.08;
    const pressureAxisMin = pressureMinRaw - pressureRangeRaw * 0.12;
    const pressureAxisMax = pressureMaxRaw + pressureRangeRaw * 0.12;

    const xAt = (idx) => plotMinX + (idx / (count - 1)) * (plotMaxX - plotMinX);
    const yFromRange = (value, min, max) =>
      plotMaxY -
      ((value - min) / Math.max(1e-9, max - min)) * (plotMaxY - plotMinY);
    const buildPath = (values, min, max) =>
      values
        .map((value, idx) => {
          const x = xAt(idx).toFixed(2);
          const y = yFromRange(value, min, max).toFixed(2);
          return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
        })
        .join(" ");

    return {
      width,
      height,
      tempPath: buildPath(tempValues, tempAxisMin, tempAxisMax),
      pressurePath: buildPath(pressureValues, pressureAxisMin, pressureAxisMax),
      tempMin: tempMinRaw,
      tempMax: tempMaxRaw,
      pressureMin: pressureMinRaw,
      pressureMax: pressureMaxRaw,
      lastX: xAt(count - 1),
      tempLastY: yFromRange(tempValues[count - 1], tempAxisMin, tempAxisMax),
      pressureLastY: yFromRange(
        pressureValues[count - 1],
        pressureAxisMin,
        pressureAxisMax,
      ),
      pressureTopLabel: formatPressureTick(pressureMaxRaw),
      pressureBottomLabel: formatPressureTick(pressureMinRaw),
    };
  }, [liveThermoHistory]);
  const presentElementRows = useMemo(
    () =>
      ELEMENTS.map((el) => ({
        el,
        count: Math.max(0, Math.floor(Number(liveElementCounts?.[el]) || 0)),
      })).filter(
        (row) => row.count > 0 || Boolean(elementCountDeltaByElement[row.el]),
      ),
    [liveElementCounts, elementCountDeltaByElement],
  );
  const liveElementTotal = useMemo(
    () =>
      ELEMENTS.reduce(
        (sum, el) =>
          sum + Math.max(0, Math.floor(Number(liveElementCounts?.[el]) || 0)),
        0,
      ),
    [liveElementCounts],
  );
  const molecularWeightById = useMemo(() => {
    const map = new Map();
    for (const entry of MOLECULE_CATALOG) {
      map.set(entry.id, computeMolecularWeight(entry.structure));
    }
    return map;
  }, []);
  const collectionCompletionPct = useMemo(() => {
    if (MOLECULE_CATALOG.length <= 0) return 0;
    return Math.round((100 * collectedIds.length) / MOLECULE_CATALOG.length);
  }, [collectedIds.length]);
  const lastCataloguedLabel = useMemo(() => {
    if (!lastCataloguedId) return "none";
    const entry = catalogById.get(lastCataloguedId);
    return entry?.name || entry?.formula || lastCataloguedId;
  }, [lastCataloguedId, catalogById]);
  const catalogCountGlowFactor = useMemo(() => {
    if (!(catalogCountGlowUntilMs > 0)) return 0;
    const left = catalogCountGlowUntilMs - catalogCountGlowNowMs;
    if (left <= 0) return 0;
    if (left >= FIRST_DISCOVERY_CALLOUT_FADE_MS) return 1;
    return clamp01(left / FIRST_DISCOVERY_CALLOUT_FADE_MS);
  }, [catalogCountGlowUntilMs, catalogCountGlowNowMs]);
  const catalogCountGlowScale = useMemo(() => {
    if (catalogCountGlowFactor <= 0) return 1;
    const pulse = Math.sin(catalogCountGlowNowMs * 0.004);
    return (
      1 + 0.56 * catalogCountGlowFactor + 0.08 * catalogCountGlowFactor * pulse
    );
  }, [catalogCountGlowFactor, catalogCountGlowNowMs]);

  const filteredCollection = useMemo(() => {
    const q = collectionQuery.trim().toLowerCase();
    return MOLECULE_CATALOG.filter((entry) => {
      const isCollected = collectedSet.has(entry.id);
      const isLive = liveCollectedSet.has(entry.id);
      if (collectionFilter === "live" && !isLive) return false;
      if (collectionFilter === "collected" && !isCollected) return false;
      if (collectionFilter === "todo" && (isCollected || isLive)) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.formula.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q)
      );
    });
  }, [collectionFilter, collectionQuery, collectedSet, liveCollectedSet]);

  const sortedCollection = useMemo(() => {
    const rows = filteredCollection.slice();

    rows.sort((a, b) => {
      let cmp = 0;
      if (collectionSort === "weight") {
        const aw = molecularWeightById.get(a.id) ?? 0;
        const bw = molecularWeightById.get(b.id) ?? 0;
        if (aw !== bw) cmp = aw - bw;
      } else if (collectionSort === "name") {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) cmp = byName;
      } else if (
        collectionSort === "firstCreated" ||
        collectionSort === "lastCreated"
      ) {
        const field =
          collectionSort === "lastCreated" ? "lastCreatedAt" : "firstCreatedAt";
        const meA = localCatalogueStatsById[a.id]?.[field] || "";
        const meB = localCatalogueStatsById[b.id]?.[field] || "";
        const worldA = worldCatalogueStatsById[a.id]?.[field] || "";
        const worldB = worldCatalogueStatsById[b.id]?.[field] || "";
        const mode = String(
          collectionSort === "lastCreated"
            ? collectionLastCreatedSortMode
            : collectionFirstCreatedSortMode,
        );
        const primaryIsWorld = mode.startsWith("world-");
        const descending = mode.endsWith("-desc");

        const primaryA = primaryIsWorld ? worldA : meA;
        const primaryB = primaryIsWorld ? worldB : meB;
        const secondaryA = primaryIsWorld ? meA : worldA;
        const secondaryB = primaryIsWorld ? meB : worldB;

        cmp = compareOptionalIsoTimestamps(primaryA, primaryB);
        if (cmp === 0) {
          cmp = compareOptionalIsoTimestamps(secondaryA, secondaryB);
        }
        if (descending) cmp = -cmp;
      }

      if (cmp === 0) {
        const an = catalogueNumberFromId(a.id);
        const bn = catalogueNumberFromId(b.id);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn)
          cmp = an - bn;
      }
      if (cmp === 0) cmp = a.id.localeCompare(b.id);

      return collectionSortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [
    filteredCollection,
    collectionSort,
    collectionSortDir,
    collectionFirstCreatedSortMode,
    collectionLastCreatedSortMode,
    molecularWeightById,
    localCatalogueStatsById,
    worldCatalogueStatsById,
  ]);

  const collectionPageCount = useMemo(
    () =>
      Math.max(1, Math.ceil(sortedCollection.length / COLLECTION_PAGE_SIZE)),
    [sortedCollection.length],
  );
  const activeCollectionPage = useMemo(
    () => clamp(collectionPage, 1, collectionPageCount),
    [collectionPage, collectionPageCount],
  );
  const visibleCollection = useMemo(() => {
    const start = (activeCollectionPage - 1) * COLLECTION_PAGE_SIZE;
    return sortedCollection.slice(start, start + COLLECTION_PAGE_SIZE);
  }, [activeCollectionPage, sortedCollection]);
  const cataloguePlaceholderRowCount = Math.max(
    0,
    MIN_CATALOGUE_VISIBLE_ROWS - visibleCollection.length,
  );

  const showElementCountDelta = useCallback((counts, direction) => {
    const marker = direction === "-" ? "-" : "+";
    const touchedElements = ELEMENTS.filter(
      (el) => Math.max(0, Math.floor(Number(counts?.[el]) || 0)) > 0,
    );
    if (touchedElements.length <= 0) return;

    setElementCountDeltaByElement((prev) => {
      const next = { ...prev };
      for (const el of touchedElements) {
        next[el] = marker;
      }
      return next;
    });

    for (const el of touchedElements) {
      if (elementCountDeltaTimersRef.current[el]) {
        window.clearTimeout(elementCountDeltaTimersRef.current[el]);
      }
      elementCountDeltaTimersRef.current[el] = window.setTimeout(() => {
        delete elementCountDeltaTimersRef.current[el];
        setElementCountDeltaByElement((prev) => {
          if (!Object.hasOwn(prev, el)) return prev;
          const next = { ...prev };
          delete next[el];
          return next;
        });
      }, 520);
    }
  }, []);

  const showSpawnReadout = useCallback(
    (counts) => {
      showElementCountDelta(counts, "+");
    },
    [showElementCountDelta],
  );

  const showDeletedReadout = useCallback(
    (counts) => {
      showElementCountDelta(counts, "-");
    },
    [showElementCountDelta],
  );

  useEffect(() => {
    const progress = readSavedCatalogueProgressFromStorage();
    const valid = progress.collectedIds;
    const hasSavedCatalogue = valid.length > 0;
    setHasEverLocalSave(hasSavedCatalogue);
    setStarterSeedUsed(hasSavedCatalogue);
    setCollectedIds(valid);
    setLocalCatalogueStatsById(progress.moleculeStatsById);
    localCatalogueStatsRef.current = progress.moleculeStatsById;
    setLastCataloguedId(
      chooseLastCreatedCatalogueId(valid, progress.moleculeStatsById),
    );
    if (valid.length > 0) {
      setTutorialOpen(false);
      setCatalogueOpen(false);
      setCollectionFilter("live");
    } else {
      setTutorialOpen(true);
      setCatalogueOpen(false);
      setCollectionFilter("all");
    }
    setCatalogueHydrated(true);
  }, []);

  useEffect(() => {
    if (!catalogueHydrated || resetInProgressRef.current) return;
    localStorage.setItem(
      CATALOGUE_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        collectedIds,
        moleculeStatsById: localCatalogueStatsById,
      }),
    );
  }, [collectedIds, localCatalogueStatsById, catalogueHydrated]);

  useEffect(() => {
    if (collectedIds.length > 0) setHasEverLocalSave(true);
  }, [collectedIds]);

  useEffect(() => {
    collectedSetRef.current = new Set(collectedIds);
  }, [collectedIds]);

  useEffect(() => {
    localCatalogueStatsRef.current = localCatalogueStatsById;
  }, [localCatalogueStatsById]);

  useEffect(() => {
    selectedLiveIdsRef.current = new Set(selectedLiveIds);
    selectedLiveIndexByIdRef.current = new Map(selectedLiveIndexById);
  }, [selectedLiveIds, selectedLiveIndexById]);

  useEffect(() => {
    const liveSet = new Set(liveMatchedIds);
    setSelectedLiveIds((prev) => {
      const next = prev.filter((id) => liveSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [liveMatchedIds]);

  useEffect(() => {
    if (!(catalogCountGlowUntilMs > 0)) return undefined;
    const now = Date.now();
    if (catalogCountGlowUntilMs <= now) {
      setCatalogCountGlowNowMs(now);
      setCatalogCountGlowUntilMs(0);
      return undefined;
    }

    setCatalogCountGlowNowMs(now);
    const interval = window.setInterval(() => {
      setCatalogCountGlowNowMs(Date.now());
    }, 66);
    const clearTimer = window.setTimeout(
      () => {
        setCatalogCountGlowNowMs(Date.now());
        setCatalogCountGlowUntilMs(0);
      },
      Math.max(20, catalogCountGlowUntilMs - now + 30),
    );

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(clearTimer);
    };
  }, [catalogCountGlowUntilMs]);

  useEffect(() => {
    if (liveMatchedIds.length <= 0) {
      if (liveBrightIdsKeyRef.current !== "") {
        liveBrightIdsKeyRef.current = "";
        setLiveBrightIds([]);
      }
      return undefined;
    }

    const now = Date.now();
    let nextExpiry = Infinity;
    const brightNow = [];
    for (const id of liveMatchedIds) {
      const until = discoveryGlowUntilRef.current.get(id) ?? 0;
      if (until > now) {
        brightNow.push(id);
        nextExpiry = Math.min(nextExpiry, until);
      }
    }
    brightNow.sort();
    const brightKey = brightNow.join("|");
    if (brightKey !== liveBrightIdsKeyRef.current) {
      liveBrightIdsKeyRef.current = brightKey;
      setLiveBrightIds(brightNow);
    }

    if (!Number.isFinite(nextExpiry)) return undefined;
    const timer = window.setTimeout(
      () => {
        const nowInner = Date.now();
        const nextBright = [];
        for (const id of liveMatchedIds) {
          const until = discoveryGlowUntilRef.current.get(id) ?? 0;
          if (until > nowInner) nextBright.push(id);
        }
        nextBright.sort();
        const nextKey = nextBright.join("|");
        if (nextKey !== liveBrightIdsKeyRef.current) {
          liveBrightIdsKeyRef.current = nextKey;
          setLiveBrightIds(nextBright);
        }
      },
      Math.max(20, nextExpiry - now + 24),
    );
    return () => window.clearTimeout(timer);
  }, [liveMatchedIds]);

  useEffect(() => {
    if (discoveryCalloutsRef.current.length <= 0) {
      setDiscoveryCallouts([]);
      return undefined;
    }

    const projectCallouts = () => {
      const mount = mountRef.current;
      const t = threeRef.current;
      const sim = simRef.current;
      const now = Date.now();

      discoveryCalloutsRef.current = discoveryCalloutsRef.current.filter(
        (item) => item.expiresAt > now,
      );
      if (discoveryCalloutsRef.current.length <= 0) {
        setDiscoveryCallouts([]);
        return;
      }

      if (!mount || !t.camera) return;

      const rect = mount.getBoundingClientRect();
      const atomsById = new Map(sim.atoms.map((a) => [a.id, a]));
      const rendered = [];
      for (const item of discoveryCalloutsRef.current) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const atomId of item.atomIds) {
          const atom = atomsById.get(atomId);
          if (!atom) continue;
          sx += atom.x;
          sy += atom.y;
          sz += atom.z;
          n += 1;
        }
        if (n <= 0) continue;

        const world = new THREE.Vector3(sx / n, sy / n, sz / n);
        world.project(t.camera);
        if (world.z < -1.1 || world.z > 1.1) continue;

        const lifeLeft = item.expiresAt - now;
        const lifeFade = clamp01(lifeLeft / FIRST_DISCOVERY_CALLOUT_FADE_MS);
        const x = (world.x + 1) * 0.5 * rect.width;
        const y = (-world.y + 1) * 0.5 * rect.height - 44;
        rendered.push({
          key: item.key,
          name: item.name,
          progressCount: item.progressCount,
          progressTotal: item.progressTotal,
          x,
          y,
          opacity: lifeLeft < FIRST_DISCOVERY_CALLOUT_FADE_MS ? lifeFade : 1,
        });
      }
      setDiscoveryCallouts(rendered);
    };

    projectCallouts();
    const timer = window.setInterval(projectCallouts, 66);
    return () => window.clearInterval(timer);
  }, [calloutEpoch]);

  useEffect(() => {
    setCollectionPage(1);
  }, [collectionFilter, collectionQuery, collectionSort, collectionSortDir]);

  useEffect(() => {
    if (collectionPage === activeCollectionPage) return;
    setCollectionPage(activeCollectionPage);
  }, [collectionPage, activeCollectionPage]);

  const toggleLiveSelection = useCallback((catalogId, checked) => {
    if (!catalogId) return;
    setSelectedLiveIds((prev) => {
      const has = prev.includes(catalogId);
      if (checked) {
        if (has) return prev;
        const slotMap = selectedLivePaletteSlotByIdRef.current;
        const paletteSize = Math.max(1, LIVE_SELECTION_PALETTE.length);
        const usedSlots = new Set();
        for (const id of prev) {
          const raw = slotMap.get(id);
          if (!Number.isInteger(raw)) continue;
          usedSlots.add(((raw % paletteSize) + paletteSize) % paletteSize);
        }

        const existingRaw = slotMap.get(catalogId);
        let nextSlot = Number.isInteger(existingRaw)
          ? ((existingRaw % paletteSize) + paletteSize) % paletteSize
          : -1;

        if (nextSlot < 0 || usedSlots.has(nextSlot)) {
          nextSlot = -1;
          for (let i = 0; i < paletteSize; i += 1) {
            if (!usedSlots.has(i)) {
              nextSlot = i;
              break;
            }
          }
          if (nextSlot < 0) {
            nextSlot = nextLivePaletteSlotRef.current % paletteSize;
            nextLivePaletteSlotRef.current += 1;
          }
        }

        slotMap.set(catalogId, nextSlot);
        return [...prev, catalogId];
      }
      if (!has) return prev;
      return prev.filter((id) => id !== catalogId);
    });
  }, []);

  useEffect(() => {
    if (!expandedSnapshot) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setExpandedSnapshot(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedSnapshot]);

  useEffect(() => {
    if (!expandedSnapshot) return undefined;
    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [expandedSnapshot]);

  const onExpandedSnapshotPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const drag = expandedDragRef.current;
      drag.active = true;
      drag.pointerId = e.pointerId;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.startAngles = { ...expandedAngles };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [expandedAngles],
  );

  const onExpandedSnapshotPointerMove = useCallback((e) => {
    const drag = expandedDragRef.current;
    if (!drag.active) return;
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const nextX = normalizeAngleDeg(drag.startAngles.x + dy * 0.42);
    const nextY = normalizeAngleDeg(drag.startAngles.y + dx * 0.42);
    setExpandedAngles((prev) => {
      if (Math.abs(prev.x - nextX) < 1e-3 && Math.abs(prev.y - nextY) < 1e-3) {
        return prev;
      }
      return { ...prev, x: nextX, y: nextY };
    });
  }, []);

  const onExpandedSnapshotPointerUp = useCallback((e) => {
    const drag = expandedDragRef.current;
    if (!drag.active) return;
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
    if (Number.isInteger(drag.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture?.(drag.pointerId);
      } catch {}
    }
    drag.active = false;
    drag.pointerId = null;
  }, []);

  const onExpandedSnapshotWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setExpandedZoom((prev) => clamp(prev * factor, 0.55, 2.6));
  }, []);

  // update sim params
  useEffect(() => {
    const tempFactor = Math.max(0, temperatureK) / ROOM_TEMP_K;

    paramsRef.current = {
      lj,
      cutoff: FIXED_CUTOFF,
      cutoffSwitchRatio: 0.85,
      reactionCutoff: 2.4,
      minR: 0.35,
      maxPairForce: 28,
      nonbonded12LJScale: 0,
      nonbonded12ElectroScale: 0,
      nonbonded13LJScale: 0,
      nonbonded13ElectroScale: 0,
      nonbonded14LJScale: 0.5,
      nonbonded14ElectroScale: 0.8333,

      bondScale,
      allowMultipleBonds,

      temperatureK,
      kBoltzmannReduced: 1 / ROOM_TEMP_K,
      temperature: tempFactor,
      damping,
      tempVelKick: 4.2,
      useLangevin: automationBuilderRunning || tempBathMode !== TEMP_BATH_MODE.OFF,
      langevinGamma: 2.4,

      boxHalfSize,
      wallPadding: 0.25,
      wallK: 18,
      usePeriodicBoundary: true,

      reactionBarrierScale: 0.88,
      reactionAttemptRate: 3.2,
      maxReactionEventsPerStep: 18,
      valencePenaltyK: 6,
      valencePenaltyForceCap: 15,
      adaptiveForceField,
      adaptiveTrapHeavyMin: 5,
      adaptiveTrapHeavyMax: 8,
      hydrogenationThrottle: 0.52,
      rearrangementWindowStrength: 0.5,

      grabK: 80,
      grabMaxForce: 140,

      angleK: 2.2,
      angleForceCap: 10,
      enableDihedrals: true,
      dihedralKScale: 1.0,
      dihedralForceCap: 6,

      enableElectrostatics: true,
      charges: { ...DEFAULT_CHARGES },
      ke: 0.55,
      screeningLength: 4.0,
      electroRepulsionScale: 2.1,
      electroAttractionScale: 2.0,
      electroBondBiasStrength: 0.75,
      electroDihedral180Scale: 0.2,
    };
  }, [
    lj,
    temperatureK,
    damping,
    bondScale,
    allowMultipleBonds,
    boxHalfSize,
    adaptiveForceField,
    automationBuilderRunning,
    tempBathMode,
  ]);

  useEffect(() => {
    if (automationBuilderRunning) return undefined;
    const baseRateKPerSecond = TEMP_BATH_RATE_K_PER_SEC[tempBathMode] ?? 0;
    const pulseRateKPerSecond =
      tempBathPulse === TEMP_BATH_PULSE.COOL
        ? -TEMP_BATH_PULSE_RATE_K_PER_SEC
        : tempBathPulse === TEMP_BATH_PULSE.HEAT
          ? TEMP_BATH_PULSE_RATE_K_PER_SEC
          : 0;
    const rateKPerSecond = baseRateKPerSecond + pulseRateKPerSecond;
    if (!Number.isFinite(rateKPerSecond) || Math.abs(rateKPerSecond) < 1e-9) {
      return undefined;
    }
    let lastMs = performance.now();
    const intervalId = window.setInterval(() => {
      const nowMs = performance.now();
      const deltaSeconds = Math.max(0, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const deltaK = rateKPerSecond * deltaSeconds;
      if (Math.abs(deltaK) < 1e-6) return;
      setTemperatureK((prev) =>
        clamp(prev + deltaK, TEMP_CONTROL_MIN_K, TEMP_CONTROL_MAX_K),
      );
    }, 120);
    return () => window.clearInterval(intervalId);
  }, [automationBuilderRunning, tempBathMode, tempBathPulse]);

  useEffect(() => {
    if (!tempBathPulse) return undefined;
    if (typeof window === "undefined") return undefined;
    const stopPulse = () => setTempBathPulse(null);
    window.addEventListener("pointerup", stopPulse);
    window.addEventListener("pointercancel", stopPulse);
    window.addEventListener("mouseup", stopPulse);
    window.addEventListener("touchend", stopPulse);
    window.addEventListener("blur", stopPulse);
    return () => {
      window.removeEventListener("pointerup", stopPulse);
      window.removeEventListener("pointercancel", stopPulse);
      window.removeEventListener("mouseup", stopPulse);
      window.removeEventListener("touchend", stopPulse);
      window.removeEventListener("blur", stopPulse);
    };
  }, [tempBathPulse]);

  useEffect(() => {
    if (automationBuilderRunning) return undefined;
    const baseRateBoxPerSecond =
      PRESSURE_BATH_RATE_BOX_PER_SEC[pressureBathMode] ?? 0;
    const pulseRateBoxPerSecond =
      pressureBathPulse === PRESSURE_BATH_PULSE.EXPAND
        ? PRESSURE_BATH_PULSE_RATE_BOX_PER_SEC
        : pressureBathPulse === PRESSURE_BATH_PULSE.CONTRACT
          ? -PRESSURE_BATH_PULSE_RATE_BOX_PER_SEC
          : 0;
    const rateBoxPerSecond = baseRateBoxPerSecond + pulseRateBoxPerSecond;
    if (!Number.isFinite(rateBoxPerSecond) || Math.abs(rateBoxPerSecond) < 1e-9) {
      return undefined;
    }
    let lastMs = performance.now();
    const intervalId = window.setInterval(() => {
      const nowMs = performance.now();
      const deltaSeconds = Math.max(0, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const deltaBox = rateBoxPerSecond * deltaSeconds;
      if (Math.abs(deltaBox) < 1e-6) return;
      setBoxHalfSize((prev) =>
        clamp(
          prev + deltaBox,
          PRESSURE_CONTROL_MIN_BOX_HALF_SIZE,
          PRESSURE_CONTROL_MAX_BOX_HALF_SIZE,
        ),
      );
    }, 120);
    return () => window.clearInterval(intervalId);
  }, [
    automationBuilderRunning,
    pressureBathMode,
    pressureBathPulse,
  ]);

  useEffect(() => {
    if (!pressureBathPulse) return undefined;
    if (typeof window === "undefined") return undefined;
    const stopPulse = () => setPressureBathPulse(null);
    window.addEventListener("pointerup", stopPulse);
    window.addEventListener("pointercancel", stopPulse);
    window.addEventListener("mouseup", stopPulse);
    window.addEventListener("touchend", stopPulse);
    window.addEventListener("blur", stopPulse);
    return () => {
      window.removeEventListener("pointerup", stopPulse);
      window.removeEventListener("pointercancel", stopPulse);
      window.removeEventListener("mouseup", stopPulse);
      window.removeEventListener("touchend", stopPulse);
      window.removeEventListener("blur", stopPulse);
    };
  }, [pressureBathPulse]);

  useEffect(() => {
    const automationActive = automationBuilderRunning;
    const nowMs = performance.now();
    if (!automationActive) {
      automationVisualSampleRef.current = {
        atMs: nowMs,
        temperatureK,
        boxHalfSize,
      };
      setAutomationTempVisualMode(TEMP_BATH_MODE.OFF);
      setAutomationPressureVisualMode(PRESSURE_BATH_MODE.OFF);
      return;
    }

    const prev = automationVisualSampleRef.current;
    const dtSeconds = Math.max(1e-3, (nowMs - (prev.atMs || nowMs)) / 1000);
    const tempRate = (temperatureK - (Number(prev.temperatureK) || 0)) / dtSeconds;
    const boxRate = (boxHalfSize - (Number(prev.boxHalfSize) || 0)) / dtSeconds;
    automationVisualSampleRef.current = {
      atMs: nowMs,
      temperatureK,
      boxHalfSize,
    };

    const absTempRate = Math.abs(tempRate);
    const nextTempMode =
      absTempRate < 4
        ? TEMP_BATH_MODE.OFF
        : tempRate > 0
          ? absTempRate >= 105
            ? TEMP_BATH_MODE.FAST_HEAT
            : TEMP_BATH_MODE.SLOW_HEAT
          : absTempRate >= 105
            ? TEMP_BATH_MODE.FAST_COOL
            : TEMP_BATH_MODE.SLOW_COOL;
    setAutomationTempVisualMode((current) =>
      current === nextTempMode ? current : nextTempMode,
    );

    const absBoxRate = Math.abs(boxRate);
    const nextPressureMode =
      absBoxRate < 0.03
        ? PRESSURE_BATH_MODE.OFF
        : boxRate > 0
          ? absBoxRate >= 0.825
            ? PRESSURE_BATH_MODE.FAST_EXPAND
            : PRESSURE_BATH_MODE.SLOW_EXPAND
          : absBoxRate >= 0.825
            ? PRESSURE_BATH_MODE.FAST_CONTRACT
            : PRESSURE_BATH_MODE.SLOW_CONTRACT;
    setAutomationPressureVisualMode((current) =>
      current === nextPressureMode ? current : nextPressureMode,
    );
  }, [automationBuilderRunning, boxHalfSize, temperatureK]);

  // Approximate volume change by scaling coordinates with box size.
  useEffect(() => {
    const prev = prevBoxHalfSizeRef.current;
    if (!prev || Math.abs(prev - boxHalfSize) < 1e-6) return;

    const sim = simRef.current;
    const scale = boxHalfSize / prev;
    const velScale = clamp(Math.pow(scale, -0.2), 0.86, 1.16);

    for (const a of sim.atoms) {
      a.x *= scale;
      a.y *= scale;
      a.z *= scale;
      a.vx *= velScale;
      a.vy *= velScale;
      a.vz *= velScale;
    }
    prevBoxHalfSizeRef.current = boxHalfSize;
  }, [boxHalfSize]);

  // OrbitControls enabled only in Rotate tool
  useEffect(() => {
    const controls = threeRef.current.controls;
    if (!controls) return;
    controls.enabled = tool === TOOL.ROTATE;
  }, [tool]);

  // Reset camera orientation/view to defaults (centered)
  function resetView() {
    const t = threeRef.current;
    if (!t.camera || !t.controls) return;

    t.camera.position.set(0, 0.6, 14);
    t.camera.up.set(0, 1, 0);
    t.controls.target.set(0, 0, 0);
    t.controls.update();
  }

  const refreshBoxVisuals = useCallback(() => {
    const t = threeRef.current;
    if (!t.scene) return;

    const S = boxHalfSize;

    if (t.boxHelper) t.scene.remove(t.boxHelper);

    const box = new THREE.Box3(
      new THREE.Vector3(-S, -S, -S),
      new THREE.Vector3(S, S, S),
    );
    const boxHelper = new THREE.Box3Helper(box, REACTOR_OVERLAY_LIGHT_TEXT);
    boxHelper.material.transparent = true;
    boxHelper.material.opacity = 0.52;
    boxHelper.visible = showBoxEdges;
    boxHelper.renderOrder = 3;
    t.scene.add(boxHelper);
    t.boxHelper = boxHelper;

    // Ensure any old grids are removed (and we keep them hidden)
    if (t.grid) t.scene.remove(t.grid);
    if (t.grid2) t.scene.remove(t.grid2);

    const size = Math.max(4, Math.floor(S * 2));
    const divisions = Math.max(10, Math.floor(S * 5));

    const grid = new THREE.GridHelper(size, divisions, 0x94a3b8, 0x94a3b8);
    grid.material.transparent = true;
    grid.material.opacity = 0.0;
    grid.visible = false;
    t.scene.add(grid);
    t.grid = grid;

    const grid2 = new THREE.GridHelper(size, divisions, 0x94a3b8, 0x94a3b8);
    grid2.material.transparent = true;
    grid2.material.opacity = 0.0;
    grid2.visible = false;
    t.scene.add(grid2);
    t.grid2 = grid2;
  }, [boxHalfSize, showBoxEdges]);

  // update box visuals when size or edges-toggle changes
  useEffect(() => {
    refreshBoxVisuals();
  }, [refreshBoxVisuals]);

  const ui = useMemo(
    () => ({
      canvasCard: "reactor-ui-canvas-card",
      topBadgeRow: "reactor-ui-top-badge-row",
      worldUpdateBadge: "reactor-ui-world-update-badge",
      controls: "reactor-ui-controls",
      instructions: "reactor-ui-instructions",
      headerRow: "reactor-ui-header-row",
      title: "reactor-ui-title",
      titleBtn: "reactor-ui-title-btn",
      sectionTitleBtn: "reactor-ui-section-title-btn",
      btnDark: "reactor-ui-btn reactor-ui-btn-dark",
      btnLight: "reactor-ui-btn reactor-ui-btn-light",
      pillBtn: (active, tone = "neutral") =>
        `reactor-ui-pill-btn${active ? " is-active" : ""}${tone === "danger" ? " is-danger" : ""}`,
      select: "reactor-ui-select",
      section: "reactor-ui-section",
      row: "reactor-ui-row",
      hintTitle: "reactor-ui-hint-title",
      hintText: "reactor-ui-hint-text",
      floatingShow: "reactor-ui-floating-show",
      instructionsShow: "reactor-ui-instructions-show",
      tutorial: "reactor-ui-tutorial",
      tutorialShow: "reactor-ui-tutorial-show",
      catalogue: "reactor-ui-catalogue",
      catalogueShow: "reactor-ui-catalogue-show",
      atomCountsShow: "reactor-ui-atom-counts-show",
      thermoShow: "reactor-ui-thermo-show",
      liveHud: "reactor-ui-live-hud",
      liveHudControls: "reactor-ui-live-hud-controls",
      liveHudBar: "reactor-ui-live-hud-bar",
    }),
    [],
  );

  // ---------- sprites ----------
  const makePixelSphereTexture = useCallback((hex, label) => {
    const size = 48;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const base = new THREE.Color(hex);
    const highlight = base.clone().lerp(new THREE.Color("#ffffff"), 0.45);
    const shadow = base.clone().lerp(new THREE.Color("#000000"), 0.45);
    const outline = new THREE.Color("#0f172a");

    const px = 4;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.42;

    const lx = -0.6;
    const ly = -0.8;

    for (let y = 0; y < size; y += px) {
      for (let x = 0; x < size; x += px) {
        const dx = x + px / 2 - cx;
        const dy = y + px / 2 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;

        const nx = dx / R;
        const ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lambert = clamp01(nx * lx + ny * ly + nz * 0.7);
        const rim = clamp01(1 - d / R);

        let col = base.clone();
        col = col.lerp(shadow, 0.55 * (1 - lambert));
        col = col.lerp(highlight, 0.55 * lambert);
        col = col.lerp(new THREE.Color("#ffffff"), 0.12 * rim);

        ctx.fillStyle = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
        ctx.fillRect(x, y, px, px);
      }
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = `rgb(${Math.round(outline.r * 255)},${Math.round(outline.g * 255)},${Math.round(outline.b * 255)})`;
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const ox = Math.round((cx + Math.cos(rad) * (R + 1)) / px) * px;
      const oy = Math.round((cy + Math.sin(rad) * (R + 1)) / px) * px;
      ctx.fillRect(ox, oy, px, px);
    }

    ctx.globalAlpha = 0.95;
    ctx.font = "bold 12px 'Press Start 2P', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    ctx.fillText(label, cx, cy + 2);

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const makeGlowTexture = useCallback(() => {
    const size = 96;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const g = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.08,
      size * 0.5,
      size * 0.5,
      size * 0.5,
    );
    g.addColorStop(0, "rgba(253,224,71,0.95)");
    g.addColorStop(0.42, "rgba(250,204,21,0.62)");
    g.addColorStop(0.75, "rgba(245,158,11,0.24)");
    g.addColorStop(1, "rgba(245,158,11,0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const getSpriteMaterial = useCallback((el) => {
    const t = threeRef.current;
    if (t.spriteMaterials.has(el)) return t.spriteMaterials.get(el);

    const colorMap = {
      H: "#f1f5f9",
      C: "#111827",
      N: "#3b82f6",
      O: "#ef4444",
      P: "#f59e0b",
      S: "#facc15",
    };

    const tex = makePixelSphereTexture(colorMap[el], el);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    t.spriteMaterials.set(el, mat);
    return mat;
  }, [makePixelSphereTexture]);

  const getGlowTexture = useCallback(() => {
    const t = threeRef.current;
    if (t.glowTexture) return t.glowTexture;
    t.glowTexture = makeGlowTexture();
    return t.glowTexture;
  }, [makeGlowTexture]);

  const createGlowMaterial = useCallback(() => {
    return new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: "#fde68a",
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
  }, [getGlowTexture]);

  const getDiscoveryGlowFactor = useCallback((catalogId, nowMs = Date.now()) => {
    if (!catalogId) return 0;
    const until = discoveryGlowUntilRef.current.get(catalogId) ?? 0;
    if (until <= nowMs) return 0;
    const left = until - nowMs;
    if (left >= FIRST_DISCOVERY_CALLOUT_FADE_MS) return 1;
    return clamp01(left / FIRST_DISCOVERY_CALLOUT_FADE_MS);
  }, []);

  const ensureSpriteForAtom = useCallback((atom) => {
    const map = atomSpritesRef.current;
    const t = threeRef.current;
    if (map.has(atom.id)) return map.get(atom.id);

    const spr = new THREE.Sprite(getSpriteMaterial(atom.el));
    const s = atom.r * 2.2;
    spr.scale.set(s, s, 1);
    spr.position.set(atom.x, atom.y, atom.z);
    spr.userData.atomId = atom.id;

    t.atomGroup.add(spr);
    map.set(atom.id, spr);
    return spr;
  }, [getSpriteMaterial]);

  const ensureRepeatSprite = useCallback((idx, atomEl) => {
    const t = threeRef.current;
    while (t.repeatAtomSprites.length <= idx) {
      const mat = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        depthTest: true,
      });
      const spr = new THREE.Sprite(mat);
      spr.userData.isRepeat = true;
      spr.renderOrder = 0;
      t.repeatAtomGroup.add(spr);
      t.repeatAtomSprites.push(spr);
    }
    const spr = t.repeatAtomSprites[idx];
    if (spr.userData.atomEl !== atomEl) {
      const baseMat = getSpriteMaterial(atomEl);
      spr.material.map = baseMat.map;
      spr.material.color.set("#ffffff");
      spr.material.needsUpdate = true;
      spr.userData.atomEl = atomEl;
    }
    return spr;
  }, [getSpriteMaterial]);

  const syncPeriodicRepeatSprites = useCallback(() => {
    const t = threeRef.current;
    const sim = simRef.current;
    const params = paramsRef.current;
    const usePeriodic = Boolean(params?.usePeriodicBoundary);
    const showRepeats = showPeriodicRepeatsRef.current;
    if (!t.repeatAtomGroup) return;

    if (!showRepeats || !usePeriodic) {
      t.repeatAtomGroup.visible = false;
      for (const spr of t.repeatAtomSprites) spr.visible = false;
      return;
    }

    t.repeatAtomGroup.visible = true;
    const halfBox =
      params?.boxHalfSize ??
      Number(controlValuesRef.current?.boxHalfSize ?? DEFAULT_BOX_HALF_SIZE);
    const boxSize = halfBox * 2;
    const margin = Math.min(PERIODIC_REPEAT_MARGIN, halfBox);
    let idx = 0;

    for (const atom of sim.atoms) {
      const xShifts = [0];
      const yShifts = [0];
      const zShifts = [0];
      if (atom.x > halfBox - margin) xShifts.push(-1);
      if (atom.x < -halfBox + margin) xShifts.push(1);
      if (atom.y > halfBox - margin) yShifts.push(-1);
      if (atom.y < -halfBox + margin) yShifts.push(1);
      if (atom.z > halfBox - margin) zShifts.push(-1);
      if (atom.z < -halfBox + margin) zShifts.push(1);

      for (const sx of xShifts) {
        for (const sy of yShifts) {
          for (const sz of zShifts) {
            if (sx === 0 && sy === 0 && sz === 0) continue;
            const spr = ensureRepeatSprite(idx, atom.el);
            const x = atom.x + sx * boxSize;
            const y = atom.y + sy * boxSize;
            const z = atom.z + sz * boxSize;
            const depth = 1 + z * 0.02;
            const s = atom.r * 2.0 * Math.max(0.6, depth);
            spr.position.set(x, y, z);
            spr.scale.set(s, s, 1);
            spr.visible = true;
            idx += 1;
          }
        }
      }
    }

    for (; idx < t.repeatAtomSprites.length; idx += 1) {
      t.repeatAtomSprites[idx].visible = false;
    }
  }, [ensureRepeatSprite]);

  const removeMissingSprites = useCallback(() => {
    const sim = simRef.current;
    const map = atomSpritesRef.current;
    const t = threeRef.current;
    const live = new Set(sim.atoms.map((a) => a.id));
    for (const [id, spr] of map.entries()) {
      if (!live.has(id)) {
        t.atomGroup.remove(spr);
        map.delete(id);
      }
    }

    for (const [id, glow] of t.glowSprites.entries()) {
      if (!live.has(id)) {
        t.atomGroup.remove(glow);
        glow.material?.dispose?.();
        t.glowSprites.delete(id);
      }
    }
  }, []);

  const syncLiveAtomGlow = useCallback((nowMs) => {
    const sim = simRef.current;
    const t = threeRef.current;
    const liveIds = liveHighlightAtomIdsRef.current;
    const atomToCatalogId = liveAtomToCatalogIdRef.current;
    const selectedIds = selectedLiveIdsRef.current;
    const selectedIndexById = selectedLiveIndexByIdRef.current;
    if (!liveIds || liveIds.size <= 0) {
      for (const glow of t.glowSprites.values()) glow.visible = false;
      return;
    }
    const nowAbs = Date.now();
    const yellowSoft = "#fef9c3";
    const yellowBright = "#f59e0b";
    const colorScratch = new THREE.Color();
    const colorTarget = new THREE.Color();

    for (const atom of sim.atoms) {
      const glow = t.glowSprites.get(atom.id);
      const isLive = liveIds.has(atom.id);
      if (!isLive) {
        if (glow) glow.visible = false;
        continue;
      }
      const catalogId = atomToCatalogId.get(atom.id);
      const isSelected = selectedIds.has(catalogId);
      const selectedIndex = selectedIndexById.get(catalogId);
      const selectedPalette = Number.isInteger(selectedIndex)
        ? getLiveSelectionPalette(selectedIndex)
        : null;
      const brightFactor = getDiscoveryGlowFactor(catalogId, nowAbs);

      const spr =
        glow ||
        (() => {
          const g = new THREE.Sprite(createGlowMaterial());
          g.userData.atomId = atom.id;
          g.userData.isGlow = true;
          g.renderOrder = 1;
          t.atomGroup.add(g);
          t.glowSprites.set(atom.id, g);
          return g;
        })();

      const softColor = isSelected ? selectedPalette.atomSoft : yellowSoft;
      const brightColor = isSelected
        ? selectedPalette.atomBright
        : yellowBright;
      colorScratch.set(softColor);
      colorTarget.set(brightColor);
      colorScratch.lerp(colorTarget, brightFactor);
      spr.material.color.copy(colorScratch);
      const baseOpacity = isSelected ? 0.46 : 0.2;
      spr.material.opacity = baseOpacity + (0.94 - baseOpacity) * brightFactor;

      const depth = 1 + atom.z * 0.02;
      const base = atom.r * 2.2 * depth;
      const pulseAmp = 0.02 + (isSelected ? 0.03 : 0) + 0.12 * brightFactor;
      const pulse = 1 + pulseAmp * Math.sin(nowMs * 0.004 + atom.id * 0.7);
      const sizeBase = isSelected ? 1.52 : 1.15;
      const sizePeak = isSelected ? 2.2 : 2.05;
      const sizeScale = sizeBase + (sizePeak - sizeBase) * brightFactor;
      const s = base * sizeScale * pulse;
      spr.position.set(atom.x, atom.y, atom.z);
      spr.scale.set(s, s, 1);
      spr.visible = true;
    }
  }, [createGlowMaterial, getDiscoveryGlowFactor]);

  // ---------- bonds ----------
  const syncBondCylinders = useCallback(() => {
    const t = threeRef.current;
    const sim = simRef.current;
    const params = paramsRef.current;
    const usePeriodic = Boolean(params?.usePeriodicBoundary);
    const halfBox =
      params?.boxHalfSize ??
      Number(controlValuesRef.current?.boxHalfSize ?? DEFAULT_BOX_HALF_SIZE);
    const boxSize = halfBox * 2;

    if (!showBondsRef.current) {
      for (const m of t.bondMeshes) m.visible = false;
      return;
    }

    const needed = sim.bonds.length * 3;

    while (t.bondMeshes.length < needed) {
      const geom = new THREE.CylinderGeometry(0.06, 0.06, 1, 12, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.66,
      });
      const mesh = new THREE.Mesh(geom, mat);
      t.bondGroup.add(mesh);
      t.bondMeshes.push(mesh);
    }

    for (let i = needed; i < t.bondMeshes.length; i++)
      t.bondMeshes[i].visible = false;

    const cameraDir = new THREE.Vector3();
    t.camera.getWorldDirection(cameraDir);

    const yAxis = new THREE.Vector3(0, 1, 0);
    const atomById = new Map(sim.atoms.map((a) => [a.id, a]));
    const liveBondKeys = liveHighlightBondKeysRef.current;
    const atomToCatalogId = liveAtomToCatalogIdRef.current;
    const selectedIds = selectedLiveIdsRef.current;
    const selectedIndexById = selectedLiveIndexByIdRef.current;
    const nowAbs = Date.now();
    const liveBondSoftColor = "#fde68a";
    const liveBondBrightColor = "#f59e0b";
    const bondColorScratch = new THREE.Color();
    const bondColorTarget = new THREE.Color();

    for (let bi = 0; bi < sim.bonds.length; bi++) {
      const bond = sim.bonds[bi];
      const a = atomById.get(bond.aId);
      const b = atomById.get(bond.bId);
      const baseIdx = bi * 3;

      if (!a || !b) {
        for (let k = 0; k < 3; k++) t.bondMeshes[baseIdx + k].visible = false;
        continue;
      }

      const drawOrder = allowMultipleBondsRef.current ? bond.order : 1;
      const isLiveBond = liveBondKeys.has(makeBondKey(bond.aId, bond.bId));
      const catA = atomToCatalogId.get(bond.aId);
      const catB = atomToCatalogId.get(bond.bId);
      const selectedIndex =
        catA && catA === catB && selectedIds.has(catA)
          ? selectedIndexById.get(catA)
          : undefined;
      const isSelectedBond = Number.isInteger(selectedIndex);
      const selectedPalette = isSelectedBond
        ? getLiveSelectionPalette(selectedIndex)
        : null;
      const brightFactor =
        isLiveBond && catA && catB
          ? Math.min(
              getDiscoveryGlowFactor(catA, nowAbs),
              getDiscoveryGlowFactor(catB, nowAbs),
            )
          : 0;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      if (usePeriodic) {
        if (dx > halfBox) dx -= boxSize;
        if (dx < -halfBox) dx += boxSize;
        if (dy > halfBox) dy -= boxSize;
        if (dy < -halfBox) dy += boxSize;
        if (dz > halfBox) dz -= boxSize;
        if (dz < -halfBox) dz += boxSize;
      }

      const crossesBoundary =
        usePeriodic &&
        (Math.abs(b.x - a.x - dx) > 1e-5 ||
          Math.abs(b.y - a.y - dy) > 1e-5 ||
          Math.abs(b.z - a.z - dz) > 1e-5);
      if (crossesBoundary && !showPeriodicRepeatsRef.current) {
        for (let k = 0; k < 3; k++) t.bondMeshes[baseIdx + k].visible = false;
        continue;
      }

      const start = new THREE.Vector3(a.x, a.y, a.z);
      const end = new THREE.Vector3(a.x + dx, a.y + dy, a.z + dz);

      const dir = end.clone().sub(start);
      const len = Math.max(0.001, dir.length());
      const dirN = dir.clone().multiplyScalar(1 / len);

      let offsetAxis = new THREE.Vector3().crossVectors(dirN, cameraDir);
      if (offsetAxis.lengthSq() < 1e-6)
        offsetAxis = new THREE.Vector3().crossVectors(dirN, yAxis);
      if (offsetAxis.lengthSq() < 1e-6) offsetAxis = new THREE.Vector3(1, 0, 0);
      offsetAxis.normalize();

      const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dirN);
      const mid = start.clone().add(end).multiplyScalar(0.5);

      const spacing = drawOrder === 1 ? 0 : drawOrder === 2 ? 0.1 : 0.12;
      const offsets =
        drawOrder === 1
          ? [0]
          : drawOrder === 2
            ? [-spacing, +spacing]
            : [-spacing, 0, +spacing];

      for (let k = 0; k < 3; k++) {
        const mesh = t.bondMeshes[baseIdx + k];
        if (k >= offsets.length) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;

        const off = offsetAxis.clone().multiplyScalar(offsets[k]);
        mesh.position.copy(mid.clone().add(off));
        mesh.setRotationFromQuaternion(quat);

        const mat = mesh.material;
        if (isLiveBond) {
          const soft = isSelectedBond
            ? selectedPalette.bondSoft
            : liveBondSoftColor;
          const bright = isSelectedBond
            ? selectedPalette.bondBright
            : liveBondBrightColor;
          bondColorScratch.set(soft);
          bondColorTarget.set(bright);
          bondColorScratch.lerp(bondColorTarget, brightFactor);
          mat.color.copy(bondColorScratch);
          const baseOpacity = isSelectedBond ? 0.82 : 0.5;
          mat.opacity = baseOpacity + (0.95 - baseOpacity) * brightFactor;
        } else {
          mat.color.set("#f8fafc");
          mat.opacity = 0.66;
        }

        const thickness = isLiveBond
          ? (isSelectedBond ? 1.72 : 1.28) +
            (isSelectedBond ? 0.35 : 0.28) * brightFactor
          : 1.35;
        mesh.scale.set(thickness, len, thickness);
      }
    }
  }, [getDiscoveryGlowFactor]);

  const scanCollectionProgress = useCallback(
    (sim) => {
      if (resetInProgressRef.current) return;
      const nowMs = Date.now();

      const atomCount = sim.atoms.length;
      let totalMass = 0;
      let px = 0;
      let py = 0;
      let pz = 0;
      for (const atom of sim.atoms) {
        const mass = Math.max(0.1, Number(atom.mass) || 0.1);
        totalMass += mass;
        px += mass * atom.vx;
        py += mass * atom.vy;
        pz += mass * atom.vz;
      }
      const vxCom = totalMass > 0 ? px / totalMass : 0;
      const vyCom = totalMass > 0 ? py / totalMass : 0;
      const vzCom = totalMass > 0 ? pz / totalMass : 0;
      let xCom = 0;
      let yCom = 0;
      let zCom = 0;
      if (totalMass > 0) {
        for (const atom of sim.atoms) {
          const mass = Math.max(0.1, Number(atom.mass) || 0.1);
          xCom += mass * atom.x;
          yCom += mass * atom.y;
          zCom += mass * atom.z;
        }
        xCom /= totalMass;
        yCom /= totalMass;
        zCom /= totalMass;
      }
      let thermalKinetic = 0;
      for (const atom of sim.atoms) {
        const mass = Math.max(0.1, Number(atom.mass) || 0.1);
        const dvx = atom.vx - vxCom;
        const dvy = atom.vy - vyCom;
        const dvz = atom.vz - vzCom;
        thermalKinetic += 0.5 * mass * (dvx * dvx + dvy * dvy + dvz * dvz);
      }
      const dof = Math.max(1, 3 * atomCount - (atomCount > 1 ? 3 : 0));
      const temperatureReduced = atomCount > 0 ? (2 * thermalKinetic) / dof : 0;
      const kBoltzmannReducedRaw = Number(
        paramsRef.current?.kBoltzmannReduced ?? 1 / 300,
      );
      const kBoltzmannReduced = Number.isFinite(kBoltzmannReducedRaw)
        ? Math.max(1e-6, kBoltzmannReducedRaw)
        : 1 / 300;
      const temperatureK = temperatureReduced / kBoltzmannReduced;
      const boxHalfSizeNow = Math.max(
        0.5,
        Number(controlValuesRef.current?.boxHalfSize ?? DEFAULT_BOX_HALF_SIZE),
      );
      const boxLength = boxHalfSizeNow * 2;
      const volume = Math.max(1e-6, boxLength * boxLength * boxLength);
      const usePeriodic = Boolean(paramsRef.current?.usePeriodicBoundary);
      let virialSum = 0;
      for (const atom of sim.atoms) {
        const rx = atom.x - xCom;
        const ry = atom.y - yCom;
        const rz = atom.z - zCom;
        virialSum +=
          rx * (Number(atom.fx) || 0) +
          ry * (Number(atom.fy) || 0) +
          rz * (Number(atom.fz) || 0);
      }
      const pressureReducedRaw =
        atomCount > 0 ? (2 * thermalKinetic + virialSum) / (3 * volume) : 0;
      const pressureReduced = Number.isFinite(pressureReducedRaw)
        ? pressureReducedRaw
        : 0;

      const atomByIdForEnergy = new Map(
        sim.atoms.map((atom) => [atom.id, atom]),
      );
      const wrapMinImage = (delta) => {
        if (!usePeriodic) return delta;
        if (delta > boxHalfSizeNow) return delta - boxLength;
        if (delta < -boxHalfSizeNow) return delta + boxLength;
        return delta;
      };
      let bondPotential = 0;
      for (const bond of sim.bonds) {
        const a = atomByIdForEnergy.get(bond.aId);
        const b = atomByIdForEnergy.get(bond.bId);
        if (!a || !b) continue;
        const dx = wrapMinImage(b.x - a.x);
        const dy = wrapMinImage(b.y - a.y);
        const dz = wrapMinImage(b.z - a.z);
        const r = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz) || 0);
        const dr = r - (Number(bond.r0) || 0);
        const k = Math.max(0, Number(bond.k) || 0);
        bondPotential += 0.5 * k * dr * dr;
      }

      const totalEnergyReducedRaw = thermalKinetic + bondPotential;
      const totalEnergyReduced = Number.isFinite(totalEnergyReducedRaw)
        ? totalEnergyReducedRaw
        : 0;
      const enthalpyReducedRaw = totalEnergyReduced + pressureReduced * volume;
      const enthalpyReduced = Number.isFinite(enthalpyReducedRaw)
        ? enthalpyReducedRaw
        : 0;
      const entropyReducedRaw =
        atomCount > 0
          ? Math.log(Math.max(1e-6, volume / atomCount)) +
            1.5 * Math.log(Math.max(1e-6, temperatureReduced))
          : 0;
      const entropyReduced = Number.isFinite(entropyReducedRaw)
        ? entropyReducedRaw
        : 0;

      const thermoKey = `${atomCount}|${temperatureK.toFixed(1)}|${pressureReduced.toFixed(4)}|${entropyReduced.toFixed(3)}|${enthalpyReduced.toFixed(2)}|${totalEnergyReduced.toFixed(2)}`;
      if (thermoKey !== liveThermoKeyRef.current) {
        liveThermoKeyRef.current = thermoKey;
        setLiveThermoEstimate({
          atomCount,
          temperatureK,
          pressureReduced,
          entropyReduced,
          enthalpyReduced,
          totalEnergyReduced,
        });
      }

      const elementCountsNext = { ...EMPTY_ELEMENT_COUNTS };
      for (const atom of sim.atoms) {
        if (Object.hasOwn(elementCountsNext, atom.el)) {
          elementCountsNext[atom.el] += 1;
        }
      }
      const elementCountsKey = ELEMENTS.map((el) => elementCountsNext[el]).join(
        "|",
      );
      if (elementCountsKey !== liveElementCountsKeyRef.current) {
        liveElementCountsKeyRef.current = elementCountsKey;
        setLiveElementCounts(elementCountsNext);
      }

      const components = analyzeMoleculeComponents(sim.atoms, sim.bonds)
        .filter((m) => m.atomCount >= 2)
        .sort((a, b) => {
          if (b.atomCount !== a.atomCount) return b.atomCount - a.atomCount;
          return a.fingerprint.localeCompare(b.fingerprint);
        });

      const summaryByFingerprint = new Map();
      const atomById = new Map(sim.atoms.map((atom) => [atom.id, atom]));
      const weightForComponent = (atomIds = []) => {
        let total = 0;
        for (const atomId of atomIds) {
          const atom = atomById.get(atomId);
          if (!atom) continue;
          total += ATOMIC_WEIGHTS[atom.el] ?? 0;
        }
        return total;
      };
      for (const m of components) {
        const matchedId = catalogByFingerprint.get(m.fingerprint) ?? null;
        const existing = summaryByFingerprint.get(m.fingerprint);
        if (existing) {
          existing.count += 1;
          continue;
        }
        summaryByFingerprint.set(m.fingerprint, {
          fingerprint: m.fingerprint,
          formula: m.formula,
          matchedId,
          atomCount: m.atomCount,
          molecularWeight: weightForComponent(m.atomIds),
          count: 1,
        });
      }
      const summaryRows = Array.from(summaryByFingerprint.values()).sort(
        (a, b) => {
          const aMatched = Boolean(a.matchedId);
          const bMatched = Boolean(b.matchedId);
          if (aMatched !== bMatched) return aMatched ? -1 : 1;
          const aMw = Number.isFinite(a.molecularWeight)
            ? a.molecularWeight
            : 0;
          const bMw = Number.isFinite(b.molecularWeight)
            ? b.molecularWeight
            : 0;
          if (bMw !== aMw) return bMw - aMw;
          if (b.atomCount !== a.atomCount) return b.atomCount - a.atomCount;
          if (b.count !== a.count) return b.count - a.count;
          return a.fingerprint.localeCompare(b.fingerprint);
        },
      );
      const summaryKey = summaryRows
        .map(
          (row) =>
            `${row.fingerprint}:${row.count}:${row.matchedId ?? "_"}:${Math.round((row.molecularWeight ?? 0) * 1000)}`,
        )
        .join("|");
      if (summaryKey !== liveMoleculeSummaryKeyRef.current) {
        liveMoleculeSummaryKeyRef.current = summaryKey;
        setLiveMoleculeSummary(summaryRows);
      }

      const matchedComponents = [];
      const matchedIds = new Set();
      const liveAtomToCatalogId = new Map();
      for (const m of components) {
        const id = catalogByFingerprint.get(m.fingerprint);
        if (!id) continue;
        matchedComponents.push({ id, atomIds: m.atomIds || [] });
        matchedIds.add(id);
        for (const atomId of m.atomIds || []) {
          if (!liveAtomToCatalogId.has(atomId))
            liveAtomToCatalogId.set(atomId, id);
        }
      }
      liveAtomToCatalogIdRef.current = liveAtomToCatalogId;

      const fresh = [];
      for (const id of matchedIds) {
        if (collectedSetRef.current.has(id)) continue;
        fresh.push(id);
      }
      const collectedCountBefore = collectedSetRef.current.size;
      for (const id of fresh) {
        discoveryGlowUntilRef.current.set(
          id,
          nowMs + FIRST_DISCOVERY_CALLOUT_MS,
        );
      }
      if (fresh.length > 0) {
        const atomIdsByCatalog = new Map();
        for (const comp of matchedComponents) {
          if (!atomIdsByCatalog.has(comp.id))
            atomIdsByCatalog.set(comp.id, comp.atomIds);
        }
        for (let i = 0; i < fresh.length; i += 1) {
          const id = fresh[i];
          const atomIds = atomIdsByCatalog.get(id) || [];
          if (atomIds.length <= 0) continue;
          const entry = catalogById.get(id);
          discoveryCalloutsRef.current.push({
            key: `first-${id}-${nowMs}-${discoveryCalloutSeqRef.current++}`,
            catalogId: id,
            name: entry?.name || entry?.formula || id,
            atomIds: atomIds.slice(),
            progressCount: collectedCountBefore + i + 1,
            progressTotal: MOLECULE_CATALOG.length,
            expiresAt: nowMs + FIRST_DISCOVERY_CALLOUT_MS,
          });
        }
        setCalloutEpoch((v) => v + 1);
      }

      const brightIds = new Set();
      for (const id of matchedIds) {
        if (getDiscoveryGlowFactor(id, nowMs) > 0) brightIds.add(id);
      }

      const highlightAtomIds = new Set();
      for (const comp of matchedComponents) {
        for (const atomId of comp.atomIds) {
          highlightAtomIds.add(atomId);
        }
      }

      const highlightBondKeys = new Set();
      if (highlightAtomIds.size > 0) {
        for (const bond of sim.bonds) {
          const aLive = highlightAtomIds.has(bond.aId);
          const bLive = highlightAtomIds.has(bond.bId);
          if (!aLive || !bLive) continue;
          const key = makeBondKey(bond.aId, bond.bId);
          highlightBondKeys.add(key);
        }
      }

      const highlightKey = [
        ...Array.from(highlightAtomIds).sort((a, b) => a - b),
        "::",
        ...Array.from(highlightBondKeys).sort(),
      ].join("|");
      if (highlightKey !== liveHighlightKeyRef.current) {
        liveHighlightKeyRef.current = highlightKey;
        liveHighlightAtomIdsRef.current = highlightAtomIds;
        liveHighlightBondKeysRef.current = highlightBondKeys;
      }

      const matchedIdsOrdered = Array.from(matchedIds).sort();
      const nextLiveCounts = new Map();
      for (const comp of matchedComponents) {
        nextLiveCounts.set(comp.id, (nextLiveCounts.get(comp.id) || 0) + 1);
      }
      const prevLiveCounts = remoteCatalogueLiveCountsRef.current;
      const newlyCreatedCountsById = new Map();
      for (const [id, nextCount] of nextLiveCounts.entries()) {
        const prevCount = Math.max(
          0,
          Math.floor(Number(prevLiveCounts.get(id)) || 0),
        );
        if (nextCount > prevCount) {
          newlyCreatedCountsById.set(id, nextCount - prevCount);
        }
      }
      remoteCatalogueLiveCountsRef.current = nextLiveCounts;
      if (newlyCreatedCountsById.size > 0) {
        const observedAtIso = new Date(nowMs).toISOString();
        setLocalCatalogueStatsById((prev) => {
          const next = { ...prev };
          for (const [id, deltaCount] of newlyCreatedCountsById.entries()) {
            const existing = next[id];
            const firstCreatedAt = existing?.firstCreatedAt || observedAtIso;
            next[id] = {
              firstCreatedAt,
              lastCreatedAt: observedAtIso,
              createdCount: Math.max(
                1,
                Math.floor(Number(existing?.createdCount) || 0) + deltaCount,
              ),
            };
          }
          return next;
        });
        const newlyCreatedIds = [];
        for (const [id, deltaCount] of newlyCreatedCountsById.entries()) {
          for (let i = 0; i < deltaCount; i += 1) newlyCreatedIds.push(id);
        }
        queueRemoteCatalogueEvents(newlyCreatedIds);
      }
      const matchedIdsKey = matchedIdsOrdered.join("|");
      if (matchedIdsKey !== liveMatchedIdsKeyRef.current) {
        liveMatchedIdsKeyRef.current = matchedIdsKey;
        setLiveMatchedIds(matchedIdsOrdered);
      }

      const brightIdsOrdered = Array.from(brightIds).sort();
      const brightIdsKey = brightIdsOrdered.join("|");
      if (brightIdsKey !== liveBrightIdsKeyRef.current) {
        liveBrightIdsKeyRef.current = brightIdsKey;
        setLiveBrightIds(brightIdsOrdered);
      }

      if (fresh.length <= 0) return;
      setCatalogCountGlowNowMs(nowMs);
      setCatalogCountGlowUntilMs((prev) =>
        Math.max(prev, nowMs + FIRST_DISCOVERY_CALLOUT_MS),
      );
      setLastCataloguedId(fresh[fresh.length - 1] ?? null);

      const nowCollected = new Set(collectedSetRef.current);
      for (const id of fresh) nowCollected.add(id);
      collectedSetRef.current = nowCollected;

      setCollectedIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.add(id);
        return Array.from(next).sort();
      });
    },
    [
      catalogByFingerprint,
      catalogById,
      getDiscoveryGlowFactor,
      queueRemoteCatalogueEvents,
    ],
  );

  const queueCollectionScan = useCallback(() => {
    if (typeof window === "undefined") return;
    if (queuedScanPendingRef.current) return;
    queuedScanPendingRef.current = true;
    queuedScanTimerRef.current = window.setTimeout(() => {
      queuedScanPendingRef.current = false;
      queuedScanTimerRef.current = null;
      scanCollectionProgress(simRef.current);
    }, 0);
  }, [scanCollectionProgress]);

  const seedInitialAtoms = useCallback(
    (sim) => {
      if (readSavedCatalogueIdsFromStorage().length <= 0) return;
      const initialCounts = [
        ["O", 4],
        ["H", 8],
      ];
      for (const [el, count] of initialCounts) {
        for (let i = 0; i < count; i += 1) {
          addAtom3D(
            sim,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 3,
            el,
            elements,
            MAX_ATOMS,
          );
        }
      }
    },
    [elements, MAX_ATOMS],
  );

  useReactorSimulationLoop({
    mountRef,
    rafRef,
    threeRef,
    simRef,
    paramsRef,
    toolRef,
    rotateToolValue: TOOL.ROTATE,
    refreshBoxVisuals,
    seedInitialAtoms,
    scanCollectionProgress,
    queueCollectionScan,
    ensureSpriteForAtom,
    removeMissingSprites,
    syncLiveAtomGlow,
    syncPeriodicRepeatSprites,
    syncBondCylinders,
    pausedRef,
    queuedScanTimerRef,
    queuedScanPendingRef,
    collectionScanIntervalSteps: COLLECTION_SCAN_INTERVAL_STEPS,
  });

  // pointer handling
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const t = threeRef.current;
    const sim = simRef.current;

    const getPointerNDC = (e) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      t.pointerNDC.set(x, y);
    };

    const raycastAtom = () => {
      t.raycaster.setFromCamera(t.pointerNDC, t.camera);
      const atomTargets = t.atomGroup.children.filter(
        (obj) => obj.userData?.isGlow !== true,
      );
      const hits = t.raycaster.intersectObjects(atomTargets, false);
      if (!hits.length) return null;
      const id = hits[0].object.userData?.atomId ?? null;
      return typeof id === "number" ? id : null;
    };

    const updateDragPlane = (anchorPoint) => {
      t.camera.getWorldDirection(t.dragPlaneNormal);
      t.dragPlane.setFromNormalAndCoplanarPoint(t.dragPlaneNormal, anchorPoint);
    };

    const rayToPlane = () => {
      t.raycaster.setFromCamera(t.pointerNDC, t.camera);
      const ok = t.raycaster.ray.intersectPlane(t.dragPlane, t.dragHit);
      return ok ? t.dragHit : null;
    };

    const updateHoverTooltip = (e) => {
      const rect = mount.getBoundingClientRect();
      const atomId = raycastAtom();
      if (!atomId) {
        setHoverLiveTooltip(null);
        return;
      }

      const catalogId = liveAtomToCatalogIdRef.current.get(atomId);
      if (!catalogId) {
        setHoverLiveTooltip(null);
        return;
      }

      const entry = catalogById.get(catalogId);
      const x = clamp(
        e.clientX - rect.left + 12,
        8,
        Math.max(8, rect.width - 8),
      );
      const y = clamp(
        e.clientY - rect.top + 12,
        8,
        Math.max(8, rect.height - 8),
      );
      const label = entry?.name || entry?.formula || catalogId;
      setHoverLiveTooltip({ x, y, label });
    };

    const onDown = (e) => {
      const controlsEl = document.getElementById("controls-overlay");
      const instructionsEl = document.getElementById("instructions-overlay");
      const instructionsShowEl = document.getElementById("instructions-show");
      const tutorialEl = document.getElementById("tutorial-overlay");
      const tutorialShowEl = document.getElementById("tutorial-show");
      const catalogueEl = document.getElementById("catalogue-overlay");
      const liveHudEl = document.getElementById("live-molecules-overlay");
      if (
        (controlsEl && controlsEl.contains(e.target)) ||
        (instructionsEl && instructionsEl.contains(e.target)) ||
        (instructionsShowEl && instructionsShowEl.contains(e.target)) ||
        (tutorialEl && tutorialEl.contains(e.target)) ||
        (tutorialShowEl && tutorialShowEl.contains(e.target)) ||
        (catalogueEl && catalogueEl.contains(e.target)) ||
        (liveHudEl && liveHudEl.contains(e.target))
      )
        return;

      if (toolRef.current === TOOL.ROTATE || toolRef.current === TOOL.SAVE)
        return;

      getPointerNDC(e);
      const id = raycastAtom();

      if (toolRef.current === TOOL.DELETE && id) {
        const atom = sim.atoms.find((a) => a.id === id) || null;
        const counts = atom ? { [atom.el]: 1 } : null;
        removeAtom3D(sim, id);
        if (counts) showDeletedReadout(counts);
        scanCollectionProgress(sim);
        return;
      }

      if (id) {
        const catalogId = liveAtomToCatalogIdRef.current.get(id);
        if (catalogId) {
          const isSelected = selectedLiveIdsRef.current.has(catalogId);
          toggleLiveSelection(catalogId, !isSelected);
        }
        const a = sim.atoms.find((x) => x.id === id);
        if (!a) return;
        setGrab(sim, id);
        updateDragPlane(new THREE.Vector3(a.x, a.y, a.z));
        const hit = rayToPlane();
        if (hit) setGrabTarget(sim, hit.x, hit.y, hit.z);
        return;
      }

      if (toolRef.current === TOOL.PLACE) {
        const placePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        t.raycaster.setFromCamera(t.pointerNDC, t.camera);
        const p = new THREE.Vector3();
        const ok = t.raycaster.ray.intersectPlane(placePlane, p);
        if (!ok) return;

        const beforeCount = sim.atoms.length;
        addAtom3D(sim, p.x, p.y, p.z, placeElement, elements, MAX_ATOMS);
        if (sim.atoms.length > beforeCount) {
          showSpawnReadout({ [placeElement]: 1 });
        }
        scanCollectionProgress(sim);
      }
    };

    const onMove = (e) => {
      getPointerNDC(e);
      updateHoverTooltip(e);
      if (toolRef.current === TOOL.ROTATE || toolRef.current === TOOL.SAVE)
        return;
      if (sim.grabbedId) {
        const hit = rayToPlane();
        if (hit) setGrabTarget(sim, hit.x, hit.y, hit.z);
      }
    };

    const onUp = () => setGrab(sim, null);
    const onLeave = () => setHoverLiveTooltip(null);

    mount.addEventListener("pointerdown", onDown);
    mount.addEventListener("pointermove", onMove);
    mount.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onUp);

    return () => {
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("pointermove", onMove);
      mount.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    placeElement,
    elements,
    scanCollectionProgress,
    catalogById,
    toggleLiveSelection,
    showSpawnReadout,
    showDeletedReadout,
  ]);

  // actions
  function clearAll() {
    const sim = simRef.current;
    const counts = { ...EMPTY_ELEMENT_COUNTS };
    for (const atom of sim.atoms) {
      if (Object.hasOwn(counts, atom.el)) counts[atom.el] += 1;
    }
    const hasAny = ELEMENTS.some((el) => (counts[el] || 0) > 0);

    clearSim3D(sim);
    if (hasAny) showDeletedReadout(counts);
    setHoverLiveTooltip(null);
    scanCollectionProgress(sim);
  }
  function shake() {
    nudgeAll(simRef.current, 1.8);
  }

  const spawnTutorialStarterAtoms = useCallback(() => {
    const sim = simRef.current;
    const initialCounts = [
      ["O", 4],
      ["H", 8],
    ];
    const actualSpawnCounts = {};
    for (const [el, count] of initialCounts) {
      for (let i = 0; i < count; i += 1) {
        const beforeCount = sim.atoms.length;
        addAtom3D(
          sim,
          (Math.random() - 0.5) * 4,
          -1.8 + (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 3,
          el,
          elements,
          MAX_ATOMS,
        );
        if (sim.atoms.length > beforeCount) {
          actualSpawnCounts[el] = (actualSpawnCounts[el] || 0) + 1;
        }
      }
    }
    showSpawnReadout(actualSpawnCounts);
    scanCollectionProgress(sim);
  }, [elements, scanCollectionProgress, showSpawnReadout]);

  const onTutorialGetStarted = useCallback(
    (event) => {
      event?.stopPropagation?.();
      if (hasEverLocalSave || starterSeedUsed) {
        setTutorialOpen(false);
        return;
      }
      spawnTutorialStarterAtoms();
      setStarterSeedUsed(true);
      setTutorialOpen(false);
    },
    [
      hasEverLocalSave,
      starterSeedUsed,
      spawnTutorialStarterAtoms,
      setTutorialOpen,
    ],
  );

  const spawnElementCounts = useCallback(
    (counts, jitter = 1.4, doShake = true) => {
      const sim = simRef.current;
      const actualSpawnCounts = {};
      for (const el of ELEMENTS) {
        const count = Math.max(0, Math.floor(Number(counts?.[el]) || 0));
        for (let i = 0; i < count; i += 1) {
          const beforeCount = sim.atoms.length;
          addAtom3D(
            sim,
            (Math.random() - 0.5) * jitter,
            (Math.random() - 0.5) * jitter,
            (Math.random() - 0.5) * jitter,
            el,
            elements,
            MAX_ATOMS,
          );
          if (sim.atoms.length > beforeCount) {
            actualSpawnCounts[el] = (actualSpawnCounts[el] || 0) + 1;
          }
        }
      }
      showSpawnReadout(actualSpawnCounts);
      if (doShake) nudgeAll(simRef.current, 1.8);
      scanCollectionProgress(sim);
    },
    [elements, scanCollectionProgress, showSpawnReadout],
  );

  const removeElementCounts = useCallback(
    (element, countSpec) => {
      const el = String(element || "").trim();
      if (!el) return 0;
      const sim = simRef.current;
      const candidateIds = [];
      for (const atom of sim.atoms) {
        if (atom?.el === el) candidateIds.push(atom.id);
      }
      if (candidateIds.length <= 0) return 0;

      let maxToRemove = 0;
      if (countSpec === "all") {
        maxToRemove = candidateIds.length;
      } else if (countSpec === "half") {
        maxToRemove = Math.max(1, Math.floor(candidateIds.length / 2));
      } else {
        maxToRemove = Math.max(0, Math.floor(Number(countSpec) || 0));
      }
      if (maxToRemove <= 0) return 0;

      let removed = 0;
      while (removed < maxToRemove && candidateIds.length > 0) {
        const idx = Math.floor(Math.random() * candidateIds.length);
        const [id] = candidateIds.splice(idx, 1);
        removeAtom3D(sim, id);
        removed += 1;
      }
      if (removed > 0) {
        showDeletedReadout({ [el]: removed });
        scanCollectionProgress(sim);
      }
      return removed;
    },
    [scanCollectionProgress, showDeletedReadout],
  );

  const addAutomationBuilderAction = useCallback((kind) => {
    const nextKind = String(kind || AUTOMATION_ACTION_KIND.CONDITION);
    const id = `builder-action-${automationBuilderActionSeqRef.current++}`;
    setAutomationBuilderActions((prev) => [
      ...prev,
      createAutomationBuilderAction(id, nextKind),
    ]);
  }, []);

  const addAutomationBuilderWhileAction = useCallback((stepId, kind) => {
    if (!stepId) return;
    const nextKind = String(kind || AUTOMATION_ACTION_KIND.CONDITION);
    const id = `builder-action-${automationBuilderActionSeqRef.current++}`;
    setAutomationBuilderActions((prev) => {
      const appendWhile = (nodes) =>
        nodes.map((node) => {
          if (node.id === stepId) {
            return {
              ...node,
              whileActions: [
                ...(Array.isArray(node.whileActions) ? node.whileActions : []),
                createAutomationBuilderAction(id, nextKind, "while"),
              ],
            };
          }
          return {
            ...node,
            whileActions: appendWhile(
              Array.isArray(node.whileActions) ? node.whileActions : [],
            ),
            thenActions: appendWhile(
              Array.isArray(node.thenActions) ? node.thenActions : [],
            ),
          };
        });
      return appendWhile(Array.isArray(prev) ? prev : []);
    });
  }, []);

  const addAutomationBuilderThenAction = useCallback((afterStepId, kind) => {
    if (!afterStepId) return;
    const nextKind = String(kind || AUTOMATION_ACTION_KIND.CONDITION);
    const id = `builder-action-${automationBuilderActionSeqRef.current++}`;
    const nextAction = createAutomationBuilderAction(id, nextKind, "then");
    setAutomationBuilderActions((prev) => {
      const appendThen = (nodes) => {
        const source = Array.isArray(nodes) ? nodes : [];
        const nextNodes = [];
        let inserted = false;

        for (const node of source) {
          if (inserted) {
            nextNodes.push(node);
            continue;
          }

          if (node.id === afterStepId) {
            nextNodes.push(node, nextAction);
            inserted = true;
            continue;
          }

          const [nextWhile, insertedInWhile] = appendThen(
            Array.isArray(node.whileActions) ? node.whileActions : [],
          );
          const [nextThen, insertedInThen] = appendThen(
            Array.isArray(node.thenActions) ? node.thenActions : [],
          );
          if (insertedInWhile || insertedInThen) {
            nextNodes.push({
              ...node,
              whileActions: nextWhile,
              thenActions: nextThen,
            });
            inserted = true;
            continue;
          }

          nextNodes.push(node);
        }

        return [nextNodes, inserted];
      };
      const base = Array.isArray(prev) ? prev : [];
      const [next, inserted] = appendThen(base);
      return inserted ? next : base;
    });
  }, []);

  const updateAutomationBuilderAction = useCallback((id, patch) => {
    if (!id || !patch || typeof patch !== "object") return;
    setAutomationBuilderActions((prev) => {
      const updateTree = (nodes) =>
        nodes.map((node) => {
          if (node.id === id) return { ...node, ...patch };
          return {
            ...node,
            whileActions: updateTree(
              Array.isArray(node.whileActions) ? node.whileActions : [],
            ),
            thenActions: updateTree(
              Array.isArray(node.thenActions) ? node.thenActions : [],
            ),
          };
        });
      return updateTree(Array.isArray(prev) ? prev : []);
    });
  }, []);

  const removeAutomationBuilderAction = useCallback((id) => {
    if (!id) return;
    setAutomationBuilderActions((prev) => {
      const removeFromTree = (nodes) =>
        nodes
          .filter((node) => node.id !== id)
          .map((node) => ({
            ...node,
            whileActions: removeFromTree(
              Array.isArray(node.whileActions) ? node.whileActions : [],
            ),
            thenActions: removeFromTree(
              Array.isArray(node.thenActions) ? node.thenActions : [],
            ),
          }));
      return removeFromTree(Array.isArray(prev) ? prev : []);
    });
  }, []);

  const clearAutomationBuilder = useCallback(() => {
    const shouldClear = window.confirm(
      "Clear all steps? This will delete the entire automation builder.",
    );
    if (!shouldClear) return;
    setAutomationBuilderActions([]);
    setAutomationBuilderWhilePickerForId(null);
    setAutomationBuilderThenPickerForId(null);
  }, []);

  const stopAutomationBuilder = useCallback((message = "idle") => {
    automationBuilderRunRef.current.running = false;
    setAutomationBuilderRunning(false);
    setAutomationBuilderStatus(message);
    setAutomationBuilderActiveIndex(-1);
    setAutomationBuilderActiveActionIds([]);
    setAutomationBuilderActiveStepCodes([]);
    setAutomationBuilderRemainingMs(0);
  }, []);

  const startAutomationBuilder = useCallback(() => {
    if (!Array.isArray(automationBuilderActions) || automationBuilderActions.length <= 0) {
      setAutomationBuilderStatus("Add at least one action");
      return;
    }
    setAutomationBuilderRunning(true);
  }, [automationBuilderActions]);

  const runAutomationBuilderAtomAction = useCallback(
    (action) => {
      const op = normalizeAutomationBuilderAtomOperation(action?.operation);
      const entries = normalizeAutomationBuilderAtomEntries(action, op);
      if (op === "remove") {
        for (const entry of entries) {
          removeElementCounts(entry.element, entry.count);
        }
        return;
      }
      const addCounts = {};
      for (const entry of entries) {
        const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
        if (count <= 0) continue;
        const el = String(entry?.element || "H");
        addCounts[el] = (addCounts[el] || 0) + count;
      }
      if (Object.keys(addCounts).length <= 0) return;
      spawnElementCounts(addCounts, 1.35, true);
    },
    [removeElementCounts, spawnElementCounts],
  );

  function spawnAtoms(count) {
    const sim = simRef.current;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const spawnedCounts = {};
    for (let i = 0; i < n; i++) {
      const el = placeElement;
      const beforeCount = sim.atoms.length;
      addAtom3D(
        sim,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        el,
        elements,
        MAX_ATOMS,
      );
      if (sim.atoms.length > beforeCount) {
        spawnedCounts[el] = (spawnedCounts[el] || 0) + 1;
      }
    }
    showSpawnReadout(spawnedCounts);
    shake();
    scanCollectionProgress(sim);
  }

  useEffect(() => {
    controlValuesRef.current = {
      temperatureK,
      damping,
      bondScale,
      boxHalfSize,
    };
  }, [temperatureK, damping, bondScale, boxHalfSize]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(elementCountDeltaTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      elementCountDeltaTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    liveThermoEstimateRef.current = liveThermoEstimate;
  }, [liveThermoEstimate]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const sample = () => {
      const nowMs = Date.now();
      const current = liveThermoEstimateRef.current;
      const hasAtoms = Number(current?.atomCount || 0) > 0;
      const sampledTemperature = hasAtoms
        ? Math.max(0, Number(current?.temperatureK) || 0)
        : 0;
      const sampledPressure = hasAtoms
        ? Number(current?.pressureReduced) || 0
        : 0;

      setLiveThermoHistory((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        next.push({
          atMs: nowMs,
          temperatureK: sampledTemperature,
          pressureReduced: sampledPressure,
        });
        const cutoffMs = nowMs - THERMO_HISTORY_WINDOW_MS;
        while (next.length > 0 && Number(next[0]?.atMs) < cutoffMs) {
          next.shift();
        }
        const maxPoints =
          Math.ceil(THERMO_HISTORY_WINDOW_MS / THERMO_SAMPLE_MS) + 2;
        if (next.length > maxPoints) {
          next.splice(0, next.length - maxPoints);
        }
        return next;
      });
    };

    sample();
    const intervalId = window.setInterval(sample, THERMO_SAMPLE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!automationBuilderRunning) return undefined;
    const sourceActions = Array.isArray(automationBuilderActions)
      ? automationBuilderActions
      : [];
    if (sourceActions.length <= 0) {
      setAutomationBuilderStatus("Add at least one action");
      setAutomationBuilderRunning(false);
      return undefined;
    }

    const normalizeNodeForRun = (node) => ({
      ...node,
      whileActions: Array.isArray(node?.whileActions)
        ? node.whileActions.map((child) => normalizeNodeForRun(child))
        : [],
      thenActions: Array.isArray(node?.thenActions)
        ? node.thenActions.map((child) => normalizeNodeForRun(child))
        : [],
    });
    const normalizedRoots = sourceActions.map((action) =>
      normalizeNodeForRun(action),
    );
    const executionSteps = [];
    const collectWhileCluster = (root, rootCode) => {
      const actionEntries = [];
      const thenRoots = [];
      const visitWhileTree = (node, nodeCode) => {
        actionEntries.push({
          action: node,
          stepCode: nodeCode,
        });
        const whileChildren = Array.isArray(node?.whileActions)
          ? node.whileActions
          : [];
        whileChildren.forEach((child, childIndex) => {
          visitWhileTree(
            child,
            `${nodeCode}.${getAutomationAlphabetSegment(childIndex)}`,
          );
        });
        const thenChildren = Array.isArray(node?.thenActions)
          ? node.thenActions
          : [];
        thenChildren.forEach((child, childIndex) => {
          thenRoots.push({
            root: child,
            stepCode: `${nodeCode}.${childIndex + 1}`,
          });
        });
      };
      visitWhileTree(root, rootCode);
      return { actionEntries, thenRoots };
    };
    const visitSequential = (root, stepCode) => {
      if (!root) return;
      const { actionEntries, thenRoots } = collectWhileCluster(root, stepCode);
      if (actionEntries.length > 0) {
        executionSteps.push({
          rootId: root.id,
          actions: actionEntries.map((entry) => entry.action),
          stepCodes: actionEntries.map((entry) => entry.stepCode),
        });
      }
      for (const nextRoot of thenRoots) {
        visitSequential(nextRoot.root, nextRoot.stepCode);
      }
    };
    normalizedRoots.forEach((root, rootIndex) => {
      visitSequential(root, String(rootIndex + 1));
    });
    if (executionSteps.length <= 0) {
      setAutomationBuilderStatus("Add at least one action");
      setAutomationBuilderRunning(false);
      return undefined;
    }
    const now = performance.now();
    automationBuilderRunRef.current = {
      running: true,
      steps: executionSteps,
      index: 0,
      actionStartedAtMs: now,
      lastStepElapsedMs: 0,
      appliedAtomActionIds: new Set(),
    };
    setPaused(false);
    setAutomationBuilderStatus("running");
    setAutomationBuilderActiveIndex(0);
    setAutomationBuilderActiveActionIds([]);
    setAutomationBuilderActiveStepCodes([]);
    setAutomationBuilderRemainingMs(0);

    const getActionDurationMs = (action) => {
      if (action?.kind === AUTOMATION_ACTION_KIND.ATOMS) return 260;
      return Math.max(1, Math.floor(Number(action?.durationSec) || 5)) * 1000;
    };
    const applyConditionAction = (action, dtSeconds) => {
      if (!(dtSeconds > 0)) return;
      const speed =
        String(action?.speed || "slowly") === "quickly" ? "quickly" : "slowly";
      const directionKey = String(action?.direction || "increase");
      const direction =
        directionKey === "decrease"
          ? "decrease"
          : directionKey === "hold" || directionKey === "wait"
            ? "wait"
            : "increase";
      const target =
        String(action?.target || "temperature") === "volume" ||
        String(action?.target || "temperature") === "pressure"
          ? "volume"
          : "temperature";
      if (direction === "wait") return;
      if (target === "temperature") {
        const rate = AUTOMATION_TEMPERATURE_RATE_BY_SPEED[speed] ?? 60;
        const sign = direction === "increase" ? 1 : -1;
        setTemperatureK((prev) =>
          clamp(
            prev + sign * rate * dtSeconds,
            TEMP_CONTROL_MIN_K,
            TEMP_CONTROL_MAX_K,
          ),
        );
        return;
      }
      const volumeRate = AUTOMATION_VOLUME_RATE_BY_SPEED[speed] ?? 0.45;
      const volumeSign = direction === "increase" ? 1 : -1;
      const deltaBox = volumeSign * volumeRate * dtSeconds;
      setBoxHalfSize((prev) =>
        clamp(
          prev + deltaBox,
          PRESSURE_CONTROL_MIN_BOX_HALF_SIZE,
          PRESSURE_CONTROL_MAX_BOX_HALF_SIZE,
        ),
      );
    };

    const tick = () => {
      const run = automationBuilderRunRef.current;
      if (!run.running) return;
      const stepEntry = run.steps[run.index];
      if (!stepEntry) {
        stopAutomationBuilder("completed");
        return;
      }
      const stepActions = Array.isArray(stepEntry.actions)
        ? stepEntry.actions
        : [];
      if (stepActions.length <= 0) {
        run.index += 1;
        run.actionStartedAtMs = performance.now();
        run.lastStepElapsedMs = 0;
        run.appliedAtomActionIds = new Set();
        setAutomationBuilderActiveStepCodes([]);
        return;
      }

      const nowMs = performance.now();
      const elapsedMs = Math.max(0, nowMs - run.actionStartedAtMs);
      const durationMs = Math.max(
        1,
        ...stepActions.map((action) => getActionDurationMs(action)),
      );
      const remainingMs = Math.max(0, durationMs - elapsedMs);
      const stepCodes = Array.isArray(stepEntry.stepCodes)
        ? stepEntry.stepCodes.filter((code) => typeof code === "string" && code)
        : [];
      const stepCodesLabel = stepCodes.length > 0 ? stepCodes.join(", ") : "Unknown";
      setAutomationBuilderActiveIndex(run.index);
      setAutomationBuilderActiveActionIds(stepActions.map((action) => action.id));
      setAutomationBuilderActiveStepCodes(stepCodes);
      setAutomationBuilderRemainingMs(remainingMs);
      setAutomationBuilderStatus(`Running step ${stepCodesLabel}`);

      for (const action of stepActions) {
        const actionDurationMs = getActionDurationMs(action);
        if (action.kind === AUTOMATION_ACTION_KIND.CONDITION) {
          const prevElapsedMs = Math.min(run.lastStepElapsedMs, actionDurationMs);
          const currElapsedMs = Math.min(elapsedMs, actionDurationMs);
          const dtSeconds = Math.max(0, (currElapsedMs - prevElapsedMs) / 1000);
          applyConditionAction(action, dtSeconds);
          continue;
        }
        if (action.kind === AUTOMATION_ACTION_KIND.ATOMS) {
          if (run.appliedAtomActionIds.has(action.id)) continue;
          run.appliedAtomActionIds.add(action.id);
          runAutomationBuilderAtomAction(action);
        }
      }
      run.lastStepElapsedMs = elapsedMs;

      if (elapsedMs < durationMs) return;
      run.index += 1;
      run.actionStartedAtMs = nowMs;
      run.lastStepElapsedMs = 0;
      run.appliedAtomActionIds = new Set();
      if (run.index >= run.steps.length) {
        if (automationBuilderRepeatCycle) {
          run.index = 0;
          run.actionStartedAtMs = nowMs;
          run.lastStepElapsedMs = 0;
          run.appliedAtomActionIds = new Set();
          setAutomationBuilderStatus("running");
          setAutomationBuilderActiveIndex(0);
          setAutomationBuilderActiveStepCodes([]);
          setAutomationBuilderRemainingMs(0);
          return;
        }
        stopAutomationBuilder("completed");
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 90);
    return () => window.clearInterval(intervalId);
  }, [
    automationBuilderActions,
    automationBuilderRepeatCycle,
    automationBuilderRunning,
    runAutomationBuilderAtomAction,
    stopAutomationBuilder,
  ]);

  function normalizeCatalogueIds(candidate) {
    if (!Array.isArray(candidate)) return [];
    const valid = candidate.filter(
      (id) => typeof id === "string" && catalogById.has(id),
    );
    return Array.from(new Set(valid)).sort();
  }

  function normalizeExportableLocalCatalogueStats(statsById) {
    const next = {};
    for (const [id, raw] of Object.entries(statsById || {})) {
      if (!catalogById.has(id) || !raw || typeof raw !== "object") continue;
      const firstCreatedAt = normalizeCatalogueTimestamp(raw.firstCreatedAt);
      const lastCreatedAt = normalizeCatalogueTimestamp(raw.lastCreatedAt);
      const createdCount = Math.max(
        0,
        Math.floor(Number(raw.createdCount) || 0),
      );
      if (!firstCreatedAt && !lastCreatedAt && createdCount <= 0) continue;
      next[id] = {
        firstCreatedAt,
        lastCreatedAt,
        createdCount,
      };
    }
    return next;
  }

  async function exportEncryptedCatalogue() {
    try {
      setCatalogueSaveBusy(true);
      setCatalogueSaveStatus("");

      const payloadJson = JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        collectedIds: normalizeCatalogueIds(collectedIds),
        moleculeStatsById: normalizeExportableLocalCatalogueStats(
          localCatalogueStatsById,
        ),
      });
      const encrypted = await encryptCatalogueJson(payloadJson);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `reactor-catalogue-save-${stamp}.json`;
      const blob = new Blob([encrypted], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCatalogueSaveStatus(`Saved encrypted catalogue: ${filename}`);
    } catch {
      setCatalogueSaveStatus("Save failed. Please try again.");
    } finally {
      setCatalogueSaveBusy(false);
    }
  }

  function triggerCatalogueImportPicker() {
    catalogueImportFileRef.current?.click();
  }

  async function importEncryptedCatalogue(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      setCatalogueSaveBusy(true);
      setCatalogueSaveStatus("");

      const text = await file.text();
      const payload = JSON.parse(text);
      let rawJsonText = text;
      if (payload?.format === REACTOR_SAVE_EXPORT_FORMAT) {
        rawJsonText = await decryptCatalogueJsonPayload(payload);
      } else if (payload && typeof payload === "object") {
        rawJsonText = JSON.stringify(payload);
      }

      const parsed = JSON.parse(rawJsonText);
      const progress = normalizeLocalCatalogueProgress(parsed);
      const ids = normalizeCatalogueIds(progress.collectedIds);
      const statsById = normalizeExportableLocalCatalogueStats(
        progress.moleculeStatsById,
      );

      setCollectedIds(ids);
      setLocalCatalogueStatsById(statsById);
      setLastCataloguedId(chooseLastCreatedCatalogueId(ids, statsById));
      setCatalogCountGlowUntilMs(0);
      setCatalogCountGlowNowMs(0);
      setCatalogueSaveStatus(`Loaded catalogue: ${file.name}`);
    } catch {
      setCatalogueSaveStatus(
        "Load failed. Use a valid encrypted catalogue JSON.",
      );
    } finally {
      setCatalogueSaveBusy(false);
      if (event?.target) event.target.value = "";
    }
  }

  function resetCatalogueProgress() {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      "WARNING: This permanently deletes your Reactor catalogue local save from this browser.\n\nExport Save JSON and store it locally before continuing.\n\nDo you want to continue?",
    );
    if (!confirmed) return;
    const finalConfirm = window.confirm(
      "Final confirmation: proceed with permanent reset now?",
    );
    if (!finalConfirm) return;
    resetInProgressRef.current = true;

    discoveryGlowUntilRef.current.clear();
    discoveryCalloutsRef.current = [];
    liveBrightIdsKeyRef.current = "";
    selectedLiveIdsRef.current = new Set();
    selectedLiveIndexByIdRef.current = new Map();
    selectedLivePaletteSlotByIdRef.current = new Map();
    nextLivePaletteSlotRef.current = 0;
    setHoverLiveTooltip(null);
    setLiveBrightIds([]);
    setSelectedLiveIds([]);
    setDiscoveryCallouts([]);
    setCalloutEpoch((v) => v + 1);
    setCollectedIds([]);
    setLocalCatalogueStatsById({});
    setLastCataloguedId(null);
    setCatalogCountGlowUntilMs(0);
    setCatalogCountGlowNowMs(0);
    localStorage.removeItem(CATALOGUE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_COLLECTION_STORAGE_KEY);
    window.location.reload();
  }

  // Reset ALL controls EXCEPT the currently-selected tool mode
  function resetAllControls() {
    stopAutomationBuilder("idle");
    setPaused(false);
    setTemperatureK(DEFAULT_TEMPERATURE_K);
    setTempBathMode(TEMP_BATH_MODE.OFF);
    setTempBathPulse(null);
    setPressureBathMode(PRESSURE_BATH_MODE.OFF);
    setPressureBathPulse(null);

    setBoxHalfSize(DEFAULT_BOX_HALF_SIZE);
    setShowBoxEdges(true);
    setShowPeriodicRepeats(false);

    setShowBonds(true);
    setSpawnElementCount(5);

    // DO NOT change tool
    setPlaceElement("C");

    // leave controlsOpen as-is (don't force open on mobile)
  }

  function toggleCollectionSort(nextKey) {
    if (nextKey === "firstCreated" || nextKey === "lastCreated") {
      if (collectionSort === nextKey) {
        if (nextKey === "firstCreated") {
          setCollectionFirstCreatedSortMode(advanceCreatedSortMode);
        } else {
          setCollectionLastCreatedSortMode(advanceCreatedSortMode);
        }
        return;
      }
      setCollectionSort(nextKey);
      if (nextKey === "firstCreated") {
        setCollectionFirstCreatedSortMode("me-asc");
      } else {
        setCollectionLastCreatedSortMode("me-asc");
      }
      setCollectionSortDir("asc");
      return;
    }

    if (collectionSort === nextKey) {
      setCollectionSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setCollectionSort(nextKey);
    setCollectionSortDir("asc");
  }

  function sortArrowsFor(key) {
    const active = collectionSort === key;
    if (key === "firstCreated" || key === "lastCreated") {
      const mode = String(
        key === "lastCreated"
          ? collectionLastCreatedSortMode
          : collectionFirstCreatedSortMode,
      );
      const showDown = !active || mode.endsWith("-desc");
      const showUp = !active || mode.endsWith("-asc");
      const label = createdSortBadgeLabel(mode);
      return (
        <span
          className="reactor-sort-arrows reactor-sort-arrows-created"
          data-active={active ? "true" : "false"}
          aria-hidden="true"
        >
          {active ? (
            <span className="reactor-sort-arrows-badge">{label}</span>
          ) : null}
          {showDown ? (
            <span className="reactor-sort-arrow-down">&darr;</span>
          ) : null}
          {showUp ? (
            <span className="reactor-sort-arrow-up">&uarr;</span>
          ) : null}
        </span>
      );
    }

    const dir = collectionSortDir === "desc" ? "desc" : "asc";
    const showDown = !active || dir === "desc";
    const showUp = !active || dir === "asc";
    return (
      <span
        className="reactor-sort-arrows reactor-sort-arrows-default"
        data-active={active ? "true" : "false"}
        aria-hidden="true"
      >
        {showDown ? (
          <span className="reactor-sort-arrow-down">&darr;</span>
        ) : null}
        {showUp ? (
          <span className="reactor-sort-arrow-up">&uarr;</span>
        ) : null}
      </span>
    );
  }

  const placeElementLabel = ELEMENT_NAMES[placeElement] || placeElement;

  const instructionText = useMemo(() => {
    if (tool === TOOL.ROTATE) {
      return {
        title: "View mode",
        lines: [
          "Drag: rotate view",
          "Scroll / pinch: zoom",
          "Right-drag / two-finger drag: pan",
          "Use periodic repeats to inspect edge-wrapped molecules.",
        ],
      };
    }
    if (tool === TOOL.DELETE) {
      return { title: "Delete mode", lines: ["Click an atom to delete it."] };
    }
    if (tool === TOOL.SAVE) {
      return {
        title: "Save mode",
        lines: ["Export, import, or reset molecular catalogue."],
      };
    }
    return {
      title: "Place/Select mode",
      lines: [
        `Click empty space: place one ${placeElement} atom`,
        "Drag existing atom: move it",
        "Click live molecule: select/deselect it",
      ],
    };
  }, [tool, placeElement]);

  const hiddenModeSummary = useMemo(() => {
    if (tool === TOOL.PLACE) return `Place ${placeElement} / Select`;
    if (tool === TOOL.DELETE) return "Delete";
    if (tool === TOOL.ROTATE) return "View";
    if (tool === TOOL.SAVE) return "Save";
    return "Mode";
  }, [tool, placeElement]);

  const hiddenModeMouseLines = useMemo(() => {
    if (tool === TOOL.SAVE) return ["mouse has no effect"];
    if (tool === TOOL.ROTATE) {
      return [
        "Drag: rotate view",
        "Scroll / pinch: zoom",
        "Right-drag / two-finger drag: pan",
      ];
    }
    if (tool === TOOL.DELETE) return ["Click atom: delete it"];
    return [
      `Click empty space: place one ${placeElement} atom`,
      "Drag existing atom: move it",
      "Click live molecule: select/deselect it",
    ];
  }, [tool, placeElement]);
  const automationVisualActive = automationBuilderRunning;
  const effectiveTempBathMode = automationVisualActive
    ? automationTempVisualMode
    : tempBathMode;
  const effectivePressureBathMode = automationVisualActive
    ? automationPressureVisualMode
    : pressureBathMode;
  const tempBathCenterLabel = useMemo(() => {
    if (effectiveTempBathMode === TEMP_BATH_MODE.OFF) return "OFF";
    const atMin = temperatureK <= TEMP_CONTROL_MIN_K + 1e-6;
    const atMax = temperatureK >= TEMP_CONTROL_MAX_K - 1e-6;
    const cooling =
      effectiveTempBathMode === TEMP_BATH_MODE.FAST_COOL ||
      effectiveTempBathMode === TEMP_BATH_MODE.SLOW_COOL;
    const heating =
      effectiveTempBathMode === TEMP_BATH_MODE.FAST_HEAT ||
      effectiveTempBathMode === TEMP_BATH_MODE.SLOW_HEAT;
    if (cooling && atMin) return "MIN";
    if (heating && atMax) return "MAX";
    return "";
  }, [effectiveTempBathMode, temperatureK]);
  const pressureBathCenterLabel = useMemo(() => {
    if (effectivePressureBathMode === PRESSURE_BATH_MODE.OFF) return "OFF";
    const atMin = boxHalfSize <= PRESSURE_CONTROL_MIN_BOX_HALF_SIZE + 1e-6;
    const atMax = boxHalfSize >= PRESSURE_CONTROL_MAX_BOX_HALF_SIZE - 1e-6;
    const contracting =
      effectivePressureBathMode === PRESSURE_BATH_MODE.FAST_CONTRACT ||
      effectivePressureBathMode === PRESSURE_BATH_MODE.SLOW_CONTRACT;
    const expanding =
      effectivePressureBathMode === PRESSURE_BATH_MODE.FAST_EXPAND ||
      effectivePressureBathMode === PRESSURE_BATH_MODE.SLOW_EXPAND;
    if (contracting && atMin) return "MIN";
    if (expanding && atMax) return "MAX";
    return "";
  }, [effectivePressureBathMode, boxHalfSize]);
  const automationKindOptions = (
    <>
      <option value={AUTOMATION_ACTION_KIND.CONDITION}>Change controls</option>
      <option value={AUTOMATION_ACTION_KIND.ATOMS}>Add/Remove atoms</option>
      <option value={AUTOMATION_ACTION_KIND.WAIT}>Wait</option>
    </>
  );
  const renderAutomationBuilderActionFields = (rowAction) => {
    const actionKind = String(rowAction.kind || "");
    if (actionKind === AUTOMATION_ACTION_KIND.CONDITION) {
      const durationValue = Math.max(
        1,
        Math.floor(Number(rowAction.durationSec) || 5),
      );
      return (
        <div className="reactor-automation-builder-line">
          <select
            value={String(rowAction.speed || "slowly")}
            onChange={(e) =>
              updateAutomationBuilderAction(rowAction.id, {
                speed: e.target.value,
              })
            }
            disabled={automationBuilderRunning}
            className={ui.select}
          >
            {AUTOMATION_SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={String(rowAction.direction || "increase")}
            onChange={(e) =>
              updateAutomationBuilderAction(rowAction.id, {
                direction: e.target.value,
              })
            }
            disabled={automationBuilderRunning}
            className={ui.select}
          >
            {AUTOMATION_DIRECTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={String(rowAction.target || "temperature")}
            onChange={(e) =>
              updateAutomationBuilderAction(rowAction.id, {
                target: e.target.value,
              })
            }
            disabled={automationBuilderRunning}
            className={ui.select}
          >
            {AUTOMATION_CONDITION_TARGET_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="reactor-text-10-muted">for</span>
          <select
            value={durationValue}
            onChange={(e) =>
              updateAutomationBuilderAction(rowAction.id, {
                durationSec: parseInt(e.target.value, 10),
              })
            }
            disabled={automationBuilderRunning}
            className={ui.select}
          >
            {AUTOMATION_DURATION_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}
              </option>
            ))}
          </select>
          <span className="reactor-text-10-muted">
            {durationValue === 1 ? "second" : "seconds"}
          </span>
        </div>
      );
    }
    if (actionKind === AUTOMATION_ACTION_KIND.ATOMS) {
      const atomOperation = normalizeAutomationBuilderAtomOperation(
        rowAction.operation,
      );
      const atomEntries = normalizeAutomationBuilderAtomEntries(
        rowAction,
        atomOperation,
      );
      const commitAtomEntries = (nextEntries, nextOperation = atomOperation) => {
        const normalizedOperation =
          normalizeAutomationBuilderAtomOperation(nextOperation);
        const normalizedEntries =
          Array.isArray(nextEntries) && nextEntries.length > 0
            ? nextEntries.map((entry) =>
                normalizeAutomationBuilderAtomEntry(entry, normalizedOperation),
              )
            : [createAutomationBuilderAtomEntry(normalizedOperation)];
        const primaryEntry = normalizedEntries[0];
        updateAutomationBuilderAction(rowAction.id, {
          operation: normalizedOperation,
          atomEntries: normalizedEntries,
          count: primaryEntry.count,
          element: primaryEntry.element,
        });
      };
      return (
        <div className="reactor-automation-builder-atom-ops">
          <select
            value={atomOperation}
            onChange={(e) => {
              const nextOperation = normalizeAutomationBuilderAtomOperation(
                e.target.value,
              );
              commitAtomEntries(atomEntries, nextOperation);
            }}
            disabled={automationBuilderRunning}
            className={ui.select}
          >
            <option value="add">add</option>
            <option value="remove">remove</option>
          </select>
          {atomEntries.map((entry, entryIndex) => (
            <div
              key={`atom-entry-${entryIndex}`}
              className="reactor-automation-builder-line reactor-automation-builder-atom-row"
            >
              {entryIndex > 0 ? (
                <span className="reactor-text-10-muted">and</span>
              ) : null}
              <select
                value={
                  atomOperation === "remove"
                    ? String(entry.count ?? "half")
                    : Math.max(1, Math.floor(Number(entry.count) || 1))
                }
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const nextCount =
                    atomOperation === "remove" &&
                    (rawValue === "half" || rawValue === "all")
                      ? rawValue
                      : parseInt(rawValue, 10);
                  const nextEntries = atomEntries.map((candidate, idx) =>
                    idx === entryIndex ? { ...candidate, count: nextCount } : candidate,
                  );
                  commitAtomEntries(nextEntries);
                }}
                disabled={automationBuilderRunning}
                className={ui.select}
              >
                {atomOperation === "remove"
                  ? AUTOMATION_ATOM_REMOVE_COUNT_OPTIONS.map((countOption) => (
                      <option
                        key={`remove-count-${entryIndex}-${countOption}`}
                        value={String(countOption)}
                      >
                        {String(countOption)}
                      </option>
                    ))
                  : AUTOMATION_ATOM_COUNT_OPTIONS.map((count) => (
                      <option key={`${entryIndex}-${count}`} value={count}>
                        {count}
                      </option>
                    ))}
              </select>
              <span className="reactor-text-10-muted">
                {Number(entry?.count) === 1 ? "atom of" : "atoms of"}
              </span>
              <select
                value={String(entry.element || "H")}
                onChange={(e) => {
                  const nextEntries = atomEntries.map((candidate, idx) =>
                    idx === entryIndex
                      ? { ...candidate, element: e.target.value }
                      : candidate,
                  );
                  commitAtomEntries(nextEntries);
                }}
                disabled={automationBuilderRunning}
                className={ui.select}
              >
                {ELEMENTS.map((el) => (
                  <option key={el} value={el}>
                    {String(ELEMENT_NAMES[el] || el).toLowerCase()}
                  </option>
                ))}
              </select>
              {entryIndex > 0 ? (
                <button
                  onClick={() => {
                    const nextEntries = atomEntries.filter(
                      (_, idx) => idx !== entryIndex,
                    );
                    commitAtomEntries(nextEntries);
                  }}
                  disabled={automationBuilderRunning}
                  className={`${ui.btnLight} reactor-automation-builder-atom-entry-remove`}
                  title="Remove this AND atom target."
                >
                  -
                </button>
              ) : null}
            </div>
          ))}
          <div className="reactor-row-gap-8-wrap">
            <button
              onClick={() =>
                commitAtomEntries([
                  ...atomEntries,
                  createAutomationBuilderAtomEntry(atomOperation),
                ])
              }
              disabled={automationBuilderRunning}
              className={ui.btnLight}
              title="Add another atom target to this same action."
            >
              And
            </button>
          </div>
        </div>
      );
    }
    const waitDurationValue = Math.max(
      1,
      Math.floor(Number(rowAction.durationSec) || 5),
    );
    return (
      <div className="reactor-automation-builder-line">
        <span className="reactor-text-10-muted">wait</span>
        <select
          value={waitDurationValue}
          onChange={(e) =>
            updateAutomationBuilderAction(rowAction.id, {
              durationSec: parseInt(e.target.value, 10),
            })
          }
          disabled={automationBuilderRunning}
          className={ui.select}
        >
          {AUTOMATION_DURATION_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}
            </option>
          ))}
        </select>
        <span className="reactor-text-10-muted">
          {waitDurationValue === 1 ? "second" : "seconds"}
        </span>
      </div>
    );
  };
  const collectAutomationBuilderDescendantStepCodes = (node, stepCode) => {
    const whileChildren = Array.isArray(node?.whileActions) ? node.whileActions : [];
    const thenChildren = Array.isArray(node?.thenActions) ? node.thenActions : [];
    const descendants = [];
    whileChildren.forEach((child, childIndex) => {
      const childCode = `${stepCode}.${getAutomationAlphabetSegment(childIndex)}`;
      descendants.push(childCode);
      descendants.push(
        ...collectAutomationBuilderDescendantStepCodes(child, childCode),
      );
    });
    thenChildren.forEach((child, childIndex) => {
      const childCode = `${stepCode}.${childIndex + 1}`;
      descendants.push(childCode);
      descendants.push(
        ...collectAutomationBuilderDescendantStepCodes(child, childCode),
      );
    });
    return descendants;
  };
  const renderAutomationBuilderNode = (rowAction, stepCode, branchKind = "root") => {
    const whileChildren = Array.isArray(rowAction?.whileActions)
      ? rowAction.whileActions
      : [];
    const isActive =
      automationBuilderRunning &&
      automationBuilderActiveActionIds.includes(rowAction.id);
    return (
      <div className={`reactor-automation-builder-node is-${branchKind}`}>
        <div
          className="reactor-automation-builder-action"
          data-active={isActive ? "true" : "false"}
          data-branch={branchKind}
        >
          <div className="reactor-automation-builder-index">{stepCode}</div>
          <div className="reactor-automation-builder-step">
            <div className="reactor-automation-builder-fields">
              {renderAutomationBuilderActionFields(rowAction)}
            </div>
            <div className="reactor-row-gap-8-wrap reactor-automation-builder-node-controls">
              <button
                onClick={() => {
                  setAutomationBuilderThenPickerForId(null);
                  setAutomationBuilderWhilePickerForId((current) =>
                    current === rowAction.id ? null : rowAction.id,
                  );
                }}
                disabled={automationBuilderRunning}
                className={ui.btnLight}
                title="Add a concurrent action in this step."
              >
                +While
              </button>
              <button
                onClick={() => {
                  setAutomationBuilderWhilePickerForId(null);
                  setAutomationBuilderThenPickerForId((current) =>
                    current === rowAction.id ? null : rowAction.id,
                  );
                }}
                disabled={automationBuilderRunning}
                className={ui.btnLight}
                title="Add a next step after this step completes."
              >
                +Then
              </button>
              <button
                onClick={() => {
                  const descendantCodes = collectAutomationBuilderDescendantStepCodes(
                    rowAction,
                    stepCode,
                  );
                  if (descendantCodes.length > 0) {
                    const shouldRemove = window.confirm(
                      `Removing step ${stepCode} will also remove: ${descendantCodes.join(", ")}. Continue?`,
                    );
                    if (!shouldRemove) return;
                  }
                  removeAutomationBuilderAction(rowAction.id);
                  setAutomationBuilderWhilePickerForId((current) =>
                    current === rowAction.id ? null : current,
                  );
                  setAutomationBuilderThenPickerForId((current) =>
                    current === rowAction.id ? null : current,
                  );
                }}
                disabled={automationBuilderRunning}
                className={`${ui.btnLight} reactor-automation-builder-remove-btn`}
                title={
                  branchKind === "root" ? "Remove this step." : "Remove this action."
                }
              >
                -
              </button>
            </div>
            {automationBuilderWhilePickerForId === rowAction.id ? (
              <div className="reactor-automation-builder-while-picker">
                <span className="reactor-text-10-muted">Add concurrent:</span>
                <select
                  value={automationBuilderWhileAddKind}
                  onChange={(e) => setAutomationBuilderWhileAddKind(e.target.value)}
                  disabled={automationBuilderRunning}
                  className={ui.select}
                >
                  {automationKindOptions}
                </select>
                <button
                  onClick={() => {
                    addAutomationBuilderWhileAction(
                      rowAction.id,
                      automationBuilderWhileAddKind,
                    );
                    setAutomationBuilderWhilePickerForId(null);
                  }}
                  disabled={automationBuilderRunning}
                  className={ui.btnLight}
                  title="Add concurrent action."
                >
                  Add
                </button>
              </div>
            ) : null}
            {automationBuilderThenPickerForId === rowAction.id ? (
              <div className="reactor-automation-builder-then-picker">
                <span className="reactor-text-10-muted">Add next step:</span>
                <select
                  value={automationBuilderThenAddKind}
                  onChange={(e) => setAutomationBuilderThenAddKind(e.target.value)}
                  disabled={automationBuilderRunning}
                  className={ui.select}
                >
                  {automationKindOptions}
                </select>
                <button
                  onClick={() => {
                    addAutomationBuilderThenAction(
                      rowAction.id,
                      automationBuilderThenAddKind,
                    );
                    setAutomationBuilderThenPickerForId(null);
                  }}
                  disabled={automationBuilderRunning}
                  className={ui.btnLight}
                  title="Insert next step."
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {whileChildren.length > 0 ? (
          <div className="reactor-automation-builder-children reactor-automation-builder-children-while">
            {whileChildren.map((child, childIndex) => (
              <div
                key={child.id}
                className={`reactor-automation-builder-branch${
                  child?.incomingEdge === "then" ? " is-then" : ""
                }`}
              >
                <div
                  className={`reactor-automation-builder-branch-label${
                    child?.incomingEdge === "then" ? " is-then" : ""
                  }`}
                >
                  {child?.incomingEdge === "then" ? "Then" : "While"}
                </div>
                {renderAutomationBuilderNode(
                  child,
                  `${stepCode}.${getAutomationAlphabetSegment(childIndex)}`,
                  child?.incomingEdge === "then" ? "then" : "while",
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };
  const automationBuilderActiveStepLabel =
    automationBuilderActiveStepCodes.length > 0
      ? automationBuilderActiveStepCodes.join(", ")
      : `${Math.max(1, automationBuilderActiveIndex + 1)}`;

  return (
    <section className="page">
      <header style={{ marginBottom: 16 }}>
        <h1>Reactor</h1>
        <p className="lede">
          Toy chemistry sandbox: drop atoms, change conditions like temperature
          and volume, and watch matter change. Try to synthesize molecules that
          are in the catalogue. Not necessarily the most scientifically
          accurate, but close enough for fun and educational molecular play.
        </p>
      </header>
      <div className={ui.topBadgeRow}>
        <DesktopBadge />
        <div style={{ minWidth: 0 }}>
          {worldCatalogueBadgeVisible ? (
            <div className={ui.worldUpdateBadge}>World catalogue updated</div>
          ) : null}
        </div>
      </div>

      <div ref={canvasCardRef} className={ui.canvasCard}>
        {/* Automation: top-left */}
        {controlsOpen ? (
          <AutomationBuilderPanel
            ui={ui}
            setControlsOpen={setControlsOpen}
            automationBuilderRunning={automationBuilderRunning}
            automationBuilderActiveStepLabel={automationBuilderActiveStepLabel}
            automationBuilderRemainingMs={automationBuilderRemainingMs}
            automationBuilderStatus={automationBuilderStatus}
            stopAutomationBuilder={stopAutomationBuilder}
            startAutomationBuilder={startAutomationBuilder}
            automationBuilderActions={automationBuilderActions}
            automationBuilderAddKind={automationBuilderAddKind}
            setAutomationBuilderAddKind={setAutomationBuilderAddKind}
            automationKindOptions={automationKindOptions}
            addAutomationBuilderAction={addAutomationBuilderAction}
            renderAutomationBuilderNode={renderAutomationBuilderNode}
            automationBuilderRepeatCycle={automationBuilderRepeatCycle}
            setAutomationBuilderRepeatCycle={setAutomationBuilderRepeatCycle}
            clearAutomationBuilder={clearAutomationBuilder}
          />
        ) : (
          <div className={ui.floatingShow}>
            <div className="reactor-automation-quick-control">
              <button
                onClick={() =>
                  automationBuilderRunning
                    ? stopAutomationBuilder("stopped")
                    : startAutomationBuilder()
                }
                className={`${
                  automationBuilderRunning ? ui.btnDark : ui.btnLight
                } reactor-automation-quick-run-btn`}
                title={
                  automationBuilderRunning
                    ? "Stop the current automation builder run."
                    : "Run the current automation builder flow."
                }
              >
                {automationBuilderRunning ? "Stop automation" : "Run automation"}
              </button>
              <button
                onClick={() => setControlsOpen(true)}
                className={`${
                  automationBuilderRunning ? ui.btnLight : ui.btnDark
                } reactor-automation-quick-edit-btn`}
                data-tone={automationBuilderRunning ? "light" : "dark"}
                title={
                  automationBuilderRunning
                    ? "View automation builder."
                    : "Open automation builder editor."
                }
              >
                {automationBuilderRunning ? "View" : "Edit"}
              </button>
            </div>
            <div className="reactor-temp-bath-controls">
              <div className="reactor-temp-bath-header">
                <div className="reactor-temp-bath-title">Temperature control</div>
              </div>
              <div className="reactor-temp-bath-cluster" role="group" aria-label="Temperature bath controls">
                <button
                  type="button"
                  className="reactor-temp-bath-pulse-btn"
                  data-tone="cool"
                  data-active={tempBathPulse === TEMP_BATH_PULSE.COOL ? "true" : "false"}
                  title="Pulse cool"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setTempBathPulse(TEMP_BATH_PULSE.COOL);
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={() => setTempBathPulse(null)}
                  onPointerCancel={() => setTempBathPulse(null)}
                  onLostPointerCapture={() => setTempBathPulse(null)}
                  onBlur={() => setTempBathPulse(null)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="reactor-temp-bath-pulse-dot" aria-hidden="true" />
                </button>

                <div className="reactor-temp-bath-row">
                  {[
                    {
                      id: TEMP_BATH_MODE.FAST_COOL,
                      tone: "cool",
                      label: "Cool quickly",
                      icon: tempBathLeftIcon,
                    },
                    {
                      id: TEMP_BATH_MODE.SLOW_COOL,
                      tone: "cool",
                      label: "Cool slowly",
                      icon: tempBathLeftIcon,
                    },
                    {
                      id: TEMP_BATH_MODE.OFF,
                      tone: "off",
                      label: "Bath off",
                    },
                    {
                      id: TEMP_BATH_MODE.SLOW_HEAT,
                      tone: "heat",
                      label: "Heat slowly",
                      icon: tempBathRightIcon,
                    },
                    {
                      id: TEMP_BATH_MODE.FAST_HEAT,
                      tone: "heat",
                      label: "Heat quickly",
                      icon: tempBathRightIcon,
                    },
                  ].map((item) => {
                    const active =
                      effectiveTempBathMode === item.id ||
                      (effectiveTempBathMode === TEMP_BATH_MODE.FAST_COOL &&
                        item.id === TEMP_BATH_MODE.SLOW_COOL) ||
                      (effectiveTempBathMode === TEMP_BATH_MODE.FAST_HEAT &&
                        item.id === TEMP_BATH_MODE.SLOW_HEAT);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="reactor-temp-bath-btn"
                        data-active={active ? "true" : "false"}
                        data-tone={item.tone}
                        aria-pressed={active}
                        title={item.label}
                        onClick={() => setTempBathMode(item.id)}
                      >
                        {item.id === TEMP_BATH_MODE.OFF ? (
                          <>
                            <span className="reactor-temp-bath-dot" aria-hidden="true" />
                            {tempBathCenterLabel ? (
                              <span
                                className="reactor-temp-bath-off-symbol"
                                data-tone={
                                  tempBathCenterLabel === "MIN"
                                    ? "cool"
                                    : tempBathCenterLabel === "MAX"
                                      ? "heat"
                                      : "off"
                                }
                                aria-hidden="true"
                              >
                                {tempBathCenterLabel}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span
                            className="reactor-temp-bath-icon"
                            aria-hidden="true"
                            style={{
                              "--temp-bath-icon-url": `url("${item.icon.src}")`,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="reactor-temp-bath-pulse-btn"
                  data-tone="heat"
                  data-active={tempBathPulse === TEMP_BATH_PULSE.HEAT ? "true" : "false"}
                  title="Pulse heat"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setTempBathPulse(TEMP_BATH_PULSE.HEAT);
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={() => setTempBathPulse(null)}
                  onPointerCancel={() => setTempBathPulse(null)}
                  onLostPointerCapture={() => setTempBathPulse(null)}
                  onBlur={() => setTempBathPulse(null)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="reactor-temp-bath-pulse-dot" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="reactor-temp-bath-controls">
              <div className="reactor-temp-bath-header">
                <div className="reactor-temp-bath-title">Volume control</div>
              </div>
              <div className="reactor-temp-bath-cluster" role="group" aria-label="Volume controls">
                <button
                  type="button"
                  className="reactor-temp-bath-pulse-btn"
                  data-tone="cool"
                  data-active={
                    pressureBathPulse === PRESSURE_BATH_PULSE.CONTRACT
                      ? "true"
                      : "false"
                  }
                  title="Pulse contract"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPressureBathPulse(PRESSURE_BATH_PULSE.CONTRACT);
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={() => setPressureBathPulse(null)}
                  onPointerCancel={() => setPressureBathPulse(null)}
                  onLostPointerCapture={() => setPressureBathPulse(null)}
                  onBlur={() => setPressureBathPulse(null)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="reactor-temp-bath-pulse-dot" aria-hidden="true" />
                </button>

                <div className="reactor-temp-bath-row">
                  {[
                    {
                      id: PRESSURE_BATH_MODE.FAST_CONTRACT,
                      tone: "cool",
                      label: "Contract quickly",
                      icon: tempBathLeftIcon,
                    },
                    {
                      id: PRESSURE_BATH_MODE.SLOW_CONTRACT,
                      tone: "cool",
                      label: "Contract slowly",
                      icon: tempBathLeftIcon,
                    },
                    {
                      id: PRESSURE_BATH_MODE.OFF,
                      tone: "off",
                      label: "Volume control off",
                    },
                    {
                      id: PRESSURE_BATH_MODE.SLOW_EXPAND,
                      tone: "heat",
                      label: "Expand slowly",
                      icon: tempBathRightIcon,
                    },
                    {
                      id: PRESSURE_BATH_MODE.FAST_EXPAND,
                      tone: "heat",
                      label: "Expand quickly",
                      icon: tempBathRightIcon,
                    },
                  ].map((item) => {
                    const active =
                      effectivePressureBathMode === item.id ||
                      (effectivePressureBathMode ===
                        PRESSURE_BATH_MODE.FAST_CONTRACT &&
                        item.id === PRESSURE_BATH_MODE.SLOW_CONTRACT) ||
                      (effectivePressureBathMode ===
                        PRESSURE_BATH_MODE.FAST_EXPAND &&
                        item.id === PRESSURE_BATH_MODE.SLOW_EXPAND);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="reactor-temp-bath-btn"
                        data-active={active ? "true" : "false"}
                        data-tone={item.tone}
                        aria-pressed={active}
                        title={item.label}
                        onClick={() => setPressureBathMode(item.id)}
                      >
                        {item.id === PRESSURE_BATH_MODE.OFF ? (
                          <>
                            <span className="reactor-temp-bath-dot" aria-hidden="true" />
                            {pressureBathCenterLabel ? (
                              <span
                                className="reactor-temp-bath-off-symbol"
                                data-tone={
                                  pressureBathCenterLabel === "MIN"
                                    ? "cool"
                                    : pressureBathCenterLabel === "MAX"
                                      ? "heat"
                                      : "off"
                                }
                                aria-hidden="true"
                              >
                                {pressureBathCenterLabel}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span
                            className="reactor-temp-bath-icon"
                            aria-hidden="true"
                            style={{
                              "--temp-bath-icon-url": `url("${item.icon.src}")`,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="reactor-temp-bath-pulse-btn"
                  data-tone="heat"
                  data-active={
                    pressureBathPulse === PRESSURE_BATH_PULSE.EXPAND
                      ? "true"
                      : "false"
                  }
                  title="Pulse expand"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPressureBathPulse(PRESSURE_BATH_PULSE.EXPAND);
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={() => setPressureBathPulse(null)}
                  onPointerCancel={() => setPressureBathPulse(null)}
                  onLostPointerCapture={() => setPressureBathPulse(null)}
                  onBlur={() => setPressureBathPulse(null)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="reactor-temp-bath-pulse-dot" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode: top-right */}
        {modeOpen ? (
          <div
            id="instructions-overlay"
            className={ui.instructions}
            style={{
              maxHeight: catalogueOpen
                ? "calc(100% - 390px)"
                : "calc(100% - 74px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <div className={ui.headerRow}>
              <button
                onClick={() => setModeOpen(false)}
                className={ui.titleBtn}
                title="Close mode panel."
              >
                Mode
              </button>
              <button onClick={() => setModeOpen(false)} className={ui.btnLight}>
                Hide
              </button>
            </div>

            <div className={ui.hintTitle}>{instructionText.title}</div>
            <div className={`${ui.hintText} reactor-mt-4`}>
              {instructionText.lines.map((s, i) => (
                <div key={i}>{s}</div>
              ))}
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(15,23,42,0.12)",
                paddingTop: 10,
                marginTop: 10,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <button
                  className={ui.pillBtn(tool === TOOL.PLACE)}
                  onClick={() => setTool(TOOL.PLACE)}
                >
                  Place
                </button>
                <button
                  className={ui.pillBtn(tool === TOOL.DELETE, "danger")}
                  onClick={() => setTool(TOOL.DELETE)}
                >
                  Delete
                </button>
                <button
                  className={ui.pillBtn(tool === TOOL.ROTATE)}
                  onClick={() => setTool(TOOL.ROTATE)}
                >
                  View
                </button>
                <button
                  className={ui.pillBtn(tool === TOOL.SAVE)}
                  onClick={() => setTool(TOOL.SAVE)}
                >
                  Save
                </button>
              </div>

              {tool === TOOL.PLACE ? (
                <>
                  <div className={ui.row}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                      title="Element used for click placement and default spawn actions."
                    >
                      Place element
                    </span>
                    <select
                      value={placeElement}
                      onChange={(e) => setPlaceElement(e.target.value)}
                        className={ui.select}
                      title="Select the atom type to place."
                    >
                      {ELEMENTS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="reactor-grid-minmax-auto">
                    <div className="reactor-row-gap-8 reactor-min-w-0">
                      <span
                        className="reactor-text-12-strong"
                        title="Spawn the selected element into the reactor."
                      >
                        {placeElementLabel}
                      </span>
                      <span className="reactor-text-12-strong">x</span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_ATOMS}
                        step={1}
                        value={spawnElementCount}
                        onChange={(e) =>
                          setSpawnElementCount(
                            clamp(
                              Math.floor(Number(e.target.value) || 0),
                              0,
                              MAX_ATOMS,
                            ),
                          )
                        }
                        className={ui.select}
                        style={{
                          width: 62,
                          padding: "7px 8px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                        title="How many selected atoms to spawn."
                      />
                    </div>
                    <button
                      onClick={() => spawnAtoms(spawnElementCount)}
                      className={ui.btnLight}
                      disabled={spawnElementCount <= 0}
                      title="Spawn selected-element atoms."
                    >
                      Spawn
                    </button>
                  </div>

                </>
              ) : null}

              {tool === TOOL.DELETE ? (
                <div className="reactor-grid-gap-8-center">
                  <button onClick={clearAll} className={ui.btnLight}>
                    Clear all atoms
                  </button>
                </div>
              ) : null}

              {tool === TOOL.ROTATE ? (
                <div className="reactor-grid-gap-8-center">
                  <label className={ui.row}>
                    <span className="reactor-text-12-strong">
                      View Box Edges
                    </span>
                    <input
                      type="checkbox"
                      checked={showBoxEdges}
                      onChange={(e) => setShowBoxEdges(e.target.checked)}
                    />
                  </label>
                  <label className={ui.row}>
                    <span className="reactor-text-12-strong">
                      Visualize Bonds
                    </span>
                    <input
                      type="checkbox"
                      checked={showBonds}
                      onChange={(e) => setShowBonds(e.target.checked)}
                    />
                  </label>
                  <label className={ui.row}>
                    <span className="reactor-text-12-strong">
                      View Periodic Repeats
                    </span>
                    <input
                      type="checkbox"
                      checked={showPeriodicRepeats}
                      onChange={(e) => setShowPeriodicRepeats(e.target.checked)}
                    />
                  </label>
                </div>
              ) : null}

              {tool === TOOL.SAVE ? (
                <>
                  <input
                    ref={catalogueImportFileRef}
                    type="file"
                    accept=".json,application/json"
                    className="reactor-hidden-input"
                    onChange={importEncryptedCatalogue}
                  />
                  <div className="reactor-grid-gap-8-center">
                    <button
                      onClick={exportEncryptedCatalogue}
                      disabled={catalogueSaveBusy}
                      className={ui.btnLight}
                    >
                      Export Save JSON
                    </button>
                    <button
                      onClick={triggerCatalogueImportPicker}
                      disabled={catalogueSaveBusy}
                      className={ui.btnLight}
                    >
                      Import Save JSON
                    </button>
                    <button
                      onClick={resetCatalogueProgress}
                      disabled={catalogueSaveBusy}
                      className={ui.btnLight}
                    >
                      Reset Catalogue (Delete Local Save)
                    </button>
                  </div>
                  <div className="reactor-text-10-muted">
                    {catalogueSaveStatus ||
                      "Tip: store exported files somewhere safe so you can restore on another browser/device."}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            id="instructions-show"
            className={ui.instructionsShow}
            style={{ display: "grid", justifyItems: "end" }}
          >
            <button onClick={() => setModeOpen(true)} className={ui.btnLight}>
              Show mode
            </button>
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: 800,
                color: REACTOR_OVERLAY_LIGHT_TEXT,
                textAlign: "right",
                pointerEvents: "none",
              }}
            >
              {`Current mode: ${hiddenModeSummary}`}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 10,
                fontWeight: 700,
                color: REACTOR_OVERLAY_LIGHT_TEXT,
                textAlign: "right",
                lineHeight: 1.35,
                pointerEvents: "none",
                opacity: 0.94,
              }}
            >
              {hiddenModeMouseLines.map((line, idx) => (
                <div key={`hidden-mode-line-${idx}`}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {tutorialOpen ? (
          <div
            id="tutorial-overlay"
            className={`${ui.tutorial} reactor-cursor-pointer`}
            onClick={() => setTutorialOpen(false)}
          >
            <div className={ui.headerRow}>
              <div className={ui.title}>Tutorial</div>
              <button
                onClick={() => setTutorialOpen(false)}
                className={ui.btnLight}
              >
                Hide
              </button>
            </div>
            <div className={`${ui.hintText} reactor-grid-gap-4`}>
              <div>Put atoms in reactor. Mix. See what you made.</div>
              <div>
                1. Put atoms in reactor. Click inside reactor to place (Mode
                menu: Place).
              </div>
              <div>
                2. Mix; Change temperature and volume. Higher temperature
                means faster molecules. Lower volume means more collisions.
              </div>
              <div>
                3. See what you made (Catalogue menu). Molecules made in the
                reactor will automatically be added to your catalogue.
              </div>
              <div>
                4. Use automation to do everything for you. Set it and forget
                it.
              </div>
            </div>
            {!hasEverLocalSave && !starterSeedUsed ? (
              <div className="reactor-mt-10 reactor-grid-center">
                <button onClick={onTutorialGetStarted} className={ui.btnDark}>
                  Get Started:
                  <br />
                  Spawn 4 oxygens and 8 hydrogens
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div id="tutorial-show" className={ui.tutorialShow}>
            <button onClick={() => setTutorialOpen(true)} className={ui.btnLight}>
              Show Tutorial
            </button>
          </div>
        )}

        {/* Rectangle canvas: set explicit height */}
        {catalogueOpen ? (
          <div id="catalogue-overlay" className={ui.catalogue}>
            <div className={ui.headerRow}>
              <button
                onClick={() => setCatalogueOpen(false)}
                className={ui.titleBtn}
                title="Close Molecule Catalogue panel."
              >
                Molecule Catalogue
              </button>
              <div className="reactor-row-gap-8">
                <button
                  onClick={() => setCatalogueOpen(false)}
                  className={ui.btnLight}
                >
                  Hide
                </button>
              </div>
            </div>

            <div className="reactor-text-11-slate">
              {collectedIds.length}/{MOLECULE_CATALOG.length} catalogued (
              {collectionCompletionPct}%)
            </div>

            <div className="reactor-row-gap-6-wrap reactor-mt-8">
              <button
                onClick={() => setCollectionFilter("all")}
                className={ui.pillBtn(collectionFilter === "all")}
              >
                All
              </button>
              <button
                onClick={() => setCollectionFilter("live")}
                className={ui.pillBtn(collectionFilter === "live")}
              >
                Live
              </button>
              <button
                onClick={() => setCollectionFilter("collected")}
                className={ui.pillBtn(collectionFilter === "collected")}
              >
                Catalogued
              </button>
              <button
                onClick={() => setCollectionFilter("todo")}
                className={ui.pillBtn(collectionFilter === "todo")}
              >
                To-do
              </button>
            </div>

            <div className="reactor-row-gap-8 reactor-mt-8">
              <input
                value={collectionQuery}
                onChange={(e) => setCollectionQuery(e.target.value)}
                placeholder="Search id/name/formula"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.16)",
                  background: "rgba(255,255,255,0.94)",
                  color: "#0f172a",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
              <button
                onClick={() => setCollectionQuery("")}
                disabled={collectionQuery.length <= 0}
                className={ui.btnLight}
              >
                Clear
              </button>
            </div>

            <div className={`${ui.row} reactor-mt-8`}>
              <div className="reactor-text-11-slate">
                {visibleCollection.length}/{sortedCollection.length} shown
              </div>
              <div className="reactor-text-11-slate">
                Page {activeCollectionPage}/{collectionPageCount}
              </div>
            </div>

            <div className="reactor-row-gap-8 reactor-mt-8">
              <button
                className={ui.btnLight}
                onClick={() => setCollectionPage((p) => Math.max(1, p - 1))}
                disabled={activeCollectionPage <= 1}
              >
                Prev
              </button>
              <button
                className={ui.btnLight}
                onClick={() =>
                  setCollectionPage((p) => Math.min(collectionPageCount, p + 1))
                }
                disabled={activeCollectionPage >= collectionPageCount}
              >
                Next
              </button>
            </div>

            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                overflowX: "auto",
                border: "1px solid rgba(15,23,42,0.14)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.8)",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: CATALOGUE_GRID_COLUMNS,
                  width: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                  minWidth: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 8px",
                  borderBottom: "1px solid rgba(15,23,42,0.16)",
                  position: "sticky",
                  top: 0,
                  background: "rgba(241,245,249,0.97)",
                  zIndex: 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("number")}
                  className="reactor-sort-button"
                  title="Sort by catalogue number"
                >
                  <span>No.</span>
                  {sortArrowsFor("number")}
                </button>
                <span
                  style={{ fontSize: 10, fontWeight: 900, color: "#334155" }}
                >
                  Snapshot
                </span>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("name")}
                  className="reactor-sort-button"
                  title="Sort by name"
                >
                  <span>Name/Formula</span>
                  {sortArrowsFor("name")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("weight")}
                  className="reactor-sort-button"
                  title="Sort by molecular weight"
                >
                  <span>Mol. wt.</span>
                  {sortArrowsFor("weight")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("firstCreated")}
                  className="reactor-sort-button"
                  title="Sort by first created"
                >
                  <span>First Created</span>
                  {sortArrowsFor("firstCreated")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("lastCreated")}
                  className="reactor-sort-button"
                  title="Sort by last created"
                >
                  <span>Last Created</span>
                  {sortArrowsFor("lastCreated")}
                </button>
              </div>

              {visibleCollection.map((entry) => {
                const isCollected = collectedSet.has(entry.id);
                const isLive = liveCollectedSet.has(entry.id);
                const isLiveBright = liveBrightSet.has(entry.id);
                const selectedIndex = selectedLiveIndexById.get(entry.id);
                const isSelectedLive = Number.isInteger(selectedIndex);
                const selectedPalette = isSelectedLive
                  ? getLiveSelectionPalette(selectedIndex)
                  : null;
                const localStats = localCatalogueStatsById[entry.id] || null;
                const worldStats = worldCatalogueStatsById[entry.id] || null;
                const localFirstCreatedAt = localStats?.firstCreatedAt || null;
                const localLastCreatedAt = localStats?.lastCreatedAt || null;
                const worldFirstCreatedAt = worldStats?.firstCreatedAt || null;
                const worldLastCreatedAt = worldStats?.lastCreatedAt || null;
                const isFirstDiscoverer =
                  localFirstCreatedAt != null &&
                  worldFirstCreatedAt != null &&
                  localFirstCreatedAt === worldFirstCreatedAt;
                const number = catalogueNumberFromId(entry.id);
                const molecularWeight = molecularWeightById.get(entry.id);
                return (
                  <div
                    key={entry.id}
                    id={`catalogue-entry-${entry.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: CATALOGUE_GRID_COLUMNS,
                      width: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                      minWidth: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                      gap: 8,
                      alignItems: "center",
                      padding: "6px 8px",
                      minHeight: 60,
                      borderBottom: "1px solid rgba(15,23,42,0.08)",
                      background: isSelectedLive
                        ? selectedPalette.rowBg
                        : isLiveBright
                          ? "rgba(251,191,36,0.32)"
                          : isLive
                            ? "rgba(250,204,21,0.08)"
                            : isCollected
                              ? "rgba(126, 255, 180, 0.12)"
                              : "rgba(0,0,0,0.02)",
                      boxShadow: isSelectedLive
                        ? `inset 0 0 0 1px ${selectedPalette.rowBorder}`
                        : isLiveBright
                          ? "inset 0 0 0 1px rgba(217,119,6,0.58)"
                          : isLive
                            ? "inset 0 0 0 1px rgba(217,119,6,0.18)"
                            : "none",
                    }}
                  >
                    <div className="reactor-catalogue-status-wrap">
                      <span className="reactor-catalogue-number">
                        {Number.isFinite(number) ? `#${number}` : entry.id}
                      </span>
                      {isLive ? (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            fontSize: 9,
                            fontWeight: 800,
                            color: isSelectedLive
                              ? selectedPalette.status
                              : "#166534",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelectedLive}
                            onChange={(e) =>
                              toggleLiveSelection(entry.id, e.target.checked)
                            }
                            title="Show in reactor"
                          />
                          Show
                        </label>
                      ) : null}
                    </div>
                    <MoleculeBallStickPreview
                      structure={entry.structure}
                      formula={entry.formula}
                      onExpand={() => {
                        setExpandedAngles({ x: 0, y: 0, z: 0 });
                        setExpandedZoom(1);
                        setExpandedSnapshot({
                          name: entry.name,
                          formula: entry.formula,
                          structure: entry.structure,
                        });
                      }}
                    />
                    <CatalogueNameCell
                      name={entry.name}
                      formula={entry.formula}
                    />
                    <span className="reactor-catalogue-weight">
                      {Number.isFinite(molecularWeight)
                        ? `${Math.round(molecularWeight)}`
                        : "--"}
                    </span>
                    <CreatedTimestampCell
                      meTimestamp={localFirstCreatedAt}
                      worldTimestamp={worldFirstCreatedAt}
                      meTitlePrefix="My first created"
                      worldTitlePrefix="World first created"
                      showMedal={isFirstDiscoverer}
                    />
                    <CreatedTimestampCell
                      meTimestamp={localLastCreatedAt}
                      worldTimestamp={worldLastCreatedAt}
                      meTitlePrefix="My last created"
                      worldTitlePrefix="World last created"
                    />
                  </div>
                );
              })}
              {Array.from({ length: cataloguePlaceholderRowCount }).map(
                (_, idx) => (
                  <div
                    key={`catalogue-placeholder-row-${idx}`}
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      gridTemplateColumns: CATALOGUE_GRID_COLUMNS,
                      width: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                      minWidth: `${CATALOGUE_TABLE_WIDTH_PX}px`,
                      gap: 8,
                      alignItems: "center",
                      padding: "6px 8px",
                      minHeight: 60,
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
                      background: "rgba(255,255,255,0.36)",
                    }}
                  />
                ),
              )}
            </div>
          </div>
        ) : (
          <div className={ui.catalogueShow}>
            <div
              style={{
                marginBottom: 6,
                fontSize: 11,
                color: REACTOR_OVERLAY_LIGHT_TEXT,
                fontWeight: 800,
                textAlign: "right",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: `${11 + 15 * catalogCountGlowFactor}px`,
                  fontWeight: 950,
                  lineHeight: 1,
                  transform: `scale(${catalogCountGlowScale})`,
                  transformOrigin: "right center",
                  color:
                    catalogCountGlowFactor > 0
                      ? `hsl(${45 - 8 * catalogCountGlowFactor} 96% ${78 - 28 * catalogCountGlowFactor}%)`
                      : REACTOR_OVERLAY_LIGHT_TEXT,
                  textShadow:
                    catalogCountGlowFactor > 0
                      ? `0 0 ${6 + 16 * catalogCountGlowFactor}px rgba(245,158,11,${0.22 + 0.48 * catalogCountGlowFactor})`
                      : "none",
                  transition:
                    "font-size 66ms linear, transform 66ms linear, color 66ms linear, text-shadow 66ms linear",
                  verticalAlign: "middle",
                }}
              >
                {collectedIds.length}
              </span>
              <span>{`/${MOLECULE_CATALOG.length} catalogued (${collectionCompletionPct}%)`}</span>
            </div>
            <div
              style={{
                marginBottom: 8,
                fontSize: 11,
                color: REACTOR_OVERLAY_LIGHT_TEXT,
                fontWeight: 800,
                textAlign: "right",
              }}
            >
              {`last catalogued: ${lastCataloguedLabel}`}
            </div>
            <button onClick={() => setCatalogueOpen(true)} className={ui.btnLight}>
              Show catalogue
            </button>
          </div>
        )}

        <div className={ui.thermoShow}>
          <div
            style={{
              marginBottom: 0,
              fontSize: 11,
              color: REACTOR_OVERLAY_LIGHT_TEXT,
              fontWeight: 800,
              textAlign: "right",
              lineHeight: 1.35,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <div>{`${liveThermoEntropyLabel} S`}</div>
            <div>{`${liveThermoEnthalpyLabel} H`}</div>
            <div>{`${liveThermoTotalEnergyLabel} E`}</div>
            <div>
              {`${liveThermoTemperatureLabel} `}
              <span style={{ color: REACTOR_PLOT_TEMP_COLOR }}>T</span>
            </div>
            <div>
              {`${liveThermoPressureLabel} `}
              <span style={{ color: REACTOR_PLOT_PRESSURE_COLOR }}>P</span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${thermoPlot.width} ${thermoPlot.height}`}
            preserveAspectRatio="none"
            style={{
              width: 168,
              height: 54,
              borderRadius: 8,
              border: "1px solid rgba(226,232,240,0.26)",
              background: "rgba(15,23,42,0.25)",
            }}
          >
            <line
              x1="0"
              x2={thermoPlot.width}
              y1="0"
              y2="0"
              stroke="rgba(226,232,240,0.14)"
              strokeWidth="1"
            />
            <line
              x1="0"
              x2={thermoPlot.width}
              y1={thermoPlot.height}
              y2={thermoPlot.height}
              stroke="rgba(226,232,240,0.22)"
              strokeWidth="1"
            />
            <line
              x1="0"
              x2="0"
              y1="0"
              y2={thermoPlot.height}
              stroke={REACTOR_PLOT_TEMP_COLOR}
              strokeWidth="1"
            />
            <line
              x1={thermoPlot.width}
              x2={thermoPlot.width}
              y1="0"
              y2={thermoPlot.height}
              stroke={REACTOR_PLOT_PRESSURE_COLOR}
              strokeWidth="1"
            />
            <text
              x="2"
              y="8"
              style={{
                fill: REACTOR_PLOT_TEMP_COLOR,
                fontSize: 7,
                fontWeight: 800,
              }}
            >
              {Math.round(Math.max(0, Number(thermoPlot.tempMax) || 0))}
            </text>
            <text
              x="2"
              y={thermoPlot.height - 2}
              style={{
                fill: REACTOR_PLOT_TEMP_COLOR,
                fontSize: 7,
                fontWeight: 800,
              }}
            >
              {Math.round(Math.max(0, Number(thermoPlot.tempMin) || 0))}
            </text>
            <text
              x={thermoPlot.width - 2}
              y="8"
              textAnchor="end"
              style={{
                fill: REACTOR_PLOT_PRESSURE_COLOR,
                fontSize: 7,
                fontWeight: 800,
              }}
            >
              {thermoPlot.pressureTopLabel}
            </text>
            <text
              x={thermoPlot.width - 2}
              y={thermoPlot.height - 2}
              textAnchor="end"
              style={{
                fill: REACTOR_PLOT_PRESSURE_COLOR,
                fontSize: 7,
                fontWeight: 800,
              }}
            >
              {thermoPlot.pressureBottomLabel}
            </text>
            {thermoPlot.tempPath ? (
              <path
                d={thermoPlot.tempPath}
                fill="none"
                stroke={REACTOR_PLOT_TEMP_COLOR}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {Number.isFinite(thermoPlot.tempLastY) ? (
              <circle
                cx={thermoPlot.lastX}
                cy={thermoPlot.tempLastY}
                r="1.9"
                fill={REACTOR_PLOT_TEMP_COLOR}
              />
            ) : null}
            {thermoPlot.pressurePath ? (
              <path
                d={thermoPlot.pressurePath}
                fill="none"
                stroke={REACTOR_PLOT_PRESSURE_COLOR}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {Number.isFinite(thermoPlot.pressureLastY) ? (
              <circle
                cx={thermoPlot.lastX}
                cy={thermoPlot.pressureLastY}
                r="1.9"
                fill={REACTOR_PLOT_PRESSURE_COLOR}
              />
            ) : null}
          </svg>
        </div>
        <div className={ui.atomCountsShow}>
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              color: REACTOR_OVERLAY_LIGHT_TEXT,
              fontWeight: 800,
              textAlign: "left",
              lineHeight: 1.35,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {presentElementRows.map((row) => {
              const deltaMarker = elementCountDeltaByElement[row.el] || "";
              return (
                <div
                  key={`present-el-${row.el}`}
                  style={{ display: "grid", gridTemplateColumns: "auto auto", gap: 6 }}
                >
                  <span>{`${row.count} ${row.el}`}</span>
                  <span style={{ fontWeight: 900, minWidth: 8 }}>{deltaMarker}</span>
                </div>
              );
            })}
            <div>--</div>
            <div style={{ fontWeight: 900 }}>{liveElementTotal}</div>
          </div>
        </div>

        <div id="live-molecules-overlay" className={ui.liveHud}>
          <div className={ui.liveHudControls}>
            <button
              onClick={shake}
              className={`${ui.btnLight} reactor-ui-btn-inline`}
              title="Apply a random nudge to all atoms."
            >
              Shake
            </button>
            <button
              onClick={resetAllControls}
              className={`${ui.btnLight} reactor-ui-btn-inline`}
              title="Restore reactor/control defaults."
            >
              Reset controls
            </button>
            <button
              onClick={resetView}
              className={`${ui.btnLight} reactor-ui-btn-inline`}
            >
              Reset view
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className={`${ui.btnDark} reactor-ui-btn-inline`}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
          <div className={ui.liveHudBar}>
            <span className="reactor-text-11-slate" style={{ fontWeight: 900 }}>
              Current species:{" "}
            </span>
            {liveMoleculeSummary.length > 0
              ? liveMoleculeSummary.map((row, idx, arr) => {
                  const matchedId = row.matchedId;
                  const hit = matchedId ? catalogById.get(matchedId) : null;
                  const formula = hit?.formula || row.formula;
                  const selectedIndex = matchedId
                    ? selectedLiveIndexById.get(matchedId)
                    : undefined;
                  const formulaColor = Number.isInteger(selectedIndex)
                    ? getLiveSelectionPalette(selectedIndex).status
                    : matchedId && liveBrightSet.has(matchedId)
                      ? "#f59e0b"
                      : matchedId
                        ? "#a16207"
                        : "#475569";
                  return (
                    <React.Fragment key={`${row.fingerprint}-${idx}`}>
                      <span
                        style={{
                          color: formulaColor,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formulaWithSubscripts(formula)}
                        {row.count > 1 ? ` x${row.count}` : ""}
                      </span>
                      {idx < arr.length - 1 ? ", " : null}
                    </React.Fragment>
                  );
                })
              : "none"}
          </div>
        </div>

        {expandedSnapshot ? (
          <div
            onClick={() => setExpandedSnapshot(null)}
            className="reactor-expanded-overlay"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="reactor-expanded-panel"
            >
              <div className={`${ui.row} reactor-mb-8`}>
                <div className="reactor-text-12-strong">
                  {expandedSnapshot.name}
                  {" ("}
                  {formulaWithSubscripts(expandedSnapshot.formula)}
                  {")"}
                </div>
                <button
                  onClick={() => setExpandedSnapshot(null)}
                  className={ui.btnLight}
                >
                  Close
                </button>
              </div>
              <div className="reactor-expanded-body">
                <div className="reactor-expanded-canvas-host">
                  <div
                    className="reactor-expanded-canvas-frame"
                    onPointerDown={onExpandedSnapshotPointerDown}
                    onPointerMove={onExpandedSnapshotPointerMove}
                    onPointerUp={onExpandedSnapshotPointerUp}
                    onPointerCancel={onExpandedSnapshotPointerUp}
                    onWheelCapture={onExpandedSnapshotWheel}
                    onWheel={onExpandedSnapshotWheel}
                  >
                    <div className="reactor-expanded-canvas">
                      <MoleculeRotatingPreview
                        structure={expandedSnapshot.structure}
                        formula={expandedSnapshot.formula}
                        width="100%"
                        height="100%"
                        xDeg={expandedAngles.x}
                        yDeg={expandedAngles.y}
                        zDeg={expandedAngles.z}
                        zoom={expandedZoom}
                      />
                    </div>
                    <div className="reactor-expanded-hints">
                      <div>Click + drag: rotate</div>
                      <div>Scroll: zoom</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {hoverLiveTooltip ? (
          <div
            style={{
              position: "absolute",
              left: hoverLiveTooltip.x,
              top: hoverLiveTooltip.y,
              transform: "translate(0, -100%)",
              background: "rgba(15,23,42,0.92)",
              color: "#fef3c7",
              border: "1px solid rgba(250,204,21,0.55)",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 800,
              pointerEvents: "none",
              zIndex: 70,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 18px rgba(15,23,42,0.28)",
            }}
          >
            {hoverLiveTooltip.label}
          </div>
        ) : null}

        {discoveryCallouts.map((item) => (
          <div
            key={item.key}
            style={{
              position: "absolute",
              left: item.x,
              top: item.y,
              transform: "translate(-50%, -100%)",
              opacity: item.opacity,
              pointerEvents: "none",
              zIndex: 75,
              maxWidth: 280,
              borderRadius: 10,
              border: "1px solid rgba(250,204,21,0.66)",
              background: "rgba(15,23,42,0.9)",
              color: "#f8fafc",
              boxShadow: "0 12px 26px rgba(15,23,42,0.34)",
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: "#fde68a" }}>
              {`Made ${item.name}! (${item.progressCount ?? "?"}/${item.progressTotal ?? MOLECULE_CATALOG.length})`}
            </div>
          </div>
        ))}

        <div
          ref={mountRef}
          style={{
            position: "relative",
            zIndex: 60,
            width: "100%",
            height: "min(660px, 72vh)", // smaller vertically so you can see everything
            minHeight: 320,
          }}
        />
      </div>
    </section>
  );
}

function normalizeAngleDeg(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function makeBondKey(aId, bId) {
  return aId <= bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

function getLiveSelectionPalette(index) {
  const list = LIVE_SELECTION_PALETTE;
  if (!Number.isFinite(index) || list.length <= 0) return list[0];
  return list[Math.max(0, Math.floor(index)) % list.length];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}


