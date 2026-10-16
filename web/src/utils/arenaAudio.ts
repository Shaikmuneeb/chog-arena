/**
 * Arena audio: Web Audio API impact/dash SFX + speechSynthesis round announcer.
 * Contexts are created lazily (user-gesture gated by the battle opening).
 *
 * Announcement rules:
 * - speechSynthesis.cancel() is always called before a new line speaks.
 * - lastAnnouncedRound guarantees each round number is announced at most
 *   once per match; resetArenaAudio() clears the guard at match start.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** White-noise buffer reused across impacts. */
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

export type ImpactKind = "slash" | "crit" | "slam";

/** Heavy synthesized melee impacts (also used under dash/hit layers). */
export function playImpactSfx(kind: ImpactKind = "slash") {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = kind === "slam" ? "lowpass" : "bandpass";
  noiseFilter.frequency.value =
    kind === "slam" ? 900 : kind === "crit" ? 1600 : 2400;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(kind === "slam" ? 0.5 : 0.32, now);
  noiseGain.gain.exponentialRampToValueAtTime(
    0.001,
    now + (kind === "slam" ? 0.45 : 0.16),
  );
  noise.connect(noiseFilter).connect(noiseGain).connect(gain);
  noise.start(now);
  noise.stop(now + (kind === "slam" ? 0.5 : 0.2));

  const osc = ctx.createOscillator();
  osc.type = kind === "slam" ? "sine" : "triangle";
  const startFreq = kind === "slam" ? 140 : kind === "crit" ? 220 : 320;
  const endFreq = kind === "slam" ? 55 : 90;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.16);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(kind === "slam" ? 0.55 : 0.28, now);
  oscGain.gain.exponentialRampToValueAtTime(
    0.001,
    now + (kind === "slam" ? 0.5 : 0.18),
  );
  osc.connect(oscGain).connect(gain);
  osc.start(now);
  osc.stop(now + (kind === "slam" ? 0.55 : 0.22));
}

/** Quick forward-dash whoosh as the attacker closes to melee range. */
export function playDashSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(2800, now + 0.14);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.2);
}

/** Short blunt hit thunk for connecting melee blows. */
export function playHitSfx() {
  playImpactSfx("slash");
}

/** Rising purple-energy shimmer for a Second Wind resurrection. */
export function playSecondWindSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.4, now + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(920, now + 1.2);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 1.65);

  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(440, now);
  shimmer.frequency.exponentialRampToValueAtTime(1320, now + 1.1);
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.setValueAtTime(0.08, now);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
  shimmer.connect(shimmerGain).connect(ctx.destination);
  shimmer.start(now);
  shimmer.stop(now + 1.45);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(1200, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(4200, now + 1.0);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.12, now + 0.4);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 1.35);
}

/* ------------------------------------------------------------- announcer */

let lastAnnouncedRound: 1 | 2 | 3 | null = null;

/** Clear the once-per-match announcement guard (call at match start). */
export function resetArenaAudio() {
  lastAnnouncedRound = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** Deep-voiced arcade announcer. Always cancels pending speech first. */
export function announce(text: string, pitch = 0.65) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = pitch;
    utterance.rate = 0.92;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) => /en[-_]/i.test(v.lang) && /male|david|daniel/i.test(v.name),
      ) ?? voices.find((v) => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* speech unavailable — stay silent */
  }
}

/**
 * Announce a round exactly once per match. Repeated calls with the same
 * round number are no-ops (guards the "Round 2" loop bug at the audio layer).
 */
export function playRoundAnnouncement(round: 1 | 2 | 3) {
  if (lastAnnouncedRound === round) return;
  lastAnnouncedRound = round;
  if (round === 1) announce("Round 1... Fight!");
  else if (round === 2) announce("Round 2... Fight!");
  else announce("Round 3... Final Round... Fight!");
}

/** Kill any in-flight announcements (battle close / skip). */
export function stopArenaAudio() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
