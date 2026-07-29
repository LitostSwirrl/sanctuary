// The Sorceress skill trees.
//
// Thirty skills across three trees with real synergies: points in Fire Bolt
// raise Fire Ball's damage, exactly as in the original. Synergies read hard
// allocated points only, while damage scaling reads the effective level
// including bonuses from equipment — that split is what stops a +3 skills
// amulet from silently multiplying every synergy as well.
//
// The casting context is:
//   { level, player, fx, rng, projectiles, time, sfx,
//     damageMonster(monster, dmgObject, opts) }

import { rollHit, rollDamage, monsterDefense, applyFreeze } from './combat.js';
import { taunt as forceTaunt } from './ai.js';
import { groundItem } from './loot.js';
import { rollItem, makePotion } from '../items/item.js';
import { POTIONS, tierForAreaLevel } from '../items/bases.js';
import { FX } from '../art/fx.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers

export function allocatedPoints(player, id) {
  return player.skills[id] || 0;
}

// Levels granted by a buff for as long as it lasts — Battle Command's +1 to
// everything. Gear and buffs add the same way; neither feeds a synergy.
function buffSkills(player) {
  let n = 0;
  for (const id in player.buffs) n += player.buffs[id].plusSkills || 0;
  return n;
}

// Effective level: allocated points plus anything the gear or a buff grants.
export function skillLevel(player, id) {
  const base = allocatedPoints(player, id);
  if (base <= 0) return 0;
  const sk = SKILL_BY_ID[id];
  return base + player.skillBonus(sk ? sk.tree : null) + buffSkills(player);
}

function synergyPct(player, skill) {
  let pct = 0;
  for (const s of skill.synergies || []) pct += allocatedPoints(player, s.id) * s.pct;
  return pct;
}

// Masteries lower the target's resistance rather than raising raw damage, which
// is why a mastery can take a resistant monster below zero and multiply damage.
export function pierceFor(player, element) {
  const id = element === 'fire' ? 'firemastery' : element === 'cold' ? 'coldmastery' : element === 'light' ? 'lightmastery' : null;
  if (!id) return 0;
  const lvl = skillLevel(player, id);
  if (lvl <= 0) return 0;
  const base = element === 'fire' ? 15 : 20;
  const step = element === 'fire' ? 6 : 7;
  return Math.min(130, base + step * (lvl - 1));
}

export function pierceTable(player) {
  return { fire: pierceFor(player, 'fire'), cold: pierceFor(player, 'cold'), light: pierceFor(player, 'light'), pois: 0 };
}

function damageMult(player, skill) {
  let m = 1 + synergyPct(player, skill) / 100;
  if (skill.tree === 'fire') {
    const fm = skillLevel(player, 'firemastery');
    if (fm > 0) m *= 1 + (10 + 3 * (fm - 1)) / 100;
  }
  return m;
}

export function skillDamage(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk || !sk.damage) return null;
  const lvl = Math.max(1, skillLevel(player, id));
  const d = sk.damage(lvl);
  const m = damageMult(player, sk);
  return { min: Math.round(d.min * m), max: Math.round(d.max * m), element: sk.element };
}

// What a burning or freezing patch of ground does every second. The hazard
// takes a single number rather than a range, so this is the one place it is
// worked out — the tooltip prints this and the cast hands the same value to
// the hazard, which is the only way the printed rate can be the measured one.
function dpsFor(player, sk, lvl) {
  return Math.round(sk.dps(lvl) * damageMult(player, sk));
}

export function skillDps(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk || !sk.dps) return 0;
  return dpsFor(player, sk, Math.max(1, skillLevel(player, id)));
}

function rollFor(ctx, player, sk, lvl) {
  const d = sk.damage(lvl);
  const m = damageMult(player, sk);
  return () => (d.min + ctx.rng.f() * (d.max - d.min)) * m;
}

function damageArea(ctx, x, y, radius, roll, element, opts = {}) {
  let hits = 0;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > radius + e.radius) continue;
    ctx.damageMonster(e, { [element]: roll() }, opts);
    hits++;
  }
  return hits;
}

// Everything inside the cone takes one roll: `spread` is the half-angle off
// the aim, and anything close enough to touch counts as inside it however it
// is standing — Inferno should never miss the thing in your face.
function damageCone(ctx, caster, tx, ty, range, spread, roll, element, opts = {}) {
  const a = aimVector(caster, tx, ty, 1);
  const cos = Math.cos(spread);
  let hits = 0;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const dx = e.x - caster.x, dy = e.y - caster.y;
    const d = Math.hypot(dx, dy);
    if (d > range + e.radius) continue;
    if (d > 0.8 && (dx * a.dx + dy * a.dy) / d < cos) continue;
    ctx.damageMonster(e, { [element]: roll() }, opts);
    hits++;
  }
  return hits;
}

// The monster the click meant, if one is standing close enough to the point
// clicked to have been meant at all.
function targetNear(ctx, tx, ty, range = 1.4) {
  let best = null, bd = range;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - tx, e.y - ty);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// One of the things nearby, chosen at random rather than nearest: Thunder
// Storm should read as weather, not as a turret locked on the closest thing.
function randomNear(ctx, x, y, range) {
  const near = [];
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    if (Math.hypot(e.x - x, e.y - y) <= range + e.radius) near.push(e);
  }
  return near.length ? near[ctx.rng.i(near.length)] : null;
}

function aimVector(caster, tx, ty, speed) {
  const dx = tx - caster.x, dy = ty - caster.y;
  const d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * speed, vy: (dy / d) * speed, dx: dx / d, dy: dy / d };
}

// ------------------------------------------------------------------- melee

// One weapon blow with a skill's bonuses folded in. Mastery ED/AR are already
// inside minDamage/maxDamage/attackRating via recalc; skill ED stacks on top.
// Exported because a thrown weapon lands the same blow at range, and that is
// resolved inside the projectile system.
export function weaponHit(caster, m, ctx, { ed = 0, ar = 0, mul = 1 } = {}) {
  if (!rollHit(ctx.rng, caster.attackRating + ar, monsterDefense(m), caster.level, m.mlvl)) {
    ctx.fx.float(m.x, m.y, 'miss', 'rgba(190,190,190,1)');
    return 0;
  }
  const raw = rollDamage(ctx.rng, caster.minDamage, caster.maxDamage,
    caster.totals.ed + ed, caster.effective.str) * mul;
  return ctx.damageMonster(m, { phys: raw }, { source: caster });
}

function knockback(level, m, fromX, fromY, dist) {
  const dx = m.x - fromX, dy = m.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  m.moveBy((dx / d) * dist, (dy / d) * dist, level);
}

// Bosses are immune to fear and stun, as monsters are to neither chill nor
// Static Field today.
function applyStun(m, seconds) {
  if (!m.alive || m.def.boss) return;
  m.stunned = Math.max(m.stunned || 0, seconds);
}

// The two-handed axe reaches a little past the bare-hand attack's 1.6/1.7.
const MELEE_REACH = 1.9;

function meleeTarget(ctx, caster, tx, ty) {
  let best = null, bd = 1.3;                    // nearest to the click...
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - tx, e.y - ty);
    if (d < bd) { bd = d; best = e; }
  }
  if (best && caster.distTo(best) <= MELEE_REACH) return best;
  best = null; bd = MELEE_REACH;                // ...else nearest in reach.
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = caster.distTo(e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Swing at whatever the click meant. Returns false — veto, mana refunded —
// when nothing is in reach. The effect runs in the hit-frame callback on
// frame 3, exactly like the plain attack.
function meleeStrike(caster, tx, ty, ctx, onHit) {
  const target = meleeTarget(ctx, caster, tx, ty);
  if (!target) return false;
  caster.stop();
  caster.busy = 0.42 / caster.attackSpeed;
  caster.face(target.x, target.y);
  if (ctx.sfx) ctx.sfx('swing');
  caster.setAnim('attack', {
    loop: false, force: true, hitFrame: 3,
    onHitFrame: () => { if (target.alive && caster.distTo(target) <= MELEE_REACH + 0.2) onHit(target); },
    onEnd: () => caster.setAnim('idle'),
  });
  return true;
}

// ------------------------------------------------------------ ground hazards

// A patch of ground that keeps working after the cast: Fire Wall, Blaze,
// Blizzard, and Grim Ward's totem. `until` is a clock time — `ctx.time + n`
// seconds — and `tick` is how often it bites, so nothing standing in one takes
// damage more often than that. A `fear` hazard pulses the Howl flee-state
// instead of damage; `fear: true` routs for 1.5s a pulse, a number says how long.
export function addHazard(level, o) {
  if (!level.hazards) level.hazards = [];
  const h = {
    x: o.x, y: o.y, r: o.r ?? 2,
    element: o.element || 'fire',
    dps: o.dps || 0,
    until: o.until || 0,
    tick: o.tick ?? 0.4,
    fear: o.fear || false,
    source: o.source || null,
    pierce: o.pierce || null,
    t: 0, fxT: 0,
  };
  level.hazards.push(h);
  return h;
}

// Ground laid by a skill that printed a rate on its tooltip. A hazard's first
// bite is otherwise due a whole tick after it lands, so a short patch would
// deal one bite less than the rate it advertises — measured at 900 a second
// where the tooltip said 1125. Charging the accumulator makes the fire bite on
// arrival, and a full lifetime then delivers exactly what was promised.
function layHazard(level, o) {
  const h = addHazard(level, o);
  h.t = h.tick;
  return h;
}

export function tickHazards(ctx, dt) {
  const list = ctx.level.hazards;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (ctx.time >= h.until) { list.splice(i, 1); continue; }

    h.fxT += dt;
    if (h.fxT >= 0.07) { h.fxT = 0; FX.hazard(ctx.fx, h.x, h.y, h.r, h.element); }

    h.t += dt;
    if (h.t < h.tick) continue;
    // The overshoot carries, so `dps` is the damage it actually deals rather
    // than a promise the frame rate quietly shaves a slice off every bite.
    h.t -= h.tick;
    for (const e of ctx.level.entities) {
      if (!e.alive || e.isPlayer || e.isNpc) continue;
      if (Math.hypot(e.x - h.x, e.y - h.y) > h.r + e.radius) continue;
      if (h.fear) {
        // Bosses shrug off a fear pulse exactly as they shrug off Howl.
        if (e.def.boss || e.taunt) continue;
        e.state = 'flee';
        e.fleeTimer = Math.max(e.fleeTimer || 0, h.fear === true ? 1.5 : h.fear);
      } else {
        ctx.damageMonster(e, { [h.element]: h.dps * h.tick }, { source: h.source, pierce: h.pierce });
      }
    }
  }
}

// ---------------------------------------------------------------------- pets

