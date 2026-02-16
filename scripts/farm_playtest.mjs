import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const CHECKPOINTS = [2, 5, 10, 15, 20, 30, 60, 90, 180, 360, 720];
const TOTAL_MS = 720 * 60 * 1000;
const TICK_MS = 2000;

const PROFILES = [
  { id: "speed1", style: "speed", decisionMs: 2500, actions: 92, pMin: 2.5, pBuf: 1.02 },
  { id: "speed2", style: "speed", decisionMs: 3200, actions: 58, pMin: 3.2, pBuf: 1.05 },
  { id: "explore1", style: "explore", decisionMs: 4200, actions: 76, pMin: 7, pBuf: 1.2 },
  { id: "explore2", style: "qa", decisionMs: 5000, actions: 62, pMin: 9, pBuf: 1.3 },
  { id: "dopamine1", style: "dopamine", decisionMs: 2800, actions: 92, pMin: 4.5, pBuf: 1.1 },
  { id: "dopamine2", style: "dopamine", decisionMs: 3600, actions: 48, pMin: 6, pBuf: 1.15 },
  { id: "idle1", style: "idle", decisionMs: 7000, actions: 26, pMin: 12, pBuf: 1.35 },
  { id: "casual1", style: "casual", decisionMs: 9000, actions: 18, pMin: 15, pBuf: 1.45 },
  { id: "analysis1", style: "analysis", decisionMs: 4600, actions: 58, pMin: 8, pBuf: 1.2 },
  { id: "stress1", style: "stress", decisionMs: 5200, actions: 50, pMin: 10, pBuf: 1.35 },
];

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s) {
  let h = 2166136261;
  const v = String(s || "");
  for (let i = 0; i < v.length; i += 1) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function countTrue(obj) {
  return Object.values(obj || {}).filter(Boolean).length;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + Number(v || 0), 0) / values.length;
}

