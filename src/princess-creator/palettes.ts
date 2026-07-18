// ── Curated palettes per archetype ───────────────────────────────────────────
//
//  Palette theory: pastel body band + one saturated accent zone (see
//  RESEARCH_SUPPLEMENT.md §6). The canonical TTT human princess is the
//  Midnight Punk from the reference art — dark navy + leather + silver studs
//  + blonde bob — so she leads the human list.

import type { Archetype, ColorsDna } from './types';

export interface Palette {
  id: string;
  label: string;
  colors: ColorsDna;
}

export const PALETTES: Record<Archetype, Palette[]> = {
  human: [
    {
      id: 'midnight-punk',
      label: 'Midnight Punk',
      colors: {
        primary: '#39415f', secondary: '#221f2b', accent: '#5c6683',
        skin: '#ffdfc4', hair: '#f2d16b', eyes: '#4ea8de',
        metal: '#9aa1b5', glow: '#9fd8ff',
      },
    },
    {
      id: 'rose-gold',
      label: 'Rose & Gold',
      colors: {
        primary: '#f7c6d9', secondary: '#fff3d6', accent: '#e8a33d',
        skin: '#ffe0c2', hair: '#f7d774', eyes: '#4ea8de',
        metal: '#f1c40f', glow: '#ffd9e8',
      },
    },
    {
      id: 'lavender-dawn',
      label: 'Lavender Dawn',
      colors: {
        primary: '#e9d5f0', secondary: '#fff7e8', accent: '#d4886e',
        skin: '#ffdfc4', hair: '#8a5a3b', eyes: '#7b5ea7',
        metal: '#d9b356', glow: '#e6ccff',
      },
    },
    {
      id: 'emerald-court',
      label: 'Emerald Court',
      colors: {
        primary: '#2e6b4f', secondary: '#f2ead8', accent: '#c8a24a',
        skin: '#f0c8a0', hair: '#2f2a26', eyes: '#3fae7c',
        metal: '#c8a24a', glow: '#baf5d2',
      },
    },
    {
      id: 'poc-bubblegum',
      label: 'Bubblegum (POC)',
      colors: {
        primary: '#ff9abc', secondary: '#ffffff', accent: '#ffffff',
        skin: '#ffd1b3', hair: '#fde74c', eyes: '#4ea8de',
        metal: '#ffd700', glow: '#ffe2ef',
      },
    },
  ],
  fox: [
    {
      id: 'autumn-maple',
      label: 'Autumn Maple',
      colors: {
        primary: '#ff8fb3', secondary: '#fff6ec', accent: '#ffd166',
        skin: '#e8874a', hair: '#fce3c3', eyes: '#3c2a1e',
        metal: '#f1c40f', glow: '#ffe9a8',
      },
    },
    {
      id: 'sunset-kitsune',
      label: 'Sunset Kitsune',
      colors: {
        primary: '#7a3b2e', secondary: '#fbead1', accent: '#c2452d',
        skin: '#f2a65a', hair: '#fbead1', eyes: '#d9772f',
        metal: '#d8a24a', glow: '#ffc48a',
      },
    },
    {
      id: 'arctic-snow',
      label: 'Arctic Snow',
      colors: {
        primary: '#7fa8d9', secondary: '#ffffff', accent: '#b0c9e8',
        skin: '#e9edf4', hair: '#ffffff', eyes: '#78b3e0',
        metal: '#c0c8d8', glow: '#d6ecff',
      },
    },
    {
      id: 'dusk-shadow',
      label: 'Dusk Shadow',
      colors: {
        primary: '#2b2438', secondary: '#8a7a9a', accent: '#d94f6c',
        skin: '#4a3a52', hair: '#8a7a9a', eyes: '#ffd166',
        metal: '#6e6580', glow: '#c48aff',
      },
    },
  ],
  slime: [
    {
      id: 'mint-jelly',
      label: 'Mint Jelly',
      colors: {
        primary: '#33b5a8', secondary: '#eafbf7', accent: '#3fbfae',
        skin: '#5fd4c0', hair: '#7fe0cf', eyes: '#1e4d46',
        metal: '#f1c40f', glow: '#aef7e8',
      },
    },
    {
      id: 'bubblegum-goo',
      label: 'Bubblegum Goo',
      colors: {
        primary: '#e878ad', secondary: '#ffe8f3', accent: '#ff4f9a',
        skin: '#f099c2', hair: '#ffb7d9', eyes: '#5c2e44',
        metal: '#ffd166', glow: '#ffd1e8',
      },
    },
    {
      id: 'lemon-drop',
      label: 'Lemon Drop',
      colors: {
        primary: '#e8c73d', secondary: '#fdf7d8', accent: '#f2a531',
        skin: '#f5d76e', hair: '#f7e39a', eyes: '#6b4f1d',
        metal: '#e8ecf2', glow: '#fff3b0',
      },
    },
    {
      id: 'void-goo',
      label: 'Void Goo',
      colors: {
        primary: '#5c3fa8', secondary: '#c9b8e8', accent: '#9b6bc7',
        skin: '#7b5ea7', hair: '#9b7fd4', eyes: '#e8f2ff',
        metal: '#3d3654', glow: '#b98aff',
      },
    },
  ],
  skeleton: [
    {
      id: 'gothic-royal',
      label: 'Gothic Royal',
      colors: {
        primary: '#3a0ca3', secondary: '#f72585', accent: '#7209b7',
        skin: '#e8e8e4', hair: '#e8e8e4', eyes: '#00ffff',
        metal: '#ffd700', glow: '#00ffff',
      },
    },
    {
      id: 'moonlit-bone',
      label: 'Moonlit Bone',
      colors: {
        primary: '#2b3050', secondary: '#c9b8de', accent: '#7b6ba7',
        skin: '#e6e0d2', hair: '#e6e0d2', eyes: '#9b6bc7',
        metal: '#8a8f9c', glow: '#b98aff',
      },
    },
    {
      id: 'blood-royal',
      label: 'Blood Royal',
      colors: {
        primary: '#5c1a2e', secondary: '#c8a24a', accent: '#8a2438',
        skin: '#efe7d8', hair: '#efe7d8', eyes: '#ff6b4a',
        metal: '#c8a24a', glow: '#ff8a5c',
      },
    },
    {
      id: 'porcelain-ghost',
      label: 'Porcelain Ghost',
      colors: {
        primary: '#e6e0d2', secondary: '#9db4c0', accent: '#7a9aa8',
        skin: '#f2ede2', hair: '#f2ede2', eyes: '#7fd4b8',
        metal: '#b5bdc4', glow: '#baf5d2',
      },
    },
  ],
};

/** First palette of an archetype = its canonical default colors. */
export function defaultColors(archetype: Archetype): ColorsDna {
  return { ...PALETTES[archetype][0].colors };
}
