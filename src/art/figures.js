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

  for (const side of ['legL', 'legR']) {
    const L = j[side];
    add('capsule', [L.hip, L.knee, b.thighR * S, b.shinR * S * 1.15], legRamp, dep(L.hip, L.knee) - 0.5);
    add('capsule', [L.knee, L.foot, b.shinR * S * 1.1, b.shinR * S * 0.85], legRamp, dep(L.knee, L.foot) - 0.4);
    add('capsule', [L.foot, [L.foot[0] + 2.6 * S, L.foot[1], Math.max(0.6, L.foot[2])], b.shinR * S * 0.95, b.shinR * S * 0.8],
      R.boot || R.cloth2 || R.cloth, dep(L.foot) - 0.3);
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

