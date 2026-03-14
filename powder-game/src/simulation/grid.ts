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
    return this.elements.buffer as ArrayBuffer;
  }

  get metadataBuffer(): ArrayBuffer {
    return this.metadata.buffer as ArrayBuffer;
  }

  copyElements(): Uint8Array {
    return new Uint8Array(this.elements);
  }

  copyMetadata(): Uint8Array {
    return new Uint8Array(this.metadata);
  }
}
