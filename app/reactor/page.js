// app/reactor/page.js
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import DesktopBadge from "../../components/DesktopBadge";

import {
  DEFAULT_ELEMENTS_3D,
  DEFAULT_LJ,
  addAtom3D,
  clearSim3D,
  createSim3D,
  ljPotential,
  mixLorentzBerthelot,
  nudgeAll,
  removeAtom3D,
  setGrab,
  setGrabTarget,
  stepSim3D,
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
const REACTOR_OVERLAY_LIGHT_TEXT = "#e2e8f0";
const REACTOR_PLOT_TEMP_COLOR = "#ff4fd8";
const REACTOR_PLOT_PRESSURE_COLOR = "#2de2e6";
const MIN_CATALOGUE_VISIBLE_ROWS = 3;
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

const CONTROL_PROTOCOLS = Object.freeze([
  {
    id: "trap-cycle",
    name: "Trap breaker",
    label: "Trap breaker: compress, mix, then step-expand",
    description:
      "Repeated pressure pulses to force collisions, then controlled expansion to preserve useful bonds.",
  },
  {
    id: "scaffold-then-cap",
    name: "Scaffold then cap",
    label: "Scaffold then cap: heavy framework then hydrogenation",
    description:
      "Build heavy-atom skeletons first, then cap open valences in a cooler consolidation stage.",
  },
  {
    id: "gentle-anneal",
    name: "Gentle anneal",
    label: "Gentle anneal: slow cool and settle",
    description:
      "A low-shock stabilization sweep that gradually cools and strengthens existing structures.",
  },
]);

const CONTROL_PROTOCOL_DURATION_MS = Object.freeze({
  "trap-cycle": 32_000,
  "scaffold-then-cap": 42_000,
  "gentle-anneal": 36_000,
});

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

function formatFeedAtomBreakdown(counts = {}) {
  const parts = ELEMENTS.map((el) => ({
    el,
    count: Math.max(0, Math.floor(Number(counts?.[el]) || 0)),
  }))
    .filter((row) => row.count > 0)
    .map((row) => `${row.el}:${row.count}`);
  return parts.join(" ");
}

function getProtocolDurationMs(preset) {
  const duration = CONTROL_PROTOCOL_DURATION_MS[String(preset || "")];
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration;
}

function formatProtocolCountdown(remainingMs) {
  const safeRemainingMs = Number.isFinite(remainingMs)
    ? Math.max(0, remainingMs)
    : 0;
  return `${(safeRemainingMs / 1000).toFixed(1)}s`;
}

const CATALOG_ID_SET = new Set(MOLECULE_CATALOG.map((entry) => entry.id));

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

function readSavedCatalogueIdsFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(CATALOGUE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_COLLECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const idsRaw = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.collectedIds)
        ? parsed.collectedIds
        : [];
    const seen = new Set();
    const valid = [];
    for (const id of idsRaw) {
      if (typeof id !== "string") continue;
      if (!CATALOG_ID_SET.has(id) || seen.has(id)) continue;
      seen.add(id);
      valid.push(id);
    }
    return valid;
  } catch {
    return [];
  }
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

  const [allowMultipleBonds, setAllowMultipleBonds] = useState(true);
  const allowMultipleBondsRef = useRef(true);
  useEffect(
    () => void (allowMultipleBondsRef.current = allowMultipleBonds),
    [allowMultipleBonds],
  );

  // sim toggles
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => void (pausedRef.current = paused), [paused]);

  // temperature control
  const [temperatureK, setTemperatureK] = useState(DEFAULT_TEMPERATURE_K);
  const [damping, setDamping] = useState(DEFAULT_DAMPING);
  const [bondScale, setBondScale] = useState(DEFAULT_BOND_SCALE);

  // box size (half-size)
  const [boxHalfSize, setBoxHalfSize] = useState(DEFAULT_BOX_HALF_SIZE);
  const [showBoxEdges, setShowBoxEdges] = useState(true);
  const [showPeriodicRepeats, setShowPeriodicRepeats] = useState(false);
  const showPeriodicRepeatsRef = useRef(false);
  useEffect(
    () => void (showPeriodicRepeatsRef.current = showPeriodicRepeats),
    [showPeriodicRepeats],
  );
  const [adaptiveForceField, setAdaptiveForceField] = useState(true);

  // per-element LJ
  const [lj, setLj] = useState(() => structuredClone(DEFAULT_LJ));

  // LJ editor element (separate from placement element)
  const [ljElement, setLjElement] = useState("C");

  // overlays (controls hidden by default for mobile friendliness)
  const [controlsOpen, setControlsOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [wellsOpen, setWellsOpen] = useState(false);
  const [spawnElementCount, setSpawnElementCount] = useState(5);
  const [spawnFeedType, setSpawnFeedType] = useState("trapBalanced");
  const [spawnFeedSelectOpen, setSpawnFeedSelectOpen] = useState(false);
  const [protocolPreset, setProtocolPreset] = useState("trap-cycle");
  const [protocolSelectOpen, setProtocolSelectOpen] = useState(false);
  const [protocolAutoRun, setProtocolAutoRun] = useState(false);
  const [protocolIncludeDosing, setProtocolIncludeDosing] = useState(true);
  const [protocolRunning, setProtocolRunning] = useState(false);
  const [protocolStatus, setProtocolStatus] = useState("idle");
  const [protocolTrendTags, setProtocolTrendTags] = useState("");
  const [protocolElapsedMs, setProtocolElapsedMs] = useState(0);
  const [controlDeltaTags, setControlDeltaTags] = useState([]);
  const [actionReadoutTags, setActionReadoutTags] = useState([]);
  const [modeOpen, setModeOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [hasEverLocalSave, setHasEverLocalSave] = useState(false);
  const [starterSeedUsed, setStarterSeedUsed] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("number");
  const [collectionSortDir, setCollectionSortDir] = useState("asc");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectedIds, setCollectedIds] = useState([]);
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
  const protocolRunRef = useRef({
    running: false,
    preset: "trap-cycle",
    startedAtMs: 0,
    base: null,
    currentCycle: 1,
    lastTrapDoseCycle: -1,
    lastScaffoldDoseStep: -1,
    lastHydrogenDoseStep: -1,
  });
  const controlValuesRef = useRef({
    temperatureK: DEFAULT_TEMPERATURE_K,
    damping: DEFAULT_DAMPING,
    bondScale: DEFAULT_BOND_SCALE,
    boxHalfSize: DEFAULT_BOX_HALF_SIZE,
  });
  const protocolAutoRunRef = useRef(protocolAutoRun);
  const protocolIncludeDosingRef = useRef(protocolIncludeDosing);
  const prevControlReadoutRef = useRef({
    temperatureK: DEFAULT_TEMPERATURE_K,
    bondScale: DEFAULT_BOND_SCALE,
    damping: DEFAULT_DAMPING,
    boxHalfSize: DEFAULT_BOX_HALF_SIZE,
  });
  const controlDeltaClearTimerRef = useRef(null);
  const actionReadoutClearTimerRef = useRef(null);
  const queuedScanTimerRef = useRef(null);
  const queuedScanPendingRef = useRef(false);

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
      })).filter((row) => row.count > 0),
    [liveElementCounts],
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
    const statusRank = (entry) => {
      const isCollected = collectedSet.has(entry.id);
      const isLive = liveCollectedSet.has(entry.id);
      if (isLive) return 0;
      if (isCollected) return 1;
      return 2;
    };

    rows.sort((a, b) => {
      let cmp = 0;
      if (collectionSort === "weight") {
        const aw = molecularWeightById.get(a.id) ?? 0;
        const bw = molecularWeightById.get(b.id) ?? 0;
        if (aw !== bw) cmp = aw - bw;
      } else if (collectionSort === "name") {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) cmp = byName;
      } else if (collectionSort === "status") {
        const as = statusRank(a);
        const bs = statusRank(b);
        if (as !== bs) cmp = as - bs;
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
    molecularWeightById,
    collectedSet,
    liveCollectedSet,
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

  const showActionReadout = useCallback((label) => {
    const text = String(label || "").trim();
    if (!text) return;
    if (actionReadoutClearTimerRef.current) {
      window.clearTimeout(actionReadoutClearTimerRef.current);
      actionReadoutClearTimerRef.current = null;
    }
    setActionReadoutTags([text]);
    actionReadoutClearTimerRef.current = window.setTimeout(() => {
      actionReadoutClearTimerRef.current = null;
      setActionReadoutTags([]);
    }, 650);
  }, []);

  const showSpawnReadout = useCallback(
    (counts) => {
      const rows = ELEMENTS.map((el) => ({
        el,
        count: Math.max(0, Math.floor(Number(counts?.[el]) || 0)),
      })).filter((row) => row.count > 0);
      if (rows.length <= 0) return;
      if (rows.length === 1) {
        const only = rows[0];
        if (only.count === 1) {
          showActionReadout(`Spawned ${only.el}`);
          return;
        }
        showActionReadout(`Spawned [${only.el}:${only.count}]`);
        return;
      }
      showActionReadout(
        `Spawned [${rows.map((row) => `${row.el}:${row.count}`).join(" ")}]`,
      );
    },
    [showActionReadout],
  );

  const showDeletedReadout = useCallback(
    (counts, forceBracket = false) => {
      const rows = ELEMENTS.map((el) => ({
        el,
        count: Math.max(0, Math.floor(Number(counts?.[el]) || 0)),
      })).filter((row) => row.count > 0);
      if (rows.length <= 0) return;
      if (!forceBracket && rows.length === 1 && rows[0].count === 1) {
        showActionReadout(`Deleted ${rows[0].el}`);
        return;
      }
      showActionReadout(
        `Deleted [${rows.map((row) => `${row.el}:${row.count}`).join(" ")}]`,
      );
    },
    [showActionReadout],
  );

  useEffect(() => {
    const valid = readSavedCatalogueIdsFromStorage();
    const hasSavedCatalogue = valid.length > 0;
    setHasEverLocalSave(hasSavedCatalogue);
    setStarterSeedUsed(hasSavedCatalogue);
    setCollectedIds(valid);
    setLastCataloguedId(valid.length > 0 ? valid[valid.length - 1] : null);
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
    localStorage.setItem(CATALOGUE_STORAGE_KEY, JSON.stringify(collectedIds));
  }, [collectedIds, catalogueHydrated]);

  useEffect(() => {
    if (collectedIds.length > 0) setHasEverLocalSave(true);
  }, [collectedIds]);

  useEffect(() => {
    collectedSetRef.current = new Set(collectedIds);
  }, [collectedIds]);

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
      useLangevin: true,
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
  ]);

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
      canvasCard: {
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.12)",
        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
      },
      controls: {
        position: "absolute",
        left: 10,
        top: 10,
        width: 420,
        maxWidth: "min(420px, 92vw)",
        maxHeight: "calc(100% - 74px)",
        overflowY: "auto",
        overflowX: "hidden",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
        padding: 10,
        pointerEvents: "auto",
        zIndex: 440,
      },
      instructions: {
        position: "absolute",
        right: 10,
        top: 10,
        width: 360,
        maxWidth: "min(360px, 92vw)",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.14)",
        padding: "10px 10px",
        pointerEvents: "auto",
        zIndex: 460,
      },
      headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 8,
      },
      title: { fontSize: 12, fontWeight: 950, color: "#0f172a" },
      titleBtn: {
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        fontSize: 12,
        fontWeight: 950,
        color: "#0f172a",
        cursor: "pointer",
        textAlign: "left",
      },
      sectionTitleBtn: {
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        fontSize: 11,
        fontWeight: 950,
        color: "#0f172a",
        cursor: "pointer",
        textAlign: "left",
      },

      btnDark: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.16)",
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(15,23,42,0.82))",
        color: "rgba(248,250,252,0.98)",
        cursor: "pointer",
        fontWeight: 800,
      },
      btnLight: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(255,255,255,0.92)",
        color: "#0f172a",
        cursor: "pointer",
        fontWeight: 800,
      },
      pillBtn: (active, tone = "neutral") => {
        const isDanger = tone === "danger";
        const bgActive = isDanger
          ? "rgba(185,28,28,0.92)"
          : "rgba(15,23,42,0.86)";
        return {
          padding: "7px 10px",
          borderRadius: 12,
          border: "1px solid rgba(15,23,42,0.16)",
          background: active ? bgActive : "rgba(255,255,255,0.92)",
          color: active ? "rgba(248,250,252,0.98)" : "#0f172a",
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 12,
        };
      },
      select: {
        padding: 9,
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.18)",
        background: "rgba(255,255,255,0.95)",
        color: "#0f172a",
        fontWeight: 800,
        maxWidth: "100%",
        minWidth: 0,
      },
      section: {
        borderTop: "1px solid rgba(15,23,42,0.12)",
        paddingTop: 10,
        marginTop: 10,
        display: "grid",
        gap: 8,
      },
      row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        minWidth: 0,
      },
      hintTitle: { fontSize: 11, fontWeight: 950, color: "#0f172a" },
      hintText: { fontSize: 11, color: "#475569", lineHeight: 1.35 },
      floatingShow: {
        position: "absolute",
        left: 10,
        top: 10,
        pointerEvents: "auto",
        zIndex: 430,
      },
      trendTagShow: {
        position: "absolute",
        left: 10,
        top: 56,
        display: "grid",
        justifyItems: "start",
        gap: 2,
        pointerEvents: "none",
        zIndex: 425,
        opacity: 0.2,
      },
      instructionsShow: {
        position: "absolute",
        right: 10,
        top: 10,
        pointerEvents: "auto",
        zIndex: 450,
      },
      tutorial: {
        position: "absolute",
        left: "50%",
        top: 10,
        transform: "translateX(-50%)",
        width: 380,
        maxWidth: "min(380px, calc(100% - 20px))",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.14)",
        padding: "10px 10px",
        pointerEvents: "auto",
        zIndex: 470,
      },
      tutorialShow: {
        position: "absolute",
        left: "50%",
        top: 10,
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        zIndex: 470,
      },
      catalogue: {
        position: "absolute",
        right: 10,
        bottom: 58,
        width: 640,
        maxWidth: "min(640px, calc(100% - 20px))",
        maxHeight: "min(50%, 360px)",
        overflow: "auto",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.14)",
        padding: "10px 10px",
        pointerEvents: "auto",
        zIndex: 440,
      },
      catalogueShow: {
        position: "absolute",
        right: 10,
        bottom: 58,
        display: "grid",
        justifyItems: "end",
        pointerEvents: "auto",
        zIndex: 420,
      },
      atomCountsShow: {
        position: "absolute",
        left: 10,
        top: "50%",
        transform: "translateY(-50%)",
        display: "grid",
        justifyItems: "start",
        pointerEvents: "none",
        zIndex: 8,
        opacity: 0.2,
      },
      thermoShow: {
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        display: "grid",
        justifyItems: "end",
        gap: 6,
        pointerEvents: "none",
        zIndex: 8,
        opacity: 0.2,
      },
      liveHud: {
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        minHeight: 40,
        pointerEvents: "none",
        zIndex: 120,
      },
      liveHudControls: {
        display: "grid",
        gap: 8,
        alignContent: "end",
      },
      liveHudBar: {
        flex: 1,
        alignSelf: "flex-end",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.2)",
        background: "rgba(248,250,252,0.96)",
        boxShadow: "0 8px 20px rgba(15,23,42,0.16)",
        padding: "8px 10px",
        overflow: "hidden",
        whiteSpace: "nowrap",
        pointerEvents: "auto",
      },
    }),
    [],
  );

  // ---------- sprites ----------
  function makePixelSphereTexture(hex, label) {
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
  }

  function makeGlowTexture() {
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
  }

  function getSpriteMaterial(el) {
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
  }

  function getGlowTexture() {
    const t = threeRef.current;
    if (t.glowTexture) return t.glowTexture;
    t.glowTexture = makeGlowTexture();
    return t.glowTexture;
  }

  function createGlowMaterial() {
    return new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: "#fde68a",
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
  }

  function getDiscoveryGlowFactor(catalogId, nowMs = Date.now()) {
    if (!catalogId) return 0;
    const until = discoveryGlowUntilRef.current.get(catalogId) ?? 0;
    if (until <= nowMs) return 0;
    const left = until - nowMs;
    if (left >= FIRST_DISCOVERY_CALLOUT_FADE_MS) return 1;
    return clamp01(left / FIRST_DISCOVERY_CALLOUT_FADE_MS);
  }

  function ensureSpriteForAtom(atom) {
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
  }

  function ensureRepeatSprite(idx, atomEl) {
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
  }

  function syncPeriodicRepeatSprites() {
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
    const halfBox = params?.boxHalfSize ?? boxHalfSize;
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
  }

  function removeMissingSprites() {
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
  }

  function syncLiveAtomGlow(nowMs) {
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
  }

  // ---------- bonds ----------
  function syncBondCylinders() {
    const t = threeRef.current;
    const sim = simRef.current;
    const params = paramsRef.current;
    const usePeriodic = Boolean(params?.usePeriodicBoundary);
    const halfBox = params?.boxHalfSize ?? boxHalfSize;
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
  }

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
    [catalogByFingerprint, catalogById],
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

  // ---------- init ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    camera.position.set(0, 0.6, 14);
    camera.lookAt(0, 0, 0);

    const atomGroup = new THREE.Group();
    scene.add(atomGroup);

    const repeatAtomGroup = new THREE.Group();
    scene.add(repeatAtomGroup);

    const bondGroup = new THREE.Group();
    scene.add(bondGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite.threshold = 0.35;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.panSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.enabled = toolRef.current === TOOL.ROTATE;
    controls.target.set(0, 0, 0);
    controls.update();

    const three = threeRef.current;
    three.renderer = renderer;
    three.scene = scene;
    three.camera = camera;
    three.controls = controls;
    three.raycaster = raycaster;
    three.atomGroup = atomGroup;
    three.repeatAtomGroup = repeatAtomGroup;
    three.repeatAtomSprites = [];
    three.bondGroup = bondGroup;
    three.bondMeshes = [];
    refreshBoxVisuals();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height)); // use container height too
      renderer.setSize(w, h, false);
      camera.aspect = w / h; // rectangle aspect
      camera.updateProjectionMatrix();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const sim = simRef.current;
    clearSim3D(sim);
    const hasSavedCatalogueAtInit =
      readSavedCatalogueIdsFromStorage().length > 0;
    if (hasSavedCatalogueAtInit) {
      const initialCounts = [
        ["O", 4],
        ["H", 8],
      ];
      const actualSeedCounts = {};
      for (const [el, count] of initialCounts) {
        for (let i = 0; i < count; i += 1) {
          const beforeCount = sim.atoms.length;
          addAtom3D(
            sim,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 3,
            el,
            elements,
            MAX_ATOMS,
          );
          if (sim.atoms.length > beforeCount) {
            actualSeedCounts[el] = (actualSeedCounts[el] || 0) + 1;
          }
        }
      }
      showSpawnReadout(actualSeedCounts);
    }
    scanCollectionProgress(sim);

    // loop
    let last = performance.now();
    let acc = 0;
    const FIXED_DT = 1 / 60;
    const MAX_SUBSTEPS = 6;
    let scanStepAccumulator = 0;

    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;

      const params = paramsRef.current;
      if (!params) return;

      if (!pausedRef.current) {
        let steps = 0;
        while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
          stepSim3D(simRef.current, params, FIXED_DT);

          acc -= FIXED_DT;
          steps++;
        }
        if (steps > 0) {
          scanStepAccumulator += steps;
          if (scanStepAccumulator >= COLLECTION_SCAN_INTERVAL_STEPS) {
            scanStepAccumulator = 0;
            queueCollectionScan();
          }
        }
      } else {
        acc = 0;
      }

      three.controls?.update?.();

      const simNow = simRef.current;
      for (const a of simNow.atoms) {
        const spr = ensureSpriteForAtom(a);
        spr.position.set(a.x, a.y, a.z);
        const depth = 1 + a.z * 0.02;
        const s = a.r * 2.2 * depth;
        spr.scale.set(s, s, 1);
      }
      removeMissingSprites();
      syncLiveAtomGlow(now);
      syncPeriodicRepeatSprites();

      syncBondCylinders();
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (queuedScanTimerRef.current) {
        clearTimeout(queuedScanTimerRef.current);
        queuedScanTimerRef.current = null;
      }
      queuedScanPendingRef.current = false;
      ro.disconnect();
      mount.removeChild(renderer.domElement);

      controls.dispose();
      renderer.dispose();

      for (const mat of three.spriteMaterials.values()) {
        mat.map?.dispose?.();
        mat.dispose?.();
      }
      three.spriteMaterials.clear();
      for (const spr of three.repeatAtomSprites) {
        three.repeatAtomGroup?.remove(spr);
        spr.material?.dispose?.();
      }
      three.repeatAtomSprites = [];

      for (const mesh of three.bondMeshes) {
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      }
      three.bondMeshes = [];

      for (const glow of three.glowSprites.values()) {
        three.atomGroup?.remove(glow);
        glow.material?.dispose?.();
      }
      three.glowSprites.clear();
      three.glowTexture?.dispose?.();
      three.glowTexture = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          showActionReadout(`Added ${placeElement}`);
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
    showActionReadout,
    showDeletedReadout,
  ]);

  useEffect(() => {
    return () => {
      protocolRunRef.current.running = false;
    };
  }, []);

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

  const spawnAutomationFeed = useCallback(
    (feedKey, doses = 1) => {
      const feed = AUTOMATION_FEEDS[feedKey];
      if (!feed) return;
      const n = clamp(Math.floor(Number(doses) || 0), 0, 24);
      if (n <= 0) return;

      const scaledCounts = {};
      for (const el of ELEMENTS) {
        scaledCounts[el] = Math.max(
          0,
          Math.floor(Number(feed.counts?.[el]) || 0) * n,
        );
      }
      spawnElementCounts(scaledCounts, feed.jitter, true);
    },
    [spawnElementCounts],
  );

  function spawnAtoms(count, mode = "selected") {
    const sim = simRef.current;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const spawnedCounts = {};
    for (let i = 0; i < n; i++) {
      const el =
        mode === "random"
          ? ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]
          : placeElement;
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

  const runAutomationDosing = useCallback(
    (preset, elapsedMs, run) => {
      if (!protocolIncludeDosingRef.current) return;

      if (preset === "trap-cycle") {
        const cycleMs = 32000;
        const cycleIndex = Math.floor(elapsedMs / cycleMs);
        const phase = (elapsedMs % cycleMs) / cycleMs;
        if (phase >= 0.62 && run.lastTrapDoseCycle !== cycleIndex) {
          spawnAutomationFeed("trapBalanced", 1);
          run.lastTrapDoseCycle = cycleIndex;
        }
        return;
      }

      if (preset === "scaffold-then-cap") {
        const totalMs = 42000;
        const t = clamp(elapsedMs / totalMs, 0, 1);

        if (t < 0.4) {
          const scaffoldStep = Math.floor(elapsedMs / 9000);
          if (run.lastScaffoldDoseStep !== scaffoldStep) {
            spawnAutomationFeed("scaffoldBuild", 1);
            run.lastScaffoldDoseStep = scaffoldStep;
          }
        }

        if (t >= 0.4 && t < 0.8) {
          const capElapsedMs = elapsedMs - totalMs * 0.4;
          const hydrogenStep = Math.floor(capElapsedMs / 4500);
          if (run.lastHydrogenDoseStep !== hydrogenStep) {
            spawnAutomationFeed("hydrogenPulse", 1);
            run.lastHydrogenDoseStep = hydrogenStep;
          }
        }
      }
    },
    [spawnAutomationFeed],
  );

  function computeProtocolTargets(
    preset,
    elapsedMs,
    base,
    autoRun = true,
    cycleIndex = 1,
  ) {
    const mix = (a, b, t) => a + (b - a) * t;
    if (preset === "trap-cycle") {
      const cycleMs = 32000;
      const phase = autoRun
        ? (elapsedMs % cycleMs) / cycleMs
        : clamp(elapsedMs / cycleMs, 0, 1);
      const compressedBox = clamp(base.boxHalfSize * 0.75, 2.8, 10.5);
      const expandedBox = clamp(compressedBox * 1.5, 3.2, 12);

      if (phase < 0.22) {
        const t = phase / 0.22;
        return {
          temperatureK: mix(base.temperatureK, 1400, t),
          damping: mix(base.damping, 0.9995, t),
          bondScale: mix(
            base.bondScale,
            Math.max(2.1, base.bondScale - 0.5),
            t,
          ),
          boxHalfSize: mix(base.boxHalfSize, compressedBox, t),
          status: "Step 1: compress + energize",
          done: false,
        };
      }
      if (phase < 0.56) {
        return {
          temperatureK: 1400,
          damping: 0.9995,
          bondScale: Math.max(2.1, base.bondScale - 0.5),
          boxHalfSize: compressedBox,
          status: "Step 2: collision mixing",
          done: false,
        };
      }

      const t = (phase - 0.56) / 0.44;
      const step = Math.min(4, Math.floor(t * 5));
      const steppedBox = clamp(
        compressedBox * (1 + step * 0.15),
        compressedBox,
        expandedBox,
      );
      return {
        temperatureK: mix(1300, 640, t),
        damping: mix(0.9993, 0.995, t),
        bondScale: mix(
          Math.max(2.0, base.bondScale - 0.35),
          Math.min(5.6, base.bondScale + 0.95),
          t,
        ),
        boxHalfSize: steppedBox,
        status: "Step 3: expand in 15% steps",
        done: !autoRun && elapsedMs >= cycleMs,
      };
    }

    if (preset === "scaffold-then-cap") {
      const totalMs = 42000;
      const t = clamp(elapsedMs / totalMs, 0, 1);
      const cyclePrefix = autoRun ? `Cycle ${cycleIndex}: ` : "";
      if (t < 0.4) {
        const p = t / 0.4;
        return {
          temperatureK: mix(base.temperatureK, 1280, p),
          damping: mix(base.damping, 0.9993, p),
          bondScale: mix(
            base.bondScale,
            Math.max(2.2, base.bondScale - 0.45),
            p,
          ),
          boxHalfSize: mix(
            base.boxHalfSize,
            clamp(base.boxHalfSize * 0.78, 2.9, 10.0),
            p,
          ),
          status: `${cyclePrefix}Scaffold stage: heavy-atom growth`,
          done: false,
        };
      }
      if (t < 0.8) {
        const p = (t - 0.4) / 0.4;
        return {
          temperatureK: mix(1240, 780, p),
          damping: mix(0.9992, 0.9965, p),
          bondScale: mix(
            Math.max(2.2, base.bondScale - 0.35),
            Math.min(5.4, base.bondScale + 0.8),
            p,
          ),
          boxHalfSize: mix(
            clamp(base.boxHalfSize * 0.78, 2.9, 10.0),
            clamp(base.boxHalfSize * 1.08, 3.2, 12),
            p,
          ),
          status: `${cyclePrefix}Cap stage: controlled hydrogenation`,
          done: false,
        };
      }
      return {
        temperatureK: mix(780, base.temperatureK, (t - 0.8) / 0.2),
        damping: mix(0.9965, base.damping, (t - 0.8) / 0.2),
        bondScale: mix(
          Math.min(5.4, base.bondScale + 0.8),
          base.bondScale,
          (t - 0.8) / 0.2,
        ),
        boxHalfSize: mix(
          clamp(base.boxHalfSize * 1.08, 3.2, 12),
          base.boxHalfSize,
          (t - 0.8) / 0.2,
        ),
        status: `${cyclePrefix}Scaffold protocol complete`,
        done: t >= 1,
      };
    }

    // gentle-anneal
    const totalMs = 36000;
    const t = clamp(elapsedMs / totalMs, 0, 1);
    const cyclePrefix = autoRun ? `Cycle ${cycleIndex}: ` : "";
    return {
      temperatureK: mix(base.temperatureK, 520, t),
      damping: mix(base.damping, 0.9988, t),
      bondScale: mix(base.bondScale, Math.min(5.0, base.bondScale + 0.65), t),
      boxHalfSize: mix(
        base.boxHalfSize,
        clamp(base.boxHalfSize * 1.12, 3.2, 12),
        t,
      ),
      status:
        t >= 1 ? `${cyclePrefix}Anneal complete` : `${cyclePrefix}Annealing`,
      done: t >= 1,
    };
  }

  function stopControlProtocol(message = "idle") {
    protocolRunRef.current.running = false;
    setProtocolRunning(false);
    setProtocolStatus(message);
    setProtocolTrendTags("");
  }

  function buildProtocolTrendTags(current, next) {
    const tags = [];
    const pushTag = (code, delta, threshold) => {
      if (delta > threshold) tags.push(`+${code}`);
      else if (delta < -threshold) tags.push(`-${code}`);
    };
    pushTag("T", (next.temperatureK ?? 0) - (current.temperatureK ?? 0), 0.5);
    pushTag("B", (next.bondScale ?? 0) - (current.bondScale ?? 0), 0.01);
    pushTag("V", (next.boxHalfSize ?? 0) - (current.boxHalfSize ?? 0), 0.01);
    pushTag("D", (next.damping ?? 0) - (current.damping ?? 0), 1e-4);
    return tags.join(" ");
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
    const prev = prevControlReadoutRef.current;
    const tags = [];
    const pushTag = (code, delta, threshold) => {
      if (delta > threshold) tags.push(`+${code}`);
      else if (delta < -threshold) tags.push(`-${code}`);
    };

    pushTag("T", temperatureK - prev.temperatureK, 0.01);
    pushTag("B", bondScale - prev.bondScale, 0.0005);
    pushTag("D", damping - prev.damping, 0.00001);
    pushTag("V", boxHalfSize - prev.boxHalfSize, 0.0005);

    prevControlReadoutRef.current = {
      temperatureK,
      bondScale,
      damping,
      boxHalfSize,
    };

    setControlDeltaTags((current) => {
      const currentKey = Array.isArray(current) ? current.join("|") : "";
      const nextKey = tags.join("|");
      return currentKey === nextKey ? current : tags;
    });

    if (controlDeltaClearTimerRef.current) {
      window.clearTimeout(controlDeltaClearTimerRef.current);
      controlDeltaClearTimerRef.current = null;
    }
    if (tags.length > 0) {
      controlDeltaClearTimerRef.current = window.setTimeout(() => {
        controlDeltaClearTimerRef.current = null;
        setControlDeltaTags([]);
      }, 320);
    }
  }, [temperatureK, bondScale, damping, boxHalfSize]);

  useEffect(() => {
    return () => {
      if (controlDeltaClearTimerRef.current) {
        window.clearTimeout(controlDeltaClearTimerRef.current);
        controlDeltaClearTimerRef.current = null;
      }
      if (actionReadoutClearTimerRef.current) {
        window.clearTimeout(actionReadoutClearTimerRef.current);
        actionReadoutClearTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    protocolAutoRunRef.current = protocolAutoRun;
  }, [protocolAutoRun]);

  useEffect(() => {
    protocolIncludeDosingRef.current = protocolIncludeDosing;
  }, [protocolIncludeDosing]);

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
    if (!protocolRunning) return undefined;

    const startedAtMs = performance.now();
    protocolRunRef.current = {
      running: true,
      preset: protocolPreset,
      startedAtMs,
      base: { ...controlValuesRef.current },
      currentCycle: 1,
      lastTrapDoseCycle: -1,
      lastScaffoldDoseStep: -1,
      lastHydrogenDoseStep: -1,
    };
    setProtocolElapsedMs(0);
    setProtocolStatus("running");
    setProtocolTrendTags("");
    setPaused(false);

    const tick = () => {
      const run = protocolRunRef.current;
      if (!run.running || !run.base) return;
      const elapsedMs = Math.max(0, performance.now() - run.startedAtMs);
      const next = computeProtocolTargets(
        run.preset,
        elapsedMs,
        run.base,
        protocolAutoRunRef.current,
        run.currentCycle || 1,
      );
      runAutomationDosing(run.preset, elapsedMs, run);
      const curr = controlValuesRef.current;
      setProtocolTrendTags(buildProtocolTrendTags(curr, next));
      setProtocolElapsedMs(elapsedMs);
      setTemperatureK((prev) =>
        Math.abs(prev - next.temperatureK) < 0.5 ? prev : next.temperatureK,
      );
      setDamping((prev) =>
        Math.abs(prev - next.damping) < 1e-4 ? prev : next.damping,
      );
      setBondScale((prev) =>
        Math.abs(prev - next.bondScale) < 0.01 ? prev : next.bondScale,
      );
      setBoxHalfSize((prev) =>
        Math.abs(prev - next.boxHalfSize) < 0.01 ? prev : next.boxHalfSize,
      );
      setProtocolStatus(next.status);
      if (next.done) {
        if (protocolAutoRunRef.current) {
          run.startedAtMs = performance.now();
          run.base = { ...controlValuesRef.current };
          run.currentCycle = (run.currentCycle || 1) + 1;
          run.lastTrapDoseCycle = -1;
          run.lastScaffoldDoseStep = -1;
          run.lastHydrogenDoseStep = -1;
          setProtocolElapsedMs(0);
          setProtocolStatus("running");
          return;
        }
        stopControlProtocol("completed");
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 180);
    return () => window.clearInterval(intervalId);
  }, [protocolRunning, protocolPreset, runAutomationDosing]);

  function normalizeCatalogueIds(candidate) {
    if (!Array.isArray(candidate)) return [];
    const valid = candidate.filter(
      (id) => typeof id === "string" && catalogById.has(id),
    );
    return Array.from(new Set(valid)).sort();
  }

  async function exportEncryptedCatalogue() {
    try {
      setCatalogueSaveBusy(true);
      setCatalogueSaveStatus("");

      const payloadJson = JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        collectedIds: normalizeCatalogueIds(collectedIds),
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
      const ids = Array.isArray(parsed)
        ? normalizeCatalogueIds(parsed)
        : normalizeCatalogueIds(parsed?.collectedIds);

      setCollectedIds(ids);
      setLastCataloguedId(ids.length > 0 ? ids[ids.length - 1] : null);
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
    setLastCataloguedId(null);
    setCatalogCountGlowUntilMs(0);
    setCatalogCountGlowNowMs(0);
    localStorage.removeItem(CATALOGUE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_COLLECTION_STORAGE_KEY);
    window.location.reload();
  }

  // Reset ALL controls EXCEPT the currently-selected tool mode
  function resetAllControls() {
    stopControlProtocol("idle");
    setPaused(false);
    setTemperatureK(DEFAULT_TEMPERATURE_K);
    setDamping(DEFAULT_DAMPING);
    setBondScale(DEFAULT_BOND_SCALE);

    setBoxHalfSize(DEFAULT_BOX_HALF_SIZE);
    setShowBoxEdges(true);
    setShowPeriodicRepeats(false);
    setAdaptiveForceField(true);

    setShowBonds(true);
    setAllowMultipleBonds(true);
    setSpawnElementCount(5);
    setSpawnFeedType("trapBalanced");
    setSpawnFeedSelectOpen(false);
    setProtocolPreset("trap-cycle");
    setProtocolAutoRun(false);
    setProtocolIncludeDosing(true);
    setProtocolElapsedMs(0);

    // DO NOT change tool
    setPlaceElement("C");

    setLj(structuredClone(DEFAULT_LJ));
    setLjElement("C");

    // leave controlsOpen as-is (don't force open on mobile)
    setAutomationOpen(false);
    setWellsOpen(false);
  }

  // LJ sliders edit ljElement
  const selectedSigma = lj[ljElement]?.sigma ?? 1.1;
  const selectedEpsilon = lj[ljElement]?.epsilon ?? 1.0;

  function updateSelectedLJ(field, v) {
    setLj((prev) => {
      const next = structuredClone(prev);
      next[ljElement][field] = v;
      return next;
    });
  }

  function toggleCollectionSort(nextKey) {
    if (collectionSort === nextKey) {
      setCollectionSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setCollectionSort(nextKey);
    setCollectionSortDir("asc");
  }

  function sortArrowsFor(key) {
    const active = collectionSort === key;
    const dir = collectionSortDir === "desc" ? "desc" : "asc";
    const showDown = !active || dir === "desc";
    const showUp = !active || dir === "asc";
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1,
          minWidth: 14,
          marginLeft: 4,
          color: active ? "#334155" : "#64748b",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {showDown ? (
          <span style={{ transform: "translateY(1px)" }}>&darr;</span>
        ) : null}
        {showUp ? (
          <span style={{ transform: "translateY(-1px)" }}>&uarr;</span>
        ) : null}
      </span>
    );
  }

  const activeProtocolMeta =
    CONTROL_PROTOCOLS.find((item) => item.id === protocolPreset) ||
    CONTROL_PROTOCOLS[0];
  const placeElementLabel = ELEMENT_NAMES[placeElement] || placeElement;
  const protocolStatusKey = String(protocolStatus || "")
    .trim()
    .toLowerCase();
  const protocolStatusIsActive =
    protocolStatusKey !== "idle" && protocolStatusKey !== "stopped";
  const activeProtocolDurationMs = useMemo(
    () => getProtocolDurationMs(protocolPreset),
    [protocolPreset],
  );
  const protocolCycleIndex = useMemo(() => {
    if (!protocolRunning || activeProtocolDurationMs <= 0) return 1;
    if (!protocolAutoRun) return 1;
    return Math.floor(protocolElapsedMs / activeProtocolDurationMs) + 1;
  }, [
    activeProtocolDurationMs,
    protocolAutoRun,
    protocolElapsedMs,
    protocolRunning,
  ]);
  const protocolCountdownRowText = useMemo(() => {
    if (!protocolRunning || activeProtocolDurationMs <= 0) return "";
    const cycleElapsedMs = protocolAutoRun
      ? protocolElapsedMs % activeProtocolDurationMs
      : Math.min(protocolElapsedMs, activeProtocolDurationMs);
    const remainingMs = Math.max(0, activeProtocolDurationMs - cycleElapsedMs);
    const baseText = `${formatProtocolCountdown(remainingMs)} remaining`;
    return protocolAutoRun
      ? `${baseText} in Cycle ${protocolCycleIndex}`
      : baseText;
  }, [
    activeProtocolDurationMs,
    protocolCycleIndex,
    protocolAutoRun,
    protocolElapsedMs,
    protocolRunning,
  ]);
  const protocolCountdownRowHasContent = protocolCountdownRowText.length > 0;
  const protocolTrendRowText = protocolRunning
    ? String(protocolTrendTags || "").trim()
    : "";
  const protocolTrendRowHasContent = protocolTrendRowText.length > 0;
  const statusReadoutRows = useMemo(
    () => [...actionReadoutTags, ...controlDeltaTags],
    [actionReadoutTags, controlDeltaTags],
  );
  const activeProtocolDosingPanelText = useMemo(() => {
    if (!protocolIncludeDosing) {
      return "Dosing profile: disabled for automation cycles.";
    }
    if (protocolPreset === "scaffold-then-cap") {
      return `Dosing profile: scaffold feed during build stage [${formatFeedAtomBreakdown(
        AUTOMATION_FEEDS.scaffoldBuild.counts,
      )}], then hydrogen pulses during cap stage [${formatFeedAtomBreakdown(
        AUTOMATION_FEEDS.hydrogenPulse.counts,
      )}].`;
    }
    if (protocolPreset === "trap-cycle") {
      return `Dosing profile: one balanced feed pulse each trap-breaker cycle [${formatFeedAtomBreakdown(
        AUTOMATION_FEEDS.trapBalanced.counts,
      )}].`;
    }
    return "Dosing profile: no auto-dosing events for this cycle.";
  }, [protocolIncludeDosing, protocolPreset]);

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
      <DesktopBadge />

      <div ref={canvasCardRef} style={ui.canvasCard}>
        {/* Controls: top-left */}
        {controlsOpen ? (
          <div
            id="controls-overlay"
            style={{
              ...ui.controls,
              maxHeight: "calc(100% - 136px)",
            }}
          >
            <div style={ui.headerRow}>
              <button
                onClick={() => setControlsOpen(false)}
                style={ui.titleBtn}
                title="Close controls panel."
              >
                Controls
              </button>
              <button
                onClick={() => setControlsOpen(false)}
                style={ui.btnLight}
                title="Close controls panel."
              >
                Hide
              </button>
            </div>

            <div className="reactor-col-gap-8">
              <div className="reactor-row-gap-8-wrap">
                <button
                  onClick={() => setPaused((p) => !p)}
                  style={ui.btnDark}
                  title="Pause or resume physics updates."
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={shake}
                  style={ui.btnLight}
                  title="Apply a random nudge to all atoms."
                >
                  Shake
                </button>
                <button
                  onClick={resetAllControls}
                  style={ui.btnLight}
                  title="Restore reactor/control defaults."
                >
                  Reset all controls
                </button>
              </div>
            </div>

            <div style={ui.section}>
              <div className="reactor-text-11-title">Reactor controls</div>

              <MiniSlider
                label="Temperature"
                value={temperatureK}
                min={0}
                max={1800}
                step={10}
                onChange={setTemperatureK}
                tooltip="Thermal energy level. Higher values increase motion and collisions."
              />
              <MiniSlider
                label="Damping"
                value={damping}
                min={0.95}
                max={0.9998}
                step={0.001}
                onChange={setDamping}
                tooltip="Velocity retention per step. Higher values keep motion longer."
              />
              <MiniSlider
                label="Bond strength"
                value={bondScale}
                min={0.1}
                max={7.0}
                step={0.05}
                onChange={setBondScale}
                tooltip="Scales bond attraction/hold strength."
              />
              <MiniSlider
                label="Volume (box size)"
                value={boxHalfSize}
                min={2.0}
                max={14}
                step={0.1}
                onChange={setBoxHalfSize}
                tooltip="Container size. Smaller volume increases collision frequency."
              />
            </div>

            <div style={ui.section}>
              <div style={ui.row}>
                <button
                  onClick={() => setAutomationOpen((open) => !open)}
                  style={ui.sectionTitleBtn}
                  title="Show or hide Reactor automation cycle controls."
                >
                  Reactor automation cycles
                </button>
                <div className="reactor-row-gap-8">
                  {!automationOpen && protocolRunning ? (
                    <button
                      onClick={() => stopControlProtocol("stopped")}
                      style={ui.btnDark}
                      title="Stop the currently running automation protocol."
                    >
                      Stop
                    </button>
                  ) : null}
                  <button
                    onClick={() => setAutomationOpen((open) => !open)}
                    style={ui.btnLight}
                    title="Show or hide Reactor automation cycle controls."
                  >
                    {automationOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {automationOpen ? (
                <div className="reactor-grid-gap-4">
                  <div
                    style={{
                      border: "1px solid rgba(15,23,42,0.12)",
                      borderRadius: 10,
                      background: "rgba(241,245,249,0.72)",
                      padding: "8px 9px",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div
                      className="reactor-text-11-title"
                      style={{ fontWeight: 900 }}
                    >
                      {`Current automation: ${activeProtocolMeta?.name ?? "Unknown"}`}
                    </div>
                    <div
                      className="reactor-text-10-muted"
                      style={{
                        color: protocolStatusIsActive ? "#a16207" : "#475569",
                        fontWeight: protocolStatusIsActive ? 800 : 700,
                      }}
                    >
                      {`Status: ${protocolStatus}`}
                    </div>
                    <div
                      className="reactor-text-10-muted"
                      style={{
                        minHeight: 14,
                        color: protocolCountdownRowHasContent
                          ? "#334155"
                          : "#94a3b8",
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {protocolCountdownRowHasContent
                        ? protocolCountdownRowText
                        : "\u00A0"}
                    </div>
                    <div
                      className="reactor-text-10-muted"
                      style={{
                        minHeight: 14,
                        color: protocolTrendRowHasContent
                          ? "#334155"
                          : "#94a3b8",
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {protocolTrendRowHasContent
                        ? protocolTrendRowText
                        : "\u00A0"}
                    </div>
                    <div className="reactor-text-10-muted">
                      {activeProtocolMeta?.description}
                    </div>
                    <div className="reactor-text-10-muted">
                      {activeProtocolDosingPanelText}
                    </div>
                  </div>
                  <select
                    value={protocolPreset}
                    onChange={(e) => {
                      if (protocolRunning) stopControlProtocol("stopped");
                      setProtocolPreset(e.target.value);
                      setProtocolSelectOpen(false);
                    }}
                    onFocus={() => setProtocolSelectOpen(true)}
                    onMouseDown={() => setProtocolSelectOpen(true)}
                    onBlur={() => setProtocolSelectOpen(false)}
                    style={{ ...ui.select, width: "100%" }}
                    title="Select an automation cycle for reactor control values."
                  >
                    {CONTROL_PROTOCOLS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id === protocolPreset && !protocolSelectOpen
                          ? item.name
                          : item.label}
                      </option>
                    ))}
                  </select>
                  <label style={ui.row}>
                    <span
                      className="reactor-text-10-muted"
                      title="Automatically restart the protocol when a run completes."
                    >
                      Auto-run protocol
                    </span>
                    <input
                      type="checkbox"
                      checked={protocolAutoRun}
                      onChange={(e) => setProtocolAutoRun(e.target.checked)}
                      title="Repeat completed protocol runs automatically."
                    />
                  </label>
                  <label style={ui.row}>
                    <span
                      className="reactor-text-10-muted"
                      title="Inject preset atom doses while automation runs."
                    >
                      Include dosing with automation
                    </span>
                    <input
                      type="checkbox"
                      checked={protocolIncludeDosing}
                      onChange={(e) =>
                        setProtocolIncludeDosing(e.target.checked)
                      }
                      title="When enabled, automation injects recipe doses during applicable stages."
                    />
                  </label>
                  <div
                    className="reactor-row-gap-8-wrap"
                    style={{ justifyContent: "center" }}
                  >
                    <button
                      onClick={() =>
                        protocolRunning
                          ? stopControlProtocol("stopped")
                          : setProtocolRunning(true)
                      }
                      style={protocolRunning ? ui.btnDark : ui.btnLight}
                      title={
                        protocolRunning
                          ? "Stop the current protocol run."
                          : "Run the selected protocol once."
                      }
                    >
                      {protocolRunning
                        ? "Stop automation protocol"
                        : "Run automation protocol"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={ui.section}>
              <div style={ui.row}>
                <button
                  onClick={() => setWellsOpen((open) => !open)}
                  style={ui.sectionTitleBtn}
                  title="Show or hide electronics controls."
                >
                  Electronics controls
                </button>
                <button
                  onClick={() => setWellsOpen((s) => !s)}
                  style={ui.btnLight}
                  title="Show or hide electronics controls."
                >
                  {wellsOpen ? "Hide" : "Show"}
                </button>
              </div>

              {wellsOpen ? (
                <>
                  <label style={ui.row}>
                    <span
                      className="reactor-text-12-strong"
                      title="Allow higher bond orders when chemistry rules permit."
                    >
                      Allow double/triple bonds
                    </span>
                    <input
                      type="checkbox"
                      checked={allowMultipleBonds}
                      onChange={(e) => setAllowMultipleBonds(e.target.checked)}
                      title="Allow higher bond orders when chemistry rules permit."
                    />
                  </label>
                  <label style={ui.row}>
                    <span
                      className="reactor-text-12-strong"
                      title="Auto-tune force field intensity as local chemistry changes."
                    >
                      Adaptive force field
                    </span>
                    <input
                      type="checkbox"
                      checked={adaptiveForceField}
                      onChange={(e) => setAdaptiveForceField(e.target.checked)}
                      title="Auto-tune force field intensity as local chemistry changes."
                    />
                  </label>
                  <div style={ui.row}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <div className="reactor-text-11-title">
                        Nonbonded (LJ) for
                      </div>
                      <select
                        value={ljElement}
                        onChange={(e) => setLjElement(e.target.value)}
                        style={ui.select}
                        title="Choose which element's LJ profile to edit."
                      >
                        {ELEMENTS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <MiniSlider
                    label="Sigma (distance)"
                    value={selectedSigma}
                    min={0.6}
                    max={2.3}
                    step={0.02}
                    onChange={(v) => updateSelectedLJ("sigma", v)}
                    tooltip="Preferred nonbonded spacing (larger = farther apart)."
                  />
                  <MiniSlider
                    label="Epsilon (stickiness)"
                    value={selectedEpsilon}
                    min={0.0}
                    max={2.4}
                    step={0.05}
                    onChange={(v) => updateSelectedLJ("epsilon", v)}
                    tooltip="Nonbonded attraction depth (larger = stickier)."
                  />

                  <div style={{ marginTop: 8 }}>
                    <CombinedEnergyWells lj={lj} cutoff={FIXED_CUTOFF} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={ui.floatingShow}>
            <button onClick={() => setControlsOpen(true)} style={ui.btnLight}>
              Show controls
            </button>
          </div>
        )}
        {statusReadoutRows.length > 0 ? (
          <div style={ui.trendTagShow}>
            {statusReadoutRows.map((tag, idx) => (
              <div
                key={`trend-tag-stack-${idx}-${tag}`}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: REACTOR_OVERLAY_LIGHT_TEXT,
                  lineHeight: 1.35,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        ) : null}

        {/* Mode: top-right */}
        {modeOpen ? (
          <div
            id="instructions-overlay"
            style={{
              ...ui.instructions,
              maxHeight: catalogueOpen
                ? "calc(100% - 390px)"
                : "calc(100% - 74px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <div style={ui.headerRow}>
              <button
                onClick={() => setModeOpen(false)}
                style={ui.titleBtn}
                title="Close mode panel."
              >
                Mode
              </button>
              <button onClick={() => setModeOpen(false)} style={ui.btnLight}>
                Hide
              </button>
            </div>

            <div style={ui.hintTitle}>{instructionText.title}</div>
            <div style={{ ...ui.hintText, marginTop: 4 }}>
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
                  style={ui.pillBtn(tool === TOOL.PLACE)}
                  onClick={() => setTool(TOOL.PLACE)}
                >
                  Place
                </button>
                <button
                  style={ui.pillBtn(tool === TOOL.DELETE, "danger")}
                  onClick={() => setTool(TOOL.DELETE)}
                >
                  Delete
                </button>
                <button
                  style={ui.pillBtn(tool === TOOL.ROTATE)}
                  onClick={() => setTool(TOOL.ROTATE)}
                >
                  View
                </button>
                <button
                  style={ui.pillBtn(tool === TOOL.SAVE)}
                  onClick={() => setTool(TOOL.SAVE)}
                >
                  Save
                </button>
              </div>

              {tool === TOOL.PLACE ? (
                <>
                  <div style={ui.row}>
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
                      style={ui.select}
                      title="Select the atom type to place."
                    >
                      {ELEMENTS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div className="reactor-row-gap-8" style={{ minWidth: 0 }}>
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
                        style={{
                          ...ui.select,
                          width: 62,
                          padding: "7px 8px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                        title="How many selected atoms to spawn."
                      />
                    </div>
                    <button
                      onClick={() => spawnAtoms(spawnElementCount, "selected")}
                      style={ui.btnLight}
                      disabled={spawnElementCount <= 0}
                      title="Spawn selected-element atoms."
                    >
                      Spawn
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "start",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                      <select
                        value={spawnFeedType}
                        onChange={(e) => {
                          setSpawnFeedType(e.target.value);
                          setSpawnFeedSelectOpen(false);
                        }}
                        onFocus={() => setSpawnFeedSelectOpen(true)}
                        onMouseDown={() => setSpawnFeedSelectOpen(true)}
                        onBlur={() => setSpawnFeedSelectOpen(false)}
                        style={{ ...ui.select, width: 220 }}
                        title={
                          AUTOMATION_FEEDS[spawnFeedType]?.description ||
                          "Choose automation feed recipe."
                        }
                      >
                        {Object.entries(AUTOMATION_FEEDS).map(([key, feed]) => (
                          <option key={key} value={key}>
                            {spawnFeedSelectOpen || spawnFeedType !== key
                              ? `${feed.label} [${formatFeedAtomBreakdown(feed.counts)}]`
                              : feed.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => spawnAutomationFeed(spawnFeedType)}
                      style={ui.btnLight}
                      title={
                        AUTOMATION_FEEDS[spawnFeedType]?.description ||
                        "Spawn selected automation feed."
                      }
                    >
                      Spawn
                    </button>
                  </div>
                </>
              ) : null}

              {tool === TOOL.DELETE ? (
                <div className="reactor-grid-gap-8-center">
                  <button onClick={clearAll} style={ui.btnLight}>
                    Clear all atoms
                  </button>
                </div>
              ) : null}

              {tool === TOOL.ROTATE ? (
                <div className="reactor-grid-gap-8-center">
                  <label style={ui.row}>
                    <span className="reactor-text-12-strong">
                      View Box Edges
                    </span>
                    <input
                      type="checkbox"
                      checked={showBoxEdges}
                      onChange={(e) => setShowBoxEdges(e.target.checked)}
                    />
                  </label>
                  <label style={ui.row}>
                    <span className="reactor-text-12-strong">
                      Visualize Bonds
                    </span>
                    <input
                      type="checkbox"
                      checked={showBonds}
                      onChange={(e) => setShowBonds(e.target.checked)}
                    />
                  </label>
                  <label style={ui.row}>
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
                      style={ui.btnLight}
                    >
                      Export Save JSON
                    </button>
                    <button
                      onClick={triggerCatalogueImportPicker}
                      disabled={catalogueSaveBusy}
                      style={ui.btnLight}
                    >
                      Import Save JSON
                    </button>
                    <button
                      onClick={resetCatalogueProgress}
                      disabled={catalogueSaveBusy}
                      style={ui.btnLight}
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
            style={{
              ...ui.instructionsShow,
              display: "grid",
              justifyItems: "end",
            }}
          >
            <button onClick={() => setModeOpen(true)} style={ui.btnLight}>
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
            style={{ ...ui.tutorial, cursor: "pointer" }}
            onClick={() => setTutorialOpen(false)}
          >
            <div style={ui.headerRow}>
              <div style={ui.title}>Tutorial</div>
              <button
                onClick={() => setTutorialOpen(false)}
                style={ui.btnLight}
              >
                Hide
              </button>
            </div>
            <div style={ui.hintText} className="reactor-grid-gap-4">
              <div>Put atoms in reactor. Mix. See what you made.</div>
              <div>
                1. Put atoms in reactor. Click inside reactor to place (Mode
                menu: Place).
              </div>
              <div>
                2. Mix; Change temperature, bond strength, and reactor volume
                (Controls menu). Different conditions cause different molecules
                to form.
              </div>
              <div>
                3. See what you made (Catalogue menu). Molecules made in the
                reactor will automatically be added to your catalogue.
              </div>
            </div>
            {!hasEverLocalSave && !starterSeedUsed ? (
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  justifyItems: "center",
                }}
              >
                <button onClick={onTutorialGetStarted} style={ui.btnDark}>
                  Get Started: [O:4 H:8]
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div id="tutorial-show" style={ui.tutorialShow}>
            <button onClick={() => setTutorialOpen(true)} style={ui.btnLight}>
              Show Tutorial
            </button>
          </div>
        )}

        {/* Rectangle canvas: set explicit height */}
        {catalogueOpen ? (
          <div id="catalogue-overlay" style={ui.catalogue}>
            <div style={ui.headerRow}>
              <button
                onClick={() => setCatalogueOpen(false)}
                style={ui.titleBtn}
                title="Close Molecule Catalogue panel."
              >
                Molecule Catalogue
              </button>
              <div className="reactor-row-gap-8">
                <button
                  onClick={() => setCatalogueOpen(false)}
                  style={ui.btnLight}
                >
                  Hide
                </button>
              </div>
            </div>

            <div className="reactor-text-11-slate">
              {collectedIds.length}/{MOLECULE_CATALOG.length} catalogued (
              {collectionCompletionPct}%)
            </div>

            <div className="reactor-row-gap-6-wrap" style={{ marginTop: 8 }}>
              <button
                onClick={() => setCollectionFilter("all")}
                style={ui.pillBtn(collectionFilter === "all")}
              >
                All
              </button>
              <button
                onClick={() => setCollectionFilter("live")}
                style={ui.pillBtn(collectionFilter === "live")}
              >
                Live
              </button>
              <button
                onClick={() => setCollectionFilter("collected")}
                style={ui.pillBtn(collectionFilter === "collected")}
              >
                Catalogued
              </button>
              <button
                onClick={() => setCollectionFilter("todo")}
                style={ui.pillBtn(collectionFilter === "todo")}
              >
                To-do
              </button>
            </div>

            <div className="reactor-row-gap-8" style={{ marginTop: 8 }}>
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
                style={ui.btnLight}
              >
                Clear
              </button>
            </div>

            <div style={{ ...ui.row, marginTop: 8 }}>
              <div className="reactor-text-11-slate">
                {sortedCollection.length} shown
              </div>
              <div className="reactor-text-11-slate">
                Page {activeCollectionPage}/{collectionPageCount}
              </div>
            </div>

            <div className="reactor-row-gap-8" style={{ marginTop: 8 }}>
              <button
                style={ui.btnLight}
                onClick={() => setCollectionPage((p) => Math.max(1, p - 1))}
                disabled={activeCollectionPage <= 1}
              >
                Prev
              </button>
              <button
                style={ui.btnLight}
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
                overflowX: "hidden",
                border: "1px solid rgba(15,23,42,0.14)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.8)",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "74px 92px minmax(160px, 1fr) 124px 112px",
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
                  <span>Mol. wt. (g/mol)</span>
                  {sortArrowsFor("weight")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("status")}
                  className="reactor-sort-button"
                  title="Sort by status"
                >
                  <span>Status</span>
                  {sortArrowsFor("status")}
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
                const status = isLive ? "live" : isCollected ? "done" : "to-do";
                const number = catalogueNumberFromId(entry.id);
                const molecularWeight = molecularWeightById.get(entry.id);
                return (
                  <div
                    key={entry.id}
                    id={`catalogue-entry-${entry.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "74px 92px minmax(160px, 1fr) 124px 112px",
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
                    <span className="reactor-catalogue-number">
                      {Number.isFinite(number) ? `#${number}` : entry.id}
                    </span>
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
                    <div className="reactor-catalogue-status-wrap">
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          color: isSelectedLive
                            ? selectedPalette.status
                            : isLive
                              ? "#854d0e"
                              : isCollected
                                ? "#166534"
                                : "#334155",
                        }}
                      >
                        {status}
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
                      gridTemplateColumns:
                        "74px 92px minmax(160px, 1fr) 124px 112px",
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
          <div style={ui.catalogueShow}>
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
            <button onClick={() => setCatalogueOpen(true)} style={ui.btnLight}>
              Show catalogue
            </button>
          </div>
        )}

        <div style={ui.thermoShow}>
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
        <div style={ui.atomCountsShow}>
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
            {presentElementRows.map((row) => (
              <div key={`present-el-${row.el}`}>{`${row.count} ${row.el}`}</div>
            ))}
            <div>--</div>
            <div style={{ fontWeight: 900 }}>{liveElementTotal}</div>
          </div>
        </div>

        <div id="live-molecules-overlay" style={ui.liveHud}>
          <div style={ui.liveHudControls}>
            <button
              onClick={resetView}
              style={{
                ...ui.btnLight,
                pointerEvents: "auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Reset view
            </button>
            <button
              onClick={() =>
                protocolRunning
                  ? stopControlProtocol("stopped")
                  : setProtocolRunning(true)
              }
              style={{
                ...ui.btnLight,
                pointerEvents: "auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={
                protocolRunning
                  ? "Stop the currently running automation protocol."
                  : "Run the currently selected automation protocol."
              }
            >
              {protocolRunning
                ? "Stop automation protocol"
                : "Run automation protocol"}
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              style={{
                ...ui.btnDark,
                pointerEvents: "auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
          <div style={ui.liveHudBar}>
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
              <div style={{ ...ui.row, marginBottom: 8 }}>
                <div className="reactor-text-12-strong">
                  {expandedSnapshot.name}
                  {" ("}
                  {formulaWithSubscripts(expandedSnapshot.formula)}
                  {")"}
                </div>
                <button
                  onClick={() => setExpandedSnapshot(null)}
                  style={ui.btnLight}
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

function MiniSlider({ label, value, min, max, step, onChange, tooltip = "" }) {
  const format = () => {
    if (Number.isInteger(step)) return `${Math.round(value)}`;
    return value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 2);
  };

  return (
    <label style={{ display: "grid", gap: 4 }} title={tooltip}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#334155",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {format()}
        </span>
      </div>
      <input
        className="reactor-slider"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        title={tooltip}
        onChange={(e) =>
          onChange(
            step % 1 === 0
              ? parseInt(e.target.value, 10)
              : parseFloat(e.target.value),
          )
        }
      />
    </label>
  );
}

function normalizeAngleDeg(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function CombinedEnergyWells({ lj, cutoff }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");

    const W = c.width;
    const H = c.height;

    let rMin = 0.4;
    let rMax = Math.min(cutoff, 5.5);

    const N = 260;
    const curves = ELEMENTS.map((el) => {
      const { sigma, epsilon } = mixLorentzBerthelot(lj, el, el);
      const rrMin = Math.max(0.35, sigma * 0.65);
      const rrMax = Math.max(rrMin + 0.5, Math.min(rMax, sigma * 4.2));
      rMin = Math.min(rMin, rrMin);
      rMax = Math.max(rMax, rrMax);

      const xs = [];
      const ys = [];
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const r = rrMin + (rrMax - rrMin) * t;
        xs.push(r);
        ys.push(ljPotential(r, epsilon, sigma));
      }
      return { el, xs, ys };
    });

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const cur of curves) {
      for (const u of cur.ys) {
        yMin = Math.min(yMin, u);
        yMax = Math.max(yMax, u);
      }
    }
    const wallCap = Math.max(2.2, Math.abs(yMin) * 0.6);
    yMax = Math.min(yMax, wallCap);
    yMin = Math.max(yMin, -wallCap);

    const pad = 28;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const xToPx = (r) => pad + ((r - rMin) / (rMax - rMin)) * plotW;
    const yToPx = (u) => pad + (1 - (u - yMin) / (yMax - yMin)) * plotH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = pad + (plotH * i) / 4;
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
    }
    for (let i = 0; i <= 5; i++) {
      const x = pad + (plotW * i) / 5;
      ctx.moveTo(x, pad);
      ctx.lineTo(x, H - pad);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#0f172a";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("U(r)", 10, 10);
    ctx.textAlign = "right";
    ctx.fillText("r", W - 10, H - 16);

    const y0 = yToPx(0);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(W - pad, y0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const colors = {
      S: "#b45309",
      P: "#d97706",
      O: "#dc2626",
      N: "#2563eb",
      C: "#111827",
      H: "#334155",
    };

    for (const cur of curves) {
      ctx.strokeStyle = colors[cur.el] || "#0f172a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < cur.xs.length; i++) {
        const x = xToPx(cur.xs[i]);
        const y = yToPx(clamp(cur.ys[i], yMin, yMax));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // legend
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let lx = pad;
    let ly = pad - 12;
    for (const el of ELEMENTS) {
      ctx.fillStyle = colors[el] || "#0f172a";
      ctx.fillRect(lx, ly - 5, 10, 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(el, lx + 14, ly);
      lx += 42;
    }
  }, [lj, cutoff]);

  return (
    <canvas
      ref={canvasRef}
      width={390}
      height={180}
      style={{
        width: "100%",
        height: 180,
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.12)",
      }}
    />
  );
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
