# Powder Game Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern falling-sand particle physics simulation (12 elements, WebGL rendering, Web Worker simulation) that runs on desktop and mobile.

**Architecture:** CPU-based simulation in a Web Worker communicates grid state to the main thread, which uploads it as a WebGL texture and renders a fullscreen quad. Input and UI live on the main thread. Adaptive grid sizing selects resolution based on device capability.

**Tech Stack:** TypeScript, Vite, WebGL, Web Workers, Vitest (for simulation logic tests)

**Spec:** `docs/superpowers/specs/2026-03-13-powder-game-design.md`

---

## File Structure

```
powder-game/
├── index.html                    # Single HTML page, canvas + UI containers
├── package.json                  # Vite + TypeScript + Vitest
├── tsconfig.json                 # Strict TS config
├── vite.config.ts                # Vite config with worker plugin + COOP/COEP headers
├── src/
│   ├── main.ts                   # Entry point: init renderer, worker, UI, game loop
│   ├── types.ts                  # Element IDs, grid types, message types, palette
│   ├── renderer.ts               # WebGL context, textures, draw calls
│   ├── shaders/
│   │   ├── quad.vert             # Fullscreen quad vertex shader
│   │   └── particle.frag         # Palette lookup, jitter, glow, alpha
│   ├── simulation/
│   │   ├── worker.ts             # Worker entry: message handling, tick loop
│   │   ├── grid.ts               # Grid class: alloc, get/set, neighbors, clear
│   │   ├── elements.ts           # Element property table (density, category, etc.)
│   │   ├── physics.ts            # Movement rules by category (powder, liquid, gas, energy)
│   │   └── interactions.ts       # Element transformation rules + heat propagation
│   ├── input.ts                  # Mouse/touch → grid coords, Bresenham interpolation
│   ├── ui.ts                     # Element picker, brush slider, controls, keyboard
│   └── adaptive.ts               # Benchmark, tier selection, pixel scale
└── tests/
    ├── grid.test.ts              # Grid data structure tests
    ├── physics.test.ts           # Movement rule tests
    └── interactions.test.ts      # Element interaction tests
```

---

## Chunk 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `powder-game/package.json`
- Create: `powder-game/tsconfig.json`
- Create: `powder-game/vite.config.ts`
- Create: `powder-game/index.html`

- [ ] **Step 1: Initialize project**

```bash
mkdir -p powder-game/src/simulation powder-game/src/shaders powder-game/tests
cd powder-game
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev typescript vite vitest
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable", "WebWorker"],
    "outDir": "dist",
    "rootDir": "src",
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2020',
  },
  test: {
    globals: true,
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Powder Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0d0d12; touch-action: none; }
    canvas#game { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create stub main.ts to verify build**

```typescript
// src/main.ts
console.log('Powder Game starting...');
```

- [ ] **Step 7: Verify dev server runs**

```bash
npx vite --open
```

Expected: Browser opens, console shows "Powder Game starting..."

- [ ] **Step 8: Commit**

```bash
git init
echo "node_modules/\ndist/" > .gitignore
git add .
git commit -m "feat: scaffold project with Vite + TypeScript"
```

---

### Task 2: Type Definitions & Element Properties

**Files:**
- Create: `powder-game/src/types.ts`
- Create: `powder-game/src/simulation/elements.ts`

- [ ] **Step 1: Create types.ts**

All shared type definitions. Element IDs as a const enum, category types, message protocol between main thread and worker, palette colors.

```typescript
// src/types.ts

export const enum ElementId {
  Empty = 0,
  Sand = 1,
  Water = 2,
  Fire = 3,
  Oil = 4,
  Wood = 5,
  Stone = 6,
  Metal = 7,
  Ice = 8,
  Acid = 9,
  Lava = 10,
  Gas = 11,
  Electricity = 12,
  Glass = 13,
  Steam = 14,
}

export const ELEMENT_COUNT = 15;

export type Category = 'empty' | 'powder' | 'liquid' | 'gas' | 'static' | 'energy';

export interface ElementDef {
  id: ElementId;
  name: string;
  category: Category;
  density: number;       // for liquid layering: higher = sinks
  opacity: number;       // 0.0-1.0
  color: [number, number, number]; // RGB 0-255
  glow: boolean;         // emissive in shader
  metadataType: 'heat' | 'age';
  defaultMeta: number;   // initial metadata value (e.g., lifetime for fire)
}

// Worker ← Main thread
export interface InputCommand {
  x: number;
  y: number;
  element: ElementId;
  radius: number;
  erase: boolean;
}

export interface ToWorkerMessage {
  type: 'init';
  width: number;
  height: number;
} | {
  type: 'input';
  commands: InputCommand[];
} | {
  type: 'pause' | 'resume' | 'clear' | 'tick';
}

// Worker → Main thread
export interface FromWorkerMessage {
  type: 'frame';
  elements: ArrayBuffer;  // Uint8Array of element IDs
  metadata: ArrayBuffer;  // Uint8Array of metadata values
} | {
  type: 'ready';
}
```

- [ ] **Step 2: Create elements.ts**

Element property table — the single source of truth for all element behaviors.

```typescript
// src/simulation/elements.ts
import { ElementId, type ElementDef } from '../types';

