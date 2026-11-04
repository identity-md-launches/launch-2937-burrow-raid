import { describe, it, expect } from "vitest";
import {
  BOSS,
  createGame,
  EMPTY_INPUT,
  FIXED_DT,
  ROLES,
  botInput,
  distance,
  isDanger,
  startGame,
  step,
  type Role,
} from "../shared/game";
function run(g: ReturnType<typeof createGame>, seconds: number, inputs = {}) {
  for (let n = 0; n < seconds / FIXED_DT; n++) step(g, inputs);
}
describe("authoritative fight rules", () => {
  it("starts with explicit game energy and pauses in the lobby", () => {
    const g = createGame();
    step(g, {});
    expect(g.t).toBe(0);
    expect(g.energy).toBe(45);
    startGame(g);
    run(g, 1);
    expect(g.energy).toBeCloseTo(48);
  });
  it("keeps live base recharge independent of telemetry", () => {
    const g = createGame("live");
    startGame(g);
    run(g, 2);
    expect(g.energy).toBeCloseTo(47);
    expect(g.telemetry.state).toBe("connecting");
  });
  it("bounds diagonal movement, arena edges, invalid numbers and boss collision", () => {
    const g = createGame();
    startGame(g);
    const a = g.actors[0];
    a.x = 5;
    a.z = 0;
    const before = { x: a.x, z: a.z };
    step(g, { local: { ...EMPTY_INPUT, x: 1, z: 1 } });
    expect(distance(a, before)).toBeCloseTo(4.2 * FIXED_DT);
    run(g, 10, { local: { ...EMPTY_INPUT, x: 1, z: 1 } });
    expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(8.00001);
    step(g, { local: { ...EMPTY_INPUT, x: NaN, z: Infinity } });
    expect(Number.isFinite(a.x)).toBe(true);
    a.x = BOSS.x;
    a.z = BOSS.z;
    step(g, {});
    expect(distance(a, BOSS)).toBeGreaterThanOrEqual(1.99);
  });
  for (const role of Object.keys(ROLES) as Role[]) {
    it(`${role}: basic attack is free, range-limited and cooldown-limited`, () => {
      const g = createGame("live", role);
      startGame(g);
      g.actors = g.actors.slice(0, 1);
      const a = g.actors[0];
      a.x = 0;
      a.z = 7;
      step(g, { local: { ...EMPTY_INPUT, attack: true } });
      expect(g.bossHp).toBe(g.bossMaxHp);
      a.z = 2;
      step(g, { local: { ...EMPTY_INPUT, attack: true } });
      expect(g.bossHp).toBe(g.bossMaxHp - ROLES[role].damage);
      step(g, { local: { ...EMPTY_INPUT, attack: true } });
      expect(g.bossHp).toBe(g.bossMaxHp - ROLES[role].damage);
      expect(g.energy).toBeGreaterThanOrEqual(45);
    });
    it(`${role}: skill costs shared energy and respects cooldown`, () => {
      const g = createGame("live", role);
      startGame(g);
      const a = g.actors[0];
      a.x = 0;
      a.z = 2;
      for (const p of g.actors) {
        p.hp = 20;
        p.bot = false;
      }
      step(g, { local: { ...EMPTY_INPUT, ability: true } });
      expect(g.energy).toBeCloseTo(45 + 0.05 - ROLES[role].cost);
      const e = g.energy;
      step(g, { local: { ...EMPTY_INPUT, ability: true } });
      expect(g.energy).toBeCloseTo(e + 0.05);
      expect(a.skillCd).toBeGreaterThan(0);
      if (role === "fighter") expect(g.bossHp).toBe(g.bossMaxHp - 80);
      if (role === "guardian") expect(a.shield).toBe(55);
      if (role === "medic") expect(a.hp).toBe(60);
    });
    it(`${role}: active cooperative pilot can win, restart is clean`, () => {
      const g = createGame("practice", role);
      startGame(g);
      for (let i = 0; i < 3600 && g.status === "playing"; i++) {
        const input = botInput(g, g.actors[0], 0);
        input.ability = g.energy >= ROLES[role].cost;
        step(g, { local: input });
      }
      expect(g.status).toBe("victory");
      expect(g.t).toBeLessThan(120);
      const fresh = createGame("practice", role);
      expect(fresh.t).toBe(0);
      expect(fresh.energy).toBe(45);
      expect(fresh.bossHp).toBe(fresh.bossMaxHp);
    });
  }
  it("does not allow unaffordable skills", () => {
    const g = createGame();
    startGame(g);
    g.energy = 0;
    g.actors[0].z = 2;
    step(g, { local: { ...EMPTY_INPUT, ability: true } });
    expect(g.actors[0].skillCd).toBe(0);
  });
  it("dodge is free, protects against a resolved attack and has a cooldown", () => {
    const g = createGame("live");
    startGame(g);
    const a = g.actors[0];
    g.attack = {
      id: 1,
      kind: "slam",
      x: a.x,
      z: a.z,
      angle: 0,
      start: -1,
      end: 0.05,
      resolved: false,
    };
    step(g, { local: { ...EMPTY_INPUT, dodge: true } });
    expect(a.hp).toBe(a.maxHp);
    expect(a.dodgeCd).toBe(3);
    expect(g.energy).toBeGreaterThan(45);
  });
  it("telegraphs synchronize a hit on resolution, then clear", () => {
    const g = createGame();
    startGame(g);
    const a = g.actors[0];
    g.attack = {
      id: 1,
      kind: "slam",
      x: a.x,
      z: a.z,
      angle: 0,
      start: 0,
      end: 1,
      resolved: false,
    };
    run(g, 0.5);
    expect(a.hp).toBe(a.maxHp);
    run(g, 0.6);
    expect(a.hp).toBe(a.maxHp - 32);
    run(g, 0.5);
    expect(g.attack).toBeNull();
  });
  it("distinguishes circle, annulus and oriented sweep hit zones", () => {
    expect(
      isDanger(
        { x: 0, z: 0 },
        {
          id: 1,
          kind: "slam",
          x: 0,
          z: 0,
          angle: 0,
          start: 0,
          end: 1,
          resolved: false,
        },
      ),
    ).toBe(true);
    expect(
      isDanger(
        { x: 0, z: 1 },
        {
          id: 1,
          kind: "ring",
          x: 0,
          z: 0,
          angle: 0,
          start: 0,
          end: 1,
          resolved: false,
        },
      ),
    ).toBe(false);
    expect(
      isDanger(
        { x: 0, z: 4 },
        {
          id: 1,
          kind: "ring",
          x: 0,
          z: 0,
          angle: 0,
          start: 0,
          end: 1,
          resolved: false,
        },
      ),
    ).toBe(true);
    expect(
      isDanger(
        { x: 5, z: 0 },
        {
          id: 1,
          kind: "sweep",
          x: 0,
          z: 0,
          angle: 0,
          start: 0,
          end: 1,
          resolved: false,
        },
      ),
    ).toBe(false);
  });
  it("allows Medic to revive fallen allies", () => {
    const g = createGame("practice", "medic");
    startGame(g);
    g.actors[1].hp = 0;
    g.actors[1].x = g.actors[0].x;
    g.actors[1].z = g.actors[0].z;
    step(g, { local: { ...EMPTY_INPUT, ability: true } });
    expect(g.actors[1].hp).toBe(40);
  });
  it("ends in defeat when all paws fall or the raid timer expires", () => {
    const g = createGame();
    startGame(g);
    g.actors.forEach((a) => (a.hp = 0));
    step(g, {});
    expect(g.status).toBe("defeat");
    const timeout = createGame();
    startGame(timeout);
    timeout.t = 179.99;
    step(timeout, {});
    expect(timeout.status).toBe("defeat");
  });
  it("does not advance completed fights", () => {
    const g = createGame();
    startGame(g);
    g.bossHp = 0;
    step(g, {});
    expect(g.status).toBe("victory");
    const time = g.t;
    step(g, {});
    expect(g.t).toBe(time);
  });
});
