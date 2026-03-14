import { ElementId } from '../types';
import { ELEMENTS } from './elements';
import { Grid } from './grid';

/**
 * Update a single cell's movement based on its element category.
 * @param grid - The simulation grid
 * @param x - Cell x coordinate
 * @param y - Cell y coordinate
 * @param leftToRight - Scan direction this frame (for bias prevention)
 * @param gravityDir - Gravity direction: 1 = normal (down), -1 = flipped (up)
 */
export function updateCell(grid: Grid, x: number, y: number, leftToRight: boolean, gravityDir: 1 | -1 = 1): void {
  const elem = grid.get(x, y);
  if (elem === ElementId.Empty) return;

  const def = ELEMENTS[elem];

  switch (def.category) {
    case 'powder': {
      if (elem === ElementId.Firework) {
        updateFirework(grid, x, y);
      } else {
        updatePowder(grid, x, y, gravityDir);
      }
      break;
    }
    case 'liquid': updateLiquid(grid, x, y, leftToRight, gravityDir); break;
    case 'gas':    updateGas(grid, x, y, gravityDir); break;
    case 'energy': updateEnergy(grid, x, y, elem, gravityDir); break;
    case 'static': updateStatic(grid, x, y, elem); break;
  }
}

function updatePowder(grid: Grid, x: number, y: number, g: 1 | -1): void {
  if (tryMove(grid, x, y, x, y + g)) return;

  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMove(grid, x, y, x - 1, y + g)) return;
    if (tryMove(grid, x, y, x + 1, y + g)) return;
  } else {
    if (tryMove(grid, x, y, x + 1, y + g)) return;
    if (tryMove(grid, x, y, x - 1, y + g)) return;
  }
}

function updateLiquid(grid: Grid, x: number, y: number, leftToRight: boolean, g: 1 | -1): void {
  const elem = grid.get(x, y);
  const elemDensity = ELEMENTS[elem].density;

  if (tryMoveOrDensitySwap(grid, x, y, x, y + g, elemDensity)) return;

  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + g, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + g, elemDensity)) return;
  } else {
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + g, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + g, elemDensity)) return;
  }

  if (leftToRight) {
    if (tryMove(grid, x, y, x + 1, y)) return;
    if (tryMove(grid, x, y, x - 1, y)) return;
  } else {
    if (tryMove(grid, x, y, x - 1, y)) return;
    if (tryMove(grid, x, y, x + 1, y)) return;
  }
}

function updateGas(grid: Grid, x: number, y: number, g: 1 | -1): void {
  const meta = grid.getMeta(x, y);

  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  // Gas rises opposite to gravity
  if (tryMove(grid, x, y, x, y - g)) return;

  const drift = Math.random() < 0.5 ? -1 : 1;
  if (tryMove(grid, x, y, x + drift, y - g)) return;
  if (tryMove(grid, x, y, x + drift, y)) return;
}

function updateStatic(grid: Grid, x: number, y: number, elem: ElementId): void {
  if (elem === ElementId.Plant) {
    updatePlant(grid, x, y);
  }
}

function updatePlant(grid: Grid, x: number, y: number): void {
  // Plant grows upward when adjacent to water (5% chance per tick)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) === ElementId.Water) {
        if (Math.random() < 0.05 && grid.get(x, y - 1) === ElementId.Empty) {
          grid.set(x, y - 1, ElementId.Plant);
          grid.setMeta(x, y - 1, 0);
        }
        return;
      }
    }
  }
}

function updateFirework(grid: Grid, x: number, y: number): void {
  // Firework falls like powder
  if (tryMove(grid, x, y, x, y + 1)) return;

  // Can't fall straight — try diagonal
  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMove(grid, x, y, x - 1, y + 1)) return;
    if (tryMove(grid, x, y, x + 1, y + 1)) return;
  } else {
    if (tryMove(grid, x, y, x + 1, y + 1)) return;
    if (tryMove(grid, x, y, x - 1, y + 1)) return;
  }

  // Blocked — explode into fire + colorful sparks
  grid.set(x, y, ElementId.Fire);
  grid.setMeta(x, y, 40 + Math.floor(Math.random() * 20));

  const radius = 5;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1 + Math.random() * radius;
    const sx = x + Math.round(Math.cos(angle) * dist);
    const sy = y + Math.round(Math.sin(angle) * dist);
    if (grid.inBounds(sx, sy) && grid.get(sx, sy) === ElementId.Empty) {
      grid.set(sx, sy, ElementId.Fire);
      grid.setMeta(sx, sy, 20 + Math.floor(Math.random() * 40));
    }
  }
}

function updateEnergy(grid: Grid, x: number, y: number, elem: ElementId, g: 1 | -1): void {
  if (elem === ElementId.Fire) {
    updateFire(grid, x, y, g);
  } else if (elem === ElementId.Electricity) {
    updateElectricity(grid, x, y);
  }
}

function updateFire(grid: Grid, x: number, y: number, g: 1 | -1): void {
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

  // Fire rises opposite to gravity
  const drift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  if (tryMove(grid, x, y, x + drift, y - g)) return;
  if (drift !== 0 && tryMove(grid, x, y, x, y - g)) return;
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
