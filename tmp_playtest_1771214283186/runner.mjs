import * as cfg from './config.js';
import * as eng from './engine.js';

const CHECKPOINTS = [1, 2, 5, 10, 20, 30, 60, 120, 180, 240, 300];
const STEP_MS = 2000;
const TOTAL_MINUTES = 300;
const TOTAL_STEPS = Math.floor((TOTAL_MINUTES * 60 * 1000) / STEP_MS);

const styles = [
  {
    id: 'speedrunner',
    label: 'Speedrunner',
    actionBudget: 32,
    strategyEvery: 1,
    seedMode: 'roi',
    marketingFactor: 1.0,
    marketingCooldownMin: 2,
    automationMode: 'aggressive',
    animalsMode: 'focused',
    researchMode: 'aggressive',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'feature_explorer',
    label: 'Feature Explorer',
    actionBudget: 18,
    strategyEvery: 2,
    seedMode: 'rotate',
    marketingFactor: 1.2,
    marketingCooldownMin: 8,
    automationMode: 'balanced',
    animalsMode: 'broad',
    researchMode: 'balanced',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'dopamine_hunter',
    label: 'Dopamine Hunter',
    actionBudget: 26,
    strategyEvery: 1,
    seedMode: 'payout',
    marketingFactor: 1.08,
    marketingCooldownMin: 3,
    automationMode: 'aggressive',
    animalsMode: 'focused',
    researchMode: 'balanced',
    expansionMode: 'aggressive',
    tryAll: false,
  },
  {
    id: 'design_analyst',
    label: 'Design Analyst',
    actionBudget: 20,
    strategyEvery: 2,
    seedMode: 'roi',
    marketingFactor: 1.15,
    marketingCooldownMin: 6,
    automationMode: 'balanced',
    animalsMode: 'broad',
    researchMode: 'balanced',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'automation_maxer',
    label: 'Automation Maxer',
    actionBudget: 12,
    strategyEvery: 2,
    seedMode: 'roi',
    marketingFactor: 1.12,
    marketingCooldownMin: 6,
    automationMode: 'aggressive',
    animalsMode: 'light',
    researchMode: 'light',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'animal_breeder',
    label: 'Animal Breeder',
    actionBudget: 16,
    strategyEvery: 2,
    seedMode: 'roi',
    marketingFactor: 1.12,
    marketingCooldownMin: 7,
    automationMode: 'balanced',
    animalsMode: 'broad',
    researchMode: 'light',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'research_chaser',
    label: 'Research Chaser',
    actionBudget: 18,
    strategyEvery: 1,
    seedMode: 'roi',
    marketingFactor: 1.1,
    marketingCooldownMin: 5,
    automationMode: 'balanced',
    animalsMode: 'focused',
    researchMode: 'aggressive',
    expansionMode: 'balanced',
    tryAll: true,
  },
  {
    id: 'frugal_farmer',
    label: 'Frugal Farmer',
    actionBudget: 14,
    strategyEvery: 2,
    seedMode: 'frugal',
    marketingFactor: 1.25,
    marketingCooldownMin: 8,
    automationMode: 'light',
    animalsMode: 'light',
    researchMode: 'light',
    expansionMode: 'balanced',
    tryAll: false,
  },
  {
    id: 'late_game_pusher',
    label: 'Late-game Pusher',
    actionBudget: 22,
    strategyEvery: 1,
    seedMode: 'late',
    marketingFactor: 1.05,
    marketingCooldownMin: 4,
    automationMode: 'aggressive',
    animalsMode: 'focused',
    researchMode: 'balanced',
    expansionMode: 'aggressive',
    tryAll: true,
  },
  {
    id: 'casual_returner',
    label: 'Casual Returner',
    actionBudget: 9,
    strategyEvery: 3,
    seedMode: 'novelty',
    marketingFactor: 1.3,
    marketingCooldownMin: 10,
    automationMode: 'balanced',
    animalsMode: 'light',
    researchMode: 'light',
    expansionMode: 'aggressive',
    tryAll: false,
  },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function createSeedCounter() {
  const out = {};
  for (const s of cfg.SEEDS) out[s.id] = 0;
  return out;
}

function createAnimalCounter() {
  const out = {};
  for (const a of cfg.ANIMALS) out[a.id] = 0;
  return out;
}

function createMetrics() {
  return {
    plows: 0,
    waters: 0,
    plants: 0,
    harvests: 0,
    unlocks: 0,
    marketings: 0,
    expansionUnlocks: 0,
    researchBuys: 0,
    automationBuys: 0,
    automationBulkBuys: 0,
    animalPlacements: 0,
    moneyEarned: 0,
    seedPlant: createSeedCounter(),
    seedHarvest: createSeedCounter(),
    seedRevenue: createSeedCounter(),
    animalPlaced: createAnimalCounter(),
    systemsUsed: {
      marketing: false,
      farm: false,
      animals: false,
      automation: false,
      research: false,
      save: false,
    },
  };
}

function cloneMetrics(m) {
  return JSON.parse(JSON.stringify(m));
}

function diffMetrics(curr, prev) {
  const d = createMetrics();
  for (const k of [
    'plows',
    'waters',
    'plants',
    'harvests',
    'unlocks',
    'marketings',
    'expansionUnlocks',
    'researchBuys',
    'automationBuys',
    'automationBulkBuys',
    'animalPlacements',
    'moneyEarned',
  ]) {
    d[k] = curr[k] - prev[k];
  }
  for (const id of Object.keys(d.seedPlant)) {
    d.seedPlant[id] = curr.seedPlant[id] - prev.seedPlant[id];
    d.seedHarvest[id] = curr.seedHarvest[id] - prev.seedHarvest[id];
    d.seedRevenue[id] = curr.seedRevenue[id] - prev.seedRevenue[id];
  }
  for (const id of Object.keys(d.animalPlaced)) {
    d.animalPlaced[id] = curr.animalPlaced[id] - prev.animalPlaced[id];
  }
  for (const key of Object.keys(d.systemsUsed)) {
    d.systemsUsed[key] = Boolean(curr.systemsUsed[key] || prev.systemsUsed[key]);
  }
  return d;
}

function countDiscoveries(state) {
  const d = state.discovered || {};
  let total = 0;
  for (const v of Object.values(d.tools || {})) if (v) total += 1;
  for (const v of Object.values(d.seeds || {})) if (v) total += 1;
  for (const v of Object.values(d.animals || {})) if (v) total += 1;
  for (const v of Object.values(d.automation || {})) if (v) total += 1;
  for (const group of Object.values(d.brushes || {})) {
    for (const v of Object.values(group || {})) if (v) total += 1;
  }
  return total;
}

function activeTileIndices(state) {
  const size = clamp(Number(state.activeFarmSize || 3), 3, cfg.GRID_SIZE);
  const out = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      out.push(r * cfg.GRID_SIZE + c);
    }
  }
  return out;
}