export const ELEMENTS: readonly ElementDef[] = [
  { id: ElementId.Empty,       name: 'Empty',       category: 'empty',  density: 0, opacity: 0,    color: [13, 13, 18],    glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Sand,        name: 'Sand',        category: 'powder', density: 3, opacity: 1.0,  color: [232, 213, 163], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Water,       name: 'Water',       category: 'liquid', density: 2, opacity: 0.7,  color: [126, 184, 216], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Fire,        name: 'Fire',        category: 'energy', density: 0, opacity: 0.9,  color: [240, 160, 138], glow: true,  metadataType: 'age',  defaultMeta: 60 },
  { id: ElementId.Oil,         name: 'Oil',         category: 'liquid', density: 1, opacity: 0.85, color: [196, 168, 122], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Wood,        name: 'Wood',        category: 'static', density: 5, opacity: 1.0,  color: [168, 196, 154], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Stone,       name: 'Stone',       category: 'static', density: 6, opacity: 1.0,  color: [176, 170, 176], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Metal,       name: 'Metal',       category: 'static', density: 7, opacity: 1.0,  color: [160, 184, 200], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Ice,         name: 'Ice',         category: 'static', density: 4, opacity: 0.75, color: [208, 232, 240], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Acid,        name: 'Acid',        category: 'liquid', density: 3, opacity: 0.65, color: [200, 240, 192], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Lava,        name: 'Lava',        category: 'liquid', density: 4, opacity: 0.9,  color: [240, 200, 152], glow: true,  metadataType: 'heat', defaultMeta: 200 },
  { id: ElementId.Gas,         name: 'Gas',         category: 'gas',    density: 0, opacity: 0.4,  color: [200, 208, 232], glow: false, metadataType: 'age',  defaultMeta: 200 },
  { id: ElementId.Electricity, name: 'Electricity', category: 'energy', density: 0, opacity: 0.8,  color: [240, 232, 160], glow: true,  metadataType: 'age',  defaultMeta: 3 },
  { id: ElementId.Glass,       name: 'Glass',       category: 'static', density: 5, opacity: 0.6,  color: [192, 216, 224], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Steam,       name: 'Steam',       category: 'gas',    density: 0, opacity: 0.4,  color: [208, 208, 216], glow: false, metadataType: 'age',  defaultMeta: 150 },
];

export function getElement(id: ElementId): ElementDef {
  return ELEMENTS[id];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/simulation/elements.ts
git commit -m "feat: add type definitions and element property table"
```

---

### Task 3: Grid Data Structure

**Files:**
- Create: `powder-game/src/simulation/grid.ts`
- Create: `powder-game/tests/grid.test.ts`

- [ ] **Step 1: Write failing grid tests**

```typescript
// tests/grid.test.ts
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
    grid.set(-1, 0, ElementId.Sand); // should not throw
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
    expect(elemBuf.byteLength).toBe(12); // 4*3
    expect(metaBuf.byteLength).toBe(12);
    expect(new Uint8Array(elemBuf)[0]).toBe(ElementId.Sand);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/grid.test.ts
```

Expected: FAIL — `../src/simulation/grid` does not exist.

- [ ] **Step 3: Implement Grid class**

```typescript
// src/simulation/grid.ts
import { ElementId } from '../types';

export class Grid {
  readonly width: number;
  readonly height: number;
  private elements: Uint8Array;
  private metadata: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.elements = new Uint8Array(width * height);
    this.metadata = new Uint8Array(width * height);
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): ElementId {
    if (!this.inBounds(x, y)) return ElementId.Empty;
    return this.elements[this.index(x, y)] as ElementId;
  }

  set(x: number, y: number, element: ElementId): void {
    if (!this.inBounds(x, y)) return;
    this.elements[this.index(x, y)] = element;
  }

  getMeta(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.metadata[this.index(x, y)];
  }

  setMeta(x: number, y: number, value: number): void {
    if (!this.inBounds(x, y)) return;
    this.metadata[this.index(x, y)] = value;
  }

  swap(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) return;
    const i1 = this.index(x1, y1);
    const i2 = this.index(x2, y2);
    const tmpElem = this.elements[i1];
    this.elements[i1] = this.elements[i2];
    this.elements[i2] = tmpElem;
    const tmpMeta = this.metadata[i1];
    this.metadata[i1] = this.metadata[i2];
    this.metadata[i2] = tmpMeta;
  }

  clear(): void {
    this.elements.fill(0);
    this.metadata.fill(0);
  }

  get elementBuffer(): ArrayBuffer {
    return this.elements.buffer;
  }

  get metadataBuffer(): ArrayBuffer {
    return this.metadata.buffer;
  }

  /** Create a copy of the element array for transfer */
  copyElements(): Uint8Array {
    return new Uint8Array(this.elements);
  }

  /** Create a copy of the metadata array for transfer */
  copyMetadata(): Uint8Array {
    return new Uint8Array(this.metadata);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/grid.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/grid.ts tests/grid.test.ts
git commit -m "feat: add Grid data structure with tests"
```

---

## Chunk 2: Simulation Engine

### Task 4: Physics — Movement Rules

**Files:**
- Create: `powder-game/src/simulation/physics.ts`
- Create: `powder-game/tests/physics.test.ts`

Movement logic for each element category. Pure functions that operate on a Grid — no worker concerns.

- [ ] **Step 1: Write failing physics tests**

```typescript
// tests/physics.test.ts
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
    // Should have moved to (1,2) or (3,2)
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

  it('water flows sideways when blocked below', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 1, ElementId.Water);
    grid.set(2, 2, ElementId.Stone);
    updateCell(grid, 2, 1, false);
    const movedLeft = grid.get(1, 1) === ElementId.Water;
    const movedRight = grid.get(3, 1) === ElementId.Water;
    expect(movedLeft || movedRight).toBe(true);
  });

  it('oil floats above water (density swap)', () => {
    const grid = new Grid(5, 5);
    // Oil on top, water below — oil should try to fall, but it's less dense
    // Actually: oil falls into empty, but if oil is above water, nothing happens
    // The swap happens when oil is BELOW water: water sinks, oil rises
    grid.set(2, 1, ElementId.Water); // water on top
    grid.set(2, 2, ElementId.Oil);   // oil below — oil is lighter, should swap up
    updateCell(grid, 2, 2, false);   // update oil cell
    // Oil can't fall (at bottom or blocked), but doesn't swap up on its own
    // Water falling into oil triggers the density check
    updateCell(grid, 2, 1, false);   // update water — it's denser, should swap with oil
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
    grid.setMeta(2, 3, 1); // about to expire
    updateCell(grid, 2, 3, false);
    // Gas should be gone (age decremented to 0)
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
    // Fire should have moved up and meta decremented
    expect(grid.get(2, 2)).toBe(ElementId.Fire);
    expect(grid.getMeta(2, 2)).toBeLessThan(30);
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/physics.test.ts
```

Expected: FAIL — `updateCell` not found.

- [ ] **Step 3: Implement physics.ts**

```typescript
// src/simulation/physics.ts
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
    case 'static': break; // static elements don't move
  }
}

