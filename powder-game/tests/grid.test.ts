import { describe, it, expect } from 'vitest';
import { Grid } from '../src/simulation/grid';
import { ElementId } from '../src/types';

describe('Grid', () => {
  it('initializes with all empty cells', () => {
    const grid = new Grid(10, 8);
    expect(grid.width).toBe(10);
    expect(grid.height).toBe(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 10; x++) {
        expect(grid.get(x, y)).toBe(ElementId.Empty);
        expect(grid.getMeta(x, y)).toBe(0);
      }
    }
  });

  it('sets and gets element and metadata', () => {
    const grid = new Grid(10, 10);
    grid.set(3, 4, ElementId.Sand);
    grid.setMeta(3, 4, 128);
    expect(grid.get(3, 4)).toBe(ElementId.Sand);
    expect(grid.getMeta(3, 4)).toBe(128);
  });

  it('returns Empty for out-of-bounds reads', () => {
    const grid = new Grid(5, 5);
    expect(grid.get(-1, 0)).toBe(ElementId.Empty);
    expect(grid.get(5, 0)).toBe(ElementId.Empty);
    expect(grid.get(0, -1)).toBe(ElementId.Empty);
    expect(grid.get(0, 5)).toBe(ElementId.Empty);
  });

  it('ignores out-of-bounds writes', () => {
    const grid = new Grid(5, 5);
    grid.set(-1, 0, ElementId.Sand);
    grid.set(5, 0, ElementId.Sand);
    expect(grid.get(0, 0)).toBe(ElementId.Empty);
  });

  it('swaps two cells', () => {
    const grid = new Grid(10, 10);
    grid.set(2, 3, ElementId.Sand);
    grid.setMeta(2, 3, 50);
    grid.set(2, 4, ElementId.Water);
    grid.setMeta(2, 4, 100);
    grid.swap(2, 3, 2, 4);
    expect(grid.get(2, 3)).toBe(ElementId.Water);
    expect(grid.getMeta(2, 3)).toBe(100);
    expect(grid.get(2, 4)).toBe(ElementId.Sand);
    expect(grid.getMeta(2, 4)).toBe(50);
  });

  it('inBounds check', () => {
    const grid = new Grid(10, 10);
    expect(grid.inBounds(0, 0)).toBe(true);
    expect(grid.inBounds(9, 9)).toBe(true);
    expect(grid.inBounds(-1, 0)).toBe(false);
    expect(grid.inBounds(10, 0)).toBe(false);
  });

  it('clears the grid', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Fire);
    grid.setMeta(2, 2, 60);
    grid.clear();
    expect(grid.get(2, 2)).toBe(ElementId.Empty);
    expect(grid.getMeta(2, 2)).toBe(0);
  });

  it('exposes raw buffers for transfer', () => {
    const grid = new Grid(4, 3);
    grid.set(0, 0, ElementId.Sand);
    const elemBuf = grid.elementBuffer;
    const metaBuf = grid.metadataBuffer;
    expect(elemBuf.byteLength).toBe(12);
    expect(metaBuf.byteLength).toBe(12);
    expect(new Uint8Array(elemBuf)[0]).toBe(ElementId.Sand);
  });
});
