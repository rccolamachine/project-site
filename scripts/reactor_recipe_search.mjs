import fs from "node:fs";
import path from "node:path";
import { analyzeMoleculeComponents } from "../lib/reactor/moleculeTools.mjs";
import {
  DEFAULT_CHARGES,
  DEFAULT_ELEMENTS_3D,
  DEFAULT_LJ,
  addAtom3D,
  clearSim3D,
  createSim3D,
  nudgeAll,
  stepSim3D,
} from "../lib/sim/physics3d.ts";

const ELEMENTS = ["S", "P", "O", "N", "C", "H"];
const ROOM_TEMP_K = 300;
const FIXED_CUTOFF = 4.2;
const MOLECULE_CATALOG = JSON.parse(
  fs.readFileSync(path.resolve("data/reactor_molecules.json"), "utf8"),
);
const DEFAULTS = Object.freeze({
  temperatureK: 420,
  damping: 0.992,
  bondScale: 3.2,
  boxHalfSize: 6.2,
});
const DT = 1 / 60;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function withSeed(seed, fn) {
  const prevRandom = Math.random;
  const seeded = createRng(seed);
  Math.random = seeded;
  try {
    return fn(seeded);
  } finally {
    Math.random = prevRandom;
  }
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq < 0) {
      out[token.slice(2)] = true;
    } else {
      out[token.slice(2, eq)] = token.slice(eq + 1);
    }
  }
  return out;
}

