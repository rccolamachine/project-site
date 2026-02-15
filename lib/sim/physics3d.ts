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
  minR: number;
  maxPairForce: number;

  // electrostatics (toy)
  enableElectrostatics: boolean;
  charges: ChargePerElement;   // constant per element
  ke: number;                  // strength multiplier (toy)
  screeningLength: number;     // lambda, in world units
  electroRepulsionScale?: number; // >1 boosts like-charge repulsion only
  electroAttractionScale?: number; // >1 boosts opposite-charge attraction only
  electroBondBiasStrength?: number; // 0..2; favors opposite-charge bond formation

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
  temperature: number;
  damping: number;
  tempVelKick: number;
  thermostatInterval?: number; // steps between velocity rescaling
  thermostatStrength?: number; // 0..1 blend toward target kinetic energy
  thermostatClamp?: number; // max fractional rescale per application

  // container
  boxHalfSize: number;
  wallPadding: number;
  wallK: number;

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

function bondExists(sim: Sim3D, aId: number, bId: number) {
  return sim.bonds.some(
    (b) => (b.aId === aId && b.bId === bId) || (b.aId === bId && b.bId === aId)
  );
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
    a.valenceUsed = clamp(a.valenceUsed + cost, 0, a.valenceMax);
    c.valenceUsed = clamp(c.valenceUsed + cost, 0, c.valenceMax);
  }
}

function valenceDeficit(atom: Atom3D) {
  return Math.max(0, targetValenceForOctet(atom) - atom.valenceUsed);
}

