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
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  BATTLE_ROSTER,
  fighter3DConfig,
  type Fighter3DConfig,
  type FighterActionState,
} from "@/config/fighterModels";
import { stageSlot } from "@/config/stageLayout";
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

/**
 * What the 3D layer tells the arena about one fighter.
 *
 * The arena holds its READY? countdown until every rigged fighter reports
 * `ready` — that is the signal that the mesh is in, the skin is applied, the
 * opening clips are bound to the mixer and a frame has actually been
 * painted. Starting the round before that is what causes the opening freeze.
 */
export type StageRigStatus = {
  side: "creator" | "challenger";
  /** 0..1 — how much of this fighter's opening clips have landed. */
  progress: number;
  /** Fully loaded, textured, bound and painted — the stage can be fought on. */
  ready: boolean;
  /** The rig could not be loaded — the match must not wait for it. */
  failed: boolean;
};

/**
 * The clips the arena actually plays.
 *
 * `ko` and `victory` are deliberately absent: a knock-out is posed by hand
 * (the body is laid on its back) and the winner holds the standing
 * fight-idle, so those two exports are never played. Every other state has
 * a dedicated Mixamo clip.
 *
 * The arena does not start the match until EVERY one of these is in memory
 * and bound to the mixer. Each file is ~20MB and FBX parsing is CPU-bound,
 * so a clip that arrives mid-round stalls the fight — waiting for the lot
 * up front is what keeps the opening exchanges smooth.
 */
const PLAYABLE_STATES: readonly FighterActionState[] = [
  "idle",
  "lightAttack",
  "heavyAttack",
  "block",
  "hit",
  "special",
  "critical",
];

/**
 * Remove the Mixamo root-motion track from a clip.
 *
 * Every Mixamo export animates `mixamorig:Hips.position`, which carries the
 * character's root motion: the mesh slides forward, lifts off the floor and
 * changes scale as the clip plays. Stripping that track keeps the rotations
 * (so the animation still reads) while the rig stays planted where it is.
 */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter(
    (t) => !/Hips\.position$/i.test(t.name),
  );
  return copy;
}

/**
 * Preview cards were fitting the raw bind box, which made Chog Princess a
 * tiny figure in the top of the VS card while James filled his. Bias the
 * fit so both read as the same size.
 */
const PREVIEW_ZOOM: Partial<Record<FighterClass, number>> = {
  chog_princess: 1.85,
  void_lord_james: 1.05,
};

/**
 * How far a fighter steps in toward the centre on an attack (world units).
 * The slots sit 4.4 units apart and the bodies are ~1.2 wide, so a punch or
 * kick needs this step to make contact instead of hitting thin air. It eases
 * back to the base stance as soon as the attack is over.
 */
const ATTACK_LUNGE = 1.8;

/**
 * How long a hit flinch is held before it freezes (seconds). The Mixamo hit
 * clips carry a full fall further in, so the window has to be short enough
 * that only the impact/recoil is shown — never a body going down.
 */
const FLINCH_WINDOW = 0.16;

/**
 * Which clip a state actually plays.
 *  - ko      : no Mixamo death clip — the body is laid out by hand
 *  - victory : the winner holds the standing fight-idle
 */
function playableState(state: FighterActionState): FighterActionState {
  if (state === "ko" || state === "victory") return "idle";
  return state;
}

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

/**
 * Warm the FBX + texture caches for every fighter on the battle roster.
 *
 * Each duel streams ~5 rigged clips per fighter at ~20MB a file, which is
 * the multi-second stall after pressing CHALLENGE. Pulling them in the
 * background once the lobby is interactive means the arena opens with the
 * rigs already in memory. Files load one at a time with a small gap so the
 * parse work never janks the landing page, and failures are ignored — a
 * missed preload just falls back to the on-demand path.
 */
