"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  Center,
  Grid,
  MeshReflectorMaterial,
  Preload,
  Text3D,
  useAnimations,
  useFBX,
} from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  fighter3DConfig,
  type Fighter3DConfig,
  type FighterActionState,
} from "@/config/fighterModels";
import type { FighterClass } from "@/config/fighterClasses";

export type StageFighter3D = {
  side: "creator" | "challenger";
  fighterClass: FighterClass;
  /** Current animation state. */
  state: FighterActionState;
  /** Stage position as a percentage of the stage width. */
  x: number;
  facing: "left" | "right";
};

/* ------------------------------------------------------------------ loading */

/** One fetch per clip file — many consumers share it. */
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

const textureCache = new Map<string, Promise<THREE.Texture>>();

function loadSkinTexture(url: string): Promise<THREE.Texture> {
  const hit = textureCache.get(url);
  if (hit) return hit;
  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
  textureCache.set(url, promise);
  return promise;
}

/** Asset URLs live under /new fighters design/<character>/. */
export function clipUrl(cfg: Fighter3DConfig, file: string): string {
  return `/new fighters design/${encodeURIComponent(cfg.dir)}/${encodeURIComponent(file)}`;
}

export function textureUrl(cfg: Fighter3DConfig): string {
  return `/new fighters design/${encodeURIComponent(cfg.dir)}/${encodeURIComponent(cfg.texture)}`;
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

/**
 * Measure a rig in its BIND pose.
 *
 * `Box3.setFromObject` uses the CURRENT animated pose, so the box would
 * change as the clip plays and the model would drift out of frame. The
 * geometry's bounding box is the rest pose, so the fit stays stable.
 */
function measureBindBox(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const local = new THREE.Box3();
  object.updateWorldMatrix(true, true);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    local.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    box.union(local);
  });
  return box;
}

/* ---------------------------------------------------------------- the mixer */

/**
 * Collects the fighter's clips and hands them to drei's `useAnimations`.
 *
 * Every Mixamo export names its clip "mixamo.com", so the clips are RENAMED
 * after their action state — that is what makes `actions[state]` resolve.
 *
 * The clip load is ASYNC (each FBX is ~10-20MB), so a clip may not exist
 * yet when an action fires. Two things make that safe:
 *   1. every clip is pre-fetched as soon as the rig lands;
 *   2. when a clip arrives, the action map is rebuilt and the currently
 *      playing action is re-applied (see `useEffect` on `actions`).
 */
