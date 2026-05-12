// Curved-arc wheel constants. The visible label arc is small relative to R,
// so labels appear nearly horizontal with a slight per-label tilt.
// Horizontal placement of the wheel within the pane is handled in CSS
// (`.wheel-svg { transform: translateX(...) }`), not via viewBox shifting.
export const WHEEL_VB_W = 720;
export const WHEEL_VB_H = 800;
export const CX = -180;
export const CY = 400;
export const R = 820;
export const VISIBLE_HALF = 28;
export const INDICATOR_X = CX + R; // 640
const MIN_FILLED = 48;

export type WheelLayout = {
  reps: number;
  totalSlots: number;
  step: number;
};

export function wheelLayout(poisLength: number): WheelLayout {
  const reps = Math.max(1, Math.ceil(MIN_FILLED / Math.max(1, poisLength)));
  const totalSlots = poisLength * reps;
  return { reps, totalSlots, step: 360 / totalSlots };
}

export function normalizeAngle(deg: number): number {
  let t = deg;
  while (t > 180) t -= 360;
  while (t < -180) t += 360;
  return t;
}
