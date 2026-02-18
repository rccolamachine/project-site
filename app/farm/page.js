"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DesktopBadge from "../../components/DesktopBadge";
import { decryptSaveJsonPayload, encryptSaveJson } from "./farmSaveCrypto";
import {
  countLabel,
  formatLogClock,
  formatMoneyAdaptive,
} from "./farmFormatters";
import {
  AnimalSprite,
  buildTileTitle,
  harvestValuePreview,
  seedSellValuePreview,
  Stat,
  tileColor,
  TileSprite,
  ToolButtonIcon,
} from "./farmUiHelpers";
import "./farm.css";

import {
  ACTION_TOOLS,
  ANIMAL_ANIM_INTERVAL_MS,
  ANIMALS,
  BRUSHES,
  FARM_EXPANSIONS,
  GAME_TICK_MS,
  GRID_SIZE,
  MAX_ANIMALS_PER_TILE,
  PRESTIGE_MILESTONES,
  SEEDS,
  SHARD_UPGRADES,
  STORAGE_KEY,
  TILE_COUNT,
  TOOLS,
} from "../../lib/farm/config";
import {
  PRESTIGE_GROWTH_SPEED_PER_LEVEL,
  PRESTIGE_MAX_GROWTH_SPEED,
  PRESTIGE_START_MONEY_PER_LEVEL,
  RESEARCH_UNLOCK_MARKETING,
  STAGES,
} from "../../lib/farm/curveParams";

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
  shardUpgradeById,
  shardUpgradeCost,
  shardUpgradeLevel,
  shardUpgradeMarketingRequirement,
  splitNeedsLabel,
  stageCropLabelLines,
  stageDurationWithTile,
  stageProgressPercent,
  tileAnimalIds,
  updateDiscoveries,
  waterTile,
  harvestTile,
} from "../../lib/farm/engine";

const LOG_BATCH_MS = 15000;
const LOG_MAX_ENTRIES = 50;
const LOG_FILTERS = [
  { id: "all", label: "All" },
  { id: "earning", label: "Earnings" },
  { id: "bonus", label: "Bonuses" },
  { id: "spending", label: "Spending" },
  { id: "upgrade", label: "Upgrades" },
];

const BONUS_LOG_LABELS = {
  jackpot: "luck jackpot",
  regrow: "multi-spawn",
  thrift_refund: "thrift refund",
  seasonal: "seasonal boost",
};