function topStrings(items, limit = 4) {
  const map = new Map();
  for (const item of items) {
    const key = String(item || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function visible(state, cfg) {
  const out = [];
  const size = clamp(Number(state.activeFarmSize || 3), 3, cfg.GRID_SIZE);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) out.push(r * cfg.GRID_SIZE + c);
  }
  return out;
}

async function loadModules(
  configPath = "lib/farm/config.js",
  enginePath = "lib/farm/engine.js",
  curvePath = "lib/farm/curveParams.js",
) {
  const root = process.cwd();
  const dir = path.join(root, ".tmp_farm_sim", `${Date.now()}_${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });

  const cfgPath = path.join(dir, "config.mjs");
  const engPath = path.join(dir, "engine.mjs");
  const curveMjsPath = path.join(dir, "curveParams.mjs");

  const cfgSource = fs.readFileSync(path.join(root, configPath), "utf8");
  fs.writeFileSync(cfgPath, cfgSource, "utf8");
  const curveSource = fs.readFileSync(path.join(root, curvePath), "utf8");
  fs.writeFileSync(curveMjsPath, curveSource, "utf8");

  const engSource = fs
    .readFileSync(path.join(root, enginePath), "utf8")
    .replace('from "./config";', 'from "./config.mjs";')
    .replace('from "./curveParams";', 'from "./curveParams.mjs";');
  fs.writeFileSync(engPath, engSource, "utf8");

  const [engine, config] = await Promise.all([
    import(`${pathToFileURL(engPath).href}?v=${Math.random()}`),
    import(`${pathToFileURL(cfgPath).href}?v=${Math.random()}`),
  ]);

  return {
    engine,
    config,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}

function mkInterval() {
  return {
    earn: 0,
    harv: 0,
    jack: 0,
    reg: 0,
    bonus: 0,
    spend: 0,
    unlock: 0,
    prest: 0,
    exp: 0,
    upg: 0,
    auto: 0,
    animal: 0,
    active: 0,
    idle: 0,
  };
}

function unlockTotal(state) {
  const b = state?.discovered?.brushes || {};
  return (
    countTrue(state?.discovered?.seeds || {}) +
    countTrue(state?.discovered?.tools || {}) +
    countTrue(state?.discovered?.animals || {}) +
    countTrue(state?.discovered?.automation || {}) +
    countTrue(b.plow || {}) +
    countTrue(b.water || {}) +
    countTrue(b.plant || {}) +
    countTrue(b.harvest || {})
  );
}

function setSink(ctx) {
  ctx.state.__runtimeEventSink = (event) => {
    if (!event || typeof event !== "object") return;
    if (event.kind === "earning") {
      const amount = Math.max(0, Number(event.amount || 0));
      const count = Math.max(1, Number(event.count || 1));
      ctx.stats.earn += amount;
      ctx.stats.harv += count;
      ctx.interval.earn += amount;
      ctx.interval.harv += count;
      ctx.tickHadAction = true;
      if (event.seedId) {
        const id = String(event.seedId);
        ctx.stats.seedEarn[id] = (ctx.stats.seedEarn[id] || 0) + amount;
      }
    } else if (event.kind === "bonus") {
      const source = String(event.source || "bonus");
      const count = Math.max(1, Number(event.count || 1));
      ctx.stats.bonus[source] = (ctx.stats.bonus[source] || 0) + count;
      ctx.interval.bonus += count;
      if (source === "jackpot") {
        ctx.stats.jack += count;
        ctx.interval.jack += count;
      }
      if (source === "regrow") {
        ctx.stats.reg += count;
        ctx.interval.reg += count;
      }
      ctx.tickHadAction = true;
    } else if (event.kind === "spend") {
      ctx.interval.spend += Math.max(0, Number(event.amount || 0));
    }
  };
}

function chooseSeed(ctx, tile) {
  const seeds = ctx.cfg.SEEDS.filter((s) => ctx.state.discovered?.seeds?.[s.id]);
  if (!seeds.length) return "basic";

  if (ctx.profile.style === "explore") {
    const affordable = seeds.filter((s) => ctx.engine.currentSeedCost(ctx.state, s.id, ctx.now) <= ctx.state.money);
    const pool = affordable.length ? affordable : seeds;
    pool.sort((a, b) => (ctx.stats.seedPlant[a.id] || 0) - (ctx.stats.seedPlant[b.id] || 0));
    return pool[0].id;
  }

  const effects = ctx.engine.shardUpgradeEffects(ctx.state);
  const season = ctx.engine.currentMarketSeason(ctx.now);
  let best = "basic";
  let bestScore = -1e18;

  for (const seed of seeds) {
    const cost = ctx.engine.currentSeedCost(ctx.state, seed.id, ctx.now);
    if (cost > ctx.state.money && seed.id !== "basic") continue;

    let value = seed.matureValue;
    value *= 1 + (Number(seed?.traits?.matureBonus || 0) + effects.matureBonus);
    value *= 1 + (Number(seed?.traits?.jackpot || 0) + effects.jackpot);
    value *= 1 + ctx.engine.seedEraYieldBonus(ctx.state, seed.id);
    value *= 1 + Math.max(0, Number(ctx.state.prestigeLevel || 0)) * 0.08;

    if (season.categories.includes(ctx.engine.cropCategory(seed.id))) {
      value *= 1 + season.baseBonus + effects.marketBonus * 0.75;
      if (tile && season.synergyAnimal && ctx.engine.tileAnimalIds(tile).includes(season.synergyAnimal)) {
        value *= 1 + season.synergyBonus;
      }
    }

    const pseudoTile = {
      animals: [],
      plant: {
        seedId: seed.id,
        stageIndex: 0,
        stageStartedAt: 0,
        stageWatered: true,
        plantedAt: 0,
        prestigeAtPlant: Math.max(0, Number(ctx.state.prestigeLevel || 0)),
      },
    };

    let cycleMs = 0;
    for (let st = 0; st <= 2; st += 1) {
      pseudoTile.plant.stageIndex = st;
      cycleMs += ctx.engine.stageDurationWithTile(seed, st, pseudoTile);
    }

    let score = (value - cost) / Math.max(1, cycleMs);
    if (ctx.profile.style === "speed") score += Number(seed?.traits?.quick || 0) * 0.006;
    if (ctx.profile.style === "dopamine") score += Number(seed?.traits?.jackpot || 0) * 0.009 + Number(seed?.traits?.regrow || 0) * 0.007;
    if (ctx.profile.style === "idle") score += Number(seed?.traits?.droughtGuard || 0) * 0.005 + Number(seed?.traits?.thrift || 0) * 0.003;

    if (score > bestScore) {
      bestScore = score;
      best = seed.id;
    }
  }

  return best;
}

function buyUpgrade(ctx, id) {
  const upgrade = ctx.engine.shardUpgradeById(id);
  if (!upgrade) return false;
  if (!ctx.engine.canBuyShardUpgrade(ctx.state, id)) return false;

  const level = ctx.engine.shardUpgradeLevel(ctx.state, id);
  if (level >= upgrade.cap) return false;

  const cost = ctx.engine.shardUpgradeCost(id, level);
  if (ctx.state.prestigeShards < cost) return false;

  ctx.state.prestigeShards -= cost;
  ctx.state.shardUpgrades[id] = level + 1;
  ctx.stats.upg[id] = (ctx.stats.upg[id] || 0) + 1;
  ctx.interval.upg += 1;
  ctx.tickHadAction = true;
  return true;
}

function runDecision(ctx) {
  const unlockBefore = unlockTotal(ctx.state);
  const prestigeCost = ctx.engine.prestigeMoneyCost(ctx.state.prestigeLevel);

  if (ctx.state.money >= prestigeCost * ctx.profile.pBuf && ctx.now - ctx.lastPrestigeAt >= ctx.profile.pMin * 60000) {
    const shards = ctx.engine.prestigeShardGain(ctx.state);
    const prev = ctx.state;
    const next = ctx.engine.createInitialState({
      prestigeLevel: (prev.prestigeLevel || 0) + 1,
      prestigeShards: (prev.prestigeShards || 0) + shards,
      maxPrestigeShardsEver: Math.max(Number(prev.maxPrestigeShardsEver || 0), Number((prev.prestigeShards || 0) + shards)),
      selectedTool: prev.selectedTool || "plow",
      selectedSeed: prev.selectedSeed || "basic",
      brushUnlocks: {
        plow: { ...(prev.brushUnlocks?.plow || {}) },
        water: { ...(prev.brushUnlocks?.water || {}) },
        plant: { ...(prev.brushUnlocks?.plant || {}) },
        harvest: { ...(prev.brushUnlocks?.harvest || {}) },
      },
      selectedBrushes: { ...(prev.selectedBrushes || {}) },
      discovered: {
        seeds: { ...(prev.discovered?.seeds || {}) },
        tools: { ...(prev.discovered?.tools || {}) },
        animals: { ...(prev.discovered?.animals || {}) },
        automation: { ...(prev.discovered?.automation || {}) },
        brushes: {
          plow: { ...(prev.discovered?.brushes?.plow || {}) },
          water: { ...(prev.discovered?.brushes?.water || {}) },
          plant: { ...(prev.discovered?.brushes?.plant || {}) },
          harvest: { ...(prev.discovered?.brushes?.harvest || {}) },
        },
      },
      farmSizeUnlocks: { ...(prev.farmSizeUnlocks || {}) },
      activeFarmSize: Number(prev.activeFarmSize || 3),
      shardUpgrades: { ...(prev.shardUpgrades || {}) },
      milestonesClaimed: { ...(prev.milestonesClaimed || {}) },
      marketSeasonIndex: Number(prev.marketSeasonIndex || 0),
      marketSeasonStartedAt: Number(prev.marketSeasonStartedAt || ctx.now),
      animalClearUnlocked: Boolean(prev.animalClearUnlocked),
      animalOwned: { ...(prev.animalOwned || {}) },
      selectedAnimal: prev.selectedAnimal || ctx.cfg.ANIMALS[0].id,
    });

    next.tiles = next.tiles.map((tile, idx) => ({
      ...tile,
      animals: ctx.engine.tileAnimalIds(prev.tiles?.[idx]).slice(0, ctx.cfg.MAX_ANIMALS_PER_TILE),
    }));

    next.discovered.tools.animals = next.prestigeLevel >= ctx.engine.animalPrestigeRequirementByIndex(0);
    if (!next.discovered.tools[next.selectedTool]) next.selectedTool = "plow";

    ctx.engine.applyPrestigeMilestones(next);
    ctx.state = next;
    setSink(ctx);
    ctx.stats.prest += 1;
    ctx.interval.prest += 1;
    ctx.tickHadAction = true;
    ctx.lastPrestigeAt = ctx.now;
  }

  const upgradeOrder =
    ctx.profile.style === "dopamine"
      ? ["luck_lab", "regrow_lab", "harvest_lab", "market_lab", "seed_lab"]
      : ["harvest_lab", "seed_lab", "market_lab", "luck_lab", "regrow_lab"];
  for (let k = 0; k < 2; k += 1) {
    for (const id of upgradeOrder) {
      if (buyUpgrade(ctx, id)) break;
    }
  }

  for (const expansion of ctx.cfg.FARM_EXPANSIONS) {
    if (expansion.size <= 3 || ctx.state.farmSizeUnlocks?.[expansion.size]) continue;
    const idx = ctx.cfg.FARM_EXPANSIONS.findIndex((x) => x.size === expansion.size);
    const prevOk = idx <= 0 ? true : Boolean(ctx.state.farmSizeUnlocks?.[ctx.cfg.FARM_EXPANSIONS[idx - 1].size]);
    if (!prevOk || ctx.state.prestigeLevel < expansion.reqPrestige || ctx.state.prestigeShards < expansion.unlockShards) continue;
    ctx.state.prestigeShards -= expansion.unlockShards;
    ctx.state.farmSizeUnlocks[expansion.size] = true;
    ctx.state.activeFarmSize = Math.max(Number(ctx.state.activeFarmSize || 3), expansion.size);
    ctx.stats.expansions.add(expansion.size);
    ctx.interval.exp += 1;
    ctx.tickHadAction = true;
  }

  const automationOrder =
    ctx.profile.style === "speed" || ctx.profile.style === "dopamine"
      ? ["autoHarvest", "autoPlant", "autoWater", "autoPlow"]
      : ["autoPlow", "autoWater", "autoPlant", "autoHarvest"];

  for (const key of automationOrder) {
    const cost = ctx.engine.automationCostForState(ctx.state, key);
    if (!Number.isFinite(cost) || cost <= 0 || ctx.state.money < cost) continue;

    const ids = visible(ctx.state, ctx.cfg);
    const missing = ids.filter((i) => {
      const tile = ctx.state.tiles[i];
      return tile && !tile[key] && !tile.autoEverything;
    });

    const bulkBuy =
      (ctx.profile.style === "speed" || ctx.profile.style === "idle" || ctx.profile.style === "dopamine") &&
      ctx.state.money >= missing.length * cost;

    if (bulkBuy && missing.length) {
      ctx.state.money -= missing.length * cost;
      for (const i of missing) ctx.state.tiles[i][key] = true;
      ctx.interval.auto += missing.length;
      ctx.tickHadAction = true;
      continue;
    }

    for (const i of ids) {
      const tile = ctx.state.tiles[i];
      if (!tile || tile[key] || tile.autoEverything) continue;
      if (ctx.state.money < cost) break;
      ctx.state.money -= cost;
      tile[key] = true;
      ctx.interval.auto += 1;
      ctx.tickHadAction = true;
      break;
    }
  }

  if (ctx.state.prestigeLevel >= ctx.engine.animalPrestigeRequirementByIndex(0)) {
    const season = ctx.engine.currentMarketSeason(ctx.now);
    const orders = {
      speed: ["chicken", "cow", "rabbit", "alpaca", "firefly", "pig", "goat", "duck", "bee", "fox"],
      dopamine: ["bee", "fox", "firefly", "rabbit", "cow", "alpaca", "chicken", "pig", "goat", "duck"],
      idle: ["duck", "pig", "goat", "cow", "rabbit", "chicken", "alpaca", "bee", "fox", "firefly"],
      explore: ctx.cfg.ANIMALS.map((a) => a.id),
      qa: ctx.cfg.ANIMALS.map((a) => a.id),
      casual: ["chicken", "cow", "bee", "rabbit"],
      analysis: ["chicken", "cow", "bee", "rabbit", "goat"],
      stress: ["duck", "pig", "goat", "chicken", "cow", "rabbit"],
    };

    const base = orders[ctx.profile.style] || orders.analysis;
    const ordered = season?.synergyAnimal ? [season.synergyAnimal, ...base.filter((x) => x !== season.synergyAnimal)] : base;
    let placed = 0;
    const ids = visible(ctx.state, ctx.cfg).slice(0, 25);

    for (const animalId of ordered) {
      if (placed >= 8) break;
      const reqP = ctx.engine.animalPrestigeRequirement(animalId);
      if (!Number.isFinite(reqP) || ctx.state.prestigeLevel < reqP) continue;

      for (const i of ids) {
        if (placed >= 8) break;
        const tile = ctx.state.tiles[i];
        if (!tile || ctx.engine.tileAnimalIds(tile).length >= ctx.cfg.MAX_ANIMALS_PER_TILE) continue;

        const has = ctx.engine.tileAnimalIds(tile).includes(animalId);
        if (ctx.profile.style !== "explore" && ctx.profile.style !== "qa" && has) continue;

        const owned = Math.max(0, Number(ctx.state.animalOwned?.[animalId] || 0));
        const cap = ctx.engine.animalMaxOwnedForPrestige(ctx.state.prestigeLevel, animalId);
        const placedCount = ctx.engine.countPlacedAnimals(ctx.state.tiles, animalId);

        if (placedCount >= owned) {
          if (Number.isFinite(cap) && owned >= cap) continue;
          const animal = ctx.engine.animalById(animalId);
          if (!animal || ctx.state.prestigeShards < animal.unlockShards) continue;
          ctx.state.prestigeShards -= animal.unlockShards;
          ctx.state.animalOwned[animalId] = owned + 1;
          ctx.interval.animal += 1;
        }

        tile.animals = [...ctx.engine.tileAnimalIds(tile), animalId].slice(0, ctx.cfg.MAX_ANIMALS_PER_TILE);
        ctx.stats.animals.add(animalId);
        placed += 1;
        ctx.tickHadAction = true;
      }
    }
  }

  let budget = ctx.profile.actions;
  const ids = visible(ctx.state, ctx.cfg);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(ctx.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  const doAction = (fn) => {
    if (budget <= 0) return false;
    const ok = fn();
    if (ok) {
      budget -= 1;
      ctx.tickHadAction = true;
    }
    return ok;
  };

  for (const i of ids) {
    if (budget <= 0) break;
    const tile = ctx.state.tiles[i];
    if (tile?.plant?.stageIndex >= 3) doAction(() => ctx.engine.harvestTile(ctx.state, tile));
  }

  for (const i of ids) {
    if (budget <= 0) break;
    const tile = ctx.state.tiles[i];
    if (!tile?.plant) continue;
    if (tile.plant.stageIndex < 3 && !tile.plant.stageWatered) {
      if (ctx.profile.style === "stress" && ctx.random() < 0.38) continue;
      if (ctx.profile.style === "casual" && ctx.random() < 0.12) continue;
      doAction(() => ctx.engine.waterTile(tile, ctx.now));
    }
  }

  for (const i of ids) {
    if (budget <= 0) break;
    const tile = ctx.state.tiles[i];
    if (tile && tile.soil !== "plowed") doAction(() => ctx.engine.plowTile(tile, ctx.now));
  }

  for (const i of ids) {
    if (budget <= 0) break;
    const tile = ctx.state.tiles[i];
    if (!tile || tile.soil !== "plowed" || tile.plant) continue;

    doAction(() => ctx.engine.waterTile(tile, ctx.now));
    const seed = chooseSeed(ctx, tile);
    doAction(() => {
      const ok = ctx.engine.plantTile(ctx.state, tile, seed, ctx.now);
      if (ok) {
        ctx.stats.seedPlant[seed] = (ctx.stats.seedPlant[seed] || 0) + 1;
        ctx.stats.seeds.add(seed);
      }
      return ok;
    });
  }

  ctx.engine.updateDiscoveries(ctx.state);
  ctx.engine.applyPrestigeMilestones(ctx.state);
  ctx.state.maxPrestigeShardsEver = Math.max(Number(ctx.state.maxPrestigeShardsEver || 0), Number(ctx.state.prestigeShards || 0));

  const unlockAfter = unlockTotal(ctx.state);
  if (unlockAfter > unlockBefore) {
    ctx.interval.unlock += unlockAfter - unlockBefore;
    ctx.stats.unlock += unlockAfter - unlockBefore;
    ctx.tickHadAction = true;
  }
}

function hookScore(interval) {
  const duration = Math.max(1, interval.active + interval.idle);
  const activeShare = clamp(interval.active / duration, 0, 1);
  const moneyPulse = clamp(Math.log10(1 + interval.earn) / 4.6, 0, 1);
  const novelty = clamp(interval.unlock / 5, 0, 1);
  const progression = clamp((interval.prest * 1.9 + interval.exp * 1.2 + interval.upg * 0.8 + interval.animal * 0.65) / 6, 0, 1);
  const thrill = clamp((interval.jack * 0.7 + interval.reg * 0.5 + interval.bonus * 0.08) / 8, 0, 1);
  const drag = clamp(interval.idle / duration, 0, 1);
  return clamp(Number((10 * (0.24 * moneyPulse + 0.2 * novelty + 0.22 * progression + 0.16 * thrill + 0.18 * activeShare) - drag * 1.7).toFixed(2)), 0, 10);
}

function reasons(interval, state) {
  const keep = [];
  const quit = [];

  if (interval.jack > 0) keep.push("jackpot spikes");
  if (interval.reg > 0) keep.push("regrow chain moments");
  if (interval.prest > 0) keep.push("marketing reset + shard burst");
  if (interval.unlock >= 3) keep.push("new unlock cadence");
  if (interval.auto > 0) keep.push("automation compounding");
  if (interval.earn > 15000) keep.push("strong cash acceleration");

  if (interval.idle > interval.active * 1.25) quit.push("idle stretches with low interaction");
  if (interval.unlock === 0 && interval.prest === 0 && interval.jack === 0 && interval.earn < 4000) quit.push("progression stall between unlocks");
  if (interval.spend > interval.earn * 1.35) quit.push("cost pressure feels grindy");
  if (state.money < 120 && interval.earn < 500) quit.push("cash starvation limits choices");

  return { keep: keep.slice(0, 3), quit: quit.slice(0, 3) };
}

function runSanityChecks(ctx, elapsedMs) {
  if (!Number.isFinite(ctx.state.money)) {
    ctx.bugs.push({ minute: Number((elapsedMs / 60000).toFixed(2)), issue: "money became non-finite" });
  }
  if (ctx.state.money < -0.0001) {
    ctx.bugs.push({ minute: Number((elapsedMs / 60000).toFixed(2)), issue: `money below zero (${ctx.state.money})` });
  }
  if (!Array.isArray(ctx.state.tiles) || ctx.state.tiles.length !== ctx.cfg.TILE_COUNT) {
    ctx.bugs.push({ minute: Number((elapsedMs / 60000).toFixed(2)), issue: "tile array shape mismatch" });
  }
}

async function runProfile(mod, profile, variant, seedBase = 417) {
  const { engine, config } = mod;
  const seed = hash(`${variant}:${profile.id}:${seedBase}`);
  const random = rng(seed);

  const ctx = {
    engine,
    cfg: config,
    profile,
    random,
    start: Date.UTC(2026, 0, 1, 12, 0, 0) + (seed % 1000) * 60000,
    now: 0,
    state: null,
    lastPrestigeAt: 0,
    tickHadAction: false,
    bugs: [],
    interval: mkInterval(),
    stats: {
      profileId: profile.id,
      style: profile.style,
      seeds: new Set(),
      animals: new Set(),
      seedPlant: {},
      seedEarn: {},
      expansions: new Set(),
      upg: {},
      bonus: {},
      checkpoints: [],
      earn: 0,
      harv: 0,
      jack: 0,
      reg: 0,
      prest: 0,
      unlock: 0,
    },
  };

  const realNow = Date.now;
  const realRandom = Math.random;
  let simNow = ctx.start;

  try {
    Date.now = () => simNow;
    Math.random = () => random();

    ctx.state = engine.createInitialState();
    setSink(ctx);
    engine.updateDiscoveries(ctx.state);
    engine.applyPrestigeMilestones(ctx.state);
    ctx.state.maxPrestigeShardsEver = Math.max(Number(ctx.state.maxPrestigeShardsEver || 0), Number(ctx.state.prestigeShards || 0));
    ctx.lastPrestigeAt = ctx.start;

    const checkpointMs = CHECKPOINTS.map((m) => m * 60000);
    let cpIdx = 0;
    let nextDecisionAt = ctx.start;

    for (let elapsed = 0; elapsed <= TOTAL_MS; elapsed += TICK_MS) {
      simNow = ctx.start + elapsed;
      ctx.now = simNow;
      ctx.tickHadAction = false;

      const unlockBefore = unlockTotal(ctx.state);
      engine.progressState(ctx.state, ctx.now);
      engine.runTileAutomation(ctx.state, ctx.now);
      engine.updateDiscoveries(ctx.state);
      engine.applyPrestigeMilestones(ctx.state);
      ctx.state.maxPrestigeShardsEver = Math.max(Number(ctx.state.maxPrestigeShardsEver || 0), Number(ctx.state.prestigeShards || 0));

      const unlockAfter = unlockTotal(ctx.state);
      if (unlockAfter > unlockBefore) {
        ctx.interval.unlock += unlockAfter - unlockBefore;
        ctx.stats.unlock += unlockAfter - unlockBefore;
        ctx.tickHadAction = true;
      }

      if (ctx.now >= nextDecisionAt) {
        runDecision(ctx);
        nextDecisionAt = ctx.now + Math.max(1000, Number(profile.decisionMs || 3500));
      }

      runSanityChecks(ctx, elapsed);

      if (ctx.tickHadAction) ctx.interval.active += TICK_MS / 1000;
      else ctx.interval.idle += TICK_MS / 1000;

      while (cpIdx < checkpointMs.length && elapsed >= checkpointMs[cpIdx]) {
        const rs = reasons(ctx.interval, ctx.state);
        ctx.stats.checkpoints.push({
          minute: CHECKPOINTS[cpIdx],
          hook: hookScore(ctx.interval),
          money: Math.floor(ctx.state.money),
          prestigeLevel: Number(ctx.state.prestigeLevel || 0),
          prestigeShards: Math.floor(ctx.state.prestigeShards),
          totalHarvests: Math.floor(ctx.state.totalHarvests || 0),
          activeFarmSize: Number(ctx.state.activeFarmSize || 3),
          discoveredSeeds: countTrue(ctx.state.discovered?.seeds || {}),
          discoveredAnimals: countTrue(ctx.state.discovered?.animals || {}),
          keepPlaying: rs.keep,
          wantingToQuit: rs.quit,
          interval: { ...ctx.interval },
        });
        ctx.interval = mkInterval();
        cpIdx += 1;
      }
    }
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  return {
    profileId: profile.id,
    style: profile.style,
    checkpoints: ctx.stats.checkpoints,
    bugs: ctx.bugs,
    final: {
      money: Math.floor(ctx.state.money),
      prestigeLevel: Number(ctx.state.prestigeLevel || 0),
      prestigeShards: Math.floor(ctx.state.prestigeShards || 0),
      totalHarvests: Math.floor(ctx.state.totalHarvests || 0),
      activeFarmSize: Number(ctx.state.activeFarmSize || 3),
    },
    totals: {
      earn: Math.floor(ctx.stats.earn),
      harvestEvents: Math.floor(ctx.stats.harv),
      prestiges: ctx.stats.prest,
      unlocks: ctx.stats.unlock,
      jackpots: ctx.stats.jack,
      regrows: ctx.stats.reg,
    },
  };
}

function continueLikelihoodFromHook(hook) {
  const normalized = clamp(hook / 10, 0, 1);
  return clamp(0.05 + 0.95 * Math.pow(normalized, 1.2), 0, 1);
}

function aggregate(runs) {
  const checkpoints = {};

  for (const minute of CHECKPOINTS) {
    const snaps = runs.map((r) => r.checkpoints.find((c) => c.minute === minute)).filter(Boolean);
    const hook = Number(avg(snaps.map((s) => s.hook)).toFixed(2));
    const keepTop = topStrings(snaps.flatMap((s) => s.keepPlaying), 4);
    const quitTop = topStrings(snaps.flatMap((s) => s.wantingToQuit), 4);

    checkpoints[minute] = {
      minute,
      avgHook: hook,
      avgMoney: Math.floor(avg(snaps.map((s) => s.money))),
      avgPrestige: Number(avg(snaps.map((s) => s.prestigeLevel)).toFixed(2)),
      keepPlayingTop: keepTop,
      wantingToQuitTop: quitTop,
      continueLikelihoodToNext: Number(continueLikelihoodFromHook(hook).toFixed(2)),
    };
  }

  const allBugs = runs.flatMap((r) => (r.bugs || []).map((b) => ({ ...b, profileId: r.profileId })));

  return {
    runs: runs.length,
    checkpointSummary: checkpoints,
    avgFinalMoney: Math.floor(avg(runs.map((r) => r.final.money))),
    avgFinalPrestige: Number(avg(runs.map((r) => r.final.prestigeLevel)).toFixed(2)),
    avgFinalShards: Math.floor(avg(runs.map((r) => r.final.prestigeShards))),
    avgFinalHarvests: Math.floor(avg(runs.map((r) => r.final.totalHarvests))),
    bugCount: allBugs.length,
    bugs: allBugs,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outPathArg = args.find((a) => a.startsWith("--out="));
  const labelArg = args.find((a) => a.startsWith("--label="));
  const outPath = outPathArg ? outPathArg.slice("--out=".length) : "";
  const label = labelArg ? labelArg.slice("--label=".length) : "baseline";

  const mod = await loadModules();
  try {
    const runs = [];
    for (const profile of PROFILES) {
      runs.push(await runProfile(mod, profile, label));
    }

    const report = {
      createdAt: new Date().toISOString(),
      label,
      checkpoints: CHECKPOINTS,
      totalMinutes: 720,
      profiles: PROFILES.map((p) => ({ id: p.id, style: p.style })),
      aggregate: aggregate(runs),
      runs,
    };

    const cpList = CHECKPOINTS.map((m) => report.aggregate.checkpointSummary[m]);

    console.log(`\n=== ${label.toUpperCase()} FARM PLAYTEST (10 runs) ===`);
    for (const cp of cpList) {
      console.log(
        `${String(cp.minute).padStart(4, " ")}m | hook ${cp.avgHook.toFixed(2)} | continue ${(cp.continueLikelihoodToNext * 100).toFixed(0)}% | money ${cp.avgMoney.toLocaleString()} | prestige ${cp.avgPrestige.toFixed(2)}`,
      );
    }
    console.log(`bugs detected: ${report.aggregate.bugCount}`);

    if (outPath) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
      console.log(`saved report: ${outPath}`);
    }
  } finally {
    mod.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
