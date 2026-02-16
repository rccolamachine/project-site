export const STARTING_MONEY = 52;

export const STAGES = [
  { id: "planted", label: "Planted Seed", durationMs: 8 * 1000 },
  { id: "seedling", label: "Seedling", durationMs: 28 * 1000 },
  { id: "young", label: "Young Plant", durationMs: 2 * 60 * 1000 },
  { id: "mature", label: "Mature Plant", durationMs: 6.4 * 60 * 1000 },
  { id: "old", label: "Old Plant", durationMs: 17 * 60 * 1000 },
];

export const SEED_PRICE_CURVES = {
  basic: {
    preferredMarketingMin: 0,
    preferredMarketingMax: 0,
    inBandMultiplier: 1,
    inBandYieldBonus: 0,
    earlySlope: 0,
    lateSlope: 0.1,
    minMultiplier: 1,
    maxMultiplier: 2.8,
    demandGrowthBase: 1.15,
    demandHalfLifeMs: 2.1 * 60 * 1000,
    demandMaxMultiplier: 3,
  },
  turnip: {
    preferredMarketingMin: 0,
    preferredMarketingMax: 3,
    inBandMultiplier: 0.42,
    inBandYieldBonus: 0.3,
    earlySlope: 0.015,
    lateSlope: 0.075,
    minMultiplier: 0.42,
    maxMultiplier: 3,
    demandGrowthBase: 1.018,
    demandHalfLifeMs: 2.2 * 60 * 1000,
    demandMaxMultiplier: 4.5,
  },
  carrot: {
    preferredMarketingMin: 1,
    preferredMarketingMax: 4,
    inBandMultiplier: 0.48,
    inBandYieldBonus: 0.32,
    earlySlope: 0.02,
    lateSlope: 0.072,
    minMultiplier: 0.47,
    maxMultiplier: 3.2,
    demandGrowthBase: 1.02,
    demandHalfLifeMs: 2.4 * 60 * 1000,
    demandMaxMultiplier: 4.8,
  },
  rose: {
    preferredMarketingMin: 2,
    preferredMarketingMax: 5,
    inBandMultiplier: 0.56,
    inBandYieldBonus: 0.28,
    earlySlope: 0.03,
    lateSlope: 0.07,
    minMultiplier: 0.52,
    maxMultiplier: 3.25,
    demandGrowthBase: 1.024,
    demandHalfLifeMs: 2.6 * 60 * 1000,
    demandMaxMultiplier: 5,
  },
  tulip: {
    preferredMarketingMin: 3,
    preferredMarketingMax: 6,
    inBandMultiplier: 0.62,
    inBandYieldBonus: 0.25,
    earlySlope: 0.035,
    lateSlope: 0.07,
    minMultiplier: 0.58,
    maxMultiplier: 3.4,
    demandGrowthBase: 1.028,
    demandHalfLifeMs: 2.9 * 60 * 1000,
    demandMaxMultiplier: 5.4,
  },
  berry: {
    preferredMarketingMin: 4,
    preferredMarketingMax: 7,
    inBandMultiplier: 0.74,
    inBandYieldBonus: 0.15,
    earlySlope: 0.07,
    lateSlope: 0.072,
    minMultiplier: 0.76,
    maxMultiplier: 3.7,
    demandGrowthBase: 1.075,
    demandHalfLifeMs: 3.6 * 60 * 1000,
    demandMaxMultiplier: 5.8,
  },
  lavender: {
    preferredMarketingMin: 5,
    preferredMarketingMax: 7,
    inBandMultiplier: 0.82,
    inBandYieldBonus: 0.12,
    earlySlope: 0.08,
    lateSlope: 0.074,
    minMultiplier: 0.78,
    maxMultiplier: 3.9,
    demandGrowthBase: 1.07,
    demandHalfLifeMs: 3.9 * 60 * 1000,
    demandMaxMultiplier: 6.1,
  },
  corn: {
    preferredMarketingMin: 6,
    preferredMarketingMax: 8,
    inBandMultiplier: 0.82,
    inBandYieldBonus: 0.12,
    earlySlope: 0.09,
    lateSlope: 0.075,
    minMultiplier: 0.77,
    maxMultiplier: 4,
    demandGrowthBase: 1.065,
    demandHalfLifeMs: 4.2 * 60 * 1000,
    demandMaxMultiplier: 6.4,
  },
  sunflower: {
    preferredMarketingMin: 7,
    preferredMarketingMax: 9,
    inBandMultiplier: 0.8,
    inBandYieldBonus: 0.12,
    earlySlope: 0.1,
    lateSlope: 0.075,
    minMultiplier: 0.75,
    maxMultiplier: 4.2,
    demandGrowthBase: 1.06,
    demandHalfLifeMs: 4.5 * 60 * 1000,
    demandMaxMultiplier: 6.8,
  },
  pumpkin: {
    preferredMarketingMin: 8,
    preferredMarketingMax: 11,
    inBandMultiplier: 0.78,
    inBandYieldBonus: 0.14,
    earlySlope: 0.11,
    lateSlope: 0.07,
    minMultiplier: 0.73,
    maxMultiplier: 4.5,
    demandGrowthBase: 1.055,
    demandHalfLifeMs: 4.9 * 60 * 1000,
    demandMaxMultiplier: 7.3,
  },
  lotus: {
    preferredMarketingMin: 10,
    preferredMarketingMax: 13,
    inBandMultiplier: 0.76,
    inBandYieldBonus: 0.16,
    earlySlope: 0.12,
    lateSlope: 0.068,
    minMultiplier: 0.7,
    maxMultiplier: 4.9,
    demandGrowthBase: 1.05,
    demandHalfLifeMs: 5.4 * 60 * 1000,
    demandMaxMultiplier: 8,
  },
  cacao: {
    preferredMarketingMin: 12,
    preferredMarketingMax: 16,
    inBandMultiplier: 0.74,
    inBandYieldBonus: 0.18,
    earlySlope: 0.13,
    lateSlope: 0.064,
    minMultiplier: 0.68,
    maxMultiplier: 5.4,
    demandGrowthBase: 1.045,
    demandHalfLifeMs: 6.2 * 60 * 1000,
    demandMaxMultiplier: 9,
  },
};