function expectedMatureGain(state, seedId) {
  const seed = eng.seedById(seedId);
  const matureBonus = eng.seedTrait(seed, 'matureBonus');
  const jackpot = Math.min(0.95, eng.seedTrait(seed, 'jackpot'));
  const curveYield = eng.seedEraYieldBonus(state, seedId);
  const prestigeMult = 1 + Math.max(0, Number(state.prestigeLevel || 0)) * 0.08;
  return seed.matureValue * (1 + matureBonus) * (1 + jackpot) * (1 + curveYield) * prestigeMult;
}

function cycleMs(state, seedId) {
  const seed = eng.seedById(seedId);
  const tile = {
    animals: [],
    plant: {
      seedId,
      stageIndex: 0,
      stageStartedAt: 0,
      stageWatered: false,
      plantedAt: 0,
      prestigeAtPlant: Math.max(0, Number(state.prestigeLevel || 0)),
    },
  };
  let total = 0;
  for (let i = 0; i <= 2; i += 1) {
    tile.plant.stageIndex = i;
    total += eng.stageDurationWithTile(seed, i, tile);
  }
  return Math.max(1, total);
}

function seedScore(state, seedId, mode, now, recentSeedUse) {
  const cost = eng.currentSeedCost(state, seedId, now);
  const gain = expectedMatureGain(state, seedId);
  const t = cycleMs(state, seedId);
  const profit = gain - cost;
  const noveltyPenalty = (recentSeedUse[seedId] || 0) * 0.02;

  if (mode === 'payout') return gain - noveltyPenalty;
  if (mode === 'frugal') return profit / Math.max(1, cost) - noveltyPenalty;
  if (mode === 'late') return gain * Math.log10(10 + Math.max(1, cost)) - noveltyPenalty;
  if (mode === 'novelty') return profit / t + 0.2 * (1 / Math.max(1, recentSeedUse[seedId] || 1));
  if (mode === 'rotate') return Math.random() * 0.1 + profit / t - noveltyPenalty;
  return profit / t - noveltyPenalty;
}

