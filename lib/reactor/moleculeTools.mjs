// lib/reactor/moleculeTools.mjs

export const SPONCH_ELEMENTS = Object.freeze(["S", "P", "O", "N", "C", "H"]);

export const VALENCE_BY_ELEMENT = Object.freeze({
  H: 1,
  C: 4,
  N: 3,
  O: 2,
  P: 3,
  S: 2,
});

const HILL_OTHER_ORDER = ["N", "O", "P", "S"];
const HASH64_OFFSET = 1469598103934665603n;
const HASH64_PRIME = 1099511628211n;
const HASH64_MASK = (1n << 64n) - 1n;

function sortedUnique(values) {
  return Array.from(new Set(values)).sort();
}

function pairKey(a, b) {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

function fnv1a64(input) {
  let h = HASH64_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * HASH64_PRIME) & HASH64_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

export function computeFormulaFromAtoms(atoms) {
  const counts = { C: 0, H: 0, N: 0, O: 0, P: 0, S: 0 };
  for (const atom of atoms || []) {
    if (!atom?.el || !(atom.el in counts)) continue;
    counts[atom.el] += 1;
  }

  const parts = [];
  const pushPart = (el) => {
    const n = counts[el] || 0;
    if (n <= 0) return;
    parts.push(`${el}${n > 1 ? n : ""}`);
  };

  // Hill-style: C, H, then alphabetical for the rest.
  pushPart("C");
  pushPart("H");
  for (const el of HILL_OTHER_ORDER) pushPart(el);

  if (parts.length > 0) return parts.join("");

  // If there's no carbon/hydrogen (unlikely here), fallback to explicit order.
  for (const el of ["H", "N", "O", "P", "S"]) pushPart(el);
  return parts.join("") || "";
}

export function describeMoleculeComponent(atoms, bonds) {
  const atomList = Array.isArray(atoms) ? atoms : [];
  const bondList = Array.isArray(bonds) ? bonds : [];

  if (atomList.length <= 0) {
    return {
      fingerprint: "wl1-empty",
      canonicalKey: "empty",
      formula: "",
      atomCount: 0,
      heavyAtomCount: 0,
      bondCount: 0,
      ringCount: 0,
      maxBondOrder: 0,
    };
  }

  const atomIndexById = new Map();
  for (let i = 0; i < atomList.length; i += 1) {
    atomIndexById.set(atomList[i].id, i);
  }

  const neighbors = Array.from({ length: atomList.length }, () => []);
  const edgeRows = [];

  for (const bond of bondList) {
    const i = atomIndexById.get(bond.aId);
    const j = atomIndexById.get(bond.bId);
    if (i === undefined || j === undefined || i === j) continue;

    const orderRaw = Number.isFinite(bond.order) ? Math.round(bond.order) : 1;
    const order = Math.max(1, Math.min(3, orderRaw));

    neighbors[i].push({ to: j, order });
    neighbors[j].push({ to: i, order });
    edgeRows.push({ i, j, order });
  }

  let labels = atomList.map((atom, idx) => {
    const orderBag = neighbors[idx]
      .map((n) => n.order)
      .sort((a, b) => a - b)
      .join("");
    return `${atom.el}|d${neighbors[idx].length}|o${orderBag}`;
  });

  for (let iter = 0; iter < 8; iter += 1) {
    const nextRaw = labels.map((label, idx) => {
      const neigh = neighbors[idx]
        .map((n) => `${n.order}:${labels[n.to]}`)
        .sort()
        .join(",");
      return `${label}|[${neigh}]`;
    });

    const uniq = sortedUnique(nextRaw);
    const remap = new Map();
    for (let i = 0; i < uniq.length; i += 1) {
      remap.set(uniq[i], `c${i.toString(36)}`);
    }

    labels = nextRaw.map((raw) => remap.get(raw));
  }

  const formula = computeFormulaFromAtoms(atomList);
  const atomCount = atomList.length;
  const heavyAtomCount = atomList.reduce((sum, atom) => sum + (atom.el === "H" ? 0 : 1), 0);
  const bondCount = edgeRows.length;
  const ringCount = Math.max(0, bondCount - atomCount + 1);
  const maxBondOrder = edgeRows.reduce((m, edge) => Math.max(m, edge.order), 0);

  const nodeBag = labels.slice().sort().join(",");
  const edgeBag = edgeRows
    .map(({ i, j, order }) => {
      const li = labels[i];
      const lj = labels[j];
      return li <= lj ? `${li}-${order}-${lj}` : `${lj}-${order}-${li}`;
    })
    .sort()
    .join(",");

  const canonicalKey = [
    `n:${atomCount}`,
    `b:${bondCount}`,
    `r:${ringCount}`,
    `m:${maxBondOrder}`,
    `f:${formula}`,
    `nodes:${nodeBag}`,
    `edges:${edgeBag}`,
  ].join("|");

  return {
    fingerprint: `wl1-${fnv1a64(canonicalKey)}`,
    canonicalKey,
    formula,
    atomCount,
    heavyAtomCount,
    bondCount,
    ringCount,
    maxBondOrder,
  };
}

export function analyzeMoleculeComponents(atoms, bonds) {
  const atomList = Array.isArray(atoms) ? atoms : [];
  const bondList = Array.isArray(bonds) ? bonds : [];
  if (atomList.length <= 0) return [];

  const atomById = new Map();
  for (const atom of atomList) atomById.set(atom.id, atom);

  const adjacency = new Map();
  for (const atom of atomList) adjacency.set(atom.id, []);

  for (const bond of bondList) {
    if (!atomById.has(bond.aId) || !atomById.has(bond.bId)) continue;
    const orderRaw = Number.isFinite(bond.order) ? Math.round(bond.order) : 1;
    const order = Math.max(1, Math.min(3, orderRaw));
    adjacency.get(bond.aId).push({ id: bond.bId, order });
    adjacency.get(bond.bId).push({ id: bond.aId, order });
  }

  const seen = new Set();
  const components = [];

  for (const atom of atomList) {
    if (seen.has(atom.id)) continue;

    const stack = [atom.id];
    const compIds = [];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      compIds.push(cur);

      const neigh = adjacency.get(cur) || [];
      for (const n of neigh) {
        if (!seen.has(n.id)) stack.push(n.id);
      }
    }

    const compSet = new Set(compIds);
    const compAtoms = compIds
      .map((id) => atomById.get(id))
      .filter(Boolean);

    const edgeSeen = new Set();
    const compBonds = [];
    for (const id of compIds) {
      const neigh = adjacency.get(id) || [];
      for (const n of neigh) {
        if (!compSet.has(n.id)) continue;
        const key = pairKey(id, n.id);
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        compBonds.push({ aId: id, bId: n.id, order: n.order });
      }
    }

    const desc = describeMoleculeComponent(compAtoms, compBonds);
    components.push({
      ...desc,
      atomIds: compIds.slice().sort((a, b) => a - b),
    });
  }

  return components.sort((a, b) => {
    if (b.atomCount !== a.atomCount) return b.atomCount - a.atomCount;
    if (b.bondCount !== a.bondCount) return b.bondCount - a.bondCount;
    return a.fingerprint.localeCompare(b.fingerprint);
  });
}