function hasFullShell(atom: Atom3D) {
  return valenceDeficit(atom) <= 0;
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

function pruneBrokenBonds(sim: Sim3D) {
  const FULL_SHELL_BREAK_STRETCH = 1.25;
  const PARTIAL_SHELL_BREAK_STRETCH = 1.1;
  const BREAK_OUTWARD_VEL_MIN = 0.2;

  const kept: Bond3D[] = [];
  for (const b of sim.bonds) {
    const a = getAtom(sim, b.aId);
    const c = getAtom(sim, b.bId);
    if (!a || !c) continue;

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const dz = c.z - a.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;

    const fullA = hasFullShell(a);
    const fullC = hasFullShell(c);
    const barrierMult = fullA && fullC
      ? FULL_SHELL_BREAK_STRETCH
      : fullA || fullC
      ? PARTIAL_SHELL_BREAK_STRETCH
      : 1.0;
    const barrierBreakR = b.breakR * barrierMult;

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
  if (d < r0Single * 0.86) return 3;
  if (d < r0Single * 0.93) return 2;
  return 1;
}

function chooseBondOrderWithOctetBias(
  a: Atom3D,
  b: Atom3D,
  d: number,
  r0Single: number,
  allowMultiple: boolean
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

    const score = octetGain * 5 - strain * 2 - baselinePenalty * 0.5 - desiredPenalty * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  }

  return bestOrder;
}

function tryFormBonds(sim: Sim3D, params: Params3D) {
  const FORM_FACTOR = 1.1;
  const REL_SPEED_MAX = 3.2;
  const MAX_NEW_BONDS_PER_STEP = 10;

  let made = 0;

  for (let i = 0; i < sim.atoms.length; i++) {
    const ai = sim.atoms[i];
    if (ai.valenceUsed >= ai.valenceMax) continue;

    for (let j = i + 1; j < sim.atoms.length; j++) {
      const aj = sim.atoms[j];
      if (aj.valenceUsed >= aj.valenceMax) continue;
      if (bondExists(sim, ai.id, aj.id)) continue;

      const dx = aj.x - ai.x;
      const dy = aj.y - ai.y;
      const dz = aj.z - ai.z;
      const d2 = dx * dx + dy * dy + dz * dz;

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
      if (d2 > formR * formR) continue;

      const d = Math.sqrt(d2) || 1e-6;

      const rvx = ai.vx - aj.vx;
      const rvy = ai.vy - aj.vy;
      const rvz = ai.vz - aj.vz;
      const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      const relSpeedMax = REL_SPEED_MAX * (electroBias > 1 ? 1.12 : 1.0);
      if (relSpeed > relSpeedMax) continue;

      const order = chooseBondOrderWithOctetBias(ai, aj, d, r0Single, params.allowMultipleBonds);
      if (!order) continue;

      const kSingle = kLit * K_SCALE * params.bondScale;
      const r0 = orderAdjustedR0(r0Single, order);
      const k = orderAdjustedK(kSingle, order);

      const BREAK_FACTOR = 1.75;
      const breakR = r0 * BREAK_FACTOR;

      sim.bonds.push({ aId: ai.id, bId: aj.id, order, r0, k, breakR });

      const cost = bondValenceCost(order);
      ai.valenceUsed += cost;
      aj.valenceUsed += cost;

      made++;
      if (made >= MAX_NEW_BONDS_PER_STEP) return;
    }
  }
}

function applyTemperatureEquilibration(sim: Sim3D, params: Params3D) {
  if (params.temperature <= 0) return;
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
  const targetPerAtom = Math.max(1e-6, params.temperature);
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

  const allow = params.allowMultipleBonds;

  const UP_1_TO_2 = 0.92;
  const DOWN_2_TO_1 = 0.97;

  const UP_2_TO_3 = 0.85;
  const DOWN_3_TO_2 = 0.9;

  const BREAK_FACTOR = 1.75;

  for (const b of sim.bonds) {
    const a = getAtom(sim, b.aId);
    const c = getAtom(sim, b.bId);
    if (!a || !c) continue;

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const dz = c.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

    const { r0: r0Single, kLit } = getPairBondParam(a.el, c.el);

    let target: BondOrder = b.order;

    if (!allow) {
      target = 1;
    } else {
      if (b.order === 1) {
        const gain2 = Math.min(valenceDeficit(a), valenceDeficit(c)) >= 2;
        if (d < r0Single * UP_1_TO_2 || gain2) target = 2;
      } else if (b.order === 2) {
        const gain3 = Math.min(valenceDeficit(a), valenceDeficit(c)) >= 3;
        if (d < r0Single * UP_2_TO_3 || gain3) target = 3;
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
      a.valenceUsed = clamp(a.valenceUsed + delta, 0, a.valenceMax);
      c.valenceUsed = clamp(c.valenceUsed + delta, 0, c.valenceMax);
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

      const r1x = i.x - j.x;
      const r1y = i.y - j.y;
      const r1z = i.z - j.z;
      const r1sq = r1x * r1x + r1y * r1y + r1z * r1z;
      const r1 = Math.sqrt(r1sq) + eps;

      for (let bIdx = aIdx + 1; bIdx < neigh.length; bIdx++) {
        const k = byId.get(neigh[bIdx].id);
        if (!k) continue;

        const r2x = k.x - j.x;
        const r2y = k.y - j.y;
        const r2z = k.z - j.z;
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

function computeDihedralPhi(i: Atom3D, j: Atom3D, k: Atom3D, l: Atom3D): { phi: number; ok: boolean } {
  const r12x = i.x - j.x, r12y = i.y - j.y, r12z = i.z - j.z;
  const r23x = j.x - k.x, r23y = j.y - k.y, r23z = j.z - k.z;
  const r34x = k.x - l.x, r34y = k.y - l.y, r34z = k.z - l.z;

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

function dihedralForces(i: Atom3D, j: Atom3D, k: Atom3D, l: Atom3D, dUdPhi: number) {
  const r12x = i.x - j.x, r12y = i.y - j.y, r12z = i.z - j.z;
  const r23x = j.x - k.x, r23y = j.y - k.y, r23z = j.z - k.z;
  const r34x = k.x - l.x, r34y = k.y - l.y, r34z = k.z - l.z;

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

    const { phi, ok } = computeDihedralPhi(i, j, k, l);
    if (!ok) continue;

    const arg = t.n * phi - t.delta;
    const dUdPhi = -t.k * t.n * Math.sin(arg);

    const f = dihedralForces(i, j, k, l, dUdPhi);
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

/* ----------------------------------- Step ---------------------------------- */

export function stepSim3D(sim: Sim3D, params: Params3D, dt: number) {
  const atoms = sim.atoms;
  sim.stepCount += 1;
  recomputeValenceUsage(sim);

  for (const a of atoms) {
    a.fx = 0;
    a.fy = 0;
    a.fz = 0;
  }

  const cut2 = params.cutoff * params.cutoff;

  for (let i = 0; i < atoms.length; i++) {
    const ai = atoms[i];
    for (let j = i + 1; j < atoms.length; j++) {
      const aj = atoms[j];

      const dx = aj.x - ai.x;
      const dy = aj.y - ai.y;
      const dz = aj.z - ai.z;

      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > cut2) continue;

      let r = Math.sqrt(r2) || 1e-6;
      if (r < params.minR) r = params.minR;

      // LJ
      const mixed = mixLorentzBerthelot(params.lj, ai.el, aj.el);
      const sig = mixed.sigma;
      const eps = mixed.epsilon;
      if (eps > 1e-6) {
        let fmag = ljForce(r, eps, sig);
        fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);

        const invR = 1 / r;
        const fx = fmag * dx * invR;
        const fy = fmag * dy * invR;
        const fz = fmag * dz * invR;

        ai.fx -= fx; ai.fy -= fy; ai.fz -= fz;
        aj.fx += fx; aj.fy += fy; aj.fz += fz;
      }

      // Electrostatics (screened)
      if (params.enableElectrostatics) {
        const qi = params.charges[ai.el] ?? 0;
        const qj = params.charges[aj.el] ?? 0;
        const ke = params.ke;
        if (Math.abs(qi * qj) > 1e-9 && ke !== 0) {
          let fmagE = yukawaForce(
            r,
            ke,
            qi,
            qj,
            params.screeningLength,
            params.electroRepulsionScale ?? 2.2,
            params.electroAttractionScale ?? 2.0
          );
          fmagE = clamp(fmagE, -params.maxPairForce, params.maxPairForce);

          const invR = 1 / r;
          const fx = fmagE * dx * invR;
          const fy = fmagE * dy * invR;
          const fz = fmagE * dz * invR;

          // NOTE: positive fmagE means repulsive when qi*qj>0 and attractive when qi*qj<0
          ai.fx -= fx; ai.fy -= fy; ai.fz -= fz;
          aj.fx += fx; aj.fy += fy; aj.fz += fz;
        }
      }
    }
  }

  // bonded springs
  for (const b of sim.bonds) {
    const a = getAtom(sim, b.aId);
    const c = getAtom(sim, b.bId);
    if (!a || !c) continue;

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const dz = c.z - a.z;

    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

    let fmag = b.k * (r - b.r0);
    fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);

    const invR = 1 / r;
    const fx = fmag * dx * invR;
    const fy = fmag * dy * invR;
    const fz = fmag * dz * invR;

    a.fx += fx; a.fy += fy; a.fz += fz;
    c.fx -= fx; c.fy -= fy; c.fz -= fz;
  }

  applyAngleForces(sim, params);
  applyDihedralForces(sim, params);

  // container walls
  const S = params.boxHalfSize;
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

  // grabbing
  if (sim.grabbedId && sim.grabTarget) {
    const g = getAtom(sim, sim.grabbedId);
    if (g) {
      const dx = sim.grabTarget.x - g.x;
      const dy = sim.grabTarget.y - g.y;
      const dz = sim.grabTarget.z - g.z;

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

  // integrate
  const damp = params.damping;

  for (const a of atoms) {
    const ax = a.fx / Math.max(0.1, a.mass);
    const ay = a.fy / Math.max(0.1, a.mass);
    const az = a.fz / Math.max(0.1, a.mass);

    a.vx = (a.vx + ax * dt) * damp;
    a.vy = (a.vy + ay * dt) * damp;
    a.vz = (a.vz + az * dt) * damp;

  }

  if (params.temperature > 0) {
    // Stochastic bath kicks with exact zero net momentum injection.
    const kick = params.tempVelKick * params.temperature * Math.sqrt(dt);
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

  for (const a of atoms) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.z += a.vz * dt;
  }

  pruneBrokenBonds(sim);
  recomputeValenceUsage(sim);
  tryFormBonds(sim, params);
  recomputeBondOrders(sim, params);
  recomputeValenceUsage(sim);
  applyTemperatureEquilibration(sim, params);
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
