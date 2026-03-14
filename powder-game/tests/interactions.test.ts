import { describe, it, expect } from 'vitest';
import { Grid } from '../src/simulation/grid';
import { ElementId } from '../src/types';
import { processInteractions } from '../src/simulation/interactions';

describe('Interactions', () => {
  it('fire + wood → more fire', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Fire);
    grid.setMeta(2, 2, 30);
    grid.set(3, 2, ElementId.Wood);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Fire);
  });

  it('fire + oil → fire (explosive)', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Fire);
    grid.setMeta(2, 2, 30);
    grid.set(3, 2, ElementId.Oil);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Fire);
  });

  it('fire + ice → water', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Fire);
    grid.setMeta(2, 2, 30);
    grid.set(3, 2, ElementId.Ice);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Water);
  });

  it('fire + gas → fire burst', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Fire);
    grid.setMeta(2, 2, 30);
    grid.set(3, 2, ElementId.Gas);
    grid.setMeta(3, 2, 100);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Fire);
  });

  it('lava + water → stone + steam', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Lava);
    grid.setMeta(2, 2, 200);
    grid.set(3, 2, ElementId.Water);
    processInteractions(grid, 2, 2);
    expect(grid.get(2, 2)).toBe(ElementId.Stone);
    expect(grid.get(3, 2)).toBe(ElementId.Steam);
  });

  it('acid + wood → empty (dissolves)', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Acid);
    grid.set(3, 2, ElementId.Wood);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Empty);
    expect(grid.get(2, 2)).toBe(ElementId.Empty);
  });

  it('acid + stone → both removed', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Acid);
    grid.set(3, 2, ElementId.Stone);
    processInteractions(grid, 2, 2);
    expect(grid.get(2, 2)).toBe(ElementId.Empty);
    expect(grid.get(3, 2)).toBe(ElementId.Empty);
  });

  it('heat decays on heat-based elements', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Sand);
    grid.setMeta(2, 2, 100);
    processInteractions(grid, 2, 2);
    expect(grid.getMeta(2, 2)).toBeLessThan(100);
  });

  it('sand transforms to glass at high heat', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Sand);
    grid.setMeta(2, 2, 210);
    processInteractions(grid, 2, 2);
    expect(grid.get(2, 2)).toBe(ElementId.Glass);
  });

  it('ice melts at heat threshold', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Ice);
    grid.setMeta(2, 2, 60);
    processInteractions(grid, 2, 2);
    expect(grid.get(2, 2)).toBe(ElementId.Water);
  });

  it('electricity propagates through metal', () => {
    const grid = new Grid(10, 5);
    grid.set(2, 2, ElementId.Electricity);
    grid.setMeta(2, 2, 3);
    grid.set(3, 2, ElementId.Metal);
    grid.set(4, 2, ElementId.Metal);
    processInteractions(grid, 2, 2);
    expect(grid.get(3, 2)).toBe(ElementId.Electricity);
  });
});