const AUTO_LABEL_BY_KEY = {
  autoPlow: "Plow",
  autoWater: "Water",
  autoPlant: "Plant",
  autoHarvest: "Harvest",
};

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
  const batchedLogRef = useRef({
    earnings: 0,
    harvests: 0,
    bonuses: {},
    spending: {},
  });
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
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");

  const appendLog = useCallback((entry) => {
    const timestamp = Number(entry?.at || Date.now());
    setLogs((prev) => {
      const nextId =
        prev.reduce(
          (maxId, item) => Math.max(maxId, Number(item?.id || 0)),
          0,
        ) + 1;
      return [
        {
          id: nextId,
          at: timestamp,
          tone: entry?.tone || "neutral",
          category: entry?.category || "system",
          text: entry?.text || "",
        },
        ...prev,
      ].slice(0, LOG_MAX_ENTRIES);
    });
  }, []);

  const queueRuntimeEvent = useCallback((event) => {
    if (!event || typeof event !== "object") return;
    if (event.kind === "earning") {
      const amount = Math.max(0, Math.floor(Number(event.amount || 0)));
      const count = Math.max(1, Math.floor(Number(event.count || 1)));
      if (amount <= 0) return;
      batchedLogRef.current.earnings += amount;
      batchedLogRef.current.harvests += count;
      return;
    }
    if (event.kind === "bonus") {
      const source = String(event.source || "bonus");
      const amount = Math.max(0, Math.floor(Number(event.amount || 0)));
      const count = Math.max(1, Math.floor(Number(event.count || 1)));
      const bucket = batchedLogRef.current.bonuses[source] || {
        amount: 0,
        count: 0,
      };
      bucket.amount += amount;
      bucket.count += count;
      batchedLogRef.current.bonuses[source] = bucket;
      return;
    }
    if (event.kind === "spend") {
      const source = String(event.source || "spend");
      const amount = Math.max(0, Math.floor(Number(event.amount || 0)));
      const count = Math.max(1, Math.floor(Number(event.count || 1)));
      if (amount <= 0) return;
      const bucket = batchedLogRef.current.spending[source] || {
        amount: 0,
        count: 0,
      };
      bucket.amount += amount;
      bucket.count += count;
      batchedLogRef.current.spending[source] = bucket;
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const snapshot = batchedLogRef.current;
      const earned = Math.max(0, Math.floor(snapshot.earnings || 0));
      const harvests = Math.max(0, Math.floor(snapshot.harvests || 0));
      const bonusEntries = Object.entries(snapshot.bonuses || {}).filter(
        ([, value]) => (value?.count || 0) > 0 || (value?.amount || 0) > 0,
      );
      const spendEntries = Object.entries(snapshot.spending || {}).filter(
        ([, value]) => (value?.count || 0) > 0 || (value?.amount || 0) > 0,
      );
      if (earned <= 0 && bonusEntries.length <= 0 && spendEntries.length <= 0) {
        return;
      }

      if (earned > 0) {
        appendLog({
          at: Date.now(),
          tone: "earning",
          category: "earning",
          text: `+${formatMoney(earned)} earnings from ${formatLargeNumber(harvests)} ${countLabel(harvests, "harvest")}.`,
        });
      }
      if (bonusEntries.length > 0) {
        const bonusText = bonusEntries
          .map(([source, value]) => {
            const label = BONUS_LOG_LABELS[source] || source;
            const countText = `x${formatLargeNumber(Math.max(1, Math.floor(value.count || 1)))}`;
            const amount = Math.max(0, Math.floor(value.amount || 0));
            if (amount > 0)
              return `${label} ${countText} (+${formatMoney(amount)})`;
            return `${label} ${countText}`;
          })
          .join(", ");
        appendLog({
          at: Date.now(),
          tone: "bonus",
          category: "bonus",
          text: `Bonuses: ${bonusText}.`,
        });
      }
      if (spendEntries.length > 0) {
        const totalSpent = spendEntries.reduce(
          (sum, [, value]) => sum + Math.max(0, Number(value.amount || 0)),
          0,
        );
        const spendText = spendEntries
          .map(([source, value]) => {
            const sourceLabel = source === "seed" ? "seeds" : source;
            return `${sourceLabel} x${formatLargeNumber(Math.max(1, Math.floor(value.count || 1)))}`;
          })
          .join(", ");
        appendLog({
          at: Date.now(),
          tone: "spend",
          category: "spending",
          text: `Spent ${formatMoney(totalSpent)} on ${spendText}.`,
        });
      }
      batchedLogRef.current = {
        earnings: 0,
        harvests: 0,
        bonuses: {},
        spending: {},
      };
    }, LOG_BATCH_MS);
    return () => clearInterval(id);
  }, [appendLog, ready]);

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
        next.__runtimeEventSink = queueRuntimeEvent;
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
  }, [queueRuntimeEvent, ready]);

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
      next.__runtimeEventSink = queueRuntimeEvent;
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
    const expansion = farmExpansionBySize(size);
    if (!expansion || size <= 3) return;
    if (game.farmSizeUnlocks?.[size]) return;
    if (game.prestigeLevel < expansion.reqPrestige) return;
    if (game.prestigeShards < expansion.unlockShards) return;
    const idx = FARM_EXPANSIONS.findIndex((exp) => exp.size === size);
    if (idx > 0) {
      const prevSize = FARM_EXPANSIONS[idx - 1].size;
      if (!game.farmSizeUnlocks?.[prevSize]) return;
    }
    mutate((state) => {
      state.prestigeShards -= expansion.unlockShards;
      state.farmSizeUnlocks[size] = true;
      state.activeFarmSize = Math.max(Number(state.activeFarmSize || 3), size);
    });
    appendLog({
      tone: "spend",
      category: "upgrade",
      text: `Unlocked farm expansion ${size}x${size} for ${formatLargeNumber(expansion.unlockShards)} platinum.`,
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
        selectedSeed: "basic",
        brushUnlocks: {
          plow: { "1x1": true },
          water: { "1x1": true },
          plant: { "1x1": true },
          harvest: { "1x1": true },
        },
        selectedBrushes: {
          plow: "1x1",
          water: "1x1",
          plant: "1x1",
          harvest: "1x1",
        },
        discovered: {
          seeds: {},
          tools: { ...(prev.discovered?.tools || {}) },
          animals: { ...(prev.discovered?.animals || {}) },
          automation: {
            plow: false,
            water: false,
            plant: false,
            harvest: false,
          },
          brushes: {
            plow: { "1x1": true },
            water: { "1x1": true },
            plant: { "1x1": true },
            harvest: { "1x1": true },
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
      next.__runtimeEventSink = queueRuntimeEvent;
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
    appendLog({
      tone: "upgrade",
      category: "upgrade",
      text: `Marketing level up to M${nextLevel} (+${formatLargeNumber(gainPreview)} platinum).`,
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
      appendLog({
        tone: "neutral",
        category: "system",
        text: `Exported encrypted save (${filename}).`,
      });
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
      batchedLogRef.current = {
        earnings: 0,
        harvests: 0,
        bonuses: {},
        spending: {},
      };
      setSaveStatus(`Imported save: ${file.name}`);
      appendLog({
        tone: "neutral",
        category: "system",
        text: `Imported save file ${file.name}.`,
      });
    } catch {
      setSaveStatus("Import failed. Use a valid encrypted save JSON.");
    } finally {
      setSaveBusy(false);
      if (event?.target) event.target.value = "";
    }
  };

  const resetLocalFarmSave = () => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      "WARNING: This permanently deletes your Farm Idle local save from this browser and immediately refreshes the page.\n\nExport Save JSON and store it locally before continuing.\n\nDo you want to continue?",
    );
    if (!confirmed) return;
    const finalConfirm = window.confirm(
      "Final confirmation: proceed with permanent reset now?",
    );
    if (!finalConfirm) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      batchedLogRef.current = {
        earnings: 0,
        harvests: 0,
        bonuses: {},
        spending: {},
      };
      window.location.reload();
    } catch {
      setSaveStatus("Reset failed. Clear browser storage manually and retry.");
    }
  };

  const buyShardUpgrade = (upgradeId) => {
    const upgrade = shardUpgradeById(upgradeId);
    if (!upgrade) return;
    if (!canBuyShardUpgrade(game, upgradeId)) return;
    const level = shardUpgradeLevel(game, upgradeId);
    if (level >= upgrade.cap) return;
    const cost = shardUpgradeCost(upgradeId, level);
    if (game.prestigeShards < cost) return;
    mutate((state) => {
      state.prestigeShards -= cost;
      state.shardUpgrades[upgradeId] = level + 1;
    });
    appendLog({
      tone: "upgrade",
      category: "upgrade",
      text: `Bought ${upgrade.label} Lv ${level + 1}/${upgrade.cap} for ${formatLargeNumber(cost)} platinum.`,
    });
  };

  const buyBrushUpgrade = (toolId, brushId) => {
    const brush = getBrushById(brushId);
    if (brush.cost <= 0) return;
    if (
      brush.width > game.activeFarmSize ||
      brush.height > game.activeFarmSize
    ) {
      return;
    }
    const unlocked = Boolean(game.brushUnlocks?.[toolId]?.[brushId]);
    const cost = brushCostForState(game, brushId);
    if (unlocked || game.money < cost) return;
    if (!brushTierUnlocked(game.brushUnlocks, toolId, brushId)) return;
    mutate((state) => {
      state.money -= cost;
      state.brushUnlocks[toolId][brushId] = true;
      state.discovered.brushes[toolId][brushId] = true;
    });
    appendLog({
      tone: "spend",
      category: "spending",
      text: `Bought ${toolId} brush ${brush.id} for ${formatMoney(cost)}.`,
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
    const unitCostPreview = automationCostForState(game, autoKey);
    if (!Number.isFinite(unitCostPreview) || unitCostPreview <= 0) return;
    const activeSizePreview = clamp(
      Number(game.activeFarmSize || 3),
      3,
      GRID_SIZE,
    );
    let remainingCount = 0;
    for (let r = 0; r < activeSizePreview; r += 1) {
      for (let c = 0; c < activeSizePreview; c += 1) {
        const idx = r * GRID_SIZE + c;
        const tile = game.tiles[idx];
        if (!tile) continue;
        const hasAutomation = Boolean(tile[autoKey] || tile.autoEverything);
        if (!hasAutomation) remainingCount += 1;
      }
    }
    if (remainingCount <= 0) return;
    const totalCostPreview = remainingCount * unitCostPreview;
    if (game.money < totalCostPreview) return;
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
    const autoLabel = AUTO_LABEL_BY_KEY[autoKey] || autoKey;
    appendLog({
      tone: "spend",
      category: "spending",
      text: `Bought Auto-${autoLabel} on ${formatLargeNumber(remainingCount)} ${countLabel(remainingCount, "tile")} for ${formatMoney(totalCostPreview)}.`,
    });
  };

  const cancelAllAutomationForKey = (autoKey, autoLabel) => {
    if (!autoKey) return;
    const activeSizePreview = clamp(
      Number(game.activeFarmSize || 3),
      3,
      GRID_SIZE,
    );
    let coveredCount = 0;
    for (let r = 0; r < activeSizePreview; r += 1) {
      for (let c = 0; c < activeSizePreview; c += 1) {
        const idx = r * GRID_SIZE + c;
        const tile = game.tiles[idx];
        if (!tile) continue;
        const hadAny = Boolean(tile[autoKey] || tile.autoEverything);
        if (hadAny) coveredCount += 1;
      }
    }
    if (coveredCount <= 0) return;
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
    appendLog({
      tone: "neutral",
      category: "system",
      text: `Canceled Auto-${autoLabel} on ${formatLargeNumber(coveredCount)} ${countLabel(coveredCount, "tile")}.`,
    });
  };

  const tileAction = (tileIndex, opts = {}) => {
    const actionLogs = [];
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
          actionLogs.push({
            tone: "upgrade",
            category: "upgrade",
            text: `Bought ${animal.name} for ${formatLargeNumber(animal.unlockShards)} platinum.`,
          });
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
          const autoLabel = AUTO_LABEL_BY_KEY[key] || key;
          actionLogs.push({
            tone: "spend",
            category: "spending",
            text: `Bought Auto-${autoLabel} on 1 tile for ${formatMoney(cost)}.`,
          });
          return;
        }
        if (type === "cancel") {
          const hadAny = Boolean(tile[key] || tile.autoEverything);
          if (!hadAny) return;
          tile[key] = false;
          if (tile.autoEverything) tile.autoEverything = false;
          const autoLabel = AUTO_LABEL_BY_KEY[key] || key;
          actionLogs.push({
            tone: "neutral",
            category: "system",
            text: `Canceled Auto-${autoLabel} on 1 tile.`,
          });
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
    if (actionLogs.length > 0) {
      for (const entry of actionLogs) appendLog(entry);
    }
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
  const earnedMilestones = useMemo(
    () => PRESTIGE_MILESTONES.filter((m) => game.milestonesClaimed?.[m.id]),
    [game.milestonesClaimed],
  );
  const nextMilestone = useMemo(
    () =>
      PRESTIGE_MILESTONES.find((m) => !game.milestonesClaimed?.[m.id]) || null,
    [game.milestonesClaimed],
  );
  const nextMarketingLevel = Math.max(0, Number(game.prestigeLevel || 0)) + 1;
  const nextMarketingUnlocks = useMemo(() => {
    const unlocks = [];

    if (
      game.prestigeLevel < RESEARCH_UNLOCK_MARKETING &&
      nextMarketingLevel >= RESEARCH_UNLOCK_MARKETING
    ) {
      unlocks.push("Research tab");
    }

    const labsAtNext = SHARD_UPGRADES.filter(
      (upgrade) =>
        shardUpgradeMarketingRequirement(upgrade.id) === nextMarketingLevel &&
        game.prestigeLevel < nextMarketingLevel,
    );
    if (labsAtNext.length > 0) {
      unlocks.push(`Research: ${labsAtNext.map((u) => u.label).join(", ")}`);
    }

    const farmExpansionsAtNext = FARM_EXPANSIONS.filter(
      (exp) =>
        !game.farmSizeUnlocks?.[exp.size] &&
        exp.reqPrestige === nextMarketingLevel,
    );
    for (const exp of farmExpansionsAtNext) {
      unlocks.push(`Farm: ${exp.size}x${exp.size}`);
    }

    const animalsAtNext = ANIMALS.filter(
      (animal) => animalPrestigeRequirement(animal.id) === nextMarketingLevel,
    );
    if (animalsAtNext.length > 0) {
      unlocks.push(`Animals: ${animalsAtNext.map((a) => a.name).join(", ")}`);
    }

    const milestoneAtNext = PRESTIGE_MILESTONES.find(
      (m) =>
        m.reqPrestige === nextMarketingLevel && !game.milestonesClaimed?.[m.id],
    );
    if (milestoneAtNext) {
      unlocks.push(`Milestone: ${milestoneAtNext.title}`);
    }

    return unlocks;
  }, [
    game.farmSizeUnlocks,
    game.milestonesClaimed,
    game.prestigeLevel,
    nextMarketingLevel,
  ]);
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
    game.prestigeLevel >= RESEARCH_UNLOCK_MARKETING;
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
        ? "Use platinum to buy a bigger farm at higher marketing levels."
        : game.selectedTool === "research"
          ? "Research permanently increases stats of all squares. All labs unlock at M3."
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
    const discoveredSeeds = SEEDS.filter(
      (seed) => game.discovered?.seeds?.[seed.id],
    );
    if (!discoveredSeeds.length) return null;
    const prestigeMult =
      1 + Math.max(0, Number(game.prestigeLevel || 0)) * 0.08;
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
      if (
        cost <= Math.max(0, Number(game.money || 0)) &&
        score > bestAffordableScore
      ) {
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
  const canAffordSelectedAutomationUnit =
    Boolean(selectedAutoKey) &&
    Number.isFinite(selectedAutomationUnitCost) &&
    selectedAutomationUnitCost > 0 &&
    game.money >= selectedAutomationUnitCost;
  const canCancelSelectedAutomation =
    Boolean(selectedAutoKey) &&
    Boolean(selectedAutoBulk) &&
    selectedAutoBulk.covered > 0;
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
    Boolean(toolUnlockText) || showFarmUnlocks || showResearchUnlocks;
  const activeToolHintByTool = {
    plow: "Click farm tiles to plow using your selected brush size.",
    plant:
      "Click farm tiles to plant your selected seed with your selected brush size.",
    water: "Click farm tiles to water using your selected brush size.",
    harvest:
      "Click farm tiles to harvest ready crops using your selected brush size.",
    marketing: "Reset crops/money and gain platinum.",
    save: "Export or import your encrypted save file.",
    expandFarm: "Use this panel to unlock and switch farm expansion sizes.",
    animals: "Select an animal, then click a tile to place it.",
    research: "Click buy to purchase research upgrades.",
  };
  const activeToolHint =
    activeToolHintByTool[game.selectedTool] ||
    "Use the active panel to continue progression.";
  const visibleLogs = useMemo(() => {
    if (logFilter === "all") return logs;
    return logs.filter((entry) => entry.category === logFilter);
  }, [logFilter, logs]);

  if (!ready) {
    return (
      <section className="page">
        <header className="farm-header">
          <h1>farm</h1>
          <p className="lede">Loading local save...</p>
        </header>
        <DesktopBadge />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="farm-header">
        <h1>Farm Idle</h1>
        <p className="lede">
          Idle farming sim with lots of unlocks, automation, and levels. Click
          the field to get started!
        </p>
      </header>
      <DesktopBadge />

      <div className="farm-layout">
        <div className="farm-sidebar">
          <div className="card farm-tool-card">
            <h2 className="farm-title">Tools & Upgrades</h2>
            <div className="farm-tools-wrap">
              {TOOLS.filter((tool) => isToolVisible(game, tool.id)).map(
                (tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setTool(tool.id)}
                    className="farm-tool-button"
                    style={{
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

            <div className="farm-copy-strong">
              Active tool: <strong>{game.selectedTool}</strong>.
              <br />
              {activeToolHint}
            </div>

            {game.selectedTool === "save" ? (
              <div className="farm-inset-card">
                <div className="farm-copy-sm">Save Transfer</div>
                <div className="farm-copy-muted">
                  Export creates an encrypted version of your local save JSON.
                  Import restores from that encrypted save file.
                </div>
                <div className="farm-copy-alert">
                  Reset is permanent. Export and keep a local save file first.
                </div>
                <div className="farm-row-wrap">
                  <button onClick={exportEncryptedSave} disabled={saveBusy}>
                    Export Save JSON
                  </button>
                  <button onClick={triggerSaveImportPicker} disabled={saveBusy}>
                    Import Save JSON
                  </button>
                  <button
                    onClick={resetLocalFarmSave}
                    disabled={saveBusy}
                    className="farm-danger-button"
                  >
                    Reset Game (Delete Local Save)
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json,application/json"
                    className="farm-hidden-input"
                    onChange={importEncryptedSave}
                  />
                </div>
                <div className="farm-copy-muted">
                  {saveStatus ||
                    "Tip: store exported files somewhere safe so you can restore on another browser/device."}
                </div>
              </div>
            ) : null}

            {game.selectedTool === "plant" ? (
              <div className="farm-inset-card">
                <div className="farm-copy-sm">Seed types</div>
                <div className="farm-seed-grid">
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
                    const currentTileCost = currentSeedCost(game, seed.id, now);
                    const cannotAffordMinimum =
                      partialFill && projectedTiles <= 0 && currentTileCost > 0;
                    const costValueLabel = cannotAffordMinimum
                      ? formatMoney(currentTileCost)
                      : partialFill
                        ? formatMoney(projectedCost)
                        : formatMoney(quote.fullCost);
                    const costCountLabel = `(${partialFill ? projectedTiles : selectedPlantTileCount}/${selectedPlantTileCount} ${tileLabel})`;
                    const partialFillHint = cannotAffordMinimum
                      ? "Cannot afford 1 tile yet"
                      : "Not enough money for full brush";
                    const matureSellValue = seedSellValuePreview(
                      game,
                      seed.id,
                      3,
                    );
                    const oldSellValue = seedSellValuePreview(game, seed.id, 4);
                    const seedTooltip = [
                      seed.name,
                      `Cost: ${costValueLabel} ${costCountLabel}${cannotAffordMinimum ? " (insufficient funds)" : ""}`,
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
                        className="farm-choice-card"
                        style={{
                          background: selected
                            ? "rgba(124, 255, 182, 0.16)"
                            : "rgba(0,0,0,0.2)",
                        }}
                      >
                        <div className="farm-row-between">
                          <div>
                            <strong className="farm-text-11">
                              {seed.name}
                            </strong>
                            <div className="farm-text-9-80 farm-margin-top-2">
                              Cost:{" "}
                              <span
                                style={
                                  cannotAffordMinimum
                                    ? {
                                        textDecoration: "line-through",
                                        textDecorationThickness: "1.4px",
                                        opacity: 0.72,
                                      }
                                    : undefined
                                }
                              >
                                {costValueLabel}
                              </span>{" "}
                              <span>{costCountLabel}</span>
                            </div>
                          </div>
                          <div className="farm-choice-media-row">
                            {isBestValue ? (
                              <div className="farm-best-value-badge">
                                <span>
                                  <span>Best</span>
                                  <br />
                                  <span>Value</span>
                                </span>
                              </div>
                            ) : null}
                            <div className="farm-tile-thumb">
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
                            <div className="farm-text-9-78">
                              Mature {formatMoney(matureSellValue)} | Old{" "}
                              {formatMoney(oldSellValue)}
                            </div>
                            <div className="farm-text-9-72">
                              {seedTraitText(seed)}
                            </div>
                            <div className="farm-text-9-68">
                              Category: {cropCategory(seed.id)}
                            </div>
                            {seed.cost > 0 ? (
                              <div className="farm-text-9-68">
                                Current tile cost:{" "}
                                {formatMoney(currentTileCost)}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <div className="farm-row-gap-6 farm-margin-top-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSeed(seed.id);
                            }}
                          >
                            {selected ? "Selected" : "Use"}
                          </button>
                          {partialFill ? (
                            <span className="farm-inline-note">
                              {partialFillHint}
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
              <div className="farm-inset-card">
                <div className="farm-text-10-84">
                  Animals apply tile buffs. Select one, then click tiles to
                  place it. Right-click a tile to remove one selected animal, or
                  switch to Clear mode to wipe all animals on clicked tiles.
                  Each tile can hold up to 3 animals.
                </div>
                <div className="farm-panel-strong-12">
                  <div className="farm-text-10-86">Animal Tile Action</div>
                  <div className="farm-row-gap-8-wrap">
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
                <div className="farm-seed-grid">
                  {ANIMALS.filter(
                    (animal) => game.discovered?.animals?.[animal.id],
                  ).map((animal) => {
                    const reqPrestige = animalPrestigeRequirement(animal.id);
                    const tierUnlocked = game.prestigeLevel >= reqPrestige;
                    const selected = game.selectedAnimal === animal.id;
                    const canUse = tierUnlocked;
                    const expanded = expandedAnimalId === animal.id;
                    const ownedCount = Math.max(
                      0,
                      Number(game.animalOwned?.[animal.id] || 0),
                    );
                    const placedCount = countPlacedAnimals(
                      game.tiles,
                      animal.id,
                    );
                    const ownershipCap = animalMaxOwnedForPrestige(
                      game.prestigeLevel,
                      animal.id,
                    );
                    const capLabel = Number.isFinite(ownershipCap)
                      ? String(ownershipCap)
                      : "Unlimited";
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
                        className="farm-choice-card"
                        style={{
                          background: selected
                            ? "rgba(124, 255, 182, 0.16)"
                            : "rgba(0,0,0,0.2)",
                        }}
                      >
                        <div className="farm-row-between">
                          <div>
                            <strong className="farm-text-11">
                              {animal.name}
                            </strong>
                            <div className="farm-text-9-80 farm-margin-top-2">
                              {formatLargeNumber(animal.unlockShards)} platinum
                            </div>
                          </div>
                          <div className="farm-animal-thumb">
                            <AnimalSprite animalId={animal.id} size={48} />
                          </div>
                        </div>
                        <div className="farm-text-9-72">
                          Traits: {traitsText}
                        </div>
                        {expanded ? (
                          <div className="farm-grid-gap-2">
                            <div className="farm-text-9-78">{animal.desc}</div>
                            <div className="farm-text-9-70">
                              Unlocks at marketing M{reqPrestige}. At M
                              {reqPrestige}, max owned is 1. Unlimited starts at
                              M{reqPrestige + 1}.
                            </div>
                            <div className="farm-text-9-70">
                              Current cap at M{game.prestigeLevel}: {capLabel}.
                              Owned: {ownedCount}. Placed: {placedCount}.
                            </div>
                          </div>
                        ) : null}
                        <div className="farm-row-gap-6 farm-margin-top-2">
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
                      </div>
                    );
                  })}
                  {!ANIMALS.some(
                    (animal) => game.discovered?.animals?.[animal.id],
                  ) ? (
                    <div className="farm-text-10-72">
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
                <div className="farm-panel-muted-8">
                  <div className="farm-text-10-88">
                    Marketing converts money and plants into platinum. All
                    crops, money, and tool upgrades are reset. Animals and farm
                    expansions are retained.
                  </div>
                  <div className="farm-panel-muted-6">
                    <div className="farm-panel-soft-4">
                      <div className="farm-text-10-86">Current:</div>
                      <div className="farm-text-10-82">
                        Marketing Level: <strong>M{game.prestigeLevel}</strong>
                      </div>
                      <div className="farm-text-10-82">
                        Platinum:{" "}
                        <strong>
                          {formatLargeNumber(game.prestigeShards)}
                        </strong>
                      </div>
                    </div>
                    <div className="farm-panel-soft-4">
                      <div className="farm-text-10-86">Next:</div>
                      <div className="farm-text-10-72">
                        Marketing Level: M{nextMarketingLevel}
                      </div>
                      <div className="farm-text-10-72">
                        Platinum gain: +{formatLargeNumber(nextMarketingGain)}
                      </div>
                      <div className="farm-text-10-72">
                        Money required to M{nextMarketingLevel}:{" "}
                        {formatMoney(currentPrestigeCost)}
                      </div>
                      <div className="farm-panel-soft-3">
                        <div className="farm-text-10-74">
                          Unlocks in M{nextMarketingLevel}:
                        </div>
                        {nextMarketingUnlocks.length > 0 ? (
                          nextMarketingUnlocks.map((unlockText) => (
                            <div
                              key={`next-unlock-${unlockText}`}
                              className="farm-text-10-72"
                            >
                              {unlockText}
                            </div>
                          ))
                        ) : (
                          <div className="farm-text-10-72">None</div>
                        )}
                        <div className="farm-text-10-72">
                          Marketing perks: +
                          {formatMoney(PRESTIGE_START_MONEY_PER_LEVEL)} start
                          money and +
                          {Math.round(PRESTIGE_GROWTH_SPEED_PER_LEVEL * 100)}%
                          growth speed per marketing level (max{" "}
                          {Math.round(PRESTIGE_MAX_GROWTH_SPEED * 100)}%).
                        </div>
                      </div>
                    </div>
                    <button onClick={prestigeNow} disabled={!canMarketNow}>
                      Market for Platinum ({formatMoney(currentPrestigeCost)})
                    </button>
                  </div>
                </div>
                <div className="farm-panel-muted-8">
                  <div className="farm-text-10-88">
                    Farm milestones award bonus platinum for leveling marketing
                  </div>
                  <div className="farm-panel-muted-6">
                    <div className="farm-text-10-84">
                      Farm Milestones ({milestoneClaimedCount}/
                      {PRESTIGE_MILESTONES.length})
                    </div>
                    <div className="farm-text-10-74">
                      Claimed platinum rewards:{" "}
                      {formatLargeNumber(totalMilestoneRewardShards)}
                    </div>
                    <div className="farm-text-10-80">Earned milestones:</div>
                    {earnedMilestones.length > 0 ? (
                      <ul className="farm-list-grid">
                        {earnedMilestones.map((m) => (
                          <li
                            key={`earned-${m.id}`}
                            className="farm-text-10-84"
                          >
                            <div className="farm-row-between-top">
                              <span>
                                M{m.reqPrestige}: {m.title}
                              </span>
                              <span className="farm-opacity-68">Claimed</span>
                            </div>
                            <div className="farm-opacity-68">
                              +{formatLargeNumber(m.rewardShards)} platinum
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="farm-text-10-66">None yet.</div>
                    )}
                    <div className="farm-text-10-80">Next milestone:</div>
                    {nextMilestone ? (
                      <ul className="farm-list-compact">
                        <li className="farm-text-10-82">
                          <div>
                            M{nextMilestone.reqPrestige}: {nextMilestone.title}
                          </div>
                          <div className="farm-opacity-68">
                            Reward: +
                            {formatLargeNumber(nextMilestone.rewardShards)}{" "}
                            platinum
                          </div>
                        </li>
                      </ul>
                    ) : (
                      <div className="farm-text-10-76">
                        All farm milestones claimed.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {showActionUnlocks ? (
              <div className="farm-panel-muted-8">
                <div className="farm-text-10-88">
                  {selectedActionToolLabel} upgrades
                </div>
                <div className="farm-panel-muted-6">
                  <div className="farm-text-10-84">Brush upgrades</div>
                  <div className="farm-text-10-72">
                    {actionBrushDescriptionByTool[game.selectedTool] || ""}
                  </div>
                  <div className="farm-grid-gap-6">
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
                          className="farm-row-between"
                        >
                          <span className="farm-text-10">
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
                <div className="farm-panel-muted-6">
                  <div className="farm-text-10-84">Automation</div>
                  <div className="farm-text-10-72">
                    {actionAutomationDescriptionByTool[game.selectedTool] || ""}
                  </div>
                  {showAutomationPanel ? (
                    <>
                      <div className="farm-row-gap-8">
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
                                disabled={!canAffordSelectedAutomationUnit}
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
                                disabled={!canCancelSelectedAutomation}
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
                      <div className="farm-text-10-72">
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
                        <div className="farm-row-gap-8-wrap">
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
                    <div className="farm-text-10-68">
                      Auto-{selectedAutoLabel.toLowerCase()} unlocks later.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {showGenericUnlockCard ? (
              <div className="farm-inset-card">
                {toolUnlockText ? (
                  <div className="farm-text-10-84">{toolUnlockText}</div>
                ) : null}

                {showFarmUnlocks ? (
                  <div className="farm-panel-muted-4">
                    <div className="farm-text-10-78">
                      Active farm:{" "}
                      <strong>
                        {game.activeFarmSize}x{game.activeFarmSize}
                      </strong>
                    </div>
                    <div className="farm-grid-gap-6">
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
                            className="farm-row-between"
                          >
                            <span className="farm-text-10-80">
                              {exp.size}x{exp.size}{" "}
                              {exp.size === 3
                                ? "(starter)"
                                : `(M${exp.reqPrestige}, ${formatLargeNumber(exp.unlockShards)} platinum)`}
                            </span>
                            {unlocked ? (
                              <span className="farm-text-10-78">
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
                  <div className="farm-panel-muted-6">
                    {showShardUpgradesPanel ? (
                      <div className="farm-grid-gap-4">
                        {SHARD_UPGRADES.map((upgrade) => {
                          const level = shardUpgradeLevel(game, upgrade.id);
                          const atCap = level >= upgrade.cap;
                          const cost = shardUpgradeCost(upgrade.id, level);
                          const reqMarketing = shardUpgradeMarketingRequirement(
                            upgrade.id,
                          );
                          const lockedByMarketing =
                            game.prestigeLevel < reqMarketing;
                          const canBuy =
                            !atCap &&
                            !lockedByMarketing &&
                            game.prestigeShards >= cost;
                          return (
                            <div
                              key={upgrade.id}
                              className="farm-grid-gap-2 farm-upgrade-row"
                            >
                              <div className="farm-row-between">
                                <span className="farm-text-10">
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
                              <div className="farm-text-10-68">
                                {upgrade.desc}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="farm-text-10-72">
                        Research appears at marketing level M
                        {RESEARCH_UNLOCK_MARKETING}. Labs unlock at M3. Current
                        level: M{game.prestigeLevel}.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="farm-main">
          <div className="card farm-main-card farm-main-card-tight">
            <div
              className="farm-grid-gap-8"
              style={{
                gridTemplateColumns:
                  game.prestigeLevel > 0
                    ? "repeat(3, minmax(0, 1fr))"
                    : "repeat(1, minmax(0, 1fr))",
              }}
            >
              <Stat
                label="Money"
                value={formatMoneyAdaptive(game.money, 13, 2)}
              />
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
          <div className="card farm-main-card farm-main-card-roomy">
            <div
              className="farm-grid-gap-4"
              style={{
                gridTemplateColumns: `repeat(${game.activeFarmSize}, minmax(0, 1fr))`,
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
                  ? formatMoneyAdaptive(harvestPreview || 0, 7, 1)
                  : plant
                    ? `${stageProgressPercent(plant, seed, now, tile)}%`
                    : "--%";
                const blockerTag = blockerLabel(tile, seed, now);
                const blockerLines =
                  blockerTag === "harvest"
                    ? ["needs", "harvest"]
                    : splitNeedsLabel(blockerTag);
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
                    <span className="farm-tile-overlay">
                      <span
                        className="farm-tile-label-top"
                        style={{
                          fontSize: topLabelFontSize,
                        }}
                      >
                        {seedTagLines.map((line, i) => (
                          <span key={`${idx}-seed-${i}`}>{line}</span>
                        ))}
                      </span>
                      {showTileValueTags || canHarvest ? (
                        <span
                          className="farm-tile-label-progress"
                          style={{ fontSize: progressLabelFontSize }}
                        >
                          {progressTag}
                        </span>
                      ) : null}
                      <span
                        className="farm-tile-label-blocker"
                        style={{
                          fontSize: blockerLabelFontSize,
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
            <label className="farm-toggle-label">
              <input
                type="checkbox"
                checked={showTileValueTags}
                onChange={(e) => setShowTileValueTags(e.target.checked)}
              />
              Show tile %
            </label>
          </div>
          <div className="card farm-main-card farm-main-card-tight">
            <div className="farm-season-card">
              <div className="farm-text-10-72">Harvest Festival</div>
              <div className="farm-text-12">
                <strong>{currentSeason.label}</strong>
              </div>
              <div className="farm-text-10-78">
                +{Math.round(currentSeason.baseBonus * 100)}% to{" "}
                {currentSeason.categories.join(", ")} crops
                {currentSeason.synergyAnimal
                  ? ` (+${Math.round(currentSeason.synergyBonus * 100)}% with ${animalById(currentSeason.synergyAnimal)?.name || currentSeason.synergyAnimal})`
                  : ""}
              </div>
              <div className="farm-text-10-68">
                Rotates in {formatDuration(seasonRemainingMs)}
              </div>
            </div>
            <div className="farm-log-card">
              <div className="farm-text-10-72">
                Logs
                <span className="farm-opacity-58">
                  {" "}
                  (earnings + bonuses + spending batched every{" "}
                  {LOG_BATCH_MS / 1000}s)
                </span>
              </div>
              <div className="farm-row-gap-6-wrap">
                {LOG_FILTERS.map((filter) => {
                  const selected = logFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setLogFilter(filter.id)}
                      className="farm-filter-btn"
                      style={{
                        borderColor: selected
                          ? "rgba(255, 243, 175, 0.92)"
                          : "rgba(255,255,255,0.2)",
                        background: selected
                          ? "rgba(255, 230, 142, 0.16)"
                          : "rgba(0,0,0,0.2)",
                      }}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
              {visibleLogs.length <= 0 ? (
                <div className="farm-text-10-62">
                  {logs.length <= 0
                    ? "No events yet. Plant and harvest to start the live feed."
                    : `No ${logFilter === "all" ? "matching" : logFilter} events in recent history.`}
                </div>
              ) : (
                <div className="farm-log-list">
                  {visibleLogs.map((entry) => {
                    const toneColor =
                      entry.tone === "bonus"
                        ? "#ffd987"
                        : entry.tone === "earning"
                          ? "#a9f1b0"
                          : entry.tone === "spend"
                            ? "#ffb394"
                            : entry.tone === "upgrade"
                              ? "#9fd1ff"
                              : "#e8ddcb";
                    return (
                      <div key={entry.id} className="farm-log-item">
                        <span
                          className="farm-log-time"
                          style={{ color: toneColor }}
                        >
                          {formatLogClock(entry.at)}
                        </span>
                        <span className="farm-text-10-90">{entry.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
