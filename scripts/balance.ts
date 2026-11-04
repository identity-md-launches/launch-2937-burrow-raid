import { writeFile, mkdir } from "node:fs/promises";
import {
  createGame,
  startGame,
  step,
  botInput,
  EMPTY_INPUT,
  ROLES,
  type Mode,
  type Role,
} from "../shared/game";
const results = [];
for (const mode of ["practice", "live"] as Mode[])
  for (const role of Object.keys(ROLES) as Role[])
    for (const strategy of ["active", "idle"] as const) {
      const g = createGame(mode, role);
      startGame(g);
      for (let i = 0; i < 3700 && g.status === "playing"; i++) {
        const input =
          strategy === "active" ? botInput(g, g.actors[0], 0) : EMPTY_INPUT;
        if (strategy === "active") input.ability = g.energy >= ROLES[role].cost;
        step(g, { local: input });
      }
      results.push({
        mode,
        role,
        strategy,
        outcome: g.status,
        seconds: Number(g.t.toFixed(2)),
        bossHealth: g.bossHp,
        partyHealth: g.actors.map((a) => Math.ceil(a.hp)),
        remainingEnergy: Math.floor(g.energy),
      });
    }
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/balance.json",
  JSON.stringify(
    {
      method:
        "Deterministic fixed-step simulation; active pilot uses avoidance AI and available skills. Live runs receive zero wheel bonus. Idle pilot sends no input; two bot companions remain active. This is a balance regression, not a human playtest.",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.strategy === "active" && r.outcome !== "victory"))
  process.exitCode = 1;
