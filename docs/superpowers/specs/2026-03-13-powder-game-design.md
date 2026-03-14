# Powder Game — Modern Web Simulation

A modern reimagining of the classic Dan-Ball Powder Game: a falling-sand particle physics simulation for desktop and mobile web.

## Goals

- Faithful to the spirit of the original — satisfying particle physics sandbox
- Modern visual style: clean pastel palette on dark background, minimalist UI
- Smooth on both desktop and mobile via adaptive grid sizing
- Novel elements (electricity, lava, acid, ice, gas) alongside the classics

## Architecture

Three-layer architecture with simulation isolated in a Web Worker:

```
┌─────────────────────────────┐
│  UI Layer (main thread)     │
│  - Touch/mouse input        │
│  - Element picker toolbar   │
│  - Brush size control       │
├─────────────────────────────┤
│  Renderer (main thread)     │
│  - WebGL fullscreen quad    │
│  - Grid texture upload      │
│  - Pastel color palette     │
├─────────────────────────────┤
│  Simulation (Web Worker)    │
│  - Grid state (Uint8Array)  │
│  - Physics tick loop        │
│  - Element interaction rules│
└─────────────────────────────┘
```

### Data Flow (per frame)

1. Main thread sends batched input events to the worker
2. Worker applies inputs to the grid, then runs one physics tick
3. Worker transfers the updated pixel buffer to main thread (transferable or SharedArrayBuffer)
4. Main thread uploads buffer as a WebGL texture and draws a fullscreen quad

### Tech Stack

- TypeScript
- WebGL for rendering
- Web Worker for simulation
- No framework dependencies — vanilla TS, single-page app
- Build tool: Vite (fast dev, simple config)

## Grid Representation

- Flat `Uint8Array` — each cell stores an element type ID (0=empty, 1=sand, 2=water, etc.)
- Parallel `Uint8Array` for per-particle metadata — interpreted per element type:
  - Heat-based elements (Lava, Ice, Sand, Metal, Wood, Stone, Water): metadata = heat level (0-255)
  - Age-based elements (Fire, Gas, Steam, Electricity): metadata = remaining lifetime (counts down to 0, then element is removed)
  - No element currently needs both heat and age simultaneously, so one byte suffices
- Color derived from element type at render time via shader palette lookup
- Per-pixel color jitter (±10%) via position hash in fragment shader for organic feel

## Elements

### Element Table

| ID | Element | Category | Opacity | Movement |
|----|---------|----------|---------|----------|
| 0  | Empty | — | 0% | — |
| 1  | Sand | Powder | 100% | Falls, slides diagonally if blocked |
| 2  | Water | Liquid | 70% | Falls, flows sideways, density-ordered |
| 3  | Fire | Energy | 90% | Rises briefly, then dies (age-limited) |
| 4  | Oil | Liquid | 85% | Falls, flows sideways, floats on water |
| 5  | Wood | Static | 100% | Doesn't move unless transformed |
| 6  | Stone | Static | 100% | Doesn't move unless transformed |
| 7  | Metal | Static | 100% | Doesn't move, conducts electricity |
| 8  | Ice | Static | 75% | Doesn't move, melts near heat |
| 9  | Acid | Liquid | 65% | Falls, flows sideways, dissolves materials |
| 10 | Lava | Liquid | 90% | Falls, flows sideways, high heat source |
| 11 | Gas | Gas | 40% | Rises, drifts sideways randomly |
| 12 | Electricity | Energy | 80% + glow | Propagates through conductors |
| 13 | Glass | Static (derived) | 60% | Created from sand + high heat |
| 14 | Steam | Gas (derived) | 40% | Created from water + heat, rises |

### Interaction Rules

- Fire + Wood → more Fire
- Fire + Oil → more Fire (explosive spread)
- Fire + Gas → big Fire burst
- Fire + Ice → Water
- Fire + Sand (sustained high heat) → Glass
- Lava + Water → Stone + Steam
- Lava + Sand → Glass
- Lava + Ice → Water + Stone
- Acid + Wood → Empty (dissolves)
- Acid + Metal → Empty (dissolves)
- Acid + Stone → both removed (neutralized)
- Water near Ice (low heat) → Ice spreads
- Electricity + Metal → propagates along metal (up to 10 cells per tick, no decay)
- Electricity + Water → propagates (up to 5 cells, wider spread, converts adjacent water cells to steam)
- Electricity + Gas → Fire

### Temperature Model

Simple integer heat model using the metadata byte (0-255):

- Fire/Lava set high heat on neighboring cells
- Heat decays by 1-2 each tick
- Transformations trigger at thresholds (e.g., sand → glass at heat > 200, ice → water at heat > 50)
- No floating-point temperatures — keeps it fast

## Simulation Engine

### Update Strategy

- Scan bottom-to-top (so gravity-affected particles update correctly)
- Alternate left-to-right and right-to-left each frame (prevents directional pile bias)
- Each cell checks neighbors and applies rules based on element type

### Element Behavior Categories

- **Powder** (Sand): Fall down. If blocked below, try diagonal down-left/down-right.
- **Liquid** (Water, Oil, Acid, Lava): Fall down. If blocked, flow sideways. Density ordering determines layering: Oil (1) < Water (2) < Acid (3) < Lava (4). Lower density floats above higher.
- **Gas** (Gas, Steam): Rise up. Drift sideways randomly. Dissipate over time (age-limited).
- **Static** (Wood, Stone, Metal, Ice, Glass): Don't move. Subject to transformation rules.
- **Energy** (Fire, Electricity): Fire rises briefly then dies (age-limited). Electricity propagates through conductors per tick.

