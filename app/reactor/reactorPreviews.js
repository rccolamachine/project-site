import React, { useMemo } from "react";

import { DEFAULT_ELEMENTS_3D } from "@/lib/sim/physics3d";

const PREVIEW_ELEMENT_COLORS = {
  H: "#f1f5f9",
  C: "#111827",
  N: "#3b82f6",
  O: "#ef4444",
  P: "#f59e0b",
  S: "#facc15",
};

export const ATOMIC_WEIGHTS = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  P: 30.974,
  S: 32.06,
};

export function computeMolecularWeight(structure) {
  const parsed = normalizeStructure(structure);
  if (!parsed) return NaN;
  let total = 0;
  for (const atom of parsed.atoms) {
    total += ATOMIC_WEIGHTS[atom.el] ?? 0;
  }
  return total;
}

export function catalogueNumberFromId(id) {
  if (typeof id !== "string") return NaN;
  const m = id.match(/(\d+)$/);
  if (!m) return NaN;
  return Number.parseInt(m[1], 10);
}

export function formulaWithSubscripts(formula) {
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

export function CatalogueNameCell({ name, formula }) {
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
    if (a < 0 || b < 0 || a >= atoms.length || b >= atoms.length || a === b) {
      continue;
    }
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
      if (segmentsCross(nodes[e1.a], nodes[e1.b], nodes[e2.a], nodes[e2.b])) {
        count += 1;
      }
    }
  }
  return count;
}

function buildAdjacency(atoms, bonds) {
  const adjacency = Array.from({ length: atoms.length }, () => []);
  for (const bond of bonds) {
    adjacency[bond.a].push({ to: bond.b, order: bond.order });
    adjacency[bond.b].push({ to: bond.a, order: bond.order });
  }
  return adjacency;
}

