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
    // Viewport is wider -- fit to height
    return { width: vh * gridAspect, height: vh };
  } else {
    // Viewport is taller -- fit to width
    return { width: vw, height: vw / gridAspect };
  }
}
