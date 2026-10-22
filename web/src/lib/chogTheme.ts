/**
 * The Chog theme track - "we believe in chog".
 *
 * One module level <audio> element owns the whole soundtrack, and a single
 * scene switch says what that element should be doing at any moment:
 *
 *   quiz   the starting quiz   playing at 0.85
 *   intro  the CWO cinematic   playing at 0.85
 *   lobby  the main lobby      looping at 0.15
 *   arena  the game arena      faded out and paused
 *
 * The element is created once and never replaced, so the track can neither
 * duplicate nor restart as the visitor moves between screens - it only
 * changes level, and it always changes level with a fade.
 *
 * It lives in module scope rather than inside a component because the intro
 * unmounts the moment the route changes to "/" - an element owned by that
 * component would be torn down halfway through the fade, taking the music
 * with it.
 */

/** The track, served out of the app's public root. */
const TRACK_SRC = "/we believe in chog (chog).mp3";

/** Full energy - the starting quiz and the cinematic. */
export const INTRO_VOLUME = 0.85;

/** A dimmed background bed - the main lobby. */
export const AMBIENT_VOLUME = 0.15;

/** How long the arena takes to fade the music out before it stops. */
export const ARENA_FADE_MS = 600;

/** How long the music takes to ease between two levels. */
export const LOBBY_FADE_MS = 600;

/** The visitor's mute choice is remembered between visits. */
const MUTE_KEY = "cwo-theme-muted";

/**
 * The screens the track knows about.
 *
 * The scene is the single source of truth for the level: every screen just
 * says where it is, and the controller does the rest.
 */
export type ChogScene = "quiz" | "intro" | "lobby" | "arena";

/** What each scene wants from the track. */
const SCENE_LEVEL: Record<ChogScene, { volume: number; playing: boolean }> = {
  quiz: { volume: INTRO_VOLUME, playing: true },
  intro: { volume: INTRO_VOLUME, playing: true },
  lobby: { volume: AMBIENT_VOLUME, playing: true },
  arena: { volume: 0, playing: false },
};

export type ChogThemeSnapshot = {
  /** has the track ever been started */
  started: boolean;
  /** is it playing right now */
  playing: boolean;
  /** has the visitor muted it */
  muted: boolean;
};

/** What the server renders - the browser fills in the real thing on mount. */
const SERVER_SNAPSHOT: ChogThemeSnapshot = {
  started: false,
  playing: false,
  muted: false,
};

let element: HTMLAudioElement | null = null;
let fadeRaf = 0;

/** The fade that is running right now, if any. */
let fade: {
  target: number;
  endsAt: number;
  onDone?: () => void;
} | null = null;

let snapshot: ChogThemeSnapshot = { ...SERVER_SNAPSHOT };

const subscribers = new Set<() => void>();

/* The stored mute choice is read once, on the client. The server has no
 * localStorage, so it renders the unmuted button and the browser swaps it
 * for the real state the moment it hydrates. */
if (typeof window !== "undefined") {
  try {
    if (window.localStorage.getItem(MUTE_KEY) === "1") {
      snapshot = { ...snapshot, muted: true };
    }
  } catch {
    /* private mode - the track just starts unmuted */
  }
}

/**
 * Publish a new snapshot.
 *
 * The object identity only changes when something actually changed, so
 * `useSyncExternalStore` never re-renders in a loop.
 */
function publish(next: ChogThemeSnapshot) {
  if (
    snapshot.started === next.started &&
    snapshot.playing === next.playing &&
    snapshot.muted === next.muted
  ) {
    return;
  }
  snapshot = next;
  for (const fn of subscribers) fn();
}

/**
 * Create the audio element.
 *
 * It is attached to the document (hidden) rather than left floating, so
 * the browser keeps it alive across the route change and the level can be
 * read back from the outside.
 */
function ensureElement(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  if (element) return element;

  const audio = new Audio();
  audio.src = TRACK_SRC;
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = INTRO_VOLUME;
  audio.muted = snapshot.muted;
  audio.setAttribute("data-chog-theme", "");
  audio.style.display = "none";
  document.body.appendChild(audio);

  element = audio;
  return audio;
}

/**
 * Wait for the visitor's first interaction and start the track then.
 *
 * Browsers refuse to play audio before the page has been interacted with.
 * The level is already correct and the element is already loaded, so the
 * track simply joins in on the first click or key press instead of being
 * lost.
 */
