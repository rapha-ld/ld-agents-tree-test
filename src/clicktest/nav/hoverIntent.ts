// Hover intent for the icon rail (config.hoverIntent). Two standard techniques:
//
// 1. Velocity gating, after jQuery hoverIntent (Brian Cherne): don't act on a
//    pointer that's only passing over. Sample its position every
//    INTENT_INTERVAL_MS, and only act once it has moved less than
//    INTENT_SENSITIVITY_PX between two samples, i.e. it has slowed onto the
//    target. A plain delay can't tell passing from pausing; this can.
//
// 2. Aim prediction, after jQuery-menu-aim (Ben Kamens, Amazon's mega menu):
//    while a flyout is open, a pointer heading diagonally towards it crosses
//    other rail icons on the way. If its last movement points into the
//    triangle between the pointer and the panel's near edge, it's aiming for
//    the panel, so don't switch or close yet; check again in AIM_DELAY_MS.

import { useCallback, useEffect, useRef } from 'react';

export const INTENT_INTERVAL_MS = 80;
export const INTENT_SENSITIVITY_PX = 6;
export const AIM_DELAY_MS = 300;
/** How far past the panel's top and bottom the aim triangle reaches, as in menu-aim. */
const AIM_TOLERANCE_PX = 75;

interface Point {
  x: number;
  y: number;
}

/** A pointer that hasn't moved for this long has stopped aiming, wherever it pointed last. */
const AIM_STALE_MS = INTENT_INTERVAL_MS * 1.5;

/**
 * Call `onIntent` once the pointer slows over the element. Spread the returned
 * handlers onto it; `cancel` stops waiting (also called on leave).
 */
export function useVelocityIntent(onIntent: (at: Point) => void) {
  const latest = useRef(onIntent);
  latest.current = onIntent;
  const state = useRef({ x: 0, y: 0, px: 0, py: 0, timer: 0 });

  const cancel = () => window.clearTimeout(state.current.timer);
  useEffect(() => cancel, []);

  const check = () => {
    const s = state.current;
    if (Math.hypot(s.x - s.px, s.y - s.py) < INTENT_SENSITIVITY_PX) {
      latest.current({ x: s.x, y: s.y });
      return;
    }
    s.px = s.x;
    s.py = s.y;
    s.timer = window.setTimeout(check, INTENT_INTERVAL_MS);
  };

  return {
    start: (e: { clientX: number; clientY: number }) => {
      const s = state.current;
      cancel();
      s.x = s.px = e.clientX;
      s.y = s.py = e.clientY;
      s.timer = window.setTimeout(check, INTENT_INTERVAL_MS);
    },
    move: (e: { clientX: number; clientY: number }) => {
      state.current.x = e.clientX;
      state.current.y = e.clientY;
    },
    cancel,
  };
}

/**
 * Tracks the pointer across the document while `enabled`, so callers can ask
 * whether it's heading for a panel to the right of where it is.
 */
export function useAimTracker(enabled: boolean) {
  const points = useRef<Point[]>([]);
  const lastMove = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      points.current.push({ x: e.clientX, y: e.clientY });
      lastMove.current = performance.now();
      if (points.current.length > 3) points.current.shift();
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      points.current = [];
    };
  }, [enabled]);

  /** True when the last movement points into the panel's triangle (panel on the right). */
  return useCallback((panel: Element | null) => {
    const pts = points.current;
    if (!panel || pts.length < 2 || performance.now() - lastMove.current > AIM_STALE_MS) return false;
    const loc = pts[pts.length - 1];
    const prev = pts[0];
    const r = panel.getBoundingClientRect();
    // Already over (or past) the panel's near edge, or not moving: not aiming.
    if (loc.x >= r.left || (loc.x === prev.x && loc.y === prev.y)) return false;
    const upper = { x: r.left, y: r.top - AIM_TOLERANCE_PX };
    const lower = { x: r.left, y: r.bottom + AIM_TOLERANCE_PX };
    const slope = (a: Point, b: Point) => (b.y - a.y) / (b.x - a.x);
    // Heading into the triangle: the slope to the upper corner falls and the
    // slope to the lower corner rises as the pointer moves.
    return slope(loc, upper) < slope(prev, upper) && slope(loc, lower) > slope(prev, lower);
  }, []);
}
