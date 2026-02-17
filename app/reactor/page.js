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

const ELEMENTS = ["S", "P", "O", "N", "C", "H"];
const ELEMENT_NAMES = Object.freeze({
  S: "Sulfur",
  P: "Phosphorus",
  O: "Oxygen",
  N: "Nitrogen",
  C: "Carbon",
  H: "Hydrogen",
});
const ROOM_TEMP_K = 300;
const FIXED_CUTOFF = 4.2;
const DEFAULT_TEMPERATURE_K = 520;
const DEFAULT_DAMPING = 0.993;
const DEFAULT_BOND_SCALE = 3.5;
const DEFAULT_BOX_HALF_SIZE = 4.8;
const CATALOGUE_STORAGE_KEY = "reactor-molecule-catalogue-v1";
const LEGACY_COLLECTION_STORAGE_KEY = "reactor-molecule-collection-v1";
const COLLECTION_SCAN_INTERVAL_STEPS = 8;
const COLLECTION_PAGE_SIZE = 36;
const FIRST_DISCOVERY_CALLOUT_MS = 5200;
const FIRST_DISCOVERY_CALLOUT_FADE_MS = 1700;
const REACTOR_OVERLAY_LIGHT_TEXT = "#e2e8f0";
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

const CATALOG_ID_SET = new Set(MOLECULE_CATALOG.map((entry) => entry.id));

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
  const MAX_ATOMS = 240;

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

  // Kelvin 0..1000
  const [temperatureK, setTemperatureK] = useState(DEFAULT_TEMPERATURE_K);
  const [damping, setDamping] = useState(DEFAULT_DAMPING);
  const [bondScale, setBondScale] = useState(DEFAULT_BOND_SCALE);

  // box size (half-size)
  const [boxHalfSize, setBoxHalfSize] = useState(DEFAULT_BOX_HALF_SIZE);
  const [showBoxEdges, setShowBoxEdges] = useState(true);

  // per-element LJ
  const [lj, setLj] = useState(() => structuredClone(DEFAULT_LJ));

  // LJ editor element (separate from placement element)
  const [ljElement, setLjElement] = useState("C");

  // overlays (controls hidden by default for mobile friendliness)
  const [controlsOpen, setControlsOpen] = useState(false);
  const [wellsOpen, setWellsOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
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

  const canvasCardRef = useRef(null);
  const mountRef = useRef(null);
  const catalogueImportFileRef = useRef(null);
  const rafRef = useRef(null);
  const collectedSetRef = useRef(new Set());
  const liveMoleculeSummaryKeyRef = useRef("");
  const liveMatchedIdsKeyRef = useRef("");
  const liveBrightIdsKeyRef = useRef("");
  const liveHighlightKeyRef = useRef("");
  const discoveryGlowUntilRef = useRef(new Map());
  const liveAtomToCatalogIdRef = useRef(new Map());
  const hasLocalSaveOnLoadRef = useRef(false);
  const resetInProgressRef = useRef(false);
  const selectedLiveIdsRef = useRef(new Set());
  const selectedLiveIndexByIdRef = useRef(new Map());
  const selectedLivePaletteSlotByIdRef = useRef(new Map());
  const nextLivePaletteSlotRef = useRef(0);
  const discoveryCalloutsRef = useRef([]);
  const discoveryCalloutSeqRef = useRef(1);
  const liveHighlightAtomIdsRef = useRef(new Set());
  const liveHighlightBondKeysRef = useRef(new Set());

  const threeRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    raycaster: null,
    pointerNDC: new THREE.Vector2(),
    atomGroup: null,
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

  useEffect(() => {
    const valid = readSavedCatalogueIdsFromStorage();
    hasLocalSaveOnLoadRef.current = valid.length > 0;
    setCollectedIds(valid);
    setLastCataloguedId(valid.length > 0 ? valid[valid.length - 1] : null);
    if (valid.length > 0) {
      setTutorialOpen(false);
      setCatalogueOpen(true);
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
  }, [lj, temperatureK, damping, bondScale, allowMultipleBonds, boxHalfSize]);

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
        overflow: "hidden",
      },
      controls: {
        position: "absolute",
        left: 10,
        top: 10,
        width: 420,
        maxWidth: "min(420px, 92vw)",
        maxHeight: "calc(100% - 74px)",
        overflow: "auto",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
        padding: 10,
        pointerEvents: "auto",
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
      },
      headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 8,
      },
      title: { fontSize: 12, fontWeight: 950, color: "#0f172a" },

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
      },
      hintTitle: { fontSize: 11, fontWeight: 950, color: "#0f172a" },
      hintText: { fontSize: 11, color: "#475569", lineHeight: 1.35 },
      floatingShow: {
        position: "absolute",
        left: 10,
        top: 10,
        pointerEvents: "auto",
      },
      instructionsShow: {
        position: "absolute",
        right: 10,
        top: 10,
        pointerEvents: "auto",
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
      },
      tutorialShow: {
        position: "absolute",
        left: "50%",
        top: 10,
        transform: "translateX(-50%)",
        pointerEvents: "auto",
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
      },
      catalogueShow: {
        position: "absolute",
        right: 10,
        bottom: 58,
        display: "grid",
        justifyItems: "end",
        pointerEvents: "auto",
      },
      liveHud: {
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        minHeight: 40,
        pointerEvents: "none",
        zIndex: 150,
      },
      liveHudBar: {
        flex: 1,
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
    const size = 64;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const base = new THREE.Color(hex);
    const highlight = base.clone().lerp(new THREE.Color("#ffffff"), 0.45);
    const shadow = base.clone().lerp(new THREE.Color("#000000"), 0.45);
    const outline = new THREE.Color("#0f172a");

    const px = 2;
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
    ctx.font = "bold 14px ui-sans-serif, system-ui, -apple-system";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = label === "C" ? "#f8fafc" : "#0f172a";
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
      if (crossesBoundary) {
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
    three.bondGroup = bondGroup;
    three.bondMeshes = [];
    refreshBoxVisuals();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height)); // ✅ use container height too
      renderer.setSize(w, h, false);
      camera.aspect = w / h; // ✅ rectangle aspect
      camera.updateProjectionMatrix();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // default seed cluster starts lower for tutorial-first users; upper when catalogue opens from save
    const sim = simRef.current;
    clearSim3D(sim);
    const initialCounts = [
      ["O", 4],
      ["H", 8],
    ];
    const spawnInTopHalf = hasLocalSaveOnLoadRef.current;
    for (const [el, count] of initialCounts) {
      for (let i = 0; i < count; i++) {
        addAtom3D(
          sim,
          (Math.random() - 0.5) * 4,
          spawnInTopHalf
            ? 1.8 + (Math.random() - 0.5) * 2.0
            : -1.8 + (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 3,
          el,
          elements,
          MAX_ATOMS,
        );
      }
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
            scanCollectionProgress(simRef.current);
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

      syncBondCylinders();
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mount.removeChild(renderer.domElement);

      controls.dispose();
      renderer.dispose();

      for (const mat of three.spriteMaterials.values()) {
        mat.map?.dispose?.();
        mat.dispose?.();
      }
      three.spriteMaterials.clear();

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
        removeAtom3D(sim, id);
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

        addAtom3D(sim, p.x, p.y, p.z, placeElement, elements, MAX_ATOMS);
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
  ]);

  // actions
  function clearAll() {
    clearSim3D(simRef.current);
    setHoverLiveTooltip(null);
    scanCollectionProgress(simRef.current);
  }
  function shake() {
    nudgeAll(simRef.current, 1.8);
  }

  function spawnAtoms(count, mode = "selected") {
    const sim = simRef.current;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    for (let i = 0; i < n; i++) {
      const el =
        mode === "random"
          ? ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]
          : placeElement;
      addAtom3D(
        sim,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        el,
        elements,
        MAX_ATOMS,
      );
    }
    shake();
    scanCollectionProgress(sim);
  }

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
    setPaused(false);
    setTemperatureK(DEFAULT_TEMPERATURE_K);
    setDamping(DEFAULT_DAMPING);
    setBondScale(DEFAULT_BOND_SCALE);

    setBoxHalfSize(DEFAULT_BOX_HALF_SIZE);
    setShowBoxEdges(true);

    setShowBonds(true);
    setAllowMultipleBonds(true);

    // DO NOT change tool
    setPlaceElement("C");

    setLj(structuredClone(DEFAULT_LJ));
    setLjElement("C");

    // leave controlsOpen as-is (don’t force open on mobile)
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
          <span style={{ transform: "translateY(1px)" }}>↓</span>
        ) : null}
        {showUp ? (
          <span style={{ transform: "translateY(-1px)" }}>↑</span>
        ) : null}
      </span>
    );
  }

  const placeElementName = ELEMENT_NAMES[placeElement] || placeElement;

  const instructionText = useMemo(() => {
    if (tool === TOOL.ROTATE) {
      return {
        title: "View mode",
        lines: [
          "Drag: rotate view",
          "Scroll / pinch: zoom",
          "Right-drag / two-finger drag: pan",
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
        `Click empty space: place ${placeElement} atom`,
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
      `Click empty space: place ${placeElement} atom`,
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
          <div id="controls-overlay" style={ui.controls}>
            <div style={ui.headerRow}>
              <div style={ui.title}>Controls</div>
              <button
                onClick={() => setControlsOpen(false)}
                style={ui.btnLight}
              >
                Hide
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setPaused((p) => !p)} style={ui.btnDark}>
                  {paused ? "Resume" : "Pause"}
                </button>
                <button onClick={shake} style={ui.btnLight}>
                  Shake
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={resetAllControls} style={ui.btnLight}>
                  Reset all controls
                </button>
                <button onClick={resetView} style={ui.btnLight}>
                  Reset view
                </button>
              </div>
            </div>

            <div style={ui.section}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#0f172a" }}>
                Simulation
              </div>

              <MiniSlider
                label="Temp (K)"
                value={temperatureK}
                min={0}
                max={1400}
                step={10}
                onChange={setTemperatureK}
              />
              <MiniSlider
                label="Damping"
                value={damping}
                min={0.97}
                max={0.9995}
                step={0.001}
                onChange={setDamping}
              />
              <MiniSlider
                label="Bond strength"
                value={bondScale}
                min={0.2}
                max={4.0}
                step={0.05}
                onChange={setBondScale}
              />
              <MiniSlider
                label="Volume (box size)"
                value={boxHalfSize}
                min={2.5}
                max={12}
                step={0.1}
                onChange={setBoxHalfSize}
              />

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  View Box Edges
                </span>
                <input
                  type="checkbox"
                  checked={showBoxEdges}
                  onChange={(e) => setShowBoxEdges(e.target.checked)}
                />
              </label>

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  Visualize Bonds
                </span>
                <input
                  type="checkbox"
                  checked={showBonds}
                  onChange={(e) => setShowBonds(e.target.checked)}
                />
              </label>

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  Allow double/triple
                </span>
                <input
                  type="checkbox"
                  checked={allowMultipleBonds}
                  onChange={(e) => setAllowMultipleBonds(e.target.checked)}
                />
              </label>
            </div>

            <div style={ui.section}>
              <div style={ui.row}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{ fontSize: 11, fontWeight: 950, color: "#0f172a" }}
                  >
                    {wellsOpen ? "Nonbonded (LJ) for" : "Nonbonded (LJ)"}
                  </div>
                  {wellsOpen ? (
                    <select
                      value={ljElement}
                      onChange={(e) => setLjElement(e.target.value)}
                      style={ui.select}
                    >
                      {ELEMENTS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <button
                  onClick={() => setWellsOpen((s) => !s)}
                  style={ui.btnLight}
                >
                  {wellsOpen ? "Hide" : "Show"}
                </button>
              </div>

              {wellsOpen ? (
                <>
                  <MiniSlider
                    label="σ (distance)"
                    value={selectedSigma}
                    min={0.6}
                    max={2.3}
                    step={0.02}
                    onChange={(v) => updateSelectedLJ("sigma", v)}
                  />
                  <MiniSlider
                    label="ε (stickiness)"
                    value={selectedEpsilon}
                    min={0.0}
                    max={2.4}
                    step={0.05}
                    onChange={(v) => updateSelectedLJ("epsilon", v)}
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
              <div style={ui.title}>Mode</div>
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
                    >
                      Place element
                    </span>
                    <select
                      value={placeElement}
                      onChange={(e) => setPlaceElement(e.target.value)}
                      style={ui.select}
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
                      gap: 8,
                      justifyItems: "center",
                    }}
                  >
                    <button
                      onClick={() => spawnAtoms(1, "selected")}
                      style={ui.btnLight}
                    >
                      {`Spawn 1 ${placeElementName}`}
                    </button>
                    <button
                      onClick={() => spawnAtoms(5, "selected")}
                      style={ui.btnLight}
                    >
                      {`Spawn 5 ${placeElementName}`}
                    </button>
                    <button
                      onClick={() => spawnAtoms(10, "selected")}
                      style={ui.btnLight}
                    >
                      {`Spawn 10 ${placeElementName}`}
                    </button>
                    <button
                      onClick={() => spawnAtoms(10, "random")}
                      style={ui.btnLight}
                    >
                      Spawn 10 Random
                    </button>
                  </div>
                </>
              ) : null}

              {tool === TOOL.DELETE ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    justifyItems: "center",
                  }}
                >
                  <button onClick={clearAll} style={ui.btnLight}>
                    Clear all atoms
                  </button>
                </div>
              ) : null}

              {tool === TOOL.SAVE ? (
                <>
                  <input
                    ref={catalogueImportFileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={importEncryptedCatalogue}
                  />
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      justifyItems: "center",
                    }}
                  >
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
                  <div style={{ fontSize: 10, color: "#475569" }}>
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
          <div id="tutorial-overlay" style={ui.tutorial}>
            <div style={ui.headerRow}>
              <div style={ui.title}>Tutorial</div>
              <button
                onClick={() => setTutorialOpen(false)}
                style={ui.btnLight}
              >
                Hide
              </button>
            </div>
            <div style={{ ...ui.hintText, display: "grid", gap: 4 }}>
              <div>
                1. Put elements into reactor (click inside reactor or Spawn).
              </div>
              <div>
                3. Change temperature, bond strength, and reactor volume in
                Controls. Different conditions cause different molecules to
                form.
              </div>
              <div>4. Open Molecule Catalogue to see discovered molecules.</div>
              <div>5. Goal: make all the molecules in the catalogue.</div>
            </div>
          </div>
        ) : (
          <div id="tutorial-show" style={ui.tutorialShow}>
            <button onClick={() => setTutorialOpen(true)} style={ui.btnLight}>
              Show Tutorial
            </button>
          </div>
        )}

        {/* ✅ Rectangle canvas: set explicit height */}
        {catalogueOpen ? (
          <div id="catalogue-overlay" style={ui.catalogue}>
            <div style={ui.headerRow}>
              <div style={ui.title}>Molecule Catalogue</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setCatalogueOpen(false)}
                  style={ui.btnLight}
                >
                  Hide
                </button>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#334155" }}>
              {collectedIds.length}/{MOLECULE_CATALOG.length} catalogued (
              {collectionCompletionPct}%)
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
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

            <input
              value={collectionQuery}
              onChange={(e) => setCollectionQuery(e.target.value)}
              placeholder="Search id/name/formula"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.16)",
                background: "rgba(255,255,255,0.94)",
                color: "#0f172a",
                fontSize: 12,
                fontWeight: 700,
                marginTop: 8,
              }}
            />

            <div style={{ ...ui.row, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#334155" }}>
                {sortedCollection.length} shown
              </div>
              <div style={{ fontSize: 11, color: "#334155" }}>
                Page {activeCollectionPage}/{collectionPageCount}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    justifySelf: "start",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#334155",
                  }}
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
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    justifySelf: "start",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#334155",
                  }}
                  title="Sort by name"
                >
                  <span>Name/Formula</span>
                  {sortArrowsFor("name")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("weight")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    justifySelf: "start",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#334155",
                  }}
                  title="Sort by molecular weight"
                >
                  <span>Mol. wt. (g/mol)</span>
                  {sortArrowsFor("weight")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollectionSort("status")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    justifySelf: "start",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#334155",
                  }}
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
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#334155",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Number.isFinite(number) ? `#${number}` : entry.id}
                    </span>
                    <MoleculeBallStickPreview
                      structure={entry.structure}
                      formula={entry.formula}
                      onExpand={() => {
                        setExpandedAngles({ x: 0, y: 0, z: 0 });
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
                    <span
                      style={{
                        fontSize: 11,
                        color: "#0f172a",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      {Number.isFinite(molecularWeight)
                        ? `${Math.round(molecularWeight)}`
                        : "--"}
                    </span>
                    <div
                      style={{
                        display: "grid",
                        gap: 2,
                        alignItems: "center",
                        justifyItems: "center",
                        textAlign: "center",
                        minWidth: 0,
                      }}
                    >
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

        <div id="live-molecules-overlay" style={ui.liveHud}>
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              ...ui.btnDark,
              pointerEvents: "auto",
              alignSelf: "stretch",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <div style={ui.liveHudBar}>
            <span style={{ fontSize: 11, color: "#334155", fontWeight: 900 }}>
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
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 3000,
              background: "rgba(15,23,42,0.56)",
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(95vw, 980px)",
                borderRadius: 14,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(248,250,252,0.98)",
                boxShadow: "0 20px 44px rgba(15,23,42,0.45)",
                padding: 12,
              }}
            >
              <div style={{ ...ui.row, marginBottom: 8 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
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
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  padding: "8px 4px 4px",
                }}
              >
                <div
                  style={{
                    width: "min(1080px, 100%)",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(230px, 340px)",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(15,23,42,0.15)",
                      background: "rgba(255,255,255,0.92)",
                      padding: 8,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "100 / 64",
                      }}
                    >
                      <MoleculeRotatingPreview
                        structure={expandedSnapshot.structure}
                        formula={expandedSnapshot.formula}
                        width="100%"
                        height="100%"
                        xDeg={expandedAngles.x}
                        yDeg={expandedAngles.y}
                        zDeg={expandedAngles.z}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(15,23,42,0.15)",
                      background: "rgba(248,250,252,0.92)",
                      backdropFilter: "blur(3px)",
                      padding: 8,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <AxisCompassIndicator />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr)",
                        gap: 8,
                      }}
                    >
                      <AxisCompactSlider
                        axisLabel="X degrees"
                        value={expandedAngles.x}
                        onChange={(v) =>
                          setExpandedAngles((prev) => ({
                            ...prev,
                            x: Number(v),
                          }))
                        }
                      />
                      <AxisCompactSlider
                        axisLabel="Y degrees"
                        value={expandedAngles.y}
                        onChange={(v) =>
                          setExpandedAngles((prev) => ({
                            ...prev,
                            y: Number(v),
                          }))
                        }
                      />
                      <AxisCompactSlider
                        axisLabel="Z degrees"
                        value={expandedAngles.z}
                        onChange={(v) =>
                          setExpandedAngles((prev) => ({
                            ...prev,
                            z: Number(v),
                          }))
                        }
                      />
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
            width: "100%",
            height: "min(660px, 72vh)", // smaller vertically so you can see everything
            minHeight: 320,
          }}
        />
      </div>
    </section>
  );
}