function chooseSeed(state, style, now, recentSeedUse) {
  const discovered = cfg.SEEDS.filter((s) => state.discovered?.seeds?.[s.id]);
  if (!discovered.length) return 'basic';

  if (style.seedMode === 'rotate') {
    const idx = Math.floor((now / 1000) % discovered.length);
    return discovered[idx].id;
  }

  let bestId = discovered[0].id;
  let bestScore = -Infinity;
  for (const seed of discovered) {
    const score = seedScore(state, seed.id, style.seedMode, now, recentSeedUse);
    if (score > bestScore) {
      bestScore = score;
      bestId = seed.id;
    }
  }
  return bestId;
}

function plantWithMetrics(state, tile, seedId, now, metrics, recentSeedUse) {
  const ok = eng.plantTile(state, tile, seedId, now);
  if (ok) {
    metrics.plants += 1;
    metrics.seedPlant[seedId] += 1;
    recentSeedUse[seedId] = (recentSeedUse[seedId] || 0) + 1;
  }
  return ok;
}

function harvestWithMetrics(state, tile, metrics) {
  const seedId = tile?.plant?.seedId;
  const before = state.money;
  const ok = eng.harvestTile(state, tile);
  if (!ok || !seedId) return false;
  const gain = Math.max(0, Number(state.money || 0) - Number(before || 0));
  metrics.harvests += 1;
  metrics.moneyEarned += gain;
  metrics.seedHarvest[seedId] += 1;
  metrics.seedRevenue[seedId] += gain;
  return true;
}

function runAutomationWithMetrics(state, now, metrics, recentSeedUse) {
  for (const tile of state.tiles) {
    if (tile.autoEverything) {
      if (tile.plant && tile.plant.stageIndex >= 3) {
        harvestWithMetrics(state, tile, metrics);
      } else if (tile.plant) {
        if (!tile.plant.stageWatered) {
          if (eng.waterTile(tile, now)) metrics.waters += 1;
        }
      } else {
        if (eng.plowTile(tile, now)) metrics.plows += 1;
        if (!tile.watered && eng.waterTile(tile, now)) metrics.waters += 1;
        plantWithMetrics(state, tile, state.selectedSeed, now, metrics, recentSeedUse);
      }
      continue;
    }
    if (tile.autoPlow && tile.soil !== 'plowed') {
      if (eng.plowTile(tile, now)) metrics.plows += 1;
    }
    if (tile.autoWater && tile.plant && tile.plant.stageIndex < 3) {
      if (eng.waterTile(tile, now)) metrics.waters += 1;
    }
    if (tile.autoPlant && tile.soil === 'plowed' && !tile.plant) {
      plantWithMetrics(state, tile, state.selectedSeed, now, metrics, recentSeedUse);
    }
    if (tile.autoHarvest && tile.plant && tile.plant.stageIndex >= 3) {
      harvestWithMetrics(state, tile, metrics);
    }
  }
}

