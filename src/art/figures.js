// One skeletal poser produces every creature in the game.
//
// Joints are computed in a body-local frame (forward, side, up), rotated by the
// creature's facing, then projected with the same 2:1 isometric ratio the tiles
// use. Limbs are sorted back-to-front by depth and rasterized as tapered
// capsules, so a monster is a palette and a handful of proportions rather than
// a drawing.

import { Buf, capsule, ellipse, ellipseF, groundFade, outline, tint, px } from './pixel.js';
import { ramp, packHex, packRGB, COLORS } from './palette.js';

export const CELL = 80;
export const FOOT_Y = 70;   // where the ground sits inside a cell
const PX = 0.72;            // local unit to screen x
const PY = 0.36;            // local unit to screen y (half of PX: the iso squash)

const OUTLINE = packHex('#0c0a10');

export const ANIMS = { idle: 4, walk: 8, attack: 6, cast: 6, death: 8 };
// Directions 3, 4 and 7 are horizontal mirrors of 1, 0 and 5. Screen angle
// runs clockwise from east, so mirroring maps a to 180-a and never crosses
// between the front-facing and back-facing halves.
export const GEN_DIRS = [0, 1, 2, 5, 6];
const MIRROR_OF = { 3: 1, 4: 0, 7: 5 };
const GEN_SLOT = { 0: 0, 1: 1, 2: 2, 5: 3, 6: 4 };