function updatePowder(grid: Grid, x: number, y: number): void {
  // Try: down, diagonal-down-left, diagonal-down-right (randomize diagonal order)
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

  // Try falling down — into empty or into lighter liquid
  if (tryMoveOrDensitySwap(grid, x, y, x, y + 1, elemDensity)) return;

  // Try diagonal down
  const tryLeftFirst = Math.random() < 0.5;
  if (tryLeftFirst) {
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + 1, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + 1, elemDensity)) return;
  } else {
    if (tryMoveOrDensitySwap(grid, x, y, x + 1, y + 1, elemDensity)) return;
    if (tryMoveOrDensitySwap(grid, x, y, x - 1, y + 1, elemDensity)) return;
  }

  // Flow sideways (alternate direction per scan to avoid bias)
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

  // Age-based dissipation
  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  // Rise upward, drift sideways randomly
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

  // Age-based death
  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  // Set heat on neighbors
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

  // Rise upward with random drift
  const drift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  if (tryMove(grid, x, y, x + drift, y - 1)) return;
  if (drift !== 0 && tryMove(grid, x, y, x, y - 1)) return;
}

function updateElectricity(grid: Grid, x: number, y: number): void {
  const meta = grid.getMeta(x, y);

  // Age-based death (very short lived)
  if (meta <= 1) {
    grid.set(x, y, ElementId.Empty);
    grid.setMeta(x, y, 0);
    return;
  }
  grid.setMeta(x, y, meta - 1);

  // Propagation is handled in interactions.ts (needs neighbor context)
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
  // Density swap: heavier liquid sinks below lighter
  const targetDef = ELEMENTS[target];
  if (targetDef.category === 'liquid' && targetDef.density < density) {
    grid.swap(x, y, nx, ny);
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/physics.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/physics.ts tests/physics.test.ts
git commit -m "feat: add physics movement rules with tests"
```

---

### Task 5: Interactions — Element Transformations

**Files:**
- Create: `powder-game/src/simulation/interactions.ts`
- Create: `powder-game/tests/interactions.test.ts`

- [ ] **Step 1: Write failing interaction tests**

```typescript
// tests/interactions.test.ts
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
    // Acid consumed too
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
    grid.setMeta(2, 2, 210); // above 200 threshold
    processInteractions(grid, 2, 2);
    expect(grid.get(2, 2)).toBe(ElementId.Glass);
  });

  it('ice melts at heat threshold', () => {
    const grid = new Grid(5, 5);
    grid.set(2, 2, ElementId.Ice);
    grid.setMeta(2, 2, 60); // above 50 threshold
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
    // Should have spawned electricity on adjacent metal
    expect(grid.get(3, 2)).toBe(ElementId.Electricity);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/interactions.test.ts
```

Expected: FAIL — `processInteractions` not found.

- [ ] **Step 3: Implement interactions.ts**

```typescript
// src/simulation/interactions.ts
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
      if (reacted) return; // element was consumed/transformed
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
      return false; // fire source stays
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
      return true; // lava consumed
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
      return true; // acid consumed
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
      // Propagate up to 10 cells along connected metal in one tick
      propagateElectricity(grid, nx, ny, 10, ElementId.Metal);
      return false;
    }
    if (neighbor === ElementId.Water) {
      // Wider spread through water (up to 5 cells), converts water to steam
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

    // Check all 4 cardinal neighbors for more conductor
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/interactions.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/interactions.ts tests/interactions.test.ts
git commit -m "feat: add element interaction rules with tests"
```

---

### Task 6: Worker Entry Point & Tick Loop

**Files:**
- Create: `powder-game/src/simulation/worker.ts`
- Create: `powder-game/tests/worker.test.ts`

The worker owns the Grid, runs the tick loop, applies input commands, and sends frame data back.

Note: The `applyInputs` and `tick` functions are exported for testability. The worker message handler (`self.onmessage`) is not unit-tested (requires Worker environment) — it's covered by integration testing in Task 12.

Cross-task dependency: The fire→sand→glass transformation works across physics.ts (fire raises heat on neighbors via `updateFire`) and interactions.ts (sand transforms at heat > 200). This is verified in the integration test checklist (Task 12).

- [ ] **Step 1: Write failing worker logic tests**

```typescript
// tests/worker.test.ts
import { describe, it, expect } from 'vitest';
import { Grid } from '../src/simulation/grid';
import { ElementId } from '../src/types';
import { applyInputs, tick } from '../src/simulation/worker';

describe('applyInputs', () => {
  it('places element in empty cells within brush radius', () => {
    const grid = new Grid(10, 10);
    applyInputs(grid, [{ x: 5, y: 5, element: ElementId.Sand, radius: 1, erase: false }]);
    expect(grid.get(5, 5)).toBe(ElementId.Sand);
    expect(grid.get(5, 4)).toBe(ElementId.Sand); // within radius
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
    // Place sand at top — after tick it should fall
    grid.set(2, 0, ElementId.Sand);
    tick(grid, 0); // frame 0: left-to-right
    expect(grid.get(2, 1)).toBe(ElementId.Sand);

    grid.set(3, 0, ElementId.Sand);
    tick(grid, 1); // frame 1: right-to-left
    expect(grid.get(3, 1)).toBe(ElementId.Sand);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/worker.test.ts
```

Expected: FAIL — `applyInputs` and `tick` not found.

- [ ] **Step 3: Implement worker.ts**

```typescript
// src/simulation/worker.ts
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
        if (dx * dx + dy * dy > r * r) continue; // circular brush
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
  const msg: FromWorkerMessage = {
    type: 'frame',
    elements: elements.buffer,
    metadata: metadata.buffer,
  };
  self.postMessage(msg, [elements.buffer, metadata.buffer]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/worker.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/worker.ts tests/worker.test.ts
git commit -m "feat: add simulation worker with tick loop and input handling"
```

---

## Chunk 3: Rendering, UI & Integration

### Task 7: WebGL Renderer & Shaders

**Files:**
- Create: `powder-game/src/renderer.ts`
- Create: `powder-game/src/shaders/quad.vert`
- Create: `powder-game/src/shaders/particle.frag`

- [ ] **Step 1: Create vertex shader**

```glsl
// src/shaders/quad.vert
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  v_texCoord.y = 1.0 - v_texCoord.y; // flip Y for grid coordinates
  gl_Position = vec4(a_position, 0.0, 1.0);
}
```

- [ ] **Step 2: Create fragment shader**

```glsl
// src/shaders/particle.frag
precision mediump float;

varying vec2 v_texCoord;

uniform sampler2D u_elements;    // R8: element IDs
uniform sampler2D u_metadata;    // R8: heat/age values
uniform sampler2D u_palette;     // 1D RGBA palette (ELEMENT_COUNT x 1)
uniform vec2 u_gridSize;         // grid width, height
uniform float u_time;            // for animation

// Simple hash for per-pixel jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Sample element ID
  float elemId = texture2D(u_elements, v_texCoord).r * 255.0;
  float meta = texture2D(u_metadata, v_texCoord).r * 255.0;

  // Empty cell → background
  if (elemId < 0.5) {
    gl_FragColor = vec4(13.0/255.0, 13.0/255.0, 18.0/255.0, 1.0);
    return;
  }

  // Look up palette color (normalize elemId to 0-1 range for texture lookup)
  float paletteU = (elemId + 0.5) / 16.0; // 16 slots in palette texture
  vec4 color = texture2D(u_palette, vec2(paletteU, 0.5));

  // Per-pixel color jitter (±10%)
  vec2 gridPos = v_texCoord * u_gridSize;
  float jitter = hash(floor(gridPos)) * 0.2 - 0.1; // -0.1 to +0.1
  color.rgb += jitter;

  // Glow effect for fire (3), lava (10), electricity (12)
  bool isGlowy = elemId > 2.5 && elemId < 3.5;       // fire
  isGlowy = isGlowy || (elemId > 9.5 && elemId < 10.5); // lava
  isGlowy = isGlowy || (elemId > 11.5 && elemId < 12.5); // electricity

  if (isGlowy) {
    float glowIntensity = meta / 255.0;
    color.rgb += glowIntensity * 0.3;

    // Animated flicker for fire
    if (elemId > 2.5 && elemId < 3.5) {
      float flicker = hash(floor(gridPos) + vec2(u_time * 10.0, 0.0)) * 0.15;
      color.rgb += flicker;
    }
  }

  color.rgb = clamp(color.rgb, 0.0, 1.0);
  gl_FragColor = color;
}
```

- [ ] **Step 3: Implement renderer.ts**

```typescript
// src/renderer.ts
import { ELEMENT_COUNT } from './types';
import { ELEMENTS } from './simulation/elements';
import quadVertSrc from './shaders/quad.vert?raw';
import particleFragSrc from './shaders/particle.frag?raw';

export class Renderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private elementTex: WebGLTexture;
  private metadataTex: WebGLTexture;
  private paletteTex: WebGLTexture;
  private gridWidth: number;
  private gridHeight: number;

  // Uniform locations
  private uElements: WebGLUniformLocation;
  private uMetadata: WebGLUniformLocation;
  private uPalette: WebGLUniformLocation;
  private uGridSize: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Compile shaders
    const vert = this.compileShader(gl.VERTEX_SHADER, quadVertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, particleFragSrc);
    this.program = this.createProgram(vert, frag);
    gl.useProgram(this.program);

    // Fullscreen quad geometry
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Create textures
    this.elementTex = this.createGridTexture();
    this.metadataTex = this.createGridTexture();
    this.paletteTex = this.createPaletteTexture();

    // Get uniform locations
    this.uElements = gl.getUniformLocation(this.program, 'u_elements')!;
    this.uMetadata = gl.getUniformLocation(this.program, 'u_metadata')!;
    this.uPalette = gl.getUniformLocation(this.program, 'u_palette')!;
    this.uGridSize = gl.getUniformLocation(this.program, 'u_gridSize')!;
    this.uTime = gl.getUniformLocation(this.program, 'u_time')!;

    // Bind texture units
    gl.uniform1i(this.uElements, 0);
    gl.uniform1i(this.uMetadata, 1);
    gl.uniform1i(this.uPalette, 2);
    gl.uniform2f(this.uGridSize, gridWidth, gridHeight);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  draw(elements: Uint8Array, metadata: Uint8Array, time: number): void {
    const gl = this.gl;

    // Upload element grid
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.elementTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      this.gridWidth, this.gridHeight, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, elements
    );

    // Upload metadata grid
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.metadataTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      this.gridWidth, this.gridHeight, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, metadata
    );

    // Palette is static, already bound to TEXTURE2

    gl.uniform1f(this.uTime, time);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.gl.canvas.width = canvasWidth;
    this.gl.canvas.height = canvasHeight;
    this.gl.viewport(0, 0, canvasWidth, canvasHeight);
  }

  private createGridTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createPaletteTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    // 16 pixels wide (padded), 1 pixel tall, RGBA
    const data = new Uint8Array(16 * 4);
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const elem = ELEMENTS[i];
      data[i * 4 + 0] = elem.color[0];
      data[i * 4 + 1] = elem.color[1];
      data[i * 4 + 2] = elem.color[2];
      data[i * 4 + 3] = Math.round(elem.opacity * 255);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      16, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data
    );
    return tex;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  private createProgram(vert: WebGLShader, frag: WebGLShader): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }
    return program;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer.ts src/shaders/quad.vert src/shaders/particle.frag
git commit -m "feat: add WebGL renderer with palette, jitter, and glow shaders"
```

---

### Task 8: Input Handling

**Files:**
- Create: `powder-game/src/input.ts`

- [ ] **Step 1: Implement input.ts**

Mouse/touch → grid coordinate mapping, Bresenham interpolation, input batching.

```typescript
// src/input.ts
import type { InputCommand } from './types';
import { ElementId } from './types';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private gridWidth: number;
  private gridHeight: number;
  private pendingCommands: InputCommand[] = [];
  private lastPos: { x: number; y: number } | null = null;
  private drawing = false;
  private erasing = false;

  selectedElement: ElementId = ElementId.Sand;
  brushRadius: number = 2;
  eraserMode: boolean = false; // toggled by UI eraser button / E key

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.canvas = canvas;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // Mouse events
    canvas.addEventListener('mousedown', (e) => this.onPointerDown(e.clientX, e.clientY, e.button === 2));
    canvas.addEventListener('mousemove', (e) => this.onPointerMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseup', () => this.onPointerUp());
    canvas.addEventListener('mouseleave', () => this.onPointerUp());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.brushRadius = Math.max(1, Math.min(20, this.brushRadius + (e.deltaY > 0 ? -1 : 1)));
    }, { passive: false });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.onPointerDown(t.clientX, t.clientY, false);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.onPointerMove(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });
  }

  /** Drain pending commands (called once per frame) */
  flush(): InputCommand[] {
    const cmds = this.pendingCommands;
    this.pendingCommands = [];
    return cmds;
  }

  private toGridCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.gridWidth);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.gridHeight);
    return { x, y };
  }

  private onPointerDown(clientX: number, clientY: number, rightButton: boolean): void {
    this.drawing = true;
    this.erasing = rightButton || this.eraserMode;
    const pos = this.toGridCoords(clientX, clientY);
    this.lastPos = pos;
    this.addCommand(pos.x, pos.y);
  }

  private onPointerMove(clientX: number, clientY: number): void {
    if (!this.drawing) return;
    const pos = this.toGridCoords(clientX, clientY);

    if (this.lastPos) {
      // Bresenham interpolation
      this.bresenham(this.lastPos.x, this.lastPos.y, pos.x, pos.y);
    } else {
      this.addCommand(pos.x, pos.y);
    }
    this.lastPos = pos;
  }

  private onPointerUp(): void {
    this.drawing = false;
    this.erasing = false;
    this.lastPos = null;
  }

  private addCommand(x: number, y: number): void {
    this.pendingCommands.push({
      x, y,
      element: this.selectedElement,
      radius: this.brushRadius,
      erase: this.erasing,
    });
  }

  private bresenham(x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.addCommand(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/input.ts
git commit -m "feat: add input handler with mouse/touch and Bresenham interpolation"
```

---

### Task 9: UI — Element Picker & Controls

**Files:**
- Create: `powder-game/src/ui.ts`
- Modify: `powder-game/index.html` (add UI container markup)

- [ ] **Step 1: Implement ui.ts**

Builds the element picker and control toolbar. Desktop: floating overlays. Mobile: bottom bar. Detects via viewport width.

```typescript
// src/ui.ts
import { ElementId, ELEMENT_COUNT } from './types';
import { ELEMENTS } from './simulation/elements';
import { InputHandler } from './input';

// Placeable elements (exclude Empty, Glass, Steam — those are derived)
const PLACEABLE: ElementId[] = [
  ElementId.Sand, ElementId.Water, ElementId.Fire, ElementId.Oil,
  ElementId.Wood, ElementId.Stone, ElementId.Metal, ElementId.Ice,
  ElementId.Acid, ElementId.Lava, ElementId.Gas, ElementId.Electricity,
];

export class UI {
  private container: HTMLElement;
  private input: InputHandler;
  private onPause: () => void;
  private onResume: () => void;
  private onClear: () => void;
  private paused = false;
  private eraserActive = false;

  constructor(
    container: HTMLElement,
    input: InputHandler,
    callbacks: { onPause: () => void; onResume: () => void; onClear: () => void }
  ) {
    this.container = container;
    this.input = input;
    this.onPause = callbacks.onPause;
    this.onResume = callbacks.onResume;
    this.onClear = callbacks.onClear;

    this.build();
    this.setupKeyboard();
  }

  private build(): void {
    const isMobile = window.innerWidth < 768;
    this.container.innerHTML = '';

    if (isMobile) {
      this.buildMobile();
    } else {
      this.buildDesktop();
    }
  }

  private buildDesktop(): void {
    // Element picker — top-left
    const picker = document.createElement('div');
    picker.className = 'pg-picker';
    picker.style.cssText = 'position:fixed;top:12px;left:12px;display:flex;gap:6px;flex-wrap:wrap;max-width:280px;padding:8px;background:rgba(26,26,36,0.8);border-radius:10px;z-index:10;';

    for (const id of PLACEABLE) {
      picker.appendChild(this.createElementButton(id));
    }
    // Eraser button
    picker.appendChild(this.createEraserButton());
    this.container.appendChild(picker);

    // Controls — top-right
    const controls = document.createElement('div');
    controls.className = 'pg-controls';
    controls.style.cssText = 'position:fixed;top:12px;right:12px;display:flex;gap:8px;align-items:center;padding:8px;background:rgba(26,26,36,0.8);border-radius:10px;z-index:10;';

    controls.appendChild(this.createBrushSlider());
    controls.appendChild(this.createPauseButton());
    controls.appendChild(this.createClearButton());
    this.container.appendChild(controls);

    // FPS display — bottom-left
    const fps = document.createElement('div');
    fps.id = 'pg-fps';
    fps.style.cssText = 'position:fixed;bottom:8px;left:12px;color:#444;font-size:11px;font-family:monospace;z-index:10;';
    this.container.appendChild(fps);
  }

  private buildMobile(): void {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#12121a;border-top:1px solid #1a1a24;padding:8px;z-index:10;';

    // Element row (scrollable)
    const elemRow = document.createElement('div');
    elemRow.style.cssText = 'display:flex;gap:4px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #1a1a24;';
    for (const id of PLACEABLE) {
      elemRow.appendChild(this.createElementButton(id, 28));
    }
    elemRow.appendChild(this.createEraserButton(28));
    toolbar.appendChild(elemRow);

    // Controls row
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;';
    ctrlRow.appendChild(this.createBrushSlider());
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:6px;';
    btnGroup.appendChild(this.createPauseButton());
    btnGroup.appendChild(this.createClearButton());
    ctrlRow.appendChild(btnGroup);
    toolbar.appendChild(ctrlRow);

    this.container.appendChild(toolbar);
  }

  private createElementButton(id: ElementId, size = 32): HTMLElement {
    const elem = ELEMENTS[id];
    const btn = document.createElement('div');
    btn.style.cssText = `width:${size}px;height:${size}px;border-radius:6px;cursor:pointer;flex-shrink:0;border:2px solid transparent;background:rgb(${elem.color.join(',')});opacity:${elem.opacity};`;
    if (this.input.selectedElement === id && !this.eraserActive) {
      btn.style.borderColor = '#fff';
    }
    btn.title = elem.name;
    btn.addEventListener('click', () => {
      this.eraserActive = false;
      this.input.eraserMode = false;
      this.input.selectedElement = id;
      this.refreshSelection();
    });
    btn.dataset.elemId = String(id);
    return btn;
  }

  private createEraserButton(size = 32): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'pg-eraser-btn';
    btn.style.cssText = `width:${size}px;height:${size}px;border-radius:6px;cursor:pointer;flex-shrink:0;border:2px solid ${this.eraserActive ? '#fff' : 'transparent'};background:#2a2a34;display:flex;align-items:center;justify-content:center;color:#888;font-size:${size > 28 ? 14 : 11}px;`;
    btn.textContent = 'E';
    btn.title = 'Eraser';
    btn.addEventListener('click', () => {
      this.eraserActive = !this.eraserActive;
      this.input.eraserMode = this.eraserActive;
      this.refreshSelection();
    });
    return btn;
  }

  private createBrushSlider(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;max-width:160px;';
    const small = document.createElement('div');
    small.style.cssText = 'width:6px;height:6px;border-radius:50%;border:1.5px solid #666;flex-shrink:0;';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = String(this.input.brushRadius);
    slider.style.cssText = 'flex:1;accent-color:#666;';
    slider.addEventListener('input', () => {
      this.input.brushRadius = Number(slider.value);
    });
    const big = document.createElement('div');
    big.style.cssText = 'width:14px;height:14px;border-radius:50%;border:1.5px solid #666;flex-shrink:0;';
    wrapper.append(small, slider, big);
    return wrapper;
  }

  private createPauseButton(): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'pg-pause-btn';
    btn.style.cssText = 'background:#1a1a24;border-radius:8px;padding:8px 10px;cursor:pointer;color:#888;font-size:12px;user-select:none;';
    btn.textContent = '\u23F8';
    btn.addEventListener('click', () => {
      this.paused = !this.paused;
      btn.textContent = this.paused ? '\u25B6' : '\u23F8';
      if (this.paused) this.onPause();
      else this.onResume();
    });
    return btn;
  }

  private createClearButton(): HTMLElement {
    const btn = document.createElement('div');
    btn.style.cssText = 'background:#1a1a24;border-radius:8px;padding:8px 10px;cursor:pointer;color:#888;font-size:12px;user-select:none;';
    btn.textContent = '\u2715';
    btn.addEventListener('click', () => this.onClear());
    return btn;
  }

  private refreshSelection(): void {
    // Update all element buttons
    const buttons = this.container.querySelectorAll<HTMLElement>('[data-elem-id]');
    buttons.forEach((btn) => {
      const id = Number(btn.dataset.elemId) as ElementId;
      btn.style.borderColor = (id === this.input.selectedElement && !this.eraserActive) ? '#fff' : 'transparent';
    });
    // Update eraser
    const eraserBtns = this.container.querySelectorAll<HTMLElement>('.pg-eraser-btn');
    eraserBtns.forEach((btn) => {
      btn.style.borderColor = this.eraserActive ? '#fff' : 'transparent';
    });
  }

  updateFPS(fps: number, particleCount: number): void {
    const el = document.getElementById('pg-fps');
    if (el) el.textContent = `${fps} fps \u00B7 ${particleCount.toLocaleString()} particles`;
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      // 1-9, 0 select elements 1-10
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < PLACEABLE.length) {
          this.eraserActive = false;
          this.input.selectedElement = PLACEABLE[idx];
          this.refreshSelection();
        }
        return;
      }
      if (e.key === '0' && PLACEABLE.length >= 10) {
        this.eraserActive = false;
        this.input.selectedElement = PLACEABLE[9];
        this.refreshSelection();
        return;
      }
      if (e.key === '-' && PLACEABLE.length >= 11) {
        this.eraserActive = false;
        this.input.selectedElement = PLACEABLE[10];
        this.refreshSelection();
        return;
      }
      if (e.key === '=' && PLACEABLE.length >= 12) {
        this.eraserActive = false;
        this.input.selectedElement = PLACEABLE[11];
        this.refreshSelection();
        return;
      }
      if (e.key === '[') {
        this.input.brushRadius = Math.max(1, this.input.brushRadius - 1);
        return;
      }
      if (e.key === ']') {
        this.input.brushRadius = Math.min(20, this.input.brushRadius + 1);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        const pauseBtn = this.container.querySelector<HTMLElement>('.pg-pause-btn');
        if (pauseBtn) pauseBtn.click();
        return;
      }
      if (e.key.toLowerCase() === 'e') {
        this.eraserActive = !this.eraserActive;
        this.input.eraserMode = this.eraserActive;
        this.refreshSelection();
        return;
      }
      if (e.key.toLowerCase() === 'c') {
        this.onClear();
        return;
      }
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui.ts
git commit -m "feat: add UI with element picker, controls, and keyboard shortcuts"
```

---

### Task 10: Adaptive Grid Detection

**Files:**
- Create: `powder-game/src/adaptive.ts`

- [ ] **Step 1: Implement adaptive.ts**

```typescript
// src/adaptive.ts

