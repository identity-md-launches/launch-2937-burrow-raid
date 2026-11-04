import type { GameState, Input, Mode, Role } from "../shared/game";
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";
export type RoomInfo = { code: string; id: string; host: string };
export function roomEndpoint(raw: string) {
  const u = new URL(raw, location.href);
  if (u.protocol === "https:") u.protocol = "wss:";
  if (u.protocol === "http:") u.protocol = "ws:";
  if (
    !["wss:", "ws:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error(
      "Use a room server URL without credentials or query parameters.",
    );
  if (
    u.protocol === "ws:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    throw new Error("Use a secure wss:// room server.");
  if (u.pathname === "/" || !u.pathname) u.pathname = "/rooms";
  return u.href;
}
export class RoomConnection {
  private ws: WebSocket | null = null;
  private token = "";
  private code = "";
  private seq = 0;
  private closed = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  info: RoomInfo | null = null;
  constructor(
    private url: string,
    private role: Role,
    private mode: Mode,
    code: string,
    private onState: (s: GameState, info: RoomInfo) => void,
    private onStatus: (s: ConnectionStatus) => void,
    private onError: (message: string) => void,
  ) {
    this.code = code;
    this.connect();
  }
  private connect() {
    if (this.closed) return;
    this.onStatus(this.token ? "reconnecting" : "connecting");
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.onError("Unable to open that room server. Check the URL.");
      this.onStatus("closed");
      return;
    }
    const ws = this.ws;
    let welcomed = false;
    this.connectTimer = setTimeout(() => {
      if (!welcomed) ws.close();
    }, 6000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          op: "join",
          role: this.role,
          mode: this.mode,
          code: this.code,
          ...(this.token ? { token: this.token } : {}),
        }),
      );
    };
    ws.onmessage = (event) => {
      let v;
      try {
        v = JSON.parse(event.data);
      } catch {
        return;
      }
      if (v.op === "error") {
        this.closed = true;
        this.onError(
          typeof v.message === "string"
            ? v.message
            : "Unable to join that room.",
        );
        this.onStatus("closed");
        ws.close();
        return;
      }
      if (v.op === "joined") {
        welcomed = true;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.token = v.token;
        this.code = v.code;
        this.info = { id: v.id, code: v.code, host: v.host };
        this.attempts = 0;
        this.onStatus("connected");
        this.onState(v.state, this.info);
      }
      if (v.op === "state" && this.info) {
        this.info.host = v.host;
        this.onState(v.state, this.info);
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      if (this.closed) return;
      if (!this.token || this.attempts >= 6) {
        this.onStatus("closed");
        this.onError(
          this.token
            ? "Room connection lost. Rejoin or return to practice."
            : "Room server unavailable. Check the URL or play practice.",
        );
        return;
      }
      this.onStatus("reconnecting");
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(500 * 2 ** this.attempts++, 6000),
      );
    };
  }
  input(input: Input) {
    if (this.ws?.readyState === WebSocket.OPEN && this.info)
      this.ws.send(JSON.stringify({ op: "input", seq: ++this.seq, ...input }));
  }
  action(op: "start" | "replay" | "away" | "back") {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ op }));
  }
  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.ws?.close();
  }
}