function vecLength(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

function normalizeVec(vec) {
  const len = vecLength(vec.x, vec.y, vec.z) || 1;
  return {
    x: vec.x / len,
    y: vec.y / len,
    z: vec.z / len,
  };
}

function crossVec(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function perpendicularUnit(axis) {
  const base = Math.abs(axis.x) < 0.72 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const perp = crossVec(axis, base);
  if (vecLength(perp.x, perp.y, perp.z) > 1e-6) return normalizeVec(perp);
  return { x: 0, y: 0, z: 1 };
}

function polarDirection(axis, u, v, thetaDeg, phiDeg) {
  const theta = (thetaDeg * Math.PI) / 180;
  const phi = (phiDeg * Math.PI) / 180;
  const sinTheta = Math.sin(theta);
  return normalizeVec({
    x:
      axis.x * Math.cos(theta) +
      u.x * sinTheta * Math.cos(phi) +
      v.x * sinTheta * Math.sin(phi),
    y:
      axis.y * Math.cos(theta) +
      u.y * sinTheta * Math.cos(phi) +
      v.y * sinTheta * Math.sin(phi),
    z:
      axis.z * Math.cos(theta) +
      u.z * sinTheta * Math.cos(phi) +
      v.z * sinTheta * Math.sin(phi),
  });
}

function buildRingMembership(atoms, bonds) {
  const adjacency = buildAdjacency(atoms, bonds);
  const ringSizesByAtom = Array.from({ length: atoms.length }, () => new Set());

  for (const bond of bonds) {
    const src = bond.a;
    const dst = bond.b;
    const queue = [[src, [src]]];
    const visited = new Set([src]);
    let shortestCycle = null;

    while (queue.length > 0) {
      const [cur, path] = queue.shift();
      if (path.length > 6) continue;
      for (const next of adjacency[cur]) {
        if ((cur === src && next.to === dst) || (cur === dst && next.to === src)) {
          continue;
        }
        if (next.to === dst) {
          shortestCycle = path.concat(dst);
          queue.length = 0;
          break;
        }
        if (visited.has(next.to)) continue;
        visited.add(next.to);
        queue.push([next.to, path.concat(next.to)]);
      }
    }

    if (!shortestCycle) continue;
    const ringSize = shortestCycle.length;
    if (ringSize < 3 || ringSize > 6) continue;
    for (const atomIdx of shortestCycle) {
      ringSizesByAtom[atomIdx].add(ringSize);
    }
  }

  return ringSizesByAtom.map((set) =>
    set.size > 0 ? Math.min(...Array.from(set)) : null,
  );
}

function bondLengthTarget3D(atoms, a, b, order = 1) {
  const hasH = atoms[a]?.el === "H" || atoms[b]?.el === "H";
  if (hasH) return 0.84;
  if (order >= 3) return 0.94;
  if (order === 2) return 1.02;
  return 1.1;
}

function inferAtomGeometry(atoms, adjacency, center, ringSizes) {
  const atom = atoms[center];
  const neighbors = adjacency[center];
  const degree = neighbors.length;
  const bondOrderSum = neighbors.reduce((sum, row) => sum + row.order, 0);
  const maxOrder = neighbors.reduce((max, row) => Math.max(max, row.order), 0);
  const heavyDegree = neighbors.reduce(
    (sum, row) => sum + (atoms[row.to]?.el === "H" ? 0 : 1),
    0,
  );
  const ringSize = ringSizes?.[center] ?? null;
  const aromaticLike =
    ringSize != null &&
    ringSize <= 6 &&
    degree >= 2 &&
    bondOrderSum >= 3 &&
    atom.el !== "H";

  let lonePairs = 0;
  let geometry = "terminal";
  let baseAngleDeg = null;

  if (degree <= 1) {
    if ((atom.el === "C" || atom.el === "N" || atom.el === "P") && maxOrder >= 3) {
      geometry = "linear";
    }
    return {
      lonePairs,
      geometry,
      baseAngleDeg,
      aromaticLike,
      ringSize,
      degree,
      bondOrderSum,
      maxOrder,
      heavyDegree,
      planar: geometry === "trigonal-planar" || aromaticLike,
    };
  }

  switch (atom.el) {
    case "C":
      lonePairs = 0;
      if (degree === 2 && (maxOrder >= 3 || bondOrderSum >= 4)) {
        geometry = "linear";
        baseAngleDeg = 180;
      } else if (aromaticLike || degree === 3 || maxOrder >= 2 || bondOrderSum >= 4) {
        geometry = "trigonal-planar";
        baseAngleDeg = 120;
      } else {
        geometry = "tetrahedral";
        baseAngleDeg = 109.5;
      }
      break;
    case "N":
      if (degree === 2 && maxOrder >= 3) {
        lonePairs = 0;
        geometry = "linear";
        baseAngleDeg = 180;
      } else if (degree >= 3 && (bondOrderSum >= 4 || aromaticLike)) {
        lonePairs = 0;
        geometry = "trigonal-planar";
        baseAngleDeg = 120;
      } else if (degree === 2 && bondOrderSum >= 3) {
        lonePairs = 1;
        geometry = "bent-trigonal";
        baseAngleDeg = 118;
      } else if (degree === 3) {
        lonePairs = 1;
        geometry = "trigonal-pyramidal";
        baseAngleDeg = 107;
      } else {
        lonePairs = 1;
        geometry = "bent-tetrahedral";
        baseAngleDeg = 105;
      }
      break;
    case "O":
      if (degree === 2 && bondOrderSum >= 3) {
        lonePairs = 1;
        geometry = "bent-trigonal";
        baseAngleDeg = 118;
      } else if (degree === 3) {
        lonePairs = 1;
        geometry = "trigonal-pyramidal";
        baseAngleDeg = 107;
      } else {
        lonePairs = 2;
        geometry = "bent-tetrahedral";
        baseAngleDeg = 104.5;
      }
      break;
    case "P":
      if (degree === 2 && maxOrder >= 3) {
        lonePairs = 0;
        geometry = "linear";
        baseAngleDeg = 180;
      } else if (degree >= 4 || bondOrderSum >= 5) {
        lonePairs = 0;
        geometry = "tetrahedral";
        baseAngleDeg = 109.5;
      } else if (degree === 3 && bondOrderSum >= 4) {
        lonePairs = 0;
        geometry = "trigonal-planar";
        baseAngleDeg = 120;
      } else if (degree === 3) {
        lonePairs = 1;
        geometry = "trigonal-pyramidal";
        baseAngleDeg = 98;
      } else {
        lonePairs = 1;
        geometry = "bent-tetrahedral";
        baseAngleDeg = 96;
      }
      break;
    case "S":
      if (degree === 2 && bondOrderSum >= 4) {
        lonePairs = 1;
        geometry = "bent-trigonal";
        baseAngleDeg = 119;
      } else if (degree === 2 && bondOrderSum === 3) {
        lonePairs = 1;
        geometry = "bent-trigonal";
        baseAngleDeg = 114;
      } else if (degree >= 3 && bondOrderSum >= 6) {
        lonePairs = 0;
        geometry = "trigonal-planar";
        baseAngleDeg = 120;
      } else if (degree === 3 && bondOrderSum >= 4) {
        lonePairs = 1;
        geometry = "trigonal-pyramidal";
        baseAngleDeg = 103;
      } else if (degree >= 4) {
        lonePairs = 0;
        geometry = "tetrahedral";
        baseAngleDeg = 109.5;
      } else {
        lonePairs = 2;
        geometry = "bent-tetrahedral";
        baseAngleDeg = 104.5;
      }
      break;
    default:
      geometry = degree === 2 ? "linear" : degree === 3 ? "trigonal-planar" : "tetrahedral";
      baseAngleDeg = geometry === "linear" ? 180 : geometry === "trigonal-planar" ? 120 : 109.5;
      break;
  }

  if (aromaticLike && degree >= 2 && atom.el !== "S" && atom.el !== "P") {
    geometry = degree === 2 ? "bent-trigonal" : "trigonal-planar";
    baseAngleDeg = degree === 2 ? 120 : 120;
  }

  return {
    lonePairs,
    geometry,
    baseAngleDeg,
    aromaticLike,
    ringSize,
    degree,
    bondOrderSum,
    maxOrder,
    heavyDegree,
    planar: geometry === "trigonal-planar" || geometry === "bent-trigonal" || aromaticLike,
  };
}

function pairAngleTargetDeg(feature, orderA, orderB) {
  const base = feature.baseAngleDeg;
  if (!Number.isFinite(base)) return null;
  if (feature.geometry === "linear") return 180;

  let target = base;
  const multipleCount = (orderA > 1 ? 1 : 0) + (orderB > 1 ? 1 : 0);

  if (feature.geometry === "trigonal-planar") {
    if (multipleCount === 2) target += 3;
    else if (multipleCount === 1) target += 1.5;
  } else if (feature.geometry === "bent-trigonal") {
    if (multipleCount === 1) target -= 1.5;
  } else if (feature.geometry === "trigonal-pyramidal") {
    if (multipleCount >= 1) target += 2;
  } else if (feature.geometry === "tetrahedral") {
    if (multipleCount >= 1) target += 1.5;
  } else if (feature.geometry === "bent-tetrahedral") {
    if (multipleCount >= 1) target -= 2;
  }

  if (feature.aromaticLike && feature.ringSize && feature.ringSize <= 6) {
    target = Math.max(target, 118);
  }

  return target;
}

function buildAngleConstraints(atoms, bonds) {
  const adjacency = buildAdjacency(atoms, bonds);
  const ringSizes = buildRingMembership(atoms, bonds);
  const features = adjacency.map((_, idx) =>
    inferAtomGeometry(atoms, adjacency, idx, ringSizes),
  );
  const constraints = [];
  const guides = [];

  for (let center = 0; center < adjacency.length; center += 1) {
    const neighbors = adjacency[center];
    if (neighbors.length < 2) continue;
    const feature = features[center];

    for (let i = 0; i < neighbors.length; i += 1) {
      for (let j = i + 1; j < neighbors.length; j += 1) {
        const a = neighbors[i].to;
        const b = neighbors[j].to;
        const targetDeg = pairAngleTargetDeg(
          feature,
          neighbors[i].order,
          neighbors[j].order,
        );
        if (!Number.isFinite(targetDeg)) continue;
        const targetRad = (targetDeg * Math.PI) / 180;
        const lenA = bondLengthTarget3D(atoms, center, a, neighbors[i].order);
        const lenB = bondLengthTarget3D(atoms, center, b, neighbors[j].order);
        const pairTarget = Math.sqrt(
          Math.max(
            1e-6,
            lenA * lenA + lenB * lenB - 2 * lenA * lenB * Math.cos(targetRad),
          ),
        );
        constraints.push({
          center,
          a,
          b,
          targetDeg,
          target: pairTarget,
          stiffness:
            feature.geometry === "linear"
              ? 0.42
              : feature.geometry === "trigonal-planar" || feature.geometry === "bent-trigonal"
                ? 0.24
                : feature.geometry === "tetrahedral" || feature.geometry === "trigonal-pyramidal"
                  ? 0.19
                  : 0.16,
        });
        if (targetDeg >= 160) {
          guides.push({ center, a, b, targetDeg, weight: 1.4 });
        }
      }
    }
  }

  return { constraints, features, guides, ringSizes };
}

function defaultDirectionsForGeometry(feature) {
  switch (feature.geometry) {
    case "linear":
      return [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
      ];
    case "trigonal-planar":
    case "bent-trigonal":
      return [
        { x: 1, y: 0, z: 0 },
        { x: -0.5, y: 0.8660254, z: 0 },
        { x: -0.5, y: -0.8660254, z: 0 },
      ];
    case "tetrahedral":
    case "trigonal-pyramidal":
    case "bent-tetrahedral":
      return [
        normalizeVec({ x: 1, y: 1, z: 1 }),
        normalizeVec({ x: 1, y: -1, z: -1 }),
        normalizeVec({ x: -1, y: 1, z: -1 }),
        normalizeVec({ x: -1, y: -1, z: 1 }),
      ];
    default:
      return [{ x: 1, y: 0, z: 0 }];
  }
}

function preferredChildDirections(feature, parentDir = null, needed = 0) {
  if (!(needed > 0)) return [];

  if (!parentDir) {
    const defaults = defaultDirectionsForGeometry(feature);
    if (feature.geometry === "bent-trigonal") {
      const angle = feature.baseAngleDeg || 118;
      return [
        normalizeVec({ x: Math.cos((angle * Math.PI) / 360), y: Math.sin((angle * Math.PI) / 360), z: 0 }),
        normalizeVec({ x: Math.cos((angle * Math.PI) / 360), y: -Math.sin((angle * Math.PI) / 360), z: 0 }),
      ].slice(0, needed);
    }
    if (feature.geometry === "bent-tetrahedral") {
      const angle = feature.baseAngleDeg || 104.5;
      return [
        normalizeVec({ x: Math.cos((angle * Math.PI) / 360), y: 0, z: Math.sin((angle * Math.PI) / 360) }),
        normalizeVec({ x: Math.cos((angle * Math.PI) / 360), y: 0, z: -Math.sin((angle * Math.PI) / 360) }),
      ].slice(0, needed);
    }
    return defaults.slice(0, needed);
  }

  const axis = normalizeVec(parentDir);
  const u = perpendicularUnit(axis);
  const v = normalizeVec(crossVec(axis, u));

  switch (feature.geometry) {
    case "linear":
      return [{ x: -axis.x, y: -axis.y, z: -axis.z }].slice(0, needed);
    case "bent-trigonal": {
      const angle = feature.baseAngleDeg || 118;
      return [polarDirection(axis, u, v, angle, 0)].slice(0, needed);
    }
    case "trigonal-planar":
      return [
        polarDirection(axis, u, v, 120, 0),
        polarDirection(axis, u, v, 120, 180),
      ].slice(0, needed);
    case "bent-tetrahedral": {
      const angle = feature.baseAngleDeg || 104.5;
      return [polarDirection(axis, u, v, angle, 0)].slice(0, needed);
    }
    case "trigonal-pyramidal":
    case "tetrahedral":
      return [
        polarDirection(axis, u, v, 109.47, 0),
        polarDirection(axis, u, v, 109.47, 120),
        polarDirection(axis, u, v, 109.47, 240),
      ].slice(0, needed);
    default:
      return [
        polarDirection(axis, u, v, 120, 0),
        polarDirection(axis, u, v, 120, 180),
      ].slice(0, needed);
  }
}

function chooseRootIndex(atoms, adjacency) {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < atoms.length; i += 1) {
    const degree = adjacency[i].length;
    const heavyDegree = adjacency[i].reduce(
      (sum, row) => sum + (atoms[row.to].el === "H" ? 0 : 1),
      0,
    );
    const score =
      heavyDegree * 10 +
      degree * 4 +
      (atoms[i].el === "C" ? 2 : atoms[i].el === "N" || atoms[i].el === "O" ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function buildInitialLayout3D(atoms, bonds, features) {
  const adjacency = buildAdjacency(atoms, bonds);
  const nodes = atoms.map((atom, idx) => ({
    idx,
    el: atom.el,
    x: 0,
    y: 0,
    z: 0,
    placed: false,
  }));
  const root = chooseRootIndex(atoms, adjacency);
  nodes[root].placed = true;
  const queue = [{ center: root, parent: -1 }];

  while (queue.length > 0) {
    const { center, parent } = queue.shift();
    const feature = features[center];
    const childRows = adjacency[center]
      .filter((row) => row.to !== parent && !nodes[row.to].placed)
      .sort((a, b) => {
        if (b.order !== a.order) return b.order - a.order;
        const ah = atoms[a.to].el === "H" ? 0 : 1;
        const bh = atoms[b.to].el === "H" ? 0 : 1;
        return bh - ah;
      });

    if (childRows.length <= 0) continue;

    const parentDir =
      parent >= 0
        ? normalizeVec({
            x: nodes[parent].x - nodes[center].x,
            y: nodes[parent].y - nodes[center].y,
            z: nodes[parent].z - nodes[center].z,
          })
        : null;
    const dirs = preferredChildDirections(feature, parentDir, childRows.length);

    for (let i = 0; i < childRows.length; i += 1) {
      const row = childRows[i];
      const dir = dirs[i] || defaultDirectionsForGeometry(feature)[i] || { x: 1, y: 0, z: 0 };
      const len = bondLengthTarget3D(atoms, center, row.to, row.order);
      nodes[row.to].x = nodes[center].x + dir.x * len;
      nodes[row.to].y = nodes[center].y + dir.y * len;
      nodes[row.to].z = nodes[center].z + dir.z * len;
      nodes[row.to].placed = true;
      queue.push({ center: row.to, parent: center });
    }
  }

  // Any unresolved ring/closure atoms get a deterministic fallback around the root.
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].placed) continue;
    const theta = (2 * Math.PI * i) / Math.max(3, nodes.length);
    nodes[i].x = Math.cos(theta) * 1.2;
    nodes[i].y = Math.sin(theta) * 1.2;
    nodes[i].z = (i % 2 === 0 ? 1 : -1) * 0.18;
    nodes[i].placed = true;
  }

  return nodes;
}

function countProjectedAnglePenalty(nodes, guides) {
  let penalty = 0;
  for (const guide of guides || []) {
    const center = nodes[guide.center];
    const a = nodes[guide.a];
    const b = nodes[guide.b];
    const v1x = a.x - center.x;
    const v1y = a.y - center.y;
    const v2x = b.x - center.x;
    const v2y = b.y - center.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-3 || l2 < 1e-3) {
      penalty += 60;
      continue;
    }
    const cosTheta = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
    const deg = (Math.acos(cosTheta) * 180) / Math.PI;
    const diff = Math.abs(deg - guide.targetDeg);
    penalty += diff * (guide.weight || 1);
  }
  return penalty;
}

