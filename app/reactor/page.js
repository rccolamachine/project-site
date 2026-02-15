// app/reactor/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  DEFAULT_ELEMENTS_3D,
  DEFAULT_LJ,
  addAtom3D,
  clearSim3D,
  createSim3D,
  ljPotential,
  mixLorentzBerthelot,
  nudgeAll,
  recomputeBondOrders,
  removeAtom3D,
  setGrab,
  setGrabTarget,
  stepSim3D,
  DEFAULT_CHARGES,
} from "@/lib/sim/physics3d";

const ELEMENTS = ["S", "P", "O", "N", "C", "H"];
const ROOM_TEMP_K = 300;
const FIXED_CUTOFF = 4.8;

const TOOL = {
  PLACE: "place",
  DELETE: "delete",
  ROTATE: "rotate",
};

export default function ReactorPage() {
  const MAX_ATOMS = 120;

  // tool state
  const [tool, setTool] = useState(TOOL.PLACE);
  const toolRef = useRef(tool);
  useEffect(() => void (toolRef.current = tool), [tool]);

  // placement element (only when Place selected)
  const [placeElement, setPlaceElement] = useState("C");

  // bonds toggles
  const [showBonds, setShowBonds] = useState(true);
  const showBondsRef = useRef(true);
  useEffect(() => void (showBondsRef.current = showBonds), [showBonds]);

  const [allowMultipleBonds, setAllowMultipleBonds] = useState(true);
  const allowMultipleBondsRef = useRef(true);
  useEffect(
    () => void (allowMultipleBondsRef.current = allowMultipleBonds),
    [allowMultipleBonds],
  );

  // sim toggles
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => void (pausedRef.current = paused), [paused]);

  // Kelvin 0..1000
  const [temperatureK, setTemperatureK] = useState(400);
  const [damping, setDamping] = useState(0.975);
  const [bondScale, setBondScale] = useState(3.5);

  // box size (half-size)
  const [boxHalfSize, setBoxHalfSize] = useState(6.0);
  const [showBoxEdges, setShowBoxEdges] = useState(true);

  // per-element LJ
  const [lj, setLj] = useState(() => structuredClone(DEFAULT_LJ));

  // LJ editor element (separate from placement element)
  const [ljElement, setLjElement] = useState("C");

  // overlays (controls hidden by default for mobile friendliness)
  const [controlsOpen, setControlsOpen] = useState(false);
  const [wellsOpen, setWellsOpen] = useState(true);

  const mountRef = useRef(null);
  const rafRef = useRef(null);

  const threeRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    raycaster: null,
    pointerNDC: new THREE.Vector2(),
    atomGroup: null,
    bondGroup: null,
    bondMeshes: [],
    boxHelper: null,
    grid: null,
    grid2: null,
    spriteMaterials: new Map(),
    dragPlane: new THREE.Plane(),
    dragPlaneNormal: new THREE.Vector3(),
    dragHit: new THREE.Vector3(),
  });

  const simRef = useRef(createSim3D());
  const atomSpritesRef = useRef(new Map());
  const paramsRef = useRef(null);

  const elements = useMemo(() => ({ ...DEFAULT_ELEMENTS_3D }), []);

  // update sim params
  useEffect(() => {
    const tempFactor = Math.max(0, temperatureK) / ROOM_TEMP_K;

    paramsRef.current = {
      lj,
      cutoff: FIXED_CUTOFF,
      minR: 0.35,
      maxPairForce: 30,

      bondScale,
      allowMultipleBonds,

      temperature: tempFactor,
      damping,
      tempVelKick: 6.8,

      boxHalfSize,
      wallPadding: 0.25,
      wallK: 18,

      grabK: 80,
      grabMaxForce: 140,

      angleK: 2.2,
      angleForceCap: 10,
      enableDihedrals: true,
      dihedralKScale: 1.0,
      dihedralForceCap: 6,

      enableElectrostatics: true,
      charges: { ...DEFAULT_CHARGES },
      ke: 0.6,
      screeningLength: 4.0,
    };
  }, [lj, temperatureK, damping, bondScale, allowMultipleBonds, boxHalfSize]);

  // OrbitControls enabled only in Rotate tool
  useEffect(() => {
    const controls = threeRef.current.controls;
    if (!controls) return;
    controls.enabled = tool === TOOL.ROTATE;
  }, [tool]);

  // Reset camera orientation/view to defaults (centered)
  function resetView() {
    const t = threeRef.current;
    if (!t.camera || !t.controls) return;

    t.camera.position.set(0, 0.6, 14);
    t.camera.up.set(0, 1, 0);
    t.controls.target.set(0, 0, 0);
    t.controls.update();
  }

  // update box visuals when size or edges-toggle changes
  useEffect(() => {
    const t = threeRef.current;
    if (!t.scene) return;

    const S = boxHalfSize;

    if (t.boxHelper) t.scene.remove(t.boxHelper);

    const box = new THREE.Box3(
      new THREE.Vector3(-S, -S, -S),
      new THREE.Vector3(S, S, S),
    );
    const boxHelper = new THREE.Box3Helper(box, 0x334155);
    boxHelper.material.transparent = true;
    boxHelper.material.opacity = 0.52;
    boxHelper.visible = showBoxEdges;
    boxHelper.renderOrder = 3;
    t.scene.add(boxHelper);
    t.boxHelper = boxHelper;

    // Ensure any old grids are removed (and we keep them hidden)
    if (t.grid) t.scene.remove(t.grid);
    if (t.grid2) t.scene.remove(t.grid2);

    const size = Math.max(4, Math.floor(S * 2));
    const divisions = Math.max(10, Math.floor(S * 5));

    const grid = new THREE.GridHelper(size, divisions, 0x94a3b8, 0x94a3b8);
    grid.material.transparent = true;
    grid.material.opacity = 0.0;
    grid.visible = false;
    t.scene.add(grid);
    t.grid = grid;

    const grid2 = new THREE.GridHelper(size, divisions, 0x94a3b8, 0x94a3b8);
    grid2.material.transparent = true;
    grid2.material.opacity = 0.0;
    grid2.visible = false;
    t.scene.add(grid2);
    t.grid2 = grid2;
  }, [boxHalfSize, showBoxEdges]);

  const ui = useMemo(
    () => ({
      canvasCard: {
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.72)",
        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
        position: "relative",
        overflow: "hidden",
      },
      controls: {
        position: "absolute",
        left: 10,
        top: 10,
        width: 420,
        maxWidth: "min(420px, 92vw)",
        maxHeight: "calc(100% - 20px)",
        overflow: "auto",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
        padding: 10,
        pointerEvents: "auto",
      },
      instructions: {
        position: "absolute",
        right: 10,
        top: 10,
        width: 360,
        maxWidth: "min(360px, 92vw)",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.14)",
        padding: "10px 10px",
        pointerEvents: "auto",
      },
      headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 8,
      },
      title: { fontSize: 12, fontWeight: 950, color: "#0f172a" },

      btnDark: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.16)",
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(15,23,42,0.82))",
        color: "rgba(248,250,252,0.98)",
        cursor: "pointer",
        fontWeight: 800,
      },
      btnLight: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.16)",
        background: "rgba(255,255,255,0.92)",
        color: "#0f172a",
        cursor: "pointer",
        fontWeight: 800,
      },
      pillBtn: (active, tone = "neutral") => {
        const isDanger = tone === "danger";
        const bgActive = isDanger
          ? "rgba(185,28,28,0.92)"
          : "rgba(15,23,42,0.86)";
        return {
          padding: "7px 10px",
          borderRadius: 12,
          border: "1px solid rgba(15,23,42,0.16)",
          background: active ? bgActive : "rgba(255,255,255,0.92)",
          color: active ? "rgba(248,250,252,0.98)" : "#0f172a",
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 12,
        };
      },
      select: {
        padding: 9,
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.18)",
        background: "rgba(255,255,255,0.95)",
        color: "#0f172a",
        fontWeight: 800,
      },
      section: {
        borderTop: "1px solid rgba(15,23,42,0.12)",
        paddingTop: 10,
        marginTop: 10,
        display: "grid",
        gap: 8,
      },
      row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      },
      hintTitle: { fontSize: 11, fontWeight: 950, color: "#0f172a" },
      hintText: { fontSize: 11, color: "#475569", lineHeight: 1.35 },
      floatingShow: {
        position: "absolute",
        left: 10,
        top: 10,
        pointerEvents: "auto",
      },
    }),
    [],
  );

  // ---------- sprites ----------
  function makePixelSphereTexture(hex, label) {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const base = new THREE.Color(hex);
    const highlight = base.clone().lerp(new THREE.Color("#ffffff"), 0.45);
    const shadow = base.clone().lerp(new THREE.Color("#000000"), 0.45);
    const outline = new THREE.Color("#0f172a");

    const px = 2;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.42;

    const lx = -0.6;
    const ly = -0.8;

    for (let y = 0; y < size; y += px) {
      for (let x = 0; x < size; x += px) {
        const dx = x + px / 2 - cx;
        const dy = y + px / 2 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;

        const nx = dx / R;
        const ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lambert = clamp01(nx * lx + ny * ly + nz * 0.7);
        const rim = clamp01(1 - d / R);

        let col = base.clone();
        col = col.lerp(shadow, 0.55 * (1 - lambert));
        col = col.lerp(highlight, 0.55 * lambert);
        col = col.lerp(new THREE.Color("#ffffff"), 0.12 * rim);

        ctx.fillStyle = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
        ctx.fillRect(x, y, px, px);
      }
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = `rgb(${Math.round(outline.r * 255)},${Math.round(outline.g * 255)},${Math.round(outline.b * 255)})`;
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const ox = Math.round((cx + Math.cos(rad) * (R + 1)) / px) * px;
      const oy = Math.round((cy + Math.sin(rad) * (R + 1)) / px) * px;
      ctx.fillRect(ox, oy, px, px);
    }

    ctx.globalAlpha = 0.95;
    ctx.font = "bold 14px ui-sans-serif, system-ui, -apple-system";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = label === "C" ? "#f8fafc" : "#0f172a";
    ctx.fillText(label, cx, cy + 2);

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function getSpriteMaterial(el) {
    const t = threeRef.current;
    if (t.spriteMaterials.has(el)) return t.spriteMaterials.get(el);

    const colorMap = {
      H: "#f1f5f9",
      C: "#111827",
      N: "#3b82f6",
      O: "#ef4444",
      P: "#f59e0b",
      S: "#facc15",
    };

    const tex = makePixelSphereTexture(colorMap[el], el);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    t.spriteMaterials.set(el, mat);
    return mat;
  }

  function ensureSpriteForAtom(atom) {
    const map = atomSpritesRef.current;
    const t = threeRef.current;
    if (map.has(atom.id)) return map.get(atom.id);

    const spr = new THREE.Sprite(getSpriteMaterial(atom.el));
    const s = atom.r * 2.2;
    spr.scale.set(s, s, 1);
    spr.position.set(atom.x, atom.y, atom.z);
    spr.userData.atomId = atom.id;

    t.atomGroup.add(spr);
    map.set(atom.id, spr);
    return spr;
  }

  function removeMissingSprites() {
    const sim = simRef.current;
    const map = atomSpritesRef.current;
    const t = threeRef.current;
    const live = new Set(sim.atoms.map((a) => a.id));
    for (const [id, spr] of map.entries()) {
      if (!live.has(id)) {
        t.atomGroup.remove(spr);
        map.delete(id);
      }
    }
  }

  // ---------- bonds ----------
  function syncBondCylinders() {
    const t = threeRef.current;
    const sim = simRef.current;

    if (!showBondsRef.current) {
      for (const m of t.bondMeshes) m.visible = false;
      return;
    }

    const needed = sim.bonds.length * 3;

    while (t.bondMeshes.length < needed) {
      const geom = new THREE.CylinderGeometry(0.06, 0.06, 1, 12, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.66,
      });
      const mesh = new THREE.Mesh(geom, mat);
      t.bondGroup.add(mesh);
      t.bondMeshes.push(mesh);
    }

    for (let i = needed; i < t.bondMeshes.length; i++)
      t.bondMeshes[i].visible = false;

    const cameraDir = new THREE.Vector3();
    t.camera.getWorldDirection(cameraDir);

    const yAxis = new THREE.Vector3(0, 1, 0);

    for (let bi = 0; bi < sim.bonds.length; bi++) {
      const bond = sim.bonds[bi];
      const a = sim.atoms.find((x) => x.id === bond.aId);
      const b = sim.atoms.find((x) => x.id === bond.bId);
      const baseIdx = bi * 3;

      if (!a || !b) {
        for (let k = 0; k < 3; k++) t.bondMeshes[baseIdx + k].visible = false;
        continue;
      }

      const drawOrder = allowMultipleBondsRef.current ? bond.order : 1;

      const start = new THREE.Vector3(a.x, a.y, a.z);
      const end = new THREE.Vector3(b.x, b.y, b.z);

      const dir = end.clone().sub(start);
      const len = Math.max(0.001, dir.length());
      const dirN = dir.clone().multiplyScalar(1 / len);

      let offsetAxis = new THREE.Vector3().crossVectors(dirN, cameraDir);
      if (offsetAxis.lengthSq() < 1e-6)
        offsetAxis = new THREE.Vector3().crossVectors(dirN, yAxis);
      if (offsetAxis.lengthSq() < 1e-6) offsetAxis = new THREE.Vector3(1, 0, 0);
      offsetAxis.normalize();

      const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dirN);
      const mid = start.clone().add(end).multiplyScalar(0.5);

      const spacing = drawOrder === 1 ? 0 : drawOrder === 2 ? 0.1 : 0.12;
      const offsets =
        drawOrder === 1
          ? [0]
          : drawOrder === 2
            ? [-spacing, +spacing]
            : [-spacing, 0, +spacing];

      for (let k = 0; k < 3; k++) {
        const mesh = t.bondMeshes[baseIdx + k];
        if (k >= offsets.length) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;

        const off = offsetAxis.clone().multiplyScalar(offsets[k]);
        mesh.position.copy(mid.clone().add(off));
        mesh.setRotationFromQuaternion(quat);

        const thickness = 1.35;
        mesh.scale.set(thickness, len, thickness);
      }
    }
  }

  // ---------- init ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    camera.position.set(0, 0.6, 14);
    camera.lookAt(0, 0, 0);

    const atomGroup = new THREE.Group();
    scene.add(atomGroup);

    const bondGroup = new THREE.Group();
    scene.add(bondGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite.threshold = 0.35;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.panSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.enabled = toolRef.current === TOOL.ROTATE;
    controls.target.set(0, 0, 0);
    controls.update();

    threeRef.current.renderer = renderer;
    threeRef.current.scene = scene;
    threeRef.current.camera = camera;
    threeRef.current.controls = controls;
    threeRef.current.raycaster = raycaster;
    threeRef.current.atomGroup = atomGroup;
    threeRef.current.bondGroup = bondGroup;
    threeRef.current.bondMeshes = [];

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height)); // ✅ use container height too
      renderer.setSize(w, h, false);
      camera.aspect = w / h; // ✅ rectangle aspect
      camera.updateProjectionMatrix();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // default seed cluster centered: 20 C, 10 O, 70 H
    const sim = simRef.current;
    clearSim3D(sim);
    const initialCounts = [
      ["C", 20],
      ["O", 10],
      ["H", 70],
    ];
    for (const [el, count] of initialCounts) {
      for (let i = 0; i < count; i++) {
        addAtom3D(
          sim,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          el,
          elements,
          MAX_ATOMS,
        );
      }
    }

    // loop
    let last = performance.now();
    let acc = 0;
    const FIXED_DT = 1 / 60;
    const MAX_SUBSTEPS = 6;

    let bondOrderTimer = 0;
    const BOND_ORDER_PERIOD = 0.25;

    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;

      const params = paramsRef.current;
      if (!params) return;

      if (!pausedRef.current) {
        let steps = 0;
        while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
          stepSim3D(simRef.current, params, FIXED_DT);

          bondOrderTimer += FIXED_DT;
          if (bondOrderTimer >= BOND_ORDER_PERIOD) {
            bondOrderTimer = 0;
            recomputeBondOrders(simRef.current, params);
          }

          acc -= FIXED_DT;
          steps++;
        }
      } else {
        acc = 0;
      }

      threeRef.current.controls?.update?.();

      const simNow = simRef.current;
      for (const a of simNow.atoms) {
        const spr = ensureSpriteForAtom(a);
        spr.position.set(a.x, a.y, a.z);
        const depth = 1 + a.z * 0.02;
        const s = a.r * 2.2 * depth;
        spr.scale.set(s, s, 1);
      }
      removeMissingSprites();

      syncBondCylinders();
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mount.removeChild(renderer.domElement);

      controls.dispose();
      renderer.dispose();

      for (const mat of threeRef.current.spriteMaterials.values()) {
        mat.map?.dispose?.();
        mat.dispose?.();
      }
      threeRef.current.spriteMaterials.clear();

      for (const mesh of threeRef.current.bondMeshes) {
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      }
      threeRef.current.bondMeshes = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pointer handling
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const t = threeRef.current;
    const sim = simRef.current;

    const getPointerNDC = (e) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      t.pointerNDC.set(x, y);
    };

    const raycastAtom = () => {
      t.raycaster.setFromCamera(t.pointerNDC, t.camera);
      const hits = t.raycaster.intersectObjects(t.atomGroup.children, false);
      if (!hits.length) return null;
      const id = hits[0].object.userData?.atomId ?? null;
      return typeof id === "number" ? id : null;
    };

    const updateDragPlane = (anchorPoint) => {
      t.camera.getWorldDirection(t.dragPlaneNormal);
      t.dragPlane.setFromNormalAndCoplanarPoint(t.dragPlaneNormal, anchorPoint);
    };

    const rayToPlane = () => {
      t.raycaster.setFromCamera(t.pointerNDC, t.camera);
      const ok = t.raycaster.ray.intersectPlane(t.dragPlane, t.dragHit);
      return ok ? t.dragHit : null;
    };

    const onDown = (e) => {
      const controlsEl = document.getElementById("controls-overlay");
      const instructionsEl = document.getElementById("instructions-overlay");
      if (
        (controlsEl && controlsEl.contains(e.target)) ||
        (instructionsEl && instructionsEl.contains(e.target))
      )
        return;

      if (toolRef.current === TOOL.ROTATE) return;

      getPointerNDC(e);
      const id = raycastAtom();

      if (toolRef.current === TOOL.DELETE && id) {
        removeAtom3D(sim, id);
        return;
      }

      if (id) {
        const a = sim.atoms.find((x) => x.id === id);
        if (!a) return;
        setGrab(sim, id);
        updateDragPlane(new THREE.Vector3(a.x, a.y, a.z));
        const hit = rayToPlane();
        if (hit) setGrabTarget(sim, hit.x, hit.y, hit.z);
        return;
      }

      if (toolRef.current === TOOL.PLACE) {
        const placePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        t.raycaster.setFromCamera(t.pointerNDC, t.camera);
        const p = new THREE.Vector3();
        const ok = t.raycaster.ray.intersectPlane(placePlane, p);
        if (!ok) return;

        addAtom3D(sim, p.x, p.y, p.z, placeElement, elements, MAX_ATOMS);
      }
    };

    const onMove = (e) => {
      if (toolRef.current === TOOL.ROTATE) return;

      getPointerNDC(e);
      if (sim.grabbedId) {
        const hit = rayToPlane();
        if (hit) setGrabTarget(sim, hit.x, hit.y, hit.z);
      }
    };

    const onUp = () => setGrab(sim, null);

    mount.addEventListener("pointerdown", onDown);
    mount.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [placeElement, elements]);

  // actions
  function clearAll() {
    clearSim3D(simRef.current);
  }
  function shake() {
    nudgeAll(simRef.current, 1.8);
  }

  function spawnRandom() {
    const sim = simRef.current;
    for (let i = 0; i < 10; i++) {
      const el = ELEMENTS[i % ELEMENTS.length];
      addAtom3D(
        sim,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        el,
        elements,
        MAX_ATOMS,
      );
    }
    shake();
  }

  function spawnSelected() {
    const sim = simRef.current;
    for (let i = 0; i < 10; i++) {
      addAtom3D(
        sim,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        placeElement,
        elements,
        MAX_ATOMS,
      );
    }
    shake();
  }

  // Reset ALL controls EXCEPT the currently-selected tool mode
  function resetAllControls() {
    setPaused(false);
    setTemperatureK(400);
    setDamping(0.975);
    setBondScale(3.5);

    setBoxHalfSize(6.0);
    setShowBoxEdges(true);

    setShowBonds(true);
    setAllowMultipleBonds(true);

    // DO NOT change tool
    setPlaceElement("C");

    setLj(structuredClone(DEFAULT_LJ));
    setLjElement("C");

    // leave controlsOpen as-is (don’t force open on mobile)
    setWellsOpen(true);
  }

  // LJ sliders edit ljElement
  const selectedSigma = lj[ljElement]?.sigma ?? 1.1;
  const selectedEpsilon = lj[ljElement]?.epsilon ?? 1.0;

  function updateSelectedLJ(field, v) {
    setLj((prev) => {
      const next = structuredClone(prev);
      next[ljElement][field] = v;
      return next;
    });
  }

  const instructionText = useMemo(() => {
    if (tool === TOOL.ROTATE) {
      return {
        title: "Rotate mode",
        lines: [
          "Drag: rotate view",
          "Scroll / pinch: zoom",
          "Right-drag / two-finger drag: pan",
        ],
      };
    }
    if (tool === TOOL.DELETE) {
      return { title: "Delete mode", lines: ["Click an atom to delete it."] };
    }
    return {
      title: "Place mode",
      lines: ["Click empty space: place atom", "Click+drag atom: move it"],
    };
  }, [tool]);

  return (
    <section className="page">
      <header style={{ marginBottom: 16 }}>
        <h1>Reactor</h1>
        <p className="lede">
          Toy chemistry sandbox: drop atoms, tweak force fields and
          environmental conditions, and watch matter change. Not necessarily the
          most accurate, but close enough for fun and educational molecular
          play.
        </p>
      </header>

      <div style={ui.canvasCard}>
        {/* Controls: top-left */}
        {controlsOpen ? (
          <div id="controls-overlay" style={ui.controls}>
            <div style={ui.headerRow}>
              <div style={ui.title}>Controls</div>
              <button
                onClick={() => setControlsOpen(false)}
                style={ui.btnLight}
              >
                Hide
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setPaused((p) => !p)} style={ui.btnDark}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button onClick={shake} style={ui.btnLight}>
                Shake
              </button>
              <button onClick={clearAll} style={ui.btnLight}>
                Clear
              </button>
              <button onClick={resetAllControls} style={ui.btnLight}>
                Reset all controls
              </button>
              <button onClick={resetView} style={ui.btnLight}>
                Reset view
              </button>
            </div>

            <div style={ui.section}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#0f172a" }}>
                Simulation
              </div>

              <MiniSlider
                label="Temp (K)"
                value={temperatureK}
                min={0}
                max={1000}
                step={10}
                onChange={setTemperatureK}
              />
              <MiniSlider
                label="Damping"
                value={damping}
                min={0.94}
                max={0.999}
                step={0.001}
                onChange={setDamping}
              />
              <MiniSlider
                label="Bond strength"
                value={bondScale}
                min={0.2}
                max={4.0}
                step={0.05}
                onChange={setBondScale}
              />
              <MiniSlider
                label="Volume (box size)"
                value={boxHalfSize}
                min={0.6}
                max={10}
                step={0.1}
                onChange={setBoxHalfSize}
              />

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  View Box Edges
                </span>
                <input
                  type="checkbox"
                  checked={showBoxEdges}
                  onChange={(e) => setShowBoxEdges(e.target.checked)}
                />
              </label>

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  Visualize Bonds
                </span>
                <input
                  type="checkbox"
                  checked={showBonds}
                  onChange={(e) => setShowBonds(e.target.checked)}
                />
              </label>

              <label style={ui.row}>
                <span
                  style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                >
                  Allow double/triple
                </span>
                <input
                  type="checkbox"
                  checked={allowMultipleBonds}
                  onChange={(e) => setAllowMultipleBonds(e.target.checked)}
                />
              </label>
            </div>

            <div style={ui.section}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{ fontSize: 11, fontWeight: 950, color: "#0f172a" }}
                >
                  Nonbonded (LJ) for
                </div>
                <select
                  value={ljElement}
                  onChange={(e) => setLjElement(e.target.value)}
                  style={ui.select}
                >
                  {ELEMENTS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <MiniSlider
                label="σ (distance)"
                value={selectedSigma}
                min={0.6}
                max={2.3}
                step={0.02}
                onChange={(v) => updateSelectedLJ("sigma", v)}
              />
              <MiniSlider
                label="ε (stickiness)"
                value={selectedEpsilon}
                min={0.0}
                max={2.4}
                step={0.05}
                onChange={(v) => updateSelectedLJ("epsilon", v)}
              />

              <div style={{ marginTop: 6 }}>
                <div style={ui.row}>
                  <div
                    style={{ fontSize: 11, fontWeight: 950, color: "#0f172a" }}
                  >
                    Energy wells
                  </div>
                  <button
                    onClick={() => setWellsOpen((s) => !s)}
                    style={ui.btnLight}
                  >
                    {wellsOpen ? "Hide" : "Show"}
                  </button>
                </div>
                {wellsOpen ? (
                  <div style={{ marginTop: 8 }}>
                    <CombinedEnergyWells lj={lj} cutoff={FIXED_CUTOFF} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div style={ui.floatingShow}>
            <button onClick={() => setControlsOpen(true)} style={ui.btnLight}>
              Show controls
            </button>
          </div>
        )}

        {/* Instructions: top-right */}
        <div id="instructions-overlay" style={ui.instructions}>
          <div style={ui.hintTitle}>{instructionText.title}</div>
          <div style={{ ...ui.hintText, marginTop: 4 }}>
            {instructionText.lines.map((s, i) => (
              <div key={i}>{s}</div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(15,23,42,0.12)",
              paddingTop: 10,
              marginTop: 10,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={ui.pillBtn(tool === TOOL.PLACE)}
                onClick={() => setTool(TOOL.PLACE)}
              >
                Place
              </button>
              <button
                style={ui.pillBtn(tool === TOOL.DELETE, "danger")}
                onClick={() => setTool(TOOL.DELETE)}
              >
                Delete
              </button>
              <button
                style={ui.pillBtn(tool === TOOL.ROTATE)}
                onClick={() => setTool(TOOL.ROTATE)}
              >
                Rotate
              </button>
            </div>

            {tool === TOOL.PLACE ? (
              <>
                <div style={ui.row}>
                  <span
                    style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}
                  >
                    Place element
                  </span>
                  <select
                    value={placeElement}
                    onChange={(e) => setPlaceElement(e.target.value)}
                    style={ui.select}
                  >
                    {ELEMENTS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={spawnSelected} style={ui.btnLight}>
                    Spawn ten {placeElement}
                  </button>
                  <button onClick={spawnRandom} style={ui.btnLight}>
                    Spawn ten Random
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ✅ Rectangle canvas: set explicit height */}
        <div
          ref={mountRef}
          style={{
            width: "100%",
            height: "min(660px, 72vh)", // smaller vertically so you can see everything
            minHeight: 320,
          }}
        />
      </div>
    </section>
  );
}

function MiniSlider({ label, value, min, max, step, onChange }) {
  const format = () => {
    if (Number.isInteger(step)) return `${Math.round(value)}`;
    return value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 2);
  };

  return (
    <label style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#334155",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {format()}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(
            step % 1 === 0
              ? parseInt(e.target.value, 10)
              : parseFloat(e.target.value),
          )
        }
      />
    </label>
  );
}

function CombinedEnergyWells({ lj, cutoff }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");

    const W = c.width;
    const H = c.height;

    let rMin = 0.4;
    let rMax = Math.min(cutoff, 5.5);

    const N = 260;
    const curves = ELEMENTS.map((el) => {
      const { sigma, epsilon } = mixLorentzBerthelot(lj, el, el);
      const rrMin = Math.max(0.35, sigma * 0.65);
      const rrMax = Math.max(rrMin + 0.5, Math.min(rMax, sigma * 4.2));
      rMin = Math.min(rMin, rrMin);
      rMax = Math.max(rMax, rrMax);

      const xs = [];
      const ys = [];
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const r = rrMin + (rrMax - rrMin) * t;
        xs.push(r);
        ys.push(ljPotential(r, epsilon, sigma));
      }
      return { el, xs, ys };
    });

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const cur of curves) {
      for (const u of cur.ys) {
        yMin = Math.min(yMin, u);
        yMax = Math.max(yMax, u);
      }
    }
    const wallCap = Math.max(2.2, Math.abs(yMin) * 0.6);
    yMax = Math.min(yMax, wallCap);
    yMin = Math.max(yMin, -wallCap);

    const pad = 28;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const xToPx = (r) => pad + ((r - rMin) / (rMax - rMin)) * plotW;
    const yToPx = (u) => pad + (1 - (u - yMin) / (yMax - yMin)) * plotH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = pad + (plotH * i) / 4;
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
    }
    for (let i = 0; i <= 5; i++) {
      const x = pad + (plotW * i) / 5;
      ctx.moveTo(x, pad);
      ctx.lineTo(x, H - pad);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#0f172a";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("U(r)", 10, 10);
    ctx.textAlign = "right";
    ctx.fillText("r", W - 10, H - 16);

    const y0 = yToPx(0);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(W - pad, y0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const colors = {
      S: "#b45309",
      P: "#d97706",
      O: "#dc2626",
      N: "#2563eb",
      C: "#111827",
      H: "#334155",
    };

    for (const cur of curves) {
      ctx.strokeStyle = colors[cur.el] || "#0f172a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < cur.xs.length; i++) {
        const x = xToPx(cur.xs[i]);
        const y = yToPx(clamp(cur.ys[i], yMin, yMax));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // legend
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let lx = pad;
    let ly = pad - 12;
    for (const el of ELEMENTS) {
      ctx.fillStyle = colors[el] || "#0f172a";
      ctx.fillRect(lx, ly - 5, 10, 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(el, lx + 14, ly);
      lx += 42;
    }
  }, [lj, cutoff]);

  return (
    <canvas
      ref={canvasRef}
      width={390}
      height={180}
      style={{
        width: "100%",
        height: 180,
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.12)",
      }}
    />
  );
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
