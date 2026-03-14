import { ElementId } from '../types';
import { ELEMENTS } from './elements';
import { Grid } from './grid';

/**
 * Update a single cell's movement based on its element category.
 * @param grid - The simulation grid
 * @param x - Cell x coordinate
 * @param y - Cell y coordinate
 * @param leftToRight - Scan direction this frame (for bias prevention)
 */
export function updateCell(grid: Grid, x: number, y: number, leftToRight: boolean): void {
  const elem = grid.get(x, y);
  if (elem === ElementId.Empty) return;

  const def = ELEMENTS[elem];

  switch (def.category) {
    case 'powder': updatePowder(grid, x, y); break;
    case 'liquid': updateLiquid(grid, x, y, leftToRight); break;
    case 'gas':    updateGas(grid, x, y); break;
    case 'energy': updateEnergy(grid, x, y, elem); break;
    case 'static': break;
  }
}

function updatePowder(grid: Grid, x: number, y: number): void {
  if (tryMove(grid, x, y, x, y + 1)) return;

  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMove(grid, x, y, x - 1, y + 1)) return;
    if (tryMove(grid, x, y, x + 1, y + 1)) return;
  } else {
    if (tryMove(grid, x, y, x + 1, y + 1)) return;
    if (tryMove(grid, x, y, x - 1, y + 1)) return;
  }
}

function updateLiquid(grid: Grid, x: number, y: number, leftToRight: boolean): void {
  const elem = grid.get(x, y);
  const elemDensity = ELEMENTS[elem].density;

  if (tryMoveOrDensitySwap(grid, x, y, x, y + 1, elemDensity)) return;

  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + 1, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + 1, elemDensity)) return;
  } else {
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + 1, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + 1, elemDensity)) return;
  }

  if (leftToRight) {
    if (tryMove(grid, x, y, x + 1, y)) return;
    if (tryMove(grid, x, y, x - 1, y)) return;
  } else {
    if (tryMove(grid, x, y, x - 1, y)) return;
    if (tryMove(grid, x, y, x + 1, y)) return;
  }
}

function updateGas(grid: Grid, x: number, y: number): void {
  const meta = grid.getMeta(x, y);

  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  if (tryMove(grid, x, y, x, y - 1)) return;

  const drift = Math.random() < 0.5 ? -1 : 1;
  if (tryMove(grid, x, y, x + drift, y - 1)) return;
  if (tryMove(grid, x, y, x + drift, y)) return;
}

function updateEnergy(grid: Grid, x: number, y: number, elem: ElementId): void {
  if (elem === ElementId.Fire) {
    updateFire(grid, x, y);
  } else if (elem === ElementId.Electricity) {
    updateElectricity(grid, x, y);
  }
}

function updateFire(grid: Grid, x: number, y: number): void {
  const meta = grid.getMeta(x, y);

  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);
      if (neighbor !== ElementId.Empty && ELEMENTS[neighbor].metadataType === 'heat') {
        const currentHeat = grid.getMeta(nx, ny);
        grid.setMeta(nx, ny, Math.min(255, currentHeat + 5));
      }
    }
  }

  const drift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  if (tryMove(grid, x, y, x + drift, y - 1)) return;
  if (drift !== 0 && tryMove(grid, x, y, x, y - 1)) return;
}

function updateElectricity(grid: Grid, x: number, y: number): void {
  const meta = grid.getMeta(x, y);

  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);
}

/** Try to move element from (x,y) to (nx,ny). Returns true if moved. */
function tryMove(grid: Grid, x: number, y: number, nx: number, ny: number): boolean {
  if (!grid.inBounds(nx, ny)) return false;
  if (grid.get(nx, ny) !== ElementId.Empty) return false;
  grid.swap(x, y, nx, ny);
  return true;
}

/** Try to move, or swap with a lighter liquid at the target. */
function tryMoveOrDensitySwap(
  grid: Grid, x: number, y: number,
  nx: number, ny: number, density: number
): boolean {
  if (!grid.inBounds(nx, ny)) return false;
  const target = grid.get(nx, ny);
  if (target === ElementId.Empty) {
    grid.swap(x, y, nx, ny);
    return true;
  }
  const targetDef = ELEMENTS[target];
  if (targetDef.category === 'liquid' && targetDef.density < density) {
    grid.swap(x, y, nx, ny);
    return true;
  }
  return false;
}
