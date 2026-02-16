"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  ACTION_TOOLS,
  ANIMAL_ANIM_CYCLE,
  ANIMAL_ANIM_INTERVAL_MS,
  ANIMALS,
  BRUSHES,
  FARM_EXPANSIONS,
  GAME_TICK_MS,
  GRID_SIZE,
  MAX_ANIMALS_PER_TILE,
  PRESTIGE_GROWTH_SPEED_PER_LEVEL,
  PRESTIGE_MAX_GROWTH_SPEED,
  PRESTIGE_MILESTONES,
  RESEARCH_UNLOCK_MARKETING,
  PRESTIGE_START_MONEY_PER_LEVEL,
  SEEDS,
  SHARD_UPGRADES,
  STAGES,
  STORAGE_KEY,
  TILE_COUNT,
  TOOLS,
} from "../../lib/farm/config";

import {
  animalById,
  animalMaxOwnedForPrestige,
  animalPrestigeRequirement,
  animalPrestigeRequirementByIndex,
  applyPrestigeMilestones,
  autoKeyForTool,
  automationCostForState,
  blockerLabel,
  brushCostForState,
  canBuyShardUpgrade,
  clamp,
  cloneState,
  currentSeedCost,
  countPlacedAnimals,
  createInitialState,
  cropCategory,
  currentMarketSeason,
  farmExpansionBySize,
  formatDuration,
  formatLargeNumber,
  formatMoney,
  getBrushById,
  getBrushIndicesWithSize,
  isToolVisible,
  marketBonusForHarvest,
  marketSeasonRemainingMs,
  normalizeState,
  plantTile,
  plowTile,
  prestigeMoneyCost,
  prestigeShardGain,
  progressState,
  runTileAutomation,
  seedById,
  seedEraYieldBonus,
  seedPlantingQuote,
  seedTraitText,
  shardUpgradeEffects,
  shardUpgradeById,
  shardUpgradeCost,
  shardUpgradeLevel,
  shardUpgradeMarketingRequirement,
  splitNeedsLabel,
  stageCropLabelLines,
  stageDurationWithTile,
  stageProgressPercent,
  tileAnimalIds,
  tileAnimalTrait,
  updateDiscoveries,
  waterTile,
  harvestTile,
} from "../../lib/farm/engine";

const SAVE_EXPORT_FORMAT = "farm-save-encrypted-v1";
const SAVE_EXPORT_ITERATIONS = 120000;
const SAVE_EXPORT_SECRET = "farm-idle-local-save-secret-v1";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveSaveCryptoKey(salt, iterations = SAVE_EXPORT_ITERATIONS) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SAVE_EXPORT_SECRET),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSaveJson(rawJson) {
  if (!window.crypto?.subtle) {
    throw new Error("Browser crypto API unavailable.");
  }
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSaveCryptoKey(salt, SAVE_EXPORT_ITERATIONS);
  const plaintext = new TextEncoder().encode(rawJson);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return JSON.stringify({
    format: SAVE_EXPORT_FORMAT,
    v: 1,
    iter: SAVE_EXPORT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  });
}