function countProjectionOverlap(nodes) {
  let penalty = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      const minDist = (a.r + b.r) * 0.82;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const overlap = minDist - dist;
      if (overlap > 0) penalty += overlap * overlap;
    }
  }
  return penalty;
}

const STATIC_PREVIEW_ROTATIONS = Object.freeze([
  { x: -35, y: 35, z: -12 },
  { x: -28, y: 55, z: 10 },
  { x: -18, y: 80, z: -18 },
  { x: -42, y: 110, z: 18 },
  { x: -26, y: 145, z: -8 },
  { x: -12, y: 180, z: 16 },
  { x: -38, y: 220, z: -20 },
  { x: -24, y: 255, z: 14 },
  { x: -16, y: 290, z: -12 },
  { x: -32, y: 325, z: 20 },
  { x: 18, y: 48, z: 28 },
  { x: 24, y: 132, z: -26 },
]);

function selectBestStaticProjection(layout3d, orientationIndex = 0) {
  if (!layout3d) return null;

  const offset = Number.isFinite(orientationIndex)
    ? Math.max(0, Math.floor(orientationIndex))
    : 0;

  const candidates = STATIC_PREVIEW_ROTATIONS.map((rotation, idx) => {
    const tweak = offset * 11;
    const projected = projectBallStick3D(
      layout3d,
      ((rotation.x + tweak * 0.35) * Math.PI) / 180,
      ((rotation.y + tweak) * Math.PI) / 180,
      ((rotation.z - tweak * 0.45) * Math.PI) / 180,
      1.04,
    );
    if (!projected) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const node of projected.nodes2d) {
      minX = Math.min(minX, node.x - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      minY = Math.min(minY, node.y - node.r);
      maxY = Math.max(maxY, node.y + node.r);
      minZ = Math.min(minZ, node.z);
      maxZ = Math.max(maxZ, node.z);
    }

    return {
      idx,
      projected,
      crossings: countLayoutCrossings(projected.nodes2d, projected.bonds),
      overlap: countProjectionOverlap(projected.nodes2d),
      anglePenalty: countProjectedAnglePenalty(
        projected.nodes2d,
        layout3d.guides || [],
      ),
      area: (maxX - minX) * (maxY - minY),
      depth: maxZ - minZ,
    };
  }).filter(Boolean);

  if (candidates.length <= 0) return null;

  candidates.sort((a, b) => {
    if (a.crossings !== b.crossings) return a.crossings - b.crossings;
    if (Math.abs(a.overlap - b.overlap) > 1e-4) return a.overlap - b.overlap;
    if (Math.abs(a.anglePenalty - b.anglePenalty) > 1e-4) {
      return a.anglePenalty - b.anglePenalty;
    }
    if (Math.abs(a.area - b.area) > 1e-3) return b.area - a.area;
    if (Math.abs(a.depth - b.depth) > 1e-4) return b.depth - a.depth;
    return a.idx - b.idx;
  });

  return candidates[0]?.projected || null;
}

