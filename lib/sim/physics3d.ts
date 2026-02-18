// lib/sim/physics3d.ts
/**
 * Toy Chemistry 3D Physics
 * - LJ nonbonded (per-element sigma/epsilon, Lorentz–Berthelot mixing)
 * - Screened electrostatics (Yukawa / Debye) with per-element constant charges (toy)
 * - Bond-order springs (1/2/3)
 * - Angle terms (3-body) from bond graph
 * - Basic dihedrals (4-body) from bond graph
 *
 * Elements: H, C, N, O, P, S
 *
 * This is a toy: stable + fun > chemically accurate.
 */

export type ElementKey = "H" | "C" | "N" | "O" | "P" | "S";

export type ElementDef = {
  label: string;
  mass: number;
  radius: number;
  valence: number; // bond-order capacity
};

export type Atom3D = {
  id: number;
  el: ElementKey;

  x: number;
  y: number;
  z: number;

  vx: number;
  vy: number;
  vz: number;

  fx: number;
  fy: number;
  fz: number;

  mass: number;
  r: number;
  valenceMax: number;
  valenceUsed: number;
};

export type BondOrder = 1 | 2 | 3;

export type Bond3D = {
  aId: number;
  bId: number;
  order: BondOrder;
  r0: number;
  k: number;
  breakR: number;
};

type Neighbor = { id: number; order: BondOrder };

type DihedralTerm = {
  iId: number;
  jId: number;
  kId: number;
  lId: number;
  n: number;
  delta: number; // radians
  k: number; // toy units
};

export type Sim3D = {
  atoms: Atom3D[];
  bonds: Bond3D[];
  nextId: number;
  stepCount: number;

  grabbedId: number | null;
  grabTarget: { x: number; y: number; z: number } | null;

  // cached torsions (rebuilt periodically)
  dihedrals?: DihedralTerm[];
};

export type LJPerElement = Record<ElementKey, { sigma: number; epsilon: number }>;
export type ChargePerElement = Record<ElementKey, number>;

export type Params3D = {
  // nonbonded LJ
  lj: LJPerElement;
  cutoff: number;
  cutoffSwitchRatio?: number;
  reactionCutoff?: number;
  minR: number;
  maxPairForce: number;
  nonbonded12LJScale?: number;
  nonbonded12ElectroScale?: number;
  nonbonded13LJScale?: number;
  nonbonded13ElectroScale?: number;
  nonbonded14LJScale?: number;
  nonbonded14ElectroScale?: number;

  // electrostatics (toy)
  enableElectrostatics: boolean;
  charges: ChargePerElement;   // constant per element
  ke: number;                  // strength multiplier (toy)
  screeningLength: number;     // lambda, in world units
  electroRepulsionScale?: number; // >1 boosts like-charge repulsion only
  electroAttractionScale?: number; // >1 boosts opposite-charge attraction only
  electroBondBiasStrength?: number; // 0..2; favors opposite-charge bond formation
  electroDihedral180Scale?: number; // >0 adds anti (180 deg) bias for non-H terminal dihedral pairs

  // bond system
  bondScale: number;
  allowMultipleBonds: boolean;

  // angle system
  angleK: number;
  angleForceCap: number;

  // dihedral system
  enableDihedrals: boolean;
  dihedralKScale: number;
  dihedralForceCap: number;

  // dynamics
  temperatureK?: number;
  kBoltzmannReduced?: number;
  temperature: number;
  damping: number;
  tempVelKick: number;
  useLangevin?: boolean;
  langevinGamma?: number;
  thermostatInterval?: number; // steps between velocity rescaling
  thermostatStrength?: number; // 0..1 blend toward target kinetic energy
  thermostatClamp?: number; // max fractional rescale per application

  // container
  boxHalfSize: number;
  usePeriodicBoundary?: boolean;
  wallPadding: number;
  wallK: number;

  // reactive gating (toy Arrhenius-style)
  reactionBarrierScale?: number;
  reactionAttemptRate?: number;
  maxReactionEventsPerStep?: number;
  valencePenaltyK?: number;
  valencePenaltyForceCap?: number;

  // grabbing
  grabK: number;
  grabMaxForce: number;
};

export const DEFAULT_ELEMENTS_3D: Record<ElementKey, ElementDef> = {
  H: { label: "H", mass: 1, radius: 0.33, valence: 1 },
  C: { label: "C", mass: 12, radius: 0.48, valence: 4 },
  N: { label: "N", mass: 14, radius: 0.48, valence: 3 },
  O: { label: "O", mass: 16, radius: 0.48, valence: 2 },
  P: { label: "P", mass: 31, radius: 0.55, valence: 3 },
  S: { label: "S", mass: 32, radius: 0.56, valence: 2 },
};

// Toy LJ defaults (not real)
export const DEFAULT_LJ: LJPerElement = {
  H: { sigma: 1.0, epsilon: 0.55 },
  C: { sigma: 1.15, epsilon: 1.05 },
  N: { sigma: 1.12, epsilon: 1.0 },
  // Slightly reduced vs original, but less suppressed to allow more O2 encounters.
  O: { sigma: 1.1, epsilon: 0.95 },
  P: { sigma: 1.22, epsilon: 0.95 },
  S: { sigma: 1.25, epsilon: 1.05 },
};

// Toy constant charges (not real partial charges; just "feels right")
export const DEFAULT_CHARGES: ChargePerElement = {
  H: +0.20,
  C: 0.0,
  N: -0.25,
  O: -0.35,
  P: +0.15,
  S: -0.15,
};

type PairKey = `${ElementKey}-${ElementKey}`;
type PairBondParam = { r0: number; kLit: number };

const K_SCALE = 0.015;

// Canonical-only keys (A-B where A<=B)
const PAIR_BOND_PARAMS: Partial<Record<PairKey, PairBondParam>> = {
  // H
  "H-H": { r0: 0.74, kLit: 470 },
  "H-C": { r0: 1.09, kLit: 340 },
  "H-N": { r0: 1.01, kLit: 350 },
  "H-O": { r0: 0.96, kLit: 430 },
  "H-P": { r0: 1.42, kLit: 250 },
  "H-S": { r0: 1.34, kLit: 250 },

  // C
  "C-C": { r0: 1.54, kLit: 310 },
  "C-N": { r0: 1.47, kLit: 320 },
  "C-O": { r0: 1.43, kLit: 320 },
  "C-P": { r0: 1.84, kLit: 200 },
  "C-S": { r0: 1.82, kLit: 200 },

  // N
  "N-N": { r0: 1.45, kLit: 300 },
  "N-O": { r0: 1.4, kLit: 320 },
  "N-P": { r0: 1.7, kLit: 200 },
  "N-S": { r0: 1.68, kLit: 200 },

  // O
  "O-O": { r0: 1.48, kLit: 270 },
  "O-P": { r0: 1.63, kLit: 240 },
  "O-S": { r0: 1.58, kLit: 240 },

  // P
  "P-P": { r0: 2.21, kLit: 150 },
  "P-S": { r0: 2.1, kLit: 150 },

  // S
  "S-S": { r0: 2.05, kLit: 160 },
};

const PAIR_FORMATION_BIAS: Partial<Record<PairKey, number>> = {
  // Encourage key small stable species and suppress oxygen oligomer growth.
  "H-H": 1.15,
  "H-O": 1.25,
  "O-O": 0.92,
};

type PairReactionBarrier = { form: number; break: number };

// Dimensionless barriers for Arrhenius-style reaction gating.
// Lower = easier channel activation.
const PAIR_REACTION_BARRIERS: Partial<Record<PairKey, PairReactionBarrier>> = {
  "H-H": { form: 0.34, break: 1.2 },
  "H-C": { form: 0.36, break: 1.25 },
  "H-N": { form: 0.34, break: 1.28 },
  "H-O": { form: 0.32, break: 1.35 },
  "H-P": { form: 0.5, break: 1.15 },
  "H-S": { form: 0.5, break: 1.12 },
  "C-C": { form: 0.52, break: 1.55 },
  "C-N": { form: 0.5, break: 1.52 },
  "C-O": { form: 0.48, break: 1.5 },
  "C-S": { form: 0.62, break: 1.34 },
  "C-P": { form: 0.68, break: 1.3 },
  "N-N": { form: 0.62, break: 1.38 },
  "N-O": { form: 0.58, break: 1.35 },
  "N-S": { form: 0.66, break: 1.22 },
  "N-P": { form: 0.72, break: 1.2 },
  "O-O": { form: 0.86, break: 1.24 },
  "O-S": { form: 0.74, break: 1.24 },
  "O-P": { form: 0.64, break: 1.3 },
  "S-S": { form: 0.72, break: 1.22 },
  "P-S": { form: 0.82, break: 1.12 },
  "P-P": { form: 0.95, break: 1.08 },
};

function pairKey(a: ElementKey, b: ElementKey): PairKey {
  return (a <= b ? `${a}-${b}` : `${b}-${a}`) as PairKey;
}

function getPairBondParam(a: ElementKey, b: ElementKey): PairBondParam {
  const key = pairKey(a, b);
  const p = PAIR_BOND_PARAMS[key];
  return p || { r0: 1.6, kLit: 250 };
}