async function decryptSaveJsonPayload(payload) {
  if (!window.crypto?.subtle) {
    throw new Error("Browser crypto API unavailable.");
  }
  const iter = Math.max(1, Number(payload?.iter || SAVE_EXPORT_ITERATIONS));
  const salt = base64ToBytes(String(payload?.salt || ""));
  const iv = base64ToBytes(String(payload?.iv || ""));
  const data = base64ToBytes(String(payload?.data || ""));
  const key = await deriveSaveCryptoKey(salt, iter);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

function countLabel(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function brushTierUnlocked(brushUnlocks, toolId, brushId) {
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
      Boolean(brushUnlocks?.[toolId]?.[candidate.id]),
  );
}

export default function FarmPage() {
  const importFileRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [animTick, setAnimTick] = useState(0);
  const [game, setGame] = useState(createInitialState);
  const [hoveredTileIndex, setHoveredTileIndex] = useState(null);
  const [pendingAutoMode, setPendingAutoMode] = useState(null);
  const [animalTileAction, setAnimalTileAction] = useState("place");
  const [expandedSeedId, setExpandedSeedId] = useState(null);
  const [expandedAnimalId, setExpandedAnimalId] = useState(null);
  const [showTileValueTags, setShowTileValueTags] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const hydrateSaveState = (parsedState) => {
    const normalized = normalizeState(parsedState);
    const copy = cloneState(normalized);
    const loadedAt = Date.now();
    progressState(copy, loadedAt);
    runTileAutomation(copy, loadedAt);
    updateDiscoveries(copy);
    applyPrestigeMilestones(copy);
    copy.maxPrestigeShardsEver = Math.max(
      Number(copy.maxPrestigeShardsEver || 0),
      Number(copy.prestigeShards || 0),
    );
    return copy;
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGame(hydrateSaveState(parsed));
      }
    } catch {
      setGame(createInitialState());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, ready]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      setGame((prev) => {
        const next = cloneState(prev);
        const progressed = progressState(next, currentNow);
        const automated = runTileAutomation(next, currentNow);
        const discovered = updateDiscoveries(next);
        const milestones = applyPrestigeMilestones(next);
        next.maxPrestigeShardsEver = Math.max(
          Number(next.maxPrestigeShardsEver || 0),
          Number(next.prestigeShards || 0),
        );
        const changed = progressed || automated || discovered || milestones;
        return changed ? next : prev;
      });
    }, GAME_TICK_MS);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    const id = setInterval(() => {
      setAnimTick((v) => v + 1);
    }, ANIMAL_ANIM_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const mutate = (updater) => {
    setGame((prev) => {
      const next = cloneState(prev);
      const timestamp = Date.now();
      progressState(next, timestamp);
      runTileAutomation(next, timestamp);
      updater(next, timestamp);
      updateDiscoveries(next);
      applyPrestigeMilestones(next);
      next.maxPrestigeShardsEver = Math.max(
        Number(next.maxPrestigeShardsEver || 0),
        Number(next.prestigeShards || 0),
      );
      next.updatedAt = timestamp;
      return next;
    });
  };

  const setTool = (toolId) => {
    setPendingAutoMode(null);
    if (toolId !== "animals") setAnimalTileAction("place");
    mutate((state) => {
      state.selectedTool = toolId;
    });
  };

  const setSelectedSeed = (seedId) => {
    mutate((state) => {
      state.selectedSeed = seedId;
      state.selectedTool = "plant";
    });
  };

  const setSelectedAnimal = (animalId) => {
    mutate((state) => {
      const reqPrestige = animalPrestigeRequirement(animalId);
      if (!Number.isFinite(reqPrestige) || state.prestigeLevel < reqPrestige)
        return;
      state.selectedAnimal = animalId;
      state.selectedTool = "animals";
    });
    setAnimalTileAction("place");
  };

  const unlockFarmExpansion = (size) => {
    mutate((state) => {
      const expansion = farmExpansionBySize(size);
      if (!expansion || size <= 3) return;
      if (state.farmSizeUnlocks?.[size]) return;
      if (state.prestigeLevel < expansion.reqPrestige) return;
      if (state.prestigeShards < expansion.unlockShards) return;
      const idx = FARM_EXPANSIONS.findIndex((exp) => exp.size === size);
      if (idx > 0) {
        const prevSize = FARM_EXPANSIONS[idx - 1].size;
        if (!state.farmSizeUnlocks?.[prevSize]) return;
      }
      state.prestigeShards -= expansion.unlockShards;
      state.farmSizeUnlocks[size] = true;
      state.activeFarmSize = Math.max(Number(state.activeFarmSize || 3), size);
    });
  };

  const prestigeNow = () => {
    const requiredMoney = prestigeMoneyCost(game.prestigeLevel);
    if (game.money < requiredMoney) return;
    const gainPreview = prestigeShardGain(game);
    const nextLevel = Math.max(0, Number(game.prestigeLevel || 0)) + 1;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Are you sure you want to reset your field? Animals stay placed and farm size stays at ${game.activeFarmSize}x${game.activeFarmSize}. In exchange, you get Marketing Level M${nextLevel} and +${formatLargeNumber(gainPreview)} new platinum.`,
          );
    if (!confirmed) return;
    setPendingAutoMode(null);
    setGame((prev) => {
      if (prev.money < prestigeMoneyCost(prev.prestigeLevel)) return prev;
      const gain = prestigeShardGain(prev);
      const next = createInitialState({
        prestigeLevel: (prev.prestigeLevel || 0) + 1,
        prestigeShards: (prev.prestigeShards || 0) + gain,
        maxPrestigeShardsEver: Math.max(
          Number(prev.maxPrestigeShardsEver || 0),
          Number((prev.prestigeShards || 0) + gain),
        ),
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
        marketSeasonStartedAt: Number(prev.marketSeasonStartedAt || Date.now()),
        animalClearUnlocked: Boolean(prev.animalClearUnlocked),
        animalOwned: { ...(prev.animalOwned || {}) },
        selectedAnimal: prev.selectedAnimal || ANIMALS[0].id,
      });
      // Marketing reset clears farm progress, but keeps animal placements on tiles.
      next.tiles = next.tiles.map((tile, idx) => ({
        ...tile,
        animals: tileAnimalIds(prev.tiles?.[idx]).slice(
          0,
          MAX_ANIMALS_PER_TILE,
        ),
      }));
      next.discovered.tools.animals =
        next.prestigeLevel >= animalPrestigeRequirementByIndex(0);
      if (!next.discovered.tools[next.selectedTool]) {
        next.selectedTool = "plow";
      }
      applyPrestigeMilestones(next);
      return next;
    });
  };

  const exportEncryptedSave = async () => {
    try {
      setSaveBusy(true);
      setSaveStatus("");
      const raw =
        localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(cloneState(game));
      const encrypted = await encryptSaveJson(raw);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `farm-save-${stamp}.json`;
      const blob = new Blob([encrypted], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaveStatus(`Exported encrypted save: ${filename}`);
    } catch {
      setSaveStatus("Export failed. Please try again.");
    } finally {
      setSaveBusy(false);
    }
  };

  const triggerSaveImportPicker = () => {
    importFileRef.current?.click();
  };

  const importEncryptedSave = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      setSaveBusy(true);
      setSaveStatus("");
      const text = await file.text();
      const payload = JSON.parse(text);
      let rawJsonText = text;
      if (payload?.format === SAVE_EXPORT_FORMAT) {
        rawJsonText = await decryptSaveJsonPayload(payload);
      } else if (payload && typeof payload === "object") {
        rawJsonText = JSON.stringify(payload);
      }
      const parsed = JSON.parse(rawJsonText);
      const loaded = hydrateSaveState(parsed);
      setPendingAutoMode(null);
      setGame(loaded);
      setSaveStatus(`Imported save: ${file.name}`);
    } catch {
      setSaveStatus("Import failed. Use a valid encrypted save JSON.");
    } finally {
      setSaveBusy(false);
      if (event?.target) event.target.value = "";
    }
  };

  const buyShardUpgrade = (upgradeId) => {
    mutate((state) => {
      const upgrade = shardUpgradeById(upgradeId);
      if (!upgrade) return;
      if (!canBuyShardUpgrade(state, upgradeId)) return;
      const level = shardUpgradeLevel(state, upgradeId);
      if (level >= upgrade.cap) return;
      const cost = shardUpgradeCost(upgradeId, level);
      if (state.prestigeShards < cost) return;
      state.prestigeShards -= cost;
      state.shardUpgrades[upgradeId] = level + 1;
    });
  };

  const buyBrushUpgrade = (toolId, brushId) => {
    const brush = getBrushById(brushId);
    if (brush.cost <= 0) return;
    mutate((state) => {
      if (
        brush.width > state.activeFarmSize ||
        brush.height > state.activeFarmSize
      ) {
        return;
      }
      const unlocked = Boolean(state.brushUnlocks?.[toolId]?.[brushId]);
      const cost = brushCostForState(state, brushId);
      if (unlocked || state.money < cost) return;
      if (!brushTierUnlocked(state.brushUnlocks, toolId, brushId)) return;
      state.money -= cost;
      state.brushUnlocks[toolId][brushId] = true;
      state.discovered.brushes[toolId][brushId] = true;
    });
  };

  const selectBrush = (toolId, brushId) => {
    mutate((state) => {
      if (!state.brushUnlocks?.[toolId]?.[brushId]) return;
      const brush = getBrushById(brushId);
      if (
        brush.width > state.activeFarmSize ||
        brush.height > state.activeFarmSize
      ) {
        return;
      }
      state.selectedBrushes[toolId] = brushId;
    });
  };

  const buyAllAutomationForKey = (autoKey) => {
    if (!autoKey) return;
    setPendingAutoMode(null);
    mutate((state) => {
      const unitCost = automationCostForState(state, autoKey);
      if (!Number.isFinite(unitCost) || unitCost <= 0) return;
      const activeSize = clamp(Number(state.activeFarmSize || 3), 3, GRID_SIZE);
      const remainingIndices = [];
      for (let r = 0; r < activeSize; r += 1) {
        for (let c = 0; c < activeSize; c += 1) {
          const idx = r * GRID_SIZE + c;
          const tile = state.tiles[idx];
          if (!tile) continue;
          const hasAutomation = Boolean(tile[autoKey] || tile.autoEverything);
          if (!hasAutomation) remainingIndices.push(idx);
        }
      }
      if (remainingIndices.length <= 0) return;
      const totalCost = remainingIndices.length * unitCost;
      if (state.money < totalCost) return;
      state.money -= totalCost;
      for (const idx of remainingIndices) {
        const tile = state.tiles[idx];
        if (!tile) continue;
        tile[autoKey] = true;
      }
    });
  };

  const cancelAllAutomationForKey = (autoKey, autoLabel) => {
    if (!autoKey) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Cancel all Auto-${autoLabel} on the active farm? This is non-refundable.`,
          );
    if (!confirmed) return;
    setPendingAutoMode(null);
    mutate((state) => {
      const activeSize = clamp(Number(state.activeFarmSize || 3), 3, GRID_SIZE);
      for (let r = 0; r < activeSize; r += 1) {
        for (let c = 0; c < activeSize; c += 1) {
          const idx = r * GRID_SIZE + c;
          const tile = state.tiles[idx];
          if (!tile) continue;
          const hadAny = Boolean(tile[autoKey] || tile.autoEverything);
          if (!hadAny) continue;
          tile[autoKey] = false;
          if (tile.autoEverything) tile.autoEverything = false;
        }
      }
    });
  };

  const tileAction = (tileIndex, opts = {}) => {
    mutate((state, timestamp) => {
      const row = Math.floor(tileIndex / GRID_SIZE);
      const col = tileIndex % GRID_SIZE;
      if (row >= state.activeFarmSize || col >= state.activeFarmSize) return;
      const tile = state.tiles[tileIndex];
      if (!tile) return;
      if (state.selectedTool === "animals") {
        if (animalTileAction === "clearAll") {
          if (tileAnimalIds(tile).length <= 0) return;
          tile.animals = [];
          return;
        }
        const remove = Boolean(opts?.remove);
        const animalId = state.selectedAnimal;
        const animal = animalById(animalId);
        if (!animal) return;
        const reqPrestige = animalPrestigeRequirement(animalId);
        if (
          !Number.isFinite(reqPrestige) ||
          state.prestigeLevel < reqPrestige
        ) {
          return;
        }
        const tileAnimals = [...tileAnimalIds(tile)];
        if (remove) {
          const existingAt = tileAnimals.lastIndexOf(animalId);
          if (existingAt >= 0) {
            tileAnimals.splice(existingAt, 1);
            tile.animals = tileAnimals;
          }
          return;
        }
        if (tileAnimals.length >= MAX_ANIMALS_PER_TILE) return;
        const owned = Math.max(0, Number(state.animalOwned?.[animalId] || 0));
        const cap = animalMaxOwnedForPrestige(state.prestigeLevel, animalId);
        if (
          Number.isFinite(cap) &&
          owned >= cap &&
          countPlacedAnimals(state.tiles, animalId) >= owned
        ) {
          return;
        }
        const placed = countPlacedAnimals(state.tiles, animalId);
        if (placed >= owned) {
          if (Number.isFinite(cap) && owned >= cap) return;
          if (state.prestigeShards < animal.unlockShards) return;
          state.prestigeShards -= animal.unlockShards;
          state.animalOwned[animalId] = owned + 1;
        }
        tile.animals = [...tileAnimals, animalId].slice(
          0,
          MAX_ANIMALS_PER_TILE,
        );
        return;
      }
      const clickedHarvestReady = Boolean(
        tile.plant && tile.plant.stageIndex >= 3,
      );
      if (clickedHarvestReady && state.selectedTool !== "animals") {
        const wasHarvest = state.selectedTool === "harvest";
        state.selectedTool = "harvest";
        if (!wasHarvest) return;
      }
      const clickedNeedsWater = Boolean(
        tile.plant && tile.plant.stageIndex < 3 && !tile.plant.stageWatered,
      );
      if (clickedNeedsWater && state.selectedTool !== "animals") {
        const wasWater = state.selectedTool === "water";
        state.selectedTool = "water";
        if (!wasWater) return;
      }

      if (pendingAutoMode) {
        const { type, key } = pendingAutoMode;
        if (type === "buy") {
          const cost = automationCostForState(state, key);
          if (!Number.isFinite(cost) || cost <= 0 || state.money < cost) return;
          if (key === "autoPlow" && (tile.autoPlow || tile.autoEverything))
            return;
          if (key === "autoWater" && (tile.autoWater || tile.autoEverything))
            return;
          if (key === "autoPlant" && (tile.autoPlant || tile.autoEverything))
            return;
          if (
            key === "autoHarvest" &&
            (tile.autoHarvest || tile.autoEverything)
          )
            return;
          state.money -= cost;
          tile[key] = true;
          return;
        }
        if (type === "cancel") {
          const hadAny = Boolean(tile[key] || tile.autoEverything);
          if (!hadAny) return;
          tile[key] = false;
          if (tile.autoEverything) tile.autoEverything = false;
          return;
        }
      }

      if (!ACTION_TOOLS.includes(state.selectedTool)) return;
      const brushId = state.selectedBrushes?.[state.selectedTool] || "1x1";
      const unlocked =
        state.brushUnlocks?.[state.selectedTool]?.[brushId] || false;
      const selectedBrush = getBrushById(brushId);
      const fitsFarm =
        selectedBrush.width <= state.activeFarmSize &&
        selectedBrush.height <= state.activeFarmSize;
      const finalBrushId = unlocked && fitsFarm ? brushId : "1x1";
      const indices = getBrushIndicesWithSize(
        tileIndex,
        finalBrushId,
        state.activeFarmSize,
      );
      for (const idx of indices) {
        const cell = state.tiles[idx];
        if (!cell) continue;
        if (state.selectedTool === "plow") plowTile(cell, timestamp);
        if (state.selectedTool === "water") waterTile(cell, timestamp);
        if (state.selectedTool === "plant") {
          plantTile(state, cell, state.selectedSeed, timestamp);
        }
        if (state.selectedTool === "harvest") harvestTile(state, cell);
      }
    });
  };

  const previewIndices = useMemo(() => {
    const origin = hoveredTileIndex;
    if (origin == null || origin < 0 || origin >= TILE_COUNT) return new Set();
    const row = Math.floor(origin / GRID_SIZE);
    const col = origin % GRID_SIZE;
    if (row >= game.activeFarmSize || col >= game.activeFarmSize)
      return new Set();
    if (pendingAutoMode) return new Set([origin]);

    if (game.selectedTool === "animals") {
      return new Set([origin]);
    }
    if (ACTION_TOOLS.includes(game.selectedTool)) {
      const brushId = game.selectedBrushes?.[game.selectedTool] || "1x1";
      const unlocked = Boolean(
        game.brushUnlocks?.[game.selectedTool]?.[brushId],
      );
      const selectedBrush = getBrushById(brushId);
      const fitsFarm =
        selectedBrush.width <= game.activeFarmSize &&
        selectedBrush.height <= game.activeFarmSize;
      const indices = getBrushIndicesWithSize(
        origin,
        unlocked && fitsFarm ? brushId : "1x1",
        game.activeFarmSize,
      );
      return new Set(indices);
    }

    return new Set([origin]);
  }, [
    hoveredTileIndex,
    pendingAutoMode,
    game.selectedTool,
    game.selectedBrushes,
    game.brushUnlocks,
    game.activeFarmSize,
  ]);
  const currentPrestigeCost = prestigeMoneyCost(game.prestigeLevel);
  const nextMarketingGain = prestigeShardGain(game);
  const canMarketNow = game.money >= currentPrestigeCost;
  const currentSeason = currentMarketSeason(now);
  const seasonRemainingMs = marketSeasonRemainingMs(now);
  const milestoneClaimedCount = PRESTIGE_MILESTONES.filter(
    (m) => game.milestonesClaimed?.[m.id],
  ).length;
  const totalMilestoneRewardShards = PRESTIGE_MILESTONES.filter(
    (m) => game.milestonesClaimed?.[m.id],
  ).reduce((sum, m) => sum + m.rewardShards, 0);
  const nextLockedFarmExpansion =
    FARM_EXPANSIONS.find((exp) => !game.farmSizeUnlocks?.[exp.size]) || null;
  const maxVisibleFarmReq = nextLockedFarmExpansion
    ? nextLockedFarmExpansion.reqPrestige
    : Number.POSITIVE_INFINITY;
  const visibleFarmExpansions = FARM_EXPANSIONS.filter(
    (exp) =>
      Boolean(game.farmSizeUnlocks?.[exp.size]) ||
      exp.reqPrestige <= maxVisibleFarmReq,
  );
  const showShardUpgradesPanel =
    game.prestigeLevel >= RESEARCH_UNLOCK_MARKETING ||
    SHARD_UPGRADES.some((u) => shardUpgradeLevel(game, u.id) > 0);
  const showAutomationPanel =
    ACTION_TOOLS.includes(game.selectedTool) &&
    Boolean(game.discovered?.automation?.[game.selectedTool]);
  const actionToolLabelByTool = {
    plow: "Plow",
    water: "Water",
    plant: "Seed",
    harvest: "Harvest",
  };
  const selectedActionToolLabel =
    actionToolLabelByTool[game.selectedTool] || "";
  const selectedAutoKey = ACTION_TOOLS.includes(game.selectedTool)
    ? autoKeyForTool(game.selectedTool)
    : null;
  const autoToolLabelByTool = {
    plow: "Plow",
    water: "Water",
    plant: "Plant",
    harvest: "Harvest",
  };
  const selectedAutoLabel = autoToolLabelByTool[game.selectedTool] || "Harvest";
  const actionBrushDescriptionByTool = {
    plow: "Prepare larger areas with one click.",
    water: "Water more tiles with one click.",
    plant: "Plant more seeds with one click.",
    harvest: "Harvest more crops with one click.",
  };
  const actionAutomationDescriptionByTool = {
    plow: "Automatically plow one square when it needs plowing.",
    water: "Automatically water one square when it needs water.",
    plant:
      "Automatically replant the last seed used on that square after harvesting.",
    harvest: "Automatically harvest one square when crops are ready.",
  };
  const toolUnlockText =
    game.selectedTool === "marketing"
      ? ""
      : game.selectedTool === "expandFarm"
        ? "Use platinum to unlock larger farm sizes at higher marketing levels."
        : game.selectedTool === "research"
          ? "Use platinum for starter labs now and advanced labs at M5."
          : "";
  const tileLabelScale = clamp(
    GRID_SIZE / Math.max(1, Number(game.activeFarmSize || GRID_SIZE)),
    1,
    2.5,
  );
  const topLabelFontSize = 5 * tileLabelScale;
  const progressLabelFontSize = 6 * tileLabelScale;
  const blockerLabelFontSize = 5 * tileLabelScale;
  const visibleTileIndices = useMemo(() => {
    const size = clamp(Number(game.activeFarmSize || 3), 3, GRID_SIZE);
    const out = [];
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        out.push(r * GRID_SIZE + c);
      }
    }
    return out;
  }, [game.activeFarmSize]);
  const selectedPlantBrushId = game.selectedBrushes?.plant || "1x1";
  const selectedPlantBrushUnlocked = Boolean(
    game.brushUnlocks?.plant?.[selectedPlantBrushId],
  );
  const selectedPlantBrush = getBrushById(selectedPlantBrushId);
  const selectedPlantBrushFitsFarm =
    selectedPlantBrush.width <= game.activeFarmSize &&
    selectedPlantBrush.height <= game.activeFarmSize;
  const effectivePlantBrush =
    selectedPlantBrushUnlocked && selectedPlantBrushFitsFarm
      ? selectedPlantBrush
      : getBrushById("1x1");
  const selectedPlantTileCount = Math.max(
    1,
    effectivePlantBrush.width * effectivePlantBrush.height,
  );
  const bestValueSeedId = useMemo(() => {
    const discoveredSeeds = SEEDS.filter((seed) => game.discovered?.seeds?.[seed.id]);
    if (!discoveredSeeds.length) return null;
    const prestigeMult = 1 + Math.max(0, Number(game.prestigeLevel || 0)) * 0.08;
    let bestAnyId = null;
    let bestAnyScore = -Infinity;
    let bestAffordableId = null;
    let bestAffordableScore = -Infinity;

    for (const seed of discoveredSeeds) {
      const cost = currentSeedCost(game, seed.id, now);
      const matureBonus = Math.max(0, Number(seed?.traits?.matureBonus || 0));
      const jackpot = Math.max(0, Number(seed?.traits?.jackpot || 0));
      const curveYield = seedEraYieldBonus(game, seed.id);
      const expectedGain =
        seed.matureValue *
        (1 + matureBonus) *
        (1 + jackpot) *
        (1 + curveYield) *
        prestigeMult;

      const timingTile = {
        animals: [],
        plant: {
          seedId: seed.id,
          stageIndex: 0,
          stageStartedAt: now,
          stageWatered: false,
          plantedAt: now,
          prestigeAtPlant: Math.max(0, Number(game.prestigeLevel || 0)),
        },
      };
      let cycleMs = 0;
      for (let stage = 0; stage <= 2; stage += 1) {
        timingTile.plant.stageIndex = stage;
        cycleMs += stageDurationWithTile(seed, stage, timingTile);
      }
      const score = (expectedGain - cost) / Math.max(1, cycleMs);
      if (score > bestAnyScore) {
        bestAnyScore = score;
        bestAnyId = seed.id;
      }
      if (cost <= Math.max(0, Number(game.money || 0)) && score > bestAffordableScore) {
        bestAffordableScore = score;
        bestAffordableId = seed.id;
      }
    }

    return bestAffordableId || bestAnyId;
  }, [game, now]);
  const gameTiles = game.tiles;
  const prestigeForCosts = game.prestigeLevel;
  const automationCounts = useMemo(() => {
    const out = {
      autoPlow: 0,
      autoWater: 0,
      autoPlant: 0,
      autoHarvest: 0,
      autoEverything: 0,
    };
    for (const tile of gameTiles) {
      if (tile.autoPlow) out.autoPlow += 1;
      if (tile.autoWater) out.autoWater += 1;
      if (tile.autoPlant) out.autoPlant += 1;
      if (tile.autoHarvest) out.autoHarvest += 1;
      if (tile.autoEverything) out.autoEverything += 1;
    }
    return out;
  }, [gameTiles]);
  const automationBulkByKey = useMemo(() => {
    const out = {
      autoPlow: { remaining: 0, covered: 0, totalCost: 0 },
      autoWater: { remaining: 0, covered: 0, totalCost: 0 },
      autoPlant: { remaining: 0, covered: 0, totalCost: 0 },
      autoHarvest: { remaining: 0, covered: 0, totalCost: 0 },
    };
    for (const idx of visibleTileIndices) {
      const tile = gameTiles[idx];
      if (!tile) continue;
      for (const key of Object.keys(out)) {
        const hasAutomation = Boolean(tile[key] || tile.autoEverything);
        if (hasAutomation) out[key].covered += 1;
        else out[key].remaining += 1;
      }
    }
    for (const key of Object.keys(out)) {
      const unitCost = automationCostForState(
        { prestigeLevel: prestigeForCosts },
        key,
      );
      out[key].totalCost =
        out[key].remaining *
        (Number.isFinite(unitCost) && unitCost > 0 ? unitCost : 0);
    }
    return out;
  }, [gameTiles, prestigeForCosts, visibleTileIndices]);
  const selectedAutoBulk =
    selectedAutoKey && automationBulkByKey[selectedAutoKey]
      ? automationBulkByKey[selectedAutoKey]
      : null;
  const selectedAutomationUnitCost = selectedAutoKey
    ? automationCostForState(game, selectedAutoKey)
    : 0;
  const canBuyAllSelectedAutomation =
    Boolean(selectedAutoKey) &&
    Boolean(selectedAutoBulk) &&
    selectedAutoBulk.remaining > 0 &&
    game.money >= selectedAutoBulk.totalCost;
  const canCancelAllSelectedAutomation =
    Boolean(selectedAutoKey) &&
    Boolean(selectedAutoBulk) &&
    selectedAutoBulk.covered > 1;
  const showActionUnlocks = ACTION_TOOLS.includes(game.selectedTool);
  const showMarketingUnlocks = game.selectedTool === "marketing";
  const showFarmUnlocks = game.selectedTool === "expandFarm";
  const showResearchUnlocks = game.selectedTool === "research";
  const showGenericUnlockCard =
    Boolean(toolUnlockText) ||
    showFarmUnlocks ||
    showResearchUnlocks;
  const activeToolHintByTool = {
    plow: "Click farm tiles to plow using your selected brush size.",
    plant:
      "Click farm tiles to plant your selected seed with your selected brush size.",
    water: "Click farm tiles to water using your selected brush size.",
    harvest: "Click farm tiles to harvest ready crops using your selected brush size.",
    marketing: "Use Market for Platinum to reset crops/money and gain platinum.",
    save: "Export or import your encrypted save file.",
    expandFarm: "Use this panel to unlock and switch farm expansion sizes.",
    animals: "Select an animal, then click a tile to place it.",
    research:
      "Spend platinum on starter labs at M2 and advanced labs at M5.",
  };
  const activeToolHint =
    activeToolHintByTool[game.selectedTool] ||
    "Use the active panel to continue progression.";

  if (!ready) {
    return (
      <section className="page">
        <h1>farm</h1>
        <p className="lede">Loading local save...</p>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>Farm Idle</h1>
      <p className="lede">
        Idle farming sim with lots of unlocks, automation, and levels. Click
        the field to get started!
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          style={{ flex: "1 1 320px", maxWidth: 420, width: "100%", order: 2 }}
        >
          <div
            className="card"
            style={{
              display: "grid",
              gap: 12,
              marginBottom: 14,
              background:
                "linear-gradient(180deg, rgba(65,43,24,0.62), rgba(24,18,12,0.72))",
              borderColor: "rgba(255, 203, 129, 0.28)",
            }}
          >
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 12,
                padding: 10,
                background: "rgba(0,0,0,0.24)",
                display: "grid",
                gap: 3,
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.72 }}>Market Season</div>
              <div style={{ fontSize: 12 }}>
                <strong>{currentSeason.label}</strong>
              </div>
              <div style={{ fontSize: 10, opacity: 0.78 }}>
                +{Math.round(currentSeason.baseBonus * 100)}% to{" "}
                {currentSeason.categories.join(", ")} crops
                {currentSeason.synergyAnimal
                  ? ` (+${Math.round(currentSeason.synergyBonus * 100)}% with ${animalById(currentSeason.synergyAnimal)?.name || currentSeason.synergyAnimal})`
                  : ""}
              </div>
              <div style={{ fontSize: 10, opacity: 0.68 }}>
                Rotates in {formatDuration(seasonRemainingMs)}
              </div>
            </div>
            <h2 style={{ margin: 0 }}>Tools & Unlocks</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TOOLS.filter((tool) => isToolVisible(game, tool.id)).map(
                (tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setTool(tool.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      borderColor:
                        game.selectedTool === tool.id
                          ? "rgba(255, 243, 175, 0.9)"
                          : "rgba(255,255,255,0.18)",
                      background:
                        game.selectedTool === tool.id
                          ? "rgba(255, 230, 142, 0.18)"
                          : "rgba(0,0,0,0.28)",
                    }}
                  >
                    <ToolButtonIcon
                      toolId={tool.id}
                      size={tool.id === "animals" ? 18 : 14}
                    />
                    {tool.label}
                  </button>
                ),
              )}
            </div>

            <div style={{ fontSize: 10, opacity: 0.86 }}>
              Active tool: <strong>{game.selectedTool}</strong>.
              <br />
              {activeToolHint}
            </div>

            {game.selectedTool === "save" ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(0,0,0,0.24)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.84 }}>
                  Save Transfer
                </div>
                <div style={{ fontSize: 10, opacity: 0.72 }}>
                  Export creates an encrypted version of your local save JSON.
                  Import restores from that encrypted save file.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={exportEncryptedSave} disabled={saveBusy}>
                    Export Save JSON
                  </button>
                  <button onClick={triggerSaveImportPicker} disabled={saveBusy}>
                    Import Save JSON
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={importEncryptedSave}
                  />
                </div>
                <div style={{ fontSize: 10, opacity: 0.72 }}>
                  {saveStatus ||
                    "Tip: store exported files somewhere safe so you can restore on another browser/device."}
                </div>
              </div>
            ) : null}

            {game.selectedTool === "plant" ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(0,0,0,0.24)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.84 }}>Seed types</div>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  }}
                >
                  {SEEDS.filter(
                    (seed) => game.discovered?.seeds?.[seed.id],
                  ).map((seed) => {
                    const selected = game.selectedSeed === seed.id;
                    const isBestValue = bestValueSeedId === seed.id;
                    const expanded = expandedSeedId === seed.id;
                    const quote = seedPlantingQuote(
                      game,
                      seed.id,
                      selectedPlantTileCount,
                      now,
                    );
                    const projectedTiles = quote.affordableTiles;
                    const projectedCost = quote.affordableCost;
                    const partialFill = projectedTiles < selectedPlantTileCount;
                    const tileLabel = countLabel(
                      selectedPlantTileCount,
                      "tile",
                    );
                    const costLabel = partialFill
                      ? `${formatMoney(projectedCost)} (${projectedTiles}/${selectedPlantTileCount} ${tileLabel})`
                      : `${formatMoney(quote.fullCost)} (${selectedPlantTileCount} ${tileLabel})`;
                    const currentTileCost = currentSeedCost(game, seed.id, now);
                    const matureSellValue = seedSellValuePreview(game, seed.id, 3);
                    const oldSellValue = seedSellValuePreview(game, seed.id, 4);
                    const seedTooltip = [
                      seed.name,
                      `Cost: ${costLabel}`,
                      `Current tile cost: ${formatMoney(currentTileCost)}`,
                      `Brush: ${effectivePlantBrush.id}`,
                      `Mature: ${formatMoney(matureSellValue)} | Old: ${formatMoney(oldSellValue)}`,
                      seedTraitText(seed),
                      `Category: ${cropCategory(seed.id)}`,
                    ].join("\n");
                    return (
                      <div
                        key={seed.id}
                        role="button"
                        tabIndex={0}
                        title={seedTooltip}
                        onClick={() =>
                          setExpandedSeedId((prev) =>
                            prev === seed.id ? null : seed.id,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedSeedId((prev) =>
                              prev === seed.id ? null : seed.id,
                            );
                          }
                        }}
                        style={{
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: 10,
                          padding: 8,
                          background: selected
                            ? "rgba(124, 255, 182, 0.16)"
                            : "rgba(0,0,0,0.2)",
                          display: "grid",
                          gap: 4,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 11 }}>
                              {seed.name}
                            </strong>
                            <div
                              style={{
                                fontSize: 9,
                                opacity: 0.8,
                                marginTop: 2,
                              }}
                            >
                              Cost: {costLabel}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "stretch",
                            }}
                          >
                            {isBestValue ? (
                              <div
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 6,
                                  border: "1px solid rgba(255, 233, 141, 0.65)",
                                  background: "rgba(255, 217, 112, 0.2)",
                                  display: "grid",
                                  placeItems: "center",
                                  textAlign: "center",
                                  fontSize: 9,
                                  lineHeight: 0.95,
                                  opacity: 0.95,
                                }}
                              >
                                <span>
                                  <span>Best</span>
                                  <br />
                                  <span>Value</span>
                                </span>
                              </div>
                            ) : null}
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 6,
                                overflow: "hidden",
                                border: "1px solid rgba(255,255,255,0.22)",
                                position: "relative",
                              }}
                            >
                              <TileSprite
                                tile={{
                                  soil: "plowed",
                                  watered: true,
                                  plant: {
                                    seedId: seed.id,
                                    stageIndex: 3,
                                    stageStartedAt: 0,
                                    stageWatered: false,
                                    plantedAt: 0,
                                  },
                                  autoPlow: false,
                                  autoWater: false,
                                  autoPlant: false,
                                  autoHarvest: false,
                                  autoEverything: false,
                                }}
                                seed={seed}
                              />
                            </div>
                          </div>
                        </div>
                        {expanded ? (
                          <>
                            <div style={{ fontSize: 9, opacity: 0.78 }}>
                              Mature {formatMoney(matureSellValue)} | Old{" "}
                              {formatMoney(oldSellValue)}
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.72 }}>
                              {seedTraitText(seed)}
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.68 }}>
                              Category: {cropCategory(seed.id)}
                            </div>
                            {seed.cost > 0 ? (
                              <div style={{ fontSize: 9, opacity: 0.68 }}>
                                Current tile cost: {formatMoney(currentTileCost)}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSeed(seed.id);
                            }}
                          >
                            {selected ? "Selected" : "Use"}
                          </button>
                          {partialFill ? (
                            <span
                              style={{
                                fontSize: 9,
                                opacity: 0.75,
                                paddingTop: 5,
                              }}
                            >
                              Not enough money for full brush
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {game.selectedTool === "animals" ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(0,0,0,0.24)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.84 }}>
                  Animals apply tile buffs. Select one, then click tiles to
                  place it. Right-click a tile to remove one selected animal, or
                  switch to Clear mode to wipe all animals on clicked tiles.
                  Each tile can hold up to 3 animals.
                </div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(0,0,0,0.2)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.86 }}>
                    Animal Tile Action
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setTool("animals");
                        setAnimalTileAction("place");
                      }}
                      style={{
                        borderColor:
                          animalTileAction === "place"
                            ? "rgba(255, 243, 175, 0.9)"
                            : undefined,
                      }}
                    >
                      Place Mode
                    </button>
                    <button
                      onClick={() => {
                        setTool("animals");
                        setAnimalTileAction("clearAll");
                      }}
                      style={{
                        borderColor:
                          animalTileAction === "clearAll"
                            ? "rgba(255, 243, 175, 0.9)"
                            : undefined,
                      }}
                    >
                      Clear Tile Mode
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  }}
                >
                  {ANIMALS.filter(
                    (animal) => game.discovered?.animals?.[animal.id],
                  ).map((animal) => {
                    const reqPrestige = animalPrestigeRequirement(animal.id);
                    const tierUnlocked = game.prestigeLevel >= reqPrestige;
                    const selected = game.selectedAnimal === animal.id;
                    const canUse = tierUnlocked;
                    const expanded = expandedAnimalId === animal.id;
                    const traitsText = Object.entries(animal.traits)
                      .map(
                        ([key, value]) =>
                          `${key} +${Math.round(Number(value) * 100)}%`,
                      )
                      .join(" | ");
                    const animalTooltip = [
                      animal.name,
                      `Cost: ${formatLargeNumber(animal.unlockShards)} platinum`,
                      `Traits: ${traitsText}`,
                      animal.desc,
                      tierUnlocked
                        ? "Unlocked for current marketing level"
                        : `Unlocks at marketing ${reqPrestige}`,
                    ].join("\n");
                    return (
                      <div
                        key={animal.id}
                        role="button"
                        tabIndex={0}
                        title={animalTooltip}
                        onClick={() =>
                          setExpandedAnimalId((prev) =>
                            prev === animal.id ? null : animal.id,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedAnimalId((prev) =>
                              prev === animal.id ? null : animal.id,
                            );
                          }
                        }}
                        style={{
                          border: "1px solid rgba(255,255,255,0.16)",
                          borderRadius: 10,
                          padding: 8,
                          background: selected
                            ? "rgba(124, 255, 182, 0.16)"
                            : "rgba(0,0,0,0.2)",
                          display: "grid",
                          gap: 4,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 11 }}>
                              {animal.name}
                            </strong>
                            <div
                              style={{
                                fontSize: 9,
                                opacity: 0.8,
                                marginTop: 2,
                              }}
                            >
                              {formatLargeNumber(animal.unlockShards)} platinum
                            </div>
                          </div>
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 6,
                              overflow: "hidden",
                              border: "1px solid rgba(255,255,255,0.22)",
                              background: "rgba(0,0,0,0.26)",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <AnimalSprite animalId={animal.id} size={48} />
                          </div>
                        </div>
                        <div style={{ fontSize: 9, opacity: 0.72 }}>
                          Traits: {traitsText}
                        </div>
                        {expanded ? (
                          <div style={{ fontSize: 9, opacity: 0.78 }}>
                            {animal.desc}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAnimal(animal.id);
                            }}
                            disabled={!canUse}
                          >
                            {selected ? "Selected" : "Use"}
                          </button>
                        </div>
                        {!tierUnlocked && expanded ? (
                          <div style={{ fontSize: 9, opacity: 0.68 }}>
                            Unlocks at marketing {reqPrestige}.
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!ANIMALS.some(
                    (animal) => game.discovered?.animals?.[animal.id],
                  ) ? (
                    <div style={{ fontSize: 10, opacity: 0.72 }}>
                      No animals visible yet. Reach 90% of platinum cost at
                      least once and get to the current/next marketing tier to
                      reveal them.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showMarketingUnlocks ? (
              <>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10,
                    padding: 8,
                    background: "rgba(0,0,0,0.18)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.88 }}>
                    Marketing converts money and plants into platinum. All crops
                    and money are reset. Animals and farm expansions are
                    retained.
                  </div>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10,
                      padding: 8,
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.82 }}>
                      Marketing Level: <strong>M{game.prestigeLevel}</strong>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.82 }}>
                      Marketing Platinum:{" "}
                      <strong>{formatLargeNumber(game.prestigeShards)}</strong>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.72 }}>
                      Next marketing gain: +
                      {formatLargeNumber(nextMarketingGain)} platinum
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.72 }}>
                      Money required to M{game.prestigeLevel + 1}:{" "}
                      {formatMoney(currentPrestigeCost)}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.72 }}>
                      Marketing perks: +
                      {formatMoney(PRESTIGE_START_MONEY_PER_LEVEL)} start money
                      and +{Math.round(PRESTIGE_GROWTH_SPEED_PER_LEVEL * 100)}%
                      growth speed per marketing level (max{" "}
                      {Math.round(PRESTIGE_MAX_GROWTH_SPEED * 100)}%).
                    </div>
                    <button onClick={prestigeNow} disabled={!canMarketNow}>
                      Market for Platinum
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10,
                    padding: 8,
                    background: "rgba(0,0,0,0.18)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.88 }}>
                    Farm milestones award bonus platinum across marketing levels
                  </div>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10,
                      padding: 8,
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.84 }}>
                      Farm Milestones ({milestoneClaimedCount}/
                      {PRESTIGE_MILESTONES.length})
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.74 }}>
                      Claimed platinum rewards:{" "}
                      {formatLargeNumber(totalMilestoneRewardShards)}
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {PRESTIGE_MILESTONES.map((m) => {
                        const claimed = Boolean(game.milestonesClaimed?.[m.id]);
                        const reached = game.prestigeLevel >= m.reqPrestige;
                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                opacity: claimed ? 0.92 : 0.78,
                              }}
                            >
                              {m.title} (M{m.reqPrestige}) +
                              {formatLargeNumber(m.rewardShards)} platinum
                            </span>
                            <span style={{ fontSize: 10, opacity: 0.7 }}>
                              {claimed
                                ? "Claimed"
                                : reached
                                  ? "Ready"
                                  : "Locked"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {showActionUnlocks ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: 8,
                  background: "rgba(0,0,0,0.18)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.88 }}>
                  {selectedActionToolLabel} upgrades
                </div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10,
                    padding: 8,
                    background: "rgba(0,0,0,0.18)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.84 }}>
                    Brush upgrades
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.72 }}>
                    {actionBrushDescriptionByTool[game.selectedTool] || ""}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {BRUSHES.filter(
                      (brush) =>
                        game.discovered?.brushes?.[game.selectedTool]?.[
                          brush.id
                        ] &&
                        brush.width <= game.activeFarmSize &&
                        brush.height <= game.activeFarmSize,
                    ).map((brush) => {
                      const unlocked =
                        game.brushUnlocks?.[game.selectedTool]?.[brush.id] ||
                        false;
                      const brushCost = brushCostForState(game, brush.id);
                      const selected =
                        (game.selectedBrushes?.[game.selectedTool] || "1x1") ===
                        brush.id;
                      const canBuy = !unlocked && game.money >= brushCost;
                      const prevUnlocked = brushTierUnlocked(
                        game.brushUnlocks,
                        game.selectedTool,
                        brush.id,
                      );
                      return (
                        <div
                          key={`${game.selectedTool}-${brush.id}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 10 }}>
                            {brush.id}{" "}
                            {brush.cost > 0
                              ? `(${formatMoney(brushCost)})`
                              : "(free)"}
                          </span>
                          {unlocked ? (
                            <button
                              onClick={() =>
                                selectBrush(game.selectedTool, brush.id)
                              }
                              disabled={selected}
                            >
                              {selected ? "Selected" : "Use"}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                buyBrushUpgrade(game.selectedTool, brush.id)
                              }
                              disabled={!canBuy || !prevUnlocked}
                            >
                              Buy
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10,
                    padding: 8,
                    background: "rgba(0,0,0,0.18)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.84 }}>Automation</div>
                  <div style={{ fontSize: 10, opacity: 0.72 }}>
                    {actionAutomationDescriptionByTool[game.selectedTool] || ""}
                  </div>
                  {showAutomationPanel ? (
                    <>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(() => {
                          const autoKey = selectedAutoKey;
                          if (!autoKey) return null;
                          const buySelected =
                            pendingAutoMode?.type === "buy" &&
                            pendingAutoMode?.key === autoKey;
                          const cancelSelected =
                            pendingAutoMode?.type === "cancel" &&
                            pendingAutoMode?.key === autoKey;
                          return (
                            <>
                              <button
                                onClick={() =>
                                  setPendingAutoMode(() =>
                                    buySelected
                                      ? null
                                      : { type: "buy", key: autoKey },
                                  )
                                }
                                style={{
                                  borderColor: buySelected
                                    ? "rgba(255,243,175,0.9)"
                                    : undefined,
                                }}
                              >
                                Buy Auto-
                                {selectedAutoLabel}
                              </button>
                              <button
                                onClick={() =>
                                  setPendingAutoMode(() =>
                                    cancelSelected
                                      ? null
                                      : { type: "cancel", key: autoKey },
                                  )
                                }
                                style={{
                                  borderColor: cancelSelected
                                    ? "rgba(255,243,175,0.9)"
                                    : undefined,
                                }}
                              >
                                Cancel Auto-
                                {selectedAutoLabel} (non-refundable)
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.72 }}>
                        {pendingAutoMode?.type === "buy"
                          ? selectedAutoKey
                            ? `Click a farm tile to buy this automation for that square (${formatMoney(selectedAutomationUnitCost)}).`
                            : "Click a farm tile to buy this automation for that square."
                          : pendingAutoMode?.type === "cancel"
                            ? "Click a farm tile to remove this automation from that square."
                            : selectedAutoKey
                              ? `Auto-${selectedAutoLabel}: ${formatMoney(automationCostForState(game, selectedAutoKey))} (owned ${formatLargeNumber(automationCounts[selectedAutoKey])})`
                              : ""}
                      </div>
                      {selectedAutoKey &&
                      (canBuyAllSelectedAutomation ||
                        canCancelAllSelectedAutomation) ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canBuyAllSelectedAutomation ? (
                            <button
                              onClick={() =>
                                buyAllAutomationForKey(selectedAutoKey)
                              }
                            >
                              Buy All Auto-{selectedAutoLabel} (
                              {formatLargeNumber(selectedAutoBulk.remaining)}{" "}
                              {countLabel(selectedAutoBulk.remaining, "tile")},{" "}
                              {formatMoney(selectedAutoBulk.totalCost)})
                            </button>
                          ) : null}
                          {canCancelAllSelectedAutomation ? (
                            <button
                              onClick={() =>
                                cancelAllAutomationForKey(
                                  selectedAutoKey,
                                  selectedAutoLabel,
                                )
                              }
                            >
                              Cancel All Auto-{selectedAutoLabel}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ fontSize: 10, opacity: 0.68 }}>
                      Auto-{selectedAutoLabel.toLowerCase()} unlocks later.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {showGenericUnlockCard ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(0,0,0,0.24)",
                  display: "grid",
                  gap: 8,
                }}
              >
                {toolUnlockText ? (
                  <div style={{ fontSize: 10, opacity: 0.84 }}>
                    {toolUnlockText}
                  </div>
                ) : null}

                {showFarmUnlocks ? (
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10,
                      padding: 8,
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.78 }}>
                      Active farm:{" "}
                      <strong>
                        {game.activeFarmSize}x{game.activeFarmSize}
                      </strong>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {visibleFarmExpansions.map((exp) => {
                        const unlocked = Boolean(
                          game.farmSizeUnlocks?.[exp.size],
                        );
                        const expIdx = FARM_EXPANSIONS.findIndex(
                          (e) => e.size === exp.size,
                        );
                        const prevUnlocked =
                          expIdx <= 0
                            ? true
                            : Boolean(
                                game.farmSizeUnlocks?.[
                                  FARM_EXPANSIONS[expIdx - 1].size
                                ],
                              );
                        const canBuy =
                          !unlocked &&
                          prevUnlocked &&
                          game.prestigeLevel >= exp.reqPrestige &&
                          game.prestigeShards >= exp.unlockShards;
                        return (
                          <div
                            key={`farm-exp-${exp.size}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 10, opacity: 0.8 }}>
                              {exp.size}x{exp.size}{" "}
                              {exp.size === 3
                                ? "(starter)"
                                : `(M${exp.reqPrestige}, ${formatLargeNumber(exp.unlockShards)} platinum)`}
                            </span>
                            {unlocked ? (
                              <span style={{ fontSize: 10, opacity: 0.78 }}>
                                {game.activeFarmSize >= exp.size
                                  ? "Unlocked"
                                  : "Available"}
                              </span>
                            ) : (
                              <button
                                onClick={() => unlockFarmExpansion(exp.size)}
                                disabled={!canBuy}
                              >
                                Unlock
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {showResearchUnlocks ? (
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10,
                      padding: 8,
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.84 }}>
                      Platinum Labs (Permanent Sidegrades)
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.72 }}>
                      Starter labs unlock at M{RESEARCH_UNLOCK_MARKETING}.
                      Advanced labs unlock at M5.
                    </div>

                    {showShardUpgradesPanel ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        {SHARD_UPGRADES.map((upgrade) => {
                          const level = shardUpgradeLevel(game, upgrade.id);
                          const atCap = level >= upgrade.cap;
                          const cost = shardUpgradeCost(upgrade.id, level);
                          const reqMarketing =
                            shardUpgradeMarketingRequirement(upgrade.id);
                          const lockedByMarketing =
                            game.prestigeLevel < reqMarketing;
                          const canBuy =
                            !atCap &&
                            !lockedByMarketing &&
                            game.prestigeShards >= cost;
                          return (
                            <div
                              key={upgrade.id}
                              style={{
                                display: "grid",
                                gap: 2,
                                padding: "6px 0",
                                borderTop: "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontSize: 10 }}>
                                  {upgrade.label} Lv {level}/{upgrade.cap}
                                </span>
                                <button
                                  onClick={() => buyShardUpgrade(upgrade.id)}
                                  disabled={!canBuy}
                                >
                                  {atCap
                                    ? "Maxed"
                                    : lockedByMarketing
                                      ? `Locked (M${reqMarketing})`
                                      : `Buy (${formatLargeNumber(cost)})`}
                                </button>
                              </div>
                              <div style={{ fontSize: 10, opacity: 0.68 }}>
                                {upgrade.desc}
                              </div>
                              {lockedByMarketing ? (
                                <div style={{ fontSize: 10, opacity: 0.62 }}>
                                  Requires marketing level M{reqMarketing}.
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, opacity: 0.72 }}>
                        Labs unlock at marketing level M
                        {RESEARCH_UNLOCK_MARKETING}. Current level: M
                        {game.prestigeLevel}.
                      </div>
                    )}
                  </div>
                ) : null}

              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            flex: "2 1 680px",
            minWidth: 0,
            order: 1,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            className="card"
            style={{
              padding: 10,
              background:
                "linear-gradient(180deg, rgba(37,30,20,0.75), rgba(20,16,11,0.84))",
              borderColor: "rgba(255, 208, 140, 0.2)",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns:
                  game.prestigeLevel > 0
                    ? "repeat(3, minmax(0, 1fr))"
                    : "repeat(1, minmax(0, 1fr))",
              }}
            >
              <Stat label="Money" value={formatMoney(game.money)} />
              {game.prestigeLevel > 0 ? (
                <Stat
                  label="Marketing Level"
                  value={`M${formatLargeNumber(game.prestigeLevel)}`}
                />
              ) : null}
              {game.prestigeLevel > 0 ? (
                <Stat
                  label="Platinum"
                  value={formatLargeNumber(game.prestigeShards)}
                />
              ) : null}
            </div>
          </div>
          <div
            className="card"
            style={{
              padding: 12,
              background:
                "linear-gradient(180deg, rgba(37,30,20,0.75), rgba(20,16,11,0.84))",
              borderColor: "rgba(255, 208, 140, 0.2)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${game.activeFarmSize}, minmax(0, 1fr))`,
                gap: 4,
              }}
              onMouseLeave={() => setHoveredTileIndex(null)}
            >
              {visibleTileIndices.map((idx) => {
                const tile = game.tiles[idx];
                const plant = tile.plant;
                const seed = plant ? seedById(plant.seedId) : null;
                const stage = plant ? STAGES[plant.stageIndex] : null;
                const duration = plant
                  ? stageDurationWithTile(seed, plant.stageIndex, tile)
                  : 0;
                const remaining = plant
                  ? Math.max(0, duration - (now - plant.stageStartedAt))
                  : 0;
                const canHarvest = plant && plant.stageIndex >= 3;
                const harvestPreview = canHarvest
                  ? harvestValuePreview(game, tile)
                  : null;
                const seedTagLines = stageCropLabelLines(plant, seed);
                const progressTag = canHarvest
                  ? formatMoney(harvestPreview || 0)
                  : plant
                    ? `${stageProgressPercent(plant, seed, now, tile)}%`
                    : "--%";
                const blockerTag = blockerLabel(tile, seed, now);
                const blockerLines = splitNeedsLabel(blockerTag);
                const isPreview = previewIndices.has(idx);

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      tileAction(idx);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      tileAction(idx, { remove: true });
                    }}
                    onMouseEnter={() => setHoveredTileIndex(idx)}
                    onFocus={() => setHoveredTileIndex(idx)}
                    onBlur={() => setHoveredTileIndex(null)}
                    title={buildTileTitle(
                      tile,
                      seed,
                      stage,
                      remaining,
                      canHarvest,
                      game,
                    )}
                    style={{
                      aspectRatio: "1 / 1",
                      minHeight: 44,
                      padding: 0,
                      borderRadius: 4,
                      overflow: "hidden",
                      position: "relative",
                      border: tile.autoEverything
                        ? "1px solid rgba(126, 255, 180, 0.95)"
                        : tile.autoPlow ||
                            tile.autoWater ||
                            tile.autoPlant ||
                            tile.autoHarvest
                          ? "1px solid rgba(138, 196, 255, 0.95)"
                          : "1px solid rgba(0,0,0,0.45)",
                      outline: isPreview
                        ? "2px solid rgba(255, 240, 142, 0.95)"
                        : "none",
                      outlineOffset: -2,
                      fontSize: 7,
                      lineHeight: 1,
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                      imageRendering: "pixelated",
                      background: tileColor(tile),
                    }}
                  >
                    <TileSprite
                      tile={tile}
                      seed={seed}
                      tileIndex={idx}
                      animTick={animTick}
                    />
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                        pointerEvents: "none",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          left: "50%",
                          transform: "translateX(-50%)",
                          fontSize: topLabelFontSize,
                          textAlign: "center",
                          lineHeight: 0.9,
                          display: "grid",
                          gap: 0,
                          textShadow:
                            "0 0 2px rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.75)",
                        }}
                      >
                        {seedTagLines.map((line, i) => (
                          <span key={`${idx}-seed-${i}`}>{line}</span>
                        ))}
                      </span>
                      {showTileValueTags ? (
                        <span
                          style={{
                            position: "absolute",
                            bottom: 1,
                            left: 1,
                            fontSize: progressLabelFontSize,
                            textShadow:
                              "0 0 2px rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.75)",
                          }}
                        >
                          {progressTag}
                        </span>
                      ) : null}
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 1,
                          fontSize: blockerLabelFontSize,
                          lineHeight: 0.9,
                          textAlign: "center",
                          display: "grid",
                          gap: 0,
                          textShadow:
                            "0 0 2px rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.75)",
                        }}
                      >
                        {blockerLines.map((line, i) => (
                          <span key={`${idx}-blk-${i}`}>{line}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                fontSize: 11,
                opacity: 0.86,
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={showTileValueTags}
                onChange={(e) => setShowTileValueTags(e.target.checked)}
              />
              Show tile % / harvest values
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolButtonIcon({ toolId, size = 14 }) {
  const rects = getToolIconRects(toolId);
  if (rects.length <= 0) return null;
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
      aria-hidden="true"
    >
      {rects.map((r, i) => (
        <rect
          key={`${toolId}-icon-${i}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={r.c}
        />
      ))}
    </svg>
  );
}

function getToolIconRects(toolId) {
  if (toolId === "plow") {
    return [
      { x: 8, y: 1, w: 2, h: 10, c: "#9c6b3d" },
      { x: 6, y: 2, w: 4, h: 1, c: "#c4935e" },
      { x: 4, y: 10, w: 8, h: 3, c: "#bfc7cc" },
      { x: 4, y: 12, w: 8, h: 1, c: "#7f8a91" },
    ];
  }
  if (toolId === "plant") {
    return [
      { x: 3, y: 4, w: 10, h: 9, c: "#c8a06a" },
      { x: 4, y: 5, w: 8, h: 7, c: "#ad8656" },
      { x: 6, y: 2, w: 4, h: 2, c: "#d9b484" },
      { x: 7, y: 7, w: 2, h: 2, c: "#6f4a2c" },
      { x: 6, y: 9, w: 1, h: 1, c: "#6f4a2c" },
      { x: 9, y: 9, w: 1, h: 1, c: "#6f4a2c" },
    ];
  }
  if (toolId === "water") {
    return [
      { x: 3, y: 6, w: 8, h: 6, c: "#9aa8b6" },
      { x: 4, y: 7, w: 6, h: 4, c: "#738392" },
      { x: 10, y: 7, w: 3, h: 2, c: "#9aa8b6" },
      { x: 12, y: 8, w: 1, h: 1, c: "#d9e8f7" },
      { x: 4, y: 4, w: 5, h: 2, c: "#9aa8b6" },
      { x: 2, y: 7, w: 1, h: 3, c: "#9aa8b6" },
      { x: 13, y: 10, w: 1, h: 1, c: "#72beff" },
      { x: 12, y: 11, w: 1, h: 1, c: "#72beff" },
    ];
  }
  if (toolId === "harvest") {
    return [
      { x: 8, y: 1, w: 2, h: 11, c: "#9b6d3f" },
      { x: 4, y: 3, w: 5, h: 2, c: "#bfc7cc" },
      { x: 2, y: 4, w: 3, h: 1, c: "#bfc7cc" },
      { x: 1, y: 5, w: 2, h: 1, c: "#8a949b" },
      { x: 9, y: 12, w: 2, h: 2, c: "#c4935e" },
    ];
  }
  if (toolId === "marketing") {
    return [
      { x: 2, y: 8, w: 10, h: 6, c: "#5b4733" },
      { x: 3, y: 9, w: 8, h: 4, c: "#6c573f" },
      { x: 4, y: 10, w: 6, h: 2, c: "#7b654a" },
      { x: 6, y: 5, w: 3, h: 3, c: "#d9c36d" },
      { x: 7, y: 6, w: 1, h: 1, c: "#8d7b32" },
      { x: 11, y: 7, w: 3, h: 2, c: "#a08e45" },
      { x: 12, y: 8, w: 1, h: 1, c: "#d9c36d" },
    ];
  }
  if (toolId === "save") {
    return [
      { x: 2, y: 2, w: 12, h: 12, c: "#7d8b9a" },
      { x: 4, y: 3, w: 8, h: 3, c: "#d7e4ef" },
      { x: 5, y: 8, w: 6, h: 5, c: "#48596b" },
      { x: 9, y: 9, w: 1, h: 3, c: "#d7e4ef" },
      { x: 6, y: 9, w: 2, h: 2, c: "#a7b8c8" },
    ];
  }
  if (toolId === "expandFarm") {
    return [
      { x: 1, y: 8, w: 14, h: 6, c: "#5f7a3b" },
      { x: 1, y: 9, w: 14, h: 1, c: "#45622d" },
      { x: 5, y: 5, w: 6, h: 6, c: "#b57944" },
      { x: 6, y: 6, w: 4, h: 4, c: "#c98d58" },
      { x: 4, y: 4, w: 8, h: 2, c: "#8f4e32" },
      { x: 7, y: 7, w: 2, h: 3, c: "#3a2a1f" },
      { x: 2, y: 2, w: 2, h: 2, c: "#7fb65b" },
      { x: 12, y: 3, w: 2, h: 3, c: "#7fb65b" },
    ];
  }
  if (toolId === "animals") {
    return [
      { x: 2, y: 8, w: 10, h: 4, c: "#9e7347" },
      { x: 3, y: 6, w: 8, h: 3, c: "#b68858" },
      { x: 10, y: 5, w: 3, h: 3, c: "#9e7347" },
      { x: 12, y: 4, w: 2, h: 2, c: "#b68858" },
      { x: 5, y: 12, w: 1, h: 3, c: "#4a3523" },
      { x: 9, y: 12, w: 1, h: 3, c: "#4a3523" },
      { x: 12, y: 12, w: 1, h: 3, c: "#4a3523" },
      { x: 12, y: 5, w: 1, h: 1, c: "#1f1610" },
      { x: 1, y: 7, w: 2, h: 2, c: "#9e7347" },
    ];
  }
  if (toolId === "research") {
    return [
      { x: 6, y: 1, w: 4, h: 2, c: "#dfe8f1" },
      { x: 5, y: 3, w: 6, h: 1, c: "#b8c7d6" },
      { x: 4, y: 4, w: 8, h: 1, c: "#8ca0b3" },
      { x: 5, y: 5, w: 6, h: 6, c: "#6a7f92" },
      { x: 4, y: 11, w: 8, h: 3, c: "#53bbd6" },
      { x: 6, y: 12, w: 1, h: 1, c: "#9eff8d" },
      { x: 8, y: 12, w: 1, h: 1, c: "#ffd572" },
      { x: 10, y: 12, w: 1, h: 1, c: "#ff8fc2" },
    ];
  }
  return [];
}

function Stat({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.75 }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 12 }}>{value}</div>
    </div>
  );
}

function tileColor(tile) {
  if (tile.soil !== "plowed") return "#463423";
  if (!tile.plant) return tile.watered ? "#4d6a84" : "#6f4f33";

  const stage = tile.plant.stageIndex;
  if (stage === 0) return tile.watered ? "#516f5d" : "#5b5b38";
  if (stage === 1) return tile.watered ? "#5f8c4b" : "#6c7e43";
  if (stage === 2) return tile.watered ? "#3f8d3f" : "#5b7d3d";
  if (stage === 3) return tile.watered ? "#3d9345" : "#6f964a";
  return tile.watered ? "#5d7d42" : "#807240";
}

function TileSprite({ tile, seed, tileIndex = 0, animTick = 0 }) {
  const soil =
    tile.soil !== "plowed" ? "#5a3e28" : tile.watered ? "#4a6a7a" : "#6f4d32";
  const seedPalette = getSeedPalette(seed?.id);
  const stage = tile.plant?.stageIndex ?? -1;
  const plantXOffset = 1;
  const animals = tileAnimalIds(tile).slice(0, MAX_ANIMALS_PER_TILE);
  const animalSlots = [
    [0, 10],
    [5, 10],
    [2, 7],
  ];

  const stageRects = [];
  if (stage >= 0) {
    if (stage === 0) {
      stageRects.push({ x: 7, y: 11, w: 2, h: 2, c: seedPalette.seed });
    }
    if (stage >= 1) {
      stageRects.push({ x: 7, y: 9, w: 2, h: 4, c: seedPalette.stem });
      stageRects.push({ x: 6, y: 8, w: 1, h: 2, c: seedPalette.leaf });
      stageRects.push({ x: 9, y: 8, w: 1, h: 2, c: seedPalette.leaf });
    }
    if (stage >= 2) {
      stageRects.push({ x: 6, y: 6, w: 4, h: 2, c: seedPalette.leaf });
      stageRects.push({ x: 5, y: 7, w: 1, h: 2, c: seedPalette.leafDark });
      stageRects.push({ x: 10, y: 7, w: 1, h: 2, c: seedPalette.leafDark });
      // Stage 3 (index 2) extends stage 2 with a taller canopy.
      stageRects.push({ x: 7, y: 5, w: 2, h: 1, c: seedPalette.leaf });
      stageRects.push({ x: 7, y: 4, w: 2, h: 1, c: seedPalette.leafDark });
    }
    stageRects.push(...getCropStageRects(seed?.id, stage, seedPalette));
  }
  const shiftedStageRects = stageRects.map((r) => ({
    ...r,
    x: Math.min(16 - r.w, r.x + plantXOffset),
  }));

  return (
    <svg
      viewBox="0 0 16 16"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        shapeRendering: "crispEdges",
      }}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="16" height="16" fill={soil} />

      {tile.soil !== "plowed" ? (
        <>
          <rect x="1" y="2" width="3" height="1" fill="#4a2f1e" />
          <rect x="10" y="5" width="4" height="1" fill="#4a2f1e" />
          <rect x="3" y="11" width="5" height="1" fill="#4a2f1e" />
        </>
      ) : (
        <>
          <rect
            x="0"
            y="12"
            width="16"
            height="4"
            fill={tile.watered ? "#355a6c" : "#5a3f29"}
          />
          {shiftedStageRects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
          ))}
        </>
      )}

      {tile.autoEverything ? (
        <rect x="0" y="0" width="3" height="3" fill="#7bffb7" />
      ) : null}
      {!tile.autoEverything && tile.autoWater ? (
        <rect x="0" y="0" width="2" height="2" fill="#72beff" />
      ) : null}
      {!tile.autoEverything && tile.autoPlow ? (
        <rect x="0" y="14" width="2" height="2" fill="#f6c87a" />
      ) : null}
      {!tile.autoEverything && tile.autoPlant ? (
        <rect x="14" y="14" width="2" height="2" fill="#9eff8d" />
      ) : null}
      {!tile.autoEverything && tile.autoHarvest ? (
        <rect x="14" y="0" width="2" height="2" fill="#ffe17d" />
      ) : null}
      {animals.map((animalId, slotIdx) => {
        const cycleIdx =
          (animTick + tileIndex + slotIdx) % ANIMAL_ANIM_CYCLE.length;
        const frame = ANIMAL_ANIM_CYCLE[cycleIdx];
        return getAnimalSpriteRects(
          animalId,
          animalSlots[slotIdx]?.[0] ?? 0,
          animalSlots[slotIdx]?.[1] ?? 10,
          frame,
        ).map((r, i) => (
          <rect
            key={`animal-${slotIdx}-${i}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={r.c}
          />
        ));
      })}
    </svg>
  );
}

function AnimalSprite({ animalId, size = 16 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="16" height="16" fill="rgba(0,0,0,0.14)" />
      {getAnimalSpriteRects(animalId, 2, 2).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
      ))}
    </svg>
  );
}

function getAnimalSpriteRects(animalId, offsetX = 0, offsetY = 10, frame = 0) {
  const f = Math.max(0, Math.min(2, Number(frame) || 0));
  const jump = f === 1 ? -1 : f === 2 ? -2 : 0;
  const sway = f === 0 ? 0 : f === 1 ? 1 : 0;
  if (animalId === "chicken") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 2 + jump,
        w: 3,
        h: 2,
        c: "#f5f0e8",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 1 + jump,
        w: 1,
        h: 1,
        c: "#f5f0e8",
      },
      {
        x: offsetX + 3 + sway,
        y: offsetY + 1 + jump,
        w: 1,
        h: 1,
        c: "#cf3737",
      },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#f0c15a",
      },
      ...(f === 2
        ? [
            {
              x: offsetX + 2 + sway,
              y: offsetY + 4 + jump,
              w: 1,
              h: 1,
              c: "#f0c15a",
            },
          ]
        : []),
    ];
  }
  if (animalId === "cow") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 1 + jump,
        w: 4,
        h: 3,
        c: "#f2f2f2",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#202020",
      },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 1 + jump,
        w: 1,
        h: 1,
        c: "#202020",
      },
      {
        x: offsetX + 0 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#f2f2f2",
      },
      ...(f === 2
        ? [
            {
              x: offsetX + 1 + sway,
              y: offsetY + 4 + jump,
              w: 1,
              h: 1,
              c: "#202020",
            },
          ]
        : []),
    ];
  }
  if (animalId === "bee") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 2 + jump,
        w: 3,
        h: 2,
        c: "#f2c83f",
      },
      { x: offsetX + 1 + sway, y: offsetY + 2 + jump, w: 1, h: 2, c: "#222" },
      { x: offsetX + 3 + sway, y: offsetY + 2 + jump, w: 1, h: 2, c: "#222" },
      {
        x: offsetX + 2 + sway,
        y: offsetY + (f === 1 ? 0 : 1) + jump,
        w: 2,
        h: 1,
        c: "#bfe2ff",
      },
    ];
  }
  if (animalId === "pig") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 1 + jump,
        w: 4,
        h: 3,
        c: "#f3a6be",
      },
      {
        x: offsetX + 0 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#f3a6be",
      },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#f08fae",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#d96f90",
      },
      ...(f === 2
        ? [
            {
              x: offsetX + 3 + sway,
              y: offsetY + 4 + jump,
              w: 1,
              h: 1,
              c: "#d96f90",
            },
          ]
        : []),
    ];
  }
  if (animalId === "rabbit") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 1 + jump,
        w: 3,
        h: 3,
        c: "#e9e9e9",
      },
      { x: offsetX + 1 + sway, y: offsetY + jump, w: 1, h: 2, c: "#e9e9e9" },
      { x: offsetX + 3 + sway, y: offsetY + jump, w: 1, h: 2, c: "#e9e9e9" },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#b7b7b7",
      },
    ];
  }
  if (animalId === "goat") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 1 + jump,
        w: 4,
        h: 3,
        c: "#d9d2be",
      },
      { x: offsetX + sway, y: offsetY + 2 + jump, w: 1, h: 1, c: "#d9d2be" },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 1 + jump,
        w: 1,
        h: 1,
        c: "#9b8f72",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 1 + jump,
        w: 1,
        h: 1,
        c: "#9b8f72",
      },
    ];
  }
  if (animalId === "duck") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 2 + jump,
        w: 3,
        h: 2,
        c: "#f0efe8",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 1 + jump,
        w: 2,
        h: 1,
        c: "#f0efe8",
      },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#efb45e",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 4 + jump,
        w: 2,
        h: 1,
        c: "#efb45e",
      },
    ];
  }
  if (animalId === "fox") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 2 + jump,
        w: 4,
        h: 2,
        c: "#d77a3b",
      },
      {
        x: offsetX + 3 + sway,
        y: offsetY + 1 + jump,
        w: 2,
        h: 1,
        c: "#d77a3b",
      },
      { x: offsetX + sway, y: offsetY + 3 + jump, w: 1, h: 1, c: "#f2dfc9" },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#f2dfc9",
      },
    ];
  }
  if (animalId === "alpaca") {
    return [
      {
        x: offsetX + 1 + sway,
        y: offsetY + 1 + jump,
        w: 4,
        h: 3,
        c: "#efe6d4",
      },
      { x: offsetX + 4 + sway, y: offsetY + jump, w: 1, h: 2, c: "#efe6d4" },
      {
        x: offsetX + 2 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#b8aa8f",
      },
      { x: offsetX + sway, y: offsetY + 3 + jump, w: 1, h: 1, c: "#efe6d4" },
    ];
  }
  if (animalId === "firefly") {
    return [
      {
        x: offsetX + 2 + sway,
        y: offsetY + 2 + jump,
        w: 2,
        h: 2,
        c: "#f1d94f",
      },
      {
        x: offsetX + 1 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#2a2a2a",
      },
      {
        x: offsetX + 4 + sway,
        y: offsetY + 2 + jump,
        w: 1,
        h: 1,
        c: "#2a2a2a",
      },
      {
        x: offsetX + 2 + sway,
        y: offsetY + (f === 2 ? 1 : 0) + jump,
        w: 2,
        h: 1,
        c: "#b9f5a8",
      },
    ];
  }
  return [];
}

