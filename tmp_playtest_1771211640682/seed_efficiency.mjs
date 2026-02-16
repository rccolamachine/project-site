import * as cfg from './config.js';
import * as eng from './engine.js';

function analyzeAtMarketing(level){
  const state = eng.createInitialState({ prestigeLevel: level, money: 1_000_000_000 });
  const rows = cfg.SEEDS.map(seed => {
    const cost = eng.currentSeedCost(state, seed.id, Date.now());
    const tile = { animals: [], plant: { seedId: seed.id, stageIndex: 0, stageStartedAt: 0, stageWatered: false, plantedAt: 0, prestigeAtPlant: level } };
    let cycleMs = 0;
    for (let i=0;i<=2;i+=1){ tile.plant.stageIndex = i; cycleMs += eng.stageDurationWithTile(seed, i, tile); }
    const mature = seed.matureValue * (1 + Math.max(0, level)*0.08) * (1 + eng.seedEraYieldBonus(state, seed.id));
    const profit = mature - cost;
    const ppm = profit / Math.max(1, cycleMs/60000);
    return { id: seed.id, cost: Math.floor(cost), cycleSec: Math.round(cycleMs/1000), mature: Math.floor(mature), profit: Math.floor(profit), ppm: Math.round(ppm)};
  }).sort((a,b)=>b.ppm-a.ppm);
  return { level, top: rows.slice(0,5), all: rows };
}

const levels = [0,1,3,5,8,12,16];
const out = levels.map(analyzeAtMarketing);
console.log(JSON.stringify(out, null, 2));