function readIntArg(args, key, fallback) {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readFloatArg(args, key, fallback) {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function elementCountsFromStructure(structure) {
  const out = { S: 0, P: 0, O: 0, N: 0, C: 0, H: 0 };
  const atoms = Array.isArray(structure?.atoms) ? structure.atoms : [];
  for (const atom of atoms) {
    const el = atom?.el;
    if (el && Object.prototype.hasOwnProperty.call(out, el)) out[el] += 1;
  }
  return out;
}

function totalAtoms(counts) {
  let n = 0;
  for (const el of ELEMENTS) n += counts[el] || 0;
  return n;
}

function scaleCounts(counts, scale) {
  const out = { S: 0, P: 0, O: 0, N: 0, C: 0, H: 0 };
  for (const el of ELEMENTS) out[el] = Math.max(0, Math.round((counts[el] || 0) * scale));
  return out;
}

function cloneCounts(counts) {
  return {
    S: counts.S || 0,
    P: counts.P || 0,
    O: counts.O || 0,
    N: counts.N || 0,
    C: counts.C || 0,
    H: counts.H || 0,
  };
}

function countsKey(counts) {
  return ELEMENTS.map((el) => `${el}${counts[el] || 0}`).join("-");
}

function sanitizeCounts(counts) {
  const out = { S: 0, P: 0, O: 0, N: 0, C: 0, H: 0 };
  for (const el of ELEMENTS) {
    const v = Number(counts?.[el] || 0);
    out[el] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  return out;
}

function fitCountsToBudget(counts, budget) {
  const out = sanitizeCounts(counts);
  const cap = Math.max(0, Math.floor(budget || 0));
  let total = totalAtoms(out);
  if (total <= cap) return out;
  if (cap <= 0) return { S: 0, P: 0, O: 0, N: 0, C: 0, H: 0 };

  const scale = cap / Math.max(1, total);
  for (const el of ELEMENTS) out[el] = Math.max(0, Math.floor(out[el] * scale));
  total = totalAtoms(out);

  const trimOrder = ["H", "C", "N", "O", "P", "S"];
  while (total > cap) {
    let changed = false;
    for (const el of trimOrder) {
      if (out[el] > 0) {
        out[el] -= 1;
        total -= 1;
        changed = true;
        if (total <= cap) break;
      }
    }
    if (!changed) break;
  }
  return out;
}

function normalizeControls(setting) {
  return {
    temperatureK: clamp(Number(setting.temperatureK), 50, 1400),
    damping: clamp(Number(setting.damping), 0.97, 0.9995),
    bondScale: clamp(Number(setting.bondScale), 2.0, 5.8),
    boxHalfSize: clamp(Number(setting.boxHalfSize), 3.8, 10.0),
  };
}

function buildParams(setting) {
  const controls = normalizeControls(setting);
  const temperatureK = controls.temperatureK;
  const damping = controls.damping;
  const bondScale = controls.bondScale;
  const boxHalfSize = controls.boxHalfSize;
  const tempFactor = Math.max(0, temperatureK) / ROOM_TEMP_K;

  return {
    lj: DEFAULT_LJ,
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
    allowMultipleBonds: true,
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
    adaptiveForceField: true,
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
}

function spawnCounts(sim, counts, maxAtoms, rng, jitter = 1.4) {
  const j = Math.max(0.4, Number(jitter || 1.4));
  for (const el of ELEMENTS) {
    const count = Math.max(0, Math.floor(counts[el] || 0));
    for (let i = 0; i < count; i += 1) {
      addAtom3D(
        sim,
        (rng() - 0.5) * j,
        (rng() - 0.5) * j,
        (rng() - 0.5) * j,
        el,
        DEFAULT_ELEMENTS_3D,
        maxAtoms,
      );
    }
  }
}

function spawnFeedstock(sim, counts, maxAtoms, rng) {
  spawnCounts(sim, counts, maxAtoms, rng, 1.4);
  nudgeAll(sim, 1.8);
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function recomputeValenceUsage(sim) {
  const atomById = new Map();
  for (const atom of sim.atoms) {
    atom.valenceUsed = 0;
    atomById.set(atom.id, atom);
  }
  const kept = [];
  for (const bond of sim.bonds) {
    const a = atomById.get(bond.aId);
    const b = atomById.get(bond.bId);
    if (!a || !b || a.id === b.id) continue;
    const order = Math.max(1, Math.min(3, Math.round(Number(bond.order) || 1)));
    a.valenceUsed += order;
    b.valenceUsed += order;
    kept.push({ ...bond, order });
  }
  sim.bonds = kept;
}

function deleteAtomsByMode(sim, mode, fraction, rng) {
  const f = clamp(Number(fraction ?? 0), 0, 1);
  if (mode === "clear-all") {
    clearSim3D(sim);
    return;
  }
  const matches = sim.atoms.filter((atom) => {
    if (mode === "trim-h") return atom.el === "H";
    if (mode === "trim-heavy") return atom.el !== "H";
    return true;
  });
  if (matches.length <= 0) return;
  const nDelete = Math.max(1, Math.floor(matches.length * Math.max(0.01, f)));
  shuffleInPlace(matches, rng);
  const removeIds = new Set(matches.slice(0, nDelete).map((a) => a.id));
  sim.atoms = sim.atoms.filter((atom) => !removeIds.has(atom.id));
  sim.bonds = sim.bonds.filter(
    (bond) => !removeIds.has(bond.aId) && !removeIds.has(bond.bId),
  );
  recomputeValenceUsage(sim);
}

function firstHitStep(sim, targetFingerprint) {
  const comps = analyzeMoleculeComponents(sim.atoms, sim.bonds);
  for (const comp of comps) {
    if (comp.fingerprint === targetFingerprint) return true;
  }
  return false;
}

function simulateAttempt({
  seed,
  targetFingerprint,
  feedstockCounts,
  spawnPulses,
  deleteActions,
  setting,
  maxAtoms,
  steps,
  scanEvery,
}) {
  return withSeed(seed, (rng) => {
    const sim = createSim3D();
    spawnFeedstock(sim, feedstockCounts, maxAtoms, rng);
    const pulses = Array.isArray(spawnPulses) ? spawnPulses : [];
    const deletes = Array.isArray(deleteActions) ? deleteActions : [];
    const pulseQueue = pulses
      .map((pulse) => ({
        type: "pulse",
        atStep: clamp(
          Math.floor(steps * clamp(Number(pulse?.atFrac ?? 0.5), 0, 1)),
          1,
          Math.max(1, steps - 1),
        ),
        counts: sanitizeCounts(pulse?.counts),
        jitter: clamp(Number(pulse?.jitter ?? 1.35), 0.6, 2.2),
      }))
      .concat(
        deletes.map((action) => ({
          type: "delete",
          atStep: clamp(
            Math.floor(steps * clamp(Number(action?.atFrac ?? 0.5), 0, 1)),
            1,
            Math.max(1, steps - 1),
          ),
          mode: String(action?.mode || "trim-any"),
          fraction: clamp(Number(action?.fraction ?? 0.25), 0, 1),
        })),
      )
      .sort((a, b) => a.atStep - b.atStep);
    let pulseIdx = 0;
    const startControls = normalizeControls(setting);
    const endControls = setting?.annealTo ? normalizeControls(setting.annealTo) : null;
    const annealStartFrac = clamp(Number(setting?.annealStartFrac ?? 0.35), 0, 0.95);
    const annealStartStep = Math.max(1, Math.floor(steps * annealStartFrac));
    const params = buildParams(startControls);

    for (let step = 1; step <= steps; step += 1) {
      if (endControls) {
        const t =
          step <= annealStartStep
            ? 0
            : clamp((step - annealStartStep) / Math.max(1, steps - annealStartStep), 0, 1);
        params.temperatureK = lerp(startControls.temperatureK, endControls.temperatureK, t);
        params.temperature = Math.max(0, params.temperatureK) / ROOM_TEMP_K;
        params.damping = lerp(startControls.damping, endControls.damping, t);
        params.bondScale = lerp(startControls.bondScale, endControls.bondScale, t);
        params.boxHalfSize = lerp(startControls.boxHalfSize, endControls.boxHalfSize, t);
      }

      while (pulseIdx < pulseQueue.length && step >= pulseQueue[pulseIdx].atStep) {
        const event = pulseQueue[pulseIdx];
        if (event.type === "pulse") {
          spawnCounts(sim, event.counts, maxAtoms, rng, event.jitter);
          nudgeAll(sim, 1.2);
        } else {
          deleteAtomsByMode(sim, event.mode, event.fraction, rng);
          nudgeAll(sim, 1.1);
        }
        pulseIdx += 1;
      }

      stepSim3D(sim, params, DT);
      if (step % scanEvery === 0) {
        if (firstHitStep(sim, targetFingerprint)) {
          return {
            hit: true,
            hitStep: step,
            hitSeconds: Number((step * DT).toFixed(3)),
            atomCount: sim.atoms.length,
            bondCount: sim.bonds.length,
          };
        }
      }
    }

    return {
      hit: false,
      hitStep: null,
      hitSeconds: null,
      atomCount: sim.atoms.length,
      bondCount: sim.bonds.length,
    };
  });
}

function settingKey(setting) {
  const start = normalizeControls(setting);
  const end = setting?.annealTo ? normalizeControls(setting.annealTo) : null;
  const startPart = [
    `T${Math.round(start.temperatureK)}`,
    `D${Number(start.damping).toFixed(4)}`,
    `B${Number(start.bondScale).toFixed(3)}`,
    `X${Number(start.boxHalfSize).toFixed(2)}`,
  ].join("|");
  if (!end) return startPart;
  const endPart = [
    `T${Math.round(end.temperatureK)}`,
    `D${Number(end.damping).toFixed(4)}`,
    `B${Number(end.bondScale).toFixed(3)}`,
    `X${Number(end.boxHalfSize).toFixed(2)}`,
  ].join("|");
  return [
    startPart,
    `A${Number(setting?.annealStartFrac ?? 0.35).toFixed(2)}`,
    endPart,
  ].join("->");
}

function makeHeuristicBaseSetting(entry) {
  const atomCount = Number(entry.atomCount || 0);
  const heavy = Number(entry.heavyAtomCount || 0);
  const ringCount = Number(entry.ringCount || 0);
  const maxBondOrder = Number(entry.maxBondOrder || 1);
  const unsat = Math.max(0, maxBondOrder - 1) + ringCount;

  const temperatureK = clamp(
    680 - atomCount * 18 - heavy * 2 + unsat * 120,
    120,
    1100,
  );
  const damping = clamp(
    0.986 + atomCount * 0.00045 + ringCount * 0.0018 + unsat * 0.0003,
    0.982,
    0.999,
  );
  const bondScale = clamp(
    2.4 + atomCount * 0.08 + unsat * 0.35 + ringCount * 0.2,
    2.1,
    5.4,
  );
  const boxHalfSize = clamp(
    4.3 + atomCount * 0.14 + ringCount * 0.25,
    4.0,
    8.8,
  );

  return { temperatureK, damping, bondScale, boxHalfSize };
}

function buildSettingCandidates(entry) {
  const base = makeHeuristicBaseSetting(entry);
  const staticRaw = [
    base,
    {
      temperatureK: base.temperatureK + 180,
      damping: base.damping - 0.0035,
      bondScale: base.bondScale - 0.25,
      boxHalfSize: base.boxHalfSize - 0.7,
    },
    {
      temperatureK: base.temperatureK - 150,
      damping: base.damping + 0.0025,
      bondScale: base.bondScale + 0.5,
      boxHalfSize: base.boxHalfSize + 0.55,
    },
    {
      temperatureK: base.temperatureK + 260,
      damping: base.damping - 0.005,
      bondScale: base.bondScale - 0.5,
      boxHalfSize: base.boxHalfSize + 0.7,
    },
    {
      temperatureK: base.temperatureK - 220,
      damping: base.damping + 0.004,
      bondScale: base.bondScale + 0.8,
      boxHalfSize: base.boxHalfSize - 0.4,
    },
    {
      ...DEFAULTS,
    },
  ];
  const dynamicRaw = [
    {
      ...base,
      annealStartFrac: 0.3,
      annealTo: {
        temperatureK: base.temperatureK - 180,
        damping: base.damping + 0.0055,
        bondScale: base.bondScale + 0.85,
        boxHalfSize: base.boxHalfSize + 0.7,
      },
    },
    {
      temperatureK: base.temperatureK + 260,
      damping: base.damping - 0.0055,
      bondScale: Math.max(2.0, base.bondScale - 0.6),
      boxHalfSize: Math.max(3.9, base.boxHalfSize - 0.6),
      annealStartFrac: 0.42,
      annealTo: {
        temperatureK: base.temperatureK - 120,
        damping: base.damping + 0.0045,
        bondScale: base.bondScale + 1.0,
        boxHalfSize: base.boxHalfSize + 1.0,
      },
    },
    {
      temperatureK: Math.min(1300, base.temperatureK + 420),
      damping: Math.max(0.97, base.damping - 0.009),
      bondScale: Math.max(2.0, base.bondScale - 0.95),
      boxHalfSize: Math.max(3.8, base.boxHalfSize - 1.0),
      annealStartFrac: 0.38,
      annealTo: {
        temperatureK: Math.max(110, base.temperatureK - 220),
        damping: Math.min(0.999, base.damping + 0.0075),
        bondScale: Math.min(5.8, base.bondScale + 1.35),
        boxHalfSize: Math.min(9.8, base.boxHalfSize + 1.35),
      },
    },
    {
      temperatureK: Math.min(1350, base.temperatureK + 520),
      damping: Math.max(0.97, base.damping - 0.01),
      bondScale: Math.max(2.0, base.bondScale - 1.05),
      boxHalfSize: Math.min(9.8, base.boxHalfSize + 1.2),
      annealStartFrac: 0.52,
      annealTo: {
        temperatureK: Math.max(90, base.temperatureK - 280),
        damping: Math.min(0.9995, base.damping + 0.009),
        bondScale: Math.min(5.8, base.bondScale + 1.55),
        boxHalfSize: Math.max(3.9, base.boxHalfSize - 0.85),
      },
    },
  ];
  const raw = [...staticRaw, ...dynamicRaw];

  const unique = new Map();
  for (const s of raw) {
    const normalized = normalizeControls(s);
    if (s?.annealTo) {
      normalized.annealStartFrac = clamp(Number(s.annealStartFrac ?? 0.35), 0.05, 0.95);
      normalized.annealTo = normalizeControls(s.annealTo);
    }
    unique.set(settingKey(normalized), normalized);
  }
  return [...unique.values()];
}

function buildFeedstockCandidates(entry, maxAtoms, searchAtomCap) {
  const baseCounts = elementCountsFromStructure(entry.structure);
  const atomCount = Math.max(1, totalAtoms(baseCounts));
  const heavyCount = Number(entry.heavyAtomCount || 0);
  const cap = clamp(searchAtomCap, atomCount, maxAtoms);

  const denseTargetAtoms = Math.min(
    cap,
    atomCount <= 4 ? 80 : atomCount <= 8 ? 72 : atomCount <= 12 ? 64 : 56,
  );
  const denseScale = Math.max(1, Math.floor(denseTargetAtoms / atomCount));
  const midScale = Math.max(1, Math.floor((denseScale + 1) / 2));

  const candidates = [];
  const add = (label, counts) => {
    if (totalAtoms(counts) > maxAtoms) return;
    candidates.push({ label, counts });
  };

  add("exact-x1", scaleCounts(baseCounts, 1));
  if (midScale > 1) add(`exact-x${midScale}`, scaleCounts(baseCounts, midScale));
  if (denseScale > midScale) add(`exact-x${denseScale}`, scaleCounts(baseCounts, denseScale));

  const hRich = scaleCounts(baseCounts, Math.max(1, midScale));
  const hRoom = maxAtoms - totalAtoms(hRich);
  if (hRoom > 0) {
    const extraH = Math.min(hRoom, Math.max(2, Math.round(heavyCount * 0.9)));
    hRich.H += extraH;
    add(`h-rich+${extraH}`, hRich);
  }

  const randomBlend = cloneCounts(scaleCounts(baseCounts, Math.max(1, Math.floor(midScale / 2))));
  let blendRoom = maxAtoms - totalAtoms(randomBlend);
  if (blendRoom > 0) {
    const blendAdd = Math.min(blendRoom, Math.max(6, Math.floor(atomCount * 0.75)));
    const perEl = Math.max(1, Math.floor(blendAdd / ELEMENTS.length));
    for (const el of ELEMENTS) randomBlend[el] += perEl;
    add("sponch-blend", randomBlend);
  }

  const unique = new Map();
  for (const cand of candidates) {
    unique.set(countsKey(cand.counts), { label: cand.label, counts: sanitizeCounts(cand.counts) });
  }
  return [...unique.values()];
}

function buildInterventionPlans(entry, maxAtoms, feedstockCounts) {
  const atomCount = Math.max(1, Number(entry.atomCount || 0));
  const heavyCount = Math.max(1, Number(entry.heavyAtomCount || 0));
  const baseCounts = elementCountsFromStructure(entry.structure);
  const heavyBase = { ...baseCounts, H: 0 };
  const feedstock = sanitizeCounts(feedstockCounts);

  const heavyBudget = clamp(
    Math.round(Math.min(maxAtoms * 0.3, Math.max(8, heavyCount * 3.5))),
    8,
    Math.max(8, Math.floor(maxAtoms * 0.45)),
  );
  const hBudget = clamp(
    Math.round(Math.min(maxAtoms * 0.3, Math.max(8, heavyCount * 2.8))),
    8,
    Math.max(8, Math.floor(maxAtoms * 0.45)),
  );
  const mixBudget = clamp(
    Math.round(Math.min(maxAtoms * 0.26, Math.max(8, atomCount * 1.4))),
    8,
    Math.max(8, Math.floor(maxAtoms * 0.4)),
  );

  const heavyPulse = fitCountsToBudget(scaleCounts(heavyBase, 2), heavyBudget);
  const heavyPulseLite = fitCountsToBudget(scaleCounts(heavyBase, 1), Math.max(6, Math.floor(heavyBudget * 0.65)));
  const hPulse = fitCountsToBudget({ H: Math.max(6, hBudget), C: 0, N: 0, O: 0, P: 0, S: 0 }, hBudget);
  const mixedPulse = fitCountsToBudget(
    {
      C: Math.max(2, Math.round((feedstock.C || 0) * 0.45)),
      N: Math.max(0, Math.round((feedstock.N || 0) * 0.45)),
      O: Math.max(0, Math.round((feedstock.O || 0) * 0.45)),
      P: Math.max(0, Math.round((feedstock.P || 0) * 0.45)),
      S: Math.max(0, Math.round((feedstock.S || 0) * 0.45)),
      H: Math.max(4, Math.round((feedstock.H || 0) * 0.4)),
    },
    mixBudget,
  );

  return [
    { label: "no-intervention", pulses: [], deletes: [] },
    {
      label: "pulse-heavy-then-h",
      pulses: [
        { atFrac: 0.14, counts: heavyPulse, jitter: 1.6 },
        { atFrac: 0.52, counts: hPulse, jitter: 1.35 },
      ],
      deletes: [],
    },
    {
      label: "pulse-scaffold-bursts",
      pulses: [
        { atFrac: 0.1, counts: heavyPulseLite, jitter: 1.7 },
        { atFrac: 0.3, counts: heavyPulse, jitter: 1.55 },
        { atFrac: 0.64, counts: hPulse, jitter: 1.3 },
      ],
      deletes: [],
    },
    {
      label: "pulse-mixed-jolt",
      pulses: [{ atFrac: 0.24, counts: mixedPulse, jitter: 1.5 }],
      deletes: [],
    },
    {
      label: "pulse-late-h",
      pulses: [{ atFrac: 0.6, counts: hPulse, jitter: 1.25 }],
      deletes: [],
    },
    {
      label: "trim-h-then-cap",
      pulses: [
        { atFrac: 0.16, counts: heavyPulse, jitter: 1.6 },
        { atFrac: 0.64, counts: hPulse, jitter: 1.3 },
      ],
      deletes: [{ atFrac: 0.48, mode: "trim-h", fraction: 0.35 }],
    },
    {
      label: "trim-any-rebuild",
      pulses: [
        { atFrac: 0.2, counts: mixedPulse, jitter: 1.45 },
        { atFrac: 0.68, counts: hPulse, jitter: 1.28 },
      ],
      deletes: [{ atFrac: 0.46, mode: "trim-any", fraction: 0.22 }],
    },
    {
      label: "clear-reseed",
      pulses: [
        { atFrac: 0.56, counts: heavyPulse, jitter: 1.62 },
        { atFrac: 0.74, counts: hPulse, jitter: 1.3 },
      ],
      deletes: [{ atFrac: 0.5, mode: "clear-all", fraction: 1 }],
    },
  ];
}

function buildCandidatePairs(entry, options) {
  const settings = buildSettingCandidates(entry);
  const feedstocks = buildFeedstockCandidates(entry, options.maxAtoms, options.searchAtomCap);
  const pairs = [];

  const primaryFeedstocks = feedstocks.slice(0, Math.min(feedstocks.length, 3));
  for (let sIdx = 0; sIdx < settings.length; sIdx += 1) {
    const setting = settings[sIdx];
    for (const feedstock of primaryFeedstocks) {
      const interventionPlans = buildInterventionPlans(
        entry,
        options.maxAtoms,
        feedstock.counts,
      );
      const selectedPlans =
        sIdx < 2 ? interventionPlans.slice(0, 6) : interventionPlans.slice(0, 2);
      for (const plan of selectedPlans) {
        const stepCount = estimateStepCount(
          setting,
          feedstock.counts,
          plan.pulses,
          plan.deletes,
        );
        if (options.maxRecipeSteps > 0 && stepCount > options.maxRecipeSteps) continue;
        pairs.push({
          setting,
          feedstock,
          spawnPulses: plan.pulses,
          deleteActions: plan.deletes,
          interventionLabel: plan.label,
          stepCount,
          label: `${settingKey(setting)}|${feedstock.label}|${plan.label}`,
        });
      }
    }
  }

  if (feedstocks.length > 3) {
    const extra = feedstocks[feedstocks.length - 1];
    const interventionPlans = buildInterventionPlans(entry, options.maxAtoms, extra.counts);
    for (const plan of interventionPlans.slice(0, 3)) {
      const stepCount = estimateStepCount(
        settings[0],
        extra.counts,
        plan.pulses,
        plan.deletes,
      );
      if (options.maxRecipeSteps > 0 && stepCount > options.maxRecipeSteps) continue;
      pairs.push({
        setting: settings[0],
        feedstock: extra,
        spawnPulses: plan.pulses,
        deleteActions: plan.deletes,
        interventionLabel: plan.label,
        stepCount,
        label: `${settingKey(settings[0])}|${extra.label}|${plan.label}`,
      });
    }
  }

  if (pairs.length <= 0 && settings.length > 0 && feedstocks.length > 0) {
    const fallbackPlan = buildInterventionPlans(entry, options.maxAtoms, feedstocks[0].counts)[0] || {
      label: "no-intervention",
      pulses: [],
      deletes: [],
    };
    pairs.push({
      setting: settings[0],
      feedstock: feedstocks[0],
      spawnPulses: fallbackPlan.pulses || [],
      deleteActions: fallbackPlan.deletes || [],
      interventionLabel: fallbackPlan.label || "no-intervention",
      stepCount: estimateStepCount(
        settings[0],
        feedstocks[0].counts,
        fallbackPlan.pulses || [],
        fallbackPlan.deletes || [],
      ),
      label: `${settingKey(settings[0])}|${feedstocks[0].label}|${fallbackPlan.label || "no-intervention"}`,
    });
  }

  return pairs.slice(0, options.maxCandidates);
}

function estimateStepCount(setting, feedstockCounts, spawnPulses, deleteActions) {
  const hasInitialAdd = totalAtoms(feedstockCounts || {}) > 0;
  const events =
    (Array.isArray(spawnPulses) ? spawnPulses.length : 0) +
    (Array.isArray(deleteActions) ? deleteActions.length : 0);
  const hasControlShift = Boolean(setting?.annealTo);
  return 1 + (hasInitialAdd ? 1 : 0) + events + (hasControlShift ? 1 : 0);
}

function summarizeCandidateResult(result) {
  const hitRate = result.attempts > 0 ? result.hits / result.attempts : 0;
  const avgHitStep =
    result.hitSteps.length > 0
      ? result.hitSteps.reduce((sum, v) => sum + v, 0) / result.hitSteps.length
      : null;
  return {
    label: result.label,
    setting: result.setting,
    feedstock: result.feedstock,
    spawnPulses: Array.isArray(result.spawnPulses) ? result.spawnPulses : [],
    deleteActions: Array.isArray(result.deleteActions) ? result.deleteActions : [],
    interventionLabel: result.interventionLabel || "no-intervention",
    stepCount: Number.isFinite(result.stepCount)
      ? result.stepCount
      : estimateStepCount(
          result.setting,
          result.feedstock?.counts || {},
          result.spawnPulses || [],
          result.deleteActions || [],
        ),
    attempts: result.attempts,
    hits: result.hits,
    hitRate,
    avgHitStep,
    avgHitSeconds: avgHitStep === null ? null : Number((avgHitStep * DT).toFixed(3)),
  };
}

function scoreCandidate(summary, options) {
  if (!summary) return -1e9;
  const hitRate = Number(summary.hitRate || 0);
  const speedTerm = summary.avgHitStep === null ? 0 : 1 / (1 + summary.avgHitStep);
  const pulseAtoms = (summary.spawnPulses || []).reduce(
    (sum, pulse) => sum + totalAtoms(pulse.counts || {}),
    0,
  );
  const atomPenalty = (totalAtoms(summary.feedstock.counts) + pulseAtoms) * 0.0024;

  let simplicityPenalty = 0;
  if (options?.preferSimpleRecipes) {
    const deleteActions = Array.isArray(summary.deleteActions) ? summary.deleteActions : [];
    const clearAllCount = deleteActions.filter(
      (d) => String(d?.mode || "") === "clear-all",
    ).length;
    const trimDeleteCount = deleteActions.length - clearAllCount;
    const eventCount =
      (summary.spawnPulses?.length || 0) + (summary.deleteActions?.length || 0);
    const stepCount = Number(summary.stepCount || 0);
    const targetMaxSteps = Math.max(1, Number(options.maxRecipeSteps || 6));

    simplicityPenalty += Math.max(0, eventCount - 2) * 2.1;
    simplicityPenalty += clearAllCount * 8.0;
    simplicityPenalty += trimDeleteCount * 2.3;
    simplicityPenalty += Math.max(0, stepCount - targetMaxSteps) * 6.0;
    if (summary.setting?.annealTo) simplicityPenalty += 1.2;
  }

  return hitRate * 1000 + speedTerm * 50 - atomPenalty - simplicityPenalty;
}

function formatCountParts(counts) {
  const order = ["C", "H", "N", "O", "P", "S"];
  const out = [];
  for (const el of order) {
    const n = Math.max(0, Math.floor(Number(counts?.[el] || 0)));
    if (n > 0) out.push(`${el}${n > 1 ? ` x${n}` : ""}`);
  }
  return out;
}

function formatControlsInline(ctrl) {
  return [
    `T: ${Math.round(Number(ctrl.temperatureK || 0))}`,
    `D: ${Number(ctrl.damping || 0).toFixed(4)}`,
    `B: ${Number(ctrl.bondScale || 0).toFixed(2)}`,
    `V: ${Number(ctrl.boxHalfSize || 0).toFixed(2)}`,
  ].join(", ");
}

function toPct(frac) {
  return `${Math.round(clamp(Number(frac || 0), 0, 1) * 100)}%`;
}

function buildStepwiseRecipe(rec) {
  if (!rec) return [];
  const steps = [];
  steps.push(formatControlsInline(rec.initialControls));

  const initialParts = formatCountParts(rec.feedstockCounts);
  if (initialParts.length > 0) {
    steps.push(`Add ${initialParts.join(", ")} (random spawn positions).`);
  }

  const events = [];
  for (const pulse of rec.spawnPulses || []) {
    events.push({
      kind: "pulse",
      atFrac: clamp(Number(pulse?.atFrac ?? 0), 0, 1),
      counts: pulse?.counts || {},
    });
  }
  for (const del of rec.deleteActions || []) {
    events.push({
      kind: "delete",
      atFrac: clamp(Number(del?.atFrac ?? 0), 0, 1),
      mode: String(del?.mode || "trim-any"),
      fraction: clamp(Number(del?.fraction ?? 0), 0, 1),
    });
  }
  events.sort((a, b) => a.atFrac - b.atFrac);

  for (const event of events) {
    if (event.kind === "pulse") {
      const parts = formatCountParts(event.counts);
      if (parts.length <= 0) continue;
      steps.push(`At ~${toPct(event.atFrac)}: add ${parts.join(", ")}.`);
      continue;
    }
    if (event.mode === "clear-all") {
      steps.push(`At ~${toPct(event.atFrac)}: delete all atoms (clear reactor).`);
      continue;
    }
    const pct = Math.round(event.fraction * 100);
    if (event.mode === "trim-h") {
      steps.push(`At ~${toPct(event.atFrac)}: delete ~${pct}% of H atoms.`);
      continue;
    }
    if (event.mode === "trim-heavy") {
      steps.push(`At ~${toPct(event.atFrac)}: delete ~${pct}% of non-H atoms.`);
      continue;
    }
    steps.push(`At ~${toPct(event.atFrac)}: delete ~${pct}% of all atoms.`);
  }

  if (rec.controlTransition?.target) {
    steps.push(
      `From ~${toPct(rec.controlTransition.startFrac)} onward, gradually shift to ${formatControlsInline(
        rec.controlTransition.target,
      )}.`,
    );
  }

  return steps;
}

function toRecipeCandidate(item) {
  const initialControls = normalizeControls(item.setting || DEFAULTS);
  const controlTransition = item?.setting?.annealTo
    ? {
        startFrac: clamp(Number(item.setting.annealStartFrac ?? 0.35), 0, 1),
        target: normalizeControls(item.setting.annealTo),
      }
    : null;
  const spawnPulses = Array.isArray(item.spawnPulses) ? item.spawnPulses : [];
  const deleteActions = Array.isArray(item.deleteActions) ? item.deleteActions : [];
  const out = {
    temperatureK: Math.round(initialControls.temperatureK),
    damping: Number(initialControls.damping.toFixed(4)),
    bondScale: Number(initialControls.bondScale.toFixed(3)),
    boxHalfSize: Number(initialControls.boxHalfSize.toFixed(2)),
    initialControls: {
      temperatureK: Math.round(initialControls.temperatureK),
      damping: Number(initialControls.damping.toFixed(4)),
      bondScale: Number(initialControls.bondScale.toFixed(3)),
      boxHalfSize: Number(initialControls.boxHalfSize.toFixed(2)),
    },
    controlTransition: controlTransition
      ? {
          startFrac: Number(controlTransition.startFrac.toFixed(3)),
          target: {
            temperatureK: Math.round(controlTransition.target.temperatureK),
            damping: Number(controlTransition.target.damping.toFixed(4)),
            bondScale: Number(controlTransition.target.bondScale.toFixed(3)),
            boxHalfSize: Number(controlTransition.target.boxHalfSize.toFixed(2)),
          },
        }
      : null,
    feedstockCounts: item.feedstock.counts,
    spawnPulses,
    deleteActions,
    totalSpawnAtoms:
      totalAtoms(item.feedstock.counts) +
      spawnPulses.reduce((sum, pulse) => sum + totalAtoms(pulse.counts || {}), 0),
    recipeLabel: item.label,
    interventionLabel: item.interventionLabel || "no-intervention",
    hitRate: Number(item.hitRate.toFixed(3)),
    avgHitSeconds:
      typeof item.avgHitSeconds === "number"
        ? Number(item.avgHitSeconds.toFixed(3))
        : null,
    attempts: item.attempts,
    hits: item.hits,
    estimatedStepCount: estimateStepCount(
      item.setting,
      item.feedstock?.counts || {},
      spawnPulses,
      deleteActions,
    ),
  };
  out.stepwiseRecipe = buildStepwiseRecipe(out);
  out.stepCount = out.stepwiseRecipe.length;
  return out;
}

function evaluateMolecule(entry, options) {
  const pairs = buildCandidatePairs(entry, options);
  const candidateRuns = pairs.map((pair) => ({
    ...pair,
    attempts: 0,
    hits: 0,
    hitSteps: [],
  }));

  let seedCursor = hashString(`${options.seed}:${entry.id}`);
  const nextSeed = () => {
    seedCursor = (seedCursor + 0x9e3779b9) >>> 0;
    return seedCursor;
  };

  for (const run of candidateRuns) {
    for (let i = 0; i < options.quickAttempts; i += 1) {
      const result = simulateAttempt({
        seed: nextSeed(),
        targetFingerprint: entry.fingerprint,
        feedstockCounts: run.feedstock.counts,
        spawnPulses: run.spawnPulses,
        deleteActions: run.deleteActions,
        setting: run.setting,
        maxAtoms: options.maxAtoms,
        steps: options.quickSteps,
        scanEvery: options.scanEvery,
      });
      run.attempts += 1;
      if (result.hit) {
        run.hits += 1;
        run.hitSteps.push(result.hitStep);
      }
    }
  }

  let summaries = candidateRuns.map(summarizeCandidateResult);
  summaries.sort((a, b) => scoreCandidate(b, options) - scoreCandidate(a, options));

  const rescueCount = Math.min(options.rescueCandidates, summaries.length);
  for (let i = 0; i < rescueCount; i += 1) {
    const chosenLabel = summaries[i].label;
    const run = candidateRuns.find((r) => r.label === chosenLabel);
    if (!run) continue;
    for (let rep = 0; rep < options.rescueAttempts; rep += 1) {
      const result = simulateAttempt({
        seed: nextSeed(),
        targetFingerprint: entry.fingerprint,
        feedstockCounts: run.feedstock.counts,
        spawnPulses: run.spawnPulses,
        deleteActions: run.deleteActions,
        setting: run.setting,
        maxAtoms: options.maxAtoms,
        steps: options.rescueSteps,
        scanEvery: options.scanEvery,
      });
      run.attempts += 1;
      if (result.hit) {
        run.hits += 1;
        run.hitSteps.push(result.hitStep);
      }
    }
  }

  summaries = candidateRuns.map(summarizeCandidateResult);
  summaries.sort((a, b) => scoreCandidate(b, options) - scoreCandidate(a, options));
  const best = summaries[0] || null;

  if (best && best.hits > 0 && options.refineAttempts > 0) {
    const run = candidateRuns.find((r) => r.label === best.label);
    if (run) {
      for (let i = 0; i < options.refineAttempts; i += 1) {
        const result = simulateAttempt({
          seed: nextSeed(),
          targetFingerprint: entry.fingerprint,
          feedstockCounts: run.feedstock.counts,
          spawnPulses: run.spawnPulses,
          deleteActions: run.deleteActions,
          setting: run.setting,
          maxAtoms: options.maxAtoms,
          steps: options.refineSteps,
          scanEvery: options.scanEvery,
        });
        run.attempts += 1;
        if (result.hit) {
          run.hits += 1;
          run.hitSteps.push(result.hitStep);
        }
      }
    }
    summaries = candidateRuns.map(summarizeCandidateResult);
    summaries.sort((a, b) => scoreCandidate(b, options) - scoreCandidate(a, options));
  }

  const finalBest = summaries[0] || null;
  const found = Boolean(finalBest && finalBest.hits > 0);

  return {
    id: entry.id,
    name: entry.name,
    formula: entry.formula,
    atomCount: entry.atomCount,
    ringCount: entry.ringCount,
    maxBondOrder: entry.maxBondOrder,
    found,
    recommended: finalBest ? toRecipeCandidate(finalBest) : null,
    topCandidates: summaries
      .slice(0, Math.min(3, summaries.length))
      .map((item) => toRecipeCandidate(item)),
  };
}

function subsetCatalog(catalog, options) {
  let rows = catalog.slice();
  if (options.ids && options.ids.length > 0) {
    const wanted = new Set(options.ids);
    rows = rows.filter((entry) => wanted.has(entry.id));
  } else {
    rows = rows.slice(options.offset, options.offset + options.limit);
  }
  return rows;
}

function writeJson(filePath, payload) {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(payload, null, 2));
  return abs;
}

function formatRecipeLine(entry, rec) {
  if (!rec) return `${entry.id} | ${entry.name} | ${entry.formula} | not found`;
  return [
    entry.id,
    entry.name,
    entry.formula,
    `T=${rec.temperatureK}K`,
    `damp=${rec.damping}`,
    `bond=${rec.bondScale}`,
    `box=${rec.boxHalfSize}`,
    `spawn=${JSON.stringify(rec.feedstockCounts)}`,
    `events=${(rec.spawnPulses || []).length + (rec.deleteActions || []).length}`,
    `steps=${rec.stepCount ?? rec.estimatedStepCount ?? "-"}`,
    `hitRate=${rec.hitRate}`,
    `avgHitS=${rec.avgHitSeconds ?? "-"}`,
  ].join(" | ");
}

function writeMarkdown(filePath, results, summary, options) {
  const lines = [];
  lines.push("# Reactor Recipe Search");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Scope: ${summary.totalEvaluated} molecules`);
  lines.push(`Found: ${summary.foundCount}`);
  lines.push(`Coverage: ${summary.coveragePct}%`);
  lines.push("");
  lines.push("Settings constraints:");
  lines.push("- allowMultipleBonds: true");
  lines.push("- sigma/epsilon: defaults (unchanged)");
  lines.push("- controls varied: temperature, damping, bondScale, boxHalfSize");
  lines.push(`- max atoms spawned: ${options.maxAtoms}`);
  lines.push(`- max recipe steps target: ${options.maxRecipeSteps}`);
  lines.push(`- prefer simple recipes: ${options.preferSimpleRecipes}`);
  lines.push("");
  lines.push("Per-molecule recommendation:");
  lines.push("");
  lines.push("`id | name | formula | temperature | damping | bond | box | spawn counts | hitRate | avgHitS`");
  lines.push("");
  for (const entry of results) {
    lines.push(`- ${formatRecipeLine(entry, entry.recommended)}`);
    const steps = entry?.recommended?.stepwiseRecipe || [];
    for (let i = 0; i < steps.length; i += 1) {
      lines.push(`  ${i + 1}. ${steps[i]}`);
    }
  }
  lines.push("");

  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${lines.join("\n")}\n`);
  return abs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let ids = null;
  if (typeof args.ids === "string" && args.ids.trim().length > 0) {
    ids = args.ids.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof args.idsFile === "string" && args.idsFile.trim().length > 0) {
    const raw = fs.readFileSync(path.resolve(args.idsFile), "utf8");
    const fromFile = raw
      .split(/[\s,]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (fromFile.length > 0) {
      const merged = new Set([...(ids || []), ...fromFile]);
      ids = [...merged];
    }
  }

  const preferSimpleRaw = args.preferSimpleRecipes;
  const preferSimpleRecipes =
    preferSimpleRaw === undefined
      ? true
      : !["0", "false", "no", "off"].includes(String(preferSimpleRaw).toLowerCase());

  const options = {
    out: args.out || "data/reactor_recipe_guide.json",
    mdOut: args.mdOut || "data/reactor_recipe_guide.md",
    limit: readIntArg(args, "limit", MOLECULE_CATALOG.length),
    offset: readIntArg(args, "offset", 0),
    ids,
    maxAtoms: readIntArg(args, "maxAtoms", 200),
    searchAtomCap: readIntArg(args, "searchAtomCap", 72),
    quickAttempts: readIntArg(args, "quickAttempts", 1),
    quickSteps: readIntArg(args, "quickSteps", 300),
    rescueCandidates: readIntArg(args, "rescueCandidates", 2),
    rescueAttempts: readIntArg(args, "rescueAttempts", 1),
    rescueSteps: readIntArg(args, "rescueSteps", 900),
    refineAttempts: readIntArg(args, "refineAttempts", 1),
    refineSteps: readIntArg(args, "refineSteps", 900),
    maxCandidates: readIntArg(args, "maxCandidates", 10),
    maxRecipeSteps: readIntArg(args, "maxRecipeSteps", 6),
    preferSimpleRecipes,
    scanEvery: readIntArg(args, "scanEvery", 6),
    seed: readIntArg(args, "seed", 20260217),
    printEvery: readIntArg(args, "printEvery", 20),
    minHitRate: readFloatArg(args, "minHitRate", 0),
  };

  const rows = subsetCatalog(MOLECULE_CATALOG, options);
  const startedAt = Date.now();
  const results = [];
  let foundCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const entry = rows[i];
    const result = evaluateMolecule(entry, options);
    if (
      result.recommended &&
      Number(result.recommended.hitRate || 0) >= options.minHitRate &&
      result.recommended.hits > 0
    ) {
      foundCount += 1;
    }
    results.push(result);

    if ((i + 1) % options.printEvery === 0 || i + 1 === rows.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = elapsed > 0 ? (i + 1) / elapsed : 0;
      const remaining = rows.length - (i + 1);
      const eta = rate > 0 ? remaining / rate : 0;
      console.log(
        `[${i + 1}/${rows.length}] found=${foundCount} elapsed=${elapsed.toFixed(1)}s eta=${eta.toFixed(1)}s`,
      );
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    seed: options.seed,
    totalEvaluated: results.length,
    foundCount,
    coveragePct:
      results.length > 0
        ? Number(((100 * foundCount) / results.length).toFixed(2))
        : 0,
    options: {
      maxAtoms: options.maxAtoms,
      searchAtomCap: options.searchAtomCap,
      quickAttempts: options.quickAttempts,
      quickSteps: options.quickSteps,
      rescueCandidates: options.rescueCandidates,
      rescueAttempts: options.rescueAttempts,
      rescueSteps: options.rescueSteps,
      refineAttempts: options.refineAttempts,
      refineSteps: options.refineSteps,
      maxCandidates: options.maxCandidates,
      maxRecipeSteps: options.maxRecipeSteps,
      preferSimpleRecipes: options.preferSimpleRecipes,
      scanEvery: options.scanEvery,
      minHitRate: options.minHitRate,
    },
  };

  const jsonPayload = { summary, results };
  const jsonPath = writeJson(options.out, jsonPayload);
  const mdPath = writeMarkdown(options.mdOut, results, summary, options);

  console.log(`\nSaved JSON: ${jsonPath}`);
  console.log(`Saved Markdown: ${mdPath}`);
  console.log(`Coverage: ${summary.coveragePct}% (${summary.foundCount}/${summary.totalEvaluated})`);
}

main();
