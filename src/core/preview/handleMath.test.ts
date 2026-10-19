import { describe, it, expect } from 'vitest';
import {
  scaleFromDrag,
  rotationFromDrag,
  normalizeDegrees,
  cursorForHandle,
  regionFromCorner,
  rectFromCorners,
  MAX_HANDLE_SCALE,
  MIN_HANDLE_SCALE,
} from './handleMath';

const anchor = { x: 500, y: 250 };

describe('scaleFromDrag', () => {
  it('doubles the scale when the pointer is twice as far from the anchor', () => {
    expect(scaleFromDrag(1, anchor, { x: 600, y: 250 }, { x: 700, y: 250 })).toBe(2);
  });

  it('keeps the scale at the start position and scales relative to the original', () => {
    expect(scaleFromDrag(1.5, anchor, { x: 600, y: 250 }, { x: 600, y: 250 })).toBe(1.5);
    expect(scaleFromDrag(1.5, anchor, { x: 600, y: 250 }, { x: 550, y: 250 })).toBe(0.75);
  });

  it('works along any direction, not only horizontally', () => {
    expect(scaleFromDrag(1, anchor, { x: 500, y: 350 }, { x: 500, y: 450 })).toBe(2);
    expect(scaleFromDrag(1, anchor, { x: 600, y: 350 }, { x: 700, y: 450 })).toBe(2);
  });

  it('clamps to the allowed range', () => {
    expect(scaleFromDrag(1, anchor, { x: 600, y: 250 }, { x: 500, y: 250 })).toBe(MIN_HANDLE_SCALE);
    expect(scaleFromDrag(1, anchor, { x: 501, y: 250 }, { x: 5000, y: 250 })).toBe(MAX_HANDLE_SCALE);
  });

  it('ignores a drag that starts exactly on the anchor', () => {
    expect(scaleFromDrag(1.2, anchor, anchor, { x: 800, y: 250 })).toBe(1.2);
  });
});

describe('rotationFromDrag', () => {
  it('rotates by the swept angle (clockwise on screen is positive)', () => {
    // start right of the anchor, end below the anchor: +90 degrees (y grows downward)
    expect(rotationFromDrag(0, anchor, { x: 600, y: 250 }, { x: 500, y: 350 })).toBe(90);
    expect(rotationFromDrag(0, anchor, { x: 600, y: 250 }, { x: 500, y: 150 })).toBe(-90);
  });

  it('adds to the original rotation and wraps into -180..180', () => {
    expect(rotationFromDrag(170, anchor, { x: 600, y: 250 }, { x: 500, y: 350 })).toBe(-100);
  });

  it('snaps to steps when asked (Shift)', () => {
    // 20 degrees swept, snapped to 15
    const rad = (20 * Math.PI) / 180;
    const current = { x: anchor.x + 100 * Math.cos(rad), y: anchor.y + 100 * Math.sin(rad) };
    expect(rotationFromDrag(0, anchor, { x: 600, y: 250 }, current, 15)).toBe(15);
    expect(rotationFromDrag(0, anchor, { x: 600, y: 250 }, current)).toBe(20);
  });
});

describe('normalizeDegrees', () => {
  it('wraps angles', () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(190)).toBe(-170);
    expect(normalizeDegrees(-190)).toBe(170);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(180)).toBe(180);
  });
});

describe('cursorForHandle', () => {
  it('uses grab for rotation and diagonal resize cursors for corners', () => {
    expect(cursorForHandle('rotate', 0)).toBe('grab');
    expect(cursorForHandle('nw', 0)).toBe('nwse-resize');
    expect(cursorForHandle('se', 0)).toBe('nwse-resize');
    expect(cursorForHandle('ne', 0)).toBe('nesw-resize');
    expect(cursorForHandle('sw', 0)).toBe('nesw-resize');
  });

  it('follows the clip rotation', () => {
    expect(cursorForHandle('nw', 90)).toBe('nesw-resize');
    expect(cursorForHandle('nw', 45)).toBe('ns-resize');
  });
});

describe('regionFromCorner / rectFromCorners', () => {
  it('spans the box between the fixed corner and the pointer', () => {
    const box = regionFromCorner({ x: 100, y: 100 }, { x: 300, y: 250 }, 1, 8);
    expect(box).toEqual({ centerX: 200, centerY: 175, width: 200, height: 150 });
  });

  it('works when the pointer crosses over the fixed corner', () => {
    const box = regionFromCorner({ x: 300, y: 250 }, { x: 100, y: 100 }, 1, 8);
    expect(box).toEqual({ centerX: 200, centerY: 175, width: 200, height: 150 });
  });

  it('divides by the clip scale so the size stays at scale 1', () => {
    const box = regionFromCorner({ x: 0, y: 0 }, { x: 400, y: 200 }, 2, 8);
    expect(box).toMatchObject({ centerX: 200, centerY: 100, width: 200, height: 100 });
  });

  it('never shrinks below the minimum size', () => {
    const box = regionFromCorner({ x: 100, y: 100 }, { x: 101, y: 100 }, 1, 8);
    expect(box.width).toBe(8);
    expect(box.height).toBe(8);
  });

  it('normalizes a rectangle between two corners', () => {
    expect(rectFromCorners({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });
});
