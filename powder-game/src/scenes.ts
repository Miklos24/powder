import { ElementId } from './types';
import type { InputCommand } from './types';

interface ScenePlacement {
  /** Fractional x position (0–1) */
  fx: number;
  /** Fractional y position (0–1) */
  fy: number;
  element: ElementId;
}

export interface Scene {
  name: string;
  emoji: string;
  build: () => ScenePlacement[];
}

/** Fill a rectangle with an element (fractional coords) */
function rect(
  fx: number, fy: number, fw: number, fh: number, element: ElementId,
  placements: ScenePlacement[],
): void {
  const step = 0.003;
  for (let x = fx; x < fx + fw; x += step) {
    for (let y = fy; y < fy + fh; y += step) {
      placements.push({ fx: x, fy: y, element });
    }
  }
}

/** Fill a circle with an element (fractional coords) */
function circle(
  cx: number, cy: number, fr: number, element: ElementId,
  placements: ScenePlacement[],
): void {
  const step = 0.003;
  for (let x = cx - fr; x <= cx + fr; x += step) {
    for (let y = cy - fr; y <= cy + fr; y += step) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= fr * fr) {
        placements.push({ fx: x, fy: y, element });
      }
    }
  }
}

/** Fill a triangle (pointing up) */
function triangle(
  cx: number, baseY: number, halfWidth: number, height: number,
  element: ElementId, placements: ScenePlacement[],
): void {
  const step = 0.003;
  for (let y = baseY; y > baseY - height; y -= step) {
    const progress = (baseY - y) / height;
    const w = halfWidth * (1 - progress);
    for (let x = cx - w; x <= cx + w; x += step) {
      placements.push({ fx: x, fy: y, element });
    }
  }
}

function buildVolcano(): ScenePlacement[] {
  const p: ScenePlacement[] = [];

  // Stone mountain (triangle)
  triangle(0.5, 0.85, 0.35, 0.55, ElementId.Stone, p);

  // Lava pool in crater at top
  rect(0.46, 0.30, 0.08, 0.06, ElementId.Lava, p);

  // Sand slopes on either side
  triangle(0.18, 0.90, 0.15, 0.20, ElementId.Sand, p);
  triangle(0.82, 0.90, 0.15, 0.20, ElementId.Sand, p);

  // Water lake at bottom
  rect(0.05, 0.88, 0.25, 0.07, ElementId.Water, p);

  // Stone ground
  rect(0.0, 0.93, 1.0, 0.07, ElementId.Stone, p);

  return p;
}

function buildChemistry(): ScenePlacement[] {
  const p: ScenePlacement[] = [];

  // Glass floor
  rect(0.0, 0.90, 1.0, 0.03, ElementId.Glass, p);

  // Glass dividers creating 4 compartments
  const dividers = [0.25, 0.50, 0.75];
  for (const dx of dividers) {
    rect(dx - 0.005, 0.40, 0.01, 0.50, ElementId.Glass, p);
  }

  // Glass back walls for compartments
  rect(0.0, 0.40, 0.01, 0.53, ElementId.Glass, p);
  rect(0.99, 0.40, 0.01, 0.53, ElementId.Glass, p);

  // Compartment 1: Acid
  rect(0.04, 0.55, 0.17, 0.33, ElementId.Acid, p);

  // Compartment 2: Metal chunks + Water
  rect(0.29, 0.70, 0.17, 0.18, ElementId.Water, p);
  rect(0.32, 0.55, 0.04, 0.10, ElementId.Metal, p);
  rect(0.40, 0.60, 0.04, 0.08, ElementId.Metal, p);

  // Compartment 3: Wood + Oil
  rect(0.54, 0.65, 0.17, 0.23, ElementId.Oil, p);
  rect(0.57, 0.55, 0.10, 0.08, ElementId.Wood, p);

  // Compartment 4: Fire + Gas
  rect(0.79, 0.70, 0.17, 0.18, ElementId.Gas, p);
  rect(0.82, 0.82, 0.10, 0.06, ElementId.Fire, p);

  return p;
}

function buildThunderstorm(): ScenePlacement[] {
  const p: ScenePlacement[] = [];

  // Ground
  rect(0.0, 0.90, 1.0, 0.10, ElementId.Stone, p);

  // Metal towers
  rect(0.15, 0.45, 0.03, 0.45, ElementId.Metal, p);
  rect(0.50, 0.35, 0.03, 0.55, ElementId.Metal, p);
  rect(0.82, 0.50, 0.03, 0.40, ElementId.Metal, p);

  // Tower bases (wider)
  rect(0.12, 0.85, 0.09, 0.05, ElementId.Metal, p);
  rect(0.47, 0.85, 0.09, 0.05, ElementId.Metal, p);
  rect(0.79, 0.85, 0.09, 0.05, ElementId.Metal, p);

  // Gas clouds at top
  circle(0.20, 0.15, 0.10, ElementId.Gas, p);
  circle(0.45, 0.10, 0.12, ElementId.Gas, p);
  circle(0.70, 0.13, 0.11, ElementId.Gas, p);
  circle(0.35, 0.18, 0.08, ElementId.Gas, p);
  circle(0.85, 0.16, 0.07, ElementId.Gas, p);

  // Electricity bolts between clouds and towers
  // Bolt 1: cloud to tower 1
  for (let t = 0; t < 1; t += 0.02) {
    const x = 0.165 + t * 0.0 + (Math.sin(t * 12) * 0.015);
    const y = 0.25 + t * 0.20;
    p.push({ fx: x, fy: y, element: ElementId.Electricity });
  }
  // Bolt 2: cloud to tower 2
  for (let t = 0; t < 1; t += 0.02) {
    const x = 0.515 + (Math.sin(t * 10) * 0.02);
    const y = 0.22 + t * 0.13;
    p.push({ fx: x, fy: y, element: ElementId.Electricity });
  }

  // Water puddles on ground
  rect(0.02, 0.88, 0.10, 0.02, ElementId.Water, p);
  rect(0.60, 0.88, 0.15, 0.02, ElementId.Water, p);

  return p;
}

export const SCENES: Scene[] = [
  { name: 'Volcano', emoji: '\u{1F30B}', build: buildVolcano },
  { name: 'Chemistry', emoji: '\u{1F9EA}', build: buildChemistry },
  { name: 'Thunderstorm', emoji: '\u26A1', build: buildThunderstorm },
];

/** Convert a scene to InputCommands for the given grid dimensions */
export function sceneToCommands(scene: Scene, gridWidth: number, gridHeight: number): InputCommand[] {
  const placements = scene.build();
  const seen = new Set<number>();
  const commands: InputCommand[] = [];

  for (const { fx, fy, element } of placements) {
    const x = Math.round(fx * (gridWidth - 1));
    const y = Math.round(fy * (gridHeight - 1));
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
    const key = y * gridWidth + x;
    if (seen.has(key)) continue;
    seen.add(key);
    commands.push({ x, y, element, radius: 0, erase: false });
  }

  return commands;
}
