import { describe, it, expect } from 'vitest';
import { Grid } from '../src/simulation/grid';
import { ElementId } from '../src/types';
import { updateCell } from '../src/simulation/physics';

describe('Physics - Powder', () => {
  it('sand falls down into empty space', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Sand);
    updateCell(grid, 2, 1, false);
    expect(grid.get(2, 1)).toBe(ElementId.Empty);
    expect(grid.get(2, 2)).toBe(ElementId.Sand);
  });

  it('sand slides diagonally when blocked below', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Sand);
    grid.set(2, 2, ElementId.Stone);
    updateCell(grid, 2, 1, false);
    const movedLeft = grid.get(1, 2) === ElementId.Sand;
    const movedRight = grid.get(3, 2) === ElementId.Sand;
    expect(movedLeft || movedRight).toBe(true);
    expect(grid.get(2, 1)).toBe(ElementId.Empty);
  });

  it('sand stays put when fully blocked', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Sand);
    grid.set(1, 2, ElementId.Stone);
    grid.set(2, 2, ElementId.Stone);
    grid.set(3, 2, ElementId.Stone);
    updateCell(grid, 2, 1, false);
    expect(grid.get(2, 1)).toBe(ElementId.Sand);
  });
});

describe('Physics - Liquid', () => {
  it('water falls down into empty space', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Water);
    updateCell(grid, 2, 1, false);
    expect(grid.get(2, 1)).toBe(ElementId.Empty);
    expect(grid.get(2, 2)).toBe(ElementId.Water);
  });

  it('water flows sideways when blocked below and diagonally', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Water);
    grid.set(1, 2, ElementId.Stone);
    grid.set(2, 2, ElementId.Stone);
    grid.set(3, 2, ElementId.Stone);
    updateCell(grid, 2, 1, false);
    const movedLeft = grid.get(1, 1) === ElementId.Water;
    const movedRight = grid.get(3, 1) === ElementId.Water;
    expect(movedLeft || movedRight).toBe(true);
  });

  it('oil floats above water (density swap)', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Water);
    grid.set(2, 2, ElementId.Oil);
    // Block below so oil can't just fall into empty space
    grid.set(2, 3, ElementId.Stone);
    grid.set(1, 3, ElementId.Stone);
    grid.set(3, 3, ElementId.Stone);
    grid.set(1, 2, ElementId.Stone);
    grid.set(3, 2, ElementId.Stone);
    // Water is denser (2) than oil (1), so water should swap down with oil
    updateCell(grid, 2, 1, false);
    expect(grid.get(2, 1)).toBe(ElementId.Oil);
    expect(grid.get(2, 2)).toBe(ElementId.Water);
  });
});

describe('Physics - Gas', () => {
  it('gas rises upward', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 3, ElementId.Gas);
    grid.setMeta(2, 3, 200);
    updateCell(grid, 2, 3, false);
    expect(grid.get(2, 2)).toBe(ElementId.Gas);
    expect(grid.get(2, 3)).toBe(ElementId.Empty);
  });

  it('gas dissipates when age reaches 0', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 3, ElementId.Gas);
    grid.setMeta(2, 3, 1);
    updateCell(grid, 2, 3, false);
    const gasAt22 = grid.get(2, 2) === ElementId.Gas;
    const gasAt23 = grid.get(2, 3) === ElementId.Gas;
    expect(gasAt22 || gasAt23).toBe(false);
  });
});

describe('Physics - Fire', () => {
  it('fire rises and ages', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 3, ElementId.Fire);
    grid.setMeta(2, 3, 30);
    updateCell(grid, 2, 3, false);
    // Fire moves up — could be (1,2), (2,2), or (3,2) depending on random drift
    const fireAt12 = grid.get(1, 2) === ElementId.Fire;
    const fireAt22 = grid.get(2, 2) === ElementId.Fire;
    const fireAt32 = grid.get(3, 2) === ElementId.Fire;
    expect(fireAt12 || fireAt22 || fireAt32).toBe(true);
    expect(grid.get(2, 3)).toBe(ElementId.Empty);
  });

  it('fire dies when age reaches 0', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 3, ElementId.Fire);
    grid.setMeta(2, 3, 1);
    updateCell(grid, 2, 3, false);
    const fireAt22 = grid.get(2, 2) === ElementId.Fire;
    const fireAt23 = grid.get(2, 3) === ElementId.Fire;
    expect(fireAt22 || fireAt23).toBe(false);
  });
});
