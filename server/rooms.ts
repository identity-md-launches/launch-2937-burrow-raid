import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  createGame,
  EMPTY_INPUT,
  FIXED_DT,
  makeActor,
  startGame,
  step,
  addWheelBonus,
  type GameState,
  type Input,
  type Mode,
  type Role,
} from "../shared/game";
import { WheelPoller, type WheelBatch } from "./telemetry";
export const ROOM_CAP = 3,
  RECONNECT_MS = 30000,
  EMPTY_ROOM_MS = 60000,
  MAX_ROOMS = 64;
type Seat = {
  id: string;
  token: string;
  socket: WebSocket | null;
  input: Input;
  pending: { attack: boolean; dodge: boolean; ability: boolean };
  lastInput: number;
  lastSeq: number;
  disconnectedAt: number;
  away: boolean;
};
export type Room = {
  code: string;
  game: GameState;
  seats: Map<string, Seat>;
  host: string;
  emptyAt: number | null;
  lastBatch: number;
  createdAt: number;
};
export function parseInput(
  value: unknown,
): { seq: number; input: Input } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["op", "seq", "x", "z", "attack", "dodge", "ability"].includes(k),
    )
  )
    return null;
  if (
    !Number.isSafeInteger(v.seq) ||
    (v.seq as number) < 0 ||
    typeof v.x !== "number" ||
    !Number.isFinite(v.x) ||
    Math.abs(v.x) > 1 ||
    typeof v.z !== "number" ||
    !Number.isFinite(v.z) ||
    Math.abs(v.z) > 1
  )
    return null;
  if (["attack", "dodge", "ability"].some((k) => typeof v[k] !== "boolean"))
    return null;
  return {
    seq: v.seq as number,
    input: {
      x: v.x,
      z: v.z,
      attack: v.attack as boolean,
      dodge: v.dodge as boolean,
      ability: v.ability as boolean,
    },
  };
}
const send = (ws: WebSocket | null, data: unknown) => {
  if (ws?.readyState === WebSocket.OPEN) {
    if (ws.bufferedAmount > 131072) {
      ws.close(1013, "Slow connection");
      return;
    }
    ws.send(JSON.stringify(data));
  }
};
export class RoomService {
  readonly rooms = new Map<string, Room>();
  readonly poller: WheelPoller;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private livePolling = false;
  constructor(
    private now = Date.now,
    fetcher?: typeof fetch,
  ) {
    this.poller = new WheelPoller((batch) => this.applyWheel(batch), fetcher);
  }
  start() {
    if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 50);
  }
  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.poller.stop();
    for (const r of this.rooms.values())
      for (const s of r.seats.values())
        s.socket?.close(1001, "Server restarting");
    this.rooms.clear();
  }
  applyWheel(batch: WheelBatch) {
    for (const r of this.rooms.values()) {
      if (r.game.mode !== "live" || r.lastBatch >= batch.sequence) continue;
      const needsBaseline = r.lastBatch === 0;
      r.lastBatch = batch.sequence;
      const total = r.game.telemetry.bonus;
      r.game.telemetry = { ...batch.view, bonus: total };
      const present = [...r.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN,
      );
      if (!needsBaseline && present) addWheelBonus(r.game, batch.energy);
    }
  }
  join(
    ws: WebSocket,
    v: Record<string, unknown>,
  ): { room: Room; seat: Seat } | null {
    const error = (message: string) => {
      send(ws, { op: "error", message });
      return null;
    };
    if (!["fighter", "guardian", "medic"].includes(String(v.role)))
      return error("Choose Fighter, Guardian or Medic.");
    if (v.mode !== "live" && v.mode !== "practice")
      return error("Choose live or practice energy.");
    if (
      v.code !== undefined &&
      (typeof v.code !== "string" || !/^([A-HJ-NP-Z2-9]{5})?$/.test(v.code))
    )
      return error("Use the five-character room code.");
    if (
      v.token !== undefined &&
      (typeof v.token !== "string" || !/^[a-f0-9]{48}$/.test(v.token))
    )
      return error("Reconnect session expired. Join again.");
    let room = v.code ? this.rooms.get(v.code as string) : undefined;
    if (v.code && !room)
      return error("That room has closed. Create another room.");
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS)
        return error("The burrow server is full. Try practice.");
      let code = "";
      do {
        code = Array.from(
          randomBytes(5),
          (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
        ).join("");
      } while (this.rooms.has(code));
      const game = createGame(v.mode as Mode, v.role as Role);
      game.actors = game.actors.map((a, i) =>
        makeActor(`bot-initial-${i}`, a.role, i, true),
      );
      room = {
        code,
        game,
        seats: new Map(),
        host: "",
        emptyAt: null,
        lastBatch: 0,
        createdAt: this.now(),
      };
      this.rooms.set(code, room);
    }
    if (room.game.mode !== v.mode)
      return error(
        "This room uses a different energy mode. Match the host’s mode.",
      );
    const returning = v.token
      ? [...room.seats.values()].find((s) => s.token === v.token)
      : undefined;
    if (v.token && !returning)
      return error("Reconnect session expired. Join again.");
    if (returning) {
      const wasEmpty = ![...room.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN,
      );
      const previous = returning.socket;
      returning.socket = ws;
      if (previous && previous !== ws)
        previous.close(1000, "Session reconnected");
      returning.input = { ...EMPTY_INPUT };
      returning.pending = { attack: false, dodge: false, ability: false };
      returning.lastInput = this.now();
      returning.disconnectedAt = 0;
      returning.away = false;
      const a = room.game.actors.find((a) => a.id === returning.id)!;
      a.connected = true;
      room.emptyAt = null;
      if (wasEmpty) room.lastBatch = 0;
      send(ws, {
        op: "joined",
        code: room.code,
        id: returning.id,
        token: returning.token,
        host: room.host,
        state: room.game,
      });
      if (room.game.mode === "live") {
        this.livePolling = true;
        this.poller.start();
      }
      return { room, seat: returning };
    }
    if (room.seats.size >= ROOM_CAP)
      return error("This room has three adventurers. Create another room.");
    if (room.game.status !== "lobby")
      return error(
        "This fight has started. Ask the host to replay, or create a room.",
      );
    const id = randomBytes(8).toString("hex"),
      seat: Seat = {
        id,
        token: randomBytes(24).toString("hex"),
        socket: ws,
        input: { ...EMPTY_INPUT },
        pending: { attack: false, dodge: false, ability: false },
        lastInput: this.now(),
        lastSeq: -1,
        disconnectedAt: 0,
        away: false,
      };
    const matching = room.game.actors.findIndex(
      (a) => a.bot && a.role === v.role,
    );
    const index =
      matching >= 0 ? matching : room.game.actors.findIndex((a) => a.bot);
    const actor = makeActor(id, v.role as Role, index);
    actor.name = `Paw ${index + 1}`;
    room.game.actors[index] = actor;
    room.seats.set(id, seat);
    if (!room.host) room.host = id;
    room.emptyAt = null;
    send(ws, {
      op: "joined",
      code: room.code,
      id,
      token: seat.token,
      host: room.host,
      state: room.game,
    });
    if (room.game.mode === "live") {
      this.livePolling = true;
      this.poller.start();
    }
    return { room, seat };
  }
  input(room: Room, seat: Seat, v: unknown) {
    const parsed = parseInput(v);
    if (!parsed || parsed.seq <= seat.lastSeq) return;
    seat.input = parsed.input;
    for (const key of ["attack", "dodge", "ability"] as const)
      seat.pending[key] ||= parsed.input[key];
    seat.lastSeq = parsed.seq;
    seat.lastInput = this.now();
  }
  action(room: Room, seat: Seat, op: string) {
    if (op === "away") {
      seat.away = true;
      seat.input = { ...EMPTY_INPUT };
      seat.pending = { attack: false, dodge: false, ability: false };
      seat.lastInput = 0;
      const a = room.game.actors.find((a) => a.id === seat.id);
      if (a) a.connected = false;
      return;
    }
    if (op === "back") {
      seat.away = false;
      const a = room.game.actors.find((a) => a.id === seat.id);
      if (a) a.connected = true;
      return;
    }
    if (seat.id !== room.host) return;
    if (op === "start") startGame(room.game);
    if (
      op === "replay" &&
      (room.game.status === "victory" || room.game.status === "defeat")
    ) {
      const old = room.game;
      room.game = createGame(old.mode, old.actors[0].role);
      room.game.actors = old.actors.map((a, i) => {
        const fresh = makeActor(a.id, a.role, i, a.bot);
        fresh.connected = a.connected;
        fresh.name = a.name;
        return fresh;
      });
      for (const s of room.seats.values()) {
        s.input = { ...EMPTY_INPUT };
        s.pending = { attack: false, dodge: false, ability: false };
      }
    }
  }
  disconnect(room: Room, seat: Seat, ws: WebSocket) {
    if (seat.socket !== ws) return;
    seat.socket = null;
    seat.input = { ...EMPTY_INPUT };
    seat.pending = { attack: false, dodge: false, ability: false };
    seat.disconnectedAt = this.now();
    const a = room.game.actors.find((a) => a.id === seat.id);
    if (a) a.connected = false;
  }
  tick() {
    const now = this.now();
    let liveRooms = 0;
    for (const [code, r] of this.rooms) {
      for (const [id, s] of r.seats) {
        if (!s.socket && now - s.disconnectedAt > RECONNECT_MS) {
          r.seats.delete(id);
          const idx = r.game.actors.findIndex((a) => a.id === id);
          if (idx >= 0)
            r.game.actors[idx] = makeActor(
              `bot-${id}`,
              r.game.actors[idx].role,
              idx,
              true,
            );
        }
      }
      if (!r.seats.has(r.host)) {
        const next = [...r.seats.values()].find((s) => s.socket);
        if (next) r.host = next.id;
      }
      const present = [...r.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN,
      );
      if (!present) {
        r.emptyAt ??= now;
        if (now - r.emptyAt > EMPTY_ROOM_MS) {
          this.rooms.delete(code);
          continue;
        }
      } else r.emptyAt = null;
      if (now - r.createdAt > 2 * 60 * 60 * 1000) {
        for (const s of r.seats.values())
          s.socket?.close(1001, "Room lifetime reached");
        this.rooms.delete(code);
        continue;
      }
      if (r.game.mode === "live" && present) liveRooms++;
      if (present) {
        const inputs: Record<string, Input> = {};
        for (const s of r.seats.values()) {
          const actor = r.game.actors.find((a) => a.id === s.id);
          if (actor)
            actor.connected = !!s.socket && !s.away && now - s.lastInput < 2000;
          inputs[s.id] =
            now - s.lastInput < 300
              ? {
                  ...s.input,
                  attack: s.input.attack || s.pending.attack,
                  dodge: s.input.dodge || s.pending.dodge,
                  ability: s.input.ability || s.pending.ability,
                }
              : EMPTY_INPUT;
          s.pending = { attack: false, dodge: false, ability: false };
        }
        step(r.game, inputs, FIXED_DT);
      }
      if (r.game.tick % 2 === 0 || r.game.status !== "playing")
        for (const s of r.seats.values())
          send(s.socket, { op: "state", state: r.game, host: r.host });
    }
    if (!liveRooms && this.livePolling) {
      this.livePolling = false;
      this.poller.stop();
    }
  }
}