function armUnlock(): void {
  if (typeof window === "undefined") return;
  let done = false;
  const unlock = () => {
    if (done) return;
    done = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
    const audio = element;
    if (!audio) return;
    audio
      .play()
      .then(() => publish({ ...snapshot, playing: true }))
      .catch(() => {});
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
  window.addEventListener("click", unlock);
}

/**
 * Ease the level towards a target.
 *
 * Driven by requestAnimationFrame so the fade lands on the same frames the
 * visitor is watching - no timer drift, and the fade finishes on its own
 * even if the screen that asked for it has already gone.
 */
function startFade(
  target: number,
  durationMs: number,
  onDone?: () => void,
): void {
  const audio = element;
  if (!audio) {
    onDone?.();
    return;
  }

  const now = performance.now();

  /* Already on its way there - let the running fade finish untouched, so
   * a handover keeps the exact timing it was given. */
  if (fade && fade.target === target && fade.endsAt > now) {
    if (onDone) {
      const prev = fade.onDone;
      fade.onDone = () => {
        prev?.();
        onDone();
      };
    }
    return;
  }

  cancelAnimationFrame(fadeRaf);
  const from = audio.volume;
  const startedAt = now;
  const endsAt = startedAt + Math.max(0, durationMs);

  /* already there - nothing to ease */
  if (Math.abs(from - target) < 0.0005) {
    audio.volume = target;
    fadeRaf = 0;
    fade = null;
    onDone?.();
    return;
  }

  fade = { target, endsAt, onDone };

  if (durationMs <= 0) {
    audio.volume = target;
    fadeRaf = 0;
    fade = null;
    onDone?.();
    return;
  }

  const step = () => {
    /* The frame timestamp handed to a rAF callback is the time the frame
     * was scheduled, which can be BEHIND the clock when the request was
     * made - and a long frame (the arena streams its rigs) can push the
     * next one further back still. Reading the clock here keeps the ramp
     * monotonic, and the clamp keeps the level inside [0, 1]. */
    const p = Math.min(1, Math.max(0, (performance.now() - startedAt) / durationMs));
    audio.volume = Math.min(1, Math.max(0, from + (target - from) * p));
    if (p < 1) {
      fadeRaf = requestAnimationFrame(step);
      return;
    }
    fadeRaf = 0;
    const done = fade?.onDone;
    fade = null;
    done?.();
  };
  fadeRaf = requestAnimationFrame(step);
}

/**
 * Ramp the level to a new value over a span of time.
 *
 * The public handle on the fade - the cinematic uses it to drop the music
 * over exactly as long as its own visual transition takes.
 */
export function rampChogThemeTo(target: number, durationMs: number): void {
  startFade(target, durationMs);
}

/**
 * Move the soundtrack to the level a screen wants.
 *
 * Every screen announces itself here and the controller handles the rest:
 * the level eases, the track never restarts, and the arena gets silence.
 */
export function setChogScene(next: ChogScene): void {
  const want = SCENE_LEVEL[next];
  const audio = ensureElement();
  if (!audio) return;

  /* ---------- the arena: the music steps aside for the combat ---------- */
  if (!want.playing) {
    startFade(0, ARENA_FADE_MS, () => {
      audio.pause();
      publish({ ...snapshot, playing: false });
    });
    return;
  }

  /* ---------- coming back from the arena, or a cold start ---------- */
  if (audio.paused) {
    /* A track that has never played starts at the level the scene wants.
     * One that is coming back from the arena eases up from silence, so it
     * never lands with a jolt. */
    const cold = !snapshot.started;
    audio.volume = cold ? want.volume : 0;
    audio.muted = snapshot.muted;

    const started = audio.play();
    if (started && typeof started.then === "function") {
      started
        .then(() => {
          publish({ ...snapshot, started: true, playing: true });
        })
        .catch(() => armUnlock());
    }
    publish({ ...snapshot, started: true });

    startFade(want.volume, cold ? 0 : LOBBY_FADE_MS);
    return;
  }

  /* ---------- already playing: ease it to the level this scene wants ---------- */
  startFade(want.volume, LOBBY_FADE_MS);
}

/** Mute or unmute the track. The choice is remembered for the next visit. */
export function setChogThemeMuted(muted: boolean): void {
  publish({ ...snapshot, muted });
  if (element) element.muted = muted;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode - the choice just does not stick */
  }
}

/** Flip the mute state and report the new one. */
export function toggleChogThemeMute(): boolean {
  setChogThemeMuted(!snapshot.muted);
  return snapshot.muted;
}

/** Subscribe to theme changes. */
export function subscribeChogTheme(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** The live theme state. */
export function getChogThemeSnapshot(): ChogThemeSnapshot {
  return snapshot;
}

/** The state the server renders. */
export function getChogThemeServerSnapshot(): ChogThemeSnapshot {
  return SERVER_SNAPSHOT;
}