// A turret with a lifetime: the Hydra. It stands in `level.entities` so the
// renderer can draw it from a `sheet` if one is handed over, but it carries
// `isNpc` — every hostile loop in the game already steps over that — so nothing
// targets it, nothing separates from it, and it blocks nothing. Documented
// simplification: monsters ignore it entirely.
export function addPet(level, o) {
  const pet = {
    isNpc: true, isPet: true,
    kind: o.kind || 'hydra',
    x: o.x, y: o.y, dir: 2, radius: 0.3,
    alive: true, remove: false,
    sheet: o.sheet || null, animName: 'idle', frame: 0, hitFlash: 0,
    until: o.until || 0,
    rate: o.rate ?? 1.2,
    roll: o.roll || (() => 0),
    element: o.element || 'fire',
    owner: o.owner || null,
    pierce: o.pierce || null,
    cool: 0, fxT: 0,
  };
  level.addEntity(pet);
  return pet;
}

// The nearest thing worth shooting: awake, alive, and not too far to bother.
function nearestWaked(ctx, x, y, range) {
  let best = null, bd = range;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc || e.state === 'idle') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function tickPets(ctx, dt) {
  for (const p of ctx.level.entities) {
    if (!p.isPet || p.remove) continue;
    if (ctx.time >= p.until) {
      p.alive = false; p.remove = true;
      ctx.fx.burst('smoke', p.x, p.y, 10, { z: 8, spread: 1.6, r: 80, g: 70, b: 62, life: 0.8 });
      continue;
    }
    p.fxT += dt;
    if (p.fxT >= 0.06) { p.fxT = 0; FX.totem(ctx.fx, p.x, p.y, p.element); }

    p.cool -= dt;
    if (p.cool > 0) continue;
    const t = nearestWaked(ctx, p.x, p.y, 11);
    // Standing idle banks no debt; without this the overshoot carried below
    // would pay for a burst of shots the moment something walked into range.
    if (!t) { p.cool = 0; continue; }
    p.cool += p.rate;
    const a = aimVector(p, t.x, t.y, 14);
    ctx.projectiles.spawn({
      x: p.x, y: p.y, z: 14, vx: a.vx, vy: a.vy, speed: 14,
      element: p.element, colour: '#ff8a30', drawR: 4.5, light: 4.5, ttl: 1.6,
      trail: (q) => { if (ctx.rng.chance(0.5)) ctx.fx.spawn('ember', q.x, q.y, { z: q.z, spread: 0.3, spreadZ: 3, r: 255, g: 140, b: 50, size: 2, life: 0.28 }); },
      onHit: (q, e) => ctx.damageMonster(e, { [p.element]: p.roll() }, { source: p.owner, pierce: p.pierce }),
      onExpire: (q) => ctx.fx.burst('ember', q.x, q.y, 6, { z: q.z, spread: 1.2, r: 255, g: 150, b: 60, life: 0.3 }),
    });
    if (ctx.sfx) ctx.sfx('cast');
  }
}

// ---------------------------------------------------------------------- beam

// An instant line of damage with a bolt drawn down it: Lightning. Everything
// within `width` of the line is hit once, and the line stops at the first wall
// so nothing is struck through rock.
export function beam(ctx, caster, tx, ty, o = {}) {
  const range = o.range ?? 12;
  const width = o.width ?? 0.6;
  const element = o.element || 'light';
  const roll = o.roll || (() => 0);
  const a = aimVector(caster, tx, ty, 1);
  let len = 0;
  while (len < range) {
    if (ctx.level.blocked(caster.x + a.dx * (len + 0.25), caster.y + a.dy * (len + 0.25))) break;
    len += 0.25;
  }
  let hits = 0;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const px = e.x - caster.x, py = e.y - caster.y;
    const along = px * a.dx + py * a.dy;
    if (along < 0 || along > len) continue;
    if (Math.abs(px * a.dy - py * a.dx) > width + e.radius) continue;
    ctx.damageMonster(e, { [element]: roll() }, { source: caster, pierce: o.pierce || pierceTable(caster) });
    hits++;
  }
  FX.beam(ctx.fx, caster.x, caster.y, caster.x + a.dx * len, caster.y + a.dy * len, element);
  return hits;
}

// --------------------------------------------------------------------- buffs

// What a buff does while it lasts and on its own: Thunder Storm's periodic
// strike, and Frenzy's stacks, which run out one at a time rather than all at
// once. Player.update owns a buff's lifetime; this owns its behaviour.
export function tickBuffs(ctx, dt) {
  const player = ctx.player;
  let stacksChanged = false;
  for (const id in player.buffs) {
    const b = player.buffs[id];
    if (b.proc) {
      b.procT = (b.procT || 0) + dt;
      // The remainder carries, so a long buff does not drift a frame slower
      // with every strike it makes.
      if (b.procT >= b.proc.every) { b.procT -= b.proc.every; b.proc.fn(ctx, player, b); }
    }
    if (b.stackAt) {
      for (let i = b.stackAt.length - 1; i >= 0; i--) {
        if ((b.stackAt[i] -= dt) > 0) continue;
        b.stackAt.splice(i, 1);
        stacksChanged = true;
      }
    }
  }
  if (stacksChanged) player.recalc();
}

// One more stack on a stacking buff, each carrying its own decay clock. At the
// cap the oldest is dropped, so hitting again refreshes rather than wastes.
// `refreshPassives` stays out of it: a stack is not an allocated point.
export function addStack(player, id) {
  const b = player.buffs[id];
  if (!b || !b.stacks) return 0;
  if (!b.stackAt) b.stackAt = [];
  if (b.stackAt.length >= b.stacks.max) b.stackAt.shift();
  b.stackAt.push(b.stacks.decay);
  player.recalc();
  return b.stackAt.length;
}

export function stackCount(player, id) {
  const b = player.buffs[id];
  return b && b.stackAt ? b.stackAt.length : 0;
}

// The three cold armours are one garment: putting one on takes the others off,
// as in the original. `recalc` runs because the defence they grant is read off
// the buff.
const COLD_ARMOURS = ['frozenarmor', 'shiverarmor', 'chillingarmor'];

function wearArmour(caster, id, buff) {
  for (const a of COLD_ARMOURS) delete caster.buffs[a];
  caster.buffs[id] = buff;
  caster.recalc();
}

// Enchant rides on the plain swing, which the main loop resolves rather than
// this file — this is what it adds, rolled from the numbers the buff took down
// at cast time. Enchant snapshots: gear swapped afterwards changes nothing.
export function enchantFire(player, rng) {
  const b = player.buffs.enchant;
  if (!b) return 0;
  return b.min + rng.f() * (b.max - b.min);
}

// ------------------------------------------------------------------- corpses

