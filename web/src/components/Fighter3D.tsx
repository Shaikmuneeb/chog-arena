"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Preload } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  fighter3DConfig,
  type Fighter3DConfig,
  type Fighter3DState,
} from "@/config/fighterModels";
import type { FighterClass } from "@/config/fighterClasses";

export type StageFighter3D = {
  side: "creator" | "challenger";
  fighterClass: FighterClass;
  /** Current animation state. */
  state: Fighter3DState;
  /** Stage position as a percentage of the stage width. */
  x: number;
  facing: "left" | "right";
  /** Target sprite height in pixels (matches the 2D fighters). */
  height: number;
};

/* ------------------------------------------------------------------ loading */

const fbxCache = new Map<string, Promise<THREE.Group>>();

function loadFbx(url: string): Promise<THREE.Group> {
  const hit = fbxCache.get(url);
  if (hit) return hit;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
  fbxCache.set(url, promise);
  return promise;
}

function assetUrl(path: string): string {
  return `/models/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Push the skin texture onto every material of the loaded mesh.
 *
 * The exported FBX references its diffuse map through a relative
 * `<hash>.fbm/<file>.png` path that does not exist next to the archive, so
 * without this the character would spawn untextured (white).
 */
function applySkinTexture(object: THREE.Object3D, texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const mat = material as THREE.MeshPhongMaterial;
      mat.map = texture;
      mat.color?.set(0xffffff);
      mat.shininess = 14;
      mat.specular?.set(0x1a1a1a);
      mat.needsUpdate = true;
    }
  });
}

/* --------------------------------------------------------------- the fighter */

function FighterModel({
  spec,
  fightersRef,
  onStatus,
}: {
  spec: StageFighter3D;
  fightersRef: MutableRefObject<StageFighter3D[]>;
  onStatus?: (side: "creator" | "challenger", ok: boolean) => void;
}) {
  const cfg = fighter3DConfig(spec.fighterClass) as Fighter3DConfig;
  const root = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<Record<string, THREE.AnimationAction>>({});
  const activeState = useRef<Fighter3DState | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);
  /* the ortho camera is 1 world unit = 1 px, so the canvas size IS the stage
   * size in pixels and the DOM fighters line up exactly. */
  const { size } = useThree();

  /* ---- load the base rig (idle export doubles as the visible mesh) ---- */
  useEffect(() => {
    let cancelled = false;
    const url = assetUrl(`${cfg.dir}/${cfg.clips.idle}`);
    loadFbx(url)
      .then((group) => {
        if (cancelled) return;
        setModel(group);
        onStatus?.(spec.side, true);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onStatus?.(spec.side, false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.dir, cfg.clips.idle, spec.side]);

  /* ---- load the skin texture (the FBX's own path is broken) ---- */
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      assetUrl(`${cfg.dir}/${cfg.texture}`),
      (tex) => {
        if (cancelled) return;
        setTexture(tex);
      },
      undefined,
      () => {
        /* texture missing — the mesh still renders, just untextured */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cfg.dir, cfg.texture]);

  /* ---- apply the texture + build the mixer once the mesh is ready ---- */
  useEffect(() => {
    if (!model) return;
    if (texture) applySkinTexture(model, texture);
    const m = new THREE.AnimationMixer(model);
    mixer.current = m;
    const idleClip = model.animations?.[0];
    if (idleClip) {
      const action = m.clipAction(idleClip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      actions.current.idle = action;
    }
    /* one-shot clips (attack / hit) fall back to idle when they finish */
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      const key = Object.keys(actions.current).find(
        (k) => actions.current[k] === event.action,
      );
      if (!key || key === "ko" || key === "victory" || key === "idle") return;
      activeState.current = "idle";
      const idle = actions.current.idle;
      if (idle) {
        idle.reset();
        idle.setLoop(THREE.LoopRepeat, Infinity);
        idle.fadeIn(0.2).play();
      }
    };
    m.addEventListener("finished", onFinished);
    return () => {
      m.removeEventListener("finished", onFinished);
      m.stopAllAction();
      mixer.current = null;
      actions.current = {};
    };
  }, [model, texture]);

  /* ---- fetch a clip the first time a state is requested ---- */
  const ensureClip = (state: Fighter3DState) => {
    const m = mixer.current;
    if (!m || actions.current[state]) return;
    const file = cfg.clips[state];
    if (!file) return;
    loadFbx(assetUrl(`${cfg.dir}/${file}`))
      .then((group) => {
        const clip = group.animations?.[0];
        if (!clip || !mixer.current) return;
        const action = mixer.current.clipAction(clip);
        action.enabled = true;
        action.setEffectiveWeight(0);
        actions.current[state] = action;
      })
      .catch(() => {
        /* clip unavailable — the fighter stays on the last animation */
      });
  };

  /* ---- per-frame: transform + animation state machine ---- */
  useFrame((_, delta) => {
    const live = fightersRef.current.find((f) => f.side === spec.side);
    if (!live || !root.current) return;

    /* position: stage % -> world px (the ortho camera is 1 unit = 1 px) */
    const worldX = (live.x / 100) * size.width - size.width / 2;
    const facingLeft = live.facing === "left";
    /* the models are authored facing +Z (towards the camera) — a quarter turn
     * points their front at the opponent, and a touch less than 90° keeps a
     * cinematic 3/4 view instead of a flat profile. */
    root.current.rotation.y = facingLeft
      ? -Math.PI / 2 + 0.42
      : Math.PI / 2 - 0.42;

    /* scale to the requested sprite height */
    const bbox = root.current.userData.bbox as
      | { sizeY: number; centerX: number; minY: number }
      | undefined;
    if (bbox && bbox.sizeY > 0) {
      const scale = live.height / bbox.sizeY;
      root.current.scale.setScalar(scale);
      /* forward lunge on attacks, mirroring the 2D sprite punch */
      const foe = fightersRef.current.find((f) => f.side !== spec.side);
      const toward = foe
        ? Math.sign(foe.x - live.x) || (facingLeft ? -1 : 1)
        : facingLeft
          ? -1
          : 1;
      const lunge = live.state === "attack" ? toward * 48 : 0;
      /* the PI rotation mirrors the model's local X, so the centring offset
       * flips with the facing direction. */
      root.current.position.x =
        worldX + lunge + (facingLeft ? bbox.centerX : -bbox.centerX) * scale;
      root.current.position.y = -size.height / 2 + 20 - bbox.minY * scale;
    } else {
      root.current.position.x = worldX;
      root.current.position.y = -size.height / 2 + 20;
    }

    /* animation state machine */
    if (live.state !== activeState.current) {
      activeState.current = live.state;
      const m = mixer.current;
      if (m) {
        ensureClip(live.state);
        const next = actions.current[live.state];
        if (next) {
          next.reset();
          next.enabled = true;
          next.setEffectiveTimeScale(1);
          next.setLoop(
            live.state === "idle" ||
              live.state === "block" ||
              live.state === "victory"
              ? THREE.LoopRepeat
              : THREE.LoopOnce,
            Infinity,
          );
          next.clampWhenFinished = live.state === "ko";
          next.fadeIn(0.18).fadeOut(0.18);
          next.play();
          /* cross-fade out whatever was running */
          for (const [key, action] of Object.entries(actions.current)) {
            if (key !== live.state && action !== next) {
              action.fadeOut(0.18);
            }
          }
        }
      }
    }

    /* one-shot clips fall back to idle when they finish (mixer event) */

    /* red damage flash on hit (the 2D fighters get this from CSS) */
    if (model && live.state === "hit") {
      const pulse = Math.sin(performance.now() / 55) * 0.5 + 0.5;
      model.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          const mat = material as THREE.MeshPhongMaterial;
          if (mat.emissive) mat.emissive.setRGB(pulse * 0.55, 0, 0);
        }
      });
    }

    mixer.current?.update(Math.min(delta, 0.05));
  });

  /* ---- compute the fit once the mesh is in ---- */
  useEffect(() => {
    if (!model || !root.current) return;
    const g = root.current;
    /* Measure in the model's LOCAL space: the group may already carry the
     * stage offset + scale, which would otherwise poison the bounds. */
    const prevScale = g.scale.clone();
    const prevPos = g.position.clone();
    const prevRot = g.rotation.clone();
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    g.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    g.scale.copy(prevScale);
    g.position.copy(prevPos);
    g.rotation.copy(prevRot);
    g.updateMatrixWorld(true);

    g.userData.bbox = {
      sizeY: size.y || 1,
      centerX: center.x,
      minY: box.min.y,
    };
  }, [model]);

  if (failed || !model) return null;

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

/* ------------------------------------------------------------------ the stage */

function StageScene({
  fightersRef,
  onStatus,
}: {
  fightersRef: MutableRefObject<StageFighter3D[]>;
  onStatus?: (side: "creator" | "challenger", ok: boolean) => void;
}) {
  const { size } = useThree();
  void size;

  const three = fightersRef.current.filter((f) => fighter3DConfig(f.fighterClass));

  return (
    <>
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#c4b5fd", "#0a0a12", 0.7]} />
      <directionalLight
        position={[-60, 90, 120]}
        intensity={1.5}
        color="#fff4e6"
      />
      <directionalLight
        position={[70, 40, -80]}
        intensity={0.8}
        color="#a855f7"
      />
      {three.map((spec) => (
        <FighterModel
          key={spec.side}
          spec={spec}
          fightersRef={fightersRef}
          onStatus={onStatus}
        />
      ))}
    </>
  );
}

/**
 * Cinematic 3D layer for the battle stage. Transparent canvas that sits
 * behind the 2D fighters, so characters that ship a rigged model are drawn
 * in 3D while the rest keep their sprite treatment.
 */
export function FighterStage3D({
  fightersRef,
  onStatus,
}: {
  fightersRef: MutableRefObject<StageFighter3D[]>;
  onStatus?: (side: "creator" | "challenger", ok: boolean) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 400], zoom: 1, near: 0.1, far: 2000 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <StageScene fightersRef={fightersRef} onStatus={onStatus} />
          <Preload all />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  );
}
