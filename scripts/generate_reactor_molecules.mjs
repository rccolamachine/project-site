// scripts/generate_reactor_molecules.mjs
import fs from "node:fs";
import path from "node:path";
import {
  SPONCH_ELEMENTS,
  VALENCE_BY_ELEMENT,
  describeMoleculeComponent,
} from "../lib/reactor/moleculeTools.mjs";

const TARGET_COUNT = 1000;
const MAX_ATOMS = 20;
const MAX_RINGS = 1;
const OUTPUT_PATH = path.resolve("data/reactor_molecules.json");
const CAS_COMMON_CHEMISTRY_DETAIL = "https://commonchemistry.cas.org/detail?cas_rn=";

const CAS_BY_NAME = Object.freeze({
  Water: "7732-18-5",
  "Hydrogen Sulfide": "7783-06-4",
  Ammonia: "7664-41-7",
  Phosphine: "7803-51-2",
  Methane: "74-82-8",
  Ethane: "74-84-0",
  Ethene: "74-85-1",
  Ethyne: "74-86-2",
  Propane: "74-98-6",
  Cyclopropane: "75-19-4",
  Cyclobutane: "287-23-0",
  Cyclohexane: "110-82-7",
  Benzene: "71-43-2",
  Pyridine: "110-86-1",
  Pyrimidine: "289-95-2",
  Furan: "110-00-9",
  Thiophene: "110-02-1",
  Pyrrole: "109-97-7",
  Toluene: "108-88-3",
  Styrene: "100-42-5",
  Phenol: "108-95-2",
  Aniline: "62-53-3",
  Benzonitrile: "100-47-0",
  Formaldehyde: "50-00-0",
  Acetaldehyde: "75-07-0",
  Acetone: "67-64-1",
  Acetonitrile: "75-05-8",
  "Sulfur Dioxide": "7446-09-5",
});

const CAS_BY_FORMULA_WHEN_SINGLE_ISOMER = Object.freeze({
  O2: "7782-44-7",
  CO2: "124-38-9",
  H2O2: "7722-84-1",
  O3: "10028-15-6",
});

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

const rng = createRng(20260217);

