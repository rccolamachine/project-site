// lib/sim/physics3d.ts
/**
 * Toy Chemistry 3D Physics (LJ + bond-order springs with pair "literature-like" defaults)
 * Elements: H, C, N, O, P, S
 *
 * Nonbonded:
 * - LJ per element (sigma/epsilon) with Lorentz–Berthelot mixing
 * - cutoff for performance/stability
 *
 * Bonded:
 * - Bonds are harmonic springs with an integer "order": 1,2,3
 * - Pair parameters provide a SINGLE-bond equilibrium length r0 (Å-ish world units)
 *   and stiffness kSingle derived from typical literature/force-field magnitudes,
 *   then scaled to be stable/fun.
 * - Bond order modifies r0 and k:
 *     r0(order) = r0_single * (1 - 0.08*(order-1))   // shorter for higher order
 *     k(order)  = kSingle * (1 + 0.9*(order-1))      // stiffer for higher order
 *
 * Formation/breaking are PHYSICAL (forces) — not just visuals.
 * We hardcode heuristics (no sliders):
 * - A candidate bond forms if distance < formFactor * r0_single and valence allows.
 * - Bond order is chosen from distance thresholds (closer => higher order).
 * - Bond breaks if distance > breakFactor * r0(order)
 *
 * Bond-order recomputation:
 * - Bonds can upgrade/downgrade order periodically (call recomputeBondOrders()).
 * - Uses hysteresis so bond orders don’t flicker.
 * - Valence-safe: will not upgrade if either atom can’t pay.
 *
 * Notes:
 * - These are toy rules, designed for usability and performance, not chemical accuracy.
 */

export type ElementKey = "H" | "C" | "N" | "O" | "P" | "S";

export type ElementDef = {
  label: string;
  mass: number;
  radius: number;
  valence: number; // total bond-order capacity
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
  valenceUsed: number; // consumes bond order (single=1, double=2, triple=3)
};

export type BondOrder = 1 | 2 | 3;

export type Bond3D = {
  aId: number;
  bId: number;
  order: BondOrder;
  r0: number; // equilibrium length used for this order
  k: number; // stiffness used for this order
  breakR: number; // snap distance
};

export type Sim3D = {
  atoms: Atom3D[];
  bonds: Bond3D[];
  nextId: number;

  grabbedId: number | null;
  grabTarget: { x: number; y: number; z: number } | null;
};

export type LJPerElement = Record<ElementKey, { sigma: number; epsilon: number }>;

export type Params3D = {
  // nonbonded
  lj: LJPerElement;
  cutoff: number;
  minR: number;
  maxPairForce: number;

  // bond system
  bondScale: number; // global multiplier for k (UI slider)
  allowMultipleBonds: boolean; // allow order 2/3 bonds

  // dynamics
  temperature: number; // scalar factor (300K -> 1.0 in UI mapping)
  damping: number;
  tempVelKick: number;

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
  O: { sigma: 1.1, epsilon: 1.15 },
  P: { sigma: 1.22, epsilon: 0.95 },
  S: { sigma: 1.25, epsilon: 1.05 },
};

type PairKey = `${ElementKey}-${ElementKey}`;
type PairBondParam = { r0: number; kLit: number };

const K_SCALE = 0.015;

const PAIR_BOND_PARAMS: Record<PairKey, PairBondParam> = {
  // H
  "H-H": { r0: 0.74, kLit: 440 },
  "H-C": { r0: 1.09, kLit: 340 },
  "H-N": { r0: 1.01, kLit: 350 },
  "H-O": { r0: 0.96, kLit: 370 },
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
  "O-O": { r0: 1.48, kLit: 300 },
  "O-P": { r0: 1.63, kLit: 240 },
  "O-S": { r0: 1.58, kLit: 240 },

  // P
  "P-P": { r0: 2.21, kLit: 150 },
  "P-S": { r0: 2.1, kLit: 150 },

  // S
  "S-S": { r0: 2.05, kLit: 160 },
};

function pairKey(a: ElementKey, b: ElementKey): PairKey {
  return (a <= b ? `${a}-${b}` : `${b}-${a}`) as PairKey;
}

