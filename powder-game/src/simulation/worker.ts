import { Grid } from './grid';
import { ELEMENTS } from './elements';
import { updateCell } from './physics';
import { processInteractions } from './interactions';
import type { ToWorkerMessage, FromWorkerMessage, InputCommand, WindCommand } from '../types';
import { ElementId } from '../types';

let grid: Grid | null = null;
let paused = false;
let frameCount = 0;
let gravityDir: 1 | -1 = 1;

// Only attach message handler when running as a worker (not during tests)
if (typeof self !== 'undefined' && typeof self.onmessage !== 'undefined') {
  self.onmessage = (e: MessageEvent<ToWorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
      case 'init':
        grid = new Grid(msg.width, msg.height);
        const ready: FromWorkerMessage = { type: 'ready' };
        self.postMessage(ready);
        break;

      case 'input':
        if (grid) applyInputs(grid, msg.commands);
        break;

      case 'wind':
        if (grid) applyWind(grid, msg.commands);
        break;

      case 'pause':
        paused = true;
        break;

      case 'resume':
        paused = false;
        break;

      case 'clear':
        if (grid) grid.clear();
        break;

      case 'setGravity':
        gravityDir = msg.dir;
        break;

      case 'tick':
        if (grid && !paused) {
          tick(grid, frameCount++, gravityDir);
        }
        if (grid) sendFrame(grid);
        break;
    }
  };
}

export function applyInputs(grid: Grid, commands: InputCommand[]): void {
  for (const cmd of commands) {
    const r = cmd.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cmd.x + dx;
        const py = cmd.y + dy;
        if (!grid.inBounds(px, py)) continue;

        if (cmd.erase) {
          grid.set(px, py, ElementId.Empty);
          grid.setMeta(px, py, 0);
        } else if (grid.get(px, py) === ElementId.Empty) {
          grid.set(px, py, cmd.element);
          grid.setMeta(px, py, ELEMENTS[cmd.element].defaultMeta);
        }
      }
    }
  }
}

export function applyWind(grid: Grid, commands: WindCommand[]): void {
  for (const cmd of commands) {
    const r = cmd.radius;
    // Normalize direction to get unit displacement
    const len = Math.sqrt(cmd.dx * cmd.dx + cmd.dy * cmd.dy);
    if (len === 0) continue;
    const ndx = cmd.dx / len;
    const ndy = cmd.dy / len;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cmd.x + dx;
        const py = cmd.y + dy;
        if (!grid.inBounds(px, py)) continue;

        const elem = grid.get(px, py);
        if (elem === ElementId.Empty) continue;

        const cat = ELEMENTS[elem].category;
        if (cat === 'static') continue;

        // Strength falls off with distance from center
        const dist = Math.sqrt(dx * dx + dy * dy);
        const strength = 1 - dist / (r + 1);

        // Try to move the particle in the wind direction (1-2 cells based on strength)
        const steps = Math.ceil(strength * 2);
        let cx = px;
        let cy = py;
        for (let s = 0; s < steps; s++) {
          const nx = cx + Math.round(ndx);
          const ny = cy + Math.round(ndy);
          if (!grid.inBounds(nx, ny)) break;
          if (grid.get(nx, ny) !== ElementId.Empty) break;
          grid.swap(cx, cy, nx, ny);
          cx = nx;
          cy = ny;
        }
      }
    }
  }
}

export function tick(grid: Grid, frame: number, gDir: 1 | -1 = 1): void {
  const leftToRight = frame % 2 === 0;

  // Process interactions first (transformations, heat)
  for (let y = grid.height - 1; y >= 0; y--) {
    if (leftToRight) {
      for (let x = 0; x < grid.width; x++) {
        processInteractions(grid, x, y);
      }
    } else {
      for (let x = grid.width - 1; x >= 0; x--) {
        processInteractions(grid, x, y);
      }
    }
  }

  // Scan order depends on gravity: process from the "bottom" (where things fall to)
  const yStart = gDir === 1 ? grid.height - 1 : 0;
  const yEnd = gDir === 1 ? -1 : grid.height;
  const yStep = gDir === 1 ? -1 : 1;

  for (let y = yStart; y !== yEnd; y += yStep) {
    if (leftToRight) {
      for (let x = 0; x < grid.width; x++) {
        updateCell(grid, x, y, leftToRight, gDir);
      }
    } else {
      for (let x = grid.width - 1; x >= 0; x--) {
        updateCell(grid, x, y, leftToRight, gDir);
      }
    }
  }
}

function sendFrame(grid: Grid): void {
  const elements = grid.copyElements();
  const metadata = grid.copyMetadata();
  const elemBuf = elements.buffer as ArrayBuffer;
  const metaBuf = metadata.buffer as ArrayBuffer;
  const msg: FromWorkerMessage = {
    type: 'frame',
    elements: elemBuf,
    metadata: metaBuf,
  };
  (self as unknown as Worker).postMessage(msg, [elemBuf, metaBuf]);
}
