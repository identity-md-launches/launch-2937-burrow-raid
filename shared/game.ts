export type Role = "fighter" | "guardian" | "medic";
export type Mode = "practice" | "live";
export type Input = {
  x: number;
  z: number;
  attack: boolean;
  dodge: boolean;
  ability: boolean;
};
export const EMPTY_INPUT: Input = {
  x: 0,
  z: 0,
  attack: false,
  dodge: false,
  ability: false,
};
export const ROLES = {
  fighter: {
    name: "Fighter",
    title: "A little bite. A lot of fight.",
    skill: "Acorn burst",
    description: "A heavy strike that hits the boss for 80 damage.",
    hp: 110,
    damage: 13,
    range: 3.8,
    cooldown: 0.48,
    cost: 18,
    skillCooldown: 7,
    color: "#e7ad68",
  },
  guardian: {
    name: "Guardian",
    title: "Stand small. Protect everyone.",
    skill: "Paw shield",
    description: "Give nearby allies a 55-point shield for 6 seconds.",
    hp: 150,
    damage: 10,
    range: 3.8,
    cooldown: 0.6,
    cost: 16,
    skillCooldown: 8,
    color: "#a1bdad",
  },
  medic: {
    name: "Medic",
    title: "Keep the little legends going.",
    skill: "Mushroom bloom",
    description: "Heal nearby allies for 40 health and revive fallen paws.",
    hp: 100,
    damage: 9,
    range: 7,
    cooldown: 0.6,
    cost: 20,
    skillCooldown: 8,
    color: "#d6a6bb",
  },
} as const;
export type Actor = {
  id: string;
  name: string;
  role: Role;
  bot: boolean;
  connected: boolean;
  x: number;
  z: number;
  facing: number;
  hp: number;
  maxHp: number;
  attackCd: number;
  dodgeCd: number;
  skillCd: number;
  invulnerable: number;
  shield: number;
  shieldTime: number;
  downTime: number;
  swing: number;
  lastDx: number;
  lastDz: number;
  dodging: number;
};
export type Attack = {
  id: number;
  kind: "slam" | "ring" | "sweep";
  x: number;
  z: number;
  angle: number;
  start: number;
  end: number;
  resolved: boolean;
};
export type Effect = {
  id: number;
  kind: "hit" | "heal" | "shield" | "burst" | "damage" | "dodge";
  x: number;
  z: number;
  born: number;
};
export type TelemetryView = {
  state:
    | "practice"
    | "connecting"
    | "baseline"
    | "active"
    | "resting"
    | "stale"
    | "unavailable";
  text: string;
  observedAt: string | null;
  bonus: number;
};
export type GameState = {
  mode: Mode;
  status: "lobby" | "playing" | "victory" | "defeat";
  t: number;
  tick: number;
  bossHp: number;
  bossMaxHp: number;
  energy: number;
  actors: Actor[];
  attack: Attack | null;
  nextAttack: number;
  attackCount: number;
  effects: Effect[];
  effectId: number;
  telemetry: TelemetryView;
  message: string;
};
export const ARENA_RADIUS = 8;
export const BOSS = { x: 0, z: -0.7 };
export const RUN_SECONDS = 180;
export const FIXED_DT = 0.05;
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export function makeActor(
  id: string,
  role: Role,
  index: number,
  bot = false,
): Actor {
  const pos = [
    { x: -2.6, z: 3.2 },
    { x: 2.6, z: 2.4 },
    { x: -0.4, z: 5.2 },
  ][index % 3];
  return {
    id,
    role,
    name: bot ? ["Pip", "Moss", "Clover"][index % 3] : "You",
    bot,
    connected: true,
    ...pos,
    facing: 0,
    hp: ROLES[role].hp,
    maxHp: ROLES[role].hp,
    attackCd: 0,
    dodgeCd: 0,
    skillCd: 0,
    invulnerable: 0,
    shield: 0,
    shieldTime: 0,
    downTime: 0,
    swing: 0,
    lastDx: 0,
    lastDz: -1,
    dodging: 0,
  };
}
export function createGame(
  mode: Mode = "practice",
  role: Role = "fighter",
): GameState {
  const others = (Object.keys(ROLES) as Role[]).filter((r) => r !== role);
  return {
    mode,
    status: "lobby",
    t: 0,
    tick: 0,
    bossHp: 3600,
    bossMaxHp: 3600,
    energy: 45,
    actors: [
      makeActor("local", role, 0),
      ...others.map((r, i) => makeActor(`bot-${i}`, r, i + 1, true)),
    ],
    attack: null,
    nextAttack: 3.5,
    attackCount: 0,
    effects: [],
    effectId: 0,
    telemetry:
      mode === "practice"
        ? {
            state: "practice",
            text: "Simulated energy",
            observedAt: null,
            bonus: 0,
          }
        : {
            state: "connecting",
            text: "Connecting to wheel telemetry",
            observedAt: null,
            bonus: 0,
          },
    message: "Defend the burrow.",
  };
}
function effect(
  g: GameState,
  kind: Effect["kind"],
  a: { x: number; z: number },
) {
  g.effects.push({ id: ++g.effectId, kind, x: a.x, z: a.z, born: g.t });
}
export function isDanger(a: { x: number; z: number }, attack: Attack): boolean {
  if (attack.kind === "slam") return distance(a, attack) < 2.35;
  const d = distance(a, BOSS);
  if (attack.kind === "ring") return d > 3.4 && d < 6.1;
  const dx = a.x - BOSS.x,
    dz = a.z - BOSS.z;
  const along = dx * Math.sin(attack.angle) + dz * Math.cos(attack.angle);
  const across = dx * Math.cos(attack.angle) - dz * Math.sin(attack.angle);
  return Math.abs(across) < 1.8 && Math.abs(along) < 8;
}
export function botInput(g: GameState, a: Actor, index: number): Input {
  const angle = -0.9 + index * 2.1;
  const radius = a.role === "medic" ? 5 : 3.1;
  let target = {
    x: BOSS.x + Math.sin(angle) * radius,
    z: BOSS.z + Math.cos(angle) * radius,
  };
  const at = g.attack;
  if (at && !at.resolved && isDanger(a, at)) {
    if (at.kind === "ring")
      target = { x: a.x * 0.25, z: BOSS.z + (a.z - BOSS.z) * 0.25 };
    else if (at.kind === "slam") {
      const dx = a.x - at.x || 0.5,
        dz = a.z - at.z || 0.5,
        len = Math.hypot(dx, dz);
      target = { x: a.x + (dx / len) * 3, z: a.z + (dz / len) * 3 };
    } else
      target = {
        x: a.x + Math.cos(at.angle) * 4,
        z: a.z - Math.sin(at.angle) * 4,
      };
  }
  const dx = target.x - a.x,
    dz = target.z - a.z,
    len = Math.hypot(dx, dz);
  return {
    x: len > 0.25 ? dx / len : 0,
    z: len > 0.25 ? dz / len : 0,
    attack: true,
    dodge: !!at && !at.resolved && at.end - g.t < 0.3 && isDanger(a, at),
    ability:
      g.energy > 65 &&
      (a.role !== "medic" || g.actors.some((p) => p.hp < p.maxHp * 0.65)),
  };
}
export function startGame(g: GameState) {
  if (g.status === "lobby") {
    g.status = "playing";
    g.message = "Stay out of the amber warning zones.";
  }
}
export function addWheelBonus(g: GameState, energy: number) {
  if (g.mode !== "live" || g.status !== "playing") return;
  const amount = Math.max(0, Math.min(5, energy));
  g.energy = Math.min(100, g.energy + amount);
  g.telemetry.bonus += amount;
}
export function step(
  g: GameState,
  inputs: Record<string, Input>,
  dt = FIXED_DT,
) {
  if (g.status !== "playing") return;
  dt = Math.min(0.1, Math.max(0, dt));
  g.t += dt;
  g.tick++;
  g.energy = Math.min(100, g.energy + dt * (g.mode === "practice" ? 3 : 1));
  g.effects = g.effects.filter((e) => g.t - e.born < 0.8);
  for (const [i, a] of g.actors.entries()) {
    for (const key of [
      "attackCd",
      "dodgeCd",
      "skillCd",
      "invulnerable",
      "shieldTime",
      "swing",
      "dodging",
    ] as const)
      a[key] = Math.max(0, a[key] - dt);
    if (a.shieldTime === 0) a.shield = 0;
    if (a.hp <= 0) {
      a.downTime += dt;
      if (a.downTime >= 12 && g.actors.some((p) => p.hp > 0)) {
        a.hp = a.maxHp * 0.4;
        a.downTime = 0;
        a.invulnerable = 2;
        effect(g, "heal", a);
      }
      continue;
    }
    const botControlled = a.bot || !a.connected;
    const raw = botControlled ? botInput(g, a, i) : inputs[a.id] || EMPTY_INPUT;
    let dx = Number.isFinite(raw.x) ? Math.max(-1, Math.min(1, raw.x)) : 0;
    let dz = Number.isFinite(raw.z) ? Math.max(-1, Math.min(1, raw.z)) : 0;
    const length = Math.hypot(dx, dz);
    if (length > 1) {
      dx /= length;
      dz /= length;
    }
    if (length > 0.05) {
      a.lastDx = dx;
      a.lastDz = dz;
    }
    if (raw.dodge && a.dodgeCd === 0) {
      a.dodgeCd = 3;
      a.dodging = 0.23;
      a.invulnerable = 0.42;
      effect(g, "dodge", a);
    }
    const speed = a.dodging > 0 ? 12 : 4.2;
    if (a.dodging > 0) {
      dx = a.lastDx;
      dz = a.lastDz;
    }
    a.x += dx * speed * dt;
    a.z += dz * speed * dt;
    const rad = Math.hypot(a.x, a.z);
    if (rad > ARENA_RADIUS) {
      a.x *= ARENA_RADIUS / rad;
      a.z *= ARENA_RADIUS / rad;
    }
    const db = distance(a, BOSS);
    if (db < 2) {
      let nx = a.x - BOSS.x,
        nz = a.z - BOSS.z;
      if (db < 0.001) {
        nx = 0;
        nz = 1;
      }
      a.x = BOSS.x + (nx / (db || 1)) * 2;
      a.z = BOSS.z + (nz / (db || 1)) * 2;
    }
    a.facing = raw.attack
      ? Math.atan2(BOSS.x - a.x, BOSS.z - a.z)
      : length > 0.05
        ? Math.atan2(dx, dz)
        : a.facing;
    const role = ROLES[a.role];
    if (raw.attack && a.attackCd === 0 && distance(a, BOSS) <= role.range) {
      a.attackCd = role.cooldown;
      a.swing = 0.23;
      g.bossHp = Math.max(
        0,
        g.bossHp -
          (botControlled ? Math.round(role.damage * 0.35) : role.damage),
      );
      effect(g, "hit", BOSS);
    }
    if (raw.ability && a.skillCd === 0 && g.energy >= role.cost) {
      if (a.role === "fighter" && distance(a, BOSS) > 4.6) continue;
      g.energy -= role.cost;
      a.skillCd = role.skillCooldown;
      if (a.role === "fighter") {
        g.bossHp = Math.max(0, g.bossHp - (botControlled ? 28 : 80));
        effect(g, "burst", BOSS);
      } else
        for (const p of g.actors) {
          if (distance(a, p) > (a.role === "medic" ? 6 : 5)) continue;
          if (a.role === "guardian") {
            p.shield = 55;
            p.shieldTime = 6;
            effect(g, "shield", p);
          } else {
            p.hp = Math.min(p.maxHp, p.hp + 40);
            p.downTime = 0;
            effect(g, "heal", p);
          }
        }
    }
  }
  if (g.t >= g.nextAttack) {
    const alive = g.actors.filter((a) => a.hp > 0);
    const target =
      alive[g.attackCount % Math.max(1, alive.length)] || g.actors[0];
    const kind = (["slam", "sweep", "ring"] as const)[g.attackCount % 3];
    g.attack = {
      id: ++g.attackCount,
      kind,
      x: target.x,
      z: target.z,
      angle: Math.atan2(target.x - BOSS.x, target.z - BOSS.z),
      start: g.t,
      end: g.t + (g.bossHp < g.bossMaxHp / 2 ? 1.35 : 1.65),
      resolved: false,
    };
    g.nextAttack = g.t + (g.bossHp < g.bossMaxHp / 2 ? 4 : 5);
    g.message =
      kind === "slam"
        ? "Cable slam! Leave the marked circle."
        : kind === "ring"
          ? "Static ring! Move close or move far."
          : "Cable sweep! Step sideways out of the stripe.";
  }
  if (g.attack && !g.attack.resolved && g.t >= g.attack.end) {
    g.attack.resolved = true;
    for (const a of g.actors) {
      if (a.hp <= 0 || a.invulnerable > 0 || !isDanger(a, g.attack)) continue;
      const damage = 32 + Math.floor(g.t / 45) * 5;
      const absorbed = Math.min(a.shield, damage);
      a.shield -= absorbed;
      a.hp = Math.max(0, a.hp - (damage - absorbed));
      a.invulnerable = 0.5;
      effect(g, "damage", a);
    }
  }
  if (g.attack && g.t > g.attack.end + 0.55) g.attack = null;
  if (g.bossHp <= 0) {
    g.status = "victory";
    g.message = "The burrow is safe. Every little paw helped.";
  } else if (g.actors.every((a) => a.hp <= 0) || g.t >= RUN_SECONDS) {
    g.status = "defeat";
    g.message =
      g.t >= RUN_SECONDS
        ? "The Cable Gnawer overran the burrow."
        : "Even little legends need another try.";
  }
}