// Corpses are simply the dead still lying in `level.entities` — the same bodies
// a Shaman raises. A consumed one is spent: nothing raises it and nothing loots
// it twice.
export function nearestCorpse(level, x, y, range = 2) {
  let best = null, bd = range;
  for (const e of level.entities) {
    if (e.alive || e.isPlayer || e.isNpc || e.consumed || e.remove || !e.defId) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function consumeCorpse(ctx, c) {
  if (!c || c.consumed) return false;
  c.consumed = true;
  c.remove = true;
  ctx.fx.burst('dust', c.x, c.y, 14, { z: 6, spread: 2, r: 120, g: 105, b: 80, life: 0.6 });
  return true;
}

// The body near the click, close enough to the caster to be searched — Find
// Potion, Find Item and the Grim Ward all want the same thing, and all three
// veto (mana refunded) when there is nothing to work with.
function corpseToWork(ctx, caster, tx, ty) {
  const c = nearestCorpse(ctx.level, tx, ty, CORPSE_REACH);
  if (!c || caster.distTo(c) > CORPSE_RANGE) return null;
  return c;
}

// What the body was carrying, laid on the ground beside it rather than pushed
// into the bag: a full inventory should not swallow a find in silence.
function dropBeside(ctx, c, item) {
  if (!item) return null;
  const p = ctx.level.nearestOpen(c.x + ctx.rng.range(-0.7, 0.7), c.y + ctx.rng.range(-0.7, 0.7), 3);
  const gi = groundItem(item, p.x, p.y);
  ctx.level.items.push(gi);
  return gi;
}

// ------------------------------------------------------------------- skills

// Shapes the tooltips print and the casts use. A promise and the behaviour
// behind it read from the same constant, so they cannot drift apart.
const INFERNO_RANGE = 5.5, INFERNO_SPREAD = 0.42;
const BLAZE_EVERY = 0.5, BLAZE_LIFE = 2, BLAZE_R = 0.9;
const WALL_SEGMENTS = 3, WALL_GAP = 2.4, WALL_R = 1.2;
const WALL_LEN = (WALL_SEGMENTS - 1) * WALL_GAP + WALL_R * 2;
const HYDRA_RATE = 1;
const SPIKE_R = 2.4;
const BLIZZARD_R = 3;
const TK_REACH = 8, TK_PUSH = 1.2;
const BOLT_RANGE = 12, BOLT_WIDTH = 0.7;
const STORM_EVERY = 2, STORM_RANGE = 9;
// How often a patch of ground bites. Damage is quoted per second, and the
// hazard carries the overshoot, so the rate holds whatever the frame rate does.
// Every duration in this file is a multiple of it, which is what makes a full
// lifetime deliver the printed rate exactly rather than to the nearest bite.
const HAZARD_TICK = 0.2;
// The Barbarian's reaches. A leap and a leap attack land in the same circle;
// a body must be within CORPSE_REACH of the click and CORPSE_RANGE of the man
// doing the searching; the ward pulses on its own slow clock because fear is
// re-applied rather than accumulated, and one pulse a second is enough to keep
// a pack running without laying a particle field on the frame budget.
const LEAP_AOE_R = 1.5;
const FRENZY_STACKS = 5;
const TAUNT_REACH = 8;
const CORPSE_REACH = 1.8, CORPSE_RANGE = 6;
const WARD_PULSE = 1;

export const SKILLS = [
  // ------------------------------------------------------------------- FIRE
  {
    id: 'firebolt', name: 'Fire Bolt', tree: 'fire', req: 1, prereq: [], element: 'fire', iconSeed: 0,
    mana: (l) => 2 + l * 0.3,
    damage: (l) => ({ min: 3 + 2 * (l - 1), max: 6 + 3 * (l - 1) }),
    blurb: 'A bolt of fire. Cheap, and it never stops being useful.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 15);
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 15,
        element: 'fire', colour: '#ff8a30', drawR: 5, light: 5, ttl: 2,
        trail: (p) => { if (ctx.rng.chance(0.6)) ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.3, spreadZ: 3, r: 255, g: 140, b: 50, size: 2, life: 0.3 }); },
        onHit: (p, e) => ctx.damageMonster(e, { fire: roll() }, { source: caster }),
        onExpire: (p) => ctx.fx.burst('ember', p.x, p.y, 8, { z: p.z, spread: 1.6, r: 255, g: 150, b: 60, life: 0.35 }),
      });
    },
  },
  {
    id: 'warmth', name: 'Warmth', tree: 'fire', req: 1, prereq: [], passive: true, iconSeed: 1,
    blurb: 'Mana returns faster.',
    effect: (l) => `+${30 + 12 * (l - 1)}% Mana Regeneration`,
    manaRegen: (l) => (30 + 12 * (l - 1)) / 100,
  },
  {
    id: 'inferno', name: 'Inferno', tree: 'fire', req: 6, prereq: [], element: 'fire', iconSeed: 2,
    mana: (l) => 4 + l * 0.2,
    damage: (l) => ({ min: 6 + 3 * (l - 1), max: 11 + 4 * (l - 1) }),
    synergies: [{ id: 'firebolt', pct: 8 }],
    blurb: 'A gout of flame from the open hand. Cheap, and it catches a whole doorway.',
    effect: () => `Cone ${INFERNO_RANGE} tiles long, everything in it burns once`,
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const base = Math.atan2(ty - caster.y, tx - caster.x);
      for (let i = 0; i < 12; i++) {
        const t = 0.15 + ctx.rng.f() * 0.85;
        const ang = base + ctx.rng.range(-INFERNO_SPREAD, INFERNO_SPREAD) * t;
        ctx.fx.spawn('ember', caster.x + Math.cos(ang) * INFERNO_RANGE * t, caster.y + Math.sin(ang) * INFERNO_RANGE * t,
          { z: 12, vz: 12, spread: 0.3, spreadZ: 6, r: 255, g: 150 - 60 * t, b: 40, size: 3, life: 0.3, lit: 1.4 });
      }
      damageCone(ctx, caster, tx, ty, INFERNO_RANGE, INFERNO_SPREAD, roll, 'fire',
        { source: caster, pierce: pierceTable(caster) });
      if (ctx.sfx) ctx.sfx('explode');
    },
  },
  {
    id: 'blaze', name: 'Blaze', tree: 'fire', req: 12, prereq: ['inferno'], element: 'fire', iconSeed: 3,
    mana: (l) => 11 + l * 0.5,
    dps: (l) => 15 + 5 * (l - 1),
    duration: (l) => 4 + 0.2 * (l - 1),
    synergies: [{ id: 'inferno', pct: 8 }],
    blurb: 'Fire follows your heels. Lead them through it.',
    effect(l) {
      return `Fire where you run for ${this.duration(l).toFixed(1)}s; each patch burns ${BLAZE_LIFE}s within ${BLAZE_R} tiles`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const dps = dpsFor(caster, sk, lvl);
      const pierce = pierceTable(caster);
      const drop = (c, p) => layHazard(c.level, {
        x: p.x, y: p.y, r: BLAZE_R, element: 'fire', dps,
        until: c.time + BLAZE_LIFE, tick: HAZARD_TICK, source: p, pierce,
      });
      // One patch under you now, then one every half second — but only once you
      // have moved clear of the last. A trail is drawn by running; standing
      // still would otherwise stack five fires on one tile and burn at five
      // times the rate the tooltip promises.
      drop(ctx, caster);
      const at = { x: caster.x, y: caster.y };
      caster.buffs.blaze = {
        t: sk.duration(lvl),
        proc: {
          every: BLAZE_EVERY,
          fn: (c, p) => {
            if (Math.hypot(p.x - at.x, p.y - at.y) < BLAZE_R * 2) return;
            at.x = p.x; at.y = p.y;
            drop(c, p);
          },
        },
      };
      if (ctx.sfx) ctx.sfx('cast');
    },
  },
  {
    id: 'fireball', name: 'Fire Ball', tree: 'fire', req: 12, prereq: ['firebolt'], element: 'fire', iconSeed: 4,
    mana: (l) => 5 + l * 0.5,
    damage: (l) => ({ min: 8 + 4 * (l - 1), max: 16 + 5 * (l - 1) }),
    synergies: [{ id: 'firebolt', pct: 14 }],
    radius: 2.6,
    blurb: 'Explodes on impact. Fire Bolt makes it hit harder.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 12);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 12,
        element: 'fire', colour: '#ff7020', drawR: 7, light: 6.5, ttl: 2.4, radius: 0.35,
        trail: (p) => { if (ctx.rng.chance(0.9)) ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.5, spreadZ: 4, r: 255, g: 130, b: 40, size: 2.4, life: 0.35 }); },
        onExpire: (p) => {
          ctx.fx.burst('ember', p.x, p.y, 26, { z: 8, spread: sk.radius * 2.4, spreadZ: 40, r: 255, g: 150, b: 50, life: 0.7 });
          ctx.fx.ring(p.x, p.y, { maxR: sk.radius, cr: 255, cg: 150, cb: 60, life: 0.32, w: 4, lit: 2 });
          damageArea(ctx, p.x, p.y, sk.radius, roll, 'fire', { source: caster, pierce });
          if (ctx.sfx) ctx.sfx('explode');
        },
      });
    },
  },
  {
    id: 'firewall', name: 'Fire Wall', tree: 'fire', req: 18, prereq: ['blaze'], element: 'fire', iconSeed: 5,
    mana: (l) => 15 + l * 0.5,
    dps: (l) => 16 + 6 * (l - 1),
    duration: (l) => 4 + 0.2 * (l - 1),
    synergies: [{ id: 'inferno', pct: 6 }, { id: 'blaze', pct: 6 }],
    blurb: 'A sheet of flame stood up across their path. They will walk into it anyway.',
    effect(l) {
      return `A wall ${WALL_LEN.toFixed(1)} tiles wide, burns for ${this.duration(l).toFixed(1)}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const dps = dpsFor(caster, sk, lvl);
      const pierce = pierceTable(caster);
      const until = ctx.time + sk.duration(lvl);
      // Three burning stretches laid across the aim rather than along it: a
      // wall stands between you and them, which is the whole point of one.
      const a = aimVector(caster, tx, ty, 1);
      const px = -a.dy, py = a.dx;
      let stood = 0;
      for (let i = 0; i < WALL_SEGMENTS; i++) {
        const o = (i - (WALL_SEGMENTS - 1) / 2) * WALL_GAP;
        const sx = tx + px * o, sy = ty + py * o;
        if (ctx.level.blocked(sx, sy)) continue;
        layHazard(ctx.level, { x: sx, y: sy, r: WALL_R, element: 'fire', dps, until, tick: HAZARD_TICK, source: caster, pierce });
        ctx.fx.ring(sx, sy, { maxR: WALL_R, cr: 255, cg: 140, cb: 50, life: 0.3, w: 3, lit: 1.6 });
        stood++;
      }
      if (!stood) return false;                   // nothing but rock there
      if (ctx.sfx) ctx.sfx('explode');
      return true;
    },
  },
  {
    id: 'enchant', name: 'Enchant', tree: 'fire', req: 18, prereq: ['warmth'], element: 'fire', iconSeed: 7,
    mana: (l) => 14 + l * 0.5,
    damage: (l) => ({ min: 8 + 3 * (l - 1), max: 16 + 5 * (l - 1) }),
    duration: (l) => 90 + 6 * (l - 1),
    synergies: [{ id: 'firebolt', pct: 5 }, { id: 'warmth', pct: 5 }],
    blurb: 'Fire laid along the edge of whatever you are holding.',
    effect(l) { return `Adds the fire above to every swing, for ${Math.round(this.duration(l))}s`; },
    cast(caster, lvl, tx, ty, ctx) {
      // The buff carries the numbers the tooltip printed, so what the swing
      // adds is exactly what was promised at the moment it was cast.
      const d = skillDamage(caster, 'enchant');
      caster.buffs.enchant = { t: this.duration(lvl), min: d.min, max: d.max };
      ctx.fx.burst('ember', caster.x, caster.y, 14, { z: 14, spread: 1.4, spreadZ: 20, r: 255, g: 170, b: 60, life: 0.5 });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 255, cg: 160, cb: 60, life: 0.35, w: 3, lit: 1.6 });
    },
  },
  {
    id: 'meteor', name: 'Meteor', tree: 'fire', req: 24, prereq: ['fireball'], element: 'fire', iconSeed: 6,
    mana: (l) => 12 + l * 0.6,
    damage: (l) => ({ min: 40 + 12 * (l - 1), max: 62 + 16 * (l - 1) }),
    synergies: [{ id: 'firebolt', pct: 8 }, { id: 'fireball', pct: 8 }],
    radius: 2.8,
    blurb: 'Calls a rock from the sky, then leaves the ground burning.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      // Falls from high up, so it arrives about a second after the cast.
      ctx.projectiles.spawn({
        x: tx, y: ty, z: 190, vx: 0, vy: 0, vz: -170, speed: 170,
        element: 'fire', colour: '#ff5a10', drawR: 12, light: 8, ttl: 1.25, radius: 0.1,
        trail: (p) => ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.8, spreadZ: 6, r: 255, g: 120, b: 30, size: 3.2, life: 0.4 }),
        onExpire: (p) => {
          ctx.fx.burst('ember', p.x, p.y, 46, { z: 6, spread: sk.radius * 3, spreadZ: 70, r: 255, g: 140, b: 40, life: 1.0 });
          ctx.fx.burst('smoke', p.x, p.y, 16, { z: 14, spread: sk.radius * 2, r: 70, g: 55, b: 45, life: 1.6 });
          ctx.fx.ring(p.x, p.y, { maxR: sk.radius * 1.2, cr: 255, cg: 130, cb: 50, life: 0.5, w: 6, lit: 3 });
          damageArea(ctx, p.x, p.y, sk.radius, roll, 'fire', { source: caster, pierce });
          const dps = 10 + 4 * lvl;
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) <= sk.radius + e.radius) {
              e.burning = Math.max(e.burning, 3.5);
              e.burnDps = Math.max(e.burnDps, dps);
              e.burnSource = caster;
            }
          }
          if (ctx.sfx) ctx.sfx('explode', { big: true });
        },
      });
      // A warning shadow so the impact is readable before it lands.
      ctx.fx.ring(tx, ty, { maxR: sk.radius, cr: 255, cg: 90, cb: 30, life: 1.15, w: 2, lit: 0 });
    },
  },
  {
    id: 'firemastery', name: 'Fire Mastery', tree: 'fire', req: 30, prereq: ['fireball'], passive: true, iconSeed: 8,
    blurb: 'Fire skills do more damage, and enemy fire resistance counts for less.',
    effect: (l) => `-${Math.min(130, 15 + 6 * (l - 1))}% Enemy Fire Resist, +${10 + 3 * (l - 1)}% Fire Damage`,
  },
  {
    id: 'hydra', name: 'Hydra', tree: 'fire', req: 30, prereq: ['firewall'], element: 'fire', iconSeed: 9,
    mana: (l) => 20 + l * 0.5,
    damage: (l) => ({ min: 8 + 3 * (l - 1), max: 14 + 4 * (l - 1) }),
    duration: (l) => 8 + 0.4 * (l - 1),
    synergies: [{ id: 'firebolt', pct: 5 }, { id: 'firewall', pct: 5 }],
    blurb: 'A head of fire planted in the ground. It picks its own targets, and nothing picks it.',
    effect(l) { return `Spits a bolt every ${HYDRA_RATE.toFixed(1)}s for ${this.duration(l).toFixed(1)}s`; },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const spot = ctx.level.nearestOpen(tx, ty, 4);
      if (ctx.level.blockedCircle(spot.x, spot.y, 0.3)) return false;
      addPet(ctx.level, {
        kind: 'hydra', x: spot.x, y: spot.y, element: 'fire',
        until: ctx.time + sk.duration(lvl), rate: HYDRA_RATE,
        roll: rollFor(ctx, caster, sk, lvl), owner: caster, pierce: pierceTable(caster),
      });
      ctx.fx.burst('ember', spot.x, spot.y, 16, { z: 6, spread: 1.6, spreadZ: 26, r: 255, g: 150, b: 50, life: 0.6 });
      ctx.fx.ring(spot.x, spot.y, { maxR: 1.2, cr: 255, cg: 140, cb: 50, life: 0.4, w: 3, lit: 1.8 });
      if (ctx.sfx) ctx.sfx('explode');
      return true;
    },
  },

  // ------------------------------------------------------------------- COLD
  {
    id: 'icebolt', name: 'Ice Bolt', tree: 'cold', req: 1, prereq: [], element: 'cold', iconSeed: 0,
    mana: (l) => 2 + l * 0.3,
    damage: (l) => ({ min: 3 + 2 * (l - 1), max: 5 + 3 * (l - 1) }),
    blurb: 'Slows whatever it hits.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 13);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 13,
        element: 'cold', colour: '#7ad0ff', drawR: 5, light: 4.5, ttl: 2,
        trail: (p) => { if (ctx.rng.chance(0.5)) ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 0.3, spreadZ: 2, r: 150, g: 220, b: 255, size: 1.8, life: 0.3 }); },
        onHit: (p, e) => {
          ctx.damageMonster(e, { cold: roll() }, { source: caster, pierce, chill: { seconds: 2.5 + lvl * 0.15, amount: 0.35 } });
        },
        onExpire: (p) => ctx.fx.burst('ice', p.x, p.y, 7, { z: p.z, spread: 1.4, r: 160, g: 225, b: 255, life: 0.3 }),
      });
    },
  },
  {
    id: 'frozenarmor', name: 'Frozen Armor', tree: 'cold', req: 1, prereq: [], element: 'cold', iconSeed: 10,
    mana: (l) => 6 + l * 0.3,
    defence: (l) => 30 + 5 * (l - 1),
    chill: (l) => ({ seconds: 2 + 0.1 * (l - 1), amount: 0.4 }),
    duration: (l) => 60 + 6 * (l - 1),
    blurb: 'Ice sheathes you, and whatever strikes it comes away slow.',
    effect(l) {
      return `+${this.defence(l)}% Defence, attackers chilled ${this.chill(l).seconds.toFixed(1)}s, for ${Math.round(this.duration(l))}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      wearArmour(caster, 'frozenarmor', {
        t: this.duration(lvl), defPct: this.defence(lvl), onStruckChill: this.chill(lvl),
      });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.8, cr: 150, cg: 220, cb: 255, life: 0.4, w: 3, lit: 1.4 });
      ctx.fx.burst('ice', caster.x, caster.y, 14, { z: 14, spread: 1.6, spreadZ: 22, r: 160, g: 225, b: 255, life: 0.5 });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'frostnova', name: 'Frost Nova', tree: 'cold', req: 6, prereq: ['icebolt'], element: 'cold', iconSeed: 1,
    mana: (l) => 7 + l * 0.4,
    damage: (l) => ({ min: 4 + 2 * (l - 1), max: 8 + 3 * (l - 1) }),
    synergies: [{ id: 'icebolt', pct: 15 }],
    radius: (l) => 4.4 + l * 0.12,
    blurb: 'A ring of ice that leaves everything it touches crawling.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const r = sk.radius(lvl);
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: r, cr: 150, cg: 220, cb: 255, life: 0.45, w: 4, lit: 1.6 });
      ctx.fx.burst('ice', caster.x, caster.y, 30, { z: 8, spread: r * 2, spreadZ: 26, r: 150, g: 225, b: 255, life: 0.55 });
      damageArea(ctx, caster.x, caster.y, r, roll, 'cold', {
        source: caster, pierce: pierceTable(caster),
        chill: { seconds: 3.5 + lvl * 0.2, amount: 0.5 },
      });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'iceblast', name: 'Ice Blast', tree: 'cold', req: 6, prereq: ['icebolt'], element: 'cold', iconSeed: 11,
    mana: (l) => 6 + l * 0.4,
    damage: (l) => ({ min: 10 + 4 * (l - 1), max: 16 + 5 * (l - 1) }),
    freeze: (l) => 1.4 + 0.1 * (l - 1),
    synergies: [{ id: 'icebolt', pct: 12 }],
    blurb: 'One thing, stopped where it stands.',
    effect(l) { return `Freezes solid for ${this.freeze(l).toFixed(1)}s`; },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 14);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      const freeze = sk.freeze(lvl);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 14,
        element: 'cold', colour: '#a8e4ff', drawR: 6, light: 5, ttl: 2,
        trail: (p) => { if (ctx.rng.chance(0.6)) ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 0.4, spreadZ: 3, r: 180, g: 235, b: 255, size: 2.2, life: 0.3 }); },
        onHit: (p, e) => {
          ctx.damageMonster(e, { cold: roll() }, { source: caster, pierce });
          applyFreeze(e, freeze);
          ctx.fx.burst('ice', e.x, e.y, 12, { z: 12, spread: 1.4, r: 190, g: 240, b: 255, life: 0.45 });
        },
        onExpire: (p) => ctx.fx.burst('ice', p.x, p.y, 6, { z: p.z, spread: 1.2, r: 170, g: 235, b: 255, life: 0.3 }),
      });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'shiverarmor', name: 'Shiver Armor', tree: 'cold', req: 12, prereq: ['frozenarmor'], element: 'cold', iconSeed: 3,
    mana: (l) => 9 + l * 0.4,
    defence: (l) => 55 + 7 * (l - 1),
    chill: (l) => ({ seconds: 3 + 0.1 * (l - 1), amount: 0.5 }),
    duration: (l) => 60 + 6 * (l - 1),
    blurb: 'Thicker ice, and a colder answer for whoever tests it.',
    effect(l) {
      return `+${this.defence(l)}% Defence, attackers chilled ${this.chill(l).seconds.toFixed(1)}s, for ${Math.round(this.duration(l))}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      wearArmour(caster, 'shiverarmor', {
        t: this.duration(lvl), defPct: this.defence(lvl), onStruckChill: this.chill(lvl),
      });
      ctx.fx.ring(caster.x, caster.y, { maxR: 2, cr: 150, cg: 220, cb: 255, life: 0.4, w: 4, lit: 1.6 });
      ctx.fx.burst('ice', caster.x, caster.y, 18, { z: 14, spread: 1.8, spreadZ: 24, r: 160, g: 225, b: 255, life: 0.55 });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'glacialspike', name: 'Glacial Spike', tree: 'cold', req: 18, prereq: ['iceblast'], element: 'cold', iconSeed: 6,
    mana: (l) => 11 + l * 0.5,
    damage: (l) => ({ min: 14 + 5 * (l - 1), max: 24 + 7 * (l - 1) }),
    freeze: (l) => 1.2 + 0.06 * (l - 1),
    radius: SPIKE_R,
    synergies: [{ id: 'icebolt', pct: 6 }, { id: 'iceblast', pct: 6 }],
    blurb: 'A shard that bursts, and holds a whole pack still while it does.',
    effect(l) { return `Bursts over ${SPIKE_R} tiles, freezes them for ${this.freeze(l).toFixed(1)}s`; },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 11);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      const freeze = sk.freeze(lvl);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 11,
        element: 'cold', colour: '#bfeaff', drawR: 8, light: 6, ttl: 2.2, radius: 0.35,
        trail: (p) => ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 0.5, spreadZ: 4, r: 190, g: 240, b: 255, size: 2.6, life: 0.35 }),
        onExpire: (p) => {
          FX.iceBurst(ctx.fx, p.x, p.y, SPIKE_R);
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) > SPIKE_R + e.radius) continue;
            ctx.damageMonster(e, { cold: roll() }, { source: caster, pierce });
            applyFreeze(e, freeze);
          }
          if (ctx.sfx) ctx.sfx('ice');
        },
      });
    },
  },
  {
    id: 'blizzard', name: 'Blizzard', tree: 'cold', req: 24, prereq: ['glacialspike'], element: 'cold', iconSeed: 5,
    mana: (l) => 22 + l * 0.5,
    // Rated against Frozen Orb, the only cold skill near this tier: 11 a second
    // over four seconds is 44 for 22.5 mana, which is what an Orb pays for.
    dps: (l) => 11 + 4 * (l - 1),
    duration: (l) => 4 + 0.2 * (l - 1),
    synergies: [{ id: 'icebolt', pct: 4 }, { id: 'glacialspike', pct: 4 }],
    blurb: 'Weather, called down on one patch of ground and left to work.',
    effect(l) { return `Ice falls over ${BLIZZARD_R} tiles for ${this.duration(l).toFixed(1)}s`; },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      layHazard(ctx.level, {
        x: tx, y: ty, r: BLIZZARD_R, element: 'cold', dps: dpsFor(caster, sk, lvl),
        until: ctx.time + sk.duration(lvl), tick: HAZARD_TICK,
        source: caster, pierce: pierceTable(caster),
      });
      ctx.fx.ring(tx, ty, { maxR: BLIZZARD_R, cr: 150, cg: 220, cb: 255, life: 0.5, w: 3, lit: 1.4 });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'chillingarmor', name: 'Chilling Armor', tree: 'cold', req: 24, prereq: ['shiverarmor'], element: 'cold', iconSeed: 7,
    mana: (l) => 12 + l * 0.4,
    damage: (l) => ({ min: 10 + 3 * (l - 1), max: 18 + 4 * (l - 1) }),
    defence: (l) => 80 + 9 * (l - 1),
    chill: (l) => ({ seconds: 3.5 + 0.1 * (l - 1), amount: 0.55 }),
    duration: (l) => 60 + 6 * (l - 1),
    blurb: 'The ice stops waiting to be hit and hits back.',
    effect(l) {
      return `+${this.defence(l)}% Defence, attackers take the cold above and are chilled ${this.chill(l).seconds.toFixed(1)}s, for ${Math.round(this.duration(l))}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const d = skillDamage(caster, 'chillingarmor');
      wearArmour(caster, 'chillingarmor', {
        t: this.duration(lvl), defPct: this.defence(lvl), onStruckChill: this.chill(lvl),
        onStruckDamage: { element: 'cold', min: d.min, max: d.max, pierce: pierceTable(caster) },
      });
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.2, cr: 150, cg: 220, cb: 255, life: 0.45, w: 4, lit: 1.8 });
      ctx.fx.burst('ice', caster.x, caster.y, 20, { z: 14, spread: 2, spreadZ: 26, r: 170, g: 230, b: 255, life: 0.6 });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'frozenorb', name: 'Frozen Orb', tree: 'cold', req: 30, prereq: ['blizzard'], element: 'cold', iconSeed: 4,
    mana: (l) => 16 + l * 0.6,
    damage: (l) => ({ min: 5 + 2 * (l - 1), max: 9 + 3 * (l - 1) }),
    synergies: [{ id: 'icebolt', pct: 2 }, { id: 'frostnova', pct: 2 }],
    blurb: 'Drifts forward shedding ice in every direction.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 5.5);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      let shed = 0;
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 20, vx: a.vx, vy: a.vy, speed: 5.5,
        element: 'cold', colour: '#8ad8ff', drawR: 10, light: 7, ttl: 2.6, radius: 0.2,
        // The orb itself does no damage and must drift through whatever it
        // meets; the shards it sheds are what actually hit.
        pierce: 9999,
        trail: (p, dt) => {
          shed += dt;
          ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 1.2, spreadZ: 6, r: 160, g: 230, b: 255, size: 2.4, life: 0.4 });
          while (shed > 0.07) {
            shed -= 0.07;
            const ang = ctx.rng.f() * TAU;
            ctx.projectiles.spawn({
              x: p.x, y: p.y, z: p.z, vx: Math.cos(ang) * 9, vy: Math.sin(ang) * 9, speed: 9,
              element: 'cold', colour: '#a8e4ff', drawR: 3, light: 2.2, ttl: 0.55, radius: 0.25,
              onHit: (q, e) => ctx.damageMonster(e, { cold: roll() }, {
                source: caster, pierce, chill: { seconds: 2.5, amount: 0.4 },
              }),
            });
          }
        },
        onExpire: (p) => ctx.fx.burst('ice', p.x, p.y, 20, { z: p.z, spread: 3, r: 170, g: 235, b: 255, life: 0.5 }),
      });
    },
  },
  {
    id: 'coldmastery', name: 'Cold Mastery', tree: 'cold', req: 30, prereq: ['frostnova'], passive: true, iconSeed: 8,
    blurb: 'Enemy cold resistance counts for much less.',
    effect: (l) => `-${Math.min(130, 20 + 7 * (l - 1))}% Enemy Cold Resist`,
  },

  // -------------------------------------------------------------- LIGHTNING
  {
    id: 'chargedbolt', name: 'Charged Bolt', tree: 'light', req: 1, prereq: [], element: 'light', iconSeed: 0,
    mana: (l) => 3 + l * 0.3,
    damage: (l) => ({ min: 2 + 1.5 * (l - 1), max: 4 + 2 * (l - 1) }),
    bolts: (l) => Math.min(12, 3 + Math.floor(l / 2)),
    blurb: 'A fan of bolts that wander toward whatever is nearest.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const n = sk.bolts(lvl);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      const base = Math.atan2(ty - caster.y, tx - caster.x);
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.17 + ctx.rng.range(-0.05, 0.05);
        const ang = base + spread;
        const speed = 10 + ctx.rng.range(-1.5, 1.5);
        ctx.projectiles.spawn({
          x: caster.x, y: caster.y, z: 14,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
          element: 'light', colour: '#b0c8ff', drawR: 3.4, light: 2.6, ttl: 1.5,
          radius: 0.28, homing: 0.35,
          onHit: (p, e) => ctx.damageMonster(e, { light: roll() }, { source: caster, pierce }),
        });
      }
      if (ctx.sfx) ctx.sfx('lightning');
    },
  },
  {
    id: 'staticfield', name: 'Static Field', tree: 'light', req: 6, prereq: ['chargedbolt'], element: 'light', iconSeed: 4,
    mana: () => 9,
    radius: (l) => 4.2 + l * 0.28,
    blurb: 'Strips a quarter of the current life from everything nearby. Brutal on things with a lot of it.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const r = sk.radius(lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: r, cr: 170, cg: 200, cb: 255, life: 0.32, w: 4, lit: 2 });
      let hit = 0;
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > r + e.radius) continue;
        ctx.fx.arc(caster.x, caster.y, e.x, e.y, { z: 16, w: 2 });
        // A percentage of current life, so it never finishes anything off.
        ctx.damageMonster(e, { light: 0 }, { source: caster, absolute: e.hp * 0.25 });
        hit++;
      }
      if (ctx.sfx && hit) ctx.sfx('lightning');
    },
  },
  {
    id: 'telekinesis', name: 'Telekinesis', tree: 'light', req: 6, prereq: [], element: 'light', iconSeed: 2,
    mana: (l) => 4 + l * 0.3,
    damage: (l) => ({ min: 5 + 2 * (l - 1), max: 9 + 3 * (l - 1) }),
    stun: (l) => 0.4 + 0.03 * (l - 1),
    blurb: 'A shove of the mind. It hurts less than it inconveniences.',
    effect(l) {
      return `Reach ${TK_REACH} tiles, knocks back ${TK_PUSH} tiles and stuns ${this.stun(l).toFixed(2)}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const t = targetNear(ctx, tx, ty);
      // Nothing grabbed means nothing spent: the click walks instead.
      if (!t || caster.distTo(t) > TK_REACH) return false;
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.fx.arc(caster.x, caster.y, t.x, t.y, { z: 16, w: 2 });
      ctx.damageMonster(t, { light: roll() }, { source: caster, pierce: pierceTable(caster) });
      if (t.alive) {
        knockback(ctx.level, t, caster.x, caster.y, TK_PUSH);
        applyStun(t, sk.stun(lvl));
      }
      if (ctx.sfx) ctx.sfx('lightning');
      return true;
    },
  },
  {
    id: 'nova', name: 'Nova', tree: 'light', req: 12, prereq: ['staticfield'], element: 'light', iconSeed: 1,
    mana: (l) => 14 + l * 0.6,
    damage: (l) => ({ min: 4 + 3 * (l - 1), max: 11 + 4 * (l - 1) }),
    synergies: [{ id: 'chargedbolt', pct: 6 }],
    radius: 5.2,
    blurb: 'A ring of lightning in every direction at once.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: sk.radius, cr: 180, cg: 210, cb: 255, life: 0.36, w: 5, lit: 2.4 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.fx.arc(caster.x, caster.y, caster.x + Math.cos(a) * sk.radius, caster.y + Math.sin(a) * sk.radius, { z: 12, w: 2 });
      }
      damageArea(ctx, caster.x, caster.y, sk.radius, roll, 'light', { source: caster, pierce: pierceTable(caster) });
      if (ctx.sfx) ctx.sfx('lightning', { big: true });
    },
  },
  {
    id: 'lightning', name: 'Lightning', tree: 'light', req: 12, prereq: ['chargedbolt'], element: 'light', iconSeed: 9,
    mana: (l) => 9 + l * 0.5,
    damage: (l) => ({ min: 4 + 2 * (l - 1), max: 26 + 8 * (l - 1) }),
    synergies: [{ id: 'chargedbolt', pct: 6 }],
    blurb: 'A bolt down a straight line, there before you have finished pointing.',
    effect: () => `Strikes everything in a line ${BOLT_RANGE} tiles long`,
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      beam(ctx, caster, tx, ty, {
        roll: rollFor(ctx, caster, sk, lvl), element: 'light',
        range: BOLT_RANGE, width: BOLT_WIDTH, pierce: pierceTable(caster),
      });
      if (ctx.sfx) ctx.sfx('lightning', { big: true });
    },
  },
  {
    id: 'chainlightning', name: 'Chain Lightning', tree: 'light', req: 18, prereq: ['lightning'], element: 'light', iconSeed: 3,
    mana: (l) => 12 + l * 0.5,
    damage: (l) => ({ min: 2 + 1.5 * (l - 1), max: 12 + 4 * (l - 1) }),
    targets: (l) => Math.min(10, 4 + Math.floor((l - 1) / 5)),
    synergies: [{ id: 'lightning', pct: 5 }],
    blurb: 'It jumps. Stand them in a line and it does the walking.',
    effect(l) { return `Touches up to ${this.targets(l)} enemies, each for the damage above`; },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 16);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 16, vx: a.vx, vy: a.vy, speed: 16,
        element: 'light', colour: '#cfe0ff', drawR: 4, light: 3.4, ttl: 1.4, radius: 0.3,
        chain: sk.targets(lvl) - 1,
        onHit: (p, e) => {
          ctx.damageMonster(e, { light: roll() }, { source: caster, pierce });
          ctx.fx.burst('spark', e.x, e.y, 5, { z: 16, spread: 1.2, r: 200, g: 220, b: 255, life: 0.25 });
        },
      });
      if (ctx.sfx) ctx.sfx('lightning');
    },
  },
  {
    id: 'teleport', name: 'Teleport', tree: 'light', req: 18, prereq: ['telekinesis'], iconSeed: 6,
    mana: (l) => Math.max(8, 24 - l),
    range: 14,
    blurb: 'Step across the room. Walls do not care, but they do stop you landing in them.',
    cast(caster, lvl, tx, ty, ctx) {
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      const range = this.range;
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 6);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      ctx.fx.burst('glow', caster.x, caster.y, 14, { z: 16, spread: 2.4, r: 170, g: 110, b: 255, life: 0.4 });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 180, cg: 120, cb: 255, life: 0.3, w: 3, lit: 1.4 });
      caster.x = spot.x; caster.y = spot.y;
      caster.stop();
      ctx.fx.burst('glow', caster.x, caster.y, 16, { z: 16, spread: 2.4, r: 170, g: 110, b: 255, life: 0.4 });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.8, cr: 180, cg: 120, cb: 255, life: 0.3, w: 3, lit: 1.4 });
      if (ctx.sfx) ctx.sfx('teleport');
      return true;
    },
  },
  {
    id: 'thunderstorm', name: 'Thunder Storm', tree: 'light', req: 24, prereq: ['chainlightning'], element: 'light', iconSeed: 5,
    mana: (l) => 20 + l * 0.5,
    // A strike is small because there are nine of them: nine sevens for 20.5
    // mana is what Charged Bolt charges, and the cloud aims itself.
    damage: (l) => ({ min: 4 + 2 * (l - 1), max: 10 + 4 * (l - 1) }),
    duration: (l) => 20 + (l - 1),
    synergies: [{ id: 'chainlightning', pct: 4 }],
    blurb: 'A cloud that follows you, and takes an interest in whoever is nearest.',
    effect(l) {
      return `Strikes one enemy within ${STORM_RANGE} tiles every ${STORM_EVERY.toFixed(1)}s, for ${Math.round(this.duration(l))}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      caster.buffs.thunderstorm = {
        t: sk.duration(lvl),
        proc: {
          every: STORM_EVERY,
          fn: (c, p) => {
            const t = randomNear(c, p.x, p.y, STORM_RANGE);
            if (!t) return;
            c.fx.arc(p.x, p.y, t.x, t.y, { z: 40, w: 3 });
            c.fx.burst('spark', t.x, t.y, 8, { z: 16, spread: 1.6, r: 210, g: 225, b: 255, life: 0.3 });
            c.damageMonster(t, { light: roll() }, { source: p, pierce });
            if (c.sfx) c.sfx('lightning');
          },
        },
      };
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.4, cr: 180, cg: 210, cb: 255, life: 0.4, w: 3, lit: 1.6 });
    },
  },
  {
    id: 'energyshield', name: 'Energy Shield', tree: 'light', req: 24, prereq: ['telekinesis'], iconSeed: 10,
    mana: (l) => 15 + l * 0.5,
    split: (l) => Math.min(0.6, 0.2 + 0.02 * (l - 1)),
    duration: (l) => 40 + 4 * (l - 1),
    blurb: 'Blows land on the mana first. An empty orb is no shield at all.',
    effect(l) {
      return `${Math.round(this.split(l) * 100)}% of damage taken is paid from mana, for ${Math.round(this.duration(l))}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.energyshield = { t: this.duration(lvl), esplit: this.split(lvl) };
      ctx.fx.ring(caster.x, caster.y, { maxR: 2, cr: 150, cg: 180, cb: 255, life: 0.4, w: 3, lit: 1.6 });
      ctx.fx.burst('glow', caster.x, caster.y, 14, { z: 16, spread: 1.6, r: 150, g: 180, b: 255, life: 0.5 });
      if (ctx.sfx) ctx.sfx('cast');
    },
  },
  {
    id: 'lightmastery', name: 'Lightning Mastery', tree: 'light', req: 30, prereq: ['nova'], passive: true, iconSeed: 8,
    blurb: 'Enemy lightning resistance counts for much less.',
    effect: (l) => `-${Math.min(130, 20 + 7 * (l - 1))}% Enemy Lightning Resist`,
  },

  // -------------------------------------------------------- BARBARIAN COMBAT
  {
    id: 'bash', name: 'Bash', tree: 'combat', req: 1, prereq: [], melee: true, iconSeed: 0,
    mana: () => 2,
    blurb: 'A crushing blow that sends the target staggering back.',
    effect: (l) => `+${50 + 8 * (l - 1)}% Damage, +${20 + 5 * (l - 1)} Attack Rating, knocks back`,
    cast(caster, lvl, tx, ty, ctx) {
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        const dealt = weaponHit(caster, target, ctx, { ed: 50 + 8 * (lvl - 1), ar: 20 + 5 * (lvl - 1) });
        if (dealt > 0 && target.alive) knockback(ctx.level, target, caster.x, caster.y, 0.7);
      });
    },
  },
  {
    id: 'doubleswing', name: 'Double Swing', tree: 'combat', req: 6, prereq: ['bash'], melee: true, iconSeed: 1,
    mana: () => 1,
    blurb: 'One swing for the target, one for whoever stands beside it.',
    effect: (l) => `Two hits, +${15 + 5 * (l - 1)} Attack Rating each`,
    cast(caster, lvl, tx, ty, ctx) {
      const ar = 15 + 5 * (lvl - 1);
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ar });
        let other = null, od = MELEE_REACH + 0.2;
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc || e === target) continue;
          const d = caster.distTo(e);
          if (d < od) { od = d; other = e; }
        }
        if (other) weaponHit(caster, other, ctx, { ar });
      });
    },
  },
  {
    id: 'leap', name: 'Leap', tree: 'combat', req: 6, prereq: [], melee: true, iconSeed: 2,
    mana: () => 3,
    blurb: 'Jump to a point. The landing throws everything nearby off its feet.',
    effect: (l) => `Range ${(5 + 0.25 * (l - 1)).toFixed(2)} tiles, stuns ${(0.4 + 0.05 * (l - 1)).toFixed(2)}s on landing`,
    cast(caster, lvl, tx, ty, ctx) {
      const range = 5 + 0.25 * (lvl - 1);
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 4);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      const from = { x: caster.x, y: caster.y };
      const dur = 0.45;
      let t = 0;
      caster.stop();
      caster.busy = dur + 0.1;
      caster.face(spot.x, spot.y);
      caster.setAnim('walk', { fps: 15 });
      if (ctx.sfx) ctx.sfx('swing');
      caster.action = (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        // Position ignores walls: a leap crosses what walking cannot. Only
        // the landing point was validated.
        caster.x = from.x + (spot.x - from.x) * k;
        caster.y = from.y + (spot.y - from.y) * k;
        caster.zOff = Math.sin(k * Math.PI) * 26;
        if (k < 1) return false;
        caster.zOff = 0;
        caster.setAnim('idle', { force: true });
        const stun = 0.4 + 0.05 * (lvl - 1);
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc) continue;
          if (Math.hypot(e.x - caster.x, e.y - caster.y) > LEAP_AOE_R + e.radius) continue;
          knockback(ctx.level, e, caster.x, caster.y, 1.0);
          applyStun(e, stun);
        }
        ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 200, cg: 180, cb: 140, life: 0.3, w: 3, lit: 1 });
        ctx.fx.burst('dust', caster.x, caster.y, 14, { z: 4, spread: 2.2, r: 150, g: 130, b: 100, life: 0.5 });
        if (ctx.sfx) ctx.sfx('hit');
        return true;
      };
      return true;
    },
  },
  {
    id: 'stun', name: 'Stun', tree: 'combat', req: 12, prereq: ['bash'], melee: true, iconSeed: 3,
    mana: () => 2,
    stun: (l) => 1.2 + 0.1 * (l - 1),
    blurb: 'A blow to the head rather than the body. Bosses keep their feet.',
    effect(l) {
      return `+${20 + 6 * (l - 1)}% Damage, +${25 + 6 * (l - 1)} Attack Rating, stuns ${this.stun(l).toFixed(1)}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        const dealt = weaponHit(caster, target, ctx, { ed: 20 + 6 * (lvl - 1), ar: 25 + 6 * (lvl - 1) });
        // A miss rattles nobody, which is what the attack rating on it is for.
        if (dealt > 0) applyStun(target, sk.stun(lvl));
      });
    },
  },
  {
    id: 'doublethrow', name: 'Double Throw', tree: 'combat', req: 12, prereq: ['doubleswing'], melee: true, iconSeed: 4,
    mana: () => 3,
    // 30 rather than 20 at rank 1: measured at the bench, 20 put the two throws
    // at 0.74x of Double Swing's damage per mana, just under the band.
    ed: (l) => 30 + 8 * (l - 1),
    ar: (l) => 20 + 6 * (l - 1),
    blurb: 'Both hands at once, and neither of them keeps what it was holding.',
    effect(l) {
      return `Throws two, each for weapon damage +${this.ed(l)}% and +${this.ar(l)} Attack Rating`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      // Throwing Mastery rides only this skill, which is why it is read here
      // rather than folded into the sheet by refreshPassives.
      const tm = skillLevel(caster, 'throwingmastery');
      const bonus = tm > 0 ? 25 + 8 * (tm - 1) : 0;
      const ed = sk.ed(lvl) + bonus, ar = sk.ar(lvl) + bonus;
      const base = Math.atan2(ty - caster.y, tx - caster.x);
      // Weapon speed, not the cast lockout: this is a swing that lets go.
      caster.stop();
      caster.busy = 0.42 / caster.attackSpeed;
      caster.face(tx, ty);
      if (ctx.sfx) ctx.sfx('swing');
      caster.setAnim('attack', {
        loop: false, force: true, hitFrame: 3,
        onHitFrame: () => {
          for (const off of [-0.09, 0.09]) {
            const ang = base + off;
            ctx.projectiles.spawn({
              x: caster.x, y: caster.y, z: 16,
              vx: Math.cos(ang) * 13, vy: Math.sin(ang) * 13, speed: 13,
              element: 'phys', thrown: true, weapon: true, owner: caster,
              ed, ar, ttl: 1.1, radius: 0.3,
            });
          }
        },
        onEnd: () => caster.setAnim('idle'),
      });
      return true;
    },
  },
  {
    id: 'leapattack', name: 'Leap Attack', tree: 'combat', req: 18, prereq: ['leap'], melee: true, iconSeed: 5,
    mana: () => 4,
    ed: (l) => 150 + 15 * (l - 1),
    blurb: 'Land on them. The ground takes some of it and they take the rest.',
    effect(l) {
      return `Range ${(5 + 0.25 * (l - 1)).toFixed(2)} tiles, then everything within ${LEAP_AOE_R} tiles takes weapon damage +${this.ed(l)}%`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const range = 5 + 0.25 * (lvl - 1);
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 4);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      const from = { x: caster.x, y: caster.y };
      const dur = 0.45;
      const ed = sk.ed(lvl);
      let t = 0;
      caster.stop();
      caster.busy = dur + 0.1;
      caster.face(spot.x, spot.y);
      caster.setAnim('attack', { fps: 12, loop: true });
      if (ctx.sfx) ctx.sfx('swing');
      caster.action = (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        caster.x = from.x + (spot.x - from.x) * k;
        caster.y = from.y + (spot.y - from.y) * k;
        caster.zOff = Math.sin(k * Math.PI) * 26;
        if (k < 1) return false;
        caster.zOff = 0;
        caster.setAnim('idle', { force: true });
        // The blow is the landing: everything under it is struck once, with
        // the attack roll each, exactly as if it had been swung at.
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc) continue;
          if (Math.hypot(e.x - caster.x, e.y - caster.y) > LEAP_AOE_R + e.radius) continue;
          weaponHit(caster, e, ctx, { ed });
        }
        ctx.fx.ring(caster.x, caster.y, { maxR: 1.8, cr: 220, cg: 170, cb: 110, life: 0.32, w: 4, lit: 1.4 });
        ctx.fx.burst('dust', caster.x, caster.y, 18, { z: 4, spread: 2.6, r: 150, g: 130, b: 100, life: 0.55 });
        if (ctx.sfx) ctx.sfx('hit');
        return true;
      };
      return true;
    },
  },
  {
    id: 'concentrate', name: 'Concentrate', tree: 'combat', req: 18, prereq: ['stun'], melee: true, iconSeed: 6,
    mana: () => 2,
    synergies: [{ id: 'bash', pct: 5 }],
    blurb: 'A deliberate, heavy blow. Bash practice makes it heavier.',
    effect: (l) => `+${60 + 10 * (l - 1)}% Damage, +${30 + 5 * (l - 1)} Attack Rating`,
    cast(caster, lvl, tx, ty, ctx) {
      // Synergy reads hard points, matching every other synergy in the file.
      const ed = 60 + 10 * (lvl - 1) + 5 * allocatedPoints(caster, 'bash');
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ed, ar: 30 + 5 * (lvl - 1) });
      });
    },
  },
  {
    id: 'frenzy', name: 'Frenzy', tree: 'combat', req: 24, prereq: ['doublethrow'], melee: true, iconSeed: 7,
    mana: () => 2,
    ed: (l) => 30 + 8 * (l - 1),
    ias: (l) => 6 + (l - 1),
    decay: (l) => 3 + 0.2 * (l - 1),
    duration: (l) => 12 + 0.4 * (l - 1),
    blurb: 'Blood in the water. Every blow that lands makes the next one sooner.',
    effect(l) {
      return `+${this.ed(l)}% Damage; each hit adds +${this.ias(l)}% Attack Speed for ${this.decay(l).toFixed(1)}s, up to ${FRENZY_STACKS}`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        const dealt = weaponHit(caster, target, ctx, { ed: sk.ed(lvl), ar: 20 + 6 * (lvl - 1) });
        if (dealt <= 0) return;             // a miss earns nothing
        const b = caster.buffs.frenzy;
        // The window refreshes on every landed blow; the stacks inside it keep
        // their own clocks and run out one at a time.
        if (b) b.t = sk.duration(lvl);
        else {
          caster.buffs.frenzy = {
            t: sk.duration(lvl), ias: sk.ias(lvl),
            stacks: { max: FRENZY_STACKS, decay: sk.decay(lvl) },
          };
        }
        addStack(caster, 'frenzy');
        ctx.fx.burst('spark', caster.x, caster.y, 5, { z: 16, spread: 0.9, r: 255, g: 120, b: 70, life: 0.24 });
      });
    },
  },
  {
    id: 'whirlwind', name: 'Whirlwind', tree: 'combat', req: 30, prereq: ['concentrate', 'leapattack'], melee: true, iconSeed: 8,
    mana: () => 12,
    blurb: 'Become the storm. Travel, and everything on the way is hit.',
    effect: (l) => `${-50 + 10 * (l - 1)}% Damage per hit, a hit every 0.15s en route`,
    cast(caster, lvl, tx, ty, ctx) {
      const dx = tx - caster.x, dy = ty - caster.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) return false;
      const ux = dx / d, uy = dy / d;
      const dist = Math.min(7, d);
      const speed = 7.5;
      const dur = dist / speed;
      const ed = -50 + 10 * (lvl - 1);
      let t = 0, hitT = 0, spinT = 0;
      caster.stop();
      caster.busy = dur + 0.05;
      caster.setAnim('attack', { fps: 20 });        // looping spin
      if (ctx.sfx) ctx.sfx('swing');
      const finish = () => { caster.setAnim('idle', { force: true }); caster.busy = 0.1; return true; };
      caster.action = (dt) => {
        t += dt; hitT += dt; spinT += dt;
        if (spinT > 0.07) { spinT = 0; caster.dir = (caster.dir + 1) % 8; }
        const moved = caster.moveBy(ux * speed * dt, uy * speed * dt, ctx.level);
        while (hitT >= 0.15) {
          hitT -= 0.15;
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - caster.x, e.y - caster.y) > 1.5 + e.radius) continue;
            weaponHit(caster, e, ctx, { ed });
          }
        }
        // Stopping early at the first blocked tile is the D2 behaviour.
        if (!moved || t >= dur) return finish();
        return false;
      };
      return true;
    },
  },
  {
    id: 'berserk', name: 'Berserk', tree: 'combat', req: 30, prereq: ['concentrate'], melee: true, iconSeed: 9,
    mana: () => 5,
    ed: (l) => 250 + 25 * (l - 1),
    duration: (l) => 3 + 0.1 * (l - 1),
    blurb: 'Everything into the swing, nothing left over for the guard.',
    effect(l) {
      return `+${this.ed(l)}% Damage, +${40 + 6 * (l - 1)} Attack Rating, and your Defence is 0 for ${this.duration(l).toFixed(1)}s`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const swung = meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ed: sk.ed(lvl), ar: 40 + 6 * (lvl - 1) });
      });
      if (!swung) return false;                  // nothing in reach, nothing paid
      // The guard is what buys the rage: a buff carrying defPct -100 multiplies
      // the sheet's defence by zero, and nothing in recalc adds it back while
      // the buff stands. It returns the moment the buff lapses.
      caster.buffs.berserk = { t: sk.duration(lvl), defPct: -100 };
      caster.recalc();
      ctx.fx.ring(caster.x, caster.y, { maxR: 2, cr: 220, cg: 60, cb: 40, life: 0.34, w: 4, lit: 1.6 });
      ctx.fx.burst('ember', caster.x, caster.y, 14, { z: 16, spread: 1.6, spreadZ: 20, r: 230, g: 80, b: 50, life: 0.45 });
      return true;
    },
  },

  // ------------------------------------------------------- BARBARIAN WARCRIES
  {
    id: 'howl', name: 'Howl', tree: 'cries', req: 1, prereq: [], iconSeed: 10,
    mana: () => 4,
    blurb: 'A shout that sends lesser enemies running.',
    effect: (l) => `Monsters within 4 tiles flee for ${(3 + 0.4 * (l - 1)).toFixed(1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 3 + 0.4 * (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 4, cr: 232, cg: 160, cb: 48, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc || e.def.boss) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 4 + e.radius) continue;
        e.state = 'flee';
        e.fleeTimer = Math.max(e.fleeTimer || 0, dur);
      }
    },
  },
  {
    id: 'findpotion', name: 'Find Potion', tree: 'cries', req: 1, prereq: [], targetsCorpse: true, iconSeed: 11,
    mana: () => 2,
    finds: (l) => 1 + Math.floor((l - 1) / 10),
    blurb: 'Everything carries something. Turn it out and see.',
    effect(l) {
      const n = this.finds(l);
      return `Searches a body within ${CORPSE_RANGE} tiles for ${n} potion${n > 1 ? 's' : ''}; the body is spent`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const body = corpseToWork(ctx, caster, tx, ty);
      if (!body) return false;                   // no body, no cost
      consumeCorpse(ctx, body);
      const tier = tierForAreaLevel(ctx.level.areaLevel || 1);
      const pool = POTIONS.filter((p) => p.tier <= tier);
      for (let i = 0; i < this.finds(lvl); i++) dropBeside(ctx, body, makePotion(ctx.rng.pick(pool).id));
      ctx.fx.ring(body.x, body.y, { maxR: 1.2, cr: 220, cg: 90, cb: 80, life: 0.3, w: 3, lit: 1.2 });
      if (ctx.sfx) ctx.sfx('pickup');
      return true;
    },
  },
  {
    id: 'taunt', name: 'Taunt', tree: 'cries', req: 6, prereq: ['howl'], iconSeed: 12,
    mana: () => 3,
    duration: (l) => 6 + 0.3 * (l - 1),
    arDebuff: (l) => Math.min(0.6, 0.25 + 0.02 * (l - 1)),
    dmgDebuff: (l) => Math.min(0.5, 0.2 + 0.015 * (l - 1)),
    blurb: 'An insult in a language it does not need to speak. Bosses are past caring.',
    effect(l) {
      return `Pulls one enemy within ${TAUNT_REACH} tiles onto you for ${this.duration(l).toFixed(1)}s, `
        + `at -${Math.round(this.arDebuff(l) * 100)}% Attack Rating and -${Math.round(this.dmgDebuff(l) * 100)}% Damage`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const t = targetNear(ctx, tx, ty, 1.6);
      if (!t || caster.distTo(t) > TAUNT_REACH) return false;
      // A boss refuses the taunt, the same way it shrugs off fear and stun, and
      // a refusal costs nothing.
      if (!forceTaunt(t, caster, {
        seconds: this.duration(lvl), arDebuff: this.arDebuff(lvl), dmgDebuff: this.dmgDebuff(lvl),
      })) return false;
      ctx.fx.arc(caster.x, caster.y, t.x, t.y, { z: 18, w: 2, r: 232, g: 160, b: 48 });
      ctx.fx.ring(t.x, t.y, { maxR: 1.2, cr: 232, cg: 160, cb: 48, life: 0.3, w: 3, lit: 1.2 });
      return true;
    },
  },
  {
    id: 'shout', name: 'Shout', tree: 'cries', req: 6, prereq: ['howl'], iconSeed: 13,
    mana: () => 6,
    blurb: 'A rallying cry that hardens the skin like armour.',
    effect: (l) => `+${100 + 10 * (l - 1)}% Defence for ${20 + 5 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.shout = { t: 20 + 5 * (lvl - 1), mag: 100 + 10 * (lvl - 1) };
      caster.recalc();
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.2, cr: 200, cg: 190, cb: 150, life: 0.35, w: 3, lit: 1.2 });
    },
  },
  {
    id: 'finditem', name: 'Find Item', tree: 'cries', req: 12, prereq: ['findpotion'], targetsCorpse: true, iconSeed: 14,
    mana: () => 4,
    finds: (l) => 1 + Math.floor((l - 1) / 10),
    blurb: 'A second search, and a better eye for what is worth carrying.',
    effect(l) {
      const n = this.finds(l);
      return `Searches a body within ${CORPSE_RANGE} tiles for ${n} item${n > 1 ? 's' : ''} of this area; the body is spent`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      const body = corpseToWork(ctx, caster, tx, ty);
      if (!body) return false;
      consumeCorpse(ctx, body);
      const alvl = ctx.level.areaLevel || 1;
      for (let i = 0; i < this.finds(lvl); i++) {
        dropBeside(ctx, body, rollItem(ctx.rng, alvl, { mf: caster.magicFind, tier: tierForAreaLevel(alvl) }));
      }
      ctx.fx.ring(body.x, body.y, { maxR: 1.4, cr: 240, cg: 200, cb: 120, life: 0.32, w: 3, lit: 1.4 });
      if (ctx.sfx) ctx.sfx('pickup');
      return true;
    },
  },
  {
    id: 'battlecry', name: 'Battle Cry', tree: 'cries', req: 18, prereq: ['taunt'], iconSeed: 15,
    mana: () => 5,
    blurb: 'A curse of a shout. What hears it fights worse.',
    effect: (l) => `Enemies within 3.5 tiles: -50% Defence, -25% Damage for ${12 + (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 12 + (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 3.5, cr: 220, cg: 120, cb: 60, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3.5 + e.radius) continue;
        e.battlecry = { def: 0.5, dmg: 0.75, t: dur };
      }
    },
  },
  {
    id: 'battleorders', name: 'Battle Orders', tree: 'cries', req: 24, prereq: ['shout'], iconSeed: 16,
    mana: () => 7,
    blurb: 'The order to stand. Life and mana swell to meet it.',
    effect: (l) => `+${30 + 3 * (l - 1)}% Maximum Life and Mana for ${30 + 6 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      // Orbs and sheet max life/mana rise, but current values keep their
      // absolute numbers — recalc's non-fill grant branch would otherwise
      // hand over the max-delta as a free heal/mana top-up on every cast.
      const prevHp = caster.hp, prevMana = caster.mana;
      caster.buffs.battleorders = { t: 30 + 6 * (lvl - 1), mag: 30 + 3 * (lvl - 1) };
      caster.recalc();
      caster.hp = Math.min(prevHp, caster.maxHp);
      caster.mana = Math.min(prevMana, caster.maxMana);
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.6, cr: 240, cg: 200, cb: 120, life: 0.4, w: 3, lit: 1.4 });
    },
  },
  {
    id: 'grimward', name: 'Grim Ward', tree: 'cries', req: 24, prereq: ['taunt'], targetsCorpse: true, iconSeed: 17,
    mana: () => 8,
    duration: (l) => 8 + 0.4 * (l - 1),
    radius: (l) => 4 + 0.1 * (l - 1),
    fear: (l) => 1.5 + 0.05 * (l - 1),
    blurb: 'A body up on a stake. Whatever walks in remembers somewhere else to be.',
    effect(l) {
      return `A body on a stake routs everything within ${this.radius(l).toFixed(1)} tiles for ${this.duration(l).toFixed(1)}s`
        + ' — bosses excepted. Only one ward stands at a time';
    },
    cast(caster, lvl, tx, ty, ctx) {
      const body = corpseToWork(ctx, caster, tx, ty);
      if (!body) return false;
      consumeCorpse(ctx, body);
      // One ward, as in the original: planting a second takes the first down.
      // It is also what keeps the fear pulses — and their smoke — bounded.
      const list = ctx.level.hazards;
      if (list) for (let i = list.length - 1; i >= 0; i--) if (list[i].ward) list.splice(i, 1);
      const h = layHazard(ctx.level, {
        x: body.x, y: body.y, r: this.radius(lvl), element: 'phys',
        fear: this.fear(lvl), until: ctx.time + this.duration(lvl), tick: WARD_PULSE, source: caster,
      });
      h.ward = true;
      ctx.fx.ring(body.x, body.y, { maxR: this.radius(lvl), cr: 206, cg: 192, cb: 150, life: 0.5, w: 3, lit: 1.2 });
      ctx.fx.burst('smoke', body.x, body.y, 12, { z: 8, spread: 1.8, r: 100, g: 92, b: 80, life: 1.1 });
      if (ctx.sfx) ctx.sfx('explode');
      return true;
    },
  },
  {
    id: 'warcry', name: 'War Cry', tree: 'cries', req: 30, prereq: ['battlecry'], iconSeed: 18,
    mana: () => 10, element: 'phys',
    damage: (l) => ({ min: 18 + 6 * (l - 1), max: 28 + 8 * (l - 1) }),
    synergies: [{ id: 'howl', pct: 6 }, { id: 'battlecry', pct: 6 }],
    blurb: 'A shout that lands like a blow, and leaves the survivors reeling.',
    effect: (l) => `Stuns for ${Math.min(3, 1 + 0.1 * (l - 1)).toFixed(1)}s within 3 tiles`,
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const stun = Math.min(3, 1 + 0.1 * (lvl - 1));
      ctx.fx.ring(caster.x, caster.y, { maxR: 3, cr: 255, cg: 180, cb: 80, life: 0.4, w: 5, lit: 2 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3 + e.radius) continue;
        ctx.damageMonster(e, { phys: roll() }, { source: caster });
        applyStun(e, stun);
      }
      if (ctx.sfx) ctx.sfx('explode');
    },
  },

  {
    id: 'battlecommand', name: 'Battle Command', tree: 'cries', req: 30, prereq: ['battleorders'], iconSeed: 19,
    mana: () => 12,
    duration: (l) => 20 + 2 * (l - 1),
    blurb: 'The order that makes every trick come a little easier.',
    // Deliberately narrow: the +1 moves every live skill-level read — damage,
    // duration, reach, mana cost — but the passives are folded into the sheet at
    // allocation time, and this buff does not go back and re-fold them. The
    // tooltip promises only what the buff actually delivers.
    effect(l) {
      return `+1 to the skills you cast for ${Math.round(this.duration(l))}s; the passives keep the level on your sheet`;
    },
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.battlecommand = { t: this.duration(lvl), plusSkills: 1 };
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.8, cr: 255, cg: 220, cb: 140, life: 0.42, w: 3, lit: 1.6 });
      ctx.fx.burst('glow', caster.x, caster.y, 14, { z: 18, spread: 1.8, r: 255, g: 220, b: 140, life: 0.5 });
    },
  },

  // ------------------------------------------------------ BARBARIAN MASTERIES
  {
    id: 'axemastery', name: 'Axe Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 0,
    blurb: 'Axes hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with axes`,
  },
  {
    id: 'macemastery', name: 'Mace Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 3,
    blurb: 'Clubs, maces and hammers hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with maces`,
  },
  {
    id: 'swordmastery', name: 'Sword Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 1,
    blurb: 'Blades of every length hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with swords`,
  },
  {
    id: 'polearmmastery', name: 'Polearm Mastery', tree: 'mastery', req: 6, prereq: [], passive: true, iconSeed: 17,
    blurb: 'Voulge, halberd, war scythe: reach, used as though it were close work.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with polearms`,
  },
  {
    id: 'throwingmastery', name: 'Throwing Mastery', tree: 'mastery', req: 6, prereq: [], passive: true, iconSeed: 4,
    blurb: 'A weapon you let go of still has to land where you meant it to.',
    effect: (l) => `+${25 + 8 * (l - 1)}% Damage, +${25 + 8 * (l - 1)} Attack Rating with Double Throw`,
  },
  {
    id: 'spearmastery', name: 'Spear Mastery', tree: 'mastery', req: 12, prereq: [], passive: true, iconSeed: 20,
    blurb: 'Spear, trident, pike: the point kept where the weight wants to go.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with spears`,
  },
  {
    id: 'increasedstamina', name: 'Increased Stamina', tree: 'mastery', req: 12, prereq: [], passive: true, iconSeed: 6,
    // The original trains a stamina bar. This slice has none, so the training
    // shows where it can be felt — and the tooltip says so outright rather than
    // quietly meaning something else.
    lifePct: (l) => 5 + 3 * (l - 1),
    blurb: 'Wind that does not run out. No stamina bar here, so it is carried as flesh.',
    effect(l) { return `+${this.lifePct(l)}% Maximum Life`; },
  },
  {
    id: 'ironskin', name: 'Iron Skin', tree: 'mastery', req: 18, prereq: [], passive: true, iconSeed: 13,
    blurb: 'Skin like worked metal.',
    effect: (l) => `+${30 + 10 * (l - 1)}% Defence`,
  },
  {
    id: 'increasedspeed', name: 'Increased Speed', tree: 'mastery', req: 24, prereq: [], passive: true, iconSeed: 2,
    runPct: (l) => 8 + 2 * (l - 1),
    blurb: 'Ground covered without thinking about covering it.',
    effect(l) { return `+${this.runPct(l)}% Run Speed`; },
  },
  {
    id: 'naturalresistance', name: 'Natural Resistance', tree: 'mastery', req: 30, prereq: [], passive: true, iconSeed: 15,
    resAll: (l) => 5 + 3 * (l - 1),
    blurb: 'Northern weather, and worse than weather, worked into the hide.',
    effect(l) { return `+${this.resAll(l)}% to All Resistances`; },
  },
];

