import { mkdir, writeFile } from "node:fs/promises";
import { WheelPoller, type WheelBatch } from "../server/telemetry";
const samples: WheelBatch[] = [];
let closing = false;
let finish: () => void = () => {};
const done = new Promise<void>((r) => {
  finish = r;
});
const poller = new WheelPoller((batch) => {
  if (closing) return;
  samples.push(batch);
  if (samples.length >= 3) finish();
});
const timeout = setTimeout(finish, 12000);
poller.start();
await done;
closing = true;
poller.stop();
clearTimeout(timeout);
await mkdir("artifacts", { recursive: true });
const result = {
  checkedAt: new Date().toISOString(),
  source: "https://api.squeekchain.com/v1/status",
  method:
    "Actual production WheelPoller; at most three observations in a 12-second bounded check. First reading is a baseline. Teardown reset omitted. No game room or client reward is created.",
  samples,
};
await writeFile(
  "artifacts/telemetry-live-check.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