export interface GridTier {
  width: number;
  height: number;
  pixelScale: number;
  targetFps: number;
}

const TIERS: GridTier[] = [
  { width: 400, height: 300, pixelScale: 3, targetFps: 60 },  // desktop
  { width: 300, height: 200, pixelScale: 3, targetFps: 60 },  // tablet
  { width: 200, height: 150, pixelScale: 2, targetFps: 60 },  // mobile
  { width: 160, height: 120, pixelScale: 2, targetFps: 30 },  // low-end
];

/**
 * Select grid tier via quick simulation benchmark.
 * Runs a few frames of physics on a test grid to measure actual device perf.
 * Falls back to viewport heuristics if benchmark is inconclusive.
 */
export function selectTier(): GridTier {
  // Try benchmark: simulate a few frames at the largest tier
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t];
    const testSize = tier.width * tier.height;
    const testGrid = new Uint8Array(testSize);
    // Fill ~30% with particles to simulate realistic load
    for (let i = 0; i < testSize * 0.3; i++) {
      testGrid[Math.floor(Math.random() * testSize)] = 1;
    }

    // Time 3 simulation-like passes
    const start = performance.now();
    for (let frame = 0; frame < 3; frame++) {
      for (let i = testSize - 1; i >= 0; i--) {
        if (testGrid[i] !== 0 && i + tier.width < testSize && testGrid[i + tier.width] === 0) {
          testGrid[i + tier.width] = testGrid[i];
          testGrid[i] = 0;
        }
      }
    }
    const elapsed = performance.now() - start;
    const avgFrameMs = elapsed / 3;

    // If avg frame time < 16ms, this tier is viable
    if (avgFrameMs < 16) {
      return tier;
    }
  }

  // Fallback: smallest tier
  return TIERS[TIERS.length - 1];
}

