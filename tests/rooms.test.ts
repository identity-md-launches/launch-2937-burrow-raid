import { afterEach, describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { createRaidServer } from "../server/index";
import { parseInput } from "../server/rooms";
import { EMPTY_INPUT } from "../shared/game";
type Raid = ReturnType<typeof createRaidServer>;
const running: Raid[] = [];
const clients: WebSocket[] = [];
async function setup() {
  const raid = createRaidServer({
    port: 0,
    host: "127.0.0.1",
    telemetryFetch: async () =>
      new Response("{}", { status: 503, headers: { "Retry-After": "60" } }),
  });
  running.push(raid);
  const port = await raid.listen();
  return { raid, url: `ws://127.0.0.1:${port}/rooms` };
}
async function connect(url: string) {
  const ws = new WebSocket(url);
  clients.push(ws);
  await new Promise<void>((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  return ws;
}
function message(ws: WebSocket, op: string): Promise<any> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      rej(new Error(`Timed out waiting for ${op}`));
    }, 4000);
    function handler(data: Buffer) {
      const v = JSON.parse(data.toString());
      if (v.op === op) {
        clearTimeout(timer);
        ws.off("message", handler);
        res(v);
      }
    }
    ws.on("message", handler);
  });
}
async function join(ws: WebSocket, extra: Record<string, unknown> = {}) {
  const wait = message(ws, "joined");
  ws.send(
    JSON.stringify({ op: "join", role: "fighter", mode: "practice", ...extra }),
  );
  return wait;
}
afterEach(async () => {
  for (const ws of clients) ws.terminate();
  clients.length = 0;
  await Promise.all(running.splice(0).map((r) => r.close()));
});
describe("real authoritative WebSocket rooms", () => {
  it("creates real shared rooms, syncs boss state, prevents teleporting and ignores client scores", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      ja = await join(a);
    const b = await connect(url),
      jb = await join(b, { code: ja.code, role: "medic" });
    expect(ja.id).not.toBe(jb.id);
    const r = raid.service.rooms.get(ja.code)!;
    expect(r.seats.size).toBe(2);
    expect(r.game.actors.filter((a) => a.bot)).toHaveLength(1);
    a.send(JSON.stringify({ op: "start" }));
    await message(a, "state");
    const before = { ...r.game.actors[0] };
    a.send(
      JSON.stringify({
        op: "input",
        seq: 1,
        ...EMPTY_INPUT,
        x: 100,
        score: 99999,
        bossHp: 0,
      }),
    );
    await new Promise((r) => setTimeout(r, 120));
    expect(r.game.bossHp).toBeGreaterThan(0);
    expect(r.game.actors[0].x).toBeCloseTo(before.x);
    const sa = await message(a, "state"),
      sb = await message(b, "state");
    expect(Math.abs(sa.state.tick - sb.state.tick)).toBeLessThanOrEqual(4);
    expect(sa.state.attackCount).toBe(sb.state.attackCount);
  });
  it("caps real players at three and does not let a guest start the fight", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      ja = await join(a);
    const b = await connect(url);
    await join(b, { code: ja.code });
    b.send(JSON.stringify({ op: "start" }));
    await message(b, "state");
    expect(raid.service.rooms.get(ja.code)!.game.status).toBe("lobby");
    const c = await connect(url);
    await join(c, { code: ja.code });
    const d = await connect(url),
      err = message(d, "error");
    d.send(
      JSON.stringify({
        op: "join",
        mode: "practice",
        role: "medic",
        code: ja.code,
      }),
    );
    expect((await err).message).toContain("three");
  });
  it("reconnects the same seat with a server-issued token and covers the absent paw", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      ja = await join(a);
    a.close();
    await new Promise((r) => setTimeout(r, 80));
    const r = raid.service.rooms.get(ja.code)!;
    expect(r.game.actors.find((a) => a.id === ja.id)?.connected).toBe(false);
    const b = await connect(url),
      jb = await join(b, { code: ja.code, token: ja.token });
    expect(jb.id).toBe(ja.id);
    expect(r.seats.size).toBe(1);
    expect(r.game.actors.find((a) => a.id === ja.id)?.connected).toBe(true);
  });
  it("awards wheel bonuses once per room, not once per player or duplicate batch", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      ja = await join(a, { mode: "live" });
    const b = await connect(url);
    await join(b, { code: ja.code, mode: "live" });
    const r = raid.service.rooms.get(ja.code)!;
    r.game.status = "playing";
    const initial = r.game.energy;
    const batch = {
      sequence: 900,
      energy: 5,
      view: {
        state: "active" as const,
        text: "Fresh wheel work",
        observedAt: null,
        bonus: 0,
      },
    };
    raid.service.applyWheel(batch);
    expect(r.game.energy).toBeCloseTo(initial + 5);
    raid.service.applyWheel(batch);
    expect(r.game.energy).toBeCloseTo(initial + 5);
    expect(r.game.telemetry.bonus).toBe(5);
  });
  it("expires reconnect seats and cleans abandoned rooms", async () => {
    const { raid, url } = await setup();
    const ws = await connect(url),
      j = await join(ws);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    const r = raid.service.rooms.get(j.code)!;
    for (const s of r.seats.values()) s.disconnectedAt = Date.now() - 31000;
    raid.service.tick();
    expect(r.seats.size).toBe(0);
    expect(r.game.actors.every((a) => a.bot)).toBe(true);
    r.emptyAt = Date.now() - 61000;
    raid.service.tick();
    expect(raid.service.rooms.has(j.code)).toBe(false);
  });
  it("latches a quick combat press across input packets without accepting extra damage", async () => {
    const { raid, url } = await setup();
    const ws = await connect(url),
      j = await join(ws);
    const r = raid.service.rooms.get(j.code)!,
      seat = r.seats.get(j.id)!;
    r.game.actors = r.game.actors.filter((a) => a.id === j.id);
    r.game.actors[0].x = 0;
    r.game.actors[0].z = 2;
    r.game.status = "playing";
    raid.service.input(r, seat, {
      op: "input",
      seq: 1,
      ...EMPTY_INPUT,
      attack: true,
    });
    raid.service.input(r, seat, { op: "input", seq: 2, ...EMPTY_INPUT });
    raid.service.tick();
    expect(r.game.bossHp).toBe(r.game.bossMaxHp - 13);
    raid.service.tick();
    expect(r.game.bossHp).toBe(r.game.bossMaxHp - 13);
  });
  it("preserves host ownership during reconnect grace and transfers after expiry", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      ja = await join(a),
      b = await connect(url),
      jb = await join(b, { code: ja.code });
    a.close();
    await new Promise((r) => setTimeout(r, 60));
    const r = raid.service.rooms.get(ja.code)!;
    expect(r.host).toBe(ja.id);
    r.seats.get(ja.id)!.disconnectedAt = Date.now() - 31000;
    raid.service.tick();
    expect(r.host).toBe(jb.id);
  });
  it("baselines a new room and never banks wheel bonuses for an empty room", async () => {
    const { raid, url } = await setup();
    const a = await connect(url),
      j = await join(a, { mode: "live" }),
      r = raid.service.rooms.get(j.code)!;
    r.game.status = "playing";
    r.lastBatch = 0;
    const energy = r.game.energy;
    const view = {
      state: "active" as const,
      text: "Fresh wheel work",
      observedAt: null,
      bonus: 0,
    };
    raid.service.applyWheel({ sequence: 700, energy: 5, view });
    expect(r.game.energy).toBe(energy);
    raid.service.applyWheel({ sequence: 701, energy: 5, view });
    expect(r.game.energy).toBe(energy + 5);
    a.close();
    await new Promise((r) => setTimeout(r, 60));
    const emptyEnergy = r.game.energy;
    raid.service.applyWheel({ sequence: 702, energy: 5, view });
    expect(r.game.energy).toBe(emptyEnergy);
    const b = await connect(url);
    await join(b, { code: j.code, token: j.token, mode: "live" });
    expect(r.game.telemetry.state).toBe("unavailable");
    expect(r.game.telemetry.bonus).toBe(5);
    expect(r.game.energy).toBeCloseTo(emptyEnergy, 0);
  });
  it("covers input stalls with a bot and returns control when fresh input resumes", async () => {
    const { raid, url } = await setup();
    const ws = await connect(url),
      j = await join(ws),
      r = raid.service.rooms.get(j.code)!,
      s = r.seats.get(j.id)!;
    r.game.status = "playing";
    s.lastInput = Date.now() - 2100;
    raid.service.tick();
    expect(r.game.actors.find((a) => a.id === j.id)?.connected).toBe(false);
    raid.service.input(r, s, { op: "input", seq: 1, ...EMPTY_INPUT });
    raid.service.tick();
    expect(r.game.actors.find((a) => a.id === j.id)?.connected).toBe(true);
  });
  it("rejects unauthorized reconnects and closes message floods", async () => {
    const { url } = await setup();
    const ws = await connect(url),
      j = await join(ws);
    const stranger = await connect(url),
      err = message(stranger, "error");
    stranger.send(
      JSON.stringify({
        op: "join",
        role: "medic",
        mode: "practice",
        code: j.code,
        token: "a".repeat(48),
      }),
    );
    expect((await err).message).toContain("expired");
    const close = new Promise<number>((r) =>
      ws.once("close", (code) => r(code)),
    );
    for (let i = 0; i < 100; i++)
      ws.send(JSON.stringify({ op: "input", seq: i, ...EMPTY_INPUT }));
    expect(await close).toBe(1008);
  });
  it("validates input shape, finite numbers and booleans", () => {
    expect(parseInput({ op: "input", seq: 1, ...EMPTY_INPUT })).not.toBeNull();
    expect(
      parseInput({ op: "input", seq: 1, ...EMPTY_INPUT, x: NaN }),
    ).toBeNull();
    expect(
      parseInput({ op: "input", seq: 1, ...EMPTY_INPUT, attack: "true" }),
    ).toBeNull();
    expect(
      parseInput({ op: "input", seq: 1, ...EMPTY_INPUT, reward: 100 }),
    ).toBeNull();
  });
});