function useFighterActions(
  cfg: Fighter3DConfig,
  group: React.RefObject<THREE.Group | null>,
  wanted: FighterActionState[],
) {
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = wanted.join(",");

  /* fetch the clips this consumer needs, renaming as we go */
  useEffect(() => {
    let cancelled = false;
    const states = (key ? key.split(",") : []) as FighterActionState[];
    Promise.all(
      states.map(async (state) => {
        const group = await loadFbx(clipUrl(cfg, cfg.clips[state]));
        const clip = group.animations?.[0];
        if (!clip) return null;
        const copy = clip.clone();
        copy.name = state;
        return copy;
      }),
    )
      .then((list) => {
        if (cancelled) return;
        /* de-duplicate: several states can share one clip file */
        const seen = new Set<string>();
        const unique = list.filter((clip): clip is THREE.AnimationClip => {
          if (!clip) return false;
          if (seen.has(clip.name)) return false;
          seen.add(clip.name);
          return true;
        });
        setClips(unique);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, key]);

  const api = useAnimations(
    clips,
    group as unknown as React.RefObject<THREE.Object3D>,
  );
  return { ...api, loaded, clips };
}

/* ------------------------------------------------------------- stage fighter */

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
  const group = useRef<THREE.Group>(null);
  const desired = useRef<FighterActionState>("idle");
  /** materials of the rig, cached for the hit flash */
  const materialCache = useRef<THREE.MeshPhongMaterial[] | null>(null);
  const wasHit = useRef(false);
  /* the ortho camera is 1 world unit = 1 px, so the canvas size IS the stage
   * size in pixels and the 3D fighters line up with the stage. */
  const { size } = useThree();

  /* the rig: the idle export doubles as the visible mesh */
  const source = useFBX(clipUrl(cfg, cfg.clips.idle));
  const scene = useMemo(() => SkeletonUtils.clone(source), [source]);

  useEffect(() => {
    onStatus?.(spec.side, true);
  }, [spec.side, onStatus]);

  /* the skin texture (the FBX's own path is broken) */
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureSettled, setTextureSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSkinTexture(textureUrl(cfg))
      .then((tex) => {
        if (cancelled) return;
        setTexture(tex);
        setTextureSettled(true);
      })
      .catch(() => {
        /* texture missing — the mesh still renders, just untextured */
        if (!cancelled) setTextureSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  useEffect(() => {
    if (!texture) return;
    applySkinTexture(scene, texture);
    /* cache the materials so the hit flash can toggle their emissive */
    const mats: THREE.MeshPhongMaterial[] = [];
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of list) {
        if (mat && (mat as THREE.MeshPhongMaterial).emissive) {
          mats.push(mat as THREE.MeshPhongMaterial);
        }
      }
    });
    materialCache.current = mats;
  }, [scene, texture]);

  /* the stage needs every clip — the fight can throw any of them */
  const ALL_STATES = Object.keys(cfg.clips) as FighterActionState[];
  const { actions, mixer, loaded } = useFighterActions(
    cfg,
    group,
    ALL_STATES,
  );

  /* ---- play the action for the current state ---- */
  useEffect(() => {
    if (!loaded) return;
    const current = actions[desired.current] ?? actions.idle;
    if (!current) return;
    for (const key of Object.keys(actions)) {
      const action = actions[key];
      if (action && action !== current) action.fadeOut(0.15);
    }
    /* the idle loop is never restarted (that made the fighter twitch);
     * strikes restart so each punch reads as a new blow. */
    if (desired.current !== "idle") current.reset();
    current.setEffectiveTimeScale(1);
    current.setLoop(
      desired.current === "idle" ||
        desired.current === "block" ||
        desired.current === "victory"
        ? THREE.LoopRepeat
        : THREE.LoopOnce,
      Infinity,
    );
    current.clampWhenFinished = desired.current === "ko";
    current.fadeIn(0.15).play();
  }, [actions, loaded, desired]);

  /* ---- compute the fit once the mesh is in ---- */
  useEffect(() => {
    if (!group.current) return;
    const g = group.current;
    /* Measure the model in its FACING orientation: the quarter turn swaps
     * its width and depth, so a rest-pose box would mis-centre it. */
    const prevScale = g.scale.clone();
    const prevPos = g.position.clone();
    const prevRot = g.rotation.clone();
    const prevSceneRot = scene.rotation.clone();
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    scene.rotation.set(
      0,
      spec.facing === "left" ? -Math.PI / 2 + 0.42 : Math.PI / 2 - 0.42,
      0,
    );
    g.updateMatrixWorld(true);

    const box = measureBindBox(scene);
    const sizeV = new THREE.Vector3();
    box.getSize(sizeV);
    const center = new THREE.Vector3();
    box.getCenter(center);

    g.scale.copy(prevScale);
    g.position.copy(prevPos);
    g.rotation.copy(prevRot);
    scene.rotation.copy(prevSceneRot);
    /* Normalise the rig so its feet sit on y = 0 — the FBX origin is not at
     * the feet, which would otherwise float the model off the ground. */
    scene.position.y = -box.min.y;
    g.updateMatrixWorld(true);

    g.userData.bbox = {
      sizeY: sizeV.y || 1,
      centerX: center.x,
      minY: 0,
    };
  }, [scene, spec.facing, textureSettled]);

  /* ---- per-frame: transform + action state machine ---- */
  useFrame((_, delta) => {
    const live = fightersRef.current.find((f) => f.side === spec.side);
    if (!live || !group.current) return;

    const worldX = (live.x / 100 - 0.5) * STAGE_WIDTH;
    const facingLeft = live.facing === "left";

    const bbox = group.current.userData.bbox as
      | { sizeY: number; centerX: number; minY: number }
      | undefined;
    if (bbox && bbox.sizeY > 0) {
      const scale = FIGHTER_HEIGHT / bbox.sizeY;
      group.current.scale.setScalar(scale);
      /* forward lunge on attacks, mirroring the 2D sprite punch */
      const foe = fightersRef.current.find((f) => f.side !== spec.side);
      const toward = foe
        ? Math.sign(foe.x - live.x) || (facingLeft ? -1 : 1)
        : facingLeft
          ? -1
          : 1;
      const lunge =
        live.state.endsWith("Attack") ||
        live.state === "special" ||
        live.state === "critical"
          ? toward * 0.55
          : 0;
      /* the rotation mirrors the model's local X, so the centring offset
       * flips with the facing direction. */
      group.current.position.x =
        worldX + lunge + (facingLeft ? bbox.centerX : -bbox.centerX) * scale;
      group.current.position.y = -bbox.minY * scale;
    } else {
      group.current.position.x = worldX;
      group.current.position.y = 0;
    }

    /* action state machine */
    if (live.state !== desired.current) {
      desired.current = live.state;
      const action = actions[live.state] ?? actions.idle;
      if (action) {
        for (const key of Object.keys(actions)) {
          const other = actions[key];
          if (other && other !== action) other.fadeOut(0.15);
        }
        /* strikes restart so every blow reads; the idle loop is left alone
         * so the fighter never twitches back to frame zero. */
        if (live.state !== "idle") action.reset();
        action.setEffectiveTimeScale(1);
        action.setLoop(
          live.state === "idle" ||
            live.state === "block" ||
            live.state === "victory"
            ? THREE.LoopRepeat
            : THREE.LoopOnce,
          Infinity,
        );
        action.clampWhenFinished = live.state === "ko";
        action.fadeIn(0.15).play();
      }
    }

    /* red damage flash on hit — cleared the moment the hit ends, otherwise
     * the fighter stays tinted red for the rest of the match. */
    const materials = materialCache.current;
    if (materials) {
      if (live.state === "hit") {
        const pulse = Math.sin(performance.now() / 40) * 0.5 + 0.5;
        for (const mat of materials) mat.emissive.setRGB(pulse * 0.22, 0, 0);
      } else if (wasHit.current) {
        for (const mat of materials) mat.emissive.setRGB(0, 0, 0);
      }
    }
    wasHit.current = live.state === "hit";

    void mixer;
    void delta;
  });

  /* Hold the fighter back until its skin texture has landed — otherwise the
   * rig pops in as an untextured white silhouette for a frame. */
  if (!textureSettled) return null;

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/* ------------------------------------------------------------------ the arena */

/* World units: the fighters are ~2.4 units tall, the stage is ~10.5 units wide. */
const FIGHTER_HEIGHT = 2.6;
const STAGE_WIDTH = 12;

/**
 * The arena backdrop: large extruded neon "CWO" lettering glowing behind the
 * fighters, a dark reflective floor with a cyberpunk grid, and accent
 * lighting. Everything is real 3D geometry — no flat background images.
 */
function ArenaBackdrop() {
  return (
    <group>
      {/* ---- extruded neon CWO sign, deep behind and above the fighters ---- */}
      <group position={[0, 4.3, -8]}>
        <Center>
          <Text3D
            font="/fonts/helvetiker_bold.typeface.json"
            size={2}
            height={0.5}
            curveSegments={10}
            bevelEnabled
            bevelThickness={0.05}
            bevelSize={0.05}
            bevelOffset={0}
            bevelSegments={4}
            letterSpacing={0.04}
          >
            CWO
            <meshStandardMaterial
              color="#0b0616"
              emissive="#c026d3"
              emissiveIntensity={2.2}
              metalness={0.9}
              roughness={0.18}
            />
          </Text3D>
        </Center>
        {/* soft magenta / cyan bloom behind the letters */}
        <pointLight position={[0, 0, 2.2]} intensity={22} distance={16} color="#e879f9" />
        <pointLight position={[-3, 0, 1.6]} intensity={12} distance={12} color="#22d3ee" />
        <pointLight position={[3, 0, 1.6]} intensity={12} distance={12} color="#6366f1" />
      </group>

      {/* ---- dark reflective floor ---- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          resolution={1024}
          mixBlur={1.4}
          mixStrength={26}
          blur={[380, 100]}
          depthScale={1.2}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.35}
          mirror={0.6}
          color="#05030c"
          metalness={0.9}
          roughness={0.65}
        />
      </mesh>

      {/* ---- cyberpunk grid on the floor ---- */}
      <Grid
        position={[0, 0.02, 0]}
        args={[60, 60]}
        cellSize={0.85}
        cellThickness={0.7}
        cellColor="#2a1145"
        sectionSize={4.25}
        sectionThickness={1.5}
        sectionColor="#7c3aed"
        fadeDistance={26}
        fadeStrength={1.5}
        infiniteGrid
        followCamera={false}
      />
    </group>
  );
}

/** Frames the arena: a slight downward tilt so the floor reads in 3D. */
function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 1.55, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
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
  const three = fightersRef.current.filter((f) => fighter3DConfig(f.fighterClass));

  return (
    <>
      <color attach="background" args={["#05030c"]} />
      <fog attach="fog" args={["#05030c", 9, 30]} />
      <CameraRig />
      <ArenaBackdrop />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#c4b5fd", "#0a0a12", 0.7]} />
      <directionalLight
        position={[-6, 9, 8]}
        intensity={2.4}
        color="#fff4e6"
      />
      <directionalLight
        position={[7, 4, -4]}
        intensity={1.1}
        color="#a855f7"
      />
      <pointLight position={[-4, 1.6, 4]} intensity={9} color="#ec4899" />
      <pointLight position={[4, 1.6, 4]} intensity={9} color="#8b5cf6" />
      <pointLight position={[0, 0.4, 3]} intensity={5} color="#22d3ee" />
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
 * Cinematic 3D layer for the battle stage. The canvas is fully transparent
 * so the arena shows straight through — no flat panels behind the models.
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
        camera={{
          position: [0, 1.5, 9],
          fov: 42,
          near: 0.1,
          far: 80,
        }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.75]}
        style={{ background: "transparent" }}
        /* no flat black plane behind the models — the clear is fully
         * transparent so the arena shows straight through the canvas */
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.style.background = "transparent";
        }}
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