/**
 * Calculate canvas dimensions in CSS pixels to maintain grid aspect ratio.
 */
export function calculateCanvasSize(tier: GridTier): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gridAspect = tier.width / tier.height;
  const viewAspect = vw / vh;

  // Fill viewport while maintaining aspect ratio
  if (viewAspect > gridAspect) {
    // Viewport is wider — fit to height
    return { width: vh * gridAspect, height: vh };
  } else {
    // Viewport is taller — fit to width
    return { width: vw, height: vw / gridAspect };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adaptive.ts
git commit -m "feat: add adaptive grid tier selection"
```

---

### Task 11: Main Entry Point — Wire Everything Together

**Files:**
- Modify: `powder-game/src/main.ts`

- [ ] **Step 1: Implement main.ts**

```typescript
// src/main.ts
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { UI } from './ui';
import { selectTier, calculateCanvasSize } from './adaptive';
import type { FromWorkerMessage, ToWorkerMessage } from './types';

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiContainer = document.getElementById('ui')!;

  // Select grid tier
  const tier = selectTier();
  const { width: gridWidth, height: gridHeight } = tier;
  console.log(`Grid tier: ${gridWidth}x${gridHeight}`);

  // Size canvas
  const canvasSize = calculateCanvasSize(tier);
  canvas.style.width = `${canvasSize.width}px`;
  canvas.style.height = `${canvasSize.height}px`;

  // Init renderer (sets canvas pixel dimensions)
  const dpr = window.devicePixelRatio || 1;
  const renderer = new Renderer(canvas, gridWidth, gridHeight);
  renderer.resize(canvasSize.width * dpr, canvasSize.height * dpr);

  // Init input handler
  const input = new InputHandler(canvas, gridWidth, gridHeight);

  // Start simulation worker
  const worker = new Worker(
    new URL('./simulation/worker.ts', import.meta.url),
    { type: 'module' }
  );

  // Wait for worker ready
  await new Promise<void>((resolve) => {
    worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
      if (e.data.type === 'ready') resolve();
    };
    const initMsg: ToWorkerMessage = { type: 'init', width: gridWidth, height: gridHeight };
    worker.postMessage(initMsg);
  });

  // UI setup
  const ui = new UI(uiContainer, input, {
    onPause: () => worker.postMessage({ type: 'pause' } as ToWorkerMessage),
    onResume: () => worker.postMessage({ type: 'resume' } as ToWorkerMessage),
    onClear: () => worker.postMessage({ type: 'clear' } as ToWorkerMessage),
  });

  // Frame tracking
  let frameCount = 0;
  let fpsDisplay = 0;
  let lastFpsUpdate = performance.now();
  let lastFrameTime = performance.now();
  let slowFrames = 0;       // consecutive frames > 20ms
  let skipSimulation = false; // performance guardrail

  // Game loop
  worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
    if (e.data.type !== 'frame') return;

    const elements = new Uint8Array(e.data.elements);
    const metadata = new Uint8Array(e.data.metadata);

    // Render
    const now = performance.now();
    renderer.draw(elements, metadata, now / 1000);

    // Performance guardrail: track frame time
    const frameTime = now - lastFrameTime;
    lastFrameTime = now;
    if (frameTime > 20) {
      slowFrames++;
      if (slowFrames >= 10) skipSimulation = true; // throttle sim
    } else {
      slowFrames = 0;
      skipSimulation = false;
    }

    // FPS counter
    frameCount++;
    if (now - lastFpsUpdate >= 1000) {
      fpsDisplay = frameCount;
      frameCount = 0;
      lastFpsUpdate = now;
      // Count non-empty particles
      let count = 0;
      for (let i = 0; i < elements.length; i++) {
        if (elements[i] !== 0) count++;
      }
      ui.updateFPS(fpsDisplay, count);
    }
  };

  // Main loop: send input + request tick
  let loopCount = 0;
  function loop(): void {
    // Flush input commands to worker
    const commands = input.flush();
    if (commands.length > 0) {
      worker.postMessage({ type: 'input', commands } as ToWorkerMessage);
    }

    // Request simulation tick (skip every other frame if throttled)
    if (!skipSimulation || loopCount % 2 === 0) {
      worker.postMessage({ type: 'tick' } as ToWorkerMessage);
    }
    loopCount++;

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Handle resize
  window.addEventListener('resize', () => {
    const newSize = calculateCanvasSize(tier);
    canvas.style.width = `${newSize.width}px`;
    canvas.style.height = `${newSize.height}px`;
    const dpr = window.devicePixelRatio || 1;
    renderer.resize(newSize.width * dpr, newSize.height * dpr);
  });
}

