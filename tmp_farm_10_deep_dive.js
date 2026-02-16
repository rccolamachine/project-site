
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { execSync } = require("child_process");

const CHECKPOINTS = [1,2,5,10,20,30,60,120,180,240,300];
const TOTAL_MS = 300 * 60 * 1000;
const TICK_MS = 2000;

const PROFILES = [
  { id:"speed1", style:"speed", decisionMs:2500, actions:90, pMin:2.5, pBuf:1.02 },
  { id:"speed2", style:"speed", decisionMs:3200, actions:55, pMin:3.2, pBuf:1.05 },
  { id:"explore1", style:"explore", decisionMs:4200, actions:75, pMin:7, pBuf:1.2 },
  { id:"explore2", style:"qa", decisionMs:5000, actions:60, pMin:9, pBuf:1.3 },
  { id:"dopamine1", style:"dopamine", decisionMs:2800, actions:90, pMin:4.5, pBuf:1.1 },
  { id:"dopamine2", style:"dopamine", decisionMs:3600, actions:45, pMin:6, pBuf:1.15 },
  { id:"idle1", style:"idle", decisionMs:7000, actions:25, pMin:12, pBuf:1.35 },
  { id:"casual1", style:"casual", decisionMs:9000, actions:18, pMin:15, pBuf:1.45 },
  { id:"analysis1", style:"analysis", decisionMs:4600, actions:58, pMin:8, pBuf:1.2 },
  { id:"stress1", style:"stress", decisionMs:5200, actions:50, pMin:10, pBuf:1.35 },
];

const TUNING_PACK = {
  stage: { seedling:60, young:4, mature:10, old:24 },
  economy: { prestigeGrowth:1.24, prestigeStartMoney:44, demandPerPlant:0.36, demandHalfLifeMin:2.2 },
  automation: { plow:900, water:1350, plant:2050, harvest:3200, everything:14500 },
  market: { rotationMin:6, base:[0.4,0.43,0.37,0.42,0.5], synergy:[0.16,0.18,0.16,0.18,0.2] },
  farm: { s4:5, s5:16, s7:44, s8:96, s9:235, s10:560 },
  milestones: { p6:60, p7:75, p8:105, p9:145, p10:440, p12:840 },
};