/* ------------------------------------------------------------ 3D preview card */

/** A single fighter idling in its own transparent canvas. */
function PreviewRig({
  fighterClass,
  state,
  facing,
}: {
  fighterClass: FighterClass;
  state: FighterActionState;
  facing: "left" | "right";
}) {
  const cfg = fighter3DConfig(fighterClass) as Fighter3DConfig;
  const group = useRef<THREE.Group>(null);
  const desired = useRef<FighterActionState>(state);
  const { size: previewSize } = useThree();
  const source = useFBX(clipUrl(cfg, cfg.clips.idle));
  const scene = useMemo(() => SkeletonUtils.clone(source), [source]);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureSettled, setTextureSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSkinTexture(textureUrl(cfg))
      .then((tex) => {
        if (cancelled) return;
        setTexture(tex);
        setTextureSettled(true);
      })
      .catch(() => {
        if (!cancelled) setTextureSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  useEffect(() => {
    if (!texture) return;
    applySkinTexture(scene, texture);
  }, [scene, texture]);

  /* a preview only needs the clip it is showing */
  const { actions, loaded } = useFighterActions(cfg, group, [state]);

  useEffect(() => {
    if (!loaded) return;
    const current = actions[desired.current] ?? actions.idle;
    if (!current) return;
    for (const key of Object.keys(actions)) {
      const action = actions[key];
      if (action && action !== current) action.fadeOut(0.15);
    }
    current.reset();
    current.setLoop(
      desired.current === "idle" ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity,
    );
    current.fadeIn(0.15).play();
  }, [actions, loaded, desired]);

  useEffect(() => {
    if (!group.current) return;
    const g = group.current;
    /* Measure the model in its FACING orientation so it is centred. */
    const prevScale = g.scale.clone();
    const prevPos = g.position.clone();
    const prevRot = g.rotation.clone();
    const prevSceneRot = scene.rotation.clone();
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    scene.rotation.set(
      0,
      facing === "left" ? -Math.PI / 2 + 0.42 : Math.PI / 2 - 0.42,
      0,
    );
    g.updateMatrixWorld(true);
    const box = measureBindBox(scene);
    const sizeV = new THREE.Vector3();
    box.getSize(sizeV);
    const center = new THREE.Vector3();
    box.getCenter(center);
    g.scale.copy(prevScale);
    g.position.copy(prevPos);
    g.rotation.copy(prevRot);
    scene.rotation.copy(prevSceneRot);
    /* Normalise the rig so its feet sit on y = 0. */
    scene.position.y = -box.min.y;
    g.updateMatrixWorld(true);
    g.userData.bbox = {
      sizeY: sizeV.y || 1,
      centerX: center.x,
      minY: 0,
    };
  }, [scene, facing, textureSettled]);

  useFrame(() => {
    if (!group.current) return;
    const { width, height } = previewSize;
    void width;
    const facingLeft = facing === "left";
    const bbox = group.current.userData.bbox as
      | { sizeY: number; centerX: number; minY: number }
      | undefined;
    if (bbox && bbox.sizeY > 0) {
      /* the idle clips raise the arms above the bind pose — leave headroom */
      const targetHeight = height * 0.6;
      const scale = targetHeight / bbox.sizeY;
      group.current.scale.setScalar(scale);
      group.current.position.x =
        (facingLeft ? bbox.centerX : -bbox.centerX) * scale;
      group.current.position.y = -height / 2 + 14 - bbox.minY * scale;
    }
    desired.current = state;
  });

  if (!textureSettled) return null;

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * A clean 3D preview of a single fighter — the only character imagery the
 * app uses now. No 2D sprite sheets, no GIF loops.
 */
export function FighterPreview3D({
  fighterClass,
  state = "idle",
  facing = "right",
  size = 180,
  className,
}: {
  fighterClass: FighterClass;
  state?: FighterActionState;
  facing?: "left" | "right";
  size?: number;
  className?: string;
}) {
  if (!fighter3DConfig(fighterClass)) return null;
  return (
    <div
      className={className}
      style={{ height: size, width: "100%", overflow: "hidden" }}
      aria-hidden
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 400], zoom: 1, near: 0.1, far: 2000 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.style.background = "transparent";
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={1.5} />
          <hemisphereLight args={["#e9d5ff", "#1a1030", 1]} />
          <directionalLight
            position={[-40, 60, 90]}
            intensity={2.4}
            color="#fff4e6"
          />
          <directionalLight
            position={[50, 30, -60]}
            intensity={1.2}
            color="#a855f7"
          />
          <pointLight position={[-60, 20, 60]} intensity={1.2} color="#ec4899" />
          <pointLight position={[60, 20, 60]} intensity={1.2} color="#8b5cf6" />
          <PreviewRig fighterClass={fighterClass} state={state} facing={facing} />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  );
}