export const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

export const CLASS_TREES = {
  sorceress: ['fire', 'cold', 'light'],
  barbarian: ['cries', 'combat', 'mastery'],
};
export const TREE_NAME = {
  fire: 'Fire', cold: 'Cold', light: 'Lightning',
  cries: 'Warcries', combat: 'Combat', mastery: 'Masteries',
};
const ELEMENT_NAME = { fire: 'Fire', cold: 'Cold', light: 'Lightning', phys: 'Physical' };

// ------------------------------------------------------------- allocation

export function canAllocate(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk) return { ok: false, why: 'unknown skill' };
  if (!CLASS_TREES[player.cls].includes(sk.tree)) return { ok: false, why: 'not of your class' };
  if (player.skillPoints <= 0) return { ok: false, why: 'no skill points' };
  if (player.level < sk.req) return { ok: false, why: `requires level ${sk.req}` };
  for (const p of sk.prereq || []) {
    if (allocatedPoints(player, p) <= 0) return { ok: false, why: `requires ${SKILL_BY_ID[p].name}` };
  }
  if (allocatedPoints(player, id) >= 20) return { ok: false, why: 'at maximum' };
  return { ok: true };
}

export function allocate(player, id) {
  const c = canAllocate(player, id);
  if (!c.ok) return false;
  player.skills[id] = allocatedPoints(player, id) + 1;
  player.skillPoints--;
  refreshPassives(player);
  return true;
}

