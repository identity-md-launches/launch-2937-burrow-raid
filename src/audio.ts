// Original procedural sounds. Audio starts only after the sound control is used.
export class RaidAudio {
  private ctx: AudioContext | null = null;
  enabled = false;
  set(value: boolean) {
    this.enabled = value;
    if (value) {
      try {
        this.ctx ??= new AudioContext();
        void this.ctx.resume();
        this.play("start");
      } catch {
        this.enabled = false;
      }
    } else void this.ctx?.suspend();
  }
  play(kind: "hit" | "damage" | "heal" | "warning" | "victory" | "start") {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx,
      now = ctx.currentTime,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    const frequencies = {
      hit: 210,
      damage: 100,
      heal: 660,
      warning: 330,
      victory: 880,
      start: 440,
    };
    osc.type = kind === "damage" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(frequencies[kind], now);
    osc.frequency.exponentialRampToValueAtTime(
      frequencies[kind] * (kind === "damage" ? 0.5 : 1.4),
      now + 0.12,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
  dispose() {
    void this.ctx?.close();
  }
}
