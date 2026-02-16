import {
  ACTION_TOOLS,
  ANIMAL_PRESTIGE_OFFSET,
  ANIMALS,
  AUTOMATION_COSTS,
  BRUSHES,
  FARM_EXPANSIONS,
  GRID_SIZE,
  LATE_WATER_DELAY_FRACTION,
  MARKETING_UNLOCK_MONEY,
  MARKET_ROTATION_MS,
  MARKET_SEASONS,
  MAX_ANIMALS_PER_TILE,
  OLD_UNHARVESTED_GRACE_FACTOR,
  OLD_UNHARVESTED_GRACE_MIN_MS,
  OVERDUE_WATER_GRACE_FACTOR,
  OVERDUE_WATER_GRACE_MIN_MS,
  PRESTIGE_BASE_MONEY,
  PRESTIGE_COST_GROWTH,
  PRESTIGE_GROWTH_SPEED_PER_LEVEL,
  PRESTIGE_MAX_GROWTH_SPEED,
  PRESTIGE_MILESTONES,
  RESEARCH_UNLOCK_MARKETING,
  PRESTIGE_START_MONEY_PER_LEVEL,
  SEED_PRICE_CURVES,
  SEED_DEMAND_GROWTH_BASE,
  SEED_DEMAND_HALF_LIFE_MS,
  SEED_DEMAND_MAX_MULTIPLIER,
  SEED_DEMAND_PER_PLANT,
  SEED_UNLOCK_ORDER,
  SEEDS,
  SHARD_UPGRADES,
  SOIL_DECAY_MS,
  STAGES,
  STARTING_MONEY,
  TILE_COUNT,
  TOOLS,
} from "./config";
export function createDefaultBrushUnlocks() {
  return {
    plow: { "1x1": true },
    water: { "1x1": true },
    plant: { "1x1": true },
    harvest: { "1x1": true },
  };
}

export function createDefaultSelectedBrushes() {
  return {
    plow: "1x1",
    water: "1x1",
    plant: "1x1",
    harvest: "1x1",
  };
}

export function createDefaultDiscovered() {
  const seeds = {};
  for (const seed of SEEDS) {
    seeds[seed.id] = seed.cost <= 0;
  }
  const tools = {};
  for (const tool of TOOLS) {
    tools[tool.id] = false;
  }
  tools.plow = true;
  tools.expandFarm = true;
  tools.save = true;
  const brushes = {
    plow: {},
    water: {},
    plant: {},
    harvest: {},
  };
  const automation = {
    plow: false,
    plant: false,
    water: false,
    harvest: false,
  };
  const animals = {};
  for (const animal of ANIMALS) {
    animals[animal.id] = false;
  }
  for (const action of ACTION_TOOLS) {
    for (const brush of BRUSHES) {
      brushes[action][brush.id] = brush.cost <= 0;
    }
  }
  return { seeds, tools, brushes, automation, animals };
}

export function createDefaultShardUpgrades() {
  const out = {};
  for (const upgrade of SHARD_UPGRADES) out[upgrade.id] = 0;
  return out;
}

export function createDefaultMilestonesClaimed() {
  const out = {};
  for (const milestone of PRESTIGE_MILESTONES) out[milestone.id] = false;
  return out;
}

export function shardUpgradeById(upgradeId) {
  return SHARD_UPGRADES.find((u) => u.id === upgradeId) || null;
}

export function shardUpgradeCost(upgradeId, level) {
  const upgrade = shardUpgradeById(upgradeId);
  if (!upgrade) return Number.POSITIVE_INFINITY;
  return Math.floor(
    upgrade.baseCost * Math.pow(upgrade.growth, Math.max(0, level)),
  );
}

export function shardUpgradeLevel(state, upgradeId) {
  return Math.max(0, Number(state?.shardUpgrades?.[upgradeId] || 0));
}

export function shardUpgradeMarketingRequirement(upgradeId) {
  const upgrade = shardUpgradeById(upgradeId);
  return Math.max(
    0,
    Number(upgrade?.minMarketing || RESEARCH_UNLOCK_MARKETING || 0),
  );
}

export function canBuyShardUpgrade(state, upgradeId) {
  return (
    Math.max(0, Number(state?.prestigeLevel || 0)) >=
    shardUpgradeMarketingRequirement(upgradeId)
  );
}

export function shardUpgradeEffects(state) {
  const seedLab = shardUpgradeLevel(state, "seed_lab");
  const harvestLab = shardUpgradeLevel(state, "harvest_lab");
  const luckLab = shardUpgradeLevel(state, "luck_lab");
  const regrowLab = shardUpgradeLevel(state, "regrow_lab");
  const marketLab = shardUpgradeLevel(state, "market_lab");
  return {
    thrift: Math.min(0.6, seedLab * 0.028),
    matureBonus: Math.min(1.8, harvestLab * 0.075),
    jackpot: Math.min(0.5, luckLab * 0.03),
    regrow: Math.min(0.4, regrowLab * 0.03),
    marketBonus: Math.min(0.5, marketLab * 0.04),
  };
}

export function cropCategory(seedId) {
  const map = {
    basic: "grain",
    corn: "grain",
    turnip: "root",
    carrot: "root",
    rose: "flower",
    tulip: "flower",
    lavender: "flower",
    sunflower: "flower",
    berry: "fruit",
    lotus: "fruit",
    pumpkin: "gourd",
    cacao: "luxury",
  };
  return map[seedId] || "grain";
}

export function marketSeasonIndexAt(timestampMs = Date.now()) {
  const safeNow =
    Number.isFinite(timestampMs) && timestampMs >= 0 ? timestampMs : Date.now();
  return Math.floor(safeNow / MARKET_ROTATION_MS) % MARKET_SEASONS.length;
}

export function marketSeasonRemainingMs(timestampMs = Date.now()) {
  const safeNow =
    Number.isFinite(timestampMs) && timestampMs >= 0 ? timestampMs : Date.now();
  const elapsedInCycle = safeNow % MARKET_ROTATION_MS;
  return Math.max(0, MARKET_ROTATION_MS - elapsedInCycle);
}

export function currentMarketSeason(timestampMs = Date.now()) {
  const idx = clamp(
    marketSeasonIndexAt(timestampMs),
    0,
    MARKET_SEASONS.length - 1,
  );
  return MARKET_SEASONS[idx] || MARKET_SEASONS[0];
}

export function marketBonusForHarvest(state, tile, seedId) {
  const season = currentMarketSeason(Date.now());
  const effects = shardUpgradeEffects(state);
  const category = cropCategory(seedId);
  if (!season.categories.includes(category)) return 0;
  let bonus = season.baseBonus + effects.marketBonus;
  if (
    season.synergyAnimal &&
    tileAnimalIds(tile).includes(season.synergyAnimal)
  ) {
    bonus += season.synergyBonus;
  }
  return Math.max(0, bonus);
}

export function applyPrestigeMilestones(state) {
  let changed = false;
  if (!state?.milestonesClaimed) {
    state.milestonesClaimed = createDefaultMilestonesClaimed();
    changed = true;
  }
  for (const milestone of PRESTIGE_MILESTONES) {
    if (state.milestonesClaimed[milestone.id]) continue;
    if (Number(state.prestigeLevel || 0) < milestone.reqPrestige) continue;
    state.milestonesClaimed[milestone.id] = true;
    state.prestigeShards = Math.max(
      0,
      Number(state.prestigeShards || 0) + milestone.rewardShards,
    );
    changed = true;
  }
  return changed;
}

