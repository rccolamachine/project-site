import fs from "node:fs";
import path from "node:path";
import {
  SPONCH_ELEMENTS,
  describeMoleculeComponent,
} from "../lib/reactor/moleculeTools.mjs";

const TARGET_COUNT = 1000;
const MAX_ATOMS = 20;
const MAX_HEAVY_ATOMS = 10;
const MAX_RING_COUNT = 1;
const MAX_ROTATABLE_BONDS = 6;
const MAX_COMPLEXITY = 260;
const MAX_FORMULA_RESULTS = 32;
const PRE_RECORD_TARGET = 2400;
const RECORD_BATCH_SIZE = 12;
const OUTPUT_PATH = path.resolve("data/reactor_molecules.json");
const CACHE_VERSION = 1;
const CACHE_DIR = path.resolve(".cache/reactor-pubchem");
const STATE_PATH = path.join(CACHE_DIR, `state-v${CACHE_VERSION}.json`);
const FORMULAS_PER_RUN = clampInt(
  Number(process.env.REACTOR_FORMULAS_PER_RUN || 80),
  1,
  400,
);
const RECORD_BATCHES_PER_RUN = clampInt(
  Number(process.env.REACTOR_RECORD_BATCHES_PER_RUN || 30),
  1,
  300,
);
const CAS_COMMON_CHEMISTRY_DETAIL =
  "https://commonchemistry.cas.org/detail?cas_rn=";
const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";

const PROPERTY_FIELDS = [
  "Title",
  "MolecularFormula",
  "ConnectivitySMILES",
  "IUPACName",
  "Complexity",
  "Charge",
  "HBondDonorCount",
  "HBondAcceptorCount",
  "RotatableBondCount",
  "HeavyAtomCount",
  "IsotopeAtomCount",
  "CovalentUnitCount",
];

const ATOMIC_NUMBER_TO_EL = Object.freeze({
  1: "H",
  6: "C",
  7: "N",
  8: "O",
  15: "P",
  16: "S",
});

const MANUAL_NO_CARBON_FORMULAS = Object.freeze([
  "H2O",
  "NH3",
  "PH3",
  "H2S",
  "O2",
  "O3",
  "N2",
  "NO",
  "NO2",
  "N2O",
  "H2O2",
  "CO",
  "CO2",
  "SO2",
  "SO3",
  "HNO2",
  "HNO3",
  "H3PO4",
]);

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

const HARD_REJECT_TITLE_PATTERNS = [
  /\b(isotope|isotopologue|deuterated|tritiated|labeled|labelled)\b/i,
  /\b(radical|cation|anion|zwitterion|counterion)\b/i,
  /\b(hydrate|solvate|salt|mixture|complex|coordination|polymer|oligomer|adduct)\b/i,
  /\b(extract|fraction|reaction mass|metabolite|derivative|impurity)\b/i,
  /\b(protein|enzyme|peptide|dna|rna|lipid|oligosaccharide)\b/i,
  /\b(ylid|ylidene|ylidyne|carbene|nitrene|amidogen)\b/i,
  /\b(methylene|methylidyne|methanidyl|ethenylidene|propynylidene)\b/i,
  /\b(azanium|azanide|oxidanium|oxonium|sulfanium|phosphanium|phosphanide)\b/i,
  /\b(phosphorane|lambda\d*|fulminic|isofulminic)\b/i,
  /\b(aziridine|azirine|diazirine|diaziridine|oxirane|oxirene|thiirane|thiirene)\b/i,
  /\b(dioxirane|trioxirane|dioxaziridine|dioxathiirane|oxathiirane|thiazirine)\b/i,
  /\b(cyclopropene|cycloprop-.*ylidene|cycloprop-.*yne)\b/i,
  /\boxido\b/i,
  /[\[\]{}<>]/,
  /[\\/]/,
  /[(),;]/,
  /[+].*[-]|[-].*[+]/,
];

const SOFT_REJECT_TITLE_PATTERNS = [
  /,/,
  /;/,
  /:/,
  /\b(?:cis|trans|rac|alpha|beta|gamma|delta|epsilon|z|e|r|s)-/i,
  /\d,\d/,
  /\(/,
  /\)/,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CACHE_VERSION) throw new Error("cache version mismatch");
    return {
      version: CACHE_VERSION,
      formulaCursor: clampInt(parsed.formulaCursor || 0, 0, 1_000_000),
      formulaSearch: parsed.formulaSearch && typeof parsed.formulaSearch === "object"
        ? parsed.formulaSearch
        : {},
      candidatesByCid:
        parsed.candidatesByCid && typeof parsed.candidatesByCid === "object"
          ? parsed.candidatesByCid
          : {},
      rowsByCid:
        parsed.rowsByCid && typeof parsed.rowsByCid === "object"
          ? parsed.rowsByCid
          : {},
    };
  } catch {
    return {
      version: CACHE_VERSION,
      formulaCursor: 0,
      formulaSearch: {},
      candidatesByCid: {},
      rowsByCid: {},
    };
  }
}

