import type { InputCommand, WindCommand } from './types';
import { ElementId } from './types';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private gridWidth: number;
  private gridHeight: number;
  private pendingCommands: InputCommand[] = [];
  private pendingWindCommands: WindCommand[] = [];
  private lastPos: { x: number; y: number } | null = null;
  private drawing = false;
  private erasing = false;

  selectedElement: ElementId = ElementId.Sand;
  brushRadius: number = 2;
  eraserMode: boolean = false;
  windMode: boolean = false;

  /** Current cursor position in client coordinates, null when off-canvas */
  cursorClientPos: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.canvas = canvas;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      this.cursorClientPos = { x: e.clientX, y: e.clientY };
      this.onPointerDown(e.clientX, e.clientY, e.button === 2);
    });
    canvas.addEventListener('mousemove', (e) => {
      this.cursorClientPos = { x: e.clientX, y: e.clientY };
      this.onPointerMove(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseup', () => this.onPointerUp());
    canvas.addEventListener('mouseleave', () => {
      this.cursorClientPos = null;
      this.onPointerUp();
    });
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

  /** Drain pending draw/erase commands (called once per frame) */
  flush(): InputCommand[] {
    const cmds = this.pendingCommands;
    this.pendingCommands = [];
    return cmds;
  }

  /** Drain pending wind commands (called once per frame) */
  flushWind(): WindCommand[] {
    const cmds = this.pendingWindCommands;
    this.pendingWindCommands = [];
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
    if (!this.windMode) {
      this.addCommand(pos.x, pos.y);
    }
  }

  private onPointerMove(clientX: number, clientY: number): void {
    if (!this.drawing) return;
    const pos = this.toGridCoords(clientX, clientY);

    if (this.windMode && this.lastPos) {
      const dx = pos.x - this.lastPos.x;
      const dy = pos.y - this.lastPos.y;
      if (dx !== 0 || dy !== 0) {
        this.pendingWindCommands.push({
          x: pos.x, y: pos.y,
          dx, dy,
          radius: this.brushRadius * 2,
        });
      }
    } else if (this.lastPos) {
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