function rng(seed){ let t = seed >>> 0; return ()=>{ t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function hash(s){ let h=2166136261; const v=String(s||""); for(let i=0;i<v.length;i++){ h ^= v.charCodeAt(i); h = Math.imul(h,16777619);} return h>>>0; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function countTrue(obj){ return Object.values(obj||{}).filter(Boolean).length; }
function visible(state,cfg){ const out=[]; const size=clamp(Number(state.activeFarmSize||3),3,cfg.GRID_SIZE); for(let r=0;r<size;r++) for(let c=0;c<size;c++) out.push(r*cfg.GRID_SIZE+c); return out; }

function tuneConfigText(text){
  let t = String(text);
  t = t.replace('{ id: "seedling", label: "Seedling", durationMs: 75 * 1000 },','{ id: "seedling", label: "Seedling", durationMs: 60 * 1000 },');
  t = t.replace('{ id: "young", label: "Young Plant", durationMs: 5 * 60 * 1000 },','{ id: "young", label: "Young Plant", durationMs: 4 * 60 * 1000 },');
  t = t.replace('{ id: "mature", label: "Mature Plant", durationMs: 12 * 60 * 1000 },','{ id: "mature", label: "Mature Plant", durationMs: 10 * 60 * 1000 },');
  t = t.replace('{ id: "old", label: "Old Plant", durationMs: 30 * 60 * 1000 },','{ id: "old", label: "Old Plant", durationMs: 24 * 60 * 1000 },');
  t = t.replace('export const SEED_DEMAND_HALF_LIFE_MS = 2.75 * 60 * 1000;','export const SEED_DEMAND_HALF_LIFE_MS = 2.2 * 60 * 1000;');
  t = t.replace('export const SEED_DEMAND_PER_PLANT = 0.45;','export const SEED_DEMAND_PER_PLANT = 0.36;');
  t = t.replace('export const PRESTIGE_COST_GROWTH = 1.3;','export const PRESTIGE_COST_GROWTH = 1.24;');
  t = t.replace('export const PRESTIGE_START_MONEY_PER_LEVEL = 30;','export const PRESTIGE_START_MONEY_PER_LEVEL = 44;');
  t = t.replace('  autoPlow: 1100,','  autoPlow: 900,');
  t = t.replace('  autoWater: 1700,','  autoWater: 1350,');
  t = t.replace('  autoPlant: 2600,','  autoPlant: 2050,');
  t = t.replace('  autoHarvest: 4200,','  autoHarvest: 3200,');
  t = t.replace('  autoEverything: 17500,','  autoEverything: 14500,');
  t = t.replace('export const MARKET_ROTATION_MS = 8 * 60 * 1000;','export const MARKET_ROTATION_MS = 6 * 60 * 1000;');
  t = t.replace('    baseBonus: 0.36,','    baseBonus: 0.4,').replace('    baseBonus: 0.39,','    baseBonus: 0.43,').replace('    baseBonus: 0.32,','    baseBonus: 0.37,').replace('    baseBonus: 0.38,','    baseBonus: 0.42,').replace('    baseBonus: 0.45,','    baseBonus: 0.5,');
  t = t.replace('    synergyBonus: 0.14,','    synergyBonus: 0.16,').replace('    synergyBonus: 0.16,','    synergyBonus: 0.18,').replace('    synergyBonus: 0.18,','    synergyBonus: 0.2,');
  t = t.replace('  { size: 4, reqPrestige: 1, unlockShards: 6 },','  { size: 4, reqPrestige: 1, unlockShards: 5 },');
  t = t.replace('  { size: 5, reqPrestige: 2, unlockShards: 20 },','  { size: 5, reqPrestige: 2, unlockShards: 16 },');
  t = t.replace('  { size: 7, reqPrestige: 3, unlockShards: 55 },','  { size: 7, reqPrestige: 3, unlockShards: 44 },');
  t = t.replace('  { size: 8, reqPrestige: 4, unlockShards: 120 },','  { size: 8, reqPrestige: 4, unlockShards: 96 },');
  t = t.replace('  { size: 9, reqPrestige: 5, unlockShards: 300 },','  { size: 9, reqPrestige: 5, unlockShards: 235 },');
  t = t.replace('  { size: 10, reqPrestige: 6, unlockShards: 700 },','  { size: 10, reqPrestige: 6, unlockShards: 560 },');
  t = t.replace('    rewardShards: 36,','    rewardShards: 60,').replace('    rewardShards: 50,','    rewardShards: 75,').replace('    rewardShards: 70,','    rewardShards: 105,').replace('    rewardShards: 95,','    rewardShards: 145,').replace('    rewardShards: 350,','    rewardShards: 440,').replace('    rewardShards: 700,','    rewardShards: 840,');
  return t;
}

async function loadModules(configText){
  const root = process.cwd();
  const dir = path.join(root,'.tmp_farm_sim',`${Date.now()}_${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir,{recursive:true});
  const cfgPath = path.join(dir,'config.mjs');
  const engPath = path.join(dir,'engine.mjs');
  fs.writeFileSync(cfgPath, configText, 'utf8');
  const engSrc = fs.readFileSync(path.join(root,'lib/farm/engine.js'),'utf8').replace('from "./config";','from "./config.mjs";');
  fs.writeFileSync(engPath, engSrc, 'utf8');
  const [engine, config] = await Promise.all([
    import(`${pathToFileURL(engPath).href}?v=${Math.random()}`),
    import(`${pathToFileURL(cfgPath).href}?v=${Math.random()}`),
  ]);
  return { engine, config, cleanup:()=>{ try{ fs.rmSync(dir,{recursive:true,force:true}); }catch{} } };
}
function mkInterval(){ return {earn:0,harv:0,jack:0,reg:0,bonus:0,spend:0,unlock:0,prest:0,exp:0,upg:0,auto:0,animal:0,active:0,idle:0}; }
function unlockTotal(s){
  const b=s?.discovered?.brushes||{};
  return countTrue(s?.discovered?.seeds||{})+countTrue(s?.discovered?.tools||{})+countTrue(s?.discovered?.animals||{})+countTrue(s?.discovered?.automation||{})+countTrue(b.plow||{})+countTrue(b.water||{})+countTrue(b.plant||{})+countTrue(b.harvest||{});
}
function setSink(ctx){
  ctx.state.__runtimeEventSink = (e)=>{
    if(!e||typeof e!=="object") return;
    if(e.kind==="earning"){
      const a=Math.max(0,Number(e.amount||0)), c=Math.max(1,Number(e.count||1));
      ctx.stats.earn += a; ctx.stats.harv += c; ctx.i.earn += a; ctx.i.harv += c; ctx.tick=true;
      if(e.seedId){ const id=String(e.seedId); ctx.stats.seedEarn[id]=(ctx.stats.seedEarn[id]||0)+a; }
    }else if(e.kind==="bonus"){
      const src=String(e.source||"bonus"), c=Math.max(1,Number(e.count||1));
      ctx.stats.bonus[src]=(ctx.stats.bonus[src]||0)+c; ctx.i.bonus += c; ctx.tick=true;
      if(src==="jackpot"){ ctx.stats.jack += c; ctx.i.jack += c; }
      if(src==="regrow"){ ctx.stats.reg += c; ctx.i.reg += c; }
    }else if(e.kind==="spend"){
      ctx.i.spend += Math.max(0,Number(e.amount||0));
    }
  };
}
function chooseSeed(ctx,tile){
  const seeds = ctx.cfg.SEEDS.filter(s=>ctx.state.discovered?.seeds?.[s.id]);
  if(!seeds.length) return 'basic';
  if(ctx.p.style==='explore'){
    const af = seeds.filter(s=>ctx.eng.currentSeedCost(ctx.state,s.id,ctx.now)<=ctx.state.money);
    const z=(af.length?af:seeds).sort((a,b)=>(ctx.stats.seedPlant[a.id]||0)-(ctx.stats.seedPlant[b.id]||0));
    return z[0].id;
  }
  const fx = ctx.eng.shardUpgradeEffects(ctx.state);
  const season = ctx.eng.currentMarketSeason(ctx.now);
  let best='basic',score=-1e99;
  for(const s of seeds){
    const cost=ctx.eng.currentSeedCost(ctx.state,s.id,ctx.now);
    if(cost>ctx.state.money && s.id!=='basic') continue;
    let v=s.matureValue;
    v*=1+(Number(s?.traits?.matureBonus||0)+fx.matureBonus);
    v*=1+(Number(s?.traits?.jackpot||0)+fx.jackpot);
    v*=1+ctx.eng.seedEraYieldBonus(ctx.state,s.id);
    v*=1+Math.max(0,Number(ctx.state.prestigeLevel||0))*0.08;
    if(season.categories.includes(ctx.eng.cropCategory(s.id))){
      v*=1+season.baseBonus+fx.marketBonus*0.75;
      if(tile && season.synergyAnimal && ctx.eng.tileAnimalIds(tile).includes(season.synergyAnimal)) v*=1+season.synergyBonus;
    }
    const d={animals:[],plant:{seedId:s.id,stageIndex:0,stageStartedAt:0,stageWatered:true,plantedAt:0,prestigeAtPlant:Math.max(0,Number(ctx.state.prestigeLevel||0))}};
    let cycle=0; for(let st=0;st<=2;st++){ d.plant.stageIndex=st; cycle += ctx.eng.stageDurationWithTile(s,st,d); }
    let sc=(v-cost)/Math.max(1,cycle);
    if(ctx.p.style==='speed') sc += (Number(s?.traits?.quick||0))*0.006;
    if(ctx.p.style==='dopamine') sc += (Number(s?.traits?.jackpot||0))*0.009 + (Number(s?.traits?.regrow||0))*0.007;
    if(ctx.p.style==='idle') sc += (Number(s?.traits?.droughtGuard||0))*0.005 + (Number(s?.traits?.thrift||0))*0.003;
    if(sc>score){score=sc; best=s.id;}
  }
  return best;
}
function buyUpg(ctx,id){
  const u=ctx.eng.shardUpgradeById(id); if(!u) return false;
  if(!ctx.eng.canBuyShardUpgrade(ctx.state,id)) return false;
  const lvl=ctx.eng.shardUpgradeLevel(ctx.state,id); if(lvl>=u.cap) return false;
  const c=ctx.eng.shardUpgradeCost(id,lvl); if(ctx.state.prestigeShards<c) return false;
  ctx.state.prestigeShards -= c; ctx.state.shardUpgrades[id]=lvl+1; ctx.stats.upg[id]=(ctx.stats.upg[id]||0)+1; ctx.i.upg++; ctx.tick=true; return true;
}
function runDecision(ctx){
  const beforeUnlock = unlockTotal(ctx.state);
  const req = ctx.eng.prestigeMoneyCost(ctx.state.prestigeLevel);
  if(ctx.state.money >= req*ctx.p.pBuf && ctx.now-ctx.lastPrest>=ctx.p.pMin*60000){
    const g=ctx.eng.prestigeShardGain(ctx.state), prev=ctx.state;
    const next=ctx.eng.createInitialState({ prestigeLevel:(prev.prestigeLevel||0)+1, prestigeShards:(prev.prestigeShards||0)+g, maxPrestigeShardsEver:Math.max(Number(prev.maxPrestigeShardsEver||0),Number((prev.prestigeShards||0)+g)), selectedTool:prev.selectedTool||'plow', selectedSeed:prev.selectedSeed||'basic', brushUnlocks:{plow:{...(prev.brushUnlocks?.plow||{})},water:{...(prev.brushUnlocks?.water||{})},plant:{...(prev.brushUnlocks?.plant||{})},harvest:{...(prev.brushUnlocks?.harvest||{})}}, selectedBrushes:{...(prev.selectedBrushes||{})}, discovered:{seeds:{...(prev.discovered?.seeds||{})},tools:{...(prev.discovered?.tools||{})},animals:{...(prev.discovered?.animals||{})},automation:{...(prev.discovered?.automation||{})},brushes:{plow:{...(prev.discovered?.brushes?.plow||{})},water:{...(prev.discovered?.brushes?.water||{})},plant:{...(prev.discovered?.brushes?.plant||{})},harvest:{...(prev.discovered?.brushes?.harvest||{})}}}, farmSizeUnlocks:{...(prev.farmSizeUnlocks||{})}, activeFarmSize:Number(prev.activeFarmSize||3), shardUpgrades:{...(prev.shardUpgrades||{})}, milestonesClaimed:{...(prev.milestonesClaimed||{})}, marketSeasonIndex:Number(prev.marketSeasonIndex||0), marketSeasonStartedAt:Number(prev.marketSeasonStartedAt||ctx.now), animalClearUnlocked:Boolean(prev.animalClearUnlocked), animalOwned:{...(prev.animalOwned||{})}, selectedAnimal:prev.selectedAnimal||ctx.cfg.ANIMALS[0].id });
    next.tiles = next.tiles.map((t,i)=>({...t, animals: ctx.eng.tileAnimalIds(prev.tiles?.[i]).slice(0,ctx.cfg.MAX_ANIMALS_PER_TILE)}));
    next.discovered.tools.animals = next.prestigeLevel >= ctx.eng.animalPrestigeRequirementByIndex(0);
    if(!next.discovered.tools[next.selectedTool]) next.selectedTool='plow';
    ctx.eng.applyPrestigeMilestones(next);
    ctx.state = next; setSink(ctx); ctx.stats.prest++; ctx.i.prest++; ctx.tick=true; ctx.lastPrest=ctx.now; if(ctx.state.prestigeLevel>ctx.stats.maxM){ctx.stats.maxM=ctx.state.prestigeLevel; ctx.stats.maxMAt=(ctx.now-ctx.start)/60000;}
  }
  const upOrder = ctx.p.style==='dopamine' ? ['luck_lab','regrow_lab','harvest_lab','market_lab','seed_lab'] : ['harvest_lab','seed_lab','market_lab','luck_lab','regrow_lab'];
  for(let k=0;k<2;k++) for(const id of upOrder){ if(buyUpg(ctx,id)) break; }

  for(const exp of ctx.cfg.FARM_EXPANSIONS){
    if(exp.size<=3 || ctx.state.farmSizeUnlocks?.[exp.size]) continue;
    const idx=ctx.cfg.FARM_EXPANSIONS.findIndex(x=>x.size===exp.size), prevOk= idx<=0 ? true : Boolean(ctx.state.farmSizeUnlocks?.[ctx.cfg.FARM_EXPANSIONS[idx-1].size]);
    if(!prevOk || ctx.state.prestigeLevel<exp.reqPrestige || ctx.state.prestigeShards<exp.unlockShards) continue;
    ctx.state.prestigeShards -= exp.unlockShards; ctx.state.farmSizeUnlocks[exp.size]=true; ctx.state.activeFarmSize=Math.max(Number(ctx.state.activeFarmSize||3),exp.size); ctx.stats.exp.add(exp.size); ctx.i.exp++; ctx.tick=true;
  }

  const autoOrder = ctx.p.style==='speed' || ctx.p.style==='dopamine' ? ['autoHarvest','autoPlant','autoWater','autoPlow'] : ['autoPlow','autoWater','autoPlant','autoHarvest'];
  for(const key of autoOrder){
    const unit=ctx.eng.automationCostForState(ctx.state,key); if(!Number.isFinite(unit)||unit<=0||ctx.state.money<unit) continue;
    const ids=visible(ctx.state,ctx.cfg); const miss=ids.filter(i=>{const t=ctx.state.tiles[i]; return t && !t[key] && !t.autoEverything;});
    const bulk = (ctx.p.style==='speed'||ctx.p.style==='idle'||ctx.p.style==='dopamine') && ctx.state.money>=miss.length*unit*0.85;
    if(bulk && miss.length){ ctx.state.money -= miss.length*unit; for(const i of miss) ctx.state.tiles[i][key]=true; ctx.i.auto += miss.length; ctx.tick=true; continue; }
    for(const i of ids){ const t=ctx.state.tiles[i]; if(!t||t[key]||t.autoEverything) continue; if(ctx.state.money<unit) break; ctx.state.money -= unit; t[key]=true; ctx.i.auto++; ctx.tick=true; break; }
  }

  if(ctx.state.prestigeLevel >= ctx.eng.animalPrestigeRequirementByIndex(0)){
    const season=ctx.eng.currentMarketSeason(ctx.now);
    const orders={ speed:['chicken','cow','rabbit','alpaca','firefly','pig','goat','duck','bee','fox'], dopamine:['bee','fox','firefly','rabbit','cow','alpaca','chicken','pig','goat','duck'], idle:['duck','pig','goat','cow','rabbit','chicken','alpaca','bee','fox','firefly'], explore:ctx.cfg.ANIMALS.map(a=>a.id), qa:ctx.cfg.ANIMALS.map(a=>a.id), casual:['chicken','cow','bee','rabbit'], analysis:['chicken','cow','bee','rabbit','goat'], stress:['duck','pig','goat','chicken','cow','rabbit'] };
    const base=orders[ctx.p.style]||orders.analysis, ord = season?.synergyAnimal ? [season.synergyAnimal,...base.filter(x=>x!==season.synergyAnimal)] : base;
    let placed=0; const ids=visible(ctx.state,ctx.cfg).slice(0,25);
    for(const aId of ord){ if(placed>=8) break; const reqP=ctx.eng.animalPrestigeRequirement(aId); if(!Number.isFinite(reqP)||ctx.state.prestigeLevel<reqP) continue;
      for(const i of ids){ if(placed>=8) break; const tile=ctx.state.tiles[i]; if(!tile||ctx.eng.tileAnimalIds(tile).length>=ctx.cfg.MAX_ANIMALS_PER_TILE) continue;
        const has=ctx.eng.tileAnimalIds(tile).includes(aId); if(ctx.p.style!=='explore'&&ctx.p.style!=='qa'&&has) continue;
        const own=Math.max(0,Number(ctx.state.animalOwned?.[aId]||0)); const cap=ctx.eng.animalMaxOwnedForPrestige(ctx.state.prestigeLevel,aId); const placedCount=ctx.eng.countPlacedAnimals(ctx.state.tiles,aId);
        if(placedCount>=own){ if(Number.isFinite(cap)&&own>=cap) continue; const animal=ctx.eng.animalById(aId); if(!animal||ctx.state.prestigeShards<animal.unlockShards) continue; ctx.state.prestigeShards-=animal.unlockShards; ctx.state.animalOwned[aId]=own+1; ctx.stats.animalBuy[aId]=(ctx.stats.animalBuy[aId]||0)+1; ctx.i.animal++; }
        tile.animals=[...ctx.eng.tileAnimalIds(tile),aId].slice(0,ctx.cfg.MAX_ANIMALS_PER_TILE); ctx.stats.animalPlace[aId]=(ctx.stats.animalPlace[aId]||0)+1; ctx.stats.animals.add(aId); placed++; ctx.tick=true;
      }
    }
    const elapsedMin = (ctx.now - ctx.start) / 60000;
    if((ctx.p.style==='explore' || ctx.p.style==='qa') && elapsedMin > 130){
      const targetIdx = ids[0];
      const target = Number.isFinite(targetIdx) ? ctx.state.tiles[targetIdx] : null;
      if(target){
        for(const animal of ctx.cfg.ANIMALS){
          const aId = animal.id;
          if(ctx.stats.animals.has(aId)) continue;
          const reqP = ctx.eng.animalPrestigeRequirement(aId);
          if(!Number.isFinite(reqP) || ctx.state.prestigeLevel < reqP) continue;
          const own = Math.max(0, Number(ctx.state.animalOwned?.[aId] || 0));
          const cap = ctx.eng.animalMaxOwnedForPrestige(ctx.state.prestigeLevel, aId);
          const placedCount = ctx.eng.countPlacedAnimals(ctx.state.tiles, aId);
          if(placedCount >= own){
            if(Number.isFinite(cap) && own >= cap) continue;
            if(ctx.state.prestigeShards < animal.unlockShards) continue;
            ctx.state.prestigeShards -= animal.unlockShards;
            ctx.state.animalOwned[aId] = own + 1;
            ctx.stats.animalBuy[aId] = (ctx.stats.animalBuy[aId] || 0) + 1;
            ctx.i.animal++;
          }
          target.animals = [aId];
          ctx.stats.animalPlace[aId] = (ctx.stats.animalPlace[aId] || 0) + 1;
          ctx.stats.animals.add(aId);
          ctx.tick = true;
        }
      }
    }
  }

  let budget=ctx.p.actions; const ids=visible(ctx.state,ctx.cfg);
  for(let i=ids.length-1;i>0;i--){ const j=Math.floor(ctx.rand()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
  const doA=(fn)=>{ if(budget<=0) return false; const ok=fn(); if(ok){budget--; ctx.tick=true;} return ok; };
  for(const i of ids){ if(budget<=0) break; const t=ctx.state.tiles[i]; if(t?.plant?.stageIndex>=3) doA(()=>ctx.eng.harvestTile(ctx.state,t)); }
  for(const i of ids){ if(budget<=0) break; const t=ctx.state.tiles[i]; if(!t?.plant) continue; if(t.plant.stageIndex<3 && !t.plant.stageWatered){ if(ctx.p.style==='stress'&&ctx.rand()<0.38) continue; if(ctx.p.style==='casual'&&ctx.rand()<0.12) continue; doA(()=>ctx.eng.waterTile(t,ctx.now)); } }
  for(const i of ids){ if(budget<=0) break; const t=ctx.state.tiles[i]; if(t && t.soil!=='plowed') doA(()=>ctx.eng.plowTile(t,ctx.now)); }
  for(const i of ids){ if(budget<=0) break; const t=ctx.state.tiles[i]; if(!t||t.soil!=='plowed'||t.plant) continue; doA(()=>ctx.eng.waterTile(t,ctx.now)); const seed=chooseSeed(ctx,t); doA(()=>{ const ok=ctx.eng.plantTile(ctx.state,t,seed,ctx.now); if(ok){ ctx.stats.seedPlant[seed]=(ctx.stats.seedPlant[seed]||0)+1; ctx.stats.seeds.add(seed); } return ok; }); }

  ctx.eng.updateDiscoveries(ctx.state); ctx.eng.applyPrestigeMilestones(ctx.state); ctx.state.maxPrestigeShardsEver=Math.max(Number(ctx.state.maxPrestigeShardsEver||0),Number(ctx.state.prestigeShards||0));
  const afterUnlock=unlockTotal(ctx.state); if(afterUnlock>beforeUnlock){ ctx.i.unlock += (afterUnlock-beforeUnlock); ctx.stats.unlock += (afterUnlock-beforeUnlock); ctx.tick=true; }
}
function hook(i){
  const dur=Math.max(1,i.active+i.idle), act=clamp(i.active/dur,0,1), money=clamp(Math.log10(1+i.earn)/4.6,0,1), nov=clamp(i.unlock/5,0,1), prog=clamp((i.prest*1.9+i.exp*1.2+i.upg*0.8+i.animal*0.65)/6,0,1), thrill=clamp((i.jack*0.7+i.reg*0.5+i.bonus*0.08)/8,0,1), drag=clamp(i.idle/dur,0,1);
  return clamp(Number((10*(0.24*money+0.2*nov+0.22*prog+0.16*thrill+0.18*act)-drag*1.7).toFixed(2)),0,10);
}
function reasons(i,state){
  const keep=[], quit=[];
  if(i.jack>0) keep.push('jackpot spikes');
  if(i.reg>0) keep.push('regrow chain moments');
  if(i.prest>0) keep.push('Marketing reset + shard burst');
  if(i.unlock>=3) keep.push('new unlock cadence');
  if(i.auto>0) keep.push('automation compounding');
  if(i.earn>15000) keep.push('strong cash acceleration');
  if(i.idle>i.active*1.25) quit.push('idle stretches with low interaction');
  if(i.unlock===0&&i.prest===0&&i.jack===0&&i.earn<4000) quit.push('progression stall between unlocks');
  if(i.spend>i.earn*1.35) quit.push('cost pressure feels grindy');
  if(state.money<120&&i.earn<500) quit.push('cash starvation limits choices');
  return { keep:keep.slice(0,3), quit:quit.slice(0,3) };
}

async function runProfile(mod, p, variant, seedBase){
  const {engine:eng, config:cfg} = mod;
  const seed = hash(`${variant}:${p.id}:${seedBase}`), rand = rng(seed);
  const ctx = { eng, cfg, p, rand, start: Date.UTC(2026,0,1,12,0,0)+(seed%1000)*60000, now:0, state:null, lastPrest:0, tick:false, i:mkInterval(), stats:{profile:p.id, style:p.style, seeds:new Set(), animals:new Set(), seedPlant:{}, seedEarn:{}, animalPlace:{}, animalBuy:{}, upg:{}, exp:new Set(), bonus:{}, earn:0, harv:0, jack:0, reg:0, prest:0, unlock:0, maxM:0, maxMAt:0, checkpoints:[]}};
  const realNow = Date.now, realRand = Math.random;
  let simNow = ctx.start;
  try{
    Date.now=()=>simNow; Math.random=()=>rand();
    ctx.state=eng.createInitialState(); setSink(ctx); eng.updateDiscoveries(ctx.state); eng.applyPrestigeMilestones(ctx.state); ctx.state.maxPrestigeShardsEver=Math.max(Number(ctx.state.maxPrestigeShardsEver||0),Number(ctx.state.prestigeShards||0));
    ctx.stats.maxM=ctx.state.prestigeLevel; ctx.lastPrest=ctx.start;
    const cpMs=CHECKPOINTS.map(m=>m*60000); let cp=0, nextDecision=ctx.start;
    for(let elapsed=0; elapsed<=TOTAL_MS; elapsed+=TICK_MS){
      simNow = ctx.start + elapsed; ctx.now = simNow; ctx.tick=false;
      const u0=unlockTotal(ctx.state);
      eng.progressState(ctx.state,ctx.now); eng.runTileAutomation(ctx.state,ctx.now); eng.updateDiscoveries(ctx.state); eng.applyPrestigeMilestones(ctx.state); ctx.state.maxPrestigeShardsEver=Math.max(Number(ctx.state.maxPrestigeShardsEver||0),Number(ctx.state.prestigeShards||0));
      const u1=unlockTotal(ctx.state); if(u1>u0){ ctx.i.unlock += (u1-u0); ctx.stats.unlock += (u1-u0); ctx.tick=true; }
      if(ctx.now>=nextDecision){ runDecision(ctx); nextDecision = ctx.now + Math.max(1000,Number(p.decisionMs||3500)); }
      if(ctx.tick) ctx.i.active += TICK_MS/1000; else ctx.i.idle += TICK_MS/1000;
      while(cp<cpMs.length && elapsed>=cpMs[cp]){
        const rz = reasons(ctx.i,ctx.state);
        ctx.stats.checkpoints.push({ minute:CHECKPOINTS[cp], hook:hook(ctx.i), money:Math.floor(ctx.state.money), prestigeLevel:ctx.state.prestigeLevel, prestigeShards:Math.floor(ctx.state.prestigeShards), totalHarvests:Math.floor(ctx.state.totalHarvests||0), activeFarmSize:ctx.state.activeFarmSize, discoveredSeeds:countTrue(ctx.state.discovered?.seeds||{}), discoveredAnimals:countTrue(ctx.state.discovered?.animals||{}), ownedAnimals:cfg.ANIMALS.reduce((s,a)=>s+Math.max(0,Number(ctx.state.animalOwned?.[a.id]||0)),0), keepPlaying:rz.keep, wantingToQuit:rz.quit, interval:{...ctx.i} });
        ctx.i = mkInterval(); cp++;
      }
    }
  } finally { Date.now=realNow; Math.random=realRand; }
  const cpMap = Object.fromEntries(ctx.stats.checkpoints.map(c=>[c.minute,c]));
  return {
    profileId:p.id, style:p.style, variant,
    highestM:ctx.stats.maxM, timeToHighestMMin:Number((ctx.stats.maxMAt||0).toFixed(1)),
    finalMoney:Math.floor(ctx.state.money), finalShards:Math.floor(ctx.state.prestigeShards), finalHarvests:Math.floor(ctx.state.totalHarvests||0), finalFarmSize:ctx.state.activeFarmSize,
    totalEarnings:Math.floor(ctx.stats.earn), totalHarvestEvents:Math.floor(ctx.stats.harv), totalPrestiges:ctx.stats.prest, totalUnlocks:ctx.stats.unlock, jackpots:ctx.stats.jack, regrows:ctx.stats.reg,
    hookedAt5Min:(cpMap[5]?.hook||0)>=6.5, saveLoadDesire:(cpMap[120]?.hook||0)>=6.8 || (cpMap[180]?.hook||0)>=6.5,
    coverage:{ seedsPlanted:Array.from(ctx.stats.seeds).sort(), animalsPlaced:Array.from(ctx.stats.animals).sort(), upgradesBought:{...ctx.stats.upg}, expansionsUnlocked:Array.from(ctx.stats.exp).sort((a,b)=>a-b) },
    rankings:{ topSeedsByEarnings:Object.entries(ctx.stats.seedEarn).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,v])=>({id,earnings:Math.floor(v)})), topAnimalsByPlacement:Object.entries(ctx.stats.animalPlace).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,v])=>({id,placements:v})), bonusBySource:{...ctx.stats.bonus} },
    checkpoints:ctx.stats.checkpoints,
  };
}

function topStrings(vals, n=3){ const m=new Map(); for(const v of vals||[]){ const t=String(v||'').trim(); if(!t) continue; m.set(t,(m.get(t)||0)+1);} return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([text,count])=>({text,count})); }
function aggregate(runs,cfg){
  const avg=(a)=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const cpm={};
  for(const m of CHECKPOINTS){ const snaps=runs.map(r=>r.checkpoints.find(c=>c.minute===m)).filter(Boolean); cpm[m]={minute:m,avgHook:Number(avg(snaps.map(s=>s.hook)).toFixed(2)),avgMoney:Math.floor(avg(snaps.map(s=>s.money))),avgPrestigeLevel:Number(avg(snaps.map(s=>s.prestigeLevel)).toFixed(2)),keepPlayingTop:topStrings(snaps.flatMap(s=>s.keepPlaying),3),wantingToQuitTop:topStrings(snaps.flatMap(s=>s.wantingToQuit),3)}; }
  const sE={}, aP={}, bS={};
  for(const r of runs){ for(const x of r.rankings.topSeedsByEarnings) sE[x.id]=(sE[x.id]||0)+x.earnings; for(const x of r.rankings.topAnimalsByPlacement) aP[x.id]=(aP[x.id]||0)+x.placements; for(const [k,v] of Object.entries(r.rankings.bonusBySource||{})) bS[k]=(bS[k]||0)+v; }
  const best=runs.reduce((z,r)=>!z||r.highestM>z.highestM||(r.highestM===z.highestM&&r.timeToHighestMMin<z.timeToHighestMMin)?r:z,null);
  const covS=new Set(runs.flatMap(r=>r.coverage.seedsPlanted)), covA=new Set(runs.flatMap(r=>r.coverage.animalsPlaced)), covE=new Set(runs.flatMap(r=>r.coverage.expansionsUnlocked));
  return {
    summary:{ totalRuns:runs.length, avgHighestM:Number(avg(runs.map(r=>r.highestM)).toFixed(2)), maxHighestM:best?.highestM||0, maxHighestMProfile:best?.profileId||null, maxHighestMTimeMin:Number((best?.timeToHighestMMin||0).toFixed(1)), avgFinalMoney:Math.floor(avg(runs.map(r=>r.finalMoney))), avgFinalShards:Math.floor(avg(runs.map(r=>r.finalShards))), avgPrestiges:Number(avg(runs.map(r=>r.totalPrestiges)).toFixed(2)), hookedAt5Rate:Number((runs.filter(r=>r.hookedAt5Min).length/runs.length).toFixed(2)), saveLoadDesireRate:Number((runs.filter(r=>r.saveLoadDesire).length/runs.length).toFixed(2)), avgHook5:Number(avg(runs.map(r=>r.checkpoints.find(c=>c.minute===5)?.hook||0)).toFixed(2)), avgHook60:Number(avg(runs.map(r=>r.checkpoints.find(c=>c.minute===60)?.hook||0)).toFixed(2)), avgHook300:Number(avg(runs.map(r=>r.checkpoints.find(c=>c.minute===300)?.hook||0)).toFixed(2)), bestPartSignals:topStrings(runs.flatMap(r=>r.checkpoints.flatMap(c=>c.keepPlaying)),5), dragPartSignals:topStrings(runs.flatMap(r=>r.checkpoints.flatMap(c=>c.wantingToQuit)),5) },
    topSeeds:Object.entries(sE).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,e])=>({id,earnings:Math.floor(e)})),
    topAnimals:Object.entries(aP).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,p])=>({id,placements:p})),
    topBonusSources:Object.entries(bS).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,count])=>({id,count})),
    featureCoverage:{ seedsCovered:Array.from(covS).sort(), totalSeeds:cfg.SEEDS.length, animalsCovered:Array.from(covA).sort(), totalAnimals:cfg.ANIMALS.length, expansionsCovered:Array.from(covE).sort((a,b)=>a-b), totalExpansionTiers:cfg.FARM_EXPANSIONS.length },
    checkpoints:CHECKPOINTS.map(m=>cpm[m]),
  };
}

async function runVariant(label, configText){
  const mod = await loadModules(configText);
  try{
    const runs=[];
    for(const p of PROFILES) runs.push(await runProfile(mod,p,label,417));
    return { variant:label, aggregate:aggregate(runs,mod.config), runs };
  } finally { mod.cleanup(); }
}

function diff(base,tuned){
  const b=base.aggregate.summary, t=tuned.aggregate.summary;
  return { avgHighestMDelta:Number((t.avgHighestM-b.avgHighestM).toFixed(2)), maxHighestMDelta:t.maxHighestM-b.maxHighestM, avgHook5Delta:Number((t.avgHook5-b.avgHook5).toFixed(2)), avgHook60Delta:Number((t.avgHook60-b.avgHook60).toFixed(2)), avgHook300Delta:Number((t.avgHook300-b.avgHook300).toFixed(2)), hookedAt5RateDelta:Number((t.hookedAt5Rate-b.hookedAt5Rate).toFixed(2)), saveLoadDesireRateDelta:Number((t.saveLoadDesireRate-b.saveLoadDesireRate).toFixed(2)), avgPrestigesDelta:Number((t.avgPrestiges-b.avgPrestiges).toFixed(2)), avgFinalMoneyDelta:t.avgFinalMoney-b.avgFinalMoney, avgFinalShardsDelta:t.avgFinalShards-b.avgFinalShards };
}
function printSum(v){ const s=v.aggregate.summary; console.log(`\n=== ${v.variant.toUpperCase()} ===`); console.log(`avg M ${s.avgHighestM} | max M ${s.maxHighestM} (${s.maxHighestMProfile} @ ${s.maxHighestMTimeMin}m) | hook@5 ${s.avgHook5} | hook@60 ${s.avgHook60} | hook@300 ${s.avgHook300}`); console.log(`hooked@5 ${(s.hookedAt5Rate*100).toFixed(0)}% | save/load ${(s.saveLoadDesireRate*100).toFixed(0)}% | avg prestiges ${s.avgPrestiges}`); console.log(`top seeds: ${v.aggregate.topSeeds.map(x=>`${x.id}:${x.earnings.toLocaleString()}`).join(', ')}`); console.log(`top animals: ${v.aggregate.topAnimals.map(x=>`${x.id}:${x.placements}`).join(', ')}`); }

async function main(){
  const root=process.cwd();
  const baseText=execSync('git show HEAD:lib/farm/config.js',{encoding:'utf8'});
  const tunedText=fs.readFileSync(path.join(root,'lib/farm/config.js'),'utf8');
  const baseline=await runVariant('baseline',baseText);
  const tuned=await runVariant('tuned',tunedText);
  const comparison=diff(baseline,tuned);
  printSum(baseline); printSum(tuned); console.log('\n=== DELTA (TUNED - BASELINE) ==='); console.log(comparison);
  const out={ generatedAt:new Date().toISOString(), checkpoints:CHECKPOINTS, tuningSummary:TUNING_PACK, comparison, baseline, tuned };
  const outDir=path.join(root,'.tmp_farm_sim'); fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'farm_10_deep_dive_results.json'),JSON.stringify(out,null,2),'utf8');
  console.log(`\nSaved JSON: ${path.join(outDir,'farm_10_deep_dive_results.json')}`);
}
main().catch((e)=>{ console.error(e); process.exit(1); });