export function createTile() {
  return {
    soil: "unplowed",
    lastTilledAt: 0,
    watered: false,
    plant: null,
    autoPlantSeedId: null,
    autoPlow: false,
    autoWater: false,
    autoPlant: false,
    autoHarvest: false,
    autoEverything: false,
    animals: [],
  };
}

export function createInitialAnimalOwned() {
  const out = {};
  for (const animal of ANIMALS) out[animal.id] = 0;
  return out;
}

export function createInitialSeedDemand(now = Date.now()) {
  const out = {};
  for (const seed of SEEDS) {
    out[seed.id] = { level: 0, updatedAt: now };
  }
  return out;
}

export function createInitialFarmSizeUnlocks() {
  const out = {};
  for (const exp of FARM_EXPANSIONS) out[exp.size] = exp.size === 3;
  return out;
}

export function animalTierIndex(animalId) {
  return ANIMALS.findIndex((a) => a.id === animalId);
}

export function animalPrestigeRequirementByIndex(idx) {
  if (idx < 0) return Number.POSITIVE_INFINITY;
  return idx + ANIMAL_PRESTIGE_OFFSET;
}

export function animalPrestigeRequirement(animalId) {
  return animalPrestigeRequirementByIndex(animalTierIndex(animalId));
}

export function animalMaxOwnedForPrestige(prestigeLevel, animalId) {
  const req = animalPrestigeRequirement(animalId);
  if (!Number.isFinite(req)) return 0;
  if (prestigeLevel < req) return 0;
  if (prestigeLevel === req) return 1;
  return Number.POSITIVE_INFINITY;
}

export function countPlacedAnimals(tiles, animalId) {
  let count = 0;
  for (const tile of tiles || []) {
    for (const a of tileAnimalIds(tile)) {
      if (a === animalId) count += 1;
    }
  }
  return count;
}

export function farmExpansionBySize(size) {
  return FARM_EXPANSIONS.find((exp) => exp.size === size) || null;
}

export function createInitialState(carry = {}) {
  const prestigeLevel = Math.max(0, Number(carry.prestigeLevel || 0));
  const shardUpgrades = {
    ...createDefaultShardUpgrades(),
    ...(carry.shardUpgrades || {}),
  };
  const milestonesClaimed = {
    ...createDefaultMilestonesClaimed(),
    ...(carry.milestonesClaimed || {}),
  };
  const defaultBrushUnlocks = createDefaultBrushUnlocks();
  const carryBrushUnlocks = carry.brushUnlocks || {};
  const brushUnlocks = {
    plow: { ...defaultBrushUnlocks.plow, ...(carryBrushUnlocks.plow || {}) },
    water: { ...defaultBrushUnlocks.water, ...(carryBrushUnlocks.water || {}) },
    plant: { ...defaultBrushUnlocks.plant, ...(carryBrushUnlocks.plant || {}) },
    harvest: {
      ...defaultBrushUnlocks.harvest,
      ...(carryBrushUnlocks.harvest || {}),
    },
  };
  const defaultSelectedBrushes = createDefaultSelectedBrushes();
  const selectedBrushes = {
    plow:
      typeof carry.selectedBrushes?.plow === "string"
        ? carry.selectedBrushes.plow
        : defaultSelectedBrushes.plow,
    water:
      typeof carry.selectedBrushes?.water === "string"
        ? carry.selectedBrushes.water
        : defaultSelectedBrushes.water,
    plant:
      typeof carry.selectedBrushes?.plant === "string"
        ? carry.selectedBrushes.plant
        : defaultSelectedBrushes.plant,
    harvest:
      typeof carry.selectedBrushes?.harvest === "string"
        ? carry.selectedBrushes.harvest
        : defaultSelectedBrushes.harvest,
  };
  const baseDiscovered = createDefaultDiscovered();
  const discovered = {
    seeds: { ...baseDiscovered.seeds, ...(carry.discovered?.seeds || {}) },
    tools: { ...baseDiscovered.tools, ...(carry.discovered?.tools || {}) },
    animals: {
      ...baseDiscovered.animals,
      ...(carry.discovered?.animals || {}),
    },
    automation: {
      ...baseDiscovered.automation,
      ...(carry.discovered?.automation || {}),
    },
    brushes: {
      plow: {
        ...baseDiscovered.brushes.plow,
        ...(carry.discovered?.brushes?.plow || {}),
      },
      water: {
        ...baseDiscovered.brushes.water,
        ...(carry.discovered?.brushes?.water || {}),
      },
      plant: {
        ...baseDiscovered.brushes.plant,
        ...(carry.discovered?.brushes?.plant || {}),
      },
      harvest: {
        ...baseDiscovered.brushes.harvest,
        ...(carry.discovered?.brushes?.harvest || {}),
      },
    },
  };
  const farmSizeUnlocks = {
    ...createInitialFarmSizeUnlocks(),
    ...(carry.farmSizeUnlocks || {}),
  };
  farmSizeUnlocks[3] = true;
  const unlockedSizes = FARM_EXPANSIONS.map((exp) => exp.size).filter(
    (size) => farmSizeUnlocks[size],
  );
  const maxUnlocked = unlockedSizes.length > 0 ? Math.max(...unlockedSizes) : 3;
  const requestedFarmSize = Number(carry.activeFarmSize ?? maxUnlocked);
  const activeFarmSize = FARM_EXPANSIONS.some(
    (exp) => exp.size === requestedFarmSize,
  )
    ? Math.min(requestedFarmSize, maxUnlocked)
    : maxUnlocked;
  const startingMoney =
    STARTING_MONEY + prestigeLevel * PRESTIGE_START_MONEY_PER_LEVEL;
  const defaultSeedDemand = createInitialSeedDemand();
  const carrySeedDemand =
    carry.seedDemand && typeof carry.seedDemand === "object"
      ? carry.seedDemand
      : {};
  const seedDemand = { ...defaultSeedDemand };
  for (const seed of SEEDS) {
    const raw = carrySeedDemand[seed.id];
    if (!raw || typeof raw !== "object") continue;
    seedDemand[seed.id] = {
      level: Math.max(0, Number(raw.level || 0)),
      updatedAt: Number(raw.updatedAt || Date.now()),
    };
  }
  return {
    version: 1,
    money: Math.max(0, Number(carry.money ?? startingMoney)),
    selectedTool:
      typeof carry.selectedTool === "string" ? carry.selectedTool : "plow",
    selectedSeed:
      typeof carry.selectedSeed === "string" ? carry.selectedSeed : "basic",
    brushUnlocks,
    selectedBrushes,
    discovered,
    totalHarvests: 0,
    prestigeLevel,
    prestigeShards: Number(carry.prestigeShards || 0),
    maxPrestigeShardsEver: Math.max(
      Number(carry.maxPrestigeShardsEver || 0),
      Number(carry.prestigeShards || 0),
    ),
    shardUpgrades,
    milestonesClaimed,
    farmSizeUnlocks,
    activeFarmSize,
    marketSeasonIndex: clamp(
      Number(carry.marketSeasonIndex || 0),
      0,
      MARKET_SEASONS.length - 1,
    ),
    marketSeasonStartedAt: Number(carry.marketSeasonStartedAt || Date.now()),
    animalClearUnlocked: Boolean(carry.animalClearUnlocked),
    animalOwned: {
      ...createInitialAnimalOwned(),
      ...(carry.animalOwned || {}),
    },
    seedDemand,
    selectedAnimal: carry.selectedAnimal || ANIMALS[0].id,
    tiles: Array.from({ length: TILE_COUNT }, createTile),
    updatedAt: Date.now(),
  };
}

