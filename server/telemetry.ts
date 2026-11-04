import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import statusSchema from "./schemas/status.json";
import type { TelemetryView } from "../shared/game";

// Additive fields are allowed by the API's v1 compatibility policy. Required
// fields, unions, bounds and formats still come from the published full schema.
function allowExtensions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(allowExtensions);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "additionalProperties" ? true : allowExtensions(v),
      ]),
    );
  return value;
}
const ajv = new Ajv2020({ strict: false, allErrors: false });
addFormats(ajv);
for (const bits of [64, 96])
  ajv.addFormat(`uint${bits}-decimal`, {
    type: "string",
    validate: (s: string) =>
      /^(0|[1-9][0-9]*)$/.test(s) &&
      s.length <= 30 &&
      BigInt(s) < 1n << BigInt(bits),
  });
const validate = ajv.compile(allowExtensions(statusSchema) as object);
type Snapshot = {
  schemaVersion: 1;
  installationId: string;
  generatedAt: string;
  measurement: null | {
    freshness: string;
    observedAt: string;
    receivedAt: string;
    staleAfterSeconds: number;
    counterEpoch: string;
    cumulativeWorkUnits: string;
    provenance: string;
    coreStatus: string;
    rpmMilli: number;
  };
};
type Baseline = {
  installation: string;
  epoch: string;
  work: bigint;
  observed: number;
};
export type WheelBatch = {
  sequence: number;
  energy: number;
  view: TelemetryView;
};
export class WheelTracker {
  private baseline: Baseline | null = null;
  private remainder = 0n;
  private sequence = 0;
  private tokens = 10;
  private lastTokenAt = 0;
  view: TelemetryView = {
    state: "connecting",
    text: "Connecting to wheel telemetry",
    observedAt: null,
    bonus: 0,
  };
  reset(
    state: "unavailable" | "stale" = "unavailable",
    text = "Wheel unavailable · base recharge continues",
  ): WheelBatch {
    this.baseline = null;
    this.remainder = 0n;
    this.view = { state, text, observedAt: null, bonus: 0 };
    return { sequence: ++this.sequence, energy: 0, view: { ...this.view } };
  }
  consume(data: unknown, now = Date.now()): WheelBatch {
    const fail = (state: "unavailable" | "stale", text: string) =>
      this.reset(state, text);
    if (!validate(data))
      return fail(
        "unavailable",
        "Wheel schema unavailable · base recharge continues",
      );
    const s = data as Snapshot,
      m = s.measurement;
    if (!m)
      return fail("unavailable", "No wheel reading · base recharge continues");
    if (m.provenance !== "hardware")
      return fail("unavailable", "Non-hardware reading · no live bonus");
    if (m.coreStatus === "COUNTER_FAULT")
      return fail(
        "unavailable",
        "Wheel counter unavailable · base recharge continues",
      );
    const observed = Date.parse(m.observedAt),
      received = Date.parse(m.receivedAt),
      generated = Date.parse(s.generatedAt);
    if (
      m.freshness !== "online" ||
      [observed, received, generated].some(
        (t) => !Number.isFinite(t) || now - t > 120000 || t - now > 5000,
      ) ||
      observed > received + 5000 ||
      received > generated + 5000
    )
      return fail("stale", "Wheel reading stale · bonus paused");
    const work = BigInt(m.cumulativeWorkUnits),
      prev = this.baseline;
    const next = {
      installation: s.installationId,
      epoch: m.counterEpoch,
      work,
      observed,
    };
    let energy = 0;
    let state: TelemetryView["state"] = "baseline",
      text = "Wheel connected · setting a fresh baseline";
    if (
      !prev ||
      prev.installation !== next.installation ||
      prev.epoch !== next.epoch
    ) {
      this.remainder = 0n;
      this.baseline = next;
    } else if (work < prev.work || observed < prev.observed) {
      // Do not install a lower/replayed value as the next delta's baseline:
      // that would count previously awarded work again when the head returns.
      return fail(
        "unavailable",
        "Wheel counter moved backward · setting a fresh baseline",
      );
    } else if (observed === prev.observed) {
      // A changing counter with the same observation time cannot establish new work.
      if (work !== prev.work)
        return fail("unavailable", "Wheel observation mismatch · bonus paused");
      state =
        m.coreStatus === "IDLE" || m.rpmMilli === 0 ? "resting" : "baseline";
      text =
        state === "resting"
          ? "Hamster resting · base recharge continues"
          : "Wheel connected · awaiting new work";
    } else {
      const delta = work - prev.work;
      this.baseline = next;
      if (m.coreStatus === "IDLE" || m.rpmMilli === 0) {
        this.remainder = 0n;
        state = "resting";
        text = "Hamster resting · base recharge continues";
      } else if (delta > 0n) {
        // Bound the BigInt before converting. Excess work is discarded, never banked.
        const capped = delta > 40n ? 40n : delta;
        const units = capped + this.remainder;
        const desired = Math.min(5, Number(units / 4n));
        this.remainder = units % 4n;
        this.tokens = Math.min(
          10,
          this.tokens + Math.max(0, now - this.lastTokenAt) / 1000,
        );
        energy = Math.min(desired, Math.floor(this.tokens));
        this.tokens -= energy;
        this.lastTokenAt = now;
        state = "active";
        text = "Fresh wheel work · shared bonus available";
      } else {
        state = "baseline";
        text = "Wheel connected · awaiting new work";
      }
    }
    this.view = { state, text, observedAt: m.observedAt, bonus: 0 };
    return { sequence: ++this.sequence, energy, view: { ...this.view } };
  }
}
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  if (/^\d+(?:\.\d+)?$/.test(header)) return Math.max(0, Number(header) * 1000);
  const time = Date.parse(header);
  return Number.isFinite(time) ? Math.max(0, time - now) : 0;
}
export class WheelPoller {
  readonly tracker = new WheelTracker();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private failures = 0;
  private etag: string | null = null;
  private cached: unknown;
  private stopped = true;
  private generation = 0;
  constructor(
    private publish: (batch: WheelBatch) => void,
    private fetcher: typeof fetch = fetch,
  ) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.poll(++this.generation);
  }
  stop() {
    this.stopped = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.abort?.abort();
    this.etag = null;
    this.cached = undefined;
    this.publish(this.tracker.reset());
  }
  async poll(generation = this.generation): Promise<void> {
    if (this.stopped || generation !== this.generation) return;
    let delay = 3000;
    const controller = new AbortController();
    this.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetcher(
        "https://api.squeekchain.com/v1/status",
        {
          headers: this.etag ? { "If-None-Match": this.etag } : {},
          signal: controller.signal,
        },
      );
      if (this.stopped || generation !== this.generation) return;
      if (response.status !== 304 && !response.ok) {
        delay = Math.max(
          retryAfterMs(response.headers.get("retry-after")),
          Math.min(120000, 3000 * 2 ** Math.min(++this.failures, 6)),
        );
        this.etag = null;
        this.cached = undefined;
        this.publish(this.tracker.reset());
      } else {
        if (response.status !== 304) {
          const body = await response.text();
          if (this.stopped || generation !== this.generation) return;
          if (body.length > 262144) throw new Error("Oversized wheel response");
          this.cached = JSON.parse(body);
          this.etag = response.headers.get("etag");
        }
        const batch = this.tracker.consume(this.cached);
        this.publish(batch);
        if (
          batch.view.state === "unavailable" ||
          batch.view.state === "stale"
        ) {
          this.etag = null;
          this.failures++;
          delay = Math.min(120000, 3000 * 2 ** Math.min(this.failures, 5));
        } else this.failures = 0;
      }
    } catch {
      if (this.stopped || generation !== this.generation) return;
      this.etag = null;
      this.cached = undefined;
      this.publish(this.tracker.reset());
      delay = Math.min(120000, 3000 * 2 ** Math.min(++this.failures, 5));
    } finally {
      clearTimeout(timeout);
      if (!this.stopped && generation === this.generation)
        this.timer = setTimeout(() => void this.poll(generation), delay);
    }
  }
}