function buyFarmExpansions(state, style, metrics) {
  if (style.expansionMode === 'none') return;
  for (let i = 1; i < cfg.FARM_EXPANSIONS.length; i += 1) {
    const exp = cfg.FARM_EXPANSIONS[i];
    const prev = cfg.FARM_EXPANSIONS[i - 1];
    if (state.farmSizeUnlocks?.[exp.size]) continue;
    if (!state.farmSizeUnlocks?.[prev.size]) continue;
    if (state.prestigeLevel < exp.reqPrestige) continue;
    if (state.prestigeShards < exp.unlockShards) continue;
    state.prestigeShards -= exp.unlockShards;
    state.farmSizeUnlocks[exp.size] = true;
    state.activeFarmSize = Math.max(Number(state.activeFarmSize || 3), exp.size);
    metrics.expansionUnlocks += 1;
    metrics.systemsUsed.farm = true;
    if (style.expansionMode !== 'aggressive') break;
  }
}

function buyResearch(state, style, metrics) {
  if (style.researchMode === 'none') return;
  const order =
    style.researchMode === 'aggressive'
      ? ['harvest_lab', 'seed_lab', 'luck_lab', 'market_lab', 'regrow_lab']
      : style.researchMode === 'balanced'
        ? ['harvest_lab', 'seed_lab', 'market_lab', 'luck_lab', 'regrow_lab']
        : ['harvest_lab', 'seed_lab'];
  const maxBuys = style.researchMode === 'aggressive' ? 3 : 1;
  let buys = 0;

  while (buys < maxBuys) {
    let bought = false;
    for (const id of order) {
      const up = eng.shardUpgradeById(id);
      if (!up) continue;
      if (!eng.canBuyShardUpgrade(state, id)) continue;
      const level = eng.shardUpgradeLevel(state, id);
      if (level >= up.cap) continue;
      const cost = eng.shardUpgradeCost(id, level);
      if (state.prestigeShards < cost) continue;
      state.prestigeShards -= cost;
      state.shardUpgrades[id] = level + 1;
      metrics.researchBuys += 1;
      metrics.systemsUsed.research = true;
      buys += 1;
      bought = true;
      break;
    }
    if (!bought) break;
  }
}

function buyAutomation(state, style, metrics) {
  if (style.automationMode === 'none') return;
  const indices = activeTileIndices(state);
  const targets =
    style.automationMode === 'aggressive'
      ? { autoPlow: 1, autoWater: 0.8, autoPlant: 0.75, autoHarvest: 0.9, autoEverything: 0.25 }
      : style.automationMode === 'balanced'
        ? { autoPlow: 0.65, autoWater: 0.45, autoPlant: 0.4, autoHarvest: 0.5, autoEverything: 0.1 }
        : { autoPlow: 0.4, autoWater: 0.2, autoPlant: 0.2, autoHarvest: 0.3, autoEverything: 0 };

  for (const [key, ratio] of Object.entries(targets)) {
    const cost = eng.automationCostForState(state, key);
    if (!cost || ratio <= 0) continue;

    const remaining = indices.filter((idx) => {
      const t = state.tiles[idx];
      return t && !t[key] && !t.autoEverything;
    });

    const targetCount = Math.floor(indices.length * ratio);
    const ownedCount = indices.reduce((sum, idx) => {
      const t = state.tiles[idx];
      if (!t) return sum;
      return sum + (t[key] || t.autoEverything ? 1 : 0);
    }, 0);

    if (ownedCount >= targetCount || remaining.length <= 0) continue;

    const totalCost = remaining.length * cost;
    const canBulkBuy = style.tryAll && state.money >= totalCost;
    if (canBulkBuy) {
      state.money -= totalCost;
      for (const idx of remaining) state.tiles[idx][key] = true;
      metrics.automationBuys += remaining.length;
      metrics.automationBulkBuys += 1;
      metrics.systemsUsed.automation = true;
      continue;
    }

    if (state.money >= cost) {
      const idx = remaining[0];
      state.money -= cost;
      state.tiles[idx][key] = true;
      metrics.automationBuys += 1;
      metrics.systemsUsed.automation = true;
    }
  }
}