function saveState(state) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { Accept: "text/plain,application/json;q=0.9,*/*;q=0.8" },
  });
  if (res.ok) return res.text();

  const body = await res.text();
  if (attempt < 6 && (res.status >= 500 || res.status === 429)) {
    await sleep(700 * (attempt + 1));
    return fetchText(url, attempt + 1);
  }
  throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 220)}`);
}

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { Accept: "application/json,text/plain;q=0.9,*/*;q=0.8" },
  });
  if (res.ok) return res.json();

  const body = await res.text();
  if (attempt < 6 && (res.status >= 500 || res.status === 429)) {
    await sleep(700 * (attempt + 1));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 220)}`);
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function buildHillFormula(counts) {
  const c = counts.C || 0;
  const h = counts.H || 0;
  const n = counts.N || 0;
  const o = counts.O || 0;
  const p = counts.P || 0;
  const s = counts.S || 0;

  const parts = [];
  const push = (el, count) => {
    if (!(count > 0)) return;
    parts.push(`${el}${count > 1 ? count : ""}`);
  };

  push("C", c);
  push("H", h);
  push("N", n);
  push("O", o);
  push("P", p);
  push("S", s);

  if (parts.length > 0) return parts.join("");

  push("H", h);
  push("N", n);
  push("O", o);
  push("P", p);
  push("S", s);
  return parts.join("");
}

function formulaLikeName(name) {
  return /^[CHNOPS\d]+$/i.test(String(name || "").trim());
}