function getCropStageRects(seedId, stage, palette) {
  const out = [];
  if (stage < 2) return out;

  // Stage index 2 (UI stage 3): baby produce markers.
  // Stage index 3 (UI stage 4): adult produce.
  // Stage index 4 (UI stage 5): old produce tint.
  const baby = stage === 2;
  const old = stage >= 4;
  const fruitColor = old ? palette.old : palette.fruit;
  const hiColor = old ? palette.old : palette.fruitHi;

  // Stage 3: baby produce appears on the taller plant.
  // Stage 4+: mature produce with recognizable silhouettes.
  if (seedId === "carrot") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 6, y: 5, w: 4, h: 5, c: fruitColor });
      out.push({ x: 7, y: 10, w: 2, h: 3, c: fruitColor });
      out.push({ x: 6, y: 5, w: 1, h: 4, c: hiColor });
    }
    return out;
  }

  if (seedId === "corn") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 6, y: 3, w: 3, h: 9, c: fruitColor });
      out.push({ x: 9, y: 4, w: 3, h: 8, c: fruitColor });
      out.push({ x: 6, y: 3, w: 1, h: 9, c: hiColor });
      out.push({ x: 9, y: 4, w: 1, h: 8, c: hiColor });
    }
    return out;
  }

  if (seedId === "rose") {
    if (baby) {
      out.push({ x: 8, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 7, y: 6, w: 1, h: 1, c: hiColor });
      out.push({ x: 9, y: 6, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 7, y: 3, w: 3, h: 3, c: fruitColor });
      out.push({ x: 6, y: 4, w: 1, h: 1, c: fruitColor });
      out.push({ x: 10, y: 4, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 2, c: hiColor });
    }
    return out;
  }

  if (seedId === "tulip") {
    if (baby) {
      out.push({ x: 8, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 7, y: 3, w: 3, h: 6, c: fruitColor });
      out.push({ x: 8, y: 2, w: 1, h: 1, c: hiColor });
      out.push({ x: 6, y: 4, w: 1, h: 2, c: hiColor });
      out.push({ x: 10, y: 4, w: 1, h: 2, c: hiColor });
    }
    return out;
  }

  if (seedId === "pumpkin") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 4, y: 5, w: 8, h: 6, c: fruitColor });
      out.push({ x: 7, y: 4, w: 2, h: 1, c: hiColor });
      out.push({ x: 5, y: 5, w: 1, h: 6, c: hiColor });
      out.push({ x: 10, y: 5, w: 1, h: 6, c: hiColor });
    }
    return out;
  }

  if (seedId === "berry") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 4, y: 6, w: 4, h: 4, c: fruitColor });
      out.push({ x: 8, y: 5, w: 4, h: 5, c: fruitColor });
      out.push({ x: 5, y: 6, w: 1, h: 1, c: hiColor });
      out.push({ x: 9, y: 6, w: 1, h: 1, c: hiColor });
    }
    return out;
  }

  if (seedId === "turnip") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 5, y: 6, w: 6, h: 6, c: fruitColor });
      out.push({ x: 7, y: 5, w: 2, h: 1, c: hiColor });
      out.push({ x: 8, y: 12, w: 1, h: 1, c: fruitColor });
    }
    return out;
  }

  if (seedId === "lotus") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 5, y: 3, w: 6, h: 7, c: fruitColor });
      out.push({ x: 4, y: 5, w: 1, h: 3, c: fruitColor });
      out.push({ x: 11, y: 5, w: 1, h: 3, c: fruitColor });
      out.push({ x: 7, y: 3, w: 2, h: 1, c: hiColor });
    }
    return out;
  }

  if (seedId === "lavender") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 6, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 6, y: 3, w: 1, h: 5, c: fruitColor });
      out.push({ x: 7, y: 2, w: 1, h: 6, c: fruitColor });
      out.push({ x: 8, y: 2, w: 1, h: 6, c: fruitColor });
      out.push({ x: 9, y: 3, w: 1, h: 5, c: fruitColor });
      out.push({ x: 10, y: 4, w: 1, h: 4, c: fruitColor });
      out.push({ x: 8, y: 2, w: 1, h: 2, c: hiColor });
    }
    return out;
  }

  if (seedId === "sunflower") {
    if (baby) {
      out.push({ x: 8, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 7, y: 6, w: 1, h: 1, c: hiColor });
      out.push({ x: 9, y: 6, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 7, y: 3, w: 4, h: 4, c: fruitColor });
      out.push({ x: 6, y: 4, w: 1, h: 1, c: hiColor });
      out.push({ x: 11, y: 4, w: 1, h: 1, c: hiColor });
      out.push({ x: 8, y: 2, w: 1, h: 1, c: hiColor });
      out.push({ x: 9, y: 2, w: 1, h: 1, c: hiColor });
      out.push({ x: 8, y: 7, w: 1, h: 1, c: hiColor });
      out.push({ x: 9, y: 7, w: 1, h: 1, c: hiColor });
    }
    return out;
  }

  if (seedId === "cacao") {
    if (baby) {
      out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
      out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
      out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
    } else {
      out.push({ x: 5, y: 4, w: 4, h: 7, c: fruitColor });
      out.push({ x: 9, y: 5, w: 3, h: 6, c: fruitColor });
      out.push({ x: 6, y: 5, w: 1, h: 5, c: hiColor });
      out.push({ x: 10, y: 6, w: 1, h: 4, c: hiColor });
    }
    return out;
  }

  // basic grain and fallback
  if (baby) {
    out.push({ x: 7, y: 5, w: 1, h: 1, c: fruitColor });
    out.push({ x: 8, y: 6, w: 1, h: 1, c: fruitColor });
    out.push({ x: 9, y: 5, w: 1, h: 1, c: hiColor });
  } else {
    out.push({ x: 5, y: 4, w: 6, h: 7, c: fruitColor });
    out.push({ x: 7, y: 3, w: 2, h: 1, c: hiColor });
  }
  return out;
}