function placeAnimals(state, style, metrics) {
  if (style.animalsMode === 'none') return;
  if (state.prestigeLevel < eng.animalPrestigeRequirementByIndex(0)) return;

  const indices = activeTileIndices(state);
  const plan =
    style.animalsMode === 'focused'
      ? ['rabbit', 'firefly', 'cow', 'bee', 'alpaca', 'chicken']
      : style.animalsMode === 'broad'
        ? cfg.ANIMALS.map((a) => a.id)
        : ['chicken', 'cow'];

  let attempts = style.animalsMode === 'broad' ? 4 : 2;
  for (const animalId of plan) {
    if (attempts <= 0) break;
    const animal = eng.animalById(animalId);
    if (!animal) continue;
    if (state.prestigeLevel < eng.animalPrestigeRequirement(animalId)) continue;

    const idx = indices.find((tileIdx) => {
      const tile = state.tiles[tileIdx];
      return tile && eng.tileAnimalIds(tile).length < cfg.MAX_ANIMALS_PER_TILE;
    });
    if (idx == null) break;

    const tile = state.tiles[idx];
    const owned = Math.max(0, Number(state.animalOwned?.[animalId] || 0));
    const cap = eng.animalMaxOwnedForPrestige(state.prestigeLevel, animalId);
    const placed = eng.countPlacedAnimals(state.tiles, animalId);

    if (placed >= owned) {
      if (Number.isFinite(cap) && owned >= cap) continue;
      if (state.prestigeShards < animal.unlockShards) continue;
      state.prestigeShards -= animal.unlockShards;
      state.animalOwned[animalId] = owned + 1;
    }

    tile.animals = [...eng.tileAnimalIds(tile), animalId].slice(0, cfg.MAX_ANIMALS_PER_TILE);
    metrics.animalPlacements += 1;
    metrics.animalPlaced[animalId] += 1;
    metrics.systemsUsed.animals = true;
    attempts -= 1;
  }
}

function runManualActions(state, style, now, metrics, recentSeedUse) {
  const queue = [];
  for (const idx of activeTileIndices(state)) {
    const tile = state.tiles[idx];
    if (!tile) continue;
    if (tile.plant && tile.plant.stageIndex >= 3) queue.push({ p: 0, kind: 'harvest', idx });
    else if (tile.plant && tile.plant.stageIndex < 3 && !tile.plant.stageWatered)
      queue.push({ p: 1, kind: 'water', idx });
    else if (tile.soil === 'plowed' && !tile.plant) queue.push({ p: 2, kind: 'plant', idx });
    else if (tile.soil !== 'plowed') queue.push({ p: 3, kind: 'plow', idx });
  }
  queue.sort((a, b) => a.p - b.p || a.idx - b.idx);

  let spent = 0;
  for (const item of queue) {
    if (spent >= style.actionBudget) break;
    const tile = state.tiles[item.idx];
    if (!tile) continue;

    if (item.kind === 'harvest') {
      if (harvestWithMetrics(state, tile, metrics)) spent += 1;
      continue;
    }
    if (item.kind === 'water') {
      if (eng.waterTile(tile, now)) {
        metrics.waters += 1;
        spent += 1;
      }
      continue;
    }
    if (item.kind === 'plant') {
      const selectedCost = eng.currentSeedCost(state, state.selectedSeed, now);
      const chosen = selectedCost <= state.money ? state.selectedSeed : 'basic';
      if (plantWithMetrics(state, tile, chosen, now, metrics, recentSeedUse)) spent += 1;
      continue;
    }
    if (item.kind === 'plow') {
      if (eng.plowTile(tile, now)) {
        metrics.plows += 1;
        spent += 1;
      }
    }
  }
}

