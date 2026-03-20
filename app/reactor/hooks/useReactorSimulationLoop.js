import { useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clearSim3D, stepSim3D } from "@/lib/sim/physics3d";

export function useReactorSimulationLoop({
  mountRef,
  rafRef,
  threeRef,
  simRef,
  paramsRef,
  toolRef,
  rotateToolValue,
  refreshBoxVisuals,
  seedInitialAtoms,
  scanCollectionProgress,
  queueCollectionScan,
  ensureSpriteForAtom,
  removeMissingSprites,
  syncLiveAtomGlow,
  syncPeriodicRepeatSprites,
  syncBondCylinders,
  pausedRef,
  queuedScanTimerRef,
  queuedScanPendingRef,
  collectionScanIntervalSteps,
}) {
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

    const repeatAtomGroup = new THREE.Group();
    scene.add(repeatAtomGroup);

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
    controls.enabled = toolRef.current === rotateToolValue;
    controls.target.set(0, 0, 0);
    controls.update();

    const three = threeRef.current;
    three.renderer = renderer;
    three.scene = scene;
    three.camera = camera;
    three.controls = controls;
    three.raycaster = raycaster;
    three.atomGroup = atomGroup;
    three.repeatAtomGroup = repeatAtomGroup;
    three.repeatAtomSprites = [];
    three.bondGroup = bondGroup;
    three.bondMeshes = [];
    refreshBoxVisuals();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const sim = simRef.current;
    clearSim3D(sim);
    if (typeof seedInitialAtoms === "function") {
      seedInitialAtoms(sim);
    }
    scanCollectionProgress(sim);

    let last = performance.now();
    let acc = 0;
    const FIXED_DT = 1 / 60;
    const MAX_SUBSTEPS = 6;
    let scanStepAccumulator = 0;

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

          acc -= FIXED_DT;
          steps += 1;
        }
        if (steps > 0) {
          scanStepAccumulator += steps;
          if (scanStepAccumulator >= collectionScanIntervalSteps) {
            scanStepAccumulator = 0;
            queueCollectionScan();
          }
        }
      } else {
        acc = 0;
      }

      three.controls?.update?.();

      const simNow = simRef.current;
      for (const atom of simNow.atoms) {
        const spr = ensureSpriteForAtom(atom);
        spr.position.set(atom.x, atom.y, atom.z);
        const depth = 1 + atom.z * 0.02;
        const s = atom.r * 2.2 * depth;
        spr.scale.set(s, s, 1);
      }
      removeMissingSprites();
      syncLiveAtomGlow(now);
      syncPeriodicRepeatSprites();
      syncBondCylinders();
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (queuedScanTimerRef.current) {
        clearTimeout(queuedScanTimerRef.current);
        queuedScanTimerRef.current = null;
      }
      queuedScanPendingRef.current = false;
      ro.disconnect();
      mount.removeChild(renderer.domElement);

      controls.dispose();
      renderer.dispose();

      for (const mat of three.spriteMaterials.values()) {
        mat.map?.dispose?.();
        mat.dispose?.();
      }
      three.spriteMaterials.clear();
      for (const spr of three.repeatAtomSprites) {
        three.repeatAtomGroup?.remove(spr);
        spr.material?.dispose?.();
      }
      three.repeatAtomSprites = [];

      for (const mesh of three.bondMeshes) {
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      }
      three.bondMeshes = [];

      for (const glow of three.glowSprites.values()) {
        three.atomGroup?.remove(glow);
        glow.material?.dispose?.();
      }
      three.glowSprites.clear();
      three.glowTexture?.dispose?.();
      three.glowTexture = null;
    };
    // Init/render loop should mount once; re-running this effect resets simulation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