export function seedById(seedId) {
  return SEEDS.find((seed) => seed.id === seedId) || SEEDS[0];
}

export function seedPriceCurve(seedId) {
  const key = seedById(seedId).id;
  return SEED_PRICE_CURVES[key] || {};
}

export function seedDemandMultiplierForLevel(level, seedId = null) {
  const curve = seedId ? seedPriceCurve(seedId) : {};
  const growthBase = Math.max(
    1.001,
    Number(curve.demandGrowthBase || SEED_DEMAND_GROWTH_BASE),
  );
  const maxMultiplier = Math.max(
    1,
    Number(curve.demandMaxMultiplier || SEED_DEMAND_MAX_MULTIPLIER),
  );
  const safeLevel = Math.max(0, Number(level || 0));
  return Math.min(maxMultiplier, Math.pow(growthBase, safeLevel));
}

export function decaySeedDemandLevel(level, elapsedMs, seedId = null) {
  const curve = seedId ? seedPriceCurve(seedId) : {};
  const halfLifeMs = Math.max(
    1_000,
    Number(curve.demandHalfLifeMs || SEED_DEMAND_HALF_LIFE_MS),
  );
  const safeLevel = Math.max(0, Number(level || 0));
  if (safeLevel <= 0) return 0;
  const dt = Math.max(0, Number(elapsedMs || 0));
  if (dt <= 0) return safeLevel;
  const decayFactor = Math.pow(0.5, dt / halfLifeMs);
  return safeLevel * decayFactor;
}

export function seedDemandLevel(state, seedId, now = Date.now()) {
  const resolvedSeedId = seedById(seedId).id;
  const entry = state?.seedDemand?.[resolvedSeedId];
  if (!entry) return 0;
  const elapsed = Math.max(0, now - Number(entry.updatedAt || now));
  return decaySeedDemandLevel(entry.level, elapsed, resolvedSeedId);
}

export function seedEraPriceMultiplier(state, seedId) {
  const curve = seedPriceCurve(seedId);
  const marketingLevel = Math.max(0, Number(state?.prestigeLevel || 0));
  const preferredMin = Math.max(0, Number(curve.preferredMarketingMin || 0));
  const preferredMax = Math.max(preferredMin, Number(curve.preferredMarketingMax ?? preferredMin));
  const inBandMultiplier = Math.max(0.1, Number(curve.inBandMultiplier || 1));
  const earlySlope = Math.max(0, Number(curve.earlySlope || 0));
  const lateSlope = Math.max(0, Number(curve.lateSlope || 0));
  const minMultiplier = Math.max(0.1, Number(curve.minMultiplier || 0.7));
  const maxMultiplier = Math.max(minMultiplier, Number(curve.maxMultiplier || 4));

  let multiplier = inBandMultiplier;
  if (marketingLevel < preferredMin) {
    multiplier += (preferredMin - marketingLevel) * earlySlope;
  } else if (marketingLevel > preferredMax) {
    multiplier += (marketingLevel - preferredMax) * lateSlope;
  }
  return clamp(multiplier, minMultiplier, maxMultiplier);
}

export function seedEraYieldBonus(state, seedId) {
  const curve = seedPriceCurve(seedId);
  const inBandYieldBonus = Math.max(0, Number(curve.inBandYieldBonus || 0));
  if (inBandYieldBonus <= 0) return 0;
  const marketingLevel = Math.max(0, Number(state?.prestigeLevel || 0));
  const preferredMin = Math.max(0, Number(curve.preferredMarketingMin || 0));
  const preferredMax = Math.max(
    preferredMin,
    Number(curve.preferredMarketingMax ?? preferredMin),
  );
  if (marketingLevel < preferredMin || marketingLevel > preferredMax) return 0;
  return inBandYieldBonus;
}

export function seedFloorCostForState(state, seedId) {
  const curve = seedPriceCurve(seedId);
  const floorStartMarketing = Math.max(
    0,
    Number(curve.floorStartMarketing || Number.POSITIVE_INFINITY),
  );
  const floorStartCost = Math.max(0, Number(curve.floorStartCost || 0));
  if (floorStartCost <= 0 || !Number.isFinite(floorStartMarketing)) return 0;
  const marketingLevel = Math.max(0, Number(state?.prestigeLevel || 0));
  if (marketingLevel < floorStartMarketing) return 0;
  const floorGrowth = Math.max(1, Number(curve.floorGrowth || 1));
  const levels = marketingLevel - floorStartMarketing;
  return Math.max(1, Math.floor(floorStartCost * Math.pow(floorGrowth, levels)));
}

export function seedCostAtDemandLevel(state, seedId, demandLevel) {
  const seed = seedById(seedId);
  if (seed.cost <= 0) return 0;
  const eraMultiplier = seedEraPriceMultiplier(state, seed.id);
  const demandMultiplier = seedDemandMultiplierForLevel(demandLevel, seed.id);
  const floorCost = seedFloorCostForState(state, seed.id);
  const variableCost = Math.floor(seed.cost * eraMultiplier * demandMultiplier);
  return Math.max(1, floorCost, variableCost);
}

export function currentSeedCost(state, seedId, now = Date.now()) {
  const seed = seedById(seedId);
  const level = seedDemandLevel(state, seed.id, now);
  return seedCostAtDemandLevel(state, seed.id, level);
}

export function seedPlantingQuote(state, seedId, requestedTiles, now = Date.now()) {
  const seed = seedById(seedId);
  const tiles = Math.max(0, Math.floor(Number(requestedTiles || 0)));
  const moneyStart = Math.max(0, Number(state?.money || 0));
  const levelStart = seedDemandLevel(state, seed.id, now);
  const currentMultiplier = seedDemandMultiplierForLevel(levelStart, seed.id);
  const eraMultiplier = seedEraPriceMultiplier(state, seed.id);
  const currentTileCost = seedCostAtDemandLevel(state, seed.id, levelStart);
  const fullCost =
    currentTileCost <= 0
      ? 0
      : Array.from({ length: tiles }).reduce((sum, _, idx) => {
          const level = levelStart + idx * SEED_DEMAND_PER_PLANT;
          return sum + seedCostAtDemandLevel(state, seed.id, level);
        }, 0);

  if (currentTileCost <= 0) {
    return {
      requestedTiles: tiles,
      affordableTiles: tiles,
      affordableCost: 0,
      fullCost: 0,
      currentTileCost: 0,
      currentMultiplier: 1,
      eraMultiplier: 1,
    };
  }

  let affordableTiles = 0;
  let affordableCost = 0;
  let remainingMoney = moneyStart;
  let level = levelStart;
  while (affordableTiles < tiles) {
    const tileCost = seedCostAtDemandLevel(state, seed.id, level);
    if (remainingMoney < tileCost) break;
    remainingMoney -= tileCost;
    affordableCost += tileCost;
    affordableTiles += 1;
    level += SEED_DEMAND_PER_PLANT;
  }

  return {
    requestedTiles: tiles,
    affordableTiles,
    affordableCost,
    fullCost,
    currentTileCost,
    currentMultiplier,
    eraMultiplier,
  };
}