function getPairBondParam(a: ElementKey, b: ElementKey): PairBondParam {
  const key = pairKey(a, b);
  const p = PAIR_BOND_PARAMS[key];
  return (
    p || {
      r0: 1.6,
      kLit: 250,
    }
  );
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
    grabbedId: null,
    grabTarget: null,
  };
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function clearSim3D(sim: Sim3D) {
  sim.atoms = [];
  sim.bonds = [];
  sim.nextId = 1;
  sim.grabbedId = null;
  sim.grabTarget = null;
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

function canBondOrder(a: Atom3D, b: Atom3D, order: BondOrder) {
  const cost = bondValenceCost(order);
  if (a.valenceUsed + cost > a.valenceMax) return false;
  if (b.valenceUsed + cost > b.valenceMax) return false;
  return true;
}

// LJ force magnitude along r axis (positive repulsion, negative attraction)
function ljForce(r: number, eps: number, sig: number) {
  const inv = sig / r;
  const inv2 = inv * inv;
  const inv6 = inv2 * inv2 * inv2;
  const inv12 = inv6 * inv6;
  return (24 * eps * (2 * inv12 - inv6)) / r;
}

// LJ potential U(r) = 4ε[(σ/r)^12 - (σ/r)^6]
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

function bondForce(r: number, r0: number, k: number) {
  return k * (r - r0);
}

function pruneBrokenBonds(sim: Sim3D) {
  const kept: Bond3D[] = [];
  for (const b of sim.bonds) {
    const a = getAtom(sim, b.aId);
    const c = getAtom(sim, b.bId);
    if (!a || !c) continue;

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const dz = c.z - a.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0;

    if (r > b.breakR) {
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

function tryFormBonds(sim: Sim3D, params: Params3D) {
  const FORM_FACTOR = 1.1;
  const REL_SPEED_MAX = 3.2;
  const MAX_NEW_BONDS_PER_STEP = 6;

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
      const formR = r0Single * FORM_FACTOR;
      if (d2 > formR * formR) continue;

      const d = Math.sqrt(d2) || 1e-6;

      const rvx = ai.vx - aj.vx;
      const rvy = ai.vy - aj.vy;
      const rvz = ai.vz - aj.vz;
      const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      if (relSpeed > REL_SPEED_MAX) continue;

      let order = chooseBondOrder(d, r0Single, params.allowMultipleBonds);

      while (order > 1 && !canBondOrder(ai, aj, order)) {
        order = (order - 1) as BondOrder;
      }
      if (!canBondOrder(ai, aj, order)) continue;

      const kSingle = kLit * K_SCALE * params.bondScale;
      const r0 = orderAdjustedR0(r0Single, order);
      const k = orderAdjustedK(kSingle, order);

      const BREAK_FACTOR = 1.75;
      const breakR = r0 * BREAK_FACTOR;

      sim.bonds.push({
        aId: ai.id,
        bId: aj.id,
        order,
        r0,
        k,
        breakR,
      });

      const cost = bondValenceCost(order);
      ai.valenceUsed += cost;
      aj.valenceUsed += cost;

      made++;
      if (made >= MAX_NEW_BONDS_PER_STEP) return;
    }
  }
}

export function setGrab(sim: Sim3D, id: number | null) {
  sim.grabbedId = id;
  if (id === null) sim.grabTarget = null;
}

export function setGrabTarget(sim: Sim3D, x: number, y: number, z: number) {
  sim.grabTarget = { x, y, z };
}

/**
 * Periodically recompute bond orders from current distances.
 *
 * Why: keeps visuals and physics aligned as atoms move (single <-> double <-> triple),
 * without doing expensive logic every frame.
 *
 * Behavior:
 * - If params.allowMultipleBonds is false => orders are forced to 1 (and r0/k updated).
 * - Uses hysteresis so order doesn’t flicker near thresholds.
 * - Valence-safe upgrades: will not upgrade if either atom can’t pay for the higher order.
 */
export function recomputeBondOrders(sim: Sim3D, params: Params3D) {
  const allow = params.allowMultipleBonds;

  // Hysteresis thresholds (relative to single-bond r0)
  // Upgrade happens at tighter distance; downgrade requires looser distance.
  const UP_1_TO_2 = 0.92;
  const DOWN_2_TO_1 = 0.97;

  const UP_2_TO_3 = 0.85;
  const DOWN_3_TO_2 = 0.90;

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

    // decide target order with hysteresis, starting from current order
    let target: BondOrder = b.order;

    if (!allow) {
      target = 1;
    } else {
      if (b.order === 1) {
        if (d < r0Single * UP_1_TO_2) target = 2;
      } else if (b.order === 2) {
        if (d < r0Single * UP_2_TO_3) target = 3;
        else if (d > r0Single * DOWN_2_TO_1) target = 1;
      } else if (b.order === 3) {
        if (d > r0Single * DOWN_3_TO_2) target = 2;
      }
    }

    // Valence-safe: if upgrading, ensure both atoms can pay delta
    if (target > b.order) {
      const delta = target - b.order; // 1 or 2
      if (a.valenceUsed + delta > a.valenceMax || c.valenceUsed + delta > c.valenceMax) {
        // degrade to the highest affordable order
        let tryOrder: BondOrder = target;
        while (tryOrder > b.order) {
          const d2 = tryOrder - b.order;
          if (a.valenceUsed + d2 <= a.valenceMax && c.valenceUsed + d2 <= c.valenceMax) break;
          tryOrder = (tryOrder - 1) as BondOrder;
        }
        target = tryOrder;
      }
    }

    // apply any order change: update valenceUsed and bond params
    if (target !== b.order) {
      const old = b.order;
      const delta = target - old;
      a.valenceUsed = clamp(a.valenceUsed + delta, 0, a.valenceMax);
      c.valenceUsed = clamp(c.valenceUsed + delta, 0, c.valenceMax);
      b.order = target;
    }

    // update r0/k/breakR every time (so clamping multiple-bond->single keeps physics consistent)
    const kSingle = kLit * K_SCALE * params.bondScale;
    b.r0 = orderAdjustedR0(r0Single, b.order);
    b.k = orderAdjustedK(kSingle, b.order);
    b.breakR = b.r0 * BREAK_FACTOR;
  }
}

export function stepSim3D(sim: Sim3D, params: Params3D, dt: number) {
  const atoms = sim.atoms;

  for (const a of atoms) {
    a.fx = 0;
    a.fy = 0;
    a.fz = 0;
  }

  // nonbonded
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

      const mixed = mixLorentzBerthelot(params.lj, ai.el, aj.el);
      const sig = mixed.sigma;
      const eps = mixed.epsilon;
      if (eps <= 1e-6) continue;

      let fmag = ljForce(r, eps, sig);
      fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);

      const invR = 1 / r;
      const fx = fmag * dx * invR;
      const fy = fmag * dy * invR;
      const fz = fmag * dz * invR;

      ai.fx -= fx;
      ai.fy -= fy;
      ai.fz -= fz;
      aj.fx += fx;
      aj.fy += fy;
      aj.fz += fz;
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

    let fmag = bondForce(r, b.r0, b.k);
    fmag = clamp(fmag, -params.maxPairForce, params.maxPairForce);

    const invR = 1 / r;
    const fx = fmag * dx * invR;
    const fy = fmag * dy * invR;
    const fz = fmag * dz * invR;

    a.fx += fx;
    a.fy += fy;
    a.fz += fz;
    c.fx -= fx;
    c.fy -= fy;
    c.fz -= fz;
  }

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
        fx *= s;
        fy *= s;
        fz *= s;
      }

      g.fx += fx;
      g.fy += fy;
      g.fz += fz;
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

    // Brownian velocity kicks
    if (params.temperature > 0) {
      const kick = params.tempVelKick * params.temperature * Math.sqrt(dt);
      const mScale = 1 / Math.sqrt(Math.max(0.6, a.mass));
      a.vx += (Math.random() - 0.5) * kick * mScale;
      a.vy += (Math.random() - 0.5) * kick * mScale;
      a.vz += (Math.random() - 0.5) * kick * mScale;
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.z += a.vz * dt;
  }

  pruneBrokenBonds(sim);
  tryFormBonds(sim, params);
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

  if (sim.grabbedId === atomId) {
    sim.grabbedId = null;
    sim.grabTarget = null;
  }
}