function marketingReset(prev, now) {
  const gain = eng.prestigeShardGain(prev);
  const next = eng.createInitialState({
    prestigeLevel: (prev.prestigeLevel || 0) + 1,
    prestigeShards: (prev.prestigeShards || 0) + gain,
    maxPrestigeShardsEver: Math.max(
      Number(prev.maxPrestigeShardsEver || 0),
      Number((prev.prestigeShards || 0) + gain),
    ),
    selectedTool: prev.selectedTool || 'plow',
    selectedSeed: prev.selectedSeed || 'basic',
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
    marketSeasonStartedAt: Number(prev.marketSeasonStartedAt || now),
    animalClearUnlocked: Boolean(prev.animalClearUnlocked),
    animalOwned: { ...(prev.animalOwned || {}) },
    selectedAnimal: prev.selectedAnimal || cfg.ANIMALS[0].id,
    seedDemand: { ...(prev.seedDemand || {}) },
  });

  next.tiles = next.tiles.map((tile, idx) => ({
    ...tile,
    animals: eng.tileAnimalIds(prev.tiles?.[idx]).slice(0, cfg.MAX_ANIMALS_PER_TILE),
  }));

  next.discovered.tools.animals =
    next.prestigeLevel >= eng.animalPrestigeRequirementByIndex(0);
  if (!next.discovered.tools[next.selectedTool]) next.selectedTool = 'plow';

  eng.applyPrestigeMilestones(next);
  next.updatedAt = now;
  return { next, gain };
}

function maybeMarket(state, style, now, metrics, runStart, lastMarketingAt) {
  const cost = eng.prestigeMoneyCost(state.prestigeLevel);
  if (state.money < cost * style.marketingFactor) return { state, lastMarketingAt };

  const cooldownMs = style.marketingCooldownMin * 60 * 1000;
  if (lastMarketingAt > 0 && now - lastMarketingAt < cooldownMs) {
    return { state, lastMarketingAt };
  }

  const { next, gain } = marketingReset(state, now);
  metrics.marketings += 1;
  metrics.systemsUsed.marketing = true;
  return { state: next, lastMarketingAt: now, gain };
}

function computeAddiction(checkpointMinute, intervalMetrics, state) {
  const nextMarketingCost = eng.prestigeMoneyCost(state.prestigeLevel);
  const progressRatio = clamp(Number(state.money || 0) / Math.max(1, nextMarketingCost), 0, 1.5);

  const momentum = Math.min(3.5, intervalMetrics.harvests / 18);
  const novelty = Math.min(
    2.6,
    intervalMetrics.unlocks * 0.45 +
      intervalMetrics.expansionUnlocks * 0.8 +
      intervalMetrics.researchBuys * 0.35 +
      intervalMetrics.marketings * 1.3,
  );
  const control = Math.min(
    1.8,
    intervalMetrics.automationBuys / 12 +
      intervalMetrics.automationBulkBuys * 0.7 +
      intervalMetrics.animalPlacements / 6,
  );
  const anticipation = progressRatio >= 1 ? 1.4 : progressRatio * 1.2;

  const plateau =
    intervalMetrics.harvests > 45 &&
    intervalMetrics.unlocks === 0 &&
    intervalMetrics.researchBuys === 0 &&
    intervalMetrics.marketings === 0
      ? 1.4
      : intervalMetrics.harvests > 25 &&
          intervalMetrics.unlocks === 0 &&
          intervalMetrics.marketings === 0
        ? 0.8
        : 0;

  const raw = momentum + novelty + control + anticipation - plateau;
  const score = clamp(raw, 0, 10);

  const keepReasons = [];
  if (momentum >= 1.4) keepReasons.push('frequent harvest feedback');
  if (novelty >= 1.2) keepReasons.push('steady unlock/progression beats');
  if (control >= 0.9) keepReasons.push('automation/animal power growth');
  if (anticipation >= 1.0) keepReasons.push('close to next marketing');
  if (checkpointMinute <= 10 && intervalMetrics.unlocks > 0)
    keepReasons.push('good early tutorial flow');

  const quitRisks = [];
  if (plateau >= 1.2) quitRisks.push('repetitive harvest plateau');
  if (intervalMetrics.researchBuys === 0 && checkpointMinute >= 60)
    quitRisks.push('research progression too sparse');
  if (intervalMetrics.marketings === 0 && checkpointMinute >= 30)
    quitRisks.push('marketing cadence feels slow');
  if (score < 5.5) quitRisks.push('low novelty in this segment');

  return {
    score: Number(score.toFixed(2)),
    keepReasons: keepReasons.slice(0, 3),
    quitRisks: quitRisks.slice(0, 3),
  };
}

