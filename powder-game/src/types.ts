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
  density: number;
  opacity: number;
  color: [number, number, number];
  glow: boolean;
  metadataType: 'heat' | 'age';
  defaultMeta: number;
}

// Worker ← Main thread
export interface InputCommand {
  x: number;
  y: number;
  element: ElementId;
  radius: number;
  erase: boolean;
}

export interface WindCommand {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
}

export type ToWorkerMessage = {
  type: 'init';
  width: number;
  height: number;
} | {
  type: 'input';
  commands: InputCommand[];
} | {
  type: 'wind';
  commands: WindCommand[];
} | {
  type: 'pause' | 'resume' | 'clear' | 'tick';
};

// Worker → Main thread
export type FromWorkerMessage = {
  type: 'frame';
  elements: ArrayBuffer;
  metadata: ArrayBuffer;
} | {
  type: 'ready';
};