export function animalById(animalId) {
  return ANIMALS.find((a) => a.id === animalId) || null;
}

export function tileAnimalIds(tile) {
  if (Array.isArray(tile?.animals)) {
    return tile.animals.filter((a) => typeof a === "string");
  }
  if (typeof tile?.animal === "string") return [tile.animal];
  return [];
}

export function animalTrait(animalId, key) {
  return Math.max(0, Number(animalById(animalId)?.traits?.[key] ?? 0));
}

export function tileAnimalTrait(tile, key) {
  let total = 0;
  for (const animalId of tileAnimalIds(tile))
    total += animalTrait(animalId, key);
  return Math.max(0, total);
}

export function seedTrait(seed, key) {
  return Math.max(0, Number(seed?.traits?.[key] ?? 0));
}

export function seedTraitText(seed) {
  const parts = [];
  const quick = seedTrait(seed, "quick");
  const thrift = seedTrait(seed, "thrift");
  const droughtGuard = seedTrait(seed, "droughtGuard");
  const jackpot = seedTrait(seed, "jackpot");
  const matureBonus = seedTrait(seed, "matureBonus");
  const regrow = seedTrait(seed, "regrow");

  if (quick > 0) parts.push(`Quick ${Math.round(quick * 100)}%`);
  if (thrift > 0) parts.push(`Thrift ${Math.round(thrift * 100)}%`);
  if (droughtGuard > 0)
    parts.push(`Drought+ ${Math.round(droughtGuard * 100)}%`);
  if (jackpot > 0) parts.push(`Jackpot ${Math.round(jackpot * 100)}%`);
  if (matureBonus > 0) parts.push(`Mature+ ${Math.round(matureBonus * 100)}%`);
  if (regrow > 0) parts.push(`Regrow ${Math.round(regrow * 100)}%`);
  return parts.join(" | ");
}

export function stageDurationMs(seed, stageIndex) {
  const base = STAGES[stageIndex]?.durationMs || STAGES[0].durationMs;
  const scale =
    (seed?.stageScale?.[stageIndex] ?? 1) * (1 - seedTrait(seed, "quick"));
  return Math.max(5_000, Math.round(base * scale));
}

export function stageDurationWithTile(seed, stageIndex, tile) {
  const prestigeLevel = Math.max(0, Number(tile?.plant?.prestigeAtPlant || 0));
  const prestigeQuick = Math.min(
    PRESTIGE_MAX_GROWTH_SPEED,
    prestigeLevel * PRESTIGE_GROWTH_SPEED_PER_LEVEL,
  );
  const quick =
    seedTrait(seed, "quick") + tileAnimalTrait(tile, "quick") + prestigeQuick;
  const effective = {
    ...seed,
    traits: { ...(seed?.traits || {}), quick },
  };
  return stageDurationMs(effective, stageIndex);
}

export function formatDuration(ms) {
  if (ms <= 0) return "ready";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatLargeNumber(value, decimals = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return "0";
  if (!Number.isFinite(num)) return num < 0 ? "-9.99E999" : "9.99E999";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs < 1e9) {
    return `${sign}${Math.floor(abs).toLocaleString()}`;
  }
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / 10 ** exp;
  const compact = mantissa.toFixed(decimals).replace(/\.?0+$/, "");
  return `${sign}${compact}E${exp}`;
}

export function formatMoney(value) {
  return `$${formatLargeNumber(value, 2)}`;
}

export function cloneState(state) {
  return {
    ...state,
    farmSizeUnlocks: { ...(state.farmSizeUnlocks || {}) },
    shardUpgrades: { ...(state.shardUpgrades || {}) },
    milestonesClaimed: { ...(state.milestonesClaimed || {}) },
    animalOwned: { ...(state.animalOwned || {}) },
    seedDemand: Object.fromEntries(
      Object.entries(state.seedDemand || {}).map(([seedId, demand]) => [
        seedId,
        {
          level: Math.max(0, Number(demand?.level || 0)),
          updatedAt: Number(demand?.updatedAt || Date.now()),
        },
      ]),
    ),
    brushUnlocks: {
      plow: { ...(state.brushUnlocks?.plow || {}) },
      water: { ...(state.brushUnlocks?.water || {}) },
      plant: { ...(state.brushUnlocks?.plant || {}) },
      harvest: { ...(state.brushUnlocks?.harvest || {}) },
    },
    selectedBrushes: { ...(state.selectedBrushes || {}) },
    discovered: {
      seeds: { ...(state.discovered?.seeds || {}) },
      tools: { ...(state.discovered?.tools || {}) },
      animals: { ...(state.discovered?.animals || {}) },
      automation: { ...(state.discovered?.automation || {}) },
      brushes: {
        plow: { ...(state.discovered?.brushes?.plow || {}) },
        water: { ...(state.discovered?.brushes?.water || {}) },
        plant: { ...(state.discovered?.brushes?.plant || {}) },
        harvest: { ...(state.discovered?.brushes?.harvest || {}) },
      },
    },
    tiles: (state.tiles || []).map((tile) => {
      const plant = tile.plant ? { ...tile.plant } : null;
      const rememberedSeedId = SEEDS.some((seed) => seed.id === tile?.autoPlantSeedId)
        ? tile.autoPlantSeedId
        : SEEDS.some((seed) => seed.id === tile?.plant?.seedId)
          ? tile.plant.seedId
          : null;
      return {
        ...tile,
        autoPlantSeedId: rememberedSeedId,
        animals: Array.isArray(tile.animals)
          ? tile.animals.filter((a) => typeof a === "string")
          : typeof tile.animal === "string"
            ? [tile.animal]
            : [],
        plant,
      };
    }),
  };
}

