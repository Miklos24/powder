import { describe, it, expect } from 'vitest';
import { Grid } from '../src/simulation/grid';
import { ElementId } from '../src/types';
import { applyInputs, tick } from '../src/simulation/worker';

describe('applyInputs', () => {
  it('places element in empty cells within brush radius', () => {
    const grid = new Grid(10, 10);
    applyInputs(grid, [{ x: 5, y: 5, element: ElementId.Sand, radius: 1, erase: false }]);
    expect(grid.get(5, 5)).toBe(ElementId.Sand);
    expect(grid.get(5, 4)).toBe(ElementId.Sand);
    expect(grid.get(5, 6)).toBe(ElementId.Sand);
  });

  it('does not overwrite non-empty cells', () => {
    const grid = new Grid(10, 10);
    grid.set(5, 5, ElementId.Stone);
    applyInputs(grid, [{ x: 5, y: 5, element: ElementId.Sand, radius: 0, erase: false }]);
    expect(grid.get(5, 5)).toBe(ElementId.Stone);
  });

  it('eraser overwrites any cell', () => {
    const grid = new Grid(10, 10);
    grid.set(5, 5, ElementId.Stone);
    applyInputs(grid, [{ x: 5, y: 5, element: ElementId.Sand, radius: 0, erase: true }]);
    expect(grid.get(5, 5)).toBe(ElementId.Empty);
  });

  it('circular brush shape', () => {
    const grid = new Grid(10, 10);
    applyInputs(grid, [{ x: 5, y: 5, element: ElementId.Sand, radius: 2, erase: false }]);
    // Corner at (3,3) is distance sqrt(8) ≈ 2.83 > radius 2, should be empty
    expect(grid.get(3, 3)).toBe(ElementId.Empty);
    // (4,5) is distance 1, should be filled
    expect(grid.get(4, 5)).toBe(ElementId.Sand);
  });
});

describe('tick', () => {
  it('alternates scan direction', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 0, ElementId.Sand);
    tick(grid, 0);
    expect(grid.get(2, 1)).toBe(ElementId.Sand);

    grid.set(3, 0, ElementId.Sand);
    tick(grid, 1);
    expect(grid.get(3, 1)).toBe(ElementId.Sand);
  });
});