init().catch(console.error);
```

- [ ] **Step 2: Verify the app runs**

```bash
npx vite
```

Open browser. Expected: dark canvas, element picker top-left, controls top-right. Drawing sand should show pastel particles falling.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up main entry point with game loop"
```

---

### Task 12: Integration Smoke Test & Polish

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```

Expected: All tests in grid, physics, interactions pass.

- [ ] **Step 2: Manual integration test checklist**

Run `npx vite` and verify in browser:

- [ ] Sand falls and piles up
- [ ] Water flows and pools
- [ ] Oil floats on water
- [ ] Fire burns wood and oil
- [ ] Lava + water → stone + steam
- [ ] Acid dissolves wood and metal
- [ ] Electricity propagates through metal
- [ ] Gas rises and dissipates
- [ ] Ice melts near fire
- [ ] Brush size slider works
- [ ] Keyboard shortcuts (1-9, space, e, c, [ ]) work
- [ ] Right-click erases
- [ ] Sustained fire on sand produces glass
- [ ] Transparency visible on water, gas, ice, glass
- [ ] Scroll wheel adjusts brush size
- [ ] Mobile layout renders on narrow viewport (toggle device toolbar in DevTools)
- [ ] FPS counter shows in bottom-left

- [ ] **Step 3: Fix any issues found in integration testing**

- [ ] **Step 4: Final commit**

```bash
git add src/ tests/ index.html package.json tsconfig.json vite.config.ts
git commit -m "feat: complete powder game — all elements, WebGL rendering, adaptive grid"
```