export function normalizeState(raw) {
  const next = createInitialState();
  if (!raw || typeof raw !== "object") return next;

  const tiles = Array.isArray(raw.tiles) ? raw.tiles : [];
  const normalizeNow = Date.now();
  next.tiles = Array.from({ length: TILE_COUNT }, (_, idx) => {
    const src = tiles[idx] || {};
    const soil = src.soil === "plowed" ? "plowed" : "unplowed";
    return {
      soil,
      lastTilledAt: Number(
        src.lastTilledAt ?? (soil === "plowed" ? normalizeNow : 0),
      ),
      watered: Boolean(src.watered),
      autoPlantSeedId: SEEDS.some((seed) => seed.id === src.autoPlantSeedId)
        ? src.autoPlantSeedId
        : src.plant && typeof src.plant === "object"
          ? seedById(src.plant.seedId).id
          : null,
      autoPlow: Boolean(src.autoPlow),
      autoWater: Boolean(src.autoWater),
      autoPlant: Boolean(src.autoPlant),
      autoHarvest: Boolean(src.autoHarvest),
      autoEverything: Boolean(src.autoEverything),
      animals: Array.isArray(src.animals)
        ? src.animals
            .filter((a) => typeof a === "string")
            .slice(0, MAX_ANIMALS_PER_TILE)
        : typeof src.animal === "string"
          ? [src.animal]
          : [],
      plant:
        src.plant && typeof src.plant === "object"
          ? {
              seedId: seedById(src.plant.seedId).id,
              stageIndex: clamp(
                Number(src.plant.stageIndex ?? 0),
                0,
                STAGES.length - 1,
              ),
              stageStartedAt: Number(src.plant.stageStartedAt ?? Date.now()),
              stageWatered: Boolean(src.plant.stageWatered),
              plantedAt: Number(src.plant.plantedAt ?? Date.now()),
              prestigeAtPlant: Math.max(
                0,
                Number(src.plant.prestigeAtPlant ?? 0),
              ),
            }
          : null,
    };
  });

  next.money = Math.max(0, Number(raw.money ?? next.money));
  next.selectedTool = TOOLS.some((t) => t.id === raw.selectedTool)
    ? raw.selectedTool
    : next.selectedTool;
  next.selectedSeed = SEEDS.some((s) => s.id === raw.selectedSeed)
    ? raw.selectedSeed
    : next.selectedSeed;
  const defaultUnlocks = createDefaultBrushUnlocks();
  const defaultSelected = createDefaultSelectedBrushes();
  const defaultDiscovered = createDefaultDiscovered();
  next.brushUnlocks = {
    plow: { ...defaultUnlocks.plow, ...(raw.brushUnlocks?.plow || {}) },
    water: { ...defaultUnlocks.water, ...(raw.brushUnlocks?.water || {}) },
    plant: { ...defaultUnlocks.plant, ...(raw.brushUnlocks?.plant || {}) },
    harvest: {
      ...defaultUnlocks.harvest,
      ...(raw.brushUnlocks?.harvest || {}),
    },
  };
  next.selectedBrushes = {
    plow:
      typeof raw.selectedBrushes?.plow === "string"
        ? raw.selectedBrushes.plow
        : defaultSelected.plow,
    water:
      typeof raw.selectedBrushes?.water === "string"
        ? raw.selectedBrushes.water
        : defaultSelected.water,
    plant:
      typeof raw.selectedBrushes?.plant === "string"
        ? raw.selectedBrushes.plant
        : defaultSelected.plant,
    harvest:
      typeof raw.selectedBrushes?.harvest === "string"
        ? raw.selectedBrushes.harvest
        : defaultSelected.harvest,
  };
  next.discovered = {
    seeds: { ...defaultDiscovered.seeds, ...(raw.discovered?.seeds || {}) },
    tools: { ...defaultDiscovered.tools, ...(raw.discovered?.tools || {}) },
    animals: {
      ...defaultDiscovered.animals,
      ...(raw.discovered?.animals || {}),
    },
    automation: {
      ...defaultDiscovered.automation,
      ...(raw.discovered?.automation || {}),
    },
    brushes: {
      plow: {
        ...defaultDiscovered.brushes.plow,
        ...(raw.discovered?.brushes?.plow || {}),
      },
      water: {
        ...defaultDiscovered.brushes.water,
        ...(raw.discovered?.brushes?.water || {}),
      },
      plant: {
        ...defaultDiscovered.brushes.plant,
        ...(raw.discovered?.brushes?.plant || {}),
      },
      harvest: {
        ...defaultDiscovered.brushes.harvest,
        ...(raw.discovered?.brushes?.harvest || {}),
      },
    },
  };
  next.seedDemand = createInitialSeedDemand();
  if (raw.seedDemand && typeof raw.seedDemand === "object") {
    for (const seed of SEEDS) {
      const demand = raw.seedDemand[seed.id];
      if (!demand || typeof demand !== "object") continue;
      next.seedDemand[seed.id] = {
        level: Math.max(0, Number(demand.level || 0)),
        updatedAt: Number(demand.updatedAt || Date.now()),
      };
    }
  }
  next.totalHarvests = Math.max(0, Number(raw.totalHarvests ?? 0));
  next.prestigeLevel = Math.max(0, Number(raw.prestigeLevel ?? 0));
  next.prestigeShards = Math.max(0, Number(raw.prestigeShards ?? 0));
  next.shardUpgrades = {
    ...createDefaultShardUpgrades(),
    ...(raw.shardUpgrades || {}),
  };
  for (const upgrade of SHARD_UPGRADES) {
    next.shardUpgrades[upgrade.id] = clamp(
      Math.floor(Number(next.shardUpgrades[upgrade.id] || 0)),
      0,
      upgrade.cap,
    );
  }
  next.milestonesClaimed = {
    ...createDefaultMilestonesClaimed(),
    ...(raw.milestonesClaimed || {}),
  };
  next.maxPrestigeShardsEver = Math.max(
    Number(raw.maxPrestigeShardsEver ?? 0),
    next.prestigeShards,
  );
  next.marketSeasonIndex = clamp(
    Number(raw.marketSeasonIndex ?? 0),
    0,
    MARKET_SEASONS.length - 1,
  );
  next.marketSeasonStartedAt = Number(raw.marketSeasonStartedAt ?? Date.now());
  next.animalClearUnlocked = Boolean(raw.animalClearUnlocked);
  const defaultFarmUnlocks = createInitialFarmSizeUnlocks();
  const hasFarmData =
    raw.farmSizeUnlocks && typeof raw.farmSizeUnlocks === "object";
  if (hasFarmData) {
    next.farmSizeUnlocks = {
      ...defaultFarmUnlocks,
      ...(raw.farmSizeUnlocks || {}),
    };
  } else {
    // Backward-compat migration for existing saves created before farm-size progression.
    next.farmSizeUnlocks = { ...defaultFarmUnlocks };
    for (const exp of FARM_EXPANSIONS) next.farmSizeUnlocks[exp.size] = true;
  }
  next.farmSizeUnlocks[3] = true;
  const unlockedSizes = FARM_EXPANSIONS.map((exp) => exp.size).filter(
    (size) => next.farmSizeUnlocks[size],
  );
  const maxUnlocked = unlockedSizes.length > 0 ? Math.max(...unlockedSizes) : 3;
  const rawActive = Number(raw.activeFarmSize ?? maxUnlocked);
  next.activeFarmSize = FARM_EXPANSIONS.some((exp) => exp.size === rawActive)
    ? Math.min(rawActive, maxUnlocked)
    : maxUnlocked;
  const legacyUnlocks = raw.animalUnlocks || {};
  next.animalOwned = {
    ...createInitialAnimalOwned(),
    ...(raw.animalOwned || {}),
  };
  for (const animal of ANIMALS) {
    if (!Object.prototype.hasOwnProperty.call(next.animalOwned, animal.id)) {
      next.animalOwned[animal.id] = 0;
    }
    if (legacyUnlocks[animal.id] && next.animalOwned[animal.id] <= 0) {
      next.animalOwned[animal.id] = 1;
    }
    next.animalOwned[animal.id] = Math.max(
      0,
      Math.floor(Number(next.animalOwned[animal.id] || 0)),
    );
    if (next.animalOwned[animal.id] > 0)
      next.discovered.animals[animal.id] = true;
  }
  next.selectedAnimal = ANIMALS.some((a) => a.id === raw.selectedAnimal)
    ? raw.selectedAnimal
    : ANIMALS[0].id;
  if (next.prestigeLevel >= animalPrestigeRequirementByIndex(0)) {
    next.discovered.tools.animals = true;
  }
  for (const action of ACTION_TOOLS) {
    for (const brush of BRUSHES) {
      if (next.brushUnlocks[action][brush.id]) {
        next.discovered.brushes[action][brush.id] = true;
      }
    }
    const selected = next.selectedBrushes[action];
    if (!next.brushUnlocks[action][selected]) {
      next.selectedBrushes[action] = "1x1";
    }
  }
  applyPrestigeMilestones(next);
  next.updatedAt = Number(raw.updatedAt ?? Date.now());
  return next;
}

