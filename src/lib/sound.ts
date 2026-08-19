/**
 * The app's haptic layer, such as it is: short synthesized cues that answer a
 * gesture. No files are loaded and nothing is fetched - every cue is built
 * from an oscillator or a burst of filtered noise at the moment it plays.
 *
 * The palette, from the sound-design canvas in design_handoff_walk_roulette:
 * high and very short for fingertip contact, one low weighted thump reserved
 * for the single moment that matters, the reel landing. Everything sits at
 * whisper level under a shared master gain.
 *
 * Rules that keep it from becoming noise: nothing sounds without a gesture,
 * only the throw earns a run of cues and that run always decays, and a browser
 * that has not been interacted with yet gets no context at all - autoplay
 * policy would reject it and the console warning is worse than the silence.
 */

import { tuning } from "../app/tuning";

let context: AudioContext | null = null;
let master: GainNode | null = null;

/**
 * Lazily built on the first cue, which by construction follows a click or a
 * key press, so the context starts unsuspended. Returns null when the browser
 * has no Web Audio at all, which is a reason to stay quiet, not to throw.
 */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!tuning.soundEnabled) return null;
  if (!context || !master) {
    if (!("AudioContext" in window)) return null;
    context = new AudioContext();
    master = context.createGain();
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  master.gain.value = tuning.soundVolume;
  return { ctx: context, out: master };
}

/** A pitched blip. `drop` bends the pitch down over its life when given. */
function tone(freq: number, type: OscillatorType, seconds: number, gain: number, drop?: number) {
  const node = audio();
  if (!node) return;
  const { ctx, out } = node;
  const at = ctx.currentTime;

  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (drop !== undefined) osc.frequency.exponentialRampToValueAtTime(drop, at + seconds);
  // Ramps to a small positive value, not zero: exponentialRamp is undefined at 0.
  envelope.gain.setValueAtTime(gain, at);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  osc.connect(envelope);
  envelope.connect(out);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/** A click: white noise through a bandpass, decaying over its own length. */
function click(centerHz: number, seconds: number, gain: number) {
  const node = audio();
  if (!node) return;
  const { ctx, out } = node;

  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / frames);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = centerHz;
  band.Q.value = 1.4;
  const envelope = ctx.createGain();
  envelope.gain.value = gain;

  source.connect(band);
  band.connect(envelope);
  envelope.connect(out);
  source.start(ctx.currentTime);
}

/** Dial detent. Pitch tracks the value, so scrubbing is audibly directional. */
export function playDetent(minutes: number, minMinutes: number): void {
  tone(1500 + (minutes - minMinutes) * 8, "sine", 0.018, 0.05);
  click(3200, 0.008, 0.02);
}

/** Chip or option toggle: higher going on, lower going off. */
export function playTap(on: boolean): void {
  tone(on ? 950 : 640, "triangle", 0.045, 0.07);
}

/** Switch: a small physical latch. */
export function playThock(on: boolean): void {
  tone(on ? 200 : 160, "triangle", 0.06, 0.12, on ? 170 : 130);
  click(1800, 0.01, 0.03);
}

/** Button contact. */
export function playPress(): void {
  click(900, 0.012, 0.08);
}

/** One tick of the reel. Pitch falls as the throw slows, so 0 is the start. */
export function playRatchet(progress: number): void {
  click(2600 - progress * 800, 0.012, 0.06);
}

/** The reel landing: the one low, weighted moment, with a soft fifth over it. */
export function playLanding(): void {
  tone(110, "sine", 0.18, 0.16, 70);
  window.setTimeout(() => {
    tone(660, "triangle", 0.25, 0.035);
    tone(990, "triangle", 0.25, 0.025);
  }, 60);
}