function getPairFormationBias(a: ElementKey, b: ElementKey) {
  return PAIR_FORMATION_BIAS[pairKey(a, b)] ?? 1.0;
}

function getPairReactionBarrier(a: ElementKey, b: ElementKey): PairReactionBarrier {
  return PAIR_REACTION_BARRIERS[pairKey(a, b)] ?? { form: 0.68, break: 1.2 };
}

function orderAdjustedR0(r0Single: number, order: BondOrder) {
  const shrink = 1 - 0.08 * (order - 1);
  return r0Single * shrink;
}

function orderAdjustedK(kSingle: number, order: BondOrder) {
  return kSingle * (1 + 0.9 * (order - 1));
}

export function createSim3D(): Sim3D {
  return {
    atoms: [],
    bonds: [],
    nextId: 1,
    stepCount: 0,
    grabbedId: null,
    grabTarget: null,
    dihedrals: [],
  };
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

type PairNonbondScale = {
  lj: number;
  electro: number;
};

function pairIdKey(aId: number, bId: number) {
  return aId <= bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

function getReducedTemperature(params: Params3D) {
  if (
    typeof params.temperatureK === "number" &&
    Number.isFinite(params.temperatureK)
  ) {
    const kB = Math.max(1e-6, params.kBoltzmannReduced ?? (1 / 300));
    return Math.max(0, params.temperatureK * kB);
  }
  return Math.max(0, params.temperature);
}

function smoothCutoffWeight(r: number, cutoff: number, switchStart: number) {
  if (r >= cutoff) return 0;
  if (r <= switchStart) return 1;
  const denom = Math.max(1e-6, cutoff - switchStart);
  const t = clamp((r - switchStart) / denom, 0, 1);
  // Quintic smoothstep, inverted so weight=1 at switchStart and 0 at cutoff.
  const s = t * t * t * (t * (t * 6 - 15) + 10);
  return 1 - s;
}

function buildBondedPairScales(sim: Sim3D, params: Params3D) {
  const scale12: PairNonbondScale = {
    lj: clamp(params.nonbonded12LJScale ?? 0, 0, 1),
    electro: clamp(params.nonbonded12ElectroScale ?? 0, 0, 1),
  };
  const scale13: PairNonbondScale = {
    lj: clamp(params.nonbonded13LJScale ?? 0, 0, 1),
    electro: clamp(params.nonbonded13ElectroScale ?? 0, 0, 1),
  };
  const scale14: PairNonbondScale = {
    lj: clamp(params.nonbonded14LJScale ?? 0.5, 0, 1),
    electro: clamp(params.nonbonded14ElectroScale ?? 0.833333, 0, 1),
  };

  const adjacency = new Map<number, number[]>();
  for (const a of sim.atoms) adjacency.set(a.id, []);
  for (const b of sim.bonds) {
    if (!adjacency.has(b.aId)) adjacency.set(b.aId, []);
    if (!adjacency.has(b.bId)) adjacency.set(b.bId, []);
    adjacency.get(b.aId)!.push(b.bId);
    adjacency.get(b.bId)!.push(b.aId);
  }

  type Entry = { dist: number; scale: PairNonbondScale };
  const map = new Map<string, Entry>();
  const setIfShorter = (aId: number, bId: number, dist: number, scale: PairNonbondScale) => {
    const key = pairIdKey(aId, bId);
    const existing = map.get(key);
    if (!existing || dist < existing.dist) map.set(key, { dist, scale });
  };

  // 1-2 direct bonded pairs.
  for (const b of sim.bonds) setIfShorter(b.aId, b.bId, 1, scale12);

  // 1-3 pairs through one intermediate atom.
  for (const neigh of adjacency.values()) {
    if (neigh.length < 2) continue;
    for (let i = 0; i < neigh.length - 1; i += 1) {
      for (let j = i + 1; j < neigh.length; j += 1) {
        setIfShorter(neigh[i], neigh[j], 2, scale13);
      }
    }
  }

  // 1-4 pairs through two intermediate atoms (dihedral-like paths).
  for (const b of sim.bonds) {
    const j = b.aId;
    const k = b.bId;
    const jN = (adjacency.get(j) || []).filter((id) => id !== k);
    const kN = (adjacency.get(k) || []).filter((id) => id !== j);
    for (const iId of jN) {
      for (const lId of kN) {
        if (iId === lId) continue;
        setIfShorter(iId, lId, 3, scale14);
      }
    }
  }

  const scales = new Map<string, PairNonbondScale>();
  for (const [key, entry] of map.entries()) scales.set(key, entry.scale);
  return scales;
}

type PairCandidate = {
  i: number;
  j: number;
  dx: number;
  dy: number;
  dz: number;
  r2: number;
  r: number;
};

function randomNormal() {
  // Box-Muller transform.
  let u = 0;
  let v = 0;
  while (u <= 1e-9) u = Math.random();
  while (v <= 1e-9) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function wrapPeriodicCoordinate(value: number, halfBox: number) {
  const L = Math.max(1e-6, halfBox * 2);
  const shifted = value + halfBox;
  return ((((shifted % L) + L) % L) - halfBox);
}

function minimumImage(value: number, halfBox: number) {
  const L = Math.max(1e-6, halfBox * 2);
  if (value > halfBox) return value - L;
  if (value < -halfBox) return value + L;
  return value;
}

function displacement(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  halfBox: number,
  usePeriodic: boolean,
) {
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  if (usePeriodic) {
    dx = minimumImage(dx, halfBox);
    dy = minimumImage(dy, halfBox);
    dz = minimumImage(dz, halfBox);
  }
  return { dx, dy, dz };
}

function toCellCoordinate(value: number, halfBox: number, cellSize: number, nCells: number) {
  const L = Math.max(1e-6, halfBox * 2);
  const shifted = ((value + halfBox) % L + L) % L;
  const idx = Math.floor(shifted / cellSize);
  return clamp(idx, 0, Math.max(0, nCells - 1));
}

function buildNeighborPairs(
  atoms: Atom3D[],
  cutoff: number,
  minR: number,
  halfBox: number,
  usePeriodic: boolean,
) {
  const pairs: PairCandidate[] = [];
  if (atoms.length < 2) return pairs;

  const safeCutoff = Math.max(1e-6, cutoff);
  const cutoff2 = safeCutoff * safeCutoff;
  const L = Math.max(1e-6, halfBox * 2);
  const cellSize = safeCutoff;
  const nCells = Math.max(1, Math.floor(L / cellSize));

  if (nCells <= 1) {
    for (let i = 0; i < atoms.length; i += 1) {
      const ai = atoms[i];
      for (let j = i + 1; j < atoms.length; j += 1) {
        const aj = atoms[j];
        const d = displacement(
          ai.x,
          ai.y,
          ai.z,
          aj.x,
          aj.y,
          aj.z,
          halfBox,
          usePeriodic,
        );
        const r2 = d.dx * d.dx + d.dy * d.dy + d.dz * d.dz;
        if (r2 > cutoff2) continue;
        const r = Math.max(Math.sqrt(r2) || 1e-6, minR);
        pairs.push({ i, j, dx: d.dx, dy: d.dy, dz: d.dz, r2, r });
      }
    }
    return pairs;
  }

  const cellMap = new Map<number, number[]>();
  const pairSeen = new Set<number>();
  const keyOf = (cx: number, cy: number, cz: number) =>
    ((cx * nCells) + cy) * nCells + cz;

  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    const cx = toCellCoordinate(a.x, halfBox, cellSize, nCells);
    const cy = toCellCoordinate(a.y, halfBox, cellSize, nCells);
    const cz = toCellCoordinate(a.z, halfBox, cellSize, nCells);
    const key = keyOf(cx, cy, cz);
    const arr = cellMap.get(key);
    if (arr) arr.push(i);
    else cellMap.set(key, [i]);
  }

  const offsets: Array<[number, number, number]> = [];
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        if (ox < 0) continue;
        if (ox === 0 && oy < 0) continue;
        if (ox === 0 && oy === 0 && oz < 0) continue;
        offsets.push([ox, oy, oz]);
      }
    }
  }

  const wrapCell = (c: number) => {
    if (!usePeriodic) return c;
    return ((c % nCells) + nCells) % nCells;
  };

  for (const [baseKey, inCell] of cellMap.entries()) {
    const cx = Math.floor(baseKey / (nCells * nCells));
    const rem = baseKey - cx * nCells * nCells;
    const cy = Math.floor(rem / nCells);
    const cz = rem - cy * nCells;
    const neighborCellKeys = new Set<number>();

    for (const [ox, oy, oz] of offsets) {
      let nx = cx + ox;
      let ny = cy + oy;
      let nz = cz + oz;

      if (usePeriodic) {
        nx = wrapCell(nx);
        ny = wrapCell(ny);
        nz = wrapCell(nz);
      } else if (nx < 0 || ny < 0 || nz < 0 || nx >= nCells || ny >= nCells || nz >= nCells) {
        continue;
      }

      const neighborKey = keyOf(nx, ny, nz);
      if (neighborCellKeys.has(neighborKey)) continue;
      neighborCellKeys.add(neighborKey);
      const neigh = cellMap.get(neighborKey);
      if (!neigh || neigh.length <= 0) continue;

      const sameCell = nx === cx && ny === cy && nz === cz;
      for (let aIdx = 0; aIdx < inCell.length; aIdx += 1) {
        const i = inCell[aIdx];
        const ai = atoms[i];
        const startB = sameCell ? aIdx + 1 : 0;
        for (let bIdx = startB; bIdx < neigh.length; bIdx += 1) {
          const j = neigh[bIdx];
          if (j <= i) continue;
          const aj = atoms[j];
          const d = displacement(
            ai.x,
            ai.y,
            ai.z,
            aj.x,
            aj.y,
            aj.z,
            halfBox,
            usePeriodic,
          );
          const r2 = d.dx * d.dx + d.dy * d.dy + d.dz * d.dz;
          if (r2 > cutoff2) continue;
          const pairKey = i * atoms.length + j;
          if (pairSeen.has(pairKey)) continue;
          pairSeen.add(pairKey);
          const r = Math.max(Math.sqrt(r2) || 1e-6, minR);
          pairs.push({ i, j, dx: d.dx, dy: d.dy, dz: d.dz, r2, r });
        }
      }
    }
  }

  return pairs;
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