function topEntries(counter, n = 3) {
  return Object.entries(counter)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, n)
    .map(([id, value]) => ({ id, value: Math.round(Number(value)) }));
}

function simulate(style) {
  let state = eng.createInitialState();
  let now = Date.now();
  const runStart = now;
  let lastMarketingAt = 0;

  const metrics = createMetrics();
  let prevCheckpointMetrics = createMetrics();
  const recentSeedUse = createSeedCounter();

  eng.updateDiscoveries(state);
  eng.applyPrestigeMilestones(state);

  const checkpoints = [];
  let nextCheckpointIdx = 0;

  for (let step = 0; step < TOTAL_STEPS; step += 1) {
    now += STEP_MS;

    eng.progressState(state, now);
    runAutomationWithMetrics(state, now, metrics, recentSeedUse);

    if (step % style.strategyEvery === 0) {
      state.selectedSeed = chooseSeed(state, style, now, recentSeedUse);
      buyFarmExpansions(state, style, metrics);
      buyResearch(state, style, metrics);
      placeAnimals(state, style, metrics);
      buyAutomation(state, style, metrics);
      const marketed = maybeMarket(
        state,
        style,
        now,
        metrics,
        runStart,
        lastMarketingAt,
      );
      state = marketed.state;
      if (marketed.lastMarketingAt !== lastMarketingAt) {
        lastMarketingAt = marketed.lastMarketingAt;
      }
    }

    runManualActions(state, style, now, metrics, recentSeedUse);

    const beforeDisc = countDiscoveries(state);
    eng.updateDiscoveries(state);
    eng.applyPrestigeMilestones(state);
    const afterDisc = countDiscoveries(state);
    if (afterDisc > beforeDisc) metrics.unlocks += afterDisc - beforeDisc;

    const elapsedMin = ((step + 1) * STEP_MS) / 60000;
    while (
      nextCheckpointIdx < CHECKPOINTS.length &&
      elapsedMin >= CHECKPOINTS[nextCheckpointIdx]
    ) {
      const minute = CHECKPOINTS[nextCheckpointIdx];
      const interval = diffMetrics(metrics, prevCheckpointMetrics);
      const addiction = computeAddiction(minute, interval, state);
      checkpoints.push({
        minute,
        addictionScore: addiction.score,
        keepReasons: addiction.keepReasons,
        quitRisks: addiction.quitRisks,
        marketing: Number(state.prestigeLevel || 0),
        platinum: Math.floor(Number(state.prestigeShards || 0)),
        money: Math.floor(Number(state.money || 0)),
        farmSize: Number(state.activeFarmSize || 3),
      });
      prevCheckpointMetrics = cloneMetrics(metrics);
      nextCheckpointIdx += 1;
    }
  }

  const topPlanted = topEntries(metrics.seedPlant, 3);
  const topRevenue = topEntries(metrics.seedRevenue, 3);
  const topAnimals = topEntries(metrics.animalPlaced, 3);

  const firstMarketingCp = checkpoints.find((cp) => cp.marketing > 0);

  return {
    styleId: style.id,
    styleLabel: style.label,
    final: {
      money: Math.floor(Number(state.money || 0)),
      marketing: Number(state.prestigeLevel || 0),
      platinum: Math.floor(Number(state.prestigeShards || 0)),
      farmSize: Number(state.activeFarmSize || 3),
      harvests: metrics.harvests,
      unlocks: metrics.unlocks,
      marketings: metrics.marketings,
      automationBuys: metrics.automationBuys,
      automationBulkBuys: metrics.automationBulkBuys,
      researchBuys: metrics.researchBuys,
      animalPlacements: metrics.animalPlacements,
      expansionUnlocks: metrics.expansionUnlocks,
    },
    firstMarketingMinute: firstMarketingCp?.minute || null,
    topPlanted,
    topRevenue,
    topAnimals,
    checkpoints,
  };
}

