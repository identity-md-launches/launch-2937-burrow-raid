import { describe, it, expect, vi } from "vitest";
import { WheelTracker, WheelPoller, retryAfterMs } from "../server/telemetry";
import { NOW, snapshot, nextSnapshot } from "./fixtures";
describe("real wheel work accounting", () => {
  it("baselines first, then uses BigInt positive deltas exactly once", () => {
    const t = new WheelTracker();
    expect(t.consume(snapshot("90071992547409930"), NOW).energy).toBe(0);
    const s = nextSnapshot("90071992547409946", 3);
    expect(t.consume(s, NOW + 3000).energy).toBe(4);
    expect(t.consume(s, NOW + 3000).energy).toBe(0);
  });
  it("caps huge jumps before converting to Number and bounds bursts", () => {
    const t = new WheelTracker();
    t.consume(snapshot("1"), NOW);
    expect(
      t.consume(nextSnapshot("18446744073709551615", 1), NOW + 1000).energy,
    ).toBe(5);
  });
  it("carries fractional work without duplicating it", () => {
    const t = new WheelTracker();
    t.consume(snapshot("100"), NOW);
    expect(t.consume(nextSnapshot("102", 1), NOW + 1000).energy).toBe(0);
    expect(t.consume(nextSnapshot("104", 2), NOW + 2000).energy).toBe(1);
  });
  it("resets on epoch change, installation change and counter regression", () => {
    for (const kind of ["epoch", "installation", "regression"]) {
      const t = new WheelTracker();
      t.consume(snapshot(), NOW);
      const s = nextSnapshot(
        kind === "regression" ? "2" : "200",
        3,
        kind === "epoch"
          ? { counterEpoch: "c36a021a-a825-45db-9338-c519ed00a422" }
          : {},
      );
      if (kind === "installation") s.installationId = "new-installation";
      expect(t.consume(s, NOW + 3000).energy).toBe(0);
    }
  });
  it("rejects reused timestamps with changed counters and out-of-order bonus", () => {
    const t = new WheelTracker();
    t.consume(snapshot(), NOW);
    expect(t.consume(snapshot("200"), NOW).view.state).toBe("unavailable");
    t.consume(nextSnapshot("300", 5), NOW + 5000);
    expect(t.consume(nextSnapshot("400", 3), NOW + 5000).energy).toBe(0);
  });
  it("rejects unsupported schemas, bad UUIDs, invalid counters and missing required fields", () => {
    const malformed = [
      { ...snapshot(), schemaVersion: 2 },
      snapshot("-1"),
      snapshot("1.5"),
      snapshot("18446744073709551616"),
      snapshot("1", { counterEpoch: "invalid" }),
      { schemaVersion: 1 },
    ];
    for (const s of malformed)
      expect(new WheelTracker().consume(s, NOW).view.state).toBe("unavailable");
  });
  it("does not award previously counted work after an out-of-order or regressed reading", () => {
    for (const reset of [nextSnapshot("120", 2), nextSnapshot("120", 4)]) {
      const t = new WheelTracker();
      t.consume(snapshot("100"), NOW);
      expect(t.consume(nextSnapshot("140", 3), NOW + 3000).energy).toBe(5);
      expect(t.consume(reset, NOW + 4000).energy).toBe(0);
      expect(t.consume(nextSnapshot("144", 5), NOW + 5000).energy).toBe(0);
      expect(t.consume(nextSnapshot("148", 6), NOW + 6000).energy).toBe(1);
    }
  });
  it("allows additive v1 fields but rejects simulated/replayed/derived measurements", () => {
    expect(
      new WheelTracker().consume({ ...snapshot(), newField: true }, NOW).view
        .state,
    ).toBe("baseline");
    for (const provenance of ["simulated", "replay", "derived"])
      expect(
        new WheelTracker().consume(snapshot("100", { provenance }), NOW).energy,
      ).toBe(0);
  });
  it("rejects stale, future, faulted and unavailable readings, then baselines recovery", () => {
    const t = new WheelTracker();
    t.consume(snapshot(), NOW);
    expect(
      t.consume(nextSnapshot("400", 1, { freshness: "stale" }), NOW + 1000).view
        .state,
    ).toBe("stale");
    expect(t.consume(nextSnapshot("500", 2), NOW + 2000).energy).toBe(0);
    expect(t.consume(snapshot(), NOW + 121000).view.state).toBe("stale");
    expect(t.consume(nextSnapshot("600", 10), NOW).view.state).toBe("stale");
    expect(
      t.consume(snapshot("700", { coreStatus: "COUNTER_FAULT" }), NOW).view
        .state,
    ).toBe("unavailable");
    expect(
      t.consume({ ...snapshot(), measurement: null }, NOW).view.state,
    ).toBe("unavailable");
  });
  it("does not award sleeping work and resumes without a catch-up bonus", () => {
    const t = new WheelTracker();
    t.consume(snapshot(), NOW);
    const idle = t.consume(
      nextSnapshot("400", 3, { coreStatus: "IDLE", rpmMilli: 0 }),
      NOW + 3000,
    );
    expect(idle.energy).toBe(0);
    expect(idle.view.state).toBe("resting");
    expect(t.consume(nextSnapshot("404", 6), NOW + 6000).energy).toBe(1);
  });
  it("baselines after an HTTP reconnect or reset", () => {
    const t = new WheelTracker();
    t.consume(snapshot(), NOW);
    t.reset();
    expect(t.consume(nextSnapshot("900", 3), NOW + 3000).energy).toBe(0);
  });
  it("parses numeric and HTTP-date Retry-After without shortening the wait", () => {
    expect(retryAfterMs("90", NOW)).toBe(90000);
    expect(retryAfterMs(new Date(NOW + 60000).toUTCString(), NOW)).toBe(60000);
    expect(retryAfterMs("invalid", NOW)).toBe(0);
  });
  it("honors Retry-After and exponential backoff, without overlapping polls", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
      );
    const publish = vi.fn(),
      p = new WheelPoller(publish, fetcher);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(89999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    p.stop();
    vi.useRealTimers();
  });
  it("revalidates cached 304 timestamps instead of awarding cached work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot()), { headers: { etag: '"v1"' } }),
      )
      .mockResolvedValue(new Response(null, { status: 304 }));
    const batches: unknown[] = [];
    const p = new WheelPoller((b) => batches.push(b), fetcher);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher.mock.calls[1][1].headers).toEqual({
      "If-None-Match": '"v1"',
    });
    expect(p.tracker.view.state).toBe("baseline");
    await vi.advanceTimersByTimeAsync(120000);
    expect(p.tracker.view.state).toBe("stale");
    p.stop();
    vi.useRealTimers();
  });
  it("discards an old in-flight request after a stop/restart without spawning another poll loop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let resolveOld: (response: Response) => void = () => {};
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            resolveOld = r;
          }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify(snapshot()), { status: 200 }),
      );
    const publish = vi.fn(),
      p = new WheelPoller(publish, fetcher);
    p.start();
    p.stop();
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    const calls = publish.mock.calls.length;
    resolveOld(new Response(JSON.stringify(snapshot("200"))));
    await vi.advanceTimersByTimeAsync(0);
    expect(publish.mock.calls.length).toBe(calls);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    p.stop();
    vi.useRealTimers();
  });
});