// Warmth feeds player.manaRegenBonus directly; the masteries feed
// masteryPoints and ironSkinLevel the same way, which recalc folds into
// the sheet. The three Barbarian passives that are not about a weapon hand
// recalc the finished percentage rather than their level, so the number the
// tooltip prints and the number the sheet uses come from the same line.
function pctOf(player, id, field) {
  const lvl = skillLevel(player, id);
  return lvl > 0 ? SKILL_BY_ID[id][field](lvl) : 0;
}

export function refreshPassives(player) {
  const w = skillLevel(player, 'warmth');
  player.manaRegenBonus = w > 0 ? SKILL_BY_ID.warmth.manaRegen(w) : 0;
  player.masteryPoints = {
    axe: skillLevel(player, 'axemastery'),
    mace: skillLevel(player, 'macemastery'),
    sword: skillLevel(player, 'swordmastery'),
    polearm: skillLevel(player, 'polearmmastery'),
    spear: skillLevel(player, 'spearmastery'),
  };
  player.ironSkinLevel = skillLevel(player, 'ironskin');
  player.lifeBonusPct = pctOf(player, 'increasedstamina', 'lifePct');
  player.runSpeedBonusPct = pctOf(player, 'increasedspeed', 'runPct');
  player.resistBonus = pctOf(player, 'naturalresistance', 'resAll');
  player.recalc();
}

