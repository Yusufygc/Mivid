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