export function advancePlant(plant, now, tile = null) {
  let changed = false;
  while (plant.stageIndex < STAGES.length - 1) {
    const seed = seedById(plant.seedId);
    const duration = tile
      ? stageDurationWithTile(seed, plant.stageIndex, tile)
      : stageDurationMs(seed, plant.stageIndex);
    const elapsed = now - plant.stageStartedAt;
    if (elapsed < duration) break;
    const needsWater = plant.stageIndex <= 2;
    if (needsWater && !plant.stageWatered) break;

    plant.stageIndex += 1;
    // Stage timer starts only when that stage is actually reached.
    plant.stageStartedAt = now;
    plant.stageWatered = false;
    changed = true;
  }
  return changed;
}

export function progressState(state, now) {
  let changed = false;
  for (const tile of state.tiles) {
    if (
      tile.soil === "plowed" &&
      !tile.plant &&
      tile.lastTilledAt > 0 &&
      now - tile.lastTilledAt >= SOIL_DECAY_MS
    ) {
      tile.soil = "unplowed";
      tile.watered = false;
      tile.lastTilledAt = 0;
      changed = true;
    }
    if (!tile.plant) continue;

    // Old crops eventually wither completely if left unharvested.
    if (tile.plant.stageIndex === 4) {
      const seed = seedById(tile.plant.seedId);
      const stageDuration = stageDurationMs(seed, 4);
      const elapsed = now - tile.plant.stageStartedAt;
      const graceMs = Math.max(
        OLD_UNHARVESTED_GRACE_MIN_MS,
        Math.round(stageDuration * OLD_UNHARVESTED_GRACE_FACTOR),
      );
      if (elapsed >= stageDuration + graceMs) {
        tile.plant = null;
        tile.soil = "unplowed";
        tile.watered = false;
        tile.lastTilledAt = 0;
        changed = true;
        continue;
      }
    }

    // If a stage timer has elapsed but the plant is still dry, keep a grace
    // period before applying penalties.
    if (tile.plant.stageIndex <= 2 && !tile.plant.stageWatered) {
      const seed = seedById(tile.plant.seedId);
      const stageDuration = stageDurationWithTile(
        seed,
        tile.plant.stageIndex,
        tile,
      );
      const elapsed = now - tile.plant.stageStartedAt;
      if (elapsed >= stageDuration) {
        const overdueMs = elapsed - stageDuration;
        const droughtGuard = seedTrait(seed, "droughtGuard");
        const animalGuard = tileAnimalTrait(tile, "droughtGuard");
        const graceMs = Math.max(
          OVERDUE_WATER_GRACE_MIN_MS,
          Math.round(
            stageDuration *
              (OVERDUE_WATER_GRACE_FACTOR + droughtGuard + animalGuard),
          ),
        );
        if (overdueMs >= graceMs) {
          // Missed watering is a setback, not a total wipe:
          // regress one stage and restart that stage timer.
          if (tile.plant.stageIndex >= 1) {
            tile.plant.stageIndex -= 1;
          }
          tile.plant.stageStartedAt = now;
          tile.plant.stageWatered = false;
          tile.watered = false;
          changed = true;
        }
      }
    }

    const progressed = advancePlant(tile.plant, now, tile);
    if (progressed) {
      tile.watered = tile.plant.stageWatered;
      changed = true;
    }
  }
  if (changed) state.updatedAt = now;
  return changed;
}

export function plowTile(tile, now) {
  const before = tile.soil;
  tile.soil = "plowed";
  tile.lastTilledAt = now;
  if (!tile.plant) tile.watered = false;
  return before !== tile.soil;
}

export function waterTile(tile, now) {
  if (tile.soil !== "plowed") return false;
  if (tile.plant && tile.plant.stageIndex >= 3) return false;
  tile.watered = true;
  if (!tile.plant) {
    // Empty plowed tiles still decay, but watering refreshes the 30-minute timer.
    tile.lastTilledAt = now;
  }
  if (tile.plant) {
    if (!tile.plant.stageWatered && tile.plant.stageIndex <= 2) {
      const seed = seedById(tile.plant.seedId);
      const duration = stageDurationWithTile(seed, tile.plant.stageIndex, tile);
      const elapsed = Math.max(0, now - tile.plant.stageStartedAt);
      // If watered after timer completion, add a 10% delay before advancing.
      if (elapsed >= duration) {
        const delayMs = Math.max(
          500,
          Math.round(duration * LATE_WATER_DELAY_FRACTION),
        );
        tile.plant.stageStartedAt = now - duration + delayMs;
      }
    }
    tile.plant.stageWatered = true;
    advancePlant(tile.plant, now, tile);
    tile.watered = tile.plant.stageWatered;
  }
  return true;
}

function ensureSeedDemandEntry(state, seedId, now) {
  if (!state.seedDemand || typeof state.seedDemand !== "object") {
    state.seedDemand = createInitialSeedDemand(now);
  }
  const resolvedSeedId = seedById(seedId).id;
  const existing = state.seedDemand[resolvedSeedId];
  if (!existing || typeof existing !== "object") {
    state.seedDemand[resolvedSeedId] = { level: 0, updatedAt: now };
  }
  const entry = state.seedDemand[resolvedSeedId];
  const elapsed = Math.max(0, now - Number(entry.updatedAt || now));
  entry.level = decaySeedDemandLevel(entry.level, elapsed, resolvedSeedId);
  entry.updatedAt = now;
  return entry;
}

export function plantTile(state, tile, seedId, now) {
  if (tile.soil !== "plowed" || tile.plant) return false;
  const seed = seedById(seedId);
  const seedCost = currentSeedCost(state, seed.id, now);
  if (seedCost > 0 && state.money < seedCost) return false;
  const upgrades = shardUpgradeEffects(state);
  if (seedCost > 0) {
    state.money -= seedCost;
    if (
      Math.random() <
      seedTrait(seed, "thrift") +
        tileAnimalTrait(tile, "thrift") +
        upgrades.thrift
    ) {
      state.money += seedCost;
    }
    const demandEntry = ensureSeedDemandEntry(state, seed.id, now);
    demandEntry.level += SEED_DEMAND_PER_PLANT;
  }

  tile.autoPlantSeedId = seed.id;
  tile.plant = {
    seedId: seed.id,
    stageIndex: 0,
    stageStartedAt: now,
    stageWatered: tile.watered,
    plantedAt: now,
    prestigeAtPlant: Math.max(0, Number(state.prestigeLevel || 0)),
  };
  advancePlant(tile.plant, now, tile);
  tile.watered = tile.plant.stageWatered;
  return true;
}