export function manaCost(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk || !sk.mana) return 0;
  return Math.max(1, Math.round(sk.mana(Math.max(1, skillLevel(player, id))) * 10) / 10);
}

// Returns 'ok' | 'locked' | 'mana' | 'failed'
export function castSkill(player, id, tx, ty, ctx) {
  const sk = SKILL_BY_ID[id];
  if (!sk || sk.passive || !sk.cast) return 'locked';
  const lvl = skillLevel(player, id);
  if (lvl <= 0) return 'locked';
  const cost = manaCost(player, id);
  if (player.mana < cost) return 'mana';
  const r = sk.cast(player, lvl, tx, ty, ctx);
  if (r === false) return 'failed';
  player.mana -= cost;
  return 'ok';
}

export function describeSkill(player, id) {
  const sk = SKILL_BY_ID[id];
  const alloc = allocatedPoints(player, id);
  const lvl = Math.max(1, skillLevel(player, id));
  const lines = [];
  lines.push({ text: sk.name, colour: '#ffe08a', header: true });
  lines.push({ text: sk.passive ? 'Passive' : `${TREE_NAME[sk.tree]} Skill`, colour: '#9a9078' });
  if (alloc > 0) {
    lines.push({ text: `Level ${alloc}${lvl > alloc ? ` (+${lvl - alloc})` : ''}`, colour: '#d6cdb4' });
  } else {
    lines.push({ text: `Requires Level ${sk.req}`, colour: player.level >= sk.req ? '#9a9078' : '#ff5a4a' });
  }
  lines.push({ text: sk.blurb, colour: '#a89f88', wrap: true });
  if (sk.mana) lines.push({ text: `Mana Cost: ${manaCost(player, id)}`, colour: '#7a86ff' });
  const dmg = skillDamage(player, id);
  if (dmg) lines.push({ text: `Damage: ${dmg.min} to ${dmg.max}`, colour: '#7a86ff' });
  // Ground that keeps burning quotes a rate rather than a hit, because a rate
  // is what standing in it actually costs.
  if (sk.dps) lines.push({ text: `${skillDps(player, id)} ${ELEMENT_NAME[sk.element]} Damage per Second`, colour: '#7a86ff' });
  if (sk.effect) lines.push({ text: sk.effect(lvl), colour: '#7a86ff' });
  if (sk.synergies && sk.synergies.length) {
    const pct = synergyPct(player, sk);
    lines.push({ text: `Synergies: ${sk.synergies.map((s) => SKILL_BY_ID[s.id].name).join(', ')}`, colour: '#8a7f6a' });
    if (pct > 0) lines.push({ text: `+${pct}% from synergies`, colour: '#8fd88f' });
  }
  for (const p of sk.prereq || []) {
    if (allocatedPoints(player, p) <= 0) lines.push({ text: `Requires ${SKILL_BY_ID[p].name}`, colour: '#ff5a4a' });
  }
  return lines;
}
