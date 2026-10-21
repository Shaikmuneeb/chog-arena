/**
 * The Chog theme track - "we believe in chog".
 *
 * One module level <audio> element owns the whole soundtrack:
 *
 *  - the CWO cinematic fires it at full energy (0.85) for the five second
 *    title sequence,
 *  - the flash that hands the visitor over to the lobby ramps the level
 *    down over exactly as long as that visual transition takes,
 *  - and the very same element keeps looping in the lobby at an ambient
 *    0.175, never restarting.
 *
 * It lives in module scope rather than inside a component because the
 * intro unmounts the moment the route changes to "/" - an element owned by
 * that component would be torn down halfway through the fade, taking the
 * music with it.
 */

/** The track, served out of the app's public root. */
const TRACK_SRC = "/we believe in chog (chog).mp3";

/** Full energy - the cinematic. */
export const INTRO_VOLUME = 0.85;

/** A dimmed background bed - the lobby. */
export const AMBIENT_VOLUME = 0.175;

/** The visitor's mute choice is remembered between visits. */
const MUTE_KEY = "cwo-theme-muted";

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
 * Pull the track down while the visitor is still at the vibe check.
 *
 * The file is 2.5MB, so it is worth having in the cache before the
 * cinematic needs it.
 */
export function preloadChogTheme(): void {
  ensureElement();
}

/**
 * Start the track at full energy.
 *
 * Safe to call more than once - the element is only created once and
 * `play()` on an element that is already playing does not restart it, so
 * the intro can never restart the song mid-way.
 */
export function playChogTheme(): void {
  const audio = ensureElement();
  if (!audio) return;

  if (!snapshot.started) {
    audio.volume = INTRO_VOLUME;
    publish({ ...snapshot, started: true });
  }
  audio.muted = snapshot.muted;

  const started = audio.play();
  if (!started || typeof started.then !== "function") return;
  started
    .then(() => publish({ ...snapshot, playing: true }))
    .catch(() => armUnlock());
}

/**
 * Ramp the level to a new value over a span of time.
 *
 * Driven by requestAnimationFrame so the fade lands on the same frames the
 * visitor is watching - no timer drift, and the fade finishes on its own
 * even if the intro unmounts halfway through it.
 */
export function rampChogThemeTo(target: number, durationMs: number): void {
  const audio = element;
  if (!audio) return;

  cancelAnimationFrame(fadeRaf);
  const from = audio.volume;
  if (durationMs <= 0 || from === target) {
    audio.volume = target;
    return;
  }

  const startedAt = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - startedAt) / durationMs);
    audio.volume = from + (target - from) * p;
    if (p < 1) {
      fadeRaf = requestAnimationFrame(step);
    }
  };
  fadeRaf = requestAnimationFrame(step);
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