export function harvestTile(state, tile) {
  if (!tile.plant) return false;
  const stage = tile.plant.stageIndex;
  if (stage < 3) return false;
  const seed = seedById(tile.plant.seedId);
  tile.autoPlantSeedId = seed.id;
  const upgrades = shardUpgradeEffects(state);
  const isMature = stage === 3;
  let gain = stage >= 4 ? seed.oldValue : seed.matureValue;
  const matureBonus =
    seedTrait(seed, "matureBonus") +
    tileAnimalTrait(tile, "matureBonus") +
    upgrades.matureBonus;
  if (isMature && matureBonus > 0) {
    gain *= 1 + matureBonus;
  }
  const jackpot =
    seedTrait(seed, "jackpot") +
    tileAnimalTrait(tile, "jackpot") +
    upgrades.jackpot;
  if (Math.random() < jackpot) {
    gain *= 2;
  }
  const marketBonus = marketBonusForHarvest(state, tile, seed.id);
  if (marketBonus > 0) {
    gain *= 1 + marketBonus;
  }
  const eraYieldBonus = seedEraYieldBonus(state, seed.id);
  if (eraYieldBonus > 0) {
    gain *= 1 + eraYieldBonus;
  }
  gain *= 1 + Math.max(0, Number(state?.prestigeLevel || 0)) * 0.08;
  state.money += Math.max(1, Math.floor(gain));
  state.totalHarvests += 1;
  const regrowChance = clamp(
    seedTrait(seed, "regrow") +
      tileAnimalTrait(tile, "regrow") +
      upgrades.regrow,
    0,
    0.95,
  );
  if (isMature && Math.random() < regrowChance) {
    tile.plant = {
      seedId: seed.id,
      stageIndex: 1,
      stageStartedAt: Date.now(),
      stageWatered: false,
      plantedAt: Date.now(),
      prestigeAtPlant: Math.max(0, Number(state?.prestigeLevel || 0)),
    };
    tile.watered = false;
    return true;
  }
  tile.plant = null;
  tile.watered = false;
  tile.lastTilledAt = Date.now();
  return true;
}

function resolveAutoPlantSeedId(state, tile) {
  if (SEEDS.some((seed) => seed.id === tile?.autoPlantSeedId)) {
    return tile.autoPlantSeedId;
  }
  if (SEEDS.some((seed) => seed.id === tile?.plant?.seedId)) {
    return tile.plant.seedId;
  }
  if (SEEDS.some((seed) => seed.id === state?.selectedSeed)) {
    return state.selectedSeed;
  }
  return SEEDS[0].id;
}

export function runTileAutomation(state, now) {
  let changed = false;
  for (const tile of state.tiles) {
    if (tile.autoEverything) {
      if (tile.plant && tile.plant.stageIndex >= 3) {
        changed = harvestTile(state, tile) || changed;
      } else if (tile.plant) {
        if (!tile.plant.stageWatered) changed = waterTile(tile, now) || changed;
      } else {
        changed = plowTile(tile, now) || changed;
        if (!tile.watered) changed = waterTile(tile, now) || changed;
        const seedId = resolveAutoPlantSeedId(state, tile);
        changed = plantTile(state, tile, seedId, now) || changed;
      }
      continue;
    }

    if (tile.autoPlow && tile.soil !== "plowed") {
      changed = plowTile(tile, now) || changed;
    }
    if (tile.autoWater && tile.plant && tile.plant.stageIndex < 3) {
      changed = waterTile(tile, now) || changed;
    }
    if (tile.autoPlant && tile.soil === "plowed" && !tile.plant) {
      const seedId = resolveAutoPlantSeedId(state, tile);
      changed = plantTile(state, tile, seedId, now) || changed;
    }
    if (tile.autoHarvest && tile.plant && tile.plant.stageIndex >= 3) {
      changed = harvestTile(state, tile) || changed;
    }
  }
  return changed;
}

export function getBrushById(brushId) {
  return BRUSHES.find((b) => b.id === brushId) || BRUSHES[0];
}

export function autoKeyForTool(toolId) {
  if (toolId === "plow") return "autoPlow";
  if (toolId === "plant") return "autoPlant";
  if (toolId === "water") return "autoWater";
  return "autoHarvest";
}

function prestigeCostMultiplier(state) {
  const prestige = Math.max(0, Number(state?.prestigeLevel || 0));
  // Scale with every marketing level so inflation is visible early,
  // while still staying bounded for long sessions.
  return Math.min(4, 1 + prestige * 0.07);
}

export function automationCostForState(state, autoKey) {
  const base = Number(AUTOMATION_COSTS?.[autoKey] || 0);
  if (!Number.isFinite(base) || base <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(base * prestigeCostMultiplier(state)));
}

export function brushCostForState(state, brushId) {
  const base = Math.max(0, Number(getBrushById(brushId)?.cost || 0));
  if (base <= 0) return 0;
  return Math.max(1, Math.floor(base * prestigeCostMultiplier(state)));
}

function brushTierUnlocked(brushUnlocks, action, brushId) {
  const brush = BRUSHES.find((b) => b.id === brushId);
  if (!brush) return false;
  if (brush.cost <= 0) return true;
  let prevTierCost = -1;
  for (const candidate of BRUSHES) {
    if (candidate.cost < brush.cost && candidate.cost > prevTierCost) {
      prevTierCost = candidate.cost;
    }
  }
  if (prevTierCost < 0) return true;
  return BRUSHES.some(
    (candidate) =>
      candidate.cost === prevTierCost &&
      Boolean(brushUnlocks?.[action]?.[candidate.id]),
  );
}

export function isToolVisible(state, toolId) {
  if (!state?.discovered?.tools?.[toolId]) return false;
  if (toolId === "research") {
    return Number(state?.prestigeLevel || 0) >= RESEARCH_UNLOCK_MARKETING;
  }
  return true;
}

export function getBrushIndicesWithSize(originIndex, brushId, activeSize = GRID_SIZE) {
  const brush = getBrushById(brushId);
  const row = Math.floor(originIndex / GRID_SIZE);
  const col = originIndex % GRID_SIZE;
  const indices = [];
  for (let r = row; r < row + brush.height; r += 1) {
    if (r >= activeSize) continue;
    for (let c = col; c < col + brush.width; c += 1) {
      if (c >= activeSize) continue;
      indices.push(r * GRID_SIZE + c);
    }
  }
  return indices;
}