export function clearSim3D(sim: Sim3D) {
  sim.atoms = [];
  sim.bonds = [];
  sim.nextId = 1;
  sim.stepCount = 0;
  sim.grabbedId = null;
  sim.grabTarget = null;
  sim.dihedrals = [];
}

export function getAtom(sim: Sim3D, id: number): Atom3D | null {
  return sim.atoms.find((a) => a.id === id) || null;
}

export function addAtom3D(
  sim: Sim3D,
  x: number,
  y: number,
  z: number,
  el: ElementKey,
  elements: Record<ElementKey, ElementDef>,
  maxAtoms: number
) {
  if (sim.atoms.length >= maxAtoms) return;

  const p = elements[el];
  const id = sim.nextId++;
  sim.atoms.push({
    id,
    el,
    x,
    y,
    z,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    vz: (Math.random() - 0.5) * 0.3,
    fx: 0,
    fy: 0,
    fz: 0,
    mass: p.mass,
    r: p.radius,
    valenceMax: p.valence,
    valenceUsed: 0,
  });
}

function bondValenceCost(order: BondOrder) {
  return order;
}

function targetValenceForOctet(atom: Atom3D) {
  // H follows duet (1 bond pair), others use octet-like capacities.
  if (atom.el === "H") return 1;
  return atom.valenceMax;
}

function recomputeValenceUsage(sim: Sim3D) {
  const byId = new Map<number, Atom3D>();
  for (const a of sim.atoms) {
    a.valenceUsed = 0;
    byId.set(a.id, a);
  }

  for (const b of sim.bonds) {
    const a = byId.get(b.aId);
    const c = byId.get(b.bId);
    if (!a || !c) continue;

    const cost = bondValenceCost(b.order);
    a.valenceUsed += cost;
    c.valenceUsed += cost;
  }
}

function valenceDeficit(atom: Atom3D) {
  return Math.max(0, targetValenceForOctet(atom) - atom.valenceUsed);
}

function valenceOverflow(atom: Atom3D) {
  return Math.max(0, atom.valenceUsed - atom.valenceMax);
}

function hasFullShell(atom: Atom3D) {
  return valenceDeficit(atom) <= 0;
}

type MoleculeState = {
  compByAtomId: Map<number, number>;
  atomsByComp: Map<number, Atom3D[]>;
  chargeByComp: Map<number, number>;
  deficitByComp: Map<number, number>;
};

function buildMoleculeState(sim: Sim3D, params: Params3D): MoleculeState {
  const adj = new Map<number, number[]>();
  for (const a of sim.atoms) adj.set(a.id, []);
  for (const b of sim.bonds) {
    if (!adj.has(b.aId)) adj.set(b.aId, []);
    if (!adj.has(b.bId)) adj.set(b.bId, []);
    adj.get(b.aId)!.push(b.bId);
    adj.get(b.bId)!.push(b.aId);
  }

  const byId = new Map<number, Atom3D>();
  for (const a of sim.atoms) byId.set(a.id, a);

  const compByAtomId = new Map<number, number>();
  const atomsByComp = new Map<number, Atom3D[]>();
  const chargeByComp = new Map<number, number>();
  const deficitByComp = new Map<number, number>();

  let compId = 0;
  for (const a of sim.atoms) {
    if (compByAtomId.has(a.id)) continue;

    compId++;
    const stack = [a.id];
    let charge = 0;
    let deficit = 0;
    const compAtoms: Atom3D[] = [];

    while (stack.length) {
      const curId = stack.pop()!;
      if (compByAtomId.has(curId)) continue;

      const cur = byId.get(curId);
      if (!cur) continue;

      compByAtomId.set(curId, compId);
      compAtoms.push(cur);
      charge += params.charges[cur.el] ?? 0;
      deficit += valenceDeficit(cur);

      const n = adj.get(curId) || [];
      for (const nid of n) {
        if (!compByAtomId.has(nid)) stack.push(nid);
      }
    }

    atomsByComp.set(compId, compAtoms);
    chargeByComp.set(compId, charge);
    deficitByComp.set(compId, deficit);
  }

  return { compByAtomId, atomsByComp, chargeByComp, deficitByComp };
}

function canBondOrder(a: Atom3D, b: Atom3D, order: BondOrder) {
  const cost = bondValenceCost(order);
  if (a.valenceUsed + cost > a.valenceMax) return false;
  if (b.valenceUsed + cost > b.valenceMax) return false;
  return true;
}

/* ------------------------------- Nonbonded LJ ------------------------------ */

function ljForce(r: number, eps: number, sig: number) {
  const inv = sig / r;
  const inv2 = inv * inv;
  const inv6 = inv2 * inv2 * inv2;
  const inv12 = inv6 * inv6;
  return (24 * eps * (2 * inv12 - inv6)) / r;
}

export function ljPotential(r: number, eps: number, sig: number) {
  const inv = sig / r;
  const inv2 = inv * inv;
  const inv6 = inv2 * inv2 * inv2;
  const inv12 = inv6 * inv6;
  return 4 * eps * (inv12 - inv6);
}

export function mixLorentzBerthelot(lj: LJPerElement, a: ElementKey, b: ElementKey) {
  const sa = lj[a].sigma;
  const sb = lj[b].sigma;
  const ea = lj[a].epsilon;
  const eb = lj[b].epsilon;

  const sigma = 0.5 * (sa + sb);
  const epsilon = Math.sqrt(Math.max(0, ea) * Math.max(0, eb));
  return { sigma, epsilon };
}

/* -------------------------- Screened Electrostatics -------------------------
 * Yukawa / Debye screened Coulomb:
 *   U(r) = ke * qi*qj * exp(-r/lambda) / r
 *   F(r) = ke * qi*qj * exp(-r/lambda) * (1/r^2 + 1/(lambda*r))
 * Force is along r-hat.
 */

function yukawaForce(
  r: number,
  ke: number,
  qi: number,
  qj: number,
  lambda: number,
  electroRepulsionScale = 2.2,
  electroAttractionScale = 2.0
) {
  const qq = qi * qj;
  if (Math.abs(qq) < 1e-9) return 0;
  const lam = Math.max(1e-3, lambda);
  const e = Math.exp(-r / lam);
  const invR = 1 / r;
  const invR2 = invR * invR;
  const signScale = qq > 0
    ? Math.max(0, electroRepulsionScale)
    : Math.max(0, electroAttractionScale);
  return ke * qq * signScale * e * (invR2 + invR / lam);
}

/* --------------------------------- Bonds ---------------------------------- */