function randInt(min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickWeighted(weighted) {
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  let t = rng() * total;
  for (const [value, weight] of weighted) {
    t -= weight;
    if (t <= 0) return value;
  }
  return weighted[weighted.length - 1][0];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildIndexedStructure(atoms, bonds) {
  const atomList = Array.isArray(atoms) ? atoms : [];
  const bondList = Array.isArray(bonds) ? bonds : [];
  const idxById = new Map(atomList.map((a, idx) => [a.id, idx]));
  const structureBonds = [];
  const seen = new Set();
  const structureAtoms = atomList.map((a) => ({ el: a.el }));

  for (const bond of bondList) {
    const orderRaw = Number.isFinite(bond.order) ? Math.round(bond.order) : 1;
    const order = Math.max(1, Math.min(3, orderRaw));
    const ia = idxById.get(bond.aId);
    const ib = idxById.get(bond.bId);
    if (ia === undefined || ib === undefined || ia === ib) continue;

    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    const key = edgeKey(lo, hi);
    if (seen.has(key)) continue;
    seen.add(key);

    structureBonds.push({
      a: lo,
      b: hi,
      order,
    });
  }

  return {
    atoms: structureAtoms,
    bonds: structureBonds.sort((x, y) => x.a - y.a || x.b - y.b || x.order - y.order),
  };
}

function buildExplicitMolecule(name, heavyElements, heavyEdges, origin) {
  const valenceLeft = heavyElements.map((el) => VALENCE_BY_ELEMENT[el] ?? 0);
  if (valenceLeft.some((v) => v <= 0)) return null;

  for (const edge of heavyEdges) {
    const order = Math.max(1, Math.min(3, Math.round(edge.order || 1)));
    const a = edge.a;
    const b = edge.b;
    if (a === b) return null;
    if (a < 0 || b < 0 || a >= heavyElements.length || b >= heavyElements.length) {
      return null;
    }
    valenceLeft[a] -= order;
    valenceLeft[b] -= order;
    if (valenceLeft[a] < 0 || valenceLeft[b] < 0) return null;
  }

  const atoms = [];
  const bonds = [];
  let nextId = 1;
  const heavyIds = heavyElements.map((el) => {
    const id = nextId;
    nextId += 1;
    atoms.push({ id, el });
    return id;
  });

  for (const edge of heavyEdges) {
    bonds.push({
      aId: heavyIds[edge.a],
      bId: heavyIds[edge.b],
      order: Math.max(1, Math.min(3, Math.round(edge.order || 1))),
    });
  }

  for (let i = 0; i < valenceLeft.length; i += 1) {
    const hCount = Math.max(0, valenceLeft[i]);
    for (let k = 0; k < hCount; k += 1) {
      const hId = nextId;
      nextId += 1;
      atoms.push({ id: hId, el: "H" });
      bonds.push({ aId: heavyIds[i], bId: hId, order: 1 });
    }
  }

  const desc = describeMoleculeComponent(atoms, bonds);
  if (desc.atomCount <= 0) return null;
  if (desc.atomCount > MAX_ATOMS) return null;
  if (desc.ringCount > MAX_RINGS) return null;

  return {
    name,
    origin,
    atoms,
    bonds,
    structure: buildIndexedStructure(atoms, bonds),
    ...desc,
  };
}

function addTemplateMolecules(addCandidate) {
  const templates = [
    {
      name: "Methane",
      heavyElements: ["C"],
      heavyEdges: [],
    },
    {
      name: "Ethane",
      heavyElements: ["C", "C"],
      heavyEdges: [{ a: 0, b: 1, order: 1 }],
    },
    {
      name: "Ethene",
      heavyElements: ["C", "C"],
      heavyEdges: [{ a: 0, b: 1, order: 2 }],
    },
    {
      name: "Ethyne",
      heavyElements: ["C", "C"],
      heavyEdges: [{ a: 0, b: 1, order: 3 }],
    },
    {
      name: "Propane",
      heavyElements: ["C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
      ],
    },
    {
      name: "Cyclopropane",
      heavyElements: ["C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 0, order: 1 },
      ],
    },
    {
      name: "Cyclobutane",
      heavyElements: ["C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 0, order: 1 },
      ],
    },
    {
      name: "Cyclohexane",
      heavyElements: ["C", "C", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 1 },
        { a: 5, b: 0, order: 1 },
      ],
    },
    {
      name: "Benzene",
      heavyElements: ["C", "C", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
      ],
    },
    {
      name: "Pyridine",
      heavyElements: ["N", "C", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 },
        { a: 4, b: 5, order: 1 },
        { a: 5, b: 0, order: 2 },
      ],
    },
    {
      name: "Pyrimidine",
      heavyElements: ["N", "C", "N", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 },
        { a: 4, b: 5, order: 1 },
        { a: 5, b: 0, order: 2 },
      ],
    },
    {
      name: "Furan",
      heavyElements: ["O", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 },
        { a: 4, b: 0, order: 1 },
      ],
    },
    {
      name: "Thiophene",
      heavyElements: ["S", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 },
        { a: 4, b: 0, order: 1 },
      ],
    },
    {
      name: "Pyrrole",
      heavyElements: ["N", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 2, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 },
        { a: 4, b: 0, order: 1 },
      ],
    },
    {
      name: "Toluene",
      heavyElements: ["C", "C", "C", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
        { a: 0, b: 6, order: 1 },
      ],
    },
    {
      name: "Styrene",
      heavyElements: ["C", "C", "C", "C", "C", "C", "C", "C"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
        { a: 0, b: 6, order: 1 },
        { a: 6, b: 7, order: 2 },
      ],
    },
    {
      name: "Phenol",
      heavyElements: ["C", "C", "C", "C", "C", "C", "O"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
        { a: 0, b: 6, order: 1 },
      ],
    },
    {
      name: "Aniline",
      heavyElements: ["C", "C", "C", "C", "C", "C", "N"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
        { a: 0, b: 6, order: 1 },
      ],
    },
    {
      name: "Benzonitrile",
      heavyElements: ["C", "C", "C", "C", "C", "C", "C", "N"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 2 },
        { a: 5, b: 0, order: 1 },
        { a: 0, b: 6, order: 1 },
        { a: 6, b: 7, order: 3 },
      ],
    },
    {
      name: "Formaldehyde",
      heavyElements: ["C", "O"],
      heavyEdges: [{ a: 0, b: 1, order: 2 }],
    },
    {
      name: "Acetaldehyde",
      heavyElements: ["C", "C", "O"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
      ],
    },
    {
      name: "Acetone",
      heavyElements: ["C", "C", "C", "O"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 1 },
        { a: 1, b: 3, order: 2 },
      ],
    },
    {
      name: "Acetonitrile",
      heavyElements: ["C", "C", "N"],
      heavyEdges: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 3 },
      ],
    },
    {
      name: "Water",
      heavyElements: ["O"],
      heavyEdges: [],
    },
    {
      name: "Ammonia",
      heavyElements: ["N"],
      heavyEdges: [],
    },
    {
      name: "Phosphine",
      heavyElements: ["P"],
      heavyEdges: [],
    },
    {
      name: "Hydrogen Sulfide",
      heavyElements: ["S"],
      heavyEdges: [],
    },
    {
      name: "Sulfur Dioxide",
      heavyElements: ["O", "S", "O"],
      heavyEdges: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 2 },
      ],
    },
  ];

  for (const tmpl of templates) {
    const candidate = buildExplicitMolecule(
      tmpl.name,
      tmpl.heavyElements,
      tmpl.heavyEdges,
      "template",
    );
    if (candidate) addCandidate(candidate);
  }
}

