// Colour handling for the sprite baker.
//
// Every shape is drawn with a four-entry ramp derived from one base colour, so
// a whole monster can be reskinned by changing a single hex value. Colours are
// packed as 0xAABBGGRR little-endian integers because that is the layout a
// Uint32Array view over ImageData expects.

export function packRGB(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function unpack(c) {
  return { r: c & 255, g: (c >>> 8) & 255, b: (c >>> 16) & 255, a: (c >>> 24) & 255 };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function packHex(hex, a = 255) {
  const c = hexToRgb(hex);
  return packRGB(c.r, c.g, c.b, a);
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(f(h + 1 / 3) * 255),
    g: Math.round(f(h) * 255),
    b: Math.round(f(h - 1 / 3) * 255),
  };
}

const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

// Move a colour in HSL space. Positive dL brightens.
export function shift(hex, dL, dS = 0, dH = 0) {
  const c = hexToRgb(hex);
  const hsl = rgbToHsl(c.r, c.g, c.b);
  const out = hslToRgb(
    (hsl.h + dH + 1) % 1,
    clamp01(hsl.s + dS),
    clamp01(hsl.l + dL)
  );
  return packRGB(out.r, out.g, out.b);
}

// A shading ramp: lit face, base, shadow face, and the outline colour.
// Shadows also get a small hue push toward blue, which is what stops generated
// pixel art from looking like flat greyscale multiplication.
export function ramp(hex, opts = {}) {
  const lightAmt = opts.light ?? 0.13;
  const darkAmt = opts.dark ?? 0.13;
  const lineAmt = opts.line ?? 0.30;
  return {
    light: shift(hex, lightAmt, opts.lightSat ?? -0.05, opts.lightHue ?? 0.005),
    base: shift(hex, 0, 0, 0),
    dark: shift(hex, -darkAmt, 0.04, -0.012),
    line: shift(hex, -lineAmt, 0.06, -0.02),
  };
}

// Flat ramp for things that should not read as lit volumes (shadows, glows).
export function flat(hex, alpha = 255) {
  const c = hexToRgb(hex);
  const p = packRGB(c.r, c.g, c.b, alpha);
  return { light: p, base: p, dark: p, line: p };
}

export const TRANSPARENT = 0;

// Named palettes. Anything that draws a creature or object pulls from here so
// the game reads as one coherent art direction.
export const COLORS = {
  // Sorceress
  sorcRobe:    '#3b4b9c',
  sorcRobeAlt: '#5566c8',
  sorcTrim:    '#c8a94a',
  sorcSkin:    '#e8b894',
  sorcHair:    '#7a3a2a',

  // Barbarian
  barbSkin:    '#d99a66',
  barbHide:    '#7a4f2e',
  barbFur:     '#8a6a48',
  barbTrim:    '#a8843a',
  barbHair:    '#4a2f1a',

  // Fallen family
  fallenSkin:  '#8c4a3a',
  fallenCloth: '#6a2f2f',
  devilkinSkin:'#7a3a6a',
  shamanSkin:  '#4a6a3a',
  shamanRobe:  '#2f4a2f',

  // Undead
  zombieSkin:  '#6b7a52',
  zombieRag:   '#4a4436',
  ghoulSkin:   '#8a9a7a',
  boneWhite:   '#d8d2b8',
  boneShadow:  '#9a9278',

  // Beasts
  quillFur:    '#7a6a4a',
  quillSpine:  '#3a3228',

  // Bosses
  corpsefire:  '#a83a2a',
  ravenCloth:  '#5a1f2a',
  ravenSkin:   '#c9a88a',
  andarielSkin:'#c8b0a0',
  andarielHair:'#2a1a24',
  andarielCarapace: '#6a2a3a',

  // Materials
  leather:     '#6b4a2f',
  steel:       '#8f97a8',
  darkSteel:   '#4a505c',
  gold:        '#c8a03a',
  wood:        '#5a4028',
  stone:       '#6a6459',
  cloth:       '#7a6b52',
  blood:       '#7a1a18',
  ember:       '#ff7a28',
  ice:         '#7ad0ff',
  arcane:      '#b070ff',
  poison:      '#7ac83a',
};