function pruneBrokenBonds(sim: Sim3D, params: Params3D, dt: number) {
  const FULL_SHELL_BREAK_STRETCH = 1.34;
  const PARTIAL_SHELL_BREAK_STRETCH = 1.16;
  const STABLE_MOLECULE_BREAK_STRETCH = 1.24;
  const SEMISTABLE_MOLECULE_BREAK_STRETCH = 1.12;
  const BREAK_OUTWARD_VEL_MIN = 0.24;
  const NEUTRAL_EPS = 0.12;
  const NEAR_NEUTRAL_EPS = 0.25;
  const usePeriodic = Boolean(params.usePeriodicBoundary);
  const barrierScale = Math.max(0.2, params.reactionBarrierScale ?? 1.0);
  const attemptRate = Math.max(0, params.reactionAttemptRate ?? 1.0);
  const temp = Math.max(0.03, getReducedTemperature(params));
  const byId = new Map<number, Atom3D>();
  for (const atom of sim.atoms) byId.set(atom.id, atom);

  const mol = buildMoleculeState(sim, params);

  const kept: Bond3D[] = [];
  for (const b of sim.bonds) {
    const a = byId.get(b.aId);
    const c = byId.get(b.bId);
    if (!a || !c) continue;

    const delta = displacement(
      a.x,
      a.y,
      a.z,
      c.x,
      c.y,
      c.z,
      params.boxHalfSize,
      usePeriodic,
    );
    const { dx, dy, dz } = delta;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;

    const fullA = hasFullShell(a);
    const fullC = hasFullShell(c);
    const barrierMult = fullA && fullC
      ? FULL_SHELL_BREAK_STRETCH
      : fullA || fullC
      ? PARTIAL_SHELL_BREAK_STRETCH
      : 1.0;
    let molBarrierMult = 1.0;
    const compId = mol.compByAtomId.get(a.id);
    if (compId !== undefined && compId === mol.compByAtomId.get(c.id)) {
      const compChargeAbs = Math.abs(mol.chargeByComp.get(compId) ?? 0);
      const compDeficit = mol.deficitByComp.get(compId) ?? 0;
      const compSize = (mol.atomsByComp.get(compId) || []).length;
      if (compDeficit <= 0 && compChargeAbs <= NEUTRAL_EPS) molBarrierMult = STABLE_MOLECULE_BREAK_STRETCH;
      else if (compChargeAbs <= NEAR_NEUTRAL_EPS) molBarrierMult = SEMISTABLE_MOLECULE_BREAK_STRETCH;
      if (compSize >= 10) molBarrierMult *= 0.98;
      else if (compSize >= 6) molBarrierMult *= 1.0;
    }
    const barrierBreakR = b.breakR * barrierMult * molBarrierMult;

    // Kinetic barrier: stretched bonds only break if also moving apart.
    const invR = r > 1e-8 ? 1 / r : 0;
    const ux = dx * invR;
    const uy = dy * invR;
    const uz = dz * invR;
    const rvx = c.vx - a.vx;
    const rvy = c.vy - a.vy;
    const rvz = c.vz - a.vz;
    const outwardSpeed = rvx * ux + rvy * uy + rvz * uz;

    if (r > barrierBreakR && outwardSpeed > BREAK_OUTWARD_VEL_MIN) {
      const barriers = getPairReactionBarrier(a.el, c.el);
      const arrhenius = Math.exp(-(barriers.break * barrierScale) / temp);
      const pBreak = clamp(1 - Math.exp(-attemptRate * arrhenius * dt * 60), 0, 1);
      if (Math.random() > pBreak) {
        kept.push(b);
        continue;
      }
      const cost = bondValenceCost(b.order);
      a.valenceUsed = Math.max(0, a.valenceUsed - cost);
      c.valenceUsed = Math.max(0, c.valenceUsed - cost);
      continue;
    }
    kept.push(b);
  }
  sim.bonds = kept;
}

function chooseBondOrder(d: number, r0Single: number, allowMultiple: boolean): BondOrder {
  if (!allowMultiple) return 1;
  if (d < r0Single * 0.8) return 3;
  if (d < r0Single * 0.9) return 2;
  return 1;
}

function chooseBondOrderWithOctetBias(
  a: Atom3D,
  b: Atom3D,
  d: number,
  r0Single: number,
  allowMultiple: boolean,
  neutralityGain = 0,
  compNeedA = 0,
  compNeedB = 0
): BondOrder | null {
  const baseline = chooseBondOrder(d, r0Single, allowMultiple);
  const maxOrder = allowMultiple ? 3 : 1;

  const deficitA = valenceDeficit(a);
  const deficitB = valenceDeficit(b);
  const deficitNow = deficitA + deficitB;
  if (deficitNow <= 0) return null;

  const desired = clamp(Math.min(deficitA, deficitB), 1, maxOrder) as BondOrder;

  let bestOrder: BondOrder | null = null;
  let bestScore = -Infinity;

  for (let order = 1 as BondOrder; order <= maxOrder; order = (order + 1) as BondOrder) {
    if (!canBondOrder(a, b, order)) continue;

    const remainingA = Math.max(0, deficitA - order);
    const remainingB = Math.max(0, deficitB - order);
    const octetGain = deficitNow - (remainingA + remainingB);
    if (octetGain <= 0) continue;

    const r0 = orderAdjustedR0(r0Single, order);
    const strain = Math.abs(d - r0) / Math.max(1e-6, r0Single);
    const baselinePenalty = Math.abs(order - baseline);
    const desiredPenalty = Math.abs(order - desired);
    const multiBondPenalty =
      (order - 1) * (0.85 + Math.max(0, deficitNow - 2) * 0.2);

    const compNeed = compNeedA + compNeedB;
    const compNeedBoost = Math.min(3, compNeed) * 0.25;
    const score =
      octetGain * 5 +
      neutralityGain * 2.4 +
      compNeedBoost -
      strain * 2 -
      multiBondPenalty -
      baselinePenalty * 0.5 -
      desiredPenalty * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  }

  return bestOrder;
}

function tryFormBonds(sim: Sim3D, params: Params3D, dt: number) {
  const FORM_FACTOR = 1.24;
  const REL_SPEED_MAX = 4.4;
  const baseEventCap = Math.max(
    1,
    Math.floor(params.maxReactionEventsPerStep ?? 10),
  );
  const atomCount = sim.atoms.length;
  const crowdBoost = atomCount >= 180 ? 2.0 : atomCount >= 140 ? 1.7 : atomCount >= 90 ? 1.4 : 1.0;
  const MAX_NEW_BONDS_PER_STEP = Math.max(
    1,
    Math.floor(baseEventCap * crowdBoost),
  );
  const STABLE_CHARGE_EPS = 0.12;
  const usePeriodic = Boolean(params.usePeriodicBoundary);
  const barrierScale = Math.max(0.2, params.reactionBarrierScale ?? 1.0);
  const attemptRate = Math.max(0, params.reactionAttemptRate ?? 1.0);
  const temp = Math.max(0.03, getReducedTemperature(params));

  const mol = buildMoleculeState(sim, params);
  const reactionCutoff = Math.max(
    params.reactionCutoff ?? params.cutoff,
    Math.min(params.cutoff, 2.2),
  );
  const pairCandidates = buildNeighborPairs(
    sim.atoms,
    reactionCutoff,
    params.minR,
    params.boxHalfSize,
    usePeriodic,
  );
  const bondSet = new Set<string>();
  for (const b of sim.bonds) {
    const lo = Math.min(b.aId, b.bId);
    const hi = Math.max(b.aId, b.bId);
    bondSet.add(`${lo}:${hi}`);
  }

  let made = 0;

  for (const pair of pairCandidates) {
    const ai = sim.atoms[pair.i];
    const aj = sim.atoms[pair.j];
    if (!ai || !aj) continue;
    if (ai.valenceUsed >= ai.valenceMax) continue;
    if (aj.valenceUsed >= aj.valenceMax) continue;
    const lo = Math.min(ai.id, aj.id);
    const hi = Math.max(ai.id, aj.id);
    if (bondSet.has(`${lo}:${hi}`)) continue;

    const { r0: r0Single, kLit } = getPairBondParam(ai.el, aj.el);
    let electroBias = 1.0;
    if (params.enableElectrostatics) {
      const qi = params.charges[ai.el] ?? 0;
      const qj = params.charges[aj.el] ?? 0;
      const qq = qi * qj;
      const biasStrength = clamp(params.electroBondBiasStrength ?? 0.7, 0, 2);
      const mag = Math.min(1, Math.abs(qq) / 0.08);
      if (qq < 0) electroBias = 1 + 0.5 * biasStrength * mag;
      else if (qq > 0) electroBias = 1 - 0.35 * biasStrength * mag;
    }

    const formR = r0Single * FORM_FACTOR * getPairFormationBias(ai.el, aj.el) * electroBias;
    if (pair.r2 > formR * formR) continue;

    const d = pair.r;

    const compA = mol.compByAtomId.get(ai.id);
    const compB = mol.compByAtomId.get(aj.id);
    const chargeA = compA ? (mol.chargeByComp.get(compA) ?? 0) : 0;
    const chargeB = compB ? (mol.chargeByComp.get(compB) ?? 0) : 0;
    const defAComp = compA ? (mol.deficitByComp.get(compA) ?? 0) : valenceDeficit(ai);
    const defBComp = compB ? (mol.deficitByComp.get(compB) ?? 0) : valenceDeficit(aj);
    const sameComp = compA !== undefined && compA === compB;

    // Heavily suppress fusion of already-stable neutral fragments, but do not
    // hard-block it. At elevated temperature this allows rare rearrangement paths
    // needed to assemble larger molecules.
    let stableFusionPenalty = 1.0;
    if (!sameComp && defAComp <= 0 && defBComp <= 0) {
      if (Math.abs(chargeA) <= STABLE_CHARGE_EPS && Math.abs(chargeB) <= STABLE_CHARGE_EPS) {
        const closeFactor = clamp(1 - d / Math.max(1e-6, formR), 0, 1);
        const hotFactor = clamp((temp - 1.0) / 1.6, 0, 1);
        stableFusionPenalty = 0.08 + 0.72 * hotFactor + 0.2 * closeFactor;
        if (hotFactor < 0.08 && d > r0Single * 0.92) continue;
      }
    }

    let neutralityGain = 0;
    if (!sameComp) neutralityGain = Math.abs(chargeA) + Math.abs(chargeB) - Math.abs(chargeA + chargeB);

    const rvx = ai.vx - aj.vx;
    const rvy = ai.vy - aj.vy;
    const rvz = ai.vz - aj.vz;
    const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    const tempSpeedBoost = 1 + Math.min(0.9, Math.sqrt(temp) * 0.24);
    const relSpeedMax = REL_SPEED_MAX * tempSpeedBoost * (electroBias > 1 ? 1.12 : 1.0);
    if (relSpeed > relSpeedMax) continue;

    const barriers = getPairReactionBarrier(ai.el, aj.el);
    const arrhenius = Math.exp(-(barriers.form * barrierScale) / temp);
    const deficitBoost = 1 + Math.min(1.2, 0.14 * (defAComp + defBComp));
    const neutralityBoost = 1 + Math.min(0.8, Math.max(0, neutralityGain) * 0.55);
    const pForm = clamp(
      1 - Math.exp(
        -attemptRate *
          arrhenius *
          deficitBoost *
          neutralityBoost *
          stableFusionPenalty *
          dt *
          60,
      ),
      0,
      1,
    );
    if (Math.random() > pForm) continue;

    const order = chooseBondOrderWithOctetBias(
      ai,
      aj,
      d,
      r0Single,
      params.allowMultipleBonds,
      neutralityGain,
      defAComp,
      defBComp
    );
    if (!order) continue;

    const kSingle = kLit * K_SCALE * params.bondScale;
    const r0 = orderAdjustedR0(r0Single, order);
    const k = orderAdjustedK(kSingle, order);

    const BREAK_FACTOR = 1.75;
    const breakR = r0 * BREAK_FACTOR;

    sim.bonds.push({ aId: ai.id, bId: aj.id, order, r0, k, breakR });
    bondSet.add(`${lo}:${hi}`);

    const cost = bondValenceCost(order);
    ai.valenceUsed += cost;
    aj.valenceUsed += cost;

    made++;
    if (made >= MAX_NEW_BONDS_PER_STEP) return;
  }
}

