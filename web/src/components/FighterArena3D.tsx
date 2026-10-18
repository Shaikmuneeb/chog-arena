"use client";

import React, { useState, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Float, Stars, Text } from "@react-three/drei";
import { Swords, RotateCcw, Sparkles } from "lucide-react";
import { FighterController } from "./FighterController";
import { useControls } from "../hooks/useControls";

/**
 * Sparring Dummy / Opponent in the 3D Arena
 */
function SparringDummy({
  hitCount,
  lastHitType,
}: {
  hitCount: number;
  lastHitType: "punch" | "kick" | null;
}) {
  return (
    <group position={[2.8, 0, 0]}>
      {/* Base platform */}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.1, 24]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.6} />
      </mesh>

      {/* Heavy Steel Post */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 2.2, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Strike Target Bag */}
      <mesh position={[0, 0.8, 0]}>
        <capsuleGeometry args={[0.42, 0.9, 12, 16]} />
        <meshStandardMaterial
          color={hitCount > 0 ? "#ef4444" : "#f97316"}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Target Crosshair */}
      <mesh position={[0, 0.85, 0.44]}>
        <ringGeometry args={[0.08, 0.22, 16]} />
        <meshBasicMaterial color="#fef08a" />
      </mesh>

      {/* Floating text damage indicator */}
      {hitCount > 0 && (
        <Float speed={3} rotationIntensity={0.2} floatIntensity={0.5}>
          <Text
            position={[0, 2.2, 0]}
            fontSize={0.38}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
          >
            {lastHitType === "punch" ? "HIT! -24" : "CRIT! -48"}
          </Text>
        </Float>
      )}
    </group>
  );
}

/**
 * Cyber Arena Environment Floor and Pillars
 */
function ArenaGround() {
  return (
    <group>
      {/* Main Hexagonal / Circular Platform */}
      <mesh position={[0, -1, 0]} receiveShadow>
        <cylinderGeometry args={[8.5, 9, 0.4, 32]} />
        <meshStandardMaterial color="#09090b" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* Inner Glowing Ring */}
      <mesh position={[0, -0.79, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.35, 48]} />
        <meshBasicMaterial color="#a855f7" />
      </mesh>

      {/* Outer Neon Boundary Ring */}
      <mesh position={[0, -0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.8, 8.0, 48]} />
        <meshBasicMaterial color="#f43f5e" />
      </mesh>

      {/* Monad Center Sigil */}
      <mesh position={[0, -0.79, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.2, 6]} />
        <meshBasicMaterial color="#818cf8" />
      </mesh>

      {/* Perimeter Energy Pillars */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = Math.cos(rad) * 7.5;
        const z = Math.sin(rad) * 7.5;
        return (
          <group key={deg} position={[x, 0, z]}>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.15, 0.22, 2.8, 8]} />
              <meshStandardMaterial color="#1e1b4b" metalness={0.9} />
            </mesh>
            <mesh position={[0, 1.9, 0]}>
              <sphereGeometry args={[0.2, 12, 12]} />
              <meshBasicMaterial color="#c084fc" />
            </mesh>
            <pointLight position={[0, 1.9, 0]} color="#a855f7" intensity={1.5} distance={5} />
          </group>
        );
      })}
    </group>
  );
}

/**
 * FighterArena3D: Complete 3D Dojo with FighterController and Combat Mechanics
 */