function getSeedPalette(seedId) {
  if (seedId === "carrot") {
    return {
      seed: "#f3d9b4",
      stem: "#74c75f",
      leaf: "#91dd78",
      leafDark: "#4b9640",
      fruit: "#e07c2d",
      fruitHi: "#f7a24d",
      old: "#8e663f",
    };
  }
  if (seedId === "corn") {
    return {
      seed: "#f1e4a8",
      stem: "#76c166",
      leaf: "#95d67a",
      leafDark: "#4b9240",
      fruit: "#e8c74d",
      fruitHi: "#f6df82",
      old: "#8b7b49",
    };
  }
  if (seedId === "rose") {
    return {
      seed: "#f4d3d7",
      stem: "#66b86b",
      leaf: "#82d286",
      leafDark: "#3d8d47",
      fruit: "#c84357",
      fruitHi: "#ec6f83",
      old: "#7d5b4d",
    };
  }
  if (seedId === "tulip") {
    return {
      seed: "#f0dac0",
      stem: "#64b769",
      leaf: "#81d187",
      leafDark: "#3f8f49",
      fruit: "#f09431",
      fruitHi: "#ffc46f",
      old: "#876546",
    };
  }
  if (seedId === "lotus") {
    return {
      seed: "#efe0b2",
      stem: "#66b880",
      leaf: "#7fd49a",
      leafDark: "#3b8b68",
      fruit: "#d2a43f",
      fruitHi: "#f0cd72",
      old: "#8d6f42",
    };
  }
  if (seedId === "cacao") {
    return {
      seed: "#dfc4a1",
      stem: "#5caf66",
      leaf: "#74c17a",
      leafDark: "#3e7f47",
      fruit: "#7d5131",
      fruitHi: "#a06a43",
      old: "#5d4632",
    };
  }
  if (seedId === "lavender") {
    return {
      seed: "#e4d8ef",
      stem: "#62ad72",
      leaf: "#7bc589",
      leafDark: "#417d4d",
      fruit: "#8d67c9",
      fruitHi: "#b090e6",
      old: "#6c5a55",
    };
  }
  if (seedId === "sunflower") {
    return {
      seed: "#efe0a6",
      stem: "#66b364",
      leaf: "#84d17c",
      leafDark: "#417f42",
      fruit: "#d8a529",
      fruitHi: "#f1d16b",
      old: "#856b42",
    };
  }
  if (seedId === "turnip") {
    return {
      seed: "#f5d28e",
      stem: "#6fc95f",
      leaf: "#8de07a",
      leafDark: "#4f9d41",
      fruit: "#d8d3de",
      fruitHi: "#f1eef4",
      old: "#9f958d",
    };
  }
  if (seedId === "berry") {
    return {
      seed: "#a8c6ff",
      stem: "#53b96a",
      leaf: "#7ae08e",
      leafDark: "#3a8f4f",
      fruit: "#7a59d9",
      fruitHi: "#ac8cff",
      old: "#6f5c4d",
    };
  }
  if (seedId === "pumpkin") {
    return {
      seed: "#eddab1",
      stem: "#65b75c",
      leaf: "#80cf73",
      leafDark: "#3f8440",
      fruit: "#da7f2b",
      fruitHi: "#f3a34d",
      old: "#8c673e",
    };
  }
  return {
    seed: "#efe8b8",
    stem: "#6cc35a",
    leaf: "#8fdc6a",
    leafDark: "#4a9b3f",
    fruit: "#d5c96f",
    fruitHi: "#ebe08a",
    old: "#8a7c4b",
  };
}

