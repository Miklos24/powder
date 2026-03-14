import { ElementId } from './types';
import { ELEMENTS } from './simulation/elements';
import { InputHandler } from './input';
import { SCENES, type Scene } from './scenes';

// Placeable elements (exclude Empty, Glass, Steam -- those are derived)
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
  private onLoadScene: (scene: Scene) => void;
  private paused = false;
  private eraserActive = false;

  constructor(
    container: HTMLElement,
    input: InputHandler,
    callbacks: { onPause: () => void; onResume: () => void; onClear: () => void; onLoadScene: (scene: Scene) => void }
  ) {
    this.container = container;
    this.input = input;
    this.onPause = callbacks.onPause;
    this.onResume = callbacks.onResume;
    this.onClear = callbacks.onClear;
    this.onLoadScene = callbacks.onLoadScene;

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
    // Element picker -- top-left
    const picker = document.createElement('div');
    picker.className = 'pg-picker';
    picker.style.cssText = 'position:fixed;top:12px;left:12px;display:flex;gap:6px;flex-wrap:wrap;max-width:280px;padding:8px;background:rgba(26,26,36,0.8);border-radius:10px;z-index:10;';

    for (const id of PLACEABLE) {
      picker.appendChild(this.createElementButton(id));
    }
    // Eraser button
    picker.appendChild(this.createEraserButton());
    this.container.appendChild(picker);

    // Controls -- top-right
    const controls = document.createElement('div');
    controls.className = 'pg-controls';
    controls.style.cssText = 'position:fixed;top:12px;right:12px;display:flex;gap:8px;align-items:center;padding:8px;background:rgba(26,26,36,0.8);border-radius:10px;z-index:10;';

    controls.appendChild(this.createBrushSlider());
    controls.appendChild(this.createDemoButton());
    controls.appendChild(this.createPauseButton());
    controls.appendChild(this.createClearButton());
    this.container.appendChild(controls);

    // FPS display -- bottom-left
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
    btnGroup.appendChild(this.createDemoButton());
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

  private createDemoButton(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;';

    const btn = document.createElement('div');
    btn.style.cssText = 'background:#1a1a24;border-radius:8px;padding:8px 10px;cursor:pointer;color:#888;font-size:12px;user-select:none;';
    btn.textContent = '?';
    btn.title = 'Load demo scene';

    const menu = document.createElement('div');
    menu.style.cssText = 'display:none;position:absolute;top:100%;right:0;margin-top:4px;background:rgba(26,26,36,0.95);border-radius:8px;padding:4px;z-index:20;min-width:140px;';

    for (const scene of SCENES) {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 10px;cursor:pointer;color:#aaa;font-size:12px;border-radius:4px;white-space:nowrap;';
      item.textContent = `${scene.emoji} ${scene.name}`;
      item.addEventListener('mouseenter', () => { item.style.background = '#2a2a3a'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
      item.addEventListener('click', () => {
        menu.style.display = 'none';
        this.onLoadScene(scene);
      });
      menu.appendChild(item);
    }

    btn.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target as Node)) {
        menu.style.display = 'none';
      }
    });

    wrapper.append(btn, menu);
    return wrapper;
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
