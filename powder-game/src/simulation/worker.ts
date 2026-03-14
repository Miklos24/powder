import { Grid } from './grid';
import { ELEMENTS } from './elements';
import { updateCell } from './physics';
import { processInteractions } from './interactions';
import type { ToWorkerMessage, FromWorkerMessage, InputCommand } from '../types';
import { ElementId } from '../types';

let grid: Grid | null = null;
let paused = false;
let frameCount = 0;

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

      case 'pause':
        paused = true;
        break;

      case 'resume':
        paused = false;
        break;

      case 'clear':
        if (grid) grid.clear();
        break;

      case 'tick':
        if (grid && !paused) {
          tick(grid, frameCount++);
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

export function tick(grid: Grid, frame: number): void {
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

  // Then movement (bottom-to-top so falling works correctly)
  for (let y = grid.height - 1; y >= 0; y--) {
    if (leftToRight) {
      for (let x = 0; x < grid.width; x++) {
        updateCell(grid, x, y, leftToRight);
      }
    } else {
      for (let x = grid.width - 1; x >= 0; x--) {
        updateCell(grid, x, y, leftToRight);
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
