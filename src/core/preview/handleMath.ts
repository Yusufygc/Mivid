export interface Point {
  x: number;
  y: number;
}

export const MIN_HANDLE_SCALE = 0.05;
export const MAX_HANDLE_SCALE = 8;

/** Uniform scale from dragging a corner handle: the ratio of pointer distances from the clip anchor */
export const scaleFromDrag = (originScale: number, anchor: Point, start: Point, current: Point): number => {
  const startDistance = Math.hypot(start.x - anchor.x, start.y - anchor.y);
  if (startDistance < 1e-6) return originScale;

  const ratio = Math.hypot(current.x - anchor.x, current.y - anchor.y) / startDistance;
  const scaled = Math.min(MAX_HANDLE_SCALE, Math.max(MIN_HANDLE_SCALE, originScale * ratio));
  return Math.round(scaled * 100) / 100;
};

/** Wraps any angle into -180..180 degrees */
export const normalizeDegrees = (degrees: number): number => {
  let d = ((degrees + 180) % 360 + 360) % 360 - 180;
  if (d === -180 && degrees > 0) d = 180;
  return d;
};

/** Rotation in degrees from dragging the rotate handle around the clip anchor. `stepDegrees` snaps (e.g. 15 with Shift). */
export const rotationFromDrag = (
  originRotation: number,
  anchor: Point,
  start: Point,
  current: Point,
  stepDegrees?: number
): number => {
  const startAngle = Math.atan2(start.y - anchor.y, start.x - anchor.x);
  const currentAngle = Math.atan2(current.y - anchor.y, current.x - anchor.x);
  let degrees = originRotation + ((currentAngle - startAngle) * 180) / Math.PI;

  if (stepDegrees) degrees = Math.round(degrees / stepDegrees) * stepDegrees;
  return Math.round(normalizeDegrees(degrees));
};

/** Cursor for a handle, given the clip rotation so diagonal resize cursors follow the box */
export const cursorForHandle = (type: 'nw' | 'ne' | 'se' | 'sw' | 'rotate', rotationDegrees: number): string => {
  if (type === 'rotate') return 'grab';
  const baseAngle = { nw: 225, ne: 315, se: 45, sw: 135 }[type];
  const angle = (((baseAngle + rotationDegrees) % 180) + 180) % 180; // axis only, direction does not matter
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize';
  if (angle < 67.5) return 'nwse-resize';
  if (angle < 112.5) return 'ns-resize';
  return 'nesw-resize';
};

/**
 * Box spanned by a fixed opposite corner and the dragged pointer (both in project pixels).
 * Returns the center and the size at scale 1 (`scale` is the clip's current scale), never smaller than `minSize`.
 */
export const regionFromCorner = (
  opposite: Point,
  pointer: Point,
  scale: number,
  minSize: number
): { centerX: number; centerY: number; width: number; height: number } => {
  const safeScale = scale > 0 ? scale : 1;
  const min = minSize * safeScale;

  let dx = pointer.x - opposite.x;
  let dy = pointer.y - opposite.y;
  if (Math.abs(dx) < min) dx = (dx < 0 ? -1 : 1) * min;
  if (Math.abs(dy) < min) dy = (dy < 0 ? -1 : 1) * min;

  return {
    centerX: opposite.x + dx / 2,
    centerY: opposite.y + dy / 2,
    width: Math.abs(dx) / safeScale,
    height: Math.abs(dy) / safeScale,
  };
};

/** Normalized rectangle (positive size) between two corners */
export const rectFromCorners = (a: Point, b: Point): { x: number; y: number; width: number; height: number } => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});
