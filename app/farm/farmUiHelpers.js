import { ANIMAL_ANIM_CYCLE, MAX_ANIMALS_PER_TILE } from "../../lib/farm/config";
import { STAGES } from "../../lib/farm/curveParams";

import {
  animalById,
  clamp,
  currentMarketSeason,
  formatDuration,
  marketBonusForHarvest,
  seedById,
  seedEraYieldBonus,
  shardUpgradeEffects,
  tileAnimalIds,
  tileAnimalTrait,
} from "../../lib/farm/engine";

export function ToolButtonIcon({ toolId, size = 14 }) {
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

export function Stat({ label, value }) {
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

export function tileColor(tile) {
  if (tile.soil !== "plowed") return "#463423";
  if (!tile.plant) return tile.watered ? "#4d6a84" : "#6f4f33";

  const stage = tile.plant.stageIndex;
  const needsWater = stage < 3 && !tile.plant.stageWatered;
  if (needsWater) return "#9b8c77";
  if (stage === 0) return tile.watered ? "#7fbfb2" : "#7aaea4";
  if (stage === 1) return tile.watered ? "#75c6b7" : "#73b8aa";
  if (stage === 2) return tile.watered ? "#6ecbbc" : "#6eb8aa";
  if (stage === 3) return tile.watered ? "#f3df83" : "#e3cd74";
  return tile.watered ? "#a28f5a" : "#8a794d";
}

export function TileSprite({ tile, seed, tileIndex = 0, animTick = 0 }) {
  const stage = tile.plant?.stageIndex ?? -1;
  const hasPlant = Boolean(tile.plant);
  const maturePlant = stage === 3;
  const oldPlant = stage > 3;
  const needsWater = hasPlant && stage < 3 && !tile.plant.stageWatered;
  const soil =
    tile.soil !== "plowed"
      ? "#5a3e28"
      : hasPlant
        ? needsWater
          ? "#8f816f"
          : oldPlant
            ? tile.watered
              ? "#8a7a4e"
              : "#776744"
            : maturePlant
              ? tile.watered
                ? "#dbc46d"
                : "#c8b060"
              : tile.watered
                ? "#6aaea1"
                : "#739f97"
        : tile.watered
          ? "#4a6a7a"
          : "#6f4d32";
  const soilBottom =
    tile.soil !== "plowed"
      ? "#4a2f1e"
      : hasPlant
        ? oldPlant
          ? tile.watered
            ? "#62573a"
            : "#524833"
          : maturePlant
            ? tile.watered
              ? "#a78f4d"
              : "#957f45"
            : needsWater
              ? "#766a5a"
              : tile.watered
                ? "#4f8178"
                : "#5a7871"
        : tile.watered
          ? "#355a6c"
          : "#5a3f29";
  const seedPalette = getSeedPalette(seed?.id);
  const plantXOffset = 1;
  const animals = tileAnimalIds(tile).slice(0, MAX_ANIMALS_PER_TILE);
  const animalTileScale = 0.75;
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
          <rect x="0" y="12" width="16" height="4" fill={soilBottom} />
          <g
            style={{
              filter:
                "saturate(1.22) contrast(1.1) drop-shadow(0 0 0.8px rgba(0,0,0,0.45))",
            }}
          >
            {shiftedStageRects.map((r, i) => (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={r.c}
              />
            ))}
          </g>
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
        const slotX = animalSlots[slotIdx]?.[0] ?? 0;
        const slotY = animalSlots[slotIdx]?.[1] ?? 10;
        const cx = slotX + 2.5;
        const cy = slotY + 2.5;
        const rects = getAnimalSpriteRects(animalId, slotX, slotY, frame);
        return (
          <g
            key={`animal-${slotIdx}`}
            transform={`translate(${cx} ${cy}) scale(${animalTileScale}) translate(${-cx} ${-cy})`}
          >
            {rects.map((r, i) => (
              <rect
                key={`animal-${slotIdx}-${i}`}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={r.c}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function AnimalSprite({ animalId, size = 16 }) {
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

const BASE_SEED_PALETTES = {
  carrot: {
    seed: "#f3d9b4",
    stem: "#74c75f",
    leaf: "#91dd78",
    leafDark: "#4b9640",
    fruit: "#e07c2d",
    fruitHi: "#f7a24d",
    old: "#8e663f",
  },
  corn: {
    seed: "#f1e4a8",
    stem: "#76c166",
    leaf: "#95d67a",
    leafDark: "#4b9240",
    fruit: "#e8c74d",
    fruitHi: "#f6df82",
    old: "#8b7b49",
  },
  rose: {
    seed: "#f4d3d7",
    stem: "#66b86b",
    leaf: "#82d286",
    leafDark: "#3d8d47",
    fruit: "#c84357",
    fruitHi: "#ec6f83",
    old: "#7d5b4d",
  },
  tulip: {
    seed: "#f0dac0",
    stem: "#64b769",
    leaf: "#81d187",
    leafDark: "#3f8f49",
    fruit: "#f09431",
    fruitHi: "#ffc46f",
    old: "#876546",
  },
  lotus: {
    seed: "#efe0b2",
    stem: "#66b880",
    leaf: "#7fd49a",
    leafDark: "#3b8b68",
    fruit: "#d2a43f",
    fruitHi: "#f0cd72",
    old: "#8d6f42",
  },
  cacao: {
    seed: "#dfc4a1",
    stem: "#5caf66",
    leaf: "#74c17a",
    leafDark: "#3e7f47",
    fruit: "#7d5131",
    fruitHi: "#a06a43",
    old: "#5d4632",
  },
  lavender: {
    seed: "#e4d8ef",
    stem: "#62ad72",
    leaf: "#7bc589",
    leafDark: "#417d4d",
    fruit: "#8d67c9",
    fruitHi: "#b090e6",
    old: "#6c5a55",
  },
  sunflower: {
    seed: "#efe0a6",
    stem: "#66b364",
    leaf: "#84d17c",
    leafDark: "#417f42",
    fruit: "#d8a529",
    fruitHi: "#f1d16b",
    old: "#856b42",
  },
  turnip: {
    seed: "#f5d28e",
    stem: "#6fc95f",
    leaf: "#8de07a",
    leafDark: "#4f9d41",
    fruit: "#d8d3de",
    fruitHi: "#f1eef4",
    old: "#9f958d",
  },
  berry: {
    seed: "#a8c6ff",
    stem: "#53b96a",
    leaf: "#7ae08e",
    leafDark: "#3a8f4f",
    fruit: "#7a59d9",
    fruitHi: "#ac8cff",
    old: "#6f5c4d",
  },
  pumpkin: {
    seed: "#eddab1",
    stem: "#65b75c",
    leaf: "#80cf73",
    leafDark: "#3f8440",
    fruit: "#da7f2b",
    fruitHi: "#f3a34d",
    old: "#8c673e",
  },
  default: {
    seed: "#efe8b8",
    stem: "#6cc35a",
    leaf: "#8fdc6a",
    leafDark: "#4a9b3f",
    fruit: "#d5c96f",
    fruitHi: "#ebe08a",
    old: "#8a7c4b",
  },
};

function clampRgbChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function boostHexColor(hex, saturation = 1, brightness = 1, contrast = 1) {
  const normalized = String(hex || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return hex;

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const mean = (r + g + b) / 3;
  const satR = mean + (r - mean) * saturation;
  const satG = mean + (g - mean) * saturation;
  const satB = mean + (b - mean) * saturation;
  const conR = (satR - 128) * contrast + 128;
  const conG = (satG - 128) * contrast + 128;
  const conB = (satB - 128) * contrast + 128;
  const outR = clampRgbChannel(conR * brightness);
  const outG = clampRgbChannel(conG * brightness);
  const outB = clampRgbChannel(conB * brightness);
  return `#${outR.toString(16).padStart(2, "0")}${outG.toString(16).padStart(2, "0")}${outB.toString(16).padStart(2, "0")}`;
}

function enhancePlantPalette(palette) {
  return {
    ...palette,
    stem: boostHexColor(palette.stem, 1.2, 1.1, 1.05),
    leaf: boostHexColor(palette.leaf, 1.3, 1.1, 1.08),
    leafDark: boostHexColor(palette.leafDark, 1.25, 1, 1.1),
    fruit: boostHexColor(palette.fruit, 1.35, 1.08, 1.1),
    fruitHi: boostHexColor(palette.fruitHi, 1.25, 1.15, 1.08),
  };
}

function getSeedPalette(seedId) {
  const base = BASE_SEED_PALETTES[seedId] || BASE_SEED_PALETTES.default;
  return enhancePlantPalette(base);
}

export function harvestValuePreview(state, tile) {
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

export function seedSellValuePreview(state, seedId, stageIndex) {
  return harvestValuePreview(state, {
    animals: [],
    plant: {
      seedId,
      stageIndex: clamp(Number(stageIndex || 3), 3, 4),
    },
  });
}

export function buildTileTitle(
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