export const AUTOMATION_COSTS = {
  autoPlow: 720,
  autoWater: 1100,
  autoPlant: 1700,
  autoHarvest: 2600,
  autoEverything: 11000,
};

export const SOIL_DECAY_MS = 30 * 60 * 1000;
export const SEED_DEMAND_GROWTH_BASE = 1.03;
export const SEED_DEMAND_HALF_LIFE_MS = 2 * 60 * 1000;
export const SEED_DEMAND_PER_PLANT = 0.3;
export const SEED_DEMAND_MAX_MULTIPLIER = 6.2;
export const OVERDUE_WATER_GRACE_FACTOR = 4.1;
export const OVERDUE_WATER_GRACE_MIN_MS = 80 * 1000;
export const LATE_WATER_DELAY_FRACTION = 0.08;
export const OLD_UNHARVESTED_GRACE_FACTOR = 24;
export const OLD_UNHARVESTED_GRACE_MIN_MS = 6 * 60 * 60 * 1000;
export const PRESTIGE_BASE_MONEY = 700;
export const PRESTIGE_COST_GROWTH = 1.2;
export const MARKETING_UNLOCK_MONEY = 700;
export const RESEARCH_UNLOCK_MARKETING = 2;
export const PRESTIGE_START_MONEY_PER_LEVEL = 56;
export const PRESTIGE_GROWTH_SPEED_PER_LEVEL = 0.07;
export const PRESTIGE_MAX_GROWTH_SPEED = 0.72;
export const MARKET_ROTATION_MS = 5 * 60 * 1000;
