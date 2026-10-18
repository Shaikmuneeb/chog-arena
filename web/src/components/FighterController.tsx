"use client";

import React, { useRef, useState, useEffect, Suspense, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import { useControls } from "../hooks/useControls";
import { playImpactSfx } from "@/utils/arenaAudio";

export interface FighterControllerProps {
  url?: string;
  position?: [number, number, number];
  isPlayerOne?: boolean;
  onPunch?: () => void;
  onKick?: () => void;
  characterName?: string;
}

/**
 * Inner component that loads GLTF model with useGLTF
 */
function GLTFModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clonedScene} scale={[1.8, 1.8, 1.8]} />;
}

/**
 * High-fidelity procedural 3D stylized fighter for "Void Lord James"
 * Rendered when no external GLTF model is provided or as a zero-404 fallback.
 */
function ProceduralVoidLord({
  isPunching,
  isKicking,
  punchProgress,
}: {
  isPunching: boolean;
  isKicking: boolean;
  punchProgress: number;
}) {
  const rightHandRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (auraRef.current) {
      auraRef.current.rotation.y += delta * 1.5;
    }
    if (rightHandRef.current) {
      if (isPunching) {
        // Lunge fist forward and add glowing pulse
        const punchZ = -0.7 * Math.sin(punchProgress * Math.PI);
        const punchY = 0.2 * Math.sin(punchProgress * Math.PI);
        rightHandRef.current.position.z = punchZ;
        rightHandRef.current.position.y = punchY;
      } else {
        rightHandRef.current.position.z = THREE.MathUtils.lerp(
          rightHandRef.current.position.z,
          0,
          delta * 12
        );
        rightHandRef.current.position.y = THREE.MathUtils.lerp(
          rightHandRef.current.position.y,
          0,
          delta * 12
        );
      }
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Dynamic Void Floor Aura / Shadow */}
      <mesh
        ref={auraRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.9, 0]}
      >
        <ringGeometry args={[0.6, 1.4, 32]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group ref={torsoRef}>
        {/* Head / Void Visor */}
        <mesh position={[0, 1.35, 0]}>
          <boxGeometry args={[0.38, 0.42, 0.4]} />
          <meshStandardMaterial
            color="#1e1b4b"
            roughness={0.2}
            metalness={0.9}
          />
        </mesh>
        {/* Visor glowing eye slit */}
        <mesh position={[0, 1.38, -0.21]}>
          <boxGeometry args={[0.3, 0.08, 0.04]} />
          <meshBasicMaterial color="#c084fc" />
        </mesh>
        {/* Horns / Crest */}
        <mesh position={[-0.18, 1.62, 0]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.07, 0.4, 4]} />
          <meshStandardMaterial color="#6366f1" metalness={0.8} />
        </mesh>
        <mesh position={[0.18, 1.62, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.07, 0.4, 4]} />
          <meshStandardMaterial color="#6366f1" metalness={0.8} />
        </mesh>

        {/* Torso / Heavy Void Armor */}
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.42, 0.32, 0.75, 6]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.3}
            metalness={0.85}
          />
        </mesh>

        {/* Glowing Void Core (Heart) */}
        <mesh position={[0, 0.82, -0.2]}>
          <octahedronGeometry args={[0.14]} />
          <meshStandardMaterial
            color="#a855f7"
            emissive="#c084fc"
            emissiveIntensity={2.5}
            roughness={0.1}
          />
        </mesh>

        {/* Floating Pauldrons (Shoulders) */}
        <mesh position={[-0.6, 1.1, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.32, 0.28, 0.35]} />
          <meshStandardMaterial
            color="#312e81"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0.6, 1.1, 0]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.32, 0.28, 0.35]} />
          <meshStandardMaterial
            color="#312e81"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Left Arm & Gauntlet */}
        <group ref={leftHandRef} position={[-0.55, 0.7, -0.2]}>
          <mesh>
            <boxGeometry args={[0.2, 0.25, 0.35]} />
            <meshStandardMaterial
              color="#4338ca"
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0, -0.18]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#a855f7" />
          </mesh>
        </group>

        {/* Right Arm & Punching Gauntlet */}
        <group ref={rightHandRef} position={[0.55, 0.7, -0.2]}>
          <mesh>
            <boxGeometry args={[0.22, 0.26, 0.38]} />
            <meshStandardMaterial
              color={isPunching ? "#f43f5e" : "#4338ca"}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          {/* Fist glowing fist head */}
          <mesh position={[0, 0, -0.2]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshBasicMaterial
              color={isPunching ? "#fb7185" : "#c084fc"}
            />
          </mesh>
          {/* Punch burst shockwave */}
          {isPunching && (
            <mesh position={[0, 0, -0.45]} rotation={[0, 0, 0]}>
              <ringGeometry args={[0.1, 0.45, 16]} />
              <meshBasicMaterial
                color="#f43f5e"
                transparent
                opacity={0.8}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>

        {/* Legs / Robes */}
        <mesh position={[-0.22, 0.05, 0]}>
          <cylinderGeometry args={[0.15, 0.12, 0.8, 6]} />
          <meshStandardMaterial color="#1e1b4b" metalness={0.7} />
        </mesh>
        <mesh
          position={[0.22, isKicking ? 0.3 : 0.05, isKicking ? -0.4 : 0]}
          rotation={[isKicking ? -0.8 : 0, 0, 0]}
        >
          <cylinderGeometry args={[0.15, 0.12, 0.8, 6]} />
          <meshStandardMaterial
            color={isKicking ? "#e11d48" : "#1e1b4b"}
            metalness={0.7}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * FighterController:
 * Controls 3D fighter movement, animation, controls, and combat feedback.
 * Compatible with user's exact specification:
 * - url?: GLTF model url
 * - position?: [x, y, z]
 * - isPlayerOne?: boolean (WASD + J/K)
 */
export function FighterController({
  url,
  position = [0, 0, 0],
  isPlayerOne = true,
  onPunch,
  onKick,
  characterName = "Void Lord James",
}: FighterControllerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const controls = useControls();

  const [isPunching, setIsPunching] = useState(false);
  const [isKicking, setIsKicking] = useState(false);
  const punchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const kickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const punchAnimRef = useRef(0);
  const lastPunchStateRef = useRef(false);
  const lastKickStateRef = useRef(false);

  // Punch animation trigger
  useEffect(() => {
    if (controls.punch && !lastPunchStateRef.current && isPlayerOne) {
      console.log(`${characterName} PUNCH!`);
      setIsPunching(true);
      punchAnimRef.current = 1.0;
      playImpactSfx("crit");
      onPunch?.();

      if (punchTimerRef.current) clearTimeout(punchTimerRef.current);
      punchTimerRef.current = setTimeout(() => {
        setIsPunching(false);
      }, 200);
    }
    lastPunchStateRef.current = controls.punch;
  }, [controls.punch, isPlayerOne, characterName, onPunch]);

  // Kick animation trigger
  useEffect(() => {
    if (controls.kick && !lastKickStateRef.current && isPlayerOne) {
      console.log(`${characterName} KICK!`);
      setIsKicking(true);
      playImpactSfx("slash");
      onKick?.();

      if (kickTimerRef.current) clearTimeout(kickTimerRef.current);
      kickTimerRef.current = setTimeout(() => {
        setIsKicking(false);
      }, 250);
    }
    lastKickStateRef.current = controls.kick;
  }, [controls.kick, isPlayerOne, characterName, onKick]);

  // Basic movement loop running 60 times a second
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const speed = 4 * delta;

    if (isPlayerOne) {
      let isMoving = false;
      // Player 1 controls (WASD + J/K)
      if (controls.forward) {
        groupRef.current.position.z -= speed;
        isMoving = true;
      }
      if (controls.backward) {
        groupRef.current.position.z += speed;
        isMoving = true;
      }
      if (controls.left) {
        groupRef.current.position.x -= speed;
        isMoving = true;
      }
      if (controls.right) {
        groupRef.current.position.x += speed;
        isMoving = true;
      }

      // Constrain inside the 3D Arena ring bounds
      groupRef.current.position.x = THREE.MathUtils.clamp(
        groupRef.current.position.x,
        -7,
        7
      );
      groupRef.current.position.z = THREE.MathUtils.clamp(
        groupRef.current.position.z,
        -6,
        6
      );

      // Subtle breathing / floating animation
      const t = state.clock.getElapsedTime();
      groupRef.current.position.y =
        position[1] + (isMoving ? Math.sin(t * 12) * 0.08 : Math.sin(t * 2) * 0.04);
    }

    // Trigger punch/kick animations or state feedback here
    if (controls.punch && isPlayerOne) {
      // Maintained for exact specification compatibility
      // console.log("Void Lord James PUNCH!");
    }

    // Decay punch animation progress
    if (punchAnimRef.current > 0) {
      punchAnimRef.current = Math.max(0, punchAnimRef.current - delta * 5);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <Center>
        {url ? (
          <Suspense
            fallback={
              <ProceduralVoidLord
                isPunching={isPunching}
                isKicking={isKicking}
                punchProgress={punchAnimRef.current}
              />
            }
          >
            <GLTFModel url={url} />
          </Suspense>
        ) : (
          <ProceduralVoidLord
            isPunching={isPunching}
            isKicking={isKicking}
            punchProgress={punchAnimRef.current}
          />
        )}
      </Center>
    </group>
  );
}

// Preload helper
export function preloadFighterModel(url: string) {
  try {
    useGLTF.preload(url);
  } catch {
    // Graceful fallback
  }
}