function atomVisualRadius(el) {
  const fromDefs = DEFAULT_ELEMENTS_3D[el]?.radius ?? 0.46;
  return 2.6 + fromDefs * 6.1;
}

function previewAtomRadius(el, depthFactor = 1) {
  return atomVisualRadius(el) * 0.74 * depthFactor;
}

function buildBallStickLayout(structure, orientationIndex = 0) {
  const layout3d = buildBallStickLayout3D(structure);
  if (!layout3d) return null;

  const projected = selectBestStaticProjection(layout3d, orientationIndex);
  if (!projected) return null;

  return {
    nodes: projected.nodes2d.map((node) => ({
      idx: node.idx,
      el: node.el,
      x: node.x,
      y: node.y,
      z: node.z,
      depthFactor: node.depthFactor,
      r: node.r,
    })),
    bonds: projected.bonds,
  };
}

function bondOffsets(order) {
  if (order <= 1) return [0];
  if (order === 2) return [-1.15, 1.15];
  return [-1.85, 0, 1.85];
}

export function MoleculeBallStickPreview({
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
        const aR = a.r || previewAtomRadius(aEl, a.depthFactor || 1);
        const bR = b.r || previewAtomRadius(bEl, b.depthFactor || 1);
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
        const r = node.r || previewAtomRadius(node.el, node.depthFactor || 1);
        return (
          <g key={idx}>
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={fill}
              stroke="#0f172a"
              strokeWidth={0.8}
            />
            <circle
              cx={node.x - r * 0.36}
              cy={node.y - r * 0.36}
              r={Math.max(0.85, r * 0.34)}
              fill="rgba(255,255,255,0.34)"
            />
            <text
              x={node.x}
              y={node.y + 2.35}
              textAnchor="middle"
              style={{
                fontFamily: "'Press Start 2P', ui-monospace, monospace",
                fontSize: node.el === "H" ? 3.35 : 3.95,
                fill: node.el === "C" ? "#f8fafc" : "#000000",
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
  const angleData = buildAngleConstraints(atoms, bonds);
  const angleConstraints = angleData.constraints;
  const nodes = buildInitialLayout3D(atoms, bonds, angleData.features);

  const vx = Array.from({ length: n }, () => 0);
  const vy = Array.from({ length: n }, () => 0);
  const vz = Array.from({ length: n }, () => 0);
  const damp = 0.86;

  for (let iter = 0; iter < 360; iter += 1) {
    const fx = Array.from({ length: n }, () => 0);
    const fy = Array.from({ length: n }, () => 0);
    const fz = Array.from({ length: n }, () => 0);
    const cool = 1 - iter / 400;

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
      const target = bondLengthTarget3D(atoms, a, b, bond.order);
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

    for (const constraint of angleConstraints) {
      const a = constraint.a;
      const b = constraint.b;
      const center = constraint.center;
      const dx = nodes[b].x - nodes[a].x;
      const dy = nodes[b].y - nodes[a].y;
      const dz = nodes[b].z - nodes[a].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const pull = constraint.stiffness * cool * (d - constraint.target);
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;

      fx[a] += pull * ux;
      fy[a] += pull * uy;
      fz[a] += pull * uz;
      fx[b] -= pull * ux;
      fy[b] -= pull * uy;
      fz[b] -= pull * uz;

      const midX = (nodes[a].x + nodes[b].x) * 0.5;
      const midY = (nodes[a].y + nodes[b].y) * 0.5;
      const midZ = (nodes[a].z + nodes[b].z) * 0.5;
      fx[center] += (midX - nodes[center].x) * 0.025 * cool;
      fy[center] += (midY - nodes[center].y) * 0.025 * cool;
      fz[center] += (midZ - nodes[center].z) * 0.025 * cool;
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

  return {
    nodes,
    bonds,
    guides: angleData.guides,
  };
}

function projectBallStick3D(layout3d, ax, ay, az, zoom = 1) {
  if (!layout3d) return null;
  const rotated = layout3d.nodes.map((n) => ({
    ...n,
    ...rotateXYZ(n, ax, ay, az),
  }));
  const maxXY = Math.max(
    0.25,
    ...rotated.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y))),
  );
  const zoomScale = clamp(Number(zoom) || 1, 0.55, 2.6);
  const baseScale = (23 / maxXY) * zoomScale;

  const nodes2d = rotated.map((n) => {
    const depthFactor = clamp(1 + n.z * 0.2, 0.7, 1.35);
    return {
      idx: n.idx,
      el: n.el,
      x: 50 + n.x * baseScale,
      y: 32 - n.y * baseScale,
      z: n.z,
      depthFactor,
      r: previewAtomRadius(n.el, depthFactor),
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

export function MoleculeRotatingPreview({
  structure,
  formula,
  width = 560,
  height = 340,
  xDeg = 0,
  yDeg = 0,
  zDeg = 0,
  zoom = 1,
}) {
  const layout3d = useMemo(() => buildBallStickLayout3D(structure), [structure]);
  const ax = (Number(xDeg) * Math.PI) / 180;
  const ay = (Number(yDeg) * Math.PI) / 180;
  const az = (Number(zDeg) * Math.PI) / 180;

  const projected = useMemo(
    () => projectBallStick3D(layout3d, ax, ay, az, zoom),
    [layout3d, ax, ay, az, zoom],
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
        return (
          <g key={nodeIdx}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={fill}
              stroke="#0f172a"
              strokeWidth={0.82}
            />
            <circle
              cx={node.x - node.r * 0.35}
              cy={node.y - node.r * 0.35}
              r={Math.max(0.85, node.r * 0.33)}
              fill="rgba(255,255,255,0.34)"
            />
            <text
              x={node.x}
              y={node.y + 2.35}
              textAnchor="middle"
              style={{
                fontFamily: "'Press Start 2P', ui-monospace, monospace",
                fontSize: node.el === "H" ? 3.35 : 3.95,
                fill: node.el === "C" ? "#f8fafc" : "#000000",
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