## Rendering

### WebGL Pipeline

1. Element grid uploaded as a single-channel `R8` texture (element ID)
2. Metadata grid uploaded as a second `R8` texture (heat level)
3. 1D palette texture (RGBA) holds colors + opacity for all element types
4. Fragment shader:
   - Samples element texture to get type
   - Looks up color from palette texture
   - Applies ±10% color jitter using hash of grid position
   - Applies alpha from palette (transparency for water, gas, etc.)
   - Adds emissive glow for fire/lava/electricity based on heat metadata
5. Alpha blending enabled for transparent elements against the dark background

### Color Palette

Background: `#0d0d12`

| Element | Color | Notes |
|---------|-------|-------|
| Sand | `#e8d5a3` | Warm pastel tan |
| Water | `#7eb8d8` | Soft blue, 70% opacity |
| Fire | `#f0a08a` | Warm pastel coral + glow |
| Oil | `#c4a87a` | Muted amber, 85% opacity |
| Wood | `#a8c49a` | Soft sage green |
| Stone | `#b0aab0` | Neutral gray |
| Metal | `#a0b8c8` | Cool steel blue |
| Ice | `#d0e8f0` | Pale frost, 75% opacity |
| Acid | `#c8f0c0` | Pale green, 65% opacity |
| Lava | `#f0c898` | Warm orange + glow |
| Gas | `#c8d0e8` | Pale lavender, 40% opacity |
| Electricity | `#f0e8a0` | Pale yellow + strong glow |
| Glass | `#c0d8e0` | Pale cyan, 60% opacity |
| Steam | `#d0d0d8` | Light gray, 40% opacity |

## UI Design

### Desktop Layout

- Canvas fills the entire viewport
- Element picker: top-left floating overlay, grid of colored squares (32×32px), selected element has white border
- Controls: top-right floating overlay — brush size slider, eraser, pause/play, clear
- FPS/particle count: bottom-left, monospace, very dim
- All overlays: semi-transparent dark chrome (`#1a1a24` at ~80% opacity), rounded corners

### Mobile Layout

- Canvas fills viewport above a bottom toolbar
- Bottom toolbar: horizontally scrollable element row on top, brush size slider + control buttons below
- Same visual language as desktop — dark chrome, muted colors

### Keyboard Shortcuts (Desktop)

| Key | Action |
|-----|--------|
| 1-9, 0 | Select elements 1-10 |
| -, = | Select elements 11-12 |
| [ / ] | Decrease / increase brush size |
| Space | Pause / resume |
| E | Toggle eraser |
| C | Clear canvas |
| Right-click | Erase (while held) |
| Scroll wheel | Adjust brush size |

## Input Handling

### Drawing

- Mouse/touch down + drag draws continuously
- Bresenham line interpolation between sample points — no gaps on fast strokes
- Circular brush, sizes 1-20 cells
- Drawing does not overwrite non-empty cells (so you can draw water into a container without destroying walls)
- Eraser always overwrites to empty

### Input Pipeline

- Main thread collects input events during a frame
- Batches them as arrays of `[x, y, element, radius]`
- Posts batch to worker once per frame via `postMessage`
- Worker applies inputs before running physics tick
- Result: zero-frame-delay between input and particles appearing

## Adaptive Grid & Performance

### Grid Tiers

| Device | Grid Size | Pixel Scale | Target FPS |
|--------|-----------|-------------|------------|
| Desktop (1080p+) | 400×300 | 3-4px per cell | 60 |
| Tablet | 300×200 | 3px per cell | 60 |
| Mobile | 200×150 | 2-3px per cell | 60 |
| Low-end mobile | 160×120 | 2px per cell | 30 |

### Detection

On startup, run a quick benchmark: simulate 3-4 frames on a test grid, measure time. Select the tier that keeps frame time under 16ms. Factor in `devicePixelRatio` and viewport dimensions for pixel scaling.

### Performance Guardrails

- If frame time exceeds 20ms for 10 consecutive frames, drop to simulating every other frame (render stays at 60fps — simulation appears to slow down but UI stays smooth)
- Particle count is inherently capped by grid dimensions (e.g., 120,000 cells for 400×300)
- Worker uses `requestAnimationFrame`-synced timing via message passing

### Memory Budget (400×300, largest tier)

- Element grid: 120KB
- Metadata grid: 120KB
- RGBA render buffer: 480KB
- Total: ~720KB

## Project Structure

```
powder-game/
├── index.html
├── src/
│   ├── main.ts              # Entry point, initializes renderer + worker + UI
│   ├── renderer.ts           # WebGL setup, texture upload, draw
│   ├── shaders/
│   │   ├── quad.vert         # Simple fullscreen quad vertex shader
│   │   └── particle.frag     # Palette lookup, jitter, glow
│   ├── simulation/
│   │   ├── worker.ts         # Web Worker entry point
│   │   ├── grid.ts           # Grid data structure and cell access
│   │   ├── elements.ts       # Element definitions and properties
│   │   ├── physics.ts        # Update loop, movement rules
│   │   └── interactions.ts   # Element interaction rules
│   ├── input.ts              # Mouse/touch handling, stroke interpolation
│   ├── ui.ts                 # Element picker, brush controls, toolbar
│   ├── adaptive.ts           # Device detection, grid tier selection, benchmarking
│   └── types.ts              # Shared type definitions
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Deployment

- Static site — build with Vite, output to `dist/`
- Deploy anywhere: GitHub Pages, Netlify, Vercel, or plain static hosting
- SharedArrayBuffer requires COOP/COEP headers; fall back to transferable `postMessage` if headers aren't available
- No server-side component