function applyTemperatureEquilibration(sim: Sim3D, params: Params3D) {
  const targetReducedTemp = getReducedTemperature(params);
  if (targetReducedTemp <= 0) return;
  if (sim.atoms.length === 0) return;

  const interval = Math.max(1, Math.floor(params.thermostatInterval ?? 20));
  if (sim.stepCount % interval !== 0) return;

  // Remove translational drift so thermostat acts on internal thermal motion.
  removeCenterOfMassDrift(sim.atoms);

  let kinetic = 0;
  for (const a of sim.atoms) {
    const v2 = a.vx * a.vx + a.vy * a.vy + a.vz * a.vz;
    kinetic += 0.5 * Math.max(0.1, a.mass) * v2;
  }

  const currentPerAtom = kinetic / Math.max(1, sim.atoms.length);
  const targetPerAtom = Math.max(1e-6, targetReducedTemp);
  if (currentPerAtom <= 1e-12) return;

  const idealScale = Math.sqrt(targetPerAtom / currentPerAtom);
  const strength = clamp(params.thermostatStrength ?? 0.25, 0, 1);
  let scale = 1 + (idealScale - 1) * strength;

  const clampFrac = Math.max(0.05, params.thermostatClamp ?? 0.2);
  scale = clamp(scale, 1 - clampFrac, 1 + clampFrac);

  for (const a of sim.atoms) {
    a.vx *= scale;
    a.vy *= scale;
    a.vz *= scale;
  }

  // Numerical safety: keep system drift-free after rescaling.
  removeCenterOfMassDrift(sim.atoms);
}

function removeCenterOfMassDrift(atoms: Atom3D[]) {
  if (atoms.length === 0) return;

  let mTot = 0;
  let px = 0;
  let py = 0;
  let pz = 0;

  for (const a of atoms) {
    const m = Math.max(0.1, a.mass);
    mTot += m;
    px += m * a.vx;
    py += m * a.vy;
    pz += m * a.vz;
  }
  if (mTot <= 1e-12) return;

  const vxCom = px / mTot;
  const vyCom = py / mTot;
  const vzCom = pz / mTot;

  for (const a of atoms) {
    a.vx -= vxCom;
    a.vy -= vyCom;
    a.vz -= vzCom;
  }
}

export function setGrab(sim: Sim3D, id: number | null) {
  sim.grabbedId = id;
  if (id === null) sim.grabTarget = null;
}

export function setGrabTarget(sim: Sim3D, x: number, y: number, z: number) {
  sim.grabTarget = { x, y, z };
}

export function recomputeBondOrders(sim: Sim3D, params: Params3D) {
  recomputeValenceUsage(sim);
  const byId = new Map<number, Atom3D>();
  for (const atom of sim.atoms) byId.set(atom.id, atom);

  const allow = params.allowMultipleBonds;

  const UP_1_TO_2 = 0.92;
  const DOWN_2_TO_1 = 0.97;

  const UP_2_TO_3 = 0.85;
  const DOWN_3_TO_2 = 0.9;

  const BREAK_FACTOR = 1.75;

  for (const b of sim.bonds) {
    const a = byId.get(b.aId);
    const c = byId.get(b.bId);
    if (!a || !c) continue;

    const delta = displacement(
      a.x,
      a.y,
      a.z,
      c.x,
      c.y,
      c.z,
      params.boxHalfSize,
      Boolean(params.usePeriodicBoundary),
    );
    const d = Math.sqrt(
      delta.dx * delta.dx + delta.dy * delta.dy + delta.dz * delta.dz,
    ) || 1e-6;

    const { r0: r0Single, kLit } = getPairBondParam(a.el, c.el);

    let target: BondOrder = b.order;

    if (!allow) {
      target = 1;
    } else {
      if (b.order === 1) {
        const gain2 = Math.min(valenceDeficit(a), valenceDeficit(c)) >= 2;
        const compressed = d < r0Single * UP_1_TO_2;
        const mildCompressedWithNeed = gain2 && d < r0Single * 0.98;
        if (compressed || mildCompressedWithNeed) target = 2;
      } else if (b.order === 2) {
        const gain3 = Math.min(valenceDeficit(a), valenceDeficit(c)) >= 3;
        const stronglyCompressed = d < r0Single * UP_2_TO_3;
        const compressedWithNeed = gain3 && d < r0Single * 0.9;
        if (stronglyCompressed || compressedWithNeed) target = 3;
        else if (d > r0Single * DOWN_2_TO_1) target = 1;
      } else if (b.order === 3) {
        if (d > r0Single * DOWN_3_TO_2) target = 2;
      }
    }

    if (target > b.order) {
      const delta = target - b.order;
      if (a.valenceUsed + delta > a.valenceMax || c.valenceUsed + delta > c.valenceMax) {
        let tryOrder: BondOrder = target;
        while (tryOrder > b.order) {
          const d2 = tryOrder - b.order;
          if (a.valenceUsed + d2 <= a.valenceMax && c.valenceUsed + d2 <= c.valenceMax) break;
          tryOrder = (tryOrder - 1) as BondOrder;
        }
        target = tryOrder;
      }
    }

    if (target !== b.order) {
      const old = b.order;
      const delta = target - old;
      a.valenceUsed = Math.max(0, a.valenceUsed + delta);
      c.valenceUsed = Math.max(0, c.valenceUsed + delta);
      b.order = target;
    }

    const kSingle = kLit * K_SCALE * params.bondScale;
    b.r0 = orderAdjustedR0(r0Single, b.order);
    b.k = orderAdjustedK(kSingle, b.order);
    b.breakR = b.r0 * BREAK_FACTOR;
  }

  recomputeValenceUsage(sim);
  rebuildDihedrals(sim, params);
}

/* --------------------------------- Angles --------------------------------- */

function buildNeighbors(sim: Sim3D): Map<number, Neighbor[]> {
  const map = new Map<number, Neighbor[]>();
  for (const b of sim.bonds) {
    if (!map.has(b.aId)) map.set(b.aId, []);
    if (!map.has(b.bId)) map.set(b.bId, []);
    map.get(b.aId)!.push({ id: b.bId, order: b.order });
    map.get(b.bId)!.push({ id: b.aId, order: b.order });
  }
  return map;
}

function targetAngleRad(j: Atom3D, neigh: Neighbor[] | undefined): number {
  const n = neigh?.length ?? 0;
  const hasMultiple = !!neigh?.some((x) => x.order >= 2);

  switch (j.el) {
    case "O":
      return degToRad(104.5);
    case "N":
      if (hasMultiple || n === 2) return degToRad(120);
      if (n === 3) return degToRad(107);
      return degToRad(109.5);
    case "C":
      if (hasMultiple) return degToRad(120);
      return degToRad(109.5);
    case "P":
      if (hasMultiple) return degToRad(110);
      return degToRad(109.5);
    case "S":
      if (n <= 2) return degToRad(100);
      return degToRad(109.5);
    case "H":
    default:
      return degToRad(109.5);
  }
}