function harvestValuePreview(state, tile) {
  if (!tile?.plant || tile.plant.stageIndex < 3) return 0;
  const seed = seedById(tile.plant.seedId);
  if (!seed) return 0;

  const upgrades = shardUpgradeEffects(state);
  const stage = tile.plant.stageIndex;
  const isMature = stage === 3;
  let gain = stage >= 4 ? seed.oldValue : seed.matureValue;

  const seedMatureBonus = Math.max(0, Number(seed?.traits?.matureBonus || 0));
  const matureBonus =
    seedMatureBonus +
    tileAnimalTrait(tile, "matureBonus") +
    upgrades.matureBonus;
  if (isMature && matureBonus > 0) gain *= 1 + matureBonus;

  // Use expected jackpot value so the label reflects average harvest return.
  const seedJackpot = Math.max(0, Number(seed?.traits?.jackpot || 0));
  const jackpotChance = clamp(
    seedJackpot + tileAnimalTrait(tile, "jackpot") + upgrades.jackpot,
    0,
    0.95,
  );
  if (jackpotChance > 0) gain *= 1 + jackpotChance;

  const marketBonus = marketBonusForHarvest(state, tile, seed.id);
  if (marketBonus > 0) gain *= 1 + marketBonus;

  const eraYieldBonus = seedEraYieldBonus(state, seed.id);
  if (eraYieldBonus > 0) gain *= 1 + eraYieldBonus;

  gain *= 1 + Math.max(0, Number(state?.prestigeLevel || 0)) * 0.08;
  return Math.max(1, Math.floor(gain));
}