function buildRandomHeavyScaffold() {
  const heavyCount = pickWeighted([
    [1, 14],
    [2, 14],
    [3, 13],
    [4, 12],
    [5, 11],
    [6, 10],
    [7, 8],
    [8, 6],
    [9, 4],
    [10, 3],
  ]);

  const heavyElements = Array.from({ length: heavyCount }, () =>
    pickWeighted([
      ["C", 60],
      ["N", 14],
      ["O", 14],
      ["P", 6],
      ["S", 6],
    ]),
  );

  const edges = [];
  const edgeSet = new Set();

  // Connected tree baseline.
  for (let i = 1; i < heavyCount; i += 1) {
    const parent = randInt(0, i - 1);
    edges.push({ a: i, b: parent, order: 1 });
    edgeSet.add(edgeKey(i, parent));
  }

  let ringEdge = null;
  if (heavyCount >= 3 && rng() < 0.25) {
    const candidates = [];
    for (let i = 0; i < heavyCount; i += 1) {
      for (let j = i + 1; j < heavyCount; j += 1) {
        const key = edgeKey(i, j);
        if (edgeSet.has(key)) continue;
        candidates.push([i, j]);
      }
    }
    if (candidates.length > 0) {
      const [a, b] = candidates[randInt(0, candidates.length - 1)];
      edges.push({ a, b, order: 1 });
      ringEdge = { a, b };
    }
  }

  return { heavyElements, edges, ringEdge };
}

function findTreePath(nodeCount, edges, src, dst) {
  const adj = Array.from({ length: nodeCount }, () => []);
  for (const edge of edges) {
    if (edge.order !== 1) continue;
    adj[edge.a].push(edge.b);
    adj[edge.b].push(edge.a);
  }

  const prev = Array(nodeCount).fill(-1);
  const queue = [src];
  prev[src] = src;

  for (let q = 0; q < queue.length; q += 1) {
    const cur = queue[q];
    if (cur === dst) break;
    for (const nxt of adj[cur]) {
      if (prev[nxt] !== -1) continue;
      prev[nxt] = cur;
      queue.push(nxt);
    }
  }

  if (prev[dst] === -1) return [];

  const path = [dst];
  let cur = dst;
  while (cur !== src) {
    cur = prev[cur];
    path.push(cur);
  }
  path.reverse();
  return path;
}

