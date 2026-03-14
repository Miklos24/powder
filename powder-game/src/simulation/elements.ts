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
  { id: ElementId.Plant,       name: 'Plant',       category: 'static', density: 5, opacity: 1.0,  color: [144, 208, 128], glow: false, metadataType: 'heat', defaultMeta: 0 },
  { id: ElementId.Firework,    name: 'Firework',    category: 'powder', density: 3, opacity: 1.0,  color: [240, 136, 136], glow: true,  metadataType: 'age',  defaultMeta: 255 },
];

export function getElement(id: ElementId): ElementDef {
  return ELEMENTS[id];
}
