import { Renderer } from './renderer';
import { InputHandler } from './input';
import { UI } from './ui';
import { Audio } from './audio';
import { selectTier, calculateCanvasSize } from './adaptive';
import { sceneToCommands } from './scenes';
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

  // Brush cursor preview overlay
  const cursor = document.createElement('div');
  cursor.style.cssText = 'position:fixed;pointer-events:none;border:1.5px solid rgba(255,255,255,0.3);border-radius:50%;z-index:5;display:none;';
  document.body.appendChild(cursor);

  // Init audio engine
  const audio = new Audio();
  // Resume AudioContext on first user interaction
  const resumeAudio = () => { audio.resume(); };
  canvas.addEventListener('pointerdown', resumeAudio, { once: true });

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
  let speed = 1;
  const ui = new UI(uiContainer, input, canvas, {
    onPause: () => worker.postMessage({ type: 'pause' } as ToWorkerMessage),
    onResume: () => worker.postMessage({ type: 'resume' } as ToWorkerMessage),
    onClear: () => worker.postMessage({ type: 'clear' } as ToWorkerMessage),
    onLoadScene: (scene) => {
      // Clear the grid first, then load the scene
      worker.postMessage({ type: 'clear' } as ToWorkerMessage);
      const commands = sceneToCommands(scene, gridWidth, gridHeight);
      // Send commands in batches to avoid overwhelming the worker
      const BATCH_SIZE = 5000;
      for (let i = 0; i < commands.length; i += BATCH_SIZE) {
        const batch = commands.slice(i, i + BATCH_SIZE);
        worker.postMessage({ type: 'input', commands: batch } as ToWorkerMessage);
      }
    },
    onSpeedChange: (s: number) => { speed = s; },
  });

  // Frame tracking
  let frameCount = 0;
  let fpsDisplay = 0;
  let lastFpsUpdate = performance.now();
  let lastFrameTime = performance.now();
  let slowFrames = 0;
  let skipSimulation = false;

  // Game loop
  worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
    if (e.data.type !== 'frame') return;

    const elements = new Uint8Array(e.data.elements);
    const metadata = new Uint8Array(e.data.metadata);

    // Render
    const now = performance.now();
    renderer.draw(elements, metadata, now / 1000);

    // Update audio based on active elements
    audio.update(elements);

    // Performance guardrail: track frame time
    const frameTime = now - lastFrameTime;
    lastFrameTime = now;
    if (frameTime > 20) {
      slowFrames++;
      if (slowFrames >= 10) skipSimulation = true;
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
  let tickAccumulator = 0;
  function loop(): void {
    // Flush input commands to worker
    const commands = input.flush();
    if (commands.length > 0) {
      worker.postMessage({ type: 'input', commands } as ToWorkerMessage);
    }

    // Flush wind commands to worker
    const windCommands = input.flushWind();
    if (windCommands.length > 0) {
      worker.postMessage({ type: 'wind', commands: windCommands } as ToWorkerMessage);
    }

    // Speed control: accumulate ticks based on speed multiplier
    // At 0.25x: tick every 4th frame, at 4x: 4 ticks per frame
    tickAccumulator += speed;
    const ticksThisFrame = Math.floor(tickAccumulator);
    tickAccumulator -= ticksThisFrame;

    for (let t = 0; t < ticksThisFrame; t++) {
      if (!skipSimulation || loopCount % 2 === 0) {
        worker.postMessage({ type: 'tick' } as ToWorkerMessage);
      }
    }
    loopCount++;

    // Update brush cursor preview
    const pos = input.cursorClientPos;
    if (pos) {
      const rect = canvas.getBoundingClientRect();
      const cellSize = rect.width / gridWidth;
      const diameter = input.brushRadius * 2 * cellSize;
      cursor.style.display = 'block';
      cursor.style.width = `${diameter}px`;
      cursor.style.height = `${diameter}px`;
      cursor.style.left = `${pos.x - diameter / 2}px`;
      cursor.style.top = `${pos.y - diameter / 2}px`;
    } else {
      cursor.style.display = 'none';
    }

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