function normalizeName(raw) {
  const name = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return "";
  return name
    .split(" ")
    .map((part) => {
      if (part.toUpperCase() === part && /[A-Z]{2,}/.test(part)) return part;
      if (part.length <= 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function isCidPlaceholder(name) {
  return /^CID\s+\d+$/i.test(String(name || "").trim());
}

function scoreTitleQuality(title) {
  const trimmed = String(title || "").trim();
  if (!trimmed) return { ok: false, penalty: 999 };
  if (trimmed.length < 2 || trimmed.length > 64) {
    return { ok: false, penalty: 999 };
  }
  if (formulaLikeName(trimmed)) return { ok: false, penalty: 999 };
  if (!/[A-Za-z]/.test(trimmed)) return { ok: false, penalty: 999 };
  if (HARD_REJECT_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { ok: false, penalty: 999 };
  }

  let penalty = 0;
  for (const pattern of SOFT_REJECT_TITLE_PATTERNS) {
    if (pattern.test(trimmed)) penalty += 18;
  }
  if (/[0-9]{3,}/.test(trimmed)) penalty += 40;
  if (/^[a-z]/.test(trimmed)) penalty += 6;
  if (trimmed.length > 32) penalty += trimmed.length - 32;

  return { ok: penalty <= 48, penalty };
}

function chooseDisplayName(prop) {
  const candidates = [
    normalizeName(prop?.Title || ""),
    normalizeName(prop?.IUPACName || ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isCidPlaceholder(candidate)) continue;
    const score = scoreTitleQuality(candidate);
    if (score.ok) return { title: candidate, penalty: score.penalty };
  }

  return null;
}

function generateFormulaRequests() {
  const formulas = [];
  const seen = new Set();

  const addFormula = (formula, rankBias = 0) => {
    const clean = String(formula || "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    formulas.push({ formula: clean, rankBias });
  };

  for (let i = 0; i < MANUAL_NO_CARBON_FORMULAS.length; i += 1) {
    addFormula(MANUAL_NO_CARBON_FORMULAS[i], -220 + i);
  }

  const MAX_CARBON = 8;
  const MAX_HETERO_TOTAL = 4;
  const MAX_DBE = 6;

  for (let heavyAtoms = 1; heavyAtoms <= MAX_HEAVY_ATOMS; heavyAtoms += 1) {
    for (let c = 1; c <= Math.min(MAX_CARBON, heavyAtoms); c += 1) {
      for (let n = 0; n <= Math.min(MAX_HETERO_TOTAL, heavyAtoms - c); n += 1) {
        for (let o = 0; o <= Math.min(MAX_HETERO_TOTAL, heavyAtoms - c - n); o += 1) {
          for (let p = 0; p <= Math.min(2, heavyAtoms - c - n - o); p += 1) {
            for (let s = 0; s <= Math.min(2, heavyAtoms - c - n - o - p); s += 1) {
              const totalHeavy = c + n + o + p + s;
              if (totalHeavy !== heavyAtoms) continue;
              if (n + o + p + s > MAX_HETERO_TOTAL) continue;

              const heteroPenalty = n * 1.7 + o * 1.5 + p * 2.7 + s * 2.4;
              for (let dbe = 0; dbe <= MAX_DBE; dbe += 1) {
                const h = 2 * c + n + p + 2 - 2 * dbe;
                if (h < 0) continue;
                const atomCount = totalHeavy + h;
                if (atomCount < 2 || atomCount > MAX_ATOMS) continue;

                const formula = buildHillFormula({
                  C: c,
                  H: h,
                  N: n,
                  O: o,
                  P: p,
                  S: s,
                });

                const rankBias =
                  atomCount * 18 +
                  totalHeavy * 10 +
                  dbe * 22 +
                  heteroPenalty * 10;
                addFormula(formula, rankBias);
              }
            }
          }
        }
      }
    }
  }

  formulas.sort((a, b) => {
    if (a.rankBias !== b.rankBias) return a.rankBias - b.rankBias;
    return a.formula.localeCompare(b.formula);
  });

  return formulas;
}

function parseListKey(text) {
  const m = String(text || "").match(/ListKey:\s*(\d+)/i);
  return m?.[1] || null;
}

function parseCidText(text) {
  return String(text || "")
    .split(/\s+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function searchFormulaCids(formula, limit = MAX_FORMULA_RESULTS) {
  try {
    const fastUrl =
      `${PUBCHEM_BASE}/fastformula/${encodeURIComponent(formula)}/cids/TXT` +
      `?listkey_count=${limit}`;
    const fastText = await fetchText(fastUrl);
    const fast = parseCidText(fastText).slice(0, limit);
    if (fast.length > 0) return fast;
  } catch {
    // Fall through to the documented asynchronous formula search.
  }

  try {
    const url = `${PUBCHEM_BASE}/formula/${encodeURIComponent(formula)}/cids/TXT`;
    const first = await fetchText(url);
    if (!/running/i.test(first)) return parseCidText(first).slice(0, limit);

    const listKey = parseListKey(first);
    if (!listKey) return [];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(attempt === 0 ? 150 : 350 + attempt * 120);
      const pollUrl =
        `${PUBCHEM_BASE}/listkey/${encodeURIComponent(listKey)}/cids/TXT` +
        `?listkey_start=0&listkey_count=${limit}`;
      const text = await fetchText(pollUrl);
      if (/running/i.test(text)) continue;
      return parseCidText(text).slice(0, limit);
    }
  } catch {
    return [];
  }

  return [];
}

async function fetchProperties(cids) {
  if (!Array.isArray(cids) || cids.length <= 0) return [];
  const url =
    `${PUBCHEM_BASE}/cid/${cids.join(",")}/property/` +
    `${PROPERTY_FIELDS.join(",")}/JSON`;
  const json = await fetchJson(url);
  return Array.isArray(json?.PropertyTable?.Properties)
    ? json.PropertyTable.Properties
    : [];
}

function prefilterProperty(prop, formulaMeta) {
  const nameChoice = chooseDisplayName(prop);
  if (!nameChoice) return null;

  const formula = String(prop?.MolecularFormula || "").trim();
  if (!/^[CHNOPS\d]+$/.test(formula)) return null;

  const charge = Number(prop?.Charge || 0);
  const heavyAtomCount = Number(prop?.HeavyAtomCount || 0);
  const isotopeAtomCount = Number(prop?.IsotopeAtomCount || 0);
  const covalentUnitCount = Number(prop?.CovalentUnitCount || 0);
  const complexity = Number(prop?.Complexity || 0);
  const rotatableBondCount = Number(prop?.RotatableBondCount || 0);

  if (charge !== 0) return null;
  if (covalentUnitCount !== 1) return null;
  if (isotopeAtomCount !== 0) return null;
  if (!(heavyAtomCount > 0) || heavyAtomCount > MAX_HEAVY_ATOMS) return null;
  if (complexity > MAX_COMPLEXITY) return null;
  if (rotatableBondCount > MAX_ROTATABLE_BONDS) return null;

  const atomCountEstimate = String(formula)
    .match(/[A-Z][a-z]?(\d+)?/g)
    ?.reduce((sum, token) => {
      const m = token.match(/([A-Z][a-z]?)(\d+)?/);
      if (!m) return sum;
      return sum + Number.parseInt(m[2] || "1", 10);
    }, 0);
  if (!Number.isFinite(atomCountEstimate) || atomCountEstimate > MAX_ATOMS) {
    return null;
  }

  const title = nameChoice.title;
  if (!title) return null;

  const smiles = String(prop?.ConnectivitySMILES || "");
  if (!smiles || /[.@\\/]/.test(smiles)) return null;

  let score = 1000;
  score -= formulaMeta.rankBias;
  score -= nameChoice.penalty * 5;
  score -= atomCountEstimate * 12;
  score -= heavyAtomCount * 10;
  score -= complexity * 0.8;
  score -= rotatableBondCount * 12;
  score -= Number(prop?.HBondDonorCount || 0) * 2;
  score -= Number(prop?.HBondAcceptorCount || 0) * 2;

  const cid = Number(prop?.CID || 0);
  if (cid > 0) score -= Math.log10(cid + 10) * 20;
  if (/^[A-Z]/.test(String(title || ""))) score += 20;
  if (/^[A-Za-z][A-Za-z -]+$/.test(title)) score += 25;
  if (
    title === "Water" ||
    title === "Ammonia" ||
    title === "Methane" ||
    title === "Ethane" ||
    title === "Benzene"
  ) {
    score += 40;
  }

  return {
    cid,
    title,
    formula,
    score,
  };
}

async function fetchRecordBatch(cids) {
  if (!Array.isArray(cids) || cids.length <= 0) return [];
  const url = `${PUBCHEM_BASE}/cid/${cids.join(",")}/record/JSON?record_type=2d`;
  const json = await fetchJson(url);
  return Array.isArray(json?.PC_Compounds) ? json.PC_Compounds : [];
}

function buildIndexedStructureFromRecord(record) {
  const atomIds = Array.isArray(record?.atoms?.aid) ? record.atoms.aid : [];
  const atomicNumbers = Array.isArray(record?.atoms?.element)
    ? record.atoms.element
    : [];
  if (atomIds.length <= 0 || atomIds.length !== atomicNumbers.length) return null;

  const atoms = [];
  const aidToIndex = new Map();
  for (let i = 0; i < atomIds.length; i += 1) {
    const el = ATOMIC_NUMBER_TO_EL[atomicNumbers[i]];
    if (!SPONCH_ELEMENTS.includes(el)) return null;
    atoms.push({ id: i + 1, el });
    aidToIndex.set(atomIds[i], i);
  }

  const aid1 = Array.isArray(record?.bonds?.aid1) ? record.bonds.aid1 : [];
  const aid2 = Array.isArray(record?.bonds?.aid2) ? record.bonds.aid2 : [];
  const order = Array.isArray(record?.bonds?.order) ? record.bonds.order : [];
  if (!(aid1.length === aid2.length && aid2.length === order.length)) return null;

  const bonds = [];
  const seen = new Set();
  for (let i = 0; i < aid1.length; i += 1) {
    const a = aidToIndex.get(aid1[i]);
    const b = aidToIndex.get(aid2[i]);
    const rawOrder = clampInt(order[i] || 1, 1, 6);
    if (a === undefined || b === undefined || a === b) continue;
    if (rawOrder > 3) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bonds.push({
      aId: lo + 1,
      bId: hi + 1,
      order: rawOrder,
    });
  }

  const structure = {
    atoms: atoms.map((atom) => ({ el: atom.el })),
    bonds: bonds
      .map((bond) => ({
        a: bond.aId - 1,
        b: bond.bId - 1,
        order: bond.order,
      }))
      .sort((x, y) => x.a - y.a || x.b - y.b || x.order - y.order),
  };

  return { atoms, bonds, structure };
}

function isSingleConnected(atoms, bonds) {
  if (!Array.isArray(atoms) || atoms.length <= 0) return false;
  if (atoms.length === 1) return true;
  const adjacency = Array.from({ length: atoms.length }, () => []);
  for (const bond of bonds) {
    const a = bond.aId - 1;
    const b = bond.bId - 1;
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const nxt of adjacency[cur]) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      stack.push(nxt);
    }
  }
  return seen.size === atoms.length;
}

function resolveCasNumber(name, formula) {
  const cleanName = String(name || "").trim();
  if (cleanName && CAS_BY_NAME[cleanName]) return CAS_BY_NAME[cleanName];

  const cleanFormula = String(formula || "").trim();
  if (cleanFormula && CAS_BY_FORMULA_WHEN_SINGLE_ISOMER[cleanFormula]) {
    return CAS_BY_FORMULA_WHEN_SINGLE_ISOMER[cleanFormula];
  }

  return null;
}

function buildOutputRow(record, candidate) {
  const parsed = buildIndexedStructureFromRecord(record);
  if (!parsed) return null;
  if (parsed.atoms.length > MAX_ATOMS) return null;
  if (!isSingleConnected(parsed.atoms, parsed.bonds)) return null;

  const desc = describeMoleculeComponent(parsed.atoms, parsed.bonds);
  if (desc.atomCount <= 0) return null;
  if (desc.atomCount > MAX_ATOMS) return null;
  if (desc.heavyAtomCount > MAX_HEAVY_ATOMS) return null;
  if (desc.ringCount > MAX_RING_COUNT) return null;
  if (desc.maxBondOrder > 3) return null;
  if (!/^[CHNOPS\d]+$/.test(desc.formula)) return null;

  const name = candidate.title;
  if (!name) return null;

  const casNumber = resolveCasNumber(name, desc.formula);
  const casUrl = casNumber
    ? `${CAS_COMMON_CHEMISTRY_DETAIL}${encodeURIComponent(casNumber)}`
    : null;

  return {
    pubchemCid: candidate.cid,
    name,
    formula: desc.formula,
    casNumber,
    casUrl,
    fingerprint: desc.fingerprint,
    structure: parsed.structure,
    atomCount: desc.atomCount,
    heavyAtomCount: desc.heavyAtomCount,
    ringCount: desc.ringCount,
    maxBondOrder: desc.maxBondOrder,
    origin: "pubchem",
    _score: candidate.score,
  };
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    if (a.atomCount !== b.atomCount) return a.atomCount - b.atomCount;
    if (a.heavyAtomCount !== b.heavyAtomCount) {
      return a.heavyAtomCount - b.heavyAtomCount;
    }
    return a.name.localeCompare(b.name);
  });
}

function formulaCapForRow(row) {
  const atomCount = Number(row?.atomCount || 0);
  if (atomCount <= 5) return 3;
  if (atomCount <= 8) return 4;
  return 5;
}

function selectFinalRows(rows) {
  const chosen = [];
  const perFormula = new Map();

  for (const row of sortRows(rows)) {
    const count = perFormula.get(row.formula) || 0;
    const cap = formulaCapForRow(row);
    if (count >= cap) continue;
    perFormula.set(row.formula, count + 1);
    chosen.push(row);
    if (chosen.length >= TARGET_COUNT) break;
  }

  return chosen;
}

function sortedPreCandidatesFromState(state) {
  return Object.values(state.candidatesByCid)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function sortedRowsFromState(state) {
  return Object.values(state.rowsByCid).filter(Boolean);
}

async function collectPropertyCandidates(state) {
  const formulas = generateFormulaRequests();
  const startIndex = clampInt(state.formulaCursor || 0, 0, formulas.length);
  const stopIndex = Math.min(formulas.length, startIndex + FORMULAS_PER_RUN);

  for (let i = startIndex; i < stopIndex; i += 1) {
    const formulaMeta = formulas[i];
    let cids = state.formulaSearch[formulaMeta.formula];
    if (!Array.isArray(cids)) {
      cids = await searchFormulaCids(formulaMeta.formula, MAX_FORMULA_RESULTS);
      state.formulaSearch[formulaMeta.formula] = cids;
    }
    if (cids.length <= 0) {
      state.formulaCursor = i + 1;
      saveState(state);
      continue;
    }

    const missingCids = cids.filter((cid) => !hasOwn(state.candidatesByCid, String(cid)));
    if (missingCids.length > 0) {
      let props = [];
      try {
        props = await fetchProperties(missingCids);
      } catch {
        await sleep(1500);
        state.formulaCursor = i;
        saveState(state);
        return sortedPreCandidatesFromState(state);
      }

      const propByCid = new Map(
        props.map((prop) => [Number(prop?.CID || 0), prop]).filter(([cid]) => cid > 0),
      );

      for (const cid of missingCids) {
        const prop = propByCid.get(cid);
        state.candidatesByCid[cid] = prop ? prefilterProperty(prop, formulaMeta) : null;
      }
    }

    state.formulaCursor = i + 1;
    const preCandidateCount = sortedPreCandidatesFromState(state).length;
    if ((i + 1) % 20 === 0 || i + 1 === stopIndex) {
      console.log(
        `Scanned formulas: ${i + 1}/${formulas.length} -> pre-candidates ${preCandidateCount}`,
      );
    }
    saveState(state);
    await sleep(120);
  }

  return sortedPreCandidatesFromState(state);
}

async function fetchMoreRows(state, preCandidates) {
  const candidateByCid = new Map(preCandidates.map((row) => [row.cid, row]));
  const candidatesToConsider = preCandidates.slice(
    0,
    Math.max(PRE_RECORD_TARGET, TARGET_COUNT * 5),
  );
  let batchesRan = 0;

  while (batchesRan < RECORD_BATCHES_PER_RUN) {
    const selectedNow = selectFinalRows(sortedRowsFromState(state));
    if (selectedNow.length >= TARGET_COUNT) return selectedNow;

    const pending = [];
    for (const candidate of candidatesToConsider) {
      if (!hasOwn(state.rowsByCid, String(candidate.cid))) {
        pending.push(candidate.cid);
      }
      if (pending.length >= RECORD_BATCH_SIZE) break;
    }

    if (pending.length <= 0) return selectedNow;

    let records = [];
    try {
      records = await fetchRecordBatch(pending);
    } catch {
      await sleep(1800);
      return selectFinalRows(sortedRowsFromState(state));
    }

    const recordByCid = new Map(
      records
        .map((record) => [Number(record?.id?.id?.cid || 0), record])
        .filter(([cid]) => cid > 0),
    );

    for (const cid of pending) {
      const candidate = candidateByCid.get(cid);
      const record = recordByCid.get(cid);
      state.rowsByCid[cid] = record && candidate ? buildOutputRow(record, candidate) : null;
    }

    batchesRan += 1;
    const selected = selectFinalRows(sortedRowsFromState(state));
    const remaining = Math.max(0, TARGET_COUNT - selected.length);
    console.log(
      `Record batches this run: ${batchesRan}/${RECORD_BATCHES_PER_RUN} -> selected ${selected.length}/${TARGET_COUNT} (still looking for ${remaining})`,
    );
    saveState(state);
    await sleep(180);
  }

  return selectFinalRows(sortedRowsFromState(state));
}

function writeOutput(rows) {
  const finalRows = rows.map((row, idx) => ({
    id: `mol-${String(idx + 1).padStart(4, "0")}`,
    pubchemCid: row.pubchemCid,
    name: row.name,
    formula: row.formula,
    casNumber: row.casNumber,
    casUrl: row.casUrl,
    fingerprint: row.fingerprint,
    structure: row.structure,
    atomCount: row.atomCount,
    heavyAtomCount: row.heavyAtomCount,
    ringCount: row.ringCount,
    maxBondOrder: row.maxBondOrder,
    origin: row.origin,
  }));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(finalRows, null, 2)}\n`, "utf8");

  const withRing = finalRows.filter((m) => m.ringCount > 0).length;
  const withMultiple = finalRows.filter((m) => m.maxBondOrder > 1).length;

  console.log(`Wrote ${finalRows.length} molecules -> ${OUTPUT_PATH}`);
  console.log(`Contains rings: ${withRing}`);
  console.log(`Contains double/triple bonds: ${withMultiple}`);
  console.log(
    `First ten: ${finalRows
      .slice(0, 10)
      .map((row) => `${row.name} (${row.formula})`)
      .join(", ")}`,
  );
}

async function main() {
  const state = loadState();
  const formulas = generateFormulaRequests();
  console.log(
    `Resuming PubChem build: formulas ${state.formulaCursor}/${formulas.length}, cached pre-candidates ${sortedPreCandidatesFromState(state).length}, cached rows ${sortedRowsFromState(state).length}`,
  );

  const preCandidates = await collectPropertyCandidates(state);
  console.log(`Pre-candidates available: ${preCandidates.length}`);

  const selectedRows = await fetchMoreRows(state, preCandidates);
  const remaining = Math.max(0, TARGET_COUNT - selectedRows.length);
  console.log(
    `Selected so far: ${selectedRows.length}/${TARGET_COUNT} (still looking for ${remaining})`,
  );

  saveState(state);
  if (selectedRows.length >= TARGET_COUNT) {
    writeOutput(selectedRows);
  } else {
    console.log("Catalogue not complete yet. Re-run the script to continue from cache.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