function MiniSlider({ label, value, min, max, step, onChange }) {
  const format = () => {
    if (Number.isInteger(step)) return `${Math.round(value)}`;
    return value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 2);
  };

  return (
    <label style={{ display: "grid", gap: 4 }}>
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
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
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

function AxisCompactSlider({ axisLabel, value, onChange }) {
  const deg = normalizeAngleDeg(value);
  return (
    <label style={{ display: "grid", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: "#334155" }}>
        {axisLabel}
      </div>
      <input
        type="range"
        value={deg}
        min={0}
        max={355}
        step={5}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div
        style={{
          fontSize: 10,
          color: "#0f172a",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 800,
          textAlign: "right",
        }}
      >
        {Math.round(deg)}
        {" deg"}
      </div>
    </label>
  );
}

function AxisCompassIndicator() {
  return (
    <div style={{ display: "grid", placeItems: "center", paddingTop: 2 }}>
      <svg viewBox="0 0 180 74" width="100%" height={74}>
        <g opacity={0.82}>
          <line
            x1={42}
            y1={52}
            x2={80}
            y2={52}
            stroke="#475569"
            strokeWidth={1.8}
          />
          <polygon points="80,52 74,48.8 74,55.2" fill="#475569" />
          <text
            x={85}
            y={55}
            style={{ fontSize: 14, fontWeight: 900, fill: "#475569" }}
          >
            x
          </text>

          <line
            x1={42}
            y1={52}
            x2={42}
            y2={24}
            stroke="#475569"
            strokeWidth={1.8}
          />
          <polygon points="42,24 38.8,30 45.2,30" fill="#475569" />
          <text
            x={47}
            y={29}
            style={{ fontSize: 14, fontWeight: 900, fill: "#475569" }}
          >
            y
          </text>

          <circle
            cx={27}
            cy={60}
            r={6}
            fill="none"
            stroke="#475569"
            strokeWidth={1.6}
          />
          <circle cx={27} cy={60} r={2} fill="#475569" />
          <text
            x={36}
            y={64}
            style={{ fontSize: 14, fontWeight: 900, fill: "#475569" }}
          >
            z
          </text>
        </g>
      </svg>
    </div>
  );
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

const PREVIEW_ELEMENT_COLORS = {
  H: "#f1f5f9",
  C: "#111827",
  N: "#3b82f6",
  O: "#ef4444",
  P: "#f59e0b",
  S: "#facc15",
};

const PREVIEW_LABEL_COLORS = {
  H: "#0f172a",
  C: "#f8fafc",
  N: "#f8fafc",
  O: "#f8fafc",
  P: "#0f172a",
  S: "#0f172a",
};

const ATOMIC_WEIGHTS = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  P: 30.974,
  S: 32.06,
};

function computeMolecularWeight(structure) {
  const parsed = normalizeStructure(structure);
  if (!parsed) return NaN;
  let total = 0;
  for (const atom of parsed.atoms) {
    total += ATOMIC_WEIGHTS[atom.el] ?? 0;
  }
  return total;
}

function catalogueNumberFromId(id) {
  if (typeof id !== "string") return NaN;
  const m = id.match(/(\d+)$/);
  if (!m) return NaN;
  return Number.parseInt(m[1], 10);
}

function formulaWithSubscripts(formula) {
  const raw = String(formula || "");
  if (!raw) return "";
  const tokens = raw.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) || [raw];
  return tokens.map((token, idx) => {
    if (/^\d+$/.test(token)) {
      return (
        <sub key={`n-${idx}`} style={{ fontSize: "0.8em", lineHeight: 1 }}>
          {token}
        </sub>
      );
    }
    return <React.Fragment key={`t-${idx}`}>{token}</React.Fragment>;
  });
}