export function preloadFighterRoster(): void {
  void (async () => {
    for (const cls of BATTLE_ROSTER) {
      const cfg = fighter3DConfig(cls);
      if (!cfg) continue;
      const files = [...new Set(Object.values(cfg.clips))];
      for (const file of files) {
        try {
          await loadFbx(clipUrl(cfg, file));
          await loadSkinTexture(textureUrl(cfg));
        } catch {
          /* best effort — the duel will retry on demand */
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  })();
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
 *
 * The material is CLONED for this instance. `SkeletonUtils.clone` shares
 * material instances with the source rig and with every other clone of the
 * same FBX, so a shared material means the hit flash on one fighter tints
 * the other, and a rig cloned in a later round inherits the emissive the
 * last round left behind. Owning the material keeps the colours — and the
 * damage flash — strictly per fighter.
 */
function applySkinTexture(object: THREE.Object3D, texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const owned = source.map((entry) => {
      if (!entry) return entry;
      const mat = (entry as THREE.MeshPhongMaterial).clone() as THREE.MeshPhongMaterial;
      mat.map = texture;
      mat.color?.set(0xffffff);
      mat.shininess = 14;
      mat.specular?.set(0x1a1a1a);
      /* a fresh material starts untinted — no red flash carried over */
      mat.emissive?.setRGB(0, 0, 0);
      mat.needsUpdate = true;
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? owned : owned[0];
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
 * The clip load is ASYNC (each FBX is ~20MB) and parsing it is CPU-bound, so
 * a clip that arrives mid-round stalls the fight. Everything the arena can
 * play is therefore fetched in ONE wave, and the arena holds its READY?
 * countdown until the lot has landed.
 *
 * Files are fetched ONCE each: several states usually share the same export
 * (a special and a critical are often the same FBX) and every file is
 * ~20MB, so the dedupe is worth real seconds.
 */
function useFighterActions(
  cfg: Fighter3DConfig,
  group: React.RefObject<THREE.Group | null>,
  wanted: FighterActionState[],
  onProgress?: (loaded: number, total: number) => void,
) {
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = wanted.join(",");

  /* keep the progress callback out of the effect deps — an unstable
   * identity would re-fetch every clip on every render. */
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  /* fetch the clips this consumer needs, renaming as we go */
  useEffect(() => {
    let cancelled = false;
    const states = (key ? key.split(",") : []) as FighterActionState[];

    /* one fetch per FILE: map every file to the states that use it */
    const byUrl = new Map<string, FighterActionState[]>();
    for (const state of states) {
      const url = clipUrl(cfg, cfg.clips[state]);
      const list = byUrl.get(url);
      if (list) list.push(state);
      else byUrl.set(url, [state]);
    }

    const total = byUrl.size;
    let done = 0;

    (async () => {
      const groups = await Promise.all(
        [...byUrl.keys()].map(async (url) => {
          const group = await loadFbx(url);
          done += 1;
          progressRef.current?.(done, total);
          return { url, group };
        }),
      );
      if (cancelled) return;
      const out: THREE.AnimationClip[] = [];
      for (const { url, group } of groups) {
        const source = group.animations?.[0];
        if (!source) continue;
        for (const state of byUrl.get(url) ?? []) {
          /* strip the root motion so the rig never leaves the floor */
          const copy = stripRootMotion(source);
          copy.name = state;
          out.push(copy);
        }
      }
      setClips(out);
      setLoaded(true);
    })().catch(() => {
      /* a clip that will not load must not strand the match */
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
  onStatus?: (status: StageRigStatus) => void;
}) {
  const cfg = fighter3DConfig(spec.fighterClass) as Fighter3DConfig;
  const group = useRef<THREE.Group>(null);
  const desired = useRef<FighterActionState>("idle");
  /** materials of the rig, cached for the hit flash */
  const materialCache = useRef<THREE.MeshPhongMaterial[] | null>(null);
  const wasHit = useRef(false);
  /** current X lunge offset (world units) */
  const lungeRef = useRef(0);
  /* the ortho camera is 1 world unit = 1 px, so the canvas size IS the stage
   * size in pixels and the 3D fighters line up with the stage. */
  const { size } = useThree();

  /* the rig: the idle export doubles as the visible mesh */
  const source = useFBX(clipUrl(cfg, cfg.clips.idle));
  const scene = useMemo(() => SkeletonUtils.clone(source), [source]);

  /* the status callback is kept in a ref so a new identity from the parent
   * never re-runs the load effects */
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  /* ---- readiness ----------------------------------------------------
   * The arena waits for this signal before it starts the round. A rig is
   * only "ready" once the mesh is mounted, the skin is applied, the
   * opening clips are bound to the mixer AND a frame has actually been
   * painted — anything less and the first punch lands on a stall. */
  const readyReported = useRef(false);
  const readyArmed = useRef(false);

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

  /* only the clips the arena actually plays — the knock-out and victory
   * exports are never used, and every file is ~20MB */
  const { actions, mixer, loaded } = useFighterActions(
    cfg,
    group,
    PLAYABLE_STATES as FighterActionState[],
    (done, total) => {
      /* once the rig is ready the endgame wave keeps loading in the
       * background — that must never un-ready the fighter */
      if (readyReported.current) return;
      statusRef.current?.({
        side: spec.side,
        progress: total > 0 ? done / total : 1,
        ready: false,
        failed: false,
      });
    },
  );

  /* ---- play the action for the current state ---- */
  useEffect(() => {
    if (!loaded) return;
    /* a knock-out is posed by hand — never play a clip for it */
    if (desired.current === "ko") return;
    const current = actions[playableState(desired.current)] ?? actions.idle;
    if (!current) return;
    for (const key of Object.keys(actions)) {
      const action = actions[key];
      if (action && action !== current) action.fadeOut(0.15);
    }
    /* the idle loop is never restarted (that made the fighter twitch);
     * strikes restart so each punch reads as a new blow. */
    const state = playableState(desired.current);
    if (state !== "idle") current.reset();
    current.setEffectiveTimeScale(1);
    current.setLoop(
      state === "idle" || state === "block"
        ? THREE.LoopRepeat
        : THREE.LoopOnce,
      Infinity,
    );
    current.clampWhenFinished = state === "hit";
    current.fadeIn(0.15).play();
  }, [actions, loaded, desired]);

  /* ---- compute the fit once the mesh is in ---- */
  useEffect(() => {
    if (!group.current) return;
    const g = group.current;
    /* Measure the rig in its LOCAL space: the group is rotated every frame
     * to face the opponent, so the rest-pose box is what we need. */
    const prevScale = g.scale.clone();
    const prevPos = g.position.clone();
    const prevRot = g.rotation.clone();
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    g.updateMatrixWorld(true);

    const box = measureBindBox(scene);
    const sizeV = new THREE.Vector3();
    box.getSize(sizeV);
    const center = new THREE.Vector3();
    box.getCenter(center);

    g.scale.copy(prevScale);
    g.position.copy(prevPos);
    g.rotation.copy(prevRot);
    /* Normalise the rig so its feet sit on y = 0 — the FBX origin is not at
     * the feet, which would otherwise float the model off the ground. */
    scene.position.y = -box.min.y;
    /* yaw first, then the fall pitch, so a knock-down drops the fighter
     * backwards relative to the direction it is facing. */
    g.rotation.order = "YXZ";
    g.updateMatrixWorld(true);

    g.userData.bbox = {
      sizeY: sizeV.y || 1,
      centerX: center.x,
      centerZ: center.z,
      minY: 0,
    };
  }, [scene, textureSettled]);

  /* ---- per-frame: transform + action state machine ---- */
  useFrame((_, delta) => {
    /* ---- readiness gate --------------------------------------------
     * The rig is only reported ready AFTER a frame has been painted with
     * it on screen: the first qualifying frame arms the gate, the next
     * one reports. That guarantees the arena never starts a round on a
     * canvas that has not actually drawn the fighter. */
    if (!readyReported.current) {
      if (readyArmed.current) {
        readyReported.current = true;
        statusRef.current?.({
          side: spec.side,
          progress: 1,
          ready: true,
          failed: false,
        });
      } else if (loaded && textureSettled && actions.idle) {
        readyArmed.current = true;
      }
    }

    const live = fightersRef.current.find((f) => f.side === spec.side);
    if (!live || !group.current) return;

    const bbox = group.current.userData.bbox as
      | { sizeY: number; centerX: number; centerZ: number; minY: number }
      | undefined;
    if (bbox && bbox.sizeY > 0) {
      group.current.scale.setScalar(FIGHTER_HEIGHT / bbox.sizeY);
    }

    /* ---- fixed stage slots ------------------------------------------
     * Each character owns a slot on the stage: the Princess stands on the
     * left of the CWO lettering, James on the right. They never cross it.
     * A mirror match (both fighters the same character) splits by role so
     * the pair never stacks on top of each other. */
    const foe = fightersRef.current.find((f) => f.side !== spec.side);
    const slotX = stageSlot(spec.side, spec.fighterClass, foe?.fighterClass);
    const foeSlotX = foe
      ? stageSlot(foe.side, foe.fighterClass, spec.fighterClass)
      : -slotX;

    /* ---- look at the opponent ---------------------------------------
     * The rigs are authored facing +Z, so the yaw that points a fighter
     * at its target is +/- PI/2 — never toward the camera. */
    const dx = foeSlotX - slotX;
    const yaw =
      Math.abs(dx) < 1e-4
        ? group.current.rotation.y
        : dx >= 0
          ? Math.PI / 2 - FACE_OFFSET
          : -Math.PI / 2 + FACE_OFFSET;

    /* ---- attack lunge: step in toward the centre, then return ------- */
    const attacking =
      live.state.endsWith("Attack") ||
      live.state === "special" ||
      live.state === "critical";
    const toward = dx >= 0 ? 1 : -1;
    const lungeTarget = attacking ? toward * ATTACK_LUNGE : 0;
    /* quick in (the strike lands ~200ms after the animation starts), softer
     * back out to the base stance. */
    const rate = attacking ? 11 : 6;
    lungeRef.current +=
      (lungeTarget - lungeRef.current) * (1 - Math.exp(-delta * rate));

    /* ---- the floor lock ---------------------------------------------
     * Feet on the floor, fixed z line, X only for sliding. */
    group.current.position.x = slotX + lungeRef.current;
    group.current.position.y = 0;
    group.current.position.z = 0;
    group.current.rotation.y = yaw;

    /* ---- states ------------------------------------------------------
     * ko       : stop the mixer and lay the model on its back on the floor
     * victory  : the winner holds the standing fight-idle
     * hit      : a short in-place flinch (never a fall while HP > 0)
     * otherwise: the standing fight-idle */
    if (live.state === "ko") {
      if (desired.current !== "ko") {
        desired.current = "ko";
        mixer.stopAllAction();
      }
      /* lying on its back, at its own X, y stays 0 */
      group.current.rotation.x = -Math.PI / 2;
    } else {
      group.current.rotation.x = 0;
      const wanted = playableState(live.state);
      if (wanted !== desired.current) {
        desired.current = wanted;
        const action = actions[wanted] ?? actions.idle;
        if (action) {
          for (const key of Object.keys(actions)) {
            const other = actions[key];
            if (other && other !== action) other.fadeOut(0.15);
          }
          /* strikes restart so each blow reads; the idle loop is left alone
           * so the fighter never twitches back to frame zero. */
          if (wanted !== "idle") action.reset();
          action.setEffectiveTimeScale(1);
          action.setLoop(
            wanted === "idle" || wanted === "block"
              ? THREE.LoopRepeat
              : THREE.LoopOnce,
            Infinity,
          );
          action.clampWhenFinished = wanted === "hit";
          action.fadeIn(0.15).play();
        }
      } else if (wanted === "idle") {
        /* The fight-idle loop must always be alive — a rig with no running
         * action falls back to the bind / T-pose. */
        const idle = actions.idle;
        if (idle && (idle.weight < 0.01 || !idle.isRunning())) {
          idle.reset();
          idle.setEffectiveWeight(1);
          idle.fadeIn(0.2).play();
        }
      }

      /* a hit is a short flinch — freeze it before it turns into a fall */
      if (live.state === "hit") {
        const hitAction = actions.hit;
        if (hitAction && hitAction.isRunning() && hitAction.time > FLINCH_WINDOW) {
          hitAction.setEffectiveTimeScale(0);
        }
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

    /* Facing is re-asserted LAST — after the mixer update — so the
     * animation can never rotate a fighter back toward the camera, and the
     * floor lock (position.y = 0, fixed z) is re-applied with it. */
    group.current.rotation.y = yaw;
    group.current.position.y = 0;
    group.current.position.z = 0;

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
 * Keeps a 3/4 view instead of a flat profile when a fighter looks at its
 * opponent (the rig is authored facing +Z).
 */
const FACE_OFFSET = 0.42;

/**
 * The arena backdrop: a small CWO mark behind the fighters, a dark
 * reflective floor with a cyberpunk grid, and accent lighting. The mark
 * stays small so it never covers a body or a damage number.
 */
function ArenaBackdrop() {
  return (
    <group>
      {/* Brand mark sits BEHIND the fighters, small enough that it never
          covers a body, a damage number, or the round callout. */}
      <group position={[0, 3.15, -12]}>
        <Center>
          <Text3D
            font="/fonts/helvetiker_bold.typeface.json"
            size={0.72}
            height={0.16}
            curveSegments={8}
            bevelEnabled
            bevelThickness={0.02}
            bevelSize={0.015}
            bevelOffset={0}
            bevelSegments={2}
            letterSpacing={0.06}
          >
            CWO
            <meshStandardMaterial
              color="#14081c"
              emissive="#86198f"
              emissiveIntensity={0.55}
              metalness={0.85}
              roughness={0.35}
            />
          </Text3D>
        </Center>
        <pointLight position={[0, 0, 2]} intensity={4} distance={10} color="#c026d3" />
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

/**
 * Catches a rig that fails to load (a broken or missing FBX) so the arena
 * can carry on without it instead of crashing the whole canvas — and so
 * the match is never left waiting for a fighter that will never arrive.
 */
class RigErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function StageScene({
  fightersRef,
  onStatus,
}: {
  fightersRef: MutableRefObject<StageFighter3D[]>;
  onStatus?: (status: StageRigStatus) => void;
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
        <RigErrorBoundary
          key={spec.side}
          onError={() =>
            onStatus?.({
              side: spec.side,
              progress: 1,
              ready: false,
              failed: true,
            })
          }
        >
          <FighterModel
            spec={spec}
            fightersRef={fightersRef}
            onStatus={onStatus}
          />
        </RigErrorBoundary>
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
  onStatus?: (status: StageRigStatus) => void;
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
  const fitFrames = useRef(0);
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
    let bbox = group.current.userData.fit as
      | { sizeY: number; centerX: number; minY: number }
      | undefined;

    /* The bind-pose geometry box can lie badly for these rigs — the skeleton
     * rescales the skinned mesh, so Chog Princess measured 1.9 units tall in
     * bind pose while her animated body is ~0.26 units, which framed her as
     * a speck. Measure the LIVE skinned vertices instead: wait for the idle
     * clip to settle, snapshot the precise (skin-aware) world box once with
     * the group at identity, then reuse that fit every frame. */
    if (!bbox) {
      fitFrames.current += 1;
      group.current.visible = false;
      if (fitFrames.current > 150) {
        const prevScale = group.current.scale.clone();
        const prevPos = group.current.position.clone();
        group.current.scale.setScalar(1);
        group.current.position.set(0, 0, 0);
        group.current.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group.current, true);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        group.current.scale.copy(prevScale);
        group.current.position.copy(prevPos);
        if (size.y > 0.001) {
          group.current.userData.fit = bbox = {
            sizeY: size.y,
            centerX: center.x,
            minY: box.min.y,
          };
        } else if (fitFrames.current > 400) {
          /* fallback: the stale bind box beats an invisible fighter */
          const bind = group.current.userData.bbox as
            | { sizeY: number; centerX: number; minY: number }
            | undefined;
          if (bind) group.current.userData.fit = bbox = bind;
        }
      }
    }

    if (bbox) {
      group.current.visible = true;
      /* the idle clips raise the arms above the bind pose — leave headroom */
      const zoom = PREVIEW_ZOOM[fighterClass] ?? 1;
      /* Never let the figure exceed the canvas: a zoom that overflows the
       * ortho frustum crops the head off (Chog Princess did exactly that).
       * The zoom biases the fit, the clamp guarantees the whole rig is
       * inside the frame. */
      const maxHeight = height * 0.78;
      const targetHeight = Math.min(height * 0.68 * zoom, maxHeight);
      const scale = targetHeight / bbox.sizeY;
      group.current.scale.setScalar(scale);
      group.current.position.x =
        (facingLeft ? bbox.centerX : -bbox.centerX) * scale;
      /* feet sit just below the lower third so the body reads centred */
      group.current.position.y = -height * 0.38 - bbox.minY * scale;
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
          <ambientLight intensity={2.2} />
          <hemisphereLight args={["#f3e8ff", "#2a1a4a", 1.4]} />
          <directionalLight
            position={[-40, 60, 90]}
            intensity={2.8}
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