function canTriple(elA, elB) {
  const ok = new Set(["C", "N", "P"]);
  return ok.has(elA) && ok.has(elB);
}

function upgradeBondOrders(heavyElements, edges, ringEdge) {
  const valenceLeft = heavyElements.map((el) => VALENCE_BY_ELEMENT[el] ?? 0);
  for (const edge of edges) {
    valenceLeft[edge.a] -= 1;
    valenceLeft[edge.b] -= 1;
  }
  if (valenceLeft.some((v) => v < 0)) return null;

  if (ringEdge) {
    const treeEdges = edges.filter(
      (e) => !(e.a === ringEdge.a && e.b === ringEdge.b) && !(e.a === ringEdge.b && e.b === ringEdge.a),
    );
    const path = findTreePath(heavyElements.length, treeEdges, ringEdge.a, ringEdge.b);

    if (path.length >= 5 && path.length <= 7 && rng() < 0.35) {
      const ringPathEdges = [];
      for (let i = 0; i < path.length - 1; i += 1) {
        ringPathEdges.push(edgeKey(path[i], path[i + 1]));
      }
      ringPathEdges.push(edgeKey(ringEdge.a, ringEdge.b));

      const edgeByKey = new Map();
      for (const edge of edges) {
        edgeByKey.set(edgeKey(edge.a, edge.b), edge);
      }

      for (let i = 0; i < ringPathEdges.length; i += 1) {
        if (i % 2 !== 0) continue;
        const key = ringPathEdges[i];
        const edge = edgeByKey.get(key);
        if (!edge) continue;
        if (valenceLeft[edge.a] <= 0 || valenceLeft[edge.b] <= 0) continue;
        edge.order += 1;
        valenceLeft[edge.a] -= 1;
        valenceLeft[edge.b] -= 1;
      }
    }
  }

  const idx = edges.map((_, i) => i);
  for (let pass = 0; pass < 3; pass += 1) {
    shuffle(idx);
    for (const i of idx) {
      const edge = edges[i];
      const maxAdd = Math.min(3 - edge.order, valenceLeft[edge.a], valenceLeft[edge.b]);
      if (maxAdd <= 0) continue;

      const doubleChance = edge.order === 1 ? 0.22 : 0.08;
      if (rng() >= doubleChance) continue;

      let add = 1;
      if (
        maxAdd >= 2 &&
        edge.order === 1 &&
        rng() < 0.12 &&
        canTriple(heavyElements[edge.a], heavyElements[edge.b])
      ) {
        add = 2;
      }

      edge.order += add;
      valenceLeft[edge.a] -= add;
      valenceLeft[edge.b] -= add;
    }
  }

  if (valenceLeft.some((v) => v < 0)) return null;
  return edges;
}

function generateRandomCandidate() {
  const scaffold = buildRandomHeavyScaffold();
  const edges = scaffold.edges.map((e) => ({ ...e }));
  const upgraded = upgradeBondOrders(scaffold.heavyElements, edges, scaffold.ringEdge);
  if (!upgraded) return null;

  const candidate = buildExplicitMolecule(
    "",
    scaffold.heavyElements,
    upgraded,
    "generated",
  );
  if (!candidate) return null;

  const onlySponch = candidate.atoms.every((a) => SPONCH_ELEMENTS.includes(a.el));
  if (!onlySponch) return null;

  return candidate;
}

function isIsomerLabel(name) {
  return /\sisomer\s+\d+$/i.test(String(name || "").trim());
}