function applyAngleForces(sim: Sim3D, params: Params3D) {
  if (sim.bonds.length < 2) return;

  const neighbors = buildNeighbors(sim);
  const kBase = Math.max(0, params.angleK);
  if (kBase <= 1e-9) return;

  const cap = Math.max(0.1, params.angleForceCap);
  const eps = 1e-6;

  const byId = new Map<number, Atom3D>();
  for (const a of sim.atoms) byId.set(a.id, a);

  const capVec = (x: number, y: number, z: number) => {
    const m = Math.sqrt(x * x + y * y + z * z) || 0;
    if (m <= cap) return { x, y, z };
    const s = cap / m;
    return { x: x * s, y: y * s, z: z * s };
  };

  for (const [jId, neigh] of neighbors.entries()) {
    if (neigh.length < 2) continue;

    const j = byId.get(jId);
    if (!j) continue;

    const theta0 = targetAngleRad(j, neigh);
    const hasMultiple = neigh.some((x) => x.order >= 2);
    const kTheta = kBase * (hasMultiple ? 1.25 : 1.0);

    for (let aIdx = 0; aIdx < neigh.length - 1; aIdx++) {
      const i = byId.get(neigh[aIdx].id);
      if (!i) continue;

      const d1 = displacement(
        j.x,
        j.y,
        j.z,
        i.x,
        i.y,
        i.z,
        params.boxHalfSize,
        Boolean(params.usePeriodicBoundary),
      );
      const r1x = d1.dx;
      const r1y = d1.dy;
      const r1z = d1.dz;
      const r1sq = r1x * r1x + r1y * r1y + r1z * r1z;
      const r1 = Math.sqrt(r1sq) + eps;

      for (let bIdx = aIdx + 1; bIdx < neigh.length; bIdx++) {
        const k = byId.get(neigh[bIdx].id);
        if (!k) continue;

        const d2 = displacement(
          j.x,
          j.y,
          j.z,
          k.x,
          k.y,
          k.z,
          params.boxHalfSize,
          Boolean(params.usePeriodicBoundary),
        );
        const r2x = d2.dx;
        const r2y = d2.dy;
        const r2z = d2.dz;
        const r2sq = r2x * r2x + r2y * r2y + r2z * r2z;
        const r2 = Math.sqrt(r2sq) + eps;

        const dot = r1x * r2x + r1y * r2y + r1z * r2z;
        let cosT = dot / (r1 * r2);
        cosT = clamp(cosT, -0.999999, 0.999999);

        const theta = Math.acos(cosT);
        const dTheta = theta - theta0;

        const dUdTheta = kTheta * dTheta;

        const sinT = Math.sqrt(Math.max(1 - cosT * cosT, 1e-8));
        const dUdCos = dUdTheta * (-1 / sinT);

        const invR1 = 1 / r1;
        const invR2 = 1 / r2;
        const common = invR1 * invR2;

        const invR1sq = invR1 * invR1;
        const invR2sq = invR2 * invR2;

        const dcos1x = r2x * common - cosT * r1x * invR1sq;
        const dcos1y = r2y * common - cosT * r1y * invR1sq;
        const dcos1z = r2z * common - cosT * r1z * invR1sq;

        const dcos2x = r1x * common - cosT * r2x * invR2sq;
        const dcos2y = r1y * common - cosT * r2y * invR2sq;
        const dcos2z = r1z * common - cosT * r2z * invR2sq;

        let Fix = -dUdCos * dcos1x;
        let Fiy = -dUdCos * dcos1y;
        let Fiz = -dUdCos * dcos1z;

        let Fkx = -dUdCos * dcos2x;
        let Fky = -dUdCos * dcos2y;
        let Fkz = -dUdCos * dcos2z;

        let Fjx = -(Fix + Fkx);
        let Fjy = -(Fiy + Fky);
        let Fjz = -(Fiz + Fkz);

        ({ x: Fix, y: Fiy, z: Fiz } = capVec(Fix, Fiy, Fiz));
        ({ x: Fkx, y: Fky, z: Fkz } = capVec(Fkx, Fky, Fkz));
        ({ x: Fjx, y: Fjy, z: Fjz } = capVec(Fjx, Fjy, Fjz));

        i.fx += Fix; i.fy += Fiy; i.fz += Fiz;
        k.fx += Fkx; k.fy += Fky; k.fz += Fkz;
        j.fx += Fjx; j.fy += Fjy; j.fz += Fjz;
      }
    }
  }
}

/* -------------------------------- Dihedrals -------------------------------- */

type DihedralParam = { k: number; n: number; deltaDeg: number };

// Basic torsions (toy)
const DIHEDRAL_PARAMS: Partial<Record<PairKey, DihedralParam>> = {
  "C-C": { k: 0.35, n: 3, deltaDeg: 0 },
  "C-N": { k: 0.30, n: 3, deltaDeg: 0 },
  "C-O": { k: 0.22, n: 3, deltaDeg: 0 },
  "N-N": { k: 0.24, n: 3, deltaDeg: 0 },
  "C-S": { k: 0.18, n: 3, deltaDeg: 0 },
  "C-P": { k: 0.18, n: 3, deltaDeg: 0 },
  "P-S": { k: 0.14, n: 3, deltaDeg: 0 },
};

function getDihedralParam(a: ElementKey, b: ElementKey): DihedralParam | null {
  const key = pairKey(a, b);
  const p = DIHEDRAL_PARAMS[key];
  return p || null;
}