function aggregateByCheckpoint(runs) {
  const out = {};
  for (const minute of CHECKPOINTS) {
    const points = runs.map((r) => r.checkpoints.find((cp) => cp.minute === minute)).filter(Boolean);
    const avg =
      points.reduce((sum, p) => sum + Number(p.addictionScore || 0), 0) /
      Math.max(1, points.length);
    const keep = {};
    const quit = {};
    for (const p of points) {
      for (const k of p.keepReasons || []) keep[k] = (keep[k] || 0) + 1;
      for (const q of p.quitRisks || []) quit[q] = (quit[q] || 0) + 1;
    }
    const topKeep = Object.entries(keep)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, c]) => `${k} (${c}/${points.length})`);
    const topQuit = Object.entries(quit)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, c]) => `${k} (${c}/${points.length})`);

    out[minute] = {
      avgAddictionScore: Number(avg.toFixed(2)),
      keepRate: Number(
        (
          points.filter((p) => Number(p.addictionScore || 0) >= 6).length /
          Math.max(1, points.length)
        ).toFixed(2),
      ),
      topKeepDrivers: topKeep,
      topQuitRisks: topQuit,
    };
  }
  return out;
}

function aggregateItems(runs) {
  const planted = createSeedCounter();
  const revenue = createSeedCounter();
  const animals = createAnimalCounter();

  for (const run of runs) {
    for (const row of run.topPlanted) planted[row.id] += Number(row.value || 0);
    for (const row of run.topRevenue) revenue[row.id] += Number(row.value || 0);
    for (const row of run.topAnimals) animals[row.id] += Number(row.value || 0);
  }

  return {
    mostPlanted: topEntries(planted, 5),
    mostRevenue: topEntries(revenue, 5),
    mostPlacedAnimals: topEntries(animals, 5),
  };
}

const runs = styles.map(simulate);
const checkpointAggregate = aggregateByCheckpoint(runs);
const itemAggregate = aggregateItems(runs);

const summary = {
  runs,
  checkpointAggregate,
  itemAggregate,
  meta: {
    totalRuns: runs.length,
    avgFinalMarketing: Number(
      (
        runs.reduce((sum, r) => sum + Number(r.final.marketing || 0), 0) /
        Math.max(1, runs.length)
      ).toFixed(2),
    ),
    shareHookedAt5: Number(
      (
        runs.filter((r) => {
          const cp5 = r.checkpoints.find((c) => c.minute === 5);
          return cp5 && Number(cp5.addictionScore) >= 6;
        }).length / Math.max(1, runs.length)
      ).toFixed(2),
    ),
    shareWantContinueAt120: Number(
      (
        runs.filter((r) => {
          const cp = r.checkpoints.find((c) => c.minute === 120);
          return cp && Number(cp.addictionScore) >= 6;
        }).length / Math.max(1, runs.length)
      ).toFixed(2),
    ),
  },
};

console.log(JSON.stringify(summary, null, 2));