function seedSellValuePreview(state, seedId, stageIndex) {
  return harvestValuePreview(state, {
    animals: [],
    plant: {
      seedId,
      stageIndex: clamp(Number(stageIndex || 3), 3, 4),
    },
  });
}

function buildTileTitle(
  tile,
  seed,
  stage,
  remaining,
  canHarvest,
  state = null,
) {
  const names = tileAnimalIds(tile)
    .map((id) => animalById(id)?.name)
    .filter(Boolean);
  const animalState = names.length > 0 ? `Animals: ${names.join(", ")}` : null;
  const quick = tileAnimalTrait(tile, "quick");
  const matureBonus = tileAnimalTrait(tile, "matureBonus");
  const jackpot = tileAnimalTrait(tile, "jackpot");
  const drought = tileAnimalTrait(tile, "droughtGuard");
  const thrift = tileAnimalTrait(tile, "thrift");
  const regrow = tileAnimalTrait(tile, "regrow");
  const animalEffects = [];
  if (quick > 0) animalEffects.push(`Quick +${Math.round(quick * 100)}%`);
  if (matureBonus > 0)
    animalEffects.push(`Mature +${Math.round(matureBonus * 100)}%`);
  if (jackpot > 0) animalEffects.push(`Jackpot +${Math.round(jackpot * 100)}%`);
  if (drought > 0) animalEffects.push(`Drought +${Math.round(drought * 100)}%`);
  if (thrift > 0) animalEffects.push(`Thrift +${Math.round(thrift * 100)}%`);
  if (regrow > 0) animalEffects.push(`Regrow +${Math.round(regrow * 100)}%`);
  const animalEffectsState =
    animalEffects.length > 0
      ? `Animal Effects: ${animalEffects.join(" | ")}`
      : null;
  const autoState = tile.autoEverything
    ? "Auto: everything"
    : tile.autoPlow || tile.autoWater || tile.autoPlant || tile.autoHarvest
      ? `Auto: ${tile.autoPlow ? "plow " : ""}${tile.autoWater ? "water " : ""}${tile.autoPlant ? "plant " : ""}${tile.autoHarvest ? "harvest" : ""}`.trim()
      : null;
  const seasonalBonus =
    seed && state ? marketBonusForHarvest(state, tile, seed.id) : 0;
  const marketState =
    seasonalBonus > 0 && state
      ? `${currentMarketSeason(Date.now()).label}: +${Math.round(seasonalBonus * 100)}%`
      : null;
  if (tile.soil !== "plowed") {
    const parts = ["Unplowed soil. Use Plow."];
    if (animalState) parts.push(animalState);
    if (animalEffectsState) parts.push(animalEffectsState);
    if (autoState) parts.push(autoState);
    if (marketState) parts.push(marketState);
    return parts.join(" | ");
  }
  if (!tile.plant) {
    const soilState = tile.watered ? "Plowed and watered." : "Plowed and dry.";
    const parts = [soilState];
    if (animalState) parts.push(animalState);
    if (animalEffectsState) parts.push(animalEffectsState);
    if (autoState) parts.push(autoState);
    if (marketState) parts.push(marketState);
    return parts.join(" | ");
  }

  const waterState = tile.plant.stageWatered
    ? "Watered for this stage"
    : "Needs water this stage";
  const lockedWatering =
    tile.plant.stageIndex >= 3 ? "Watering disabled at stage 4+" : waterState;
  const harvestState = canHarvest ? "Harvestable now" : "Not harvestable yet";
  const nextStageState =
    tile.plant.stageIndex >= STAGES.length - 1
      ? "Final stage"
      : `Next stage in: ${formatDuration(remaining)}`;
  const parts = [
    seed.name,
    stage.label,
    lockedWatering,
    harvestState,
    nextStageState,
  ];
  if (animalState) parts.push(animalState);
  if (animalEffectsState) parts.push(animalEffectsState);
  if (autoState) parts.push(autoState);
  if (marketState) parts.push(marketState);
  return parts.join(" | ");
}
