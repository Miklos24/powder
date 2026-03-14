import { ElementId } from '../types';
import { ELEMENTS } from './elements';
import { Grid } from './grid';

/**
 * Process interactions for a cell. Checks neighbors for reactions,
 * handles heat decay, and triggers element transformations.
 */
export function processInteractions(grid: Grid, x: number, y: number): void {
  const elem = grid.get(x, y);
  if (elem === ElementId.Empty) return;

  const def = ELEMENTS[elem];

  // Heat decay for heat-based elements
  if (def.metadataType === 'heat') {
    const heat = grid.getMeta(x, y);
    if (heat > 0) {
      grid.setMeta(x, y, Math.max(0, heat - 1));
    }

    // Heat-triggered transformations
    if (elem === ElementId.Sand && heat > 200) {
      grid.set(x, y, ElementId.Glass);
      grid.setMeta(x, y, heat);
      return;
    }
    if (elem === ElementId.Ice && heat > 50) {
      grid.set(x, y, ElementId.Water);
      grid.setMeta(x, y, 0);
      return;
    }
  }

  // Check neighbors for reactions
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const neighbor = grid.get(nx, ny);
      if (neighbor === ElementId.Empty) continue;

      const reacted = react(grid, x, y, elem, nx, ny, neighbor);
      if (reacted) return;
    }
  }
}

function react(
  grid: Grid,
  x: number, y: number, elem: ElementId,
  nx: number, ny: number, neighbor: ElementId
): boolean {
  // Fire interactions
  if (elem === ElementId.Fire) {
    if (neighbor === ElementId.Wood) {
      grid.set(nx, ny, ElementId.Fire);
      grid.setMeta(nx, ny, 40 + Math.floor(Math.random() * 20));
      return false;
    }
    if (neighbor === ElementId.Oil) {
      grid.set(nx, ny, ElementId.Fire);
      grid.setMeta(nx, ny, 50 + Math.floor(Math.random() * 20));
      return false;
    }
    if (neighbor === ElementId.Gas) {
      grid.set(nx, ny, ElementId.Fire);
      grid.setMeta(nx, ny, 30 + Math.floor(Math.random() * 30));
      return false;
    }
    if (neighbor === ElementId.Ice) {
      grid.set(nx, ny, ElementId.Water);
      grid.setMeta(nx, ny, 0);
      return false;
    }
  }

  // Lava interactions
  if (elem === ElementId.Lava) {
    if (neighbor === ElementId.Water) {
      grid.set(x, y, ElementId.Stone);
      grid.setMeta(x, y, 0);
      grid.set(nx, ny, ElementId.Steam);
      grid.setMeta(nx, ny, 150);
      return true;
    }
    if (neighbor === ElementId.Sand) {
      grid.set(nx, ny, ElementId.Glass);
      grid.setMeta(nx, ny, 0);
      return false;
    }
    if (neighbor === ElementId.Ice) {
      grid.set(nx, ny, ElementId.Water);
      grid.setMeta(nx, ny, 0);
      grid.set(x, y, ElementId.Stone);
      grid.setMeta(x, y, 0);
      return true;
    }
  }

  // Acid interactions
  if (elem === ElementId.Acid) {
    if (neighbor === ElementId.Wood || neighbor === ElementId.Metal) {
      grid.set(nx, ny, ElementId.Empty);
      grid.setMeta(nx, ny, 0);
      grid.set(x, y, ElementId.Empty);
      grid.setMeta(x, y, 0);
      return true;
    }
    if (neighbor === ElementId.Stone) {
      grid.set(x, y, ElementId.Empty);
      grid.setMeta(x, y, 0);
      grid.set(nx, ny, ElementId.Empty);
      grid.setMeta(nx, ny, 0);
      return true;
    }
  }

  // Electricity propagation
  if (elem === ElementId.Electricity) {
    if (neighbor === ElementId.Metal) {
      propagateElectricity(grid, nx, ny, 10, ElementId.Metal);
      return false;
    }
    if (neighbor === ElementId.Water) {
      propagateElectricity(grid, nx, ny, 5, ElementId.Water);
      return false;
    }
    if (neighbor === ElementId.Gas) {
      grid.set(nx, ny, ElementId.Fire);
      grid.setMeta(nx, ny, ELEMENTS[ElementId.Fire].defaultMeta);
      return false;
    }
  }

  // Water near ice (freezing spread) — probabilistic
  if (elem === ElementId.Water && neighbor === ElementId.Ice) {
    const heat = grid.getMeta(x, y);
    if (heat < 10 && Math.random() < 0.02) {
      grid.set(x, y, ElementId.Ice);
      grid.setMeta(x, y, 0);
      return true;
    }
  }

  return false;
}

/**
 * BFS propagation of electricity through a conductor material.
 * Converts metal to electricity; converts water to steam.
 */
function propagateElectricity(
  grid: Grid, startX: number, startY: number,
  maxCells: number, medium: ElementId
): void {
  const queue: [number, number][] = [[startX, startY]];
  const visited = new Set<number>();
  visited.add(startY * grid.width + startX);
  let count = 0;

  while (queue.length > 0 && count < maxCells) {
    const [cx, cy] = queue.shift()!;
    const current = grid.get(cx, cy);
    if (current !== medium) continue;

    if (medium === ElementId.Water) {
      grid.set(cx, cy, ElementId.Steam);
      grid.setMeta(cx, cy, ELEMENTS[ElementId.Steam].defaultMeta);
    } else {
      grid.set(cx, cy, ElementId.Electricity);
      grid.setMeta(cx, cy, ELEMENTS[ElementId.Electricity].defaultMeta);
    }
    count++;

    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]] as const) {
      const nx2 = cx + dx;
      const ny2 = cy + dy;
      if (!grid.inBounds(nx2, ny2)) continue;
      const key = ny2 * grid.width + nx2;
      if (visited.has(key)) continue;
      visited.add(key);
      if (grid.get(nx2, ny2) === medium) {
        queue.push([nx2, ny2]);
      }
    }
  }
}