function CatalogueNameCell({ name, formula }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>
        {name}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#475569" }}>
        {formulaWithSubscripts(formula)}
      </span>
    </div>
  );
}

function normalizeStructure(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.atoms) || raw.atoms.length <= 0) return null;

  const atoms = raw.atoms.map((atom) => ({
    el: typeof atom?.el === "string" ? atom.el : "C",
  }));

  const bondsIn = Array.isArray(raw.bonds) ? raw.bonds : [];
  const seen = new Set();
  const bonds = [];

  for (const bond of bondsIn) {
    const a = Number.isFinite(bond?.a) ? Math.floor(bond.a) : -1;
    const b = Number.isFinite(bond?.b) ? Math.floor(bond.b) : -1;
    if (a < 0 || b < 0 || a >= atoms.length || b >= atoms.length || a === b)
      continue;
    const orderRaw = Number.isFinite(bond?.order) ? Math.round(bond.order) : 1;
    const order = clamp(orderRaw, 1, 3);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bonds.push({ a: lo, b: hi, order });
  }

  return { atoms, bonds };
}

function segmentOrientation(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(a1, a2, b1, b2) {
  const eps = 1e-6;
  const o1 = segmentOrientation(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const o2 = segmentOrientation(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  const o3 = segmentOrientation(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const o4 = segmentOrientation(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  return o1 * o2 < -eps && o3 * o4 < -eps;
}

function countLayoutCrossings(nodes, bonds) {
  let count = 0;
  for (let i = 0; i < bonds.length; i += 1) {
    const e1 = bonds[i];
    for (let j = i + 1; j < bonds.length; j += 1) {
      const e2 = bonds[j];
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) {
        continue;
      }
      if (segmentsCross(nodes[e1.a], nodes[e1.b], nodes[e2.a], nodes[e2.b]))
        count += 1;
    }
  }
  return count;
}

function applyCrossingRepulsion(nodes, bonds, fx, fy, cool) {
  for (let i = 0; i < bonds.length; i += 1) {
    const e1 = bonds[i];
    for (let j = i + 1; j < bonds.length; j += 1) {
      const e2 = bonds[j];
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) {
        continue;
      }
      const a = nodes[e1.a];
      const b = nodes[e1.b];
      const c = nodes[e2.a];
      const d = nodes[e2.b];
      if (!segmentsCross(a, b, c, d)) continue;

      const k = 0.18 * cool;
      const d1x = b.x - a.x;
      const d1y = b.y - a.y;
      const l1 = Math.hypot(d1x, d1y) + 1e-6;
      const p1x = -d1y / l1;
      const p1y = d1x / l1;

      const d2x = d.x - c.x;
      const d2y = d.y - c.y;
      const l2 = Math.hypot(d2x, d2y) + 1e-6;
      const p2x = -d2y / l2;
      const p2y = d2x / l2;

      const m1x = (a.x + b.x) * 0.5;
      const m1y = (a.y + b.y) * 0.5;
      const m2x = (c.x + d.x) * 0.5;
      const m2y = (c.y + d.y) * 0.5;

      const sign1 = Math.sign((m2x - m1x) * p1x + (m2y - m1y) * p1y) || 1;
      const sign2 = Math.sign((m1x - m2x) * p2x + (m1y - m2y) * p2y) || 1;

      fx[e1.a] -= sign1 * p1x * k;
      fy[e1.a] -= sign1 * p1y * k;
      fx[e1.b] -= sign1 * p1x * k;
      fy[e1.b] -= sign1 * p1y * k;

      fx[e2.a] -= sign2 * p2x * k;
      fy[e2.a] -= sign2 * p2y * k;
      fx[e2.b] -= sign2 * p2x * k;
      fy[e2.b] -= sign2 * p2y * k;
    }
  }
}

function atomVisualRadius(el) {
  const fromDefs = DEFAULT_ELEMENTS_3D[el]?.radius ?? 0.46;
  return 2.6 + fromDefs * 6.1;
}

function buildBallStickLayout(structure, orientationIndex = 0) {
  const parsed = normalizeStructure(structure);
  if (!parsed) return null;

  const { atoms, bonds } = parsed;
  const n = atoms.length;
  const makeAttempt = (attemptSeed) => {
    const phase = (attemptSeed * Math.PI) / 4.3;
    const flip = Math.floor(attemptSeed) % 2 === 0 ? 1 : -1;
    const nodes = atoms.map((atom, idx) => {
      if (n === 1) return { idx, el: atom.el, x: 0, y: 0 };
      const theta = (2 * Math.PI * idx) / Math.max(3, n) + phase;
      const radial = atom.el === "H" ? 0.68 : 1.1;
      return {
        idx,
        el: atom.el,
        x: Math.cos(theta) * radial,
        y: Math.sin(theta) * radial * flip,
      };
    });

    const damp = 0.84;
    const vx = Array.from({ length: n }, () => 0);
    const vy = Array.from({ length: n }, () => 0);

    for (let iter = 0; iter < 220; iter += 1) {
      const fx = Array.from({ length: n }, () => 0);
      const fy = Array.from({ length: n }, () => 0);
      const cool = 1 - iter / 245;

      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const d2 = dx * dx + dy * dy + 1e-4;
          const d = Math.sqrt(d2);
          const isHPair = atoms[i].el === "H" && atoms[j].el === "H";
          const rep = (isHPair ? 0.04 : 0.085) / d2;
          const ux = dx / d;
          const uy = dy / d;
          fx[i] -= rep * ux;
          fy[i] -= rep * uy;
          fx[j] += rep * ux;
          fy[j] += rep * uy;
        }
      }

      for (const bond of bonds) {
        const a = bond.a;
        const b = bond.b;
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const hasH = atoms[a].el === "H" || atoms[b].el === "H";
        const target = hasH
          ? 0.56
          : bond.order >= 3
            ? 0.62
            : bond.order === 2
              ? 0.7
              : 0.8;
        const k = hasH ? 0.32 : 0.18;
        const pull = k * (d - target);
        const ux = dx / d;
        const uy = dy / d;
        fx[a] += pull * ux;
        fy[a] += pull * uy;
        fx[b] -= pull * ux;
        fy[b] -= pull * uy;
      }

      // Penalize line intersections to avoid "X" bonds in snapshots.
      applyCrossingRepulsion(nodes, bonds, fx, fy, cool);

      for (let i = 0; i < n; i += 1) {
        fx[i] += -nodes[i].x * 0.04;
        fy[i] += -nodes[i].y * 0.04;
      }

      for (let i = 0; i < n; i += 1) {
        vx[i] = vx[i] * damp + fx[i] * 0.15 * cool;
        vy[i] = vy[i] * damp + fy[i] * 0.15 * cool;
        nodes[i].x += vx[i];
        nodes[i].y += vy[i];
      }
    }

    return nodes;
  };

  const tryCount = n <= 6 ? 10 : 8;
  const baseSeed = Number.isFinite(orientationIndex)
    ? Math.max(0, orientationIndex) * 0.73
    : 0;
  const candidates = [];

  for (let t = 0; t < tryCount; t += 1) {
    const nodes = makeAttempt(baseSeed + t);
    const crossings = countLayoutCrossings(nodes, bonds);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    const area = (maxX - minX) * (maxY - minY);
    candidates.push({ nodes, crossings, area });
  }

  candidates.sort((a, b) => {
    if (a.crossings !== b.crossings) return a.crossings - b.crossings;
    return a.area - b.area;
  });

  const candidateRank = clamp(
    Math.floor(orientationIndex),
    0,
    candidates.length - 1,
  );
  const nodes =
    candidates[candidateRank]?.nodes ||
    candidates[0]?.nodes ||
    makeAttempt(baseSeed);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  const spanX = Math.max(0.2, maxX - minX);
  const spanY = Math.max(0.2, maxY - minY);
  const maxRadius = Math.max(...atoms.map((a) => atomVisualRadius(a.el)));
  const scale = Math.min(
    (78 - maxRadius * 1.4) / spanX,
    (44 - maxRadius * 1.4) / spanY,
  );
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  for (const node of nodes) {
    node.x = 50 + (node.x - cx) * Math.max(6, scale);
    node.y = 32 + (node.y - cy) * Math.max(6, scale);
  }

  return { nodes, bonds };
}

function bondOffsets(order) {
  if (order <= 1) return [0];
  if (order === 2) return [-1.15, 1.15];
  return [-1.85, 0, 1.85];
}

function MoleculeBallStickPreview({
  structure,
  formula,
  width = 84,
  height = 48,
  onExpand = null,
  orientation = 0,
}) {
  const layout = useMemo(
    () => buildBallStickLayout(structure, orientation),
    [structure, orientation],
  );
  if (!layout) {
    return (
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>
        {formula}
      </div>
    );
  }

  const svg = (
    <svg
      viewBox="0 0 100 64"
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      style={{
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 8,
        background: "rgba(255,255,255,0.92)",
      }}
    >
      {layout.bonds.map((bond, idx) => {
        const a = layout.nodes[bond.a];
        const b = layout.nodes[bond.b];
        const aEl = layout.nodes[bond.a].el;
        const bEl = layout.nodes[bond.b].el;
        const aR = atomVisualRadius(aEl);
        const bR = atomVisualRadius(bEl);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const sx = a.x + (dx / len) * (aR * 0.75);
        const sy = a.y + (dy / len) * (aR * 0.75);
        const ex = b.x - (dx / len) * (bR * 0.75);
        const ey = b.y - (dy / len) * (bR * 0.75);

        return bondOffsets(bond.order).map((off, segIdx) => (
          <line
            key={`${idx}-${segIdx}`}
            x1={sx + px * off}
            y1={sy + py * off}
            x2={ex + px * off}
            y2={ey + py * off}
            stroke="#0f172a"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ));
      })}

      {layout.nodes.map((node, idx) => {
        const fill = PREVIEW_ELEMENT_COLORS[node.el] || "#94a3b8";
        const labelFill = PREVIEW_LABEL_COLORS[node.el] || "#0f172a";
        const r = atomVisualRadius(node.el);
        return (
          <g key={idx}>
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={fill}
              stroke="#0f172a"
              strokeWidth={0.85}
            />
            <circle
              cx={node.x - r * 0.38}
              cy={node.y - r * 0.38}
              r={Math.max(0.9, r * 0.38)}
              fill="rgba(255,255,255,0.35)"
            />
            <text
              x={node.x}
              y={node.y + 2.2}
              textAnchor="middle"
              style={{
                fontSize: node.el === "H" ? 5.8 : 6.4,
                fontWeight: 900,
                fill: labelFill,
                paintOrder: "stroke",
                stroke: "rgba(255,255,255,0.38)",
                strokeWidth: 1.4,
                userSelect: "none",
              }}
            >
              {node.el}
            </text>
          </g>
        );
      })}

      <text
        x={4}
        y={61}
        textAnchor="start"
        style={{
          fontSize: 7.2,
          fontWeight: 800,
          fill: "#334155",
          userSelect: "none",
        }}
      >
        {formula}
      </text>
    </svg>
  );

  if (!onExpand) return svg;

  return (
    <button
      type="button"
      onClick={onExpand}
      style={{
        padding: 0,
        border: 0,
        background: "transparent",
        lineHeight: 0,
        cursor: "zoom-in",
      }}
      title="Expand snapshot"
    >
      {svg}
    </button>
  );
}

function rotateXYZ(point, ax, ay, az) {
  const cosX = Math.cos(ax);
  const sinX = Math.sin(ax);
  const cosY = Math.cos(ay);
  const sinY = Math.sin(ay);
  const cosZ = Math.cos(az);
  const sinZ = Math.sin(az);

  const x0 = point.x;
  const y0 = point.y * cosX - point.z * sinX;
  const z0 = point.y * sinX + point.z * cosX;

  const x1 = x0 * cosY + z0 * sinY;
  const y1 = y0;
  const z1 = -x0 * sinY + z0 * cosY;

  return {
    x: x1 * cosZ - y1 * sinZ,
    y: x1 * sinZ + y1 * cosZ,
    z: z1,
  };
}

function buildBallStickLayout3D(structure) {
  const parsed = normalizeStructure(structure);
  if (!parsed) return null;

  const { atoms, bonds } = parsed;
  const n = atoms.length;
  const nodes = atoms.map((atom, idx) => {
    if (n <= 1) return { idx, el: atom.el, x: 0, y: 0, z: 0 };
    const t = (idx + 0.5) / n;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (3 - Math.sqrt(5)) * idx;
    const radial = atom.el === "H" ? 0.9 : 1.22;
    return {
      idx,
      el: atom.el,
      x: radial * Math.sin(phi) * Math.cos(theta),
      y: radial * Math.sin(phi) * Math.sin(theta),
      z: radial * Math.cos(phi),
    };
  });

  const vx = Array.from({ length: n }, () => 0);
  const vy = Array.from({ length: n }, () => 0);
  const vz = Array.from({ length: n }, () => 0);
  const damp = 0.86;

  for (let iter = 0; iter < 280; iter += 1) {
    const fx = Array.from({ length: n }, () => 0);
    const fy = Array.from({ length: n }, () => 0);
    const fz = Array.from({ length: n }, () => 0);
    const cool = 1 - iter / 320;

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dz = nodes[j].z - nodes[i].z;
        const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
        const d = Math.sqrt(d2);
        const isHPair = atoms[i].el === "H" && atoms[j].el === "H";
        const rep = (isHPair ? 0.03 : 0.06) / d2;
        const ux = dx / d;
        const uy = dy / d;
        const uz = dz / d;
        fx[i] -= rep * ux;
        fy[i] -= rep * uy;
        fz[i] -= rep * uz;
        fx[j] += rep * ux;
        fy[j] += rep * uy;
        fz[j] += rep * uz;
      }
    }

    for (const bond of bonds) {
      const a = bond.a;
      const b = bond.b;
      const dx = nodes[b].x - nodes[a].x;
      const dy = nodes[b].y - nodes[a].y;
      const dz = nodes[b].z - nodes[a].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const hasH = atoms[a].el === "H" || atoms[b].el === "H";
      const target = hasH
        ? 0.84
        : bond.order >= 3
          ? 0.94
          : bond.order === 2
            ? 1.02
            : 1.1;
      const k = hasH ? 0.34 : 0.2;
      const pull = k * (d - target);
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      fx[a] += pull * ux;
      fy[a] += pull * uy;
      fz[a] += pull * uz;
      fx[b] -= pull * ux;
      fy[b] -= pull * uy;
      fz[b] -= pull * uz;
    }

    for (let i = 0; i < n; i += 1) {
      fx[i] += -nodes[i].x * 0.06;
      fy[i] += -nodes[i].y * 0.06;
      fz[i] += -nodes[i].z * 0.06;
    }

    for (let i = 0; i < n; i += 1) {
      vx[i] = vx[i] * damp + fx[i] * 0.14 * cool;
      vy[i] = vy[i] * damp + fy[i] * 0.14 * cool;
      vz[i] = vz[i] * damp + fz[i] * 0.14 * cool;
      nodes[i].x += vx[i];
      nodes[i].y += vy[i];
      nodes[i].z += vz[i];
    }
  }

  let maxNorm = 0;
  for (const node of nodes) {
    maxNorm = Math.max(maxNorm, Math.hypot(node.x, node.y, node.z));
  }
  const inv = maxNorm > 1e-5 ? 1.25 / maxNorm : 1;
  for (const node of nodes) {
    node.x *= inv;
    node.y *= inv;
    node.z *= inv;
  }

  return { nodes, bonds };
}