function cross(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  return { x: ay * bz - az * by, y: az * bx - ax * bz, z: ax * by - ay * bx };
}
function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  return ax * bx + ay * by + az * bz;
}
function norm(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

function computeDihedralPhi(
  i: Atom3D,
  j: Atom3D,
  k: Atom3D,
  l: Atom3D,
  params: Params3D,
): { phi: number; ok: boolean } {
  const d12 = displacement(
    j.x,
    j.y,
    j.z,
    i.x,
    i.y,
    i.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const d23 = displacement(
    k.x,
    k.y,
    k.z,
    j.x,
    j.y,
    j.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const d34 = displacement(
    l.x,
    l.y,
    l.z,
    k.x,
    k.y,
    k.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const r12x = d12.dx, r12y = d12.dy, r12z = d12.dz;
  const r23x = d23.dx, r23y = d23.dy, r23z = d23.dz;
  const r34x = d34.dx, r34y = d34.dy, r34z = d34.dz;

  const A = cross(r12x, r12y, r12z, r23x, r23y, r23z);
  const B = cross(r34x, r34y, r34z, r23x, r23y, r23z);

  const r23mag = norm(r23x, r23y, r23z);
  const Amag = norm(A.x, A.y, A.z);
  const Bmag = norm(B.x, B.y, B.z);
  if (r23mag < 1e-8 || Amag < 1e-10 || Bmag < 1e-10) return { phi: 0, ok: false };

  const x = dot(A.x, A.y, A.z, B.x, B.y, B.z);
  const y = r23mag * dot(r12x, r12y, r12z, B.x, B.y, B.z);
  return { phi: Math.atan2(y, x), ok: true };
}

function dihedralForces(
  i: Atom3D,
  j: Atom3D,
  k: Atom3D,
  l: Atom3D,
  dUdPhi: number,
  params: Params3D,
) {
  const d12 = displacement(
    j.x,
    j.y,
    j.z,
    i.x,
    i.y,
    i.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const d23 = displacement(
    k.x,
    k.y,
    k.z,
    j.x,
    j.y,
    j.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const d34 = displacement(
    l.x,
    l.y,
    l.z,
    k.x,
    k.y,
    k.z,
    params.boxHalfSize,
    Boolean(params.usePeriodicBoundary),
  );
  const r12x = d12.dx, r12y = d12.dy, r12z = d12.dz;
  const r23x = d23.dx, r23y = d23.dy, r23z = d23.dz;
  const r34x = d34.dx, r34y = d34.dy, r34z = d34.dz;

  const A = cross(r12x, r12y, r12z, r23x, r23y, r23z);
  const B = cross(r34x, r34y, r34z, r23x, r23y, r23z);

  const r23mag = norm(r23x, r23y, r23z);
  const r23mag2 = r23x * r23x + r23y * r23y + r23z * r23z;

  const Amag2 = A.x * A.x + A.y * A.y + A.z * A.z;
  const Bmag2 = B.x * B.x + B.y * B.y + B.z * B.z;

  if (r23mag < 1e-8 || Amag2 < 1e-12 || Bmag2 < 1e-12) {
    return { fi: { x: 0, y: 0, z: 0 }, fj: { x: 0, y: 0, z: 0 }, fk: { x: 0, y: 0, z: 0 }, fl: { x: 0, y: 0, z: 0 }, ok: false };
  }

  const sA = -r23mag / Amag2;
  const dphidr1x = sA * A.x, dphidr1y = sA * A.y, dphidr1z = sA * A.z;

  const sB = +r23mag / Bmag2;
  const dphidr4x = sB * B.x, dphidr4y = sB * B.y, dphidr4z = sB * B.z;

  const dot12_23 = dot(r12x, r12y, r12z, r23x, r23y, r23z);
  const dot34_23 = dot(r34x, r34y, r34z, r23x, r23y, r23z);

  const c1 = dot12_23 / r23mag2;
  const c2 = dot34_23 / r23mag2;

  const dphidr2x = -dphidr1x + c1 * dphidr1x - c2 * dphidr4x;
  const dphidr2y = -dphidr1y + c1 * dphidr1y - c2 * dphidr4y;
  const dphidr2z = -dphidr1z + c1 * dphidr1z - c2 * dphidr4z;

  const dphidr3x = -dphidr4x - c1 * dphidr1x + c2 * dphidr4x;
  const dphidr3y = -dphidr4y - c1 * dphidr1y + c2 * dphidr4y;
  const dphidr3z = -dphidr4z - c1 * dphidr1z + c2 * dphidr4z;

  const fi = { x: -dUdPhi * dphidr1x, y: -dUdPhi * dphidr1y, z: -dUdPhi * dphidr1z };
  const fl = { x: -dUdPhi * dphidr4x, y: -dUdPhi * dphidr4y, z: -dUdPhi * dphidr4z };
  const fj = { x: -dUdPhi * dphidr2x, y: -dUdPhi * dphidr2y, z: -dUdPhi * dphidr2z };
  const fk = { x: -dUdPhi * dphidr3x, y: -dUdPhi * dphidr3y, z: -dUdPhi * dphidr3z };

  return { fi, fj, fk, fl, ok: true };
}

export function rebuildDihedrals(sim: Sim3D, params: Params3D) {
  if (!params.enableDihedrals) {
    sim.dihedrals = [];
    return;
  }

  const neigh = buildNeighbors(sim);

  const byId = new Map<number, Atom3D>();
  for (const a of sim.atoms) byId.set(a.id, a);

  const torsions: DihedralTerm[] = [];
  const seen = new Set<string>();

  for (const b of sim.bonds) {
    const j = byId.get(b.aId);
    const k = byId.get(b.bId);
    if (!j || !k) continue;

    const effectiveOrder: BondOrder = params.allowMultipleBonds ? b.order : 1;
    if (effectiveOrder !== 1) continue;

    const p = getDihedralParam(j.el, k.el);
    if (!p) continue;

    const jN = neigh.get(j.id) || [];
    const kN = neigh.get(k.id) || [];

    const jOuter = jN.filter((x) => x.id !== k.id);
    const kOuter = kN.filter((x) => x.id !== j.id);
    if (jOuter.length === 0 || kOuter.length === 0) continue;

    for (const io of jOuter) {
      for (const lo of kOuter) {
        if (io.id === lo.id) continue;

        const key = `${io.id}-${j.id}-${k.id}-${lo.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const iAtom = byId.get(io.id);
        const lAtom = byId.get(lo.id);
        if (!iAtom || !lAtom) continue;

        let kTerm = p.k;
        if (iAtom.el === "H") kTerm *= 0.65;
        if (lAtom.el === "H") kTerm *= 0.65;

        torsions.push({
          iId: io.id,
          jId: j.id,
          kId: k.id,
          lId: lo.id,
          n: p.n,
          delta: degToRad(p.deltaDeg),
          k: kTerm * Math.max(0, params.dihedralKScale),
        });
      }
    }
  }

  sim.dihedrals = torsions;
}

function applyDihedralForces(sim: Sim3D, params: Params3D) {
  if (!params.enableDihedrals) return;
  const terms = sim.dihedrals || [];
  if (!terms.length) return;

  const cap = Math.max(0.1, params.dihedralForceCap);

  const byId = new Map<number, Atom3D>();
  for (const a of sim.atoms) byId.set(a.id, a);

  const capVec = (x: number, y: number, z: number) => {
    const m = Math.sqrt(x * x + y * y + z * z) || 0;
    if (m <= cap) return { x, y, z };
    const s = cap / m;
    return { x: x * s, y: y * s, z: z * s };
  };

  for (const t of terms) {
    const i = byId.get(t.iId);
    const j = byId.get(t.jId);
    const k = byId.get(t.kId);
    const l = byId.get(t.lId);
    if (!i || !j || !k || !l) continue;
    if (t.k <= 1e-9) continue;

    const { phi, ok } = computeDihedralPhi(i, j, k, l, params);
    if (!ok) continue;

    const arg = t.n * phi - t.delta;
    let dUdPhi = -t.k * t.n * Math.sin(arg);

    // Electrostatic anti preference for terminal non-H pairs across a dihedral:
    // U_anti(phi) = kAnti * (1 + cos(phi)) -> minimum at 180 deg.
    if (params.enableElectrostatics && i.el !== "H" && l.el !== "H") {
      const qi = params.charges[i.el] ?? 0;
      const ql = params.charges[l.el] ?? 0;
      const qMag = Math.min(1, Math.abs(qi * ql) / 0.09);
      const kAntiBase = Math.max(0, params.electroDihedral180Scale ?? 0.22);
      const kAnti = kAntiBase * qMag;
      dUdPhi += -kAnti * Math.sin(phi);
    }

    const f = dihedralForces(i, j, k, l, dUdPhi, params);
    if (!f.ok) continue;

    const fi = capVec(f.fi.x, f.fi.y, f.fi.z);
    const fj = capVec(f.fj.x, f.fj.y, f.fj.z);
    const fk = capVec(f.fk.x, f.fk.y, f.fk.z);
    const fl = capVec(f.fl.x, f.fl.y, f.fl.z);

    i.fx += fi.x; i.fy += fi.y; i.fz += fi.z;
    j.fx += fj.x; j.fy += fj.y; j.fz += fj.z;
    k.fx += fk.x; k.fy += fk.y; k.fz += fk.z;
    l.fx += fl.x; l.fy += fl.y; l.fz += fl.z;
  }
}

function applyValencePenaltyForces(
  sim: Sim3D,
  params: Params3D,
  byId: Map<number, Atom3D>,
  halfBox: number,
  usePeriodic: boolean,
) {
  const kValence = Math.max(0, params.valencePenaltyK ?? 8);
  if (kValence <= 1e-9) return;
  const cap = Math.max(0.2, params.valencePenaltyForceCap ?? (params.maxPairForce * 0.8));

  for (const b of sim.bonds) {
    const a = byId.get(b.aId);
    const c = byId.get(b.bId);
    if (!a || !c) continue;

    const overA = valenceOverflow(a);
    const overC = valenceOverflow(c);
    const over = overA + overC;
    if (over <= 1e-9) continue;

    const d = displacement(
      a.x,
      a.y,
      a.z,
      c.x,
      c.y,
      c.z,
      halfBox,
      usePeriodic,
    );
    const r = Math.sqrt(d.dx * d.dx + d.dy * d.dy + d.dz * d.dz) || 1e-6;
    const invR = 1 / r;
    const fmag = clamp(kValence * over, 0, cap);
    const fx = fmag * d.dx * invR;
    const fy = fmag * d.dy * invR;
    const fz = fmag * d.dz * invR;

    // Repulsive split to unwind over-coordinated local environments.
    a.fx -= fx; a.fy -= fy; a.fz -= fz;
    c.fx += fx; c.fy += fy; c.fz += fz;
  }
}

/* ----------------------------------- Step ---------------------------------- */

export function stepSim3D(sim: Sim3D, params: Params3D, dt: number) {
  const atoms = sim.atoms;
  sim.stepCount += 1;
  if (atoms.length === 0) return;
  recomputeValenceUsage(sim);

  const safeDt = Math.max(1e-6, dt);
  const usePeriodic = Boolean(params.usePeriodicBoundary);
  const halfBox = Math.max(0.5, params.boxHalfSize);
  const useLangevin = Boolean(params.useLangevin);
  const reducedTemp = getReducedTemperature(params);
  const switchStart = Math.max(
    params.minR,
    params.cutoff * clamp(params.cutoffSwitchRatio ?? 0.85, 0.5, 0.98),
  );
  const bondedPairScales = buildBondedPairScales(sim, params);
  const atomById = new Map<number, Atom3D>();
  for (const atom of atoms) atomById.set(atom.id, atom);

  const applyForces = () => {
    for (const a of atoms) {
      a.fx = 0;
      a.fy = 0;
      a.fz = 0;
    }

    const neighbors = buildNeighborPairs(
      atoms,
      params.cutoff,
      params.minR,
      halfBox,
      usePeriodic,
    );
    for (const pair of neighbors) {
      const ai = atoms[pair.i];
      const aj = atoms[pair.j];
      const { dx, dy, dz, r } = pair;
      const wCut = smoothCutoffWeight(r, params.cutoff, switchStart);
      if (wCut <= 1e-8) continue;
      const pairScale = bondedPairScales.get(pairIdKey(ai.id, aj.id));
      const ljScale = pairScale?.lj ?? 1;
      const electroScale = pairScale?.electro ?? 1;

      const mixed = mixLorentzBerthelot(params.lj, ai.el, aj.el);
      if (mixed.epsilon > 1e-6 && ljScale > 1e-8) {
        let fmag = ljForce(r, mixed.epsilon, mixed.sigma);
        fmag *= ljScale * wCut;
        fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);
        const invR = 1 / r;
        const fx = fmag * dx * invR;
        const fy = fmag * dy * invR;
        const fz = fmag * dz * invR;
        ai.fx -= fx; ai.fy -= fy; ai.fz -= fz;
        aj.fx += fx; aj.fy += fy; aj.fz += fz;
      }

      if (params.enableElectrostatics && electroScale > 1e-8) {
        const qi = params.charges[ai.el] ?? 0;
        const qj = params.charges[aj.el] ?? 0;
        if (Math.abs(qi * qj) > 1e-9 && params.ke !== 0) {
          let fmagE = yukawaForce(
            r,
            params.ke,
            qi,
            qj,
            params.screeningLength,
            params.electroRepulsionScale ?? 2.2,
            params.electroAttractionScale ?? 2.0,
          );
          fmagE *= electroScale * wCut;
          fmagE = clamp(fmagE, -params.maxPairForce, params.maxPairForce);
          const invR = 1 / r;
          const fx = fmagE * dx * invR;
          const fy = fmagE * dy * invR;
          const fz = fmagE * dz * invR;
          ai.fx -= fx; ai.fy -= fy; ai.fz -= fz;
          aj.fx += fx; aj.fy += fy; aj.fz += fz;
        }
      }
    }

    for (const b of sim.bonds) {
      const a = atomById.get(b.aId);
      const c = atomById.get(b.bId);
      if (!a || !c) continue;

      const d = displacement(
        a.x,
        a.y,
        a.z,
        c.x,
        c.y,
        c.z,
        halfBox,
        usePeriodic,
      );
      const r = Math.sqrt(d.dx * d.dx + d.dy * d.dy + d.dz * d.dz) || 1e-6;

      let fmag = b.k * (r - b.r0);
      fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);
      const invR = 1 / r;
      const fx = fmag * d.dx * invR;
      const fy = fmag * d.dy * invR;
      const fz = fmag * d.dz * invR;

      a.fx += fx; a.fy += fy; a.fz += fz;
      c.fx -= fx; c.fy -= fy; c.fz -= fz;
    }

    applyAngleForces(sim, params);
    applyDihedralForces(sim, params);
    applyValencePenaltyForces(sim, params, atomById, halfBox, usePeriodic);

    if (!usePeriodic) {
      const S = halfBox;
      for (const a of atoms) {
        const left = -S + params.wallPadding + a.r;
        const right = S - params.wallPadding - a.r;
        const bottom = -S + params.wallPadding + a.r;
        const top = S - params.wallPadding - a.r;
        const back = -S + params.wallPadding + a.r;
        const front = S - params.wallPadding - a.r;

        if (a.x < left) a.fx += (left - a.x) * params.wallK;
        if (a.x > right) a.fx -= (a.x - right) * params.wallK;
        if (a.y < bottom) a.fy += (bottom - a.y) * params.wallK;
        if (a.y > top) a.fy -= (a.y - top) * params.wallK;
        if (a.z < back) a.fz += (back - a.z) * params.wallK;
        if (a.z > front) a.fz -= (a.z - front) * params.wallK;
      }
    }

    if (sim.grabbedId && sim.grabTarget) {
      const g = atomById.get(sim.grabbedId);
      if (g) {
        let dx = sim.grabTarget.x - g.x;
        let dy = sim.grabTarget.y - g.y;
        let dz = sim.grabTarget.z - g.z;
        if (usePeriodic) {
          dx = minimumImage(dx, halfBox);
          dy = minimumImage(dy, halfBox);
          dz = minimumImage(dz, halfBox);
        }

        let fx = dx * params.grabK - g.vx * 1.1;
        let fy = dy * params.grabK - g.vy * 1.1;
        let fz = dz * params.grabK - g.vz * 1.1;
        const mag = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1e-6;
        if (mag > params.grabMaxForce) {
          const s = params.grabMaxForce / mag;
          fx *= s; fy *= s; fz *= s;
        }
        g.fx += fx; g.fy += fy; g.fz += fz;
      }
    }
  };

  applyForces();

  // Velocity Verlet half-kick + drift
  for (const a of atoms) {
    const invMass = 1 / Math.max(0.1, a.mass);
    a.vx += 0.5 * a.fx * invMass * safeDt;
    a.vy += 0.5 * a.fy * invMass * safeDt;
    a.vz += 0.5 * a.fz * invMass * safeDt;

    a.x += a.vx * safeDt;
    a.y += a.vy * safeDt;
    a.z += a.vz * safeDt;

    if (usePeriodic) {
      a.x = wrapPeriodicCoordinate(a.x, halfBox);
      a.y = wrapPeriodicCoordinate(a.y, halfBox);
      a.z = wrapPeriodicCoordinate(a.z, halfBox);
    }
  }

  applyForces();

  // Velocity Verlet half-kick
  for (const a of atoms) {
    const invMass = 1 / Math.max(0.1, a.mass);
    a.vx += 0.5 * a.fx * invMass * safeDt;
    a.vy += 0.5 * a.fy * invMass * safeDt;
    a.vz += 0.5 * a.fz * invMass * safeDt;
  }

  if (useLangevin && (params.langevinGamma ?? 0) > 0) {
    const gamma = Math.max(0, params.langevinGamma ?? 0);
    const temp = Math.max(0, reducedTemp);
    const thermalScale = Math.max(0, params.tempVelKick);

    let mTot = 0;
    let dPx = 0;
    let dPy = 0;
    let dPz = 0;

    for (const a of atoms) {
      const m = Math.max(0.1, a.mass);
      const drag = Math.max(0, 1 - gamma * safeDt);
      a.vx *= drag;
      a.vy *= drag;
      a.vz *= drag;

      if (temp > 0 && thermalScale > 0) {
        const sigma = Math.sqrt((2 * gamma * temp * thermalScale * safeDt) / m);
        const dvx = sigma * randomNormal();
        const dvy = sigma * randomNormal();
        const dvz = sigma * randomNormal();
        a.vx += dvx;
        a.vy += dvy;
        a.vz += dvz;

        mTot += m;
        dPx += m * dvx;
        dPy += m * dvy;
        dPz += m * dvz;
      }
    }

    if (mTot > 1e-12) {
      const corrX = dPx / mTot;
      const corrY = dPy / mTot;
      const corrZ = dPz / mTot;
      for (const a of atoms) {
        a.vx -= corrX;
        a.vy -= corrY;
        a.vz -= corrZ;
      }
    }
  } else if (reducedTemp > 0) {
    // Legacy stochastic bath kicks with exact zero net momentum injection.
    const kick = params.tempVelKick * reducedTemp * Math.sqrt(safeDt);
    let mTot = 0;
    let dPx = 0;
    let dPy = 0;
    let dPz = 0;

    for (const a of atoms) {
      const m = Math.max(0.1, a.mass);
      const mScale = 1 / Math.sqrt(Math.max(0.6, a.mass));
      const dvx = (Math.random() - 0.5) * kick * mScale;
      const dvy = (Math.random() - 0.5) * kick * mScale;
      const dvz = (Math.random() - 0.5) * kick * mScale;
      a.vx += dvx;
      a.vy += dvy;
      a.vz += dvz;

      mTot += m;
      dPx += m * dvx;
      dPy += m * dvy;
      dPz += m * dvz;
    }

    if (mTot > 1e-12) {
      const corrX = dPx / mTot;
      const corrY = dPy / mTot;
      const corrZ = dPz / mTot;
      for (const a of atoms) {
        a.vx -= corrX;
        a.vy -= corrY;
        a.vz -= corrZ;
      }
    }
  }

  const damp = Math.pow(clamp(params.damping, 0, 1), safeDt * 60);
  for (const a of atoms) {
    a.vx *= damp;
    a.vy *= damp;
    a.vz *= damp;
    if (usePeriodic) {
      a.x = wrapPeriodicCoordinate(a.x, halfBox);
      a.y = wrapPeriodicCoordinate(a.y, halfBox);
      a.z = wrapPeriodicCoordinate(a.z, halfBox);
    }
  }

  // Keep chemistry updates at full cadence so large systems still react.
  const reactionInterval = 1;
  if (sim.stepCount % reactionInterval === 0) {
    pruneBrokenBonds(sim, params, safeDt);
    recomputeValenceUsage(sim);
    tryFormBonds(sim, params, safeDt);
    recomputeBondOrders(sim, params);
  }
  recomputeValenceUsage(sim);
  if (!useLangevin) applyTemperatureEquilibration(sim, params);
}

export function nudgeAll(sim: Sim3D, strength = 1.0) {
  for (const a of sim.atoms) {
    a.vx += (Math.random() - 0.5) * strength;
    a.vy += (Math.random() - 0.5) * strength;
    a.vz += (Math.random() - 0.5) * strength;
  }
}

export function removeAtom3D(sim: Sim3D, atomId: number) {
  const toRemove = sim.bonds.filter((b) => b.aId === atomId || b.bId === atomId);

  for (const b of toRemove) {
    const a = getAtom(sim, b.aId);
    const c = getAtom(sim, b.bId);
    const cost = b.order;

    if (a) a.valenceUsed = Math.max(0, a.valenceUsed - cost);
    if (c) c.valenceUsed = Math.max(0, c.valenceUsed - cost);
  }

  sim.bonds = sim.bonds.filter((b) => b.aId !== atomId && b.bId !== atomId);
  sim.atoms = sim.atoms.filter((a) => a.id !== atomId);

  sim.dihedrals = (sim.dihedrals || []).filter(
    (t) => t.iId !== atomId && t.jId !== atomId && t.kId !== atomId && t.lId !== atomId
  );

  if (sim.grabbedId === atomId) {
    sim.grabbedId = null;
    sim.grabTarget = null;
  }
}