function resolveCasNumber(name, formula) {
  const cleanName = String(name || "").trim();
  if (cleanName && CAS_BY_NAME[cleanName]) return CAS_BY_NAME[cleanName];

  if (isIsomerLabel(cleanName)) return null;

  const cleanFormula = String(formula || "").trim();
  if (cleanFormula && CAS_BY_FORMULA_WHEN_SINGLE_ISOMER[cleanFormula]) {
    return CAS_BY_FORMULA_WHEN_SINGLE_ISOMER[cleanFormula];
  }

  return null;
}

function main() {
  const byFingerprint = new Map();

  function addCandidate(candidate) {
    if (!candidate) return false;
    if (byFingerprint.has(candidate.fingerprint)) return false;
    if (candidate.atomCount > MAX_ATOMS) return false;
    if (candidate.ringCount > MAX_RINGS) return false;
    byFingerprint.set(candidate.fingerprint, candidate);
    return true;
  }

  addTemplateMolecules(addCandidate);

  let attempts = 0;
  while (byFingerprint.size < TARGET_COUNT && attempts < 600000) {
    attempts += 1;
    const candidate = generateRandomCandidate();
    addCandidate(candidate);
  }

  if (byFingerprint.size < TARGET_COUNT) {
    throw new Error(
      `Only generated ${byFingerprint.size} molecules after ${attempts} attempts.`
    );
  }

  const sorted = Array.from(byFingerprint.values())
    .sort((a, b) => {
      if (a.atomCount !== b.atomCount) return a.atomCount - b.atomCount;
      if (a.ringCount !== b.ringCount) return a.ringCount - b.ringCount;
      if (a.maxBondOrder !== b.maxBondOrder) return b.maxBondOrder - a.maxBondOrder;
      if (a.formula !== b.formula) return a.formula.localeCompare(b.formula);
      return a.fingerprint.localeCompare(b.fingerprint);
    })
    .slice(0, TARGET_COUNT);

  const generatedFormulaTotals = new Map();
  for (const m of sorted) {
    const hasCustomName = Boolean(m.name && m.name.trim().length > 0);
    if (hasCustomName) continue;
    generatedFormulaTotals.set(
      m.formula,
      (generatedFormulaTotals.get(m.formula) || 0) + 1,
    );
  }
  const generatedFormulaOrdinal = new Map();

  const rows = sorted
    .map((m, idx) => {
      const hasCustomName = Boolean(m.name && m.name.trim().length > 0);
      let generatedName = m.formula;
      if (!hasCustomName) {
        const totalForFormula = generatedFormulaTotals.get(m.formula) || 1;
        const nextOrdinal = (generatedFormulaOrdinal.get(m.formula) || 0) + 1;
        generatedFormulaOrdinal.set(m.formula, nextOrdinal);
        if (totalForFormula > 1) {
          generatedName = `${m.formula} isomer ${nextOrdinal}`;
        }
      }

      const resolvedName = hasCustomName ? m.name : generatedName;
      const casNumber = resolveCasNumber(resolvedName, m.formula);
      const casUrl = casNumber
        ? `${CAS_COMMON_CHEMISTRY_DETAIL}${encodeURIComponent(casNumber)}`
        : null;

      return {
        id: `mol-${String(idx + 1).padStart(4, "0")}`,
        name: resolvedName,
        formula: m.formula,
        casNumber,
        casUrl,
        fingerprint: m.fingerprint,
        structure: m.structure,
        atomCount: m.atomCount,
        heavyAtomCount: m.heavyAtomCount,
        ringCount: m.ringCount,
        maxBondOrder: m.maxBondOrder,
        origin: m.origin,
      };
    });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const withRing = rows.filter((m) => m.ringCount > 0).length;
  const withMultiple = rows.filter((m) => m.maxBondOrder > 1).length;

  console.log(`Wrote ${rows.length} molecules -> ${OUTPUT_PATH}`);
  console.log(`Contains rings: ${withRing}`);
  console.log(`Contains double/triple bonds: ${withMultiple}`);
}

main();