function projectBallStick3D(layout3d, ax, ay, az) {
  if (!layout3d) return null;
  const rotated = layout3d.nodes.map((n) => ({
    ...n,
    ...rotateXYZ(n, ax, ay, az),
  }));
  const maxXY = Math.max(
    0.25,
    ...rotated.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y))),
  );
  const baseScale = 23 / maxXY;

  const nodes2d = rotated.map((n) => {
    const depthFactor = clamp(1 + n.z * 0.2, 0.7, 1.35);
    return {
      idx: n.idx,
      el: n.el,
      x: 50 + n.x * baseScale,
      y: 32 - n.y * baseScale,
      z: n.z,
      depthFactor,
      r: atomVisualRadius(n.el) * depthFactor,
    };
  });

  const bonds = layout3d.bonds
    .map((bond) => ({
      ...bond,
      depth: (nodes2d[bond.a].z + nodes2d[bond.b].z) * 0.5,
    }))
    .sort((a, b) => a.depth - b.depth);

  const atomOrder = nodes2d
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((n) => n.idx);

  return { nodes2d, bonds, atomOrder };
}

function MoleculeRotatingPreview({
  structure,
  formula,
  width = 560,
  height = 340,
  xDeg = 0,
  yDeg = 0,
  zDeg = 0,
}) {
  const layout3d = useMemo(
    () => buildBallStickLayout3D(structure),
    [structure],
  );
  const ax = (Number(xDeg) * Math.PI) / 180;
  const ay = (Number(yDeg) * Math.PI) / 180;
  const az = (Number(zDeg) * Math.PI) / 180;

  const projected = useMemo(
    () => projectBallStick3D(layout3d, ax, ay, az),
    [layout3d, ax, ay, az],
  );

  if (!projected) {
    return (
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>
        {formula}
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 64"
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      style={{
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 10,
        background: "rgba(255,255,255,0.95)",
      }}
    >
      {projected.bonds.map((bond, idx) => {
        const a = projected.nodes2d[bond.a];
        const b = projected.nodes2d[bond.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const sx = a.x + (dx / len) * (a.r * 0.74);
        const sy = a.y + (dy / len) * (a.r * 0.74);
        const ex = b.x - (dx / len) * (b.r * 0.74);
        const ey = b.y - (dy / len) * (b.r * 0.74);
        const wScale = clamp((a.depthFactor + b.depthFactor) * 0.5, 0.8, 1.4);

        return bondOffsets(bond.order).map((off, segIdx) => (
          <line
            key={`${idx}-${segIdx}`}
            x1={sx + px * off}
            y1={sy + py * off}
            x2={ex + px * off}
            y2={ey + py * off}
            stroke="#0f172a"
            strokeOpacity={0.9}
            strokeWidth={1.25 * wScale}
            strokeLinecap="round"
          />
        ));
      })}

      {projected.atomOrder.map((nodeIdx) => {
        const node = projected.nodes2d[nodeIdx];
        const fill = PREVIEW_ELEMENT_COLORS[node.el] || "#94a3b8";
        const labelFill = PREVIEW_LABEL_COLORS[node.el] || "#0f172a";
        return (
          <g key={nodeIdx}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={fill}
              stroke="#0f172a"
              strokeWidth={0.9}
            />
            <circle
              cx={node.x - node.r * 0.35}
              cy={node.y - node.r * 0.35}
              r={Math.max(0.9, node.r * 0.34)}
              fill="rgba(255,255,255,0.34)"
            />
            <text
              x={node.x}
              y={node.y + 2.3}
              textAnchor="middle"
              style={{
                fontSize: node.el === "H" ? 5.6 : 6.3,
                fontWeight: 900,
                fill: labelFill,
                paintOrder: "stroke",
                stroke: "rgba(255,255,255,0.35)",
                strokeWidth: 1.4,
                userSelect: "none",
              }}
            >
              {node.el}
            </text>
          </g>
        );
      })}

      <text
        x={4}
        y={61}
        textAnchor="start"
        style={{
          fontSize: 7.2,
          fontWeight: 800,
          fill: "#334155",
          userSelect: "none",
        }}
      >
        {formula}
      </text>
    </svg>
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
