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

const ATOMIC_WEIGHTS = {
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

function previewAtomRadius(el, depthFactor = 1) {
  return atomVisualRadius(el) * 0.74 * depthFactor;
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

  const candidateRank = clamp(Math.floor(orientationIndex), 0, candidates.length - 1);
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
  const maxRadius = Math.max(...atoms.map((a) => previewAtomRadius(a.el)));
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
        const aR = previewAtomRadius(aEl);
        const bR = previewAtomRadius(bEl);
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
        const r = previewAtomRadius(node.el);
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