// World-space facing that renders as screen angle d * 45 degrees.
function facingFor(dir) {
  const a = dir * Math.PI / 4;
  const dx = (Math.cos(a) + 2 * Math.sin(a)) / 2;
  const dy = (2 * Math.sin(a) - Math.cos(a)) / 2;
  return Math.atan2(dy, dx);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- proportions

// Proportioned after Diablo's pre-rendered figures: legs as long as the head
// and torso together, a small head on wide shoulders, roughly five and a half
// heads to the body. Straight realism would still read as a stick figure at
// sixty pixels, so the mass lives in the shoulders and thighs rather than in
// a big head.
const DEFAULT_BUILD = {
  thigh: 17, shin: 16, upperArm: 10.5, foreArm: 10,
  hipU: 33, chestU: 49, neckU: 52, headU: 57, headR: 5.4,
  shoulder: 11, hipSide: 4.6,
  thighR: 3.5, shinR: 2.8, armR: 2.7, foreR: 2.2,
  torsoR: 6.1, neckR: 2.7,
  hunch: 0, stance: 1, headF: 0,
};

// ------------------------------------------------------------------ animation

// Every curve returns joint angles in radians plus a couple of whole-body
// offsets. Forward kinematics turns those into positions below.
function poseAngles(anim, t, spec) {
  const p = {
    hipL: 0, hipR: 0, kneeL: 0.1, kneeR: 0.1,
    shoulderL: 0, shoulderR: 0, elbowL: 0.3, elbowR: 0.3,
    armOutL: 0, armOutR: 0,
    bob: 0, lean: spec.build.hunch, twist: 0, sink: 0,
    pitch: 0, roll: 0, armUpL: 0, armUpR: 0,
  };
  const ph = t * TAU;

  if (anim === 'idle') {
    const b = Math.sin(ph);
    p.bob = b * 0.5;
    p.shoulderL = b * 0.08 - 0.05;
    p.shoulderR = -b * 0.08 - 0.05;
    p.elbowL = 0.32 + b * 0.05;
    p.elbowR = 0.32 - b * 0.05;
    p.armOutL = 0.16; p.armOutR = -0.16;
    p.hipL = 0.04; p.hipR = -0.04;
    p.lean += b * 0.02;
  } else if (anim === 'walk') {
    const s = Math.sin(ph), c = Math.cos(ph);
    p.hipL = s * 0.5;
    p.hipR = -s * 0.5;
    // Knee folds while its leg is travelling forward through the air.
    p.kneeL = 0.12 + Math.max(0, -c) * 0.95;
    p.kneeR = 0.12 + Math.max(0, c) * 0.95;
    p.shoulderL = -s * 0.5;
    p.shoulderR = s * 0.5;
    p.elbowL = 0.4 + Math.abs(s) * 0.25;
    p.elbowR = 0.4 + Math.abs(s) * 0.25;
    p.armOutL = 0.14; p.armOutR = -0.14;
    p.bob = -Math.abs(s) * 1.9;
    p.lean += 0.08;
    p.twist = s * 0.12;
  } else if (anim === 'attack' && spec.attackStyle === 'twoHand') {
    // Both arms drive the swing; the peak still lands on frame 3 of 6.
    let sw;
    if (t < 0.33) sw = lerp(0, -1.35, ease(t / 0.33));
    else if (t < 0.5) sw = lerp(-1.35, 1.55, ease((t - 0.33) / 0.17));
    else sw = lerp(1.55, 0, ease((t - 0.5) / 0.5));
    p.shoulderR = sw;
    p.shoulderL = sw * 0.85;
    p.armUpR = sw < 0 ? -sw * 0.9 : 0;
    p.armUpL = sw < 0 ? -sw * 0.7 : 0;
    p.elbowR = 0.25 + Math.max(0, -sw) * 0.6;
    p.elbowL = 0.45 + Math.max(0, -sw) * 0.5;
    p.armOutL = 0.3; p.armOutR = -0.1;
    p.twist = -sw * 0.42;
    p.lean += Math.max(0, sw) * 0.18 - Math.max(0, -sw) * 0.1;
    p.hipL = 0.24; p.hipR = -0.2;
    p.kneeL = 0.22; p.kneeR = 0.3;
    p.bob = -Math.abs(sw) * 0.8;
  } else if (anim === 'attack') {
    // Wind up, then peak exactly on frame 3 of 6, which is the frame combat
    // treats as the moment of impact. Recover over the back half.
    let sw;
    if (t < 0.33) sw = lerp(0, -1.25, ease(t / 0.33));
    else if (t < 0.5) sw = lerp(-1.25, 1.45, ease((t - 0.33) / 0.17));
    else sw = lerp(1.45, 0, ease((t - 0.5) / 0.5));
    p.shoulderR = sw;
    p.armUpR = sw < 0 ? -sw * 0.8 : 0;
    p.elbowR = 0.2 + Math.max(0, -sw) * 0.7;
    p.shoulderL = -sw * 0.3;
    p.elbowL = 0.5;
    p.twist = -sw * 0.28;
    p.lean += Math.max(0, sw) * 0.14 - Math.max(0, -sw) * 0.08;
    p.hipL = 0.22; p.hipR = -0.18;
    p.kneeL = 0.2; p.kneeR = 0.28;
    p.bob = -Math.abs(sw) * 0.6;
  } else if (anim === 'cast') {
    // Arms rise together, then push forward on the release.
    const up = t < 0.5 ? ease(t / 0.5) : 1;
    const push = t < 0.5 ? 0 : ease((t - 0.5) / 0.5);
    p.armUpL = up * 1.5 - push * 0.7;
    p.armUpR = up * 1.5 - push * 0.7;
    p.shoulderL = -push * 1.0;
    p.shoulderR = -push * 1.0;
    p.armOutL = 0.5 - push * 0.35;
    p.armOutR = -0.5 + push * 0.35;
    p.elbowL = 0.7 - push * 0.55;
    p.elbowR = 0.7 - push * 0.55;
    p.lean += -up * 0.14 + push * 0.26;
    p.bob = up * 0.8 - push * 0.4;
    p.hipL = 0.12; p.hipR = -0.12;
  } else if (anim === 'death') {
    const k = ease(t);
    p.pitch = k * 1.45;          // topples backward onto the ground
    p.sink = k * 2;
    p.kneeL = 0.15 + k * 1.5;
    p.kneeR = 0.15 + k * 1.3;
    p.hipL = -k * 0.55; p.hipR = -k * 0.35;
    p.shoulderL = -k * 1.5; p.shoulderR = -k * 1.2;
    p.armOutL = k * 0.9; p.armOutR = -k * 0.9;
    p.elbowL = 0.3 + k * 0.4; p.elbowR = 0.3 + k * 0.3;
    p.roll = k * 0.35;
  }

  // Nothing that floats plants a foot. The stride above is replaced by a hover:
  // the whole body rides higher and the legs hang wherever the arms have got to,
  // so idle and walk differ only in how far he rises and how much he sways.
  // Death is left alone -- a thing that dies stops holding itself up.
  if (spec.float && anim !== 'death') {
    const h = Math.sin(ph);
    // Attack and cast throw the arms up, so those two ride lower: the hover and
    // a raised hand together would push a hand through the top of the cell.
    const hover = anim === 'walk' ? 7.5 : anim === 'idle' ? 6 : 4.5;
    p.bob = hover + h * (anim === 'walk' ? 2 : 1.4);
    p.sink = 0;
    p.hipL = 0.34; p.hipR = 0.2;
    p.kneeL = 0.62 + h * 0.06; p.kneeR = 0.5 - h * 0.06;
    if (anim === 'idle' || anim === 'walk') {
      p.shoulderL = -0.12 + h * 0.07;
      p.shoulderR = -0.12 - h * 0.07;
      p.armOutL = 0.34; p.armOutR = -0.34;
      p.elbowL = 0.5; p.elbowR = 0.5;
      p.twist = h * 0.06;
      p.lean = spec.build.hunch - 0.05;
    }
  }
  return p;
}

// Forward kinematics in the local frame. Angles rotate in the forward-up plane;
// armOut swings the arm sideways away from the body.
function skeleton(spec, a) {
  const b = spec.build;
  const S = spec.scale;
  const up = (u) => (u + a.bob - a.sink) * S;

  const pelvis = [a.lean * 6 * S, 0, up(b.hipU)];
  const chest = [
    pelvis[0] + Math.sin(a.lean) * (b.chestU - b.hipU) * S,
    a.twist * 2 * S,
    up(b.chestU),
  ];
  const neck = [
    chest[0] + Math.sin(a.lean) * (b.neckU - b.chestU) * S,
    chest[1],
    up(b.neckU),
  ];
  const head = [
    neck[0] + Math.sin(a.lean) * (b.headU - b.neckU) * S + b.headF * S,
    neck[1],
    up(b.headU),
  ];

  const leg = (side, hipA, kneeA) => {
    const hip = [pelvis[0], side * b.hipSide * S * b.stance, up(b.hipU)];
    const knee = [
      hip[0] + Math.sin(hipA) * b.thigh * S,
      hip[1],
      hip[2] - Math.cos(hipA) * b.thigh * S,
    ];
    const sa = hipA - kneeA;
    const foot = [
      knee[0] + Math.sin(sa) * b.shin * S,
      knee[1],
      Math.max(0, knee[2] - Math.cos(sa) * b.shin * S),
    ];
    return { hip, knee, foot };
  };

  const arm = (side, shA, elA, outA, upA) => {
    const sh = [chest[0], side * b.shoulder * S, up(b.chestU)];
    const dirF = Math.sin(shA) * Math.cos(upA);
    const dirU = -Math.cos(shA) * Math.cos(upA) + Math.sin(upA) * 1.0;
    const dirS = Math.sin(outA);
    const L = b.upperArm * S;
    const elbow = [sh[0] + dirF * L, sh[1] + dirS * L, sh[2] + dirU * L];
    const sa = shA - elA;
    const dirF2 = Math.sin(sa) * Math.cos(upA);
    const dirU2 = -Math.cos(sa) * Math.cos(upA) + Math.sin(upA) * 1.0;
    const L2 = b.foreArm * S;
    const hand = [elbow[0] + dirF2 * L2, elbow[1] + dirS * L2 * 0.5, elbow[2] + dirU2 * L2];
    return { sh, elbow, hand };
  };

  const j = {
    pelvis, chest, neck, head,
    legL: leg(1, a.hipL, a.kneeL),
    legR: leg(-1, a.hipR, a.kneeR),
    armL: arm(1, a.shoulderL, a.elbowL, a.armOutL, a.armUpL),
    armR: arm(-1, a.shoulderR, a.elbowR, a.armOutR, a.armUpR),
  };

  // Death topples the whole figure about the ground point.
  if (a.pitch || a.roll) {
    const cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
    const cr = Math.cos(a.roll), sr = Math.sin(a.roll);
    const bend = (p) => {
      let f = p[0], s = p[1], u = p[2];
      const nf = f * cp + u * sp;
      const nu = -f * sp + u * cp;
      f = nf; u = Math.max(-1, nu);
      const ns = s * cr - u * sr;
      const nu2 = s * sr + u * cr;
      return [f, ns, Math.max(-1, nu2)];
    };
    for (const k of ['pelvis', 'chest', 'neck', 'head']) j[k] = bend(j[k]);
    for (const k of ['legL', 'legR']) {
      j[k] = { hip: bend(j[k].hip), knee: bend(j[k].knee), foot: bend(j[k].foot) };
    }
    for (const k of ['armL', 'armR']) {
      j[k] = { sh: bend(j[k].sh), elbow: bend(j[k].elbow), hand: bend(j[k].hand) };
    }
  }
  return j;
}

// ------------------------------------------------------------------- drawing

function makeRamps(pal) {
  const out = {};
  for (const k in pal) out[k] = ramp(pal[k]);
  return out;
}

// Build the ordered draw list. Each entry carries a depth so the whole figure
// can be painted back to front regardless of which way it faces.
function segments(spec, j, R, anim, t, a) {
  const segs = [];
  const b = spec.build, S = spec.scale, P = spec.parts || {};
  const add = (type, args, rm, depth, extra) => segs.push({ type, args, rm, depth, ...extra });
  const dep = (a, bb) => (a[1] + (bb ? bb[1] : a[1])) / 2;

  const legRamp = P.bareLegs ? R.skin : (R.cloth2 || R.cloth);
  const armRamp = P.bareArms ? R.skin : R.cloth;

  // A two-handed weapon is held in both hands: pull the left hand onto the
  // haft below the right. Mutating the joint here means the left forearm
  // capsule drawn later already points at the grip.
  if (spec.weapon === 'greataxe' || spec.weapon === 'hammer') {
    const A = j.armR;
    const dxw = A.hand[0] - A.elbow[0], dyw = A.hand[1] - A.elbow[1], dzw = A.hand[2] - A.elbow[2];
    const lw = Math.hypot(dxw, dyw, dzw) || 1;
    j.armL.hand = [
      A.hand[0] - (dxw / lw) * 4 * S,
      A.hand[1] - (dyw / lw) * 4 * S + 1.5 * S,
      A.hand[2] - (dzw / lw) * 4 * S,
    ];
  }

  // Crawlers, serpents and insects have no pair of legs to stand on: the poser
  // still computes them, and the parts below draw whatever the creature walks
  // on instead.
  if (!P.noLegs) {
    for (const side of ['legL', 'legR']) {
      const L = j[side];
      add('capsule', [L.hip, L.knee, b.thighR * S, b.shinR * S * 1.15], legRamp, dep(L.hip, L.knee) - 0.5);
      add('capsule', [L.knee, L.foot, b.shinR * S * 1.1, b.shinR * S * 0.85], legRamp, dep(L.knee, L.foot) - 0.4);
      add('capsule', [L.foot, [L.foot[0] + 2.6 * S, L.foot[1], Math.max(0.6, L.foot[2])], b.shinR * S * 0.95, b.shinR * S * 0.8],
        R.boot || R.cloth2 || R.cloth, dep(L.foot) - 0.3);
    }
  }

  // A grub drags its length behind it: rings that swell just off the head end
  // and taper to the tail, each wriggling out of step with the one ahead. The
  // body rides low, so the reared front is the only part above knee height.
  if (P.crawl) {
    const rm = R.chitin || R.cloth2 || R.cloth;
    // Segments stay short and the tail keeps its own radius clear of the floor.
    // Sideways in this projection is also downwards, so a long body laid flat
    // runs off the bottom of the cell where the sprite has only ten pixels of
    // room below the feet.
    const seg = 4.6 * S, wob = anim === 'death' ? 0 : 1.6 * S;
    for (let i = 0; i < P.crawl; i++) {
      const k = i / P.crawl;
      const r0 = b.torsoR * S * (1.02 - k * 0.5), r1 = b.torsoR * S * (1.02 - (k + 1 / P.crawl) * 0.5);
      const u0 = Math.max(r0 * 1.15, j.pelvis[2] * (1 - k * 0.5));
      const u1 = Math.max(r1 * 1.15, j.pelvis[2] * (1 - (k + 1 / P.crawl) * 0.5));
      const p0 = [j.pelvis[0] - i * seg, j.pelvis[1] + Math.sin(t * TAU + i * 0.9) * wob, u0];
      const p1 = [j.pelvis[0] - (i + 1) * seg, j.pelvis[1] + Math.sin(t * TAU + (i + 1) * 0.9) * wob, u1];
      add('capsule', [p0, p1, r0, r1], rm, dep(p0, p1) - 0.6 - i * 0.1);
    }
  }

  // Insect legs: a splayed pair per body station, knee up and out, foot planted
  // wide of the body. They scuttle out of phase on the walk, which is what sells
  // a thing with too many legs as moving rather than sliding.
  if (P.bugLegs) {
    const rm = R.chitin || R.cloth2 || R.cloth;
    const n = P.bugLegs;
    for (let i = 0; i < n; i++) {
      const f = lerp(5, -7, n === 1 ? 0 : i / (n - 1)) * S;
      for (const side of [-1, 1]) {
        const lift = anim === 'walk'
          ? Math.max(0, Math.sin(t * TAU + i * 1.7 + (side > 0 ? Math.PI : 0))) * 2.4 * S : 0;
        const hip = [j.pelvis[0] + f, side * b.hipSide * S * 0.9, j.pelvis[2]];
        const knee = [hip[0] + f * 0.25, side * (b.hipSide + 8) * S, j.pelvis[2] + 5 * S];
        const foot = [hip[0] + f * 0.7, side * (b.hipSide + 13) * S, lift + 0.6];
        add('capsule', [hip, knee, 1.7 * S, 1.3 * S], rm, dep(hip, knee) - 0.2);
        add('capsule', [knee, foot, 1.3 * S, 0.7 * S], rm, dep(knee, foot) - 0.1);
      }
    }
  }

  // A serpent stands on its own body: the length piles into a coil and the
  // trunk rises out of it, with the tail thrown clear so the pile still reads
  // as one animal rather than a heap of stones.
  if (P.coil) {
    const rm = R.scales || R.cloth2 || R.cloth;
    for (let i = 0; i < 3; i++) {
      const c = [j.pelvis[0] * 0.5, j.pelvis[1], (3 + i * 5) * S];
      add('ellipse', [c, (9.5 - i * 2.2) * S], rm, -0.8 + i * 0.1);
    }
    const tb = [j.pelvis[0] * 0.5 - 4 * S, j.pelvis[1] + 3 * S, 3 * S];
    const tt = [tb[0] - 13 * S, tb[1] + 13 * S + (anim === 'death' ? 0 : Math.sin(t * TAU) * 2 * S), 2 * S];
    add('capsule', [tb, tt, 3.4 * S, 0.8 * S], rm, dep(tb, tt) - 1.0);
  }

  // A robe is a flared skirt, not a tube: it stops at mid-shin and swells at
  // the hem, so the legs still read below it and the waist stays narrow.
  if (P.robe) {
    const hem = [j.pelvis[0] * 0.5, j.pelvis[1], (anim === 'death' ? 3 : 13) * S];
    add('capsule', [j.chest, hem, b.torsoR * S * 0.8, b.torsoR * S * 1.45], R.cloth, dep(j.chest, hem) + 0.2);
  }

  // Narrow at the hip, wide at the chest: the V-taper is most of what makes
  // the silhouette read as a warrior rather than a bottle.
  add('capsule', [j.pelvis, j.chest, b.torsoR * S * 0.68, b.torsoR * S * 1.06], R.cloth, dep(j.pelvis, j.chest));
  // A yoke across the shoulder joints. Without it the outline pass severs a
  // wide-shouldered figure's arms from its chest whenever a gap opens.
  add('capsule', [j.armL.sh, j.armR.sh, b.armR * S * 1.1, b.armR * S * 1.1], R.cloth, dep(j.chest) + 0.05);

  // A domed carapace over the back, set behind the torso so the body still
  // shows at the shoulders. On the beetles it is most of the silhouette.
  if (P.shell) {
    const c = [j.chest[0] - 2.5 * S, j.chest[1], lerp(j.pelvis[2], j.chest[2], 0.55)];
    add('ellipse', [c, b.torsoR * S * 1.45], R.chitin || R.cloth, dep(j.chest) - 0.9);
  }

  if (P.ribs) {
    for (let i = 0; i < 3; i++) {
      const u = lerp(j.pelvis[2], j.chest[2], 0.35 + i * 0.24);
      const cf = lerp(j.pelvis[0], j.chest[0], 0.35 + i * 0.24);
      const w = b.torsoR * S * (0.95 - i * 0.06);
      add('capsule', [[cf, j.chest[1] - w, u], [cf, j.chest[1] + w, u], 1.1 * S, 1.1 * S], R.bone, dep(j.chest) + 0.6);
    }
  }

  if (P.belt) {
    add('capsule', [[j.pelvis[0], j.pelvis[1] - b.torsoR * S, j.pelvis[2] + 2 * S],
      [j.pelvis[0], j.pelvis[1] + b.torsoR * S, j.pelvis[2] + 2 * S], 1.6 * S, 1.6 * S],
      R.trim || R.metal || R.cloth2, dep(j.pelvis) + 0.7);
  }

  for (const side of ['armL', 'armR']) {
    const A = j[side];
    // Fat at the shoulder, tapering fast: the deltoid bulge carries the
    // shoulder mass without another joint.
    add('capsule', [A.sh, A.elbow, b.armR * S * 1.35, b.armR * S * 0.8], armRamp, dep(A.sh, A.elbow) + 0.1);
    add('capsule', [A.elbow, A.hand, b.foreR * S * 1.05, b.foreR * S * 0.85], P.bareArms ? R.skin : armRamp, dep(A.elbow, A.hand) + 0.2);
    add('ellipse', [A.hand, b.foreR * S * 1.05], R.skin, dep(A.hand) + 0.3);
  }

  add('capsule', [j.chest, j.neck, b.neckR * S * 1.3, b.neckR * S], R.skin, dep(j.chest, j.neck) + 0.3);
  add('ellipse', [j.head, b.headR * S], P.skull ? R.bone : R.skin, dep(j.head) + 0.4, { head: true });

  if (P.hair) add('ellipse', [[j.head[0] - 1.2 * S, j.head[1], j.head[2] + 1.6 * S], b.headR * S * 0.95], R.hair, dep(j.head) + 0.35);
  if (P.hood) {
    add('ellipse', [[j.head[0] - 1.0 * S, j.head[1], j.head[2] + 1.4 * S], b.headR * S * 1.18], R.cloth, dep(j.head) + 0.32);
  }
  if (P.horns) {
    for (const s of [-1, 1]) {
      const base = [j.head[0], j.head[1] + s * b.headR * S * 0.75, j.head[2] + b.headR * S * 0.55];
      const tip = [base[0] - 2 * S, base[1] + s * 3.4 * S, base[2] + 5.5 * S];
      add('capsule', [base, tip, 1.7 * S, 0.5 * S], R.horn || R.bone, dep(j.head) + 0.5);
    }
  }
  if (P.cape) {
    const top = [j.chest[0] - 1.5 * S, j.chest[1], j.chest[2] + 2 * S];
    const bot = [top[0] - 4 * S - (anim === 'walk' ? 2 * S * Math.sin(t * TAU) : 0), j.chest[1], 4 * S];
    add('capsule', [top, bot, b.torsoR * S * 0.9, b.torsoR * S * 1.25], R.cape || R.cloth, dep(j.chest) - 1.2);
  }
  // Wings as a spar with three heavy pinions hung off it, folded in rather than
  // spread: a wing held out to full span turns a vulture into a scarecrow, and
  // both wings sit behind the body because at eighty pixels a near wing
  // occluding the chest costs more silhouette than the depth it buys.
  // `wings: 'broad'` widens the pinions and hangs them shorter and further out.
  // A bird's narrow pinion on a demon's frame reads as a second set of legs
  // sprouting from the shoulders -- membrane wants width, feathers want length.
  if (P.wings) {
    const rm = R.wing || R.cape || R.cloth;
    const broad = P.wings === 'broad';
    const flap = anim === 'idle' || anim === 'walk' ? Math.sin(t * TAU) : 0;
    for (const side of [-1, 1]) {
      const root = [j.chest[0] - 2 * S, side * b.shoulder * S * 0.7, j.chest[2] + 2 * S];
      // The tip rises only a little: out to the side is also up the screen in
      // this projection, so a wing held high clips the roof of the cell.
      const wrist = [root[0] - 5 * S, side * (b.shoulder + 8 + flap * 1.5) * S, root[2] + (2 + flap * 2) * S];
      add('capsule', [root, wrist, 3.0 * S, 1.6 * S], rm, dep(root, wrist) - 1.4);
      for (let i = 0; i < 3; i++) {
        const k = i / 2;
        const from = [lerp(root[0], wrist[0], k), lerp(root[1], wrist[1], k), lerp(root[2], wrist[2], k)];
        const drop = broad ? 8 + k * 5 - flap * 2 : 13 + k * 8 - flap * 3;
        // Width goes into the pinion, not into the span: a broad wing carried any
        // further out clips the side walls of the cell, and out to the side is
        // where this projection has the least room to give.
        const out = broad ? 1.5 + k * 2 : 1 + k * 3;
        const to = [from[0] - (3 + k * 5) * S, from[1] + side * out * S, from[2] - drop * S];
        add('capsule', [from, to, (broad ? 3.8 : 2.8) * S, (broad ? 1.9 : 1.0) * S], rm, dep(from, to) - 1.5);
      }
    }
  }
  // A hooked beak, wide at the head and drawn well forward. Given any less mass
  // than this it disappears into the skull at game zoom.
  if (P.beak) {
    const base = [j.head[0] + b.headR * S * 0.55, j.head[1], j.head[2] - 0.5 * S];
    const tip = [base[0] + 6.5 * S, j.head[1], base[2] - 3 * S];
    add('capsule', [base, tip, 2.6 * S, 0.6 * S], R.horn || R.bone || R.skin, dep(j.head) + 0.6);
  }
  // A tail dragged out behind the pelvis in two tapering sections, swaying out
  // of phase with the stride. The sway stays small and every joint keeps its own
  // radius above the floor: sideways in this projection is also downwards, and
  // the sprite has only ten pixels below the foot line to spend.
  if (P.tail) {
    const rm = R.scales || R.cloth2 || R.cloth;
    const sway = anim === 'death' ? 0 : Math.sin(t * TAU) * 1.6 * S;
    const r0 = b.torsoR * S * 0.5;
    // Held clear of the floor rather than dropped to it: behind the body is also
    // below the foot line at half the facings, and there are only ten pixels
    // there. Short sections for the same reason.
    const p0 = [j.pelvis[0] - 1 * S, j.pelvis[1], Math.max(r0 * 1.2, j.pelvis[2] * 0.75)];
    const p1 = [p0[0] - 6.5 * S, p0[1] + sway, Math.max(r0 * 1.3, p0[2] * 0.7)];
    const p2 = [p1[0] - 6.5 * S, p1[1] + sway * 1.5, Math.max(r0 * 1.2, p1[2] * 0.9)];
    add('capsule', [p0, p1, r0, r0 * 0.62], rm, dep(p0, p1) - 0.7);
    add('capsule', [p1, p2, r0 * 0.62, 0.8 * S], rm, dep(p1, p2) - 0.8);
  }

  if (P.spikes) {
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -1 : 1;
      const u = lerp(j.pelvis[2], j.chest[2], i % 2 ? 0.45 : 0.9);
      const base = [j.chest[0] - 1 * S, j.chest[1] + s * b.torsoR * S * 0.7, u];
      const tip = [base[0] - 7 * S, base[1] + s * 7 * S, u + 6 * S];
      add('capsule', [base, tip, 2.2 * S, 0.4 * S], R.carapace || R.cloth, dep(base, tip) - 1.5);
    }
  }
  if (P.quills) {
    for (let i = 0; i < 7; i++) {
      const f = -1 + (i / 6) * 2;
      const base = [j.chest[0] + f * 3 * S, j.chest[1], j.chest[2] + b.torsoR * S * 0.5];
      const tip = [base[0] + f * 3 * S - 1 * S, j.chest[1], base[2] + 6 * S];
      add('capsule', [base, tip, 1.3 * S, 0.3 * S], R.quill || R.hair, dep(base) - 0.6);
    }
  }

  const W = spec.weapon;
  if (W && W !== 'none') {
    const A = j.armR;
    const dx = A.hand[0] - A.elbow[0], dy = A.hand[1] - A.elbow[1], dz = A.hand[2] - A.elbow[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const at = (k) => [A.hand[0] + ux * k * S, A.hand[1] + uy * k * S, A.hand[2] + uz * k * S];

    // A shaft weapon is gripped, not glued to the forearm: it stands upright
    // beside the body and tilts with the swing. Following the forearm instead
    // makes an idle character point their staff at the floor.
    const tilt = (a.shoulderR || 0) * 0.55 + (a.lean || 0) * 0.4;
    const shaft = (lowU, highU) => {
      // Anchor most of the way back toward the body. Pinning the shaft to the
      // hand alone makes it slide left and right with every arm swing.
      const hf = j.chest[0] + (A.hand[0] - j.chest[0]) * 0.45;
      const hs = j.chest[1] + (A.hand[1] - j.chest[1]) * 0.8;
      const hu = A.hand[2];
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      return [
        [hf + st * (lowU - hu), hs, hu + ct * (lowU - hu)],
        [hf + st * (highU - hu), hs, hu + ct * (highU - hu)],
      ];
    };

    if (W === 'staff') {
      const [a1, a2] = shaft(1 * S, (b.headU + 7) * S);
      add('capsule', [a1, a2, 1.4 * S, 1.3 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
      add('ellipse', [a2, 3.0 * S], R.gem || R.trim, dep(a2) + 0.7);
    } else if (W === 'scythe') {
      const [a1, a2] = shaft(1 * S, (b.headU + 5) * S);
      add('capsule', [a1, a2, 1.3 * S, 1.2 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
      const t2 = [a2[0] - 4 * S, a2[1] + 9 * S, a2[2] - 2 * S];
      add('capsule', [a2, t2, 2.2 * S, 0.4 * S], R.metal, dep(a2, t2) + 0.65);
    } else if (W === 'sword') {
      const a1 = at(-2), a2 = at(16);
      add('capsule', [a1, a2, 1.6 * S, 0.5 * S], R.metal, dep(a1, a2) + 0.6);
      const g1 = at(-1);
      add('capsule', [[g1[0], g1[1] - 3 * S, g1[2]], [g1[0], g1[1] + 3 * S, g1[2]], 1.0 * S, 1.0 * S], R.trim || R.metal, dep(g1) + 0.65);
    } else if (W === 'greataxe') {
      // Long haft carried on the forearm line, wedge head near the top.
      const a1 = at(-4), a2 = at(17);
      add('capsule', [a1, a2, 1.7 * S, 1.4 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
      const hp = at(13);
      // Blade: a fat-to-thin capsule swept out to the side reads as a wedge.
      const tip = [hp[0], hp[1] + 5.5 * S, hp[2] + 1 * S];
      add('capsule', [hp, tip, 3.4 * S, 0.8 * S], R.metal, dep(hp, tip) + 0.65);
      // Back spike for silhouette.
      const spk = [hp[0], hp[1] - 2.6 * S, hp[2] + 0.5 * S];
      add('capsule', [hp, spk, 1.6 * S, 0.5 * S], R.metal, dep(hp, spk) + 0.64);
    } else if (W === 'hammer') {
      // A smith's maul: a thick haft on the forearm line and a squat iron head
      // laid across the top of it. Blunt on both faces, which is what tells it
      // apart from the barbarian's axe at sixty pixels.
      const a1 = at(-4), a2 = at(12);
      add('capsule', [a1, a2, 1.9 * S, 1.5 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
      const hp = at(10);
      const f1 = [hp[0], hp[1] - 3.4 * S, hp[2] + 0.6 * S];
      const f2 = [hp[0], hp[1] + 3.4 * S, hp[2] + 0.6 * S];
      add('capsule', [f1, f2, 3.1 * S, 3.1 * S], R.metal, dep(f1, f2) + 0.65);
    } else if (W === 'club') {
      const a1 = at(-3), a2 = at(11);
      add('capsule', [a1, a2, 1.1 * S, 2.6 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
    } else if (W === 'bow') {
      // A vertical arc held at the hand, three segments bending away from the body.
      const h = A.hand;
      const arc = [
        [h[0] - 1 * S, h[1], h[2] - 12 * S],
        [h[0] + 1.5 * S, h[1], h[2] - 4 * S],
        [h[0] + 1.5 * S, h[1], h[2] + 4 * S],
        [h[0] - 1 * S, h[1], h[2] + 12 * S],
      ];
      for (let i = 0; i < arc.length - 1; i++) {
        add('capsule', [arc[i], arc[i + 1], 1.1 * S, 1.1 * S], R.wood || R.cloth2, dep(arc[i], arc[i + 1]) + 0.6);
      }
      add('capsule', [arc[0], arc[3], 0.5 * S, 0.5 * S], R.bone || R.trim, dep(arc[0], arc[3]) + 0.55);
    }
  }

  return segs;
}

// ------------------------------------------------------------------- baking

function bakeFrame(spec, anim, frame, dir, R) {
  const frames = ANIMS[anim];
  const t = frame / frames;
  const a = poseAngles(anim, t, spec);
  const j = skeleton(spec, a);
  const segs = segments(spec, j, R, anim, t, a);

  const th = facingFor(dir);
  const cs = Math.cos(th), sn = Math.sin(th);
  // Local (forward, side, up) into world, then world into screen.
  const proj = (p) => {
    const wx = p[0] * cs - p[1] * sn;
    const wy = p[0] * sn + p[1] * cs;
    return [
      CELL / 2 + (wx - wy) * PX,
      FOOT_Y - p[2] + (wx + wy) * PY,
    ];
  };
  // Depth in world terms: larger means nearer the viewer.
  const depthOf = (p) => (p[0] * cs - p[1] * sn) + (p[0] * sn + p[1] * cs);

  for (const s of segs) {
    if (s.type === 'capsule') s.z = (depthOf(s.args[0]) + depthOf(s.args[1])) / 2 + (s.depth || 0) * 0.001;
    else s.z = depthOf(s.args[0]) + (s.depth || 0) * 0.001;
    s.z += (s.depth || 0) * 0.35;
  }
  segs.sort((p, q) => p.z - q.z);

  const buf = new Buf(CELL, CELL);
  // Does the creature face the viewer? Used to decide whether to draw a face.
  const fwdScreen = (cs - sn) * 0 + (cs + sn);
  const facingCamera = fwdScreen > 0.2;

  for (const s of segs) {
    if (s.type === 'capsule') {
      const p0 = proj(s.args[0]), p1 = proj(s.args[1]);
      capsule(buf, p0[0], p0[1], s.args[2], p1[0], p1[1], s.args[3], s.rm);
    } else {
      const p = proj(s.args[0]);
      const r = s.args[1];
      ellipse(buf, p[0], p[1], r, r * 0.94, s.rm);
      if (s.head && facingCamera && spec.face !== false) drawFace(buf, spec, p[0], p[1], r, R);
    }
  }

  outline(buf, OUTLINE);
  if (spec.tint) tint(buf, spec.tint[0], spec.tint[1]);
  // Shade the ankles toward the ground so the figure sits on the tile instead
  // of hovering over it; the renderer's blob shadow does the rest.
  groundFade(buf, FOOT_Y - 10, 0.32);
  return buf;
}

function drawFace(buf, spec, cx, cy, r, R) {
  const eye = spec.eyeColor ? packHex(spec.eyeColor) : packRGB(20, 16, 22);
  const ex = r * 0.42, ey = -r * 0.1;
  if (spec.eyeGlow) {
    ellipseF(buf, cx - ex, cy + ey, 1.5, 1.2, eye);
    ellipseF(buf, cx + ex * 0.55, cy + ey, 1.5, 1.2, eye);
  } else {
    px(buf, cx - ex, cy + ey, eye);
    px(buf, cx - ex, cy + ey + 1, eye);
    px(buf, cx + ex * 0.6, cy + ey, eye);
    px(buf, cx + ex * 0.6, cy + ey + 1, eye);
  }
  if (spec.parts && spec.parts.fangs) {
    const w = packHex('#e8e4d8');
    px(buf, cx - 1, cy + r * 0.45, w);
    px(buf, cx + 1, cy + r * 0.45, w);
  }
  void R;
}

// Pack every frame of one figure into a single sheet, eight cells per row.
export function bakeFigure(spec) {
  const R = makeRamps(spec.palette);
  const anims = spec.anims || Object.keys(ANIMS);
  const info = {};
  let total = 0;
  for (const a of anims) {
    info[a] = { offset: total, frames: ANIMS[a] };
    total += ANIMS[a] * GEN_DIRS.length;
  }

  const cols = 8;
  const rows = Math.ceil(total / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * CELL;
  sheet.height = rows * CELL;
  const sctx = sheet.getContext('2d');

  for (const a of anims) {
    for (let di = 0; di < GEN_DIRS.length; di++) {
      for (let f = 0; f < ANIMS[a]; f++) {
        const buf = bakeFrame(spec, a, f, GEN_DIRS[di], R);
        const idx = info[a].offset + di * ANIMS[a] + f;
        sctx.putImageData(buf.img, (idx % cols) * CELL, Math.floor(idx / cols) * CELL);
      }
    }
  }

  return {
    canvas: sheet,
    cell: CELL,
    footY: FOOT_Y,
    anims: info,
    has(anim) { return !!info[anim]; },
    index(anim, dir, frame) {
      const a = info[anim] || info.idle;
      const flip = MIRROR_OF[dir] !== undefined;
      const gd = flip ? MIRROR_OF[dir] : dir;
      const slot = GEN_SLOT[gd];
      const fr = ((frame % a.frames) + a.frames) % a.frames;
      const idx = a.offset + slot * a.frames + fr;
      return { sx: (idx % cols) * CELL, sy: Math.floor(idx / cols) * CELL, flip };
    },
  };
}

// --------------------------------------------------------------- figure specs

const humanoid = (over = {}) => ({
  scale: 1, build: { ...DEFAULT_BUILD, ...(over.build || {}) },
  ...over,
  parts: over.parts || {},
});

// The Fallen family are squat imps: an oversized head on a short hunched body,
// under three heads tall. Using the human build at a small scale just makes a
// tiny person.
const IMP_BUILD = {
  ...DEFAULT_BUILD,
  thigh: 12, shin: 11, upperArm: 9, foreArm: 8.5,
  hipU: 23, chestU: 35, neckU: 37, headU: 43, headR: 7.6,
  shoulder: 9.5, hipSide: 4.4,
  thighR: 3.2, shinR: 2.7, armR: 2.5, foreR: 2.1,
  torsoR: 6.0, neckR: 2.6, hunch: 0.35,
};

// Crawlers keep the same skeleton but wear it flat: the hips are almost on the
// floor and the chest is barely above them, so the torso capsule reads as the
// reared front of a body whose length is drawn by `crawl` trailing behind.
const GRUB_BUILD = {
  ...DEFAULT_BUILD,
  thigh: 8, shin: 7, upperArm: 7, foreArm: 6.5,
  hipU: 9, chestU: 18, neckU: 21, headU: 26, headR: 6.4,
  shoulder: 6, hipSide: 4,
  thighR: 2.6, shinR: 2.2, armR: 2.2, foreR: 1.8,
  torsoR: 7.4, neckR: 2.4, hunch: 0.55,
};

export const FIGURE_SPECS = {
  sorceress: humanoid({
    palette: {
      skin: COLORS.sorcSkin, cloth: COLORS.sorcRobe, cloth2: COLORS.sorcRobeAlt,
      trim: COLORS.sorcTrim, hair: COLORS.sorcHair, metal: COLORS.steel,
      wood: COLORS.wood, gem: COLORS.arcane, cape: COLORS.sorcRobeAlt, boot: COLORS.leather,
    },
    scale: 0.94,
    parts: { robe: true, cape: true, hair: true, bareArms: true, belt: true },
    weapon: 'staff',
    build: { ...DEFAULT_BUILD, shoulder: 10, torsoR: 5.5, headR: 5.0 },
  }),

  barbarian: humanoid({
    palette: {
      skin: COLORS.barbSkin, cloth: COLORS.barbHide, cloth2: COLORS.barbFur,
      trim: COLORS.barbTrim, hair: COLORS.barbHair, metal: COLORS.steel,
      wood: COLORS.wood, boot: COLORS.leather,
    },
    scale: 1.02,
    parts: { hair: true, bareArms: true, belt: true },
    weapon: 'greataxe',
    attackStyle: 'twoHand',
    build: {
      ...DEFAULT_BUILD,
      shoulder: 14.5, torsoR: 7.6, armR: 3.6, foreR: 3.0,
      upperArm: 11.5, foreArm: 10.5,
      chestU: 46, neckU: 49, headU: 54, headR: 5.5,
      thighR: 4.3, shinR: 3.3, hipSide: 5.6,
      hunch: -0.08, stance: 1.12,
    },
  }),

  fallen: humanoid({
    palette: {
      skin: COLORS.fallenSkin, cloth: COLORS.fallenCloth, cloth2: COLORS.leather,
      hair: COLORS.fallenCloth, bone: COLORS.boneWhite, horn: COLORS.boneShadow,
      wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.82,
    parts: { horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'club',
    eyeColor: '#ffd24a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: IMP_BUILD,
  }),

  devilkin: humanoid({
    palette: {
      skin: COLORS.devilkinSkin, cloth: '#3a2440', cloth2: COLORS.leather,
      hair: '#3a2440', bone: COLORS.boneWhite, horn: COLORS.boneShadow,
      wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.9,
    parts: { horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'club',
    eyeColor: '#ff6a3a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: IMP_BUILD,
  }),

  shaman: humanoid({
    palette: {
      skin: COLORS.shamanSkin, cloth: COLORS.shamanRobe, cloth2: '#1f3320',
      hair: '#1f3320', bone: COLORS.boneWhite, horn: COLORS.boneShadow,
      wood: COLORS.wood, gem: COLORS.ember, trim: COLORS.gold, metal: COLORS.darkSteel,
    },
    scale: 0.86,
    parts: { horns: true, robe: true, hood: true, bareArms: true, fangs: true },
    weapon: 'staff',
    eyeColor: '#ff9a2a', eyeGlow: true,
    build: { ...IMP_BUILD, hunch: 0.2, headR: 7.1 },
  }),

  zombie: humanoid({
    palette: {
      skin: COLORS.zombieSkin, cloth: COLORS.zombieRag, cloth2: '#3a352a',
      hair: '#33301f', bone: COLORS.boneWhite, wood: COLORS.wood,
      metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.94,
    parts: { bareArms: true, bareLegs: true },
    weapon: 'none',
    eyeColor: '#c8d84a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, hunch: 0.42, torsoR: 6.0, shoulder: 10, headR: 5.6 },
  }),

  ghoul: humanoid({
    palette: {
      skin: COLORS.ghoulSkin, cloth: '#3a3a30', cloth2: '#2e2e26',
      hair: '#2a2a22', bone: COLORS.boneWhite, wood: COLORS.wood,
      metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.88,
    parts: { bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#ff4a4a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, hunch: 0.52, torsoR: 5.0, thighR: 3.0, shinR: 2.4, armR: 2.2, foreR: 1.8, headR: 5.2 },
  }),

  quillrat: humanoid({
    palette: {
      skin: COLORS.quillFur, cloth: COLORS.quillFur, cloth2: '#5f5238',
      hair: COLORS.quillSpine, quill: COLORS.quillSpine, bone: COLORS.boneWhite,
      wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.72,
    parts: { quills: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#ffca3a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...IMP_BUILD, hunch: 0.95, torsoR: 7.0, headR: 6.5,
      thigh: 9, shin: 8, hipU: 16, chestU: 24, neckU: 26, headU: 30,
      upperArm: 7, foreArm: 7,
    },
  }),

  skeleton: humanoid({
    palette: {
      skin: COLORS.boneWhite, cloth: COLORS.boneShadow, cloth2: COLORS.boneShadow,
      bone: COLORS.boneWhite, hair: COLORS.boneShadow, metal: COLORS.darkSteel,
      wood: COLORS.wood, trim: COLORS.darkSteel,
    },
    scale: 0.92,
    parts: { skull: true, ribs: true, bareArms: true, bareLegs: true },
    weapon: 'sword',
    eyeColor: '#ff3a2a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, torsoR: 4.6, thighR: 2.7, shinR: 2.2, armR: 2.0, foreR: 1.7, headR: 5.2 },
  }),

  corpsefire: humanoid({
    palette: {
      skin: COLORS.corpsefire, cloth: '#5a1a14', cloth2: COLORS.leather,
      hair: '#5a1a14', bone: COLORS.boneWhite, horn: '#f0d8a0',
      wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.gold,
    },
    scale: 1.2,
    parts: { horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'club',
    eyeColor: '#ffee6a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...IMP_BUILD, torsoR: 7.0, headR: 8.4, shoulder: 10.5 },
  }),

  // The Smith. Wider than the barbarian and half a head shorter, which is the
  // silhouette of somebody who has spent a life at an anvil: soot-grey hide, a
  // leather apron, ember in the eyes and both hands on the maul.
  smith: humanoid({
    // The maul is the only bright thing on him: steel head, tan haft. Painted
    // any darker it disappears into the apron at sixty pixels.
    palette: {
      skin: '#6d5b50', cloth: '#4a3a2c', cloth2: '#33291f', trim: '#8a6a3a',
      hair: '#241d16', metal: COLORS.steel, wood: COLORS.leather,
      bone: COLORS.boneWhite, gem: COLORS.ember, boot: COLORS.leather,
    },
    scale: 1.1,
    parts: { bareArms: true, belt: true },
    weapon: 'hammer',
    attackStyle: 'twoHand',
    eyeColor: '#ff9a2a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15.5, torsoR: 8.4, armR: 3.9, foreR: 3.2,
      upperArm: 11.5, foreArm: 10.5,
      thigh: 15.5, shin: 14.5,
      hipU: 31, chestU: 44, neckU: 46, headU: 50, headR: 5.2,
      thighR: 4.7, shinR: 3.6, hipSide: 6.0,
      hunch: 0.12, stance: 1.16,
    },
  }),

  bloodraven: humanoid({
    palette: {
      skin: COLORS.ravenSkin, cloth: COLORS.ravenCloth, cloth2: '#3a1220',
      hair: '#2a1418', cape: '#3a1220', bone: COLORS.boneWhite,
      wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.gold, boot: COLORS.leather,
    },
    scale: 1.04,
    parts: { cape: true, hair: true, hood: true, bareArms: true, belt: true },
    weapon: 'bow',
    eyeColor: '#ff2a2a', eyeGlow: true,
    build: { ...DEFAULT_BUILD, torsoR: 5.6, shoulder: 10.5 },
  }),

  // The encampment. Townsfolk only ever stand and breathe, so one animation is
  // all they cost.
  akara: humanoid({
    palette: {
      skin: '#c9a684', cloth: '#d8cfae', cloth2: '#b3a683', trim: COLORS.gold,
      hair: '#cfc7bb', metal: COLORS.gold, wood: COLORS.wood, gem: COLORS.arcane,
      cape: '#c2b691', boot: COLORS.leather,
    },
    scale: 0.96,
    parts: { robe: true, hood: true, cape: true, belt: true },
    weapon: 'staff',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, torsoR: 6.0, headR: 5.2, hunch: 0.12 },
  }),

  charsi: humanoid({
    palette: {
      skin: '#c08c60', cloth: '#6d4326', cloth2: '#4d3a2a', trim: '#8a6a3a',
      hair: '#3a2418', metal: COLORS.steel, wood: COLORS.wood, gem: COLORS.ember,
      boot: COLORS.leather,
    },
    scale: 1.0,
    parts: { hair: true, bareArms: true, belt: true },
    weapon: 'club',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, shoulder: 12, torsoR: 6.6, armR: 3.2, headR: 5.2 },
  }),

  gheed: humanoid({
    palette: {
      skin: '#b3875a', cloth: '#5d2f6a', cloth2: '#7a4a2a', trim: COLORS.gold,
      hair: '#241a14', metal: COLORS.gold, wood: COLORS.wood, gem: COLORS.gold,
      cape: '#4a2456', boot: COLORS.leather,
    },
    scale: 0.9,
    parts: { robe: true, cape: true, hair: true, belt: true },
    weapon: 'none',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, torsoR: 7.8, shoulder: 10.5, headR: 5.5, hunch: 0.2 },
  }),

  cain: humanoid({
    palette: {
      skin: '#c09c7e', cloth: '#4a4a52', cloth2: '#35353c', trim: '#8a7f6a',
      hair: '#e2ded4', metal: COLORS.darkSteel, wood: COLORS.wood, gem: COLORS.arcane,
      cape: '#3d3d45', boot: COLORS.leather,
    },
    scale: 0.93,
    parts: { robe: true, cape: true, hair: true, belt: true },
    weapon: 'staff',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, torsoR: 5.2, shoulder: 9, headR: 5.2, hunch: 0.4 },
  }),

  kashya: humanoid({
    palette: {
      skin: '#a8724a', cloth: '#3f5a3a', cloth2: COLORS.leather, trim: '#8a6a3a',
      hair: '#1e1a18', metal: COLORS.darkSteel, wood: COLORS.wood, gem: COLORS.blood,
      cape: '#33482f', boot: COLORS.leather,
    },
    scale: 0.97,
    parts: { cape: true, hair: true, bareArms: true, belt: true },
    weapon: 'bow',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, shoulder: 10.5, torsoR: 5.6, headR: 5.2 },
  }),

  warriv: humanoid({
    palette: {
      skin: '#b8794a', cloth: '#8a5a2a', cloth2: '#5a3f22', trim: COLORS.gold,
      hair: '#2a1c14', metal: COLORS.darkSteel, wood: COLORS.wood, gem: COLORS.ember,
      cape: '#7a4e26', boot: COLORS.leather,
    },
    scale: 0.98,
    parts: { robe: true, hood: true, cape: true, belt: true },
    weapon: 'none',
    anims: ['idle'],
    build: { ...DEFAULT_BUILD, torsoR: 6.4, shoulder: 11, headR: 5.3 },
  }),

  andariel: humanoid({
    palette: {
      skin: COLORS.andarielSkin, cloth: COLORS.andarielCarapace, cloth2: '#4a1a26',
      hair: COLORS.andarielHair, carapace: COLORS.andarielCarapace,
      bone: COLORS.boneWhite, horn: '#e8d0b0', metal: COLORS.darkSteel,
      wood: COLORS.wood, trim: COLORS.poison, gem: COLORS.poison,
    },
    // Taller default build means 1.12 would poke through the cell roof on the
    // idle bob; 1.08 keeps her the biggest thing in the room with margin.
    scale: 1.08,
    parts: { spikes: true, hair: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#9aff3a', eyeGlow: true,
    build: { ...DEFAULT_BUILD, torsoR: 5.8, shoulder: 11.5, headR: 5.4, hunch: 0.1 },
  }),

  // ----------------------------------------------------------------- act two
  //
  // The desert roster. Everything out here is bleached: linen, chitin and old
  // bone under a sun that has taken the colour out of all three. Nothing in
  // this act is allowed a bright surface except an eye.

  // A raider in wrapped linen with a curved blade. Human proportions, so the
  // wrap and the scimitar are the whole read; the linen stays dirty enough to
  // sit against sand without glowing off it.
  sandraider: humanoid({
    palette: {
      skin: '#8a6a4a', cloth: '#786d55', cloth2: '#4e4535', trim: '#8a6a3a',
      hair: '#241c16', metal: COLORS.darkSteel, wood: COLORS.wood,
      bone: COLORS.boneShadow, boot: COLORS.leather,
    },
    scale: 1.0,
    parts: { hood: true, bareArms: true, belt: true },
    weapon: 'sword',
    eyeColor: '#e8d8a8',
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, shoulder: 12, torsoR: 6.2, headR: 5.3, hunch: 0.08 },
  }),

  // Carrion on two legs: hunched hard, small skull thrown forward, a beak, and
  // wings folded high behind the shoulders. The feathers are nearly black --
  // a vulture is a silhouette, not a plumage study.
  vulturedemon: humanoid({
    palette: {
      skin: '#6a5f52', cloth: '#3a352c', cloth2: '#2b2721', wing: '#2a251e',
      hair: '#2b2721', bone: COLORS.boneShadow, horn: '#8a7f66',
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#5a4a32',
    },
    scale: 0.98,
    parts: { wings: true, beak: true, hair: true, bareArms: true, bareLegs: true },
    weapon: 'none',
    eyeColor: '#d8b03a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD, hunch: 0.5, headF: 2,
      torsoR: 5.4, shoulder: 11.5, headR: 4.8, thighR: 3.0, shinR: 2.4,
    },
  }),

  // The sand maggot: a pale grub reared up on the front of its own length. Its
  // arms are vestigial feelers, which is why they are drawn thin -- everything
  // this thing has goes into the body behind it.
  sandmaggot: humanoid({
    palette: {
      skin: '#8a7a62', cloth: '#7a6a52', cloth2: '#5e5140', chitin: '#6a5c46',
      hair: '#5e5140', bone: COLORS.boneShadow, horn: '#7a6a4a',
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: COLORS.leather,
    },
    // Bigger than the grub default: at the crawler's low build a scale under one
    // is a pellet on the floor rather than something that eats a man.
    scale: 1.06,
    parts: { crawl: 5, noLegs: true, bareArms: true, fangs: true },
    weapon: 'none',
    eyeColor: '#c8b84a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...GRUB_BUILD,
      hipU: 10, chestU: 22, neckU: 25, headU: 30, headR: 7.0, torsoR: 8.2,
    },
  }),

  // A beetle the size of a dog: shell, six legs, horns for mandibles. The dull
  // copper in the carapace is as far as the lightning flavour goes -- a
  // creature that lit itself would break the ground it stands on.
  scarab: humanoid({
    palette: {
      skin: '#3e3a30', cloth: '#443c2c', cloth2: '#332d22', chitin: '#4e4432',
      hair: '#332d22', bone: COLORS.boneShadow, horn: '#6a5a3a',
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#5a4a2a',
    },
    scale: 0.8,
    parts: { bugLegs: 3, noLegs: true, shell: true, horns: true, fangs: true },
    weapon: 'none',
    eyeColor: '#c8a83a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...GRUB_BUILD, hipU: 11, chestU: 17, neckU: 19, headU: 22, headR: 5.4, torsoR: 6.6, hunch: 0.7 },
  }),

  // Tomb viper: a humanoid trunk out of a coiled snake body, blade in hand. The
  // coil is what carries it -- the torso alone would be a man kneeling.
  clawviper: humanoid({
    palette: {
      skin: '#5c6a54', cloth: '#48543f', cloth2: '#38422f', scales: '#3f4a3a',
      hair: '#2a3324', bone: COLORS.boneShadow, horn: '#8a8268',
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#7a6a3a',
    },
    scale: 0.98,
    parts: { coil: true, noLegs: true, horns: true, bareArms: true, fangs: true },
    weapon: 'sword',
    eyeColor: '#c8e84a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD, hipU: 20, chestU: 36, neckU: 39, headU: 44, headR: 5.2,
      torsoR: 5.6, shoulder: 10.5, hunch: 0.14,
    },
  }),

  // Mummy: the zombie's shamble in grave linen. Bandage bands across the chest
  // are the rib part in a linen colour, and the eyes stay dark -- a corpse
  // wrapped by hand is not lit from inside, it is just old.
  mummy: humanoid({
    palette: {
      skin: '#8a8068', cloth: '#7a7256', cloth2: '#5e5744', bone: '#9a9278',
      hair: '#4a4436', wood: COLORS.wood, metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.96,
    parts: { bareArms: true, bareLegs: true, ribs: true },
    weapon: 'none',
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, hunch: 0.42, torsoR: 6.0, shoulder: 10, headR: 5.6 },
  }),

  // Greater mummy: the same wrapping with a priest's robe and staff over it,
  // and the first light allowed on the roster -- a dull gold in the sockets,
  // because something is still awake in there. Radament's kind.
  greatermummy: humanoid({
    palette: {
      skin: '#8a8068', cloth: '#6a6248', cloth2: '#4e4736', bone: '#9a9278',
      hair: '#4a4436', wood: COLORS.wood, metal: COLORS.gold, trim: COLORS.gold,
      gem: '#c8a83a',
    },
    scale: 1.0,
    parts: { robe: true, hood: true, bareArms: true, ribs: true, belt: true },
    weapon: 'staff',
    eyeColor: '#c8a83a', eyeGlow: true,
    // Stooped by a few units against the human build. A staff is measured off
    // the head, so a full-height caster's stave goes through the cell roof.
    build: {
      ...DEFAULT_BUILD, hunch: 0.3, torsoR: 6.0, shoulder: 10.5, headR: 5.6,
      hipU: 31, chestU: 45, neckU: 47, headU: 52,
    },
  }),

  // Duriel. A grub the size of a cart: the crawler recipe at boss scale, with a
  // horned skull and arms heavy enough to matter. Cold grey-blue chitin rather
  // than ice-bright, so he still belongs to the tomb he is buried in.
  duriel: humanoid({
    palette: {
      skin: '#7a8288', cloth: '#6a727a', cloth2: '#4e565e', chitin: '#5e666e',
      hair: '#4e565e', horn: '#c8c0a8', bone: COLORS.boneWhite,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#8a8f96',
    },
    // The andariel ceiling: big enough to own the room, short enough that the
    // idle bob never pokes a horn through the top of the cell.
    scale: 1.18,
    // Three rings, not five: Duriel is stout rather than long, and at this scale
    // every ring behind him is another ten pixels down the screen.
    parts: { crawl: 3, noLegs: true, shell: true, horns: true, bareArms: true, fangs: true },
    weapon: 'none',
    eyeColor: '#9adcff', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...GRUB_BUILD,
      hipU: 12, chestU: 26, neckU: 30, headU: 36, headR: 7.4,
      torsoR: 9.0, shoulder: 11, upperArm: 11, foreArm: 10,
      armR: 3.6, foreR: 3.0, hunch: 0.3,
    },
  }),

  // --------------------------------------------------------------- act three
  //
  // The jungle roster. Everything here is wet: blue-grey imps, bark, chitin and
  // rotted brocade. The act's one bright note is the Council's gold, and even
  // that is tarnished.

  // Flayer: the Fallen's frame in jungle colours. Smaller and bluer than its
  // desert cousins, and it keeps the club, because a flayer is a fallen imp
  // that learned to hunt in packs of ten.
  flayer: humanoid({
    palette: {
      skin: '#4a5a5e', cloth: '#3a4a3a', cloth2: COLORS.leather, hair: '#2a3a2e',
      bone: COLORS.boneShadow, horn: '#8a8268', wood: COLORS.wood,
      metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.78,
    parts: { horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'club',
    eyeColor: '#e8f04a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: IMP_BUILD,
  }),

  // Flayer shaman: the shaman recipe, rotted green. Same hooded stoop, same
  // staff, and the same job -- it is the one raising the pack back up.
  flayershaman: humanoid({
    palette: {
      skin: '#3f5a4a', cloth: '#26382c', cloth2: '#1b2a20', hair: '#1b2a20',
      bone: COLORS.boneShadow, horn: '#8a8268', wood: COLORS.wood,
      gem: COLORS.poison, trim: '#8a6a3a', metal: COLORS.darkSteel,
    },
    scale: 0.84,
    parts: { horns: true, robe: true, hood: true, bareArms: true, fangs: true },
    weapon: 'staff',
    eyeColor: '#9aff5a', eyeGlow: true,
    build: { ...IMP_BUILD, hunch: 0.2, headR: 7.1 },
  }),

  // Thorned hulk: a walking tree. Long heavy arms, a head sunk between the
  // shoulders, thorns down both flanks and a crown of spines. No weapon -- the
  // arms are the weapon, so they are drawn thicker than the barbarian's.
  thornhulk: humanoid({
    palette: {
      skin: '#4a4030', cloth: '#3e3627', cloth2: '#2e2820', carapace: '#6a5f46',
      quill: '#5e5238', hair: '#2a2a1e', bone: COLORS.boneShadow,
      wood: '#3e3627', metal: COLORS.darkSteel, trim: '#5a4a30',
    },
    scale: 1.16,
    parts: { spikes: true, quills: true, bareArms: true, bareLegs: true },
    weapon: 'none',
    eyeColor: '#c8d84a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15, torsoR: 8.6, armR: 4.2, foreR: 3.4,
      upperArm: 12.5, foreArm: 12, thigh: 14, shin: 13,
      hipU: 28, chestU: 42, neckU: 44, headU: 48, headR: 5.0,
      thighR: 5.0, shinR: 3.8, hipSide: 6.2, hunch: 0.24, stance: 1.2,
    },
  }),

  // Giant spider: eight legs, an abdomen dragged behind, and a head almost on
  // the floor. The legs are what the eye counts, so they get the mass and the
  // body stays small.
  giantspider: humanoid({
    palette: {
      skin: '#3a3630', cloth: '#332f2a', cloth2: '#241f1c', chitin: '#403a32',
      hair: '#241f1c', bone: COLORS.boneShadow, horn: '#6a5f4a',
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#4a4038',
    },
    scale: 0.9,
    parts: { bugLegs: 4, noLegs: true, crawl: 2, shell: true, fangs: true },
    weapon: 'none',
    eyeColor: '#c83a3a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...GRUB_BUILD,
      hipU: 11, chestU: 15, neckU: 16, headU: 17, headR: 5.6,
      torsoR: 7.0, shoulder: 6.5, hunch: 0.9,
    },
  }),

  // Zealot: Zakarum's soldier. Plate over a robe, helm down, cloak, sword out.
  // Human build, held straighter than the raider -- the difference between a
  // bandit and a fanatic is entirely in the posture.
  zealot: humanoid({
    palette: {
      skin: '#8a6a52', cloth: '#4a4a44', cloth2: '#3a3a36', trim: '#7a6a3a',
      hair: '#241c16', metal: COLORS.darkSteel, wood: COLORS.wood,
      cape: '#4a3a2a', bone: COLORS.boneShadow, boot: COLORS.leather,
    },
    scale: 1.0,
    parts: { hood: true, cape: true, bareArms: true, belt: true },
    weapon: 'sword',
    eyeColor: '#e8d8a8',
    anims: ['idle', 'walk', 'attack', 'death'],
    build: { ...DEFAULT_BUILD, shoulder: 13, torsoR: 7.0, armR: 3.2, headR: 5.2, hunch: 0.05, stance: 1.06 },
  }),

  // Council member: the zealot's frame gone to seed under a high priest's robe.
  // Gold at the throat and a staff instead of a blade, which is the whole
  // difference between the man who swings and the man who orders it.
  councilmember: humanoid({
    palette: {
      skin: '#5e4a3a', cloth: '#3a4a38', cloth2: '#2a3428', trim: COLORS.gold,
      hair: '#1a1410', metal: COLORS.gold, wood: COLORS.wood, gem: COLORS.poison,
      cape: '#33402f', bone: COLORS.boneShadow, boot: COLORS.leather,
    },
    scale: 1.0,
    parts: { robe: true, hood: true, cape: true, belt: true },
    weapon: 'staff',
    eyeColor: '#ffca4a', eyeGlow: true,
    build: {
      ...DEFAULT_BUILD, shoulder: 12.5, torsoR: 7.6, headR: 5.3, hunch: 0.12,
      hipU: 31, chestU: 45, neckU: 47, headU: 52,
    },
  }),

  // Mephisto. He does not walk: `float` lifts him off the floor and hangs his
  // legs, and the hover bob is the only motion the walk has. Built squat and
  // heavy rather than tall, so the robe trailing under him has somewhere to go
  // and nothing pokes out of the top of the cell at boss scale.
  mephisto: humanoid({
    palette: {
      skin: '#4e5a66', cloth: '#2b2a3c', cloth2: '#20202e', carapace: '#3a4450',
      quill: '#4a5460', hair: '#20202e', bone: COLORS.boneWhite,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#7a7f8a', gem: COLORS.ice,
    },
    scale: 1.06,
    float: true,
    parts: { robe: true, spikes: true, quills: true, bareArms: true, fangs: true },
    weapon: 'none',
    eyeColor: '#9adcff', eyeGlow: true,
    build: {
      ...DEFAULT_BUILD,
      hipU: 28, chestU: 40, neckU: 42, headU: 46, headR: 6.6,
      torsoR: 8.4, shoulder: 14, armR: 3.6, foreR: 3.0,
      upperArm: 11.5, foreArm: 11, hunch: 0.24,
    },
  }),

  // ---------------------------------------------------------------- act four
  //
  // Hell's roster. Everything here is charcoal with a burn in it: black plate,
  // scorched hide, ember eyes. Fire belongs to the light pass and to the lava
  // vents, so no creature in this act carries a bright surface either -- what
  // the eye reads as heat is a dull red over near-black, not orange.

  // Doom knight: hell's line infantry. Full plate, helm down, cloak, blade out,
  // and no bare skin anywhere -- the armour is the silhouette, so the shoulders
  // are wide and the head sits low between them.
  doomknight: humanoid({
    palette: {
      skin: '#4a4046', cloth: '#2e2b30', cloth2: '#232126', trim: '#6a4a3a',
      hair: '#1c1a1e', metal: COLORS.darkSteel, wood: COLORS.wood,
      cape: '#3a2024', bone: COLORS.boneShadow, boot: '#241f22',
    },
    scale: 1.04,
    parts: { hood: true, cape: true, belt: true },
    weapon: 'sword',
    eyeColor: '#ff4a2a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD, shoulder: 14, torsoR: 7.4, armR: 3.2, foreR: 2.6,
      headR: 5.2, hunch: 0.04, stance: 1.08,
    },
  }),

  // Oblivion knight: the same plate with a mantle over it and a scythe instead
  // of a blade, which is the whole difference between the knight who charges and
  // the one who curses you first. Stooped a few units against the doom knight,
  // because a shaft weapon is measured off the head and a full-height caster
  // pushes the blade through the roof of the cell.
  oblivionknight: humanoid({
    palette: {
      skin: '#3e3a42', cloth: '#26242c', cloth2: '#1c1a20', trim: '#7a6a4a',
      hair: '#16151a', metal: '#5a5560', wood: COLORS.wood,
      cape: '#2a2434', bone: COLORS.boneWhite, boot: '#1f1d22',
    },
    scale: 1.0,
    parts: { hood: true, cape: true, robe: true, belt: true },
    weapon: 'scythe',
    eyeColor: '#9a6aff', eyeGlow: true,
    build: {
      ...DEFAULT_BUILD, shoulder: 14, torsoR: 7.4, armR: 3.2, foreR: 2.6,
      headR: 5.2, hunch: 0.14, stance: 1.08,
      hipU: 31, chestU: 45, neckU: 47, headU: 52,
    },
  }),

  // Balrog: a winged demon that fights with its hands. Wings folded behind the
  // shoulders on the wings recipe's own terms, horns, and a tail out behind, all
  // over hide the colour of a cooled coal.
  balrog: humanoid({
    palette: {
      skin: '#5a3028', cloth: '#3e241e', cloth2: '#2a1a16', wing: '#241a18',
      scales: '#3a221c', hair: '#201512', horn: '#8a7a5a', bone: COLORS.boneShadow,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#6a3a24',
    },
    // Big, on Andariel's terms: the build is stooped by five units so the horns
    // clear the cell roof at a scale over one.
    scale: 1.1,
    parts: { wings: 'broad', horns: true, tail: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#ff7a2a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      hipU: 31, chestU: 44, neckU: 46, headU: 51, headR: 5.8,
      torsoR: 8.0, shoulder: 14, armR: 3.6, foreR: 3.0,
      upperArm: 11.5, foreArm: 10.5, thighR: 4.2, shinR: 3.2,
      hipSide: 5.6, hunch: 0.18, stance: 1.14,
    },
  }),

  // Urdar: a mauler. Shorter than the knights and half again as wide, all of it
  // in the shoulders and the club -- the Smith's proportions with horns on.
  urdar: humanoid({
    palette: {
      skin: '#5e5148', cloth: '#3a3028', cloth2: '#2a231d', trim: '#6a5232',
      hair: '#241c16', horn: '#9a8a68', bone: COLORS.boneShadow,
      metal: COLORS.darkSteel, wood: '#4a3524', boot: COLORS.leather,
    },
    scale: 1.06,
    parts: { horns: true, bareArms: true, belt: true, fangs: true },
    weapon: 'club',
    eyeColor: '#ffb03a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15.5, torsoR: 8.8, armR: 4.0, foreR: 3.3,
      upperArm: 11.5, foreArm: 10.5, thigh: 15, shin: 14,
      hipU: 30, chestU: 43, neckU: 45, headU: 49, headR: 5.4,
      thighR: 4.8, shinR: 3.7, hipSide: 6.0, hunch: 0.2, stance: 1.18,
    },
  }),

  // Diablo. The heaviest thing in the game: horns, a spined back, a tail, and a
  // stoop that puts the shoulders forward of the hips. Built low on purpose --
  // mass at boss scale has to go sideways, because upward is where the cell ends.
  diablo: humanoid({
    palette: {
      skin: '#6a2820', cloth: '#4e1e17', cloth2: '#361511', carapace: '#7a3423',
      quill: '#843e28', scales: '#421913', hair: '#33120f', horn: '#c8b894',
      bone: COLORS.boneWhite, metal: COLORS.darkSteel, wood: COLORS.wood,
      trim: '#a85a26',
    },
    scale: 1.14,
    parts: {
      horns: true, spikes: true, quills: true, tail: true,
      bareArms: true, bareLegs: true, fangs: true,
    },
    weapon: 'none',
    eyeColor: '#ffd24a', eyeGlow: true,
    build: {
      ...DEFAULT_BUILD,
      hipU: 29, chestU: 42, neckU: 44, headU: 48, headR: 6.0,
      torsoR: 9.0, shoulder: 15, armR: 4.0, foreR: 3.3,
      upperArm: 12, foreArm: 11, thigh: 15, shin: 14,
      thighR: 4.8, shinR: 3.7, hipSide: 6.2, hunch: 0.24, stance: 1.2,
    },
  }),

  // ---------------------------------------------------------------- act five
  //
  // The mountain. Frostbite grey and pale fur, with the demons that followed
  // Baal up it keeping act four's charcoal. Snow is bright enough on its own
  // that anything standing on it can afford to be darker than instinct says.

  // Enslaved: the Fallen's frame after a winter on Arreat. Frostbitten skin,
  // rags, the same club -- Baal's army is press-ganged, not bred.
  enslaved: humanoid({
    palette: {
      skin: '#5e6068', cloth: '#3e3a3a', cloth2: COLORS.leather, hair: '#2a2828',
      bone: COLORS.boneShadow, horn: '#8a8478', wood: COLORS.wood,
      metal: COLORS.darkSteel, trim: COLORS.leather,
    },
    scale: 0.84,
    parts: { horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'club',
    eyeColor: '#9adcff', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: IMP_BUILD,
  }),

  // Death minion: Shenk's siege infantry. Bulky, spined down both flanks, and
  // it fights with its hands, so the arms are heavy and there is no weapon to
  // read around them.
  deathminion: humanoid({
    palette: {
      skin: '#4a4a52', cloth: '#33333a', cloth2: '#25252b', carapace: '#5e5e68',
      quill: '#6a6a74', hair: '#1e1e24', horn: '#8a8a94', bone: COLORS.boneShadow,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#5a4a3a',
    },
    scale: 1.04,
    parts: { spikes: true, quills: true, horns: true, bareArms: true, belt: true, fangs: true },
    weapon: 'none',
    eyeColor: '#ff5a3a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15, torsoR: 8.4, armR: 3.9, foreR: 3.2,
      upperArm: 12, foreArm: 11, thigh: 15, shin: 14,
      hipU: 30, chestU: 43, neckU: 45, headU: 49, headR: 5.4,
      thighR: 4.6, shinR: 3.6, hipSide: 5.8, hunch: 0.28, stance: 1.16,
    },
  }),

  // Succubus: a winged caster. Slight where the rest of the act is bulky, which
  // is the point -- she is the one thing on the mountain that reads as fast. No
  // weapon: the hands are for casting, so the cast animation carries her.
  succubus: humanoid({
    palette: {
      skin: '#7a5a5e', cloth: '#3a2434', cloth2: '#2a1a26', wing: '#2b1f2c',
      scales: '#33222e', hair: '#2a1a1e', horn: '#8a7a68', bone: COLORS.boneShadow,
      metal: COLORS.darkSteel, wood: COLORS.wood, gem: COLORS.blood, trim: '#8a4a5a',
    },
    scale: 0.98,
    parts: { wings: 'broad', horns: true, tail: true, hair: true, robe: true, bareArms: true },
    weapon: 'none',
    eyeColor: '#ff5a7a', eyeGlow: true,
    build: { ...DEFAULT_BUILD, torsoR: 5.4, shoulder: 10.5, headR: 5.2, hunch: 0.08 },
  }),

  // Frozen horror: the mountain's own animal. Pale fur over a heavy frame, a fur
  // ruff at the shoulders on the quill recipe, and a head sunk between them. The
  // fur is grey rather than white -- white fur on snow has no silhouette at all.
  frozenhorror: humanoid({
    palette: {
      skin: '#7a808a', cloth: '#66707c', cloth2: '#505a66', quill: '#8a939c',
      carapace: '#7a848e', hair: '#505a66', horn: '#c8c4b0', bone: COLORS.boneWhite,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#9aa4ae',
    },
    scale: 1.14,
    parts: { quills: true, horns: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#9adcff', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15.5, torsoR: 9.0, armR: 4.2, foreR: 3.4,
      upperArm: 12.5, foreArm: 11.5, thigh: 14, shin: 13,
      hipU: 28, chestU: 41, neckU: 43, headU: 47, headR: 6.0,
      thighR: 5.0, shinR: 3.8, hipSide: 6.2, hunch: 0.3, stance: 1.2,
    },
  }),

  // Moon lord: the balrog recipe gone pale. Same wings, same tail, ash-grey hide
  // and a cold light in the eyes instead of an ember -- the ones that came down
  // off the mountain rather than up out of the fire.
  moonlord: humanoid({
    palette: {
      skin: '#5e5a56', cloth: '#403c38', cloth2: '#2c2926', wing: '#2a2724',
      scales: '#3a3632', hair: '#242220', horn: '#c8c0aa', bone: COLORS.boneWhite,
      metal: COLORS.darkSteel, wood: COLORS.wood, trim: '#8a8270',
    },
    scale: 1.08,
    parts: { wings: 'broad', horns: true, tail: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#e8e0a0', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      hipU: 31, chestU: 44, neckU: 46, headU: 51, headR: 5.8,
      torsoR: 8.0, shoulder: 14, armR: 3.6, foreR: 3.0,
      upperArm: 11.5, foreArm: 10.5, thighR: 4.2, shinR: 3.2,
      hipSide: 5.6, hunch: 0.18, stance: 1.14,
    },
  }),

  // Izual. The balrog's frame at boss scale in the cold blue of a thing that was
  // an angel once: pale hide, frost-white horns, ice in the eyes. Nothing about
  // the pose changes -- what he was is carried entirely by the palette.
  izual: humanoid({
    palette: {
      skin: '#54606e', cloth: '#3c4652', cloth2: '#2a323c', wing: '#28303a',
      scales: '#38424e', hair: '#232a34', horn: '#d0dce8', bone: COLORS.boneWhite,
      metal: '#7a8694', wood: COLORS.wood, trim: '#8aa0b8', gem: COLORS.ice,
    },
    // Held at the balrog's scale rather than above it, and heavier in the build
    // instead: he is the biggest winged thing in the game, and a wing tip is
    // already the closest part of any figure here to the side of the cell.
    scale: 1.10,
    parts: { wings: 'broad', horns: true, tail: true, bareArms: true, bareLegs: true, fangs: true },
    weapon: 'none',
    eyeColor: '#9adcff', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      hipU: 30, chestU: 43, neckU: 45, headU: 49, headR: 5.8,
      torsoR: 8.2, shoulder: 14.5, armR: 3.8, foreR: 3.1,
      upperArm: 11.5, foreArm: 10.5, thighR: 4.3, shinR: 3.3,
      hipSide: 5.8, hunch: 0.2, stance: 1.14,
    },
  }),

  // Hephasto the Armourer: the urdar's build with a smith's maul in both hands.
  // Soot-black hide, and the only bright thing on him is the head of the hammer,
  // which is the same trick the Smith in the barracks is built on.
  hephasto: humanoid({
    palette: {
      skin: '#4e4238', cloth: '#33291f', cloth2: '#241d16', trim: '#8a6a3a',
      hair: '#1c1610', horn: '#a89468', bone: COLORS.boneShadow,
      metal: COLORS.steel, wood: COLORS.leather, gem: COLORS.ember, boot: COLORS.leather,
    },
    scale: 1.1,
    parts: { horns: true, bareArms: true, belt: true, fangs: true },
    weapon: 'hammer',
    attackStyle: 'twoHand',
    eyeColor: '#ff8a2a', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 15.5, torsoR: 8.8, armR: 4.0, foreR: 3.3,
      upperArm: 11.5, foreArm: 10.5, thigh: 15, shin: 14,
      hipU: 30, chestU: 43, neckU: 45, headU: 49, headR: 5.4,
      thighR: 4.8, shinR: 3.7, hipSide: 6.0, hunch: 0.2, stance: 1.18,
    },
  }),

  // The Ancient: the barbarian's own frame cast in statue bronze. Same build,
  // same two-handed axe, same stance -- a guardian of Arreat is what the player
  // is, held still for three hundred years, and the palette is the only thing
  // that says so. Verdigris in the recesses keeps the bronze from reading gold.
  ancient: humanoid({
    palette: {
      skin: '#8a6a3a', cloth: '#6a4e28', cloth2: '#4a3a24', trim: '#3f5a4a',
      hair: '#5a4222', metal: '#9a7a42', wood: '#6a5230',
      bone: '#a88a54', boot: '#4a3a24',
    },
    scale: 1.06,
    parts: { hair: true, bareArms: true, belt: true },
    weapon: 'greataxe',
    attackStyle: 'twoHand',
    eyeColor: '#d8c078', eyeGlow: true,
    anims: ['idle', 'walk', 'attack', 'death'],
    build: {
      ...DEFAULT_BUILD,
      shoulder: 14.5, torsoR: 7.8, armR: 3.7, foreR: 3.0,
      upperArm: 11.5, foreArm: 10.5,
      chestU: 45, neckU: 48, headU: 52, headR: 5.5,
      thighR: 4.4, shinR: 3.4, hipSide: 5.6,
      hunch: -0.06, stance: 1.12,
    },
  }),

  // Baal. Robed and horned rather than winged, and he casts: the Lord of
  // Destruction fights the way Mephisto does, from where he stands. Built heavy
  // under the robe so the hem has mass to hang from, and stooped, because the
  // arms go up on the cast and the cell roof does not move.
  baal: humanoid({
    palette: {
      skin: '#6a5a4a', cloth: '#2e2822', cloth2: '#221d19', carapace: '#4a3e30',
      quill: '#5a4c3a', hair: '#1e1a16', horn: '#c8b890', bone: COLORS.boneWhite,
      metal: COLORS.darkSteel, wood: COLORS.wood, gem: COLORS.ember, trim: '#8a6a3a',
    },
    scale: 1.1,
    parts: { robe: true, horns: true, spikes: true, quills: true, bareArms: true, belt: true, fangs: true },
    weapon: 'none',
    eyeColor: '#ffb03a', eyeGlow: true,
    build: {
      ...DEFAULT_BUILD,
      hipU: 29, chestU: 42, neckU: 44, headU: 48, headR: 6.2,
      torsoR: 8.6, shoulder: 14.5, armR: 3.8, foreR: 3.1,
      upperArm: 11.5, foreArm: 11, thigh: 15, shin: 14,
      thighR: 4.6, shinR: 3.6, hipSide: 5.8, hunch: 0.22, stance: 1.16,
    },
  }),
};

export const FIGURE_BAKE_STEPS = Object.keys(FIGURE_SPECS).length;

// Bake every figure, yielding between animations so the loading screen can
// keep painting instead of the tab locking up.
export function* bakeAllFigures(out) {
  const keys = Object.keys(FIGURE_SPECS);
  let done = 0;
  for (const key of keys) {
    out[key] = bakeFigure(FIGURE_SPECS[key]);
    done++;
    yield { done, total: keys.length, label: key };
  }
}