export function FighterArena3D() {
  const [combo, setCombo] = useState(0);
  const [lastAction, setLastAction] = useState<string>("Ready for combat");
  const [sparringHits, setSparringHits] = useState(0);
  const [lastHitType, setLastHitType] = useState<"punch" | "kick" | null>(null);

  const controls = useControls();

  const handlePunch = () => {
    setCombo((c) => c + 1);
    setLastAction("Void Lord James PUNCH!");
    setSparringHits((h) => h + 1);
    setLastHitType("punch");
  };

  const handleKick = () => {
    setCombo((c) => c + 1);
    setLastAction("Void Lord James KICK!");
    setSparringHits((h) => h + 1);
    setLastHitType("kick");
  };

  const resetDojo = () => {
    setCombo(0);
    setSparringHits(0);
    setLastHitType(null);
    setLastAction("Arena reset");
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-purple-500/30 bg-zinc-950 shadow-[0_0_80px_rgba(168,85,247,0.15)]">
      {/* Top Banner Status */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-zinc-900/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30">
            <Swords className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">3D Combat Dojo: Void Lord James</h2>
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-300">
                FighterController Active
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              WASD / Arrow Keys to Move • J or Space for Punch • K for Kick
            </p>
          </div>
        </div>

        {/* Combat Stats & Reset */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Combo Hits</div>
            <div className="text-xl font-black text-rose-400">{combo}x</div>
          </div>

          <button
            type="button"
            onClick={resetDojo}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="relative h-[480px] w-full bg-gradient-to-b from-[#0b0718] via-[#09090b] to-[#040208]">
        <Canvas
          camera={{ position: [0, 4.5, 9.5], fov: 45 }}
          shadows
          gl={{ antialias: true }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <pointLight position={[-4, 4, -2]} color="#c084fc" intensity={2} distance={12} />
          <pointLight position={[4, 3, 2]} color="#f43f5e" intensity={1.8} distance={12} />

          <Stars radius={40} depth={30} count={1200} factor={3} saturation={0.8} fade speed={1} />

          {/* 3D Arena Ground */}
          <ArenaGround />

          {/* Player Fighter Controller (Void Lord James) */}
          <FighterController
            position={[-1.6, 0, 0]}
            isPlayerOne={true}
            onPunch={handlePunch}
            onKick={handleKick}
            characterName="Void Lord James"
          />

          {/* Sparring Dummy Target */}
          <SparringDummy hitCount={sparringHits} lastHitType={lastHitType} />

          {/* Orbit camera for exploring angles */}
          <OrbitControls
            enablePan={false}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={4}
            maxDistance={14}
          />
        </Canvas>

        {/* Action Callout Overlay */}
        <div className="pointer-events-none absolute left-6 top-6 z-10">
          <div className="rounded-xl border border-purple-500/40 bg-zinc-950/85 px-4 py-2 text-xs font-bold text-purple-200 shadow-xl backdrop-blur">
            <span className="text-zinc-400">Action: </span>
            <span className="text-rose-400">{lastAction}</span>
          </div>
        </div>

        {/* Arcade Virtual Controls (for mouse & mobile touch) */}
        <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-end justify-between gap-3 pointer-events-none">
          {/* D-Pad Virtual Buttons */}
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-black/60 p-2.5 backdrop-blur">
            <button
              type="button"
              onMouseDown={() => controls.setControlState("forward", true)}
              onMouseUp={() => controls.setControlState("forward", false)}
              onTouchStart={() => controls.setControlState("forward", true)}
              onTouchEnd={() => controls.setControlState("forward", false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 shadow transition active:bg-purple-600 active:text-white"
            >
              W
            </button>
            <div className="flex gap-1.5">
              <button
                type="button"
                onMouseDown={() => controls.setControlState("left", true)}
                onMouseUp={() => controls.setControlState("left", false)}
                onTouchStart={() => controls.setControlState("left", true)}
                onTouchEnd={() => controls.setControlState("left", false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 shadow transition active:bg-purple-600 active:text-white"
              >
                A
              </button>
              <button
                type="button"
                onMouseDown={() => controls.setControlState("backward", true)}
                onMouseUp={() => controls.setControlState("backward", false)}
                onTouchStart={() => controls.setControlState("backward", true)}
                onTouchEnd={() => controls.setControlState("backward", false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 shadow transition active:bg-purple-600 active:text-white"
              >
                S
              </button>
              <button
                type="button"
                onMouseDown={() => controls.setControlState("right", true)}
                onMouseUp={() => controls.setControlState("right", false)}
                onTouchStart={() => controls.setControlState("right", true)}
                onTouchEnd={() => controls.setControlState("right", false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 shadow transition active:bg-purple-600 active:text-white"
              >
                D
              </button>
            </div>
          </div>

          {/* Action Attack Buttons */}
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 p-2.5 backdrop-blur">
            <button
              type="button"
              onClick={() => controls.triggerPunch()}
              className="flex h-12 w-16 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-red-700 font-bold text-white shadow-lg shadow-rose-600/30 transition hover:brightness-110 active:scale-95"
            >
              <span className="text-xs">PUNCH</span>
              <span className="text-[10px] text-rose-200">(J / Space)</span>
            </button>

            <button
              type="button"
              onClick={() => controls.triggerKick()}
              className="flex h-12 w-16 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 font-bold text-white shadow-lg shadow-orange-600/30 transition hover:brightness-110 active:scale-95"
            >
              <span className="text-xs">KICK</span>
              <span className="text-[10px] text-amber-200">(K)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Instructions */}
      <div className="flex flex-wrap items-center justify-between border-t border-white/10 bg-zinc-950 px-6 py-3 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span>Real-time 60 FPS physics loop via <code className="text-purple-300">useFrame</code> with dynamic delta clamping</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-500">Drag mouse to orbit camera</span>
          <span className="h-1 w-1 rounded-full bg-zinc-600" />
          <span className="text-zinc-300 font-medium">Console outputs: &quot;Void Lord James PUNCH!&quot;</span>
        </div>
      </div>
    </div>
  );
}