export function updateDiscoveries(state) {
  let changed = false;
  const threshold = 0.9;
  const money = Number(state.money || 0);
  const shardHighWater = Number(
    state.maxPrestigeShardsEver ?? state.prestigeShards ?? 0,
  );

  // Seeds unlock progressively by tier order.
  for (let i = 0; i < SEED_UNLOCK_ORDER.length; i += 1) {
    const seedId = SEED_UNLOCK_ORDER[i];
    const seed = seedById(seedId);
    if (seed.cost <= 0) continue;
    if (state.discovered.seeds[seedId]) continue;

    const prevSeedId = SEED_UNLOCK_ORDER[i - 1];
    const tierAboveUnlocked =
      i <= 0 ? true : Boolean(state.discovered.seeds[prevSeedId]);
    if (!tierAboveUnlocked) continue;

    if (money >= seed.cost * threshold) {
      state.discovered.seeds[seedId] = true;
      changed = true;
    }
  }

  // Core tool flow: plow -> plant -> water -> harvest.
  if (!state.discovered.tools.plow) {
    state.discovered.tools.plow = true;
    changed = true;
  }
  if (
    !state.discovered.tools.marketing &&
    (money >= MARKETING_UNLOCK_MONEY || Number(state.prestigeLevel || 0) > 0)
  ) {
    state.discovered.tools.marketing = true;
    changed = true;
  }
  if (!state.discovered.tools.expandFarm) {
    state.discovered.tools.expandFarm = true;
    changed = true;
  }
  if (
    !state.discovered.tools.research &&
    Number(state.prestigeLevel || 0) >= RESEARCH_UNLOCK_MARKETING
  ) {
    state.discovered.tools.research = true;
    changed = true;
  }
  const hasPlowedTile = state.tiles.some(
    (tile) => tile.soil === "plowed" || Boolean(tile.plant),
  );
  const hasPlant = state.tiles.some((tile) => Boolean(tile.plant));
  const hasWateredPlant = state.tiles.some(
    (tile) => tile.plant && tile.plant.stageWatered,
  );
  const hasHarvestable = state.tiles.some(
    (tile) => tile.plant && tile.plant.stageIndex >= 3,
  );
  if (hasPlowedTile && !state.discovered.tools.plant) {
    state.discovered.tools.plant = true;
    changed = true;
  }
  if (
    state.discovered.tools.plant &&
    hasPlant &&
    !state.discovered.tools.water
  ) {
    state.discovered.tools.water = true;
    changed = true;
  }
  if (
    state.discovered.tools.water &&
    (hasWateredPlant || hasHarvestable || state.totalHarvests > 0) &&
    !state.discovered.tools.harvest
  ) {
    state.discovered.tools.harvest = true;
    changed = true;
  }

  // Automation panels appear when close to cost (or once owned), then stay visible.
  for (const action of ACTION_TOOLS) {
    const autoKey = autoKeyForTool(action);
    const cost = automationCostForState(state, autoKey);
    const alreadyOwned = state.tiles.some(
      (tile) => Boolean(tile[autoKey]) || Boolean(tile.autoEverything),
    );
    if (
      (alreadyOwned || money >= cost * threshold) &&
      !state.discovered.automation?.[action]
    ) {
      state.discovered.automation[action] = true;
      changed = true;
    }
  }

  // Brush visibility unlocks progressively by tool + brush tier order.
  for (const action of ACTION_TOOLS) {
    for (let i = 0; i < BRUSHES.length; i += 1) {
      const brush = BRUSHES[i];
      if (brush.cost <= 0) continue;
      if (
        brush.width > state.activeFarmSize ||
        brush.height > state.activeFarmSize
      ) {
        continue;
      }
      if (state.discovered.brushes[action][brush.id]) continue;
      if (!brushTierUnlocked(state.brushUnlocks, action, brush.id)) continue;

      if (money >= brushCostForState(state, brush.id) * threshold) {
        state.discovered.brushes[action][brush.id] = true;
        changed = true;
      }
    }
  }

  // Animal visibility unlocks when shard progress is close and tier is current or next prestige.
  for (let i = 0; i < ANIMALS.length; i += 1) {
    const animal = ANIMALS[i];
    if (state.discovered.animals[animal.id]) continue;
    const reqPrestige = animalPrestigeRequirementByIndex(i);
    const tierCurrent = state.prestigeLevel >= reqPrestige;
    const tierNext = state.prestigeLevel + 1 >= reqPrestige;
    if (!tierCurrent && !tierNext) continue;
    if (shardHighWater >= animal.unlockShards * threshold) {
      state.discovered.animals[animal.id] = true;
      changed = true;
    }
  }

  if (
    !state.discovered.tools.animals &&
    state.prestigeLevel >= animalPrestigeRequirementByIndex(0)
  ) {
    state.discovered.tools.animals = true;
    changed = true;
  }

  if (state.selectedTool && !state.discovered.tools[state.selectedTool]) {
    const fallback =
      TOOLS.find((tool) => isToolVisible(state, tool.id))?.id || "plow";
    if (state.selectedTool !== fallback) {
      state.selectedTool = fallback;
      changed = true;
    }
  }

  return changed;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function stageProgressPercent(plant, seed, now, tile = null) {
  if (!plant || plant.stageIndex >= STAGES.length - 1) return 100;
  const duration = tile
    ? stageDurationWithTile(seed, plant.stageIndex, tile)
    : stageDurationMs(seed, plant.stageIndex);
  const elapsed = Math.max(0, now - plant.stageStartedAt);
  if (elapsed >= duration) return 100;
  const pct = (elapsed / duration) * 100;
  return Math.floor(clamp(pct, 0, 99));
}

export function prestigeShardGain(state) {
  const prestigeLevel = Math.max(0, Number(state.prestigeLevel || 0));
  const moneyPart = Math.floor(Math.sqrt(Math.max(0, state.money)) / 7);
  const harvestPart = Math.floor(Math.max(0, state.totalHarvests) / 8);
  const prestigePart = Math.floor(prestigeLevel / 2);
  const earlyMomentum = Math.max(1, Math.floor((prestigeLevel + 1) * 0.9));
  const baseGain = moneyPart + harvestPart + prestigePart + earlyMomentum;
  const lateMomentum =
    prestigeLevel >= 5 ? Math.floor((prestigeLevel - 4) * 1.35) : 0;
  const lateMultiplier =
    prestigeLevel >= 8 ? 1 + Math.min(0.45, (prestigeLevel - 7) * 0.03) : 1;
  return Math.max(5, Math.floor((baseGain + lateMomentum) * lateMultiplier));
}

export function prestigeMoneyCost(prestigeLevel) {
  const level = Math.max(0, Number(prestigeLevel || 0));
  return Math.max(
    PRESTIGE_BASE_MONEY,
    Math.floor(PRESTIGE_BASE_MONEY * Math.pow(PRESTIGE_COST_GROWTH, level)),
  );
}

export function cropName(seed) {
  if (!seed?.id) return "empty";
  const names = {
    basic: "grain",
    turnip: "turnip",
    berry: "berry",
    rose: "rose",
    tulip: "tulip",
    lavender: "lavender",
    pumpkin: "pumpkin",
    carrot: "carrot",
    corn: "corn",
    sunflower: "sunflower",
    lotus: "lotus",
    cacao: "cacao",
  };
  return names[seed.id] || seed.id;
}

export function stageCropLabelLines(plant, seed) {
  if (!plant) return ["empty"];
  const name = cropName(seed);
  if (plant.stageIndex === 0) return [name, "seed"];
  if (plant.stageIndex === 1) return ["baby", name];
  if (plant.stageIndex === 2) return ["growing", name];
  if (plant.stageIndex === 3) return ["mature", name];
  return ["withered", name];
}

export function blockerLabel(tile, seed, now) {
  if (!tile?.plant) {
    if (tile?.soil !== "plowed") return "needs plow";
    return "needs seed";
  }

  const stage = tile.plant.stageIndex;
  if (stage >= 3) return "harvest";

  if (!tile.plant.stageWatered) return "needs water";

  const duration = stageDurationWithTile(seed, stage, tile);
  const elapsed = Math.max(0, now - tile.plant.stageStartedAt);
  if (elapsed < duration) return "needs time";

  return "needs time";
}

export function splitNeedsLabel(label) {
  if (label.startsWith("needs ")) {
    return ["needs", label.slice(6)];
  }
  return [label];
}
