// server/index.ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { WebSocketServer } from "ws";

// server/rooms.ts
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";

// shared/game.ts
var EMPTY_INPUT = {
  x: 0,
  z: 0,
  attack: false,
  dodge: false,
  ability: false
};
var ROLES = {
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
    color: "#e7ad68"
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
    color: "#a1bdad"
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
    color: "#d6a6bb"
  }
};
var ARENA_RADIUS = 8;
var BOSS = { x: 0, z: -0.7 };
var RUN_SECONDS = 180;
var FIXED_DT = 0.05;
var distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function makeActor(id, role, index, bot = false) {
  const pos = [
    { x: -2.6, z: 3.2 },
    { x: 2.6, z: 2.4 },
    { x: -0.4, z: 5.2 }
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
    dodging: 0
  };
}
function createGame(mode = "practice", role = "fighter") {
  const others = Object.keys(ROLES).filter((r) => r !== role);
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
      ...others.map((r, i) => makeActor(`bot-${i}`, r, i + 1, true))
    ],
    attack: null,
    nextAttack: 3.5,
    attackCount: 0,
    effects: [],
    effectId: 0,
    telemetry: mode === "practice" ? {
      state: "practice",
      text: "Simulated energy",
      observedAt: null,
      bonus: 0
    } : {
      state: "connecting",
      text: "Connecting to wheel telemetry",
      observedAt: null,
      bonus: 0
    },
    message: "Defend the burrow."
  };
}
function effect(g, kind, a) {
  g.effects.push({ id: ++g.effectId, kind, x: a.x, z: a.z, born: g.t });
}
function isDanger(a, attack) {
  if (attack.kind === "slam") return distance(a, attack) < 2.35;
  const d = distance(a, BOSS);
  if (attack.kind === "ring") return d > 3.4 && d < 6.1;
  const dx = a.x - BOSS.x, dz = a.z - BOSS.z;
  const along = dx * Math.sin(attack.angle) + dz * Math.cos(attack.angle);
  const across = dx * Math.cos(attack.angle) - dz * Math.sin(attack.angle);
  return Math.abs(across) < 1.8 && Math.abs(along) < 8;
}
function botInput(g, a, index) {
  const angle = -0.9 + index * 2.1;
  const radius = a.role === "medic" ? 5 : 3.1;
  let target = {
    x: BOSS.x + Math.sin(angle) * radius,
    z: BOSS.z + Math.cos(angle) * radius
  };
  const at = g.attack;
  if (at && !at.resolved && isDanger(a, at)) {
    if (at.kind === "ring")
      target = { x: a.x * 0.25, z: BOSS.z + (a.z - BOSS.z) * 0.25 };
    else if (at.kind === "slam") {
      const dx2 = a.x - at.x || 0.5, dz2 = a.z - at.z || 0.5, len2 = Math.hypot(dx2, dz2);
      target = { x: a.x + dx2 / len2 * 3, z: a.z + dz2 / len2 * 3 };
    } else
      target = {
        x: a.x + Math.cos(at.angle) * 4,
        z: a.z - Math.sin(at.angle) * 4
      };
  }
  const dx = target.x - a.x, dz = target.z - a.z, len = Math.hypot(dx, dz);
  return {
    x: len > 0.25 ? dx / len : 0,
    z: len > 0.25 ? dz / len : 0,
    attack: true,
    dodge: !!at && !at.resolved && at.end - g.t < 0.3 && isDanger(a, at),
    ability: g.energy > 65 && (a.role !== "medic" || g.actors.some((p) => p.hp < p.maxHp * 0.65))
  };
}
function startGame(g) {
  if (g.status === "lobby") {
    g.status = "playing";
    g.message = "Stay out of the amber warning zones.";
  }
}
function addWheelBonus(g, energy) {
  if (g.mode !== "live" || g.status !== "playing") return;
  const amount = Math.max(0, Math.min(5, energy));
  g.energy = Math.min(100, g.energy + amount);
  g.telemetry.bonus += amount;
}
function step(g, inputs, dt = FIXED_DT) {
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
      "dodging"
    ])
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
      let nx = a.x - BOSS.x, nz = a.z - BOSS.z;
      if (db < 1e-3) {
        nx = 0;
        nz = 1;
      }
      a.x = BOSS.x + nx / (db || 1) * 2;
      a.z = BOSS.z + nz / (db || 1) * 2;
    }
    a.facing = raw.attack ? Math.atan2(BOSS.x - a.x, BOSS.z - a.z) : length > 0.05 ? Math.atan2(dx, dz) : a.facing;
    const role = ROLES[a.role];
    if (raw.attack && a.attackCd === 0 && distance(a, BOSS) <= role.range) {
      a.attackCd = role.cooldown;
      a.swing = 0.23;
      g.bossHp = Math.max(
        0,
        g.bossHp - (botControlled ? Math.round(role.damage * 0.35) : role.damage)
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
    const target = alive[g.attackCount % Math.max(1, alive.length)] || g.actors[0];
    const kind = ["slam", "sweep", "ring"][g.attackCount % 3];
    g.attack = {
      id: ++g.attackCount,
      kind,
      x: target.x,
      z: target.z,
      angle: Math.atan2(target.x - BOSS.x, target.z - BOSS.z),
      start: g.t,
      end: g.t + (g.bossHp < g.bossMaxHp / 2 ? 1.35 : 1.65),
      resolved: false
    };
    g.nextAttack = g.t + (g.bossHp < g.bossMaxHp / 2 ? 4 : 5);
    g.message = kind === "slam" ? "Cable slam! Leave the marked circle." : kind === "ring" ? "Static ring! Move close or move far." : "Cable sweep! Step sideways out of the stripe.";
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
    g.message = g.t >= RUN_SECONDS ? "The Cable Gnawer overran the burrow." : "Even little legends need another try.";
  }
}

// server/telemetry.ts
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// server/schemas/status.json
var status_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "installationId",
    "revision",
    "generatedAt",
    "measurement",
    "builder",
    "oracle",
    "settlementQueue",
    "modules"
  ],
  properties: {
    schemaVersion: {
      const: 1
    },
    installationId: {
      type: "string",
      minLength: 1,
      maxLength: 128
    },
    revision: {
      type: "string",
      minLength: 1,
      maxLength: 256
    },
    generatedAt: {
      $ref: "#/$defs/d0_timestamp"
    },
    measurement: {
      oneOf: [
        {
          $ref: "#/$defs/d1_measurement"
        },
        {
          type: "null"
        }
      ]
    },
    builder: {
      oneOf: [
        {
          $ref: "#/$defs/d3_builderUnavailable"
        },
        {
          $ref: "#/$defs/d4_builderAvailable"
        }
      ]
    },
    oracle: {
      $ref: "#/$defs/d10_oracle"
    },
    settlementQueue: {
      oneOf: [
        {
          $ref: "#/$defs/d12_queueUnavailable"
        },
        {
          $ref: "#/$defs/d13_queueAvailable"
        }
      ]
    },
    signer: {
      oneOf: [
        {
          $ref: "#/$defs/d15_signer"
        },
        {
          type: "null"
        }
      ]
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/d16_publicModuleSnapshot"
      }
    }
  },
  $defs: {
    d0_timestamp: {
      type: "string",
      format: "date-time"
    },
    d2_uint64: {
      type: "string",
      format: "uint64-decimal"
    },
    d1_measurement: {
      type: "object",
      additionalProperties: false,
      required: [
        "freshness",
        "observedAt",
        "receivedAt",
        "staleAfterSeconds",
        "counterEpoch",
        "cumulativeWorkUnits",
        "provenance",
        "coreStatus",
        "rpmMilli",
        "speedMmPerSecond",
        "distanceMm"
      ],
      properties: {
        freshness: {
          enum: [
            "online",
            "stale"
          ]
        },
        observedAt: {
          $ref: "#/$defs/d0_timestamp"
        },
        receivedAt: {
          $ref: "#/$defs/d0_timestamp"
        },
        staleAfterSeconds: {
          const: 120
        },
        counterEpoch: {
          type: "string",
          format: "uuid"
        },
        cumulativeWorkUnits: {
          $ref: "#/$defs/d2_uint64"
        },
        provenance: {
          enum: [
            "hardware",
            "simulated",
            "replay",
            "derived"
          ]
        },
        coreStatus: {
          enum: [
            "IDLE",
            "ACTIVE",
            "COUNTER_FAULT"
          ]
        },
        rpmMilli: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991
        },
        speedMmPerSecond: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991
        },
        distanceMm: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991
        }
      }
    },
    d3_builderUnavailable: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "reason"
      ],
      properties: {
        status: {
          const: "unavailable"
        },
        reason: {
          enum: [
            "no_measurement",
            "counter_fault",
            "counter_epoch_unapproved",
            "round_projection_gap",
            "oracle_head_unavailable",
            "round_ineligible"
          ]
        }
      }
    },
    d5_blockProgress: {
      type: "string",
      format: "uint64-decimal",
      maxLength: 9
    },
    d6_workPerThousandBlocks: {
      type: "string",
      format: "uint64-decimal",
      minLength: 4,
      maxLength: 10
    },
    d7_hash: {
      type: "string",
      pattern: "^0x[0-9a-f]{64}$"
    },
    d8_blockUnits: {
      type: "string",
      format: "uint96-decimal"
    },
    d9_projection: {
      type: "object",
      additionalProperties: false,
      required: [
        "lifecycle",
        "cumulativeWork",
        "blockHeight",
        "blockProgress",
        "workPerThousandBlocks",
        "firstCompletedBlock",
        "lastCompletedBlock",
        "completedBlockCount",
        "cumulativeBlockUnits"
      ],
      properties: {
        lifecycle: {
          const: "optimistic"
        },
        cumulativeWork: {
          $ref: "#/$defs/d2_uint64"
        },
        blockHeight: {
          $ref: "#/$defs/d2_uint64"
        },
        blockProgress: {
          $ref: "#/$defs/d5_blockProgress"
        },
        workPerThousandBlocks: {
          $ref: "#/$defs/d6_workPerThousandBlocks"
        },
        firstCompletedBlock: {
          oneOf: [
            {
              $ref: "#/$defs/d2_uint64"
            },
            {
              type: "null"
            }
          ]
        },
        lastCompletedBlock: {
          oneOf: [
            {
              $ref: "#/$defs/d2_uint64"
            },
            {
              type: "null"
            }
          ]
        },
        completedBlockCount: {
          $ref: "#/$defs/d2_uint64"
        },
        cumulativeBlockUnits: {
          $ref: "#/$defs/d8_blockUnits"
        }
      }
    },
    d4_builderAvailable: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "anchor",
        "queued",
        "projected"
      ],
      properties: {
        status: {
          const: "available"
        },
        anchor: {
          type: "object",
          additionalProperties: false,
          required: [
            "settledThroughRound",
            "cumulativeWork",
            "blockHeight",
            "blockProgress",
            "workPerThousandBlocks",
            "confirmedAt",
            "transactionHash",
            "cumulativeBlockUnits"
          ],
          properties: {
            settledThroughRound: {
              $ref: "#/$defs/d2_uint64"
            },
            cumulativeWork: {
              $ref: "#/$defs/d2_uint64"
            },
            blockHeight: {
              $ref: "#/$defs/d2_uint64"
            },
            blockProgress: {
              $ref: "#/$defs/d5_blockProgress"
            },
            workPerThousandBlocks: {
              $ref: "#/$defs/d6_workPerThousandBlocks"
            },
            confirmedAt: {
              oneOf: [
                {
                  $ref: "#/$defs/d0_timestamp"
                },
                {
                  type: "null"
                }
              ]
            },
            transactionHash: {
              oneOf: [
                {
                  $ref: "#/$defs/d7_hash"
                },
                {
                  type: "null"
                }
              ]
            },
            cumulativeBlockUnits: {
              $ref: "#/$defs/d8_blockUnits"
            }
          }
        },
        queued: {
          type: "object",
          additionalProperties: false,
          required: [
            "closedRoundCount",
            "closedWorkUnits",
            "openRoundWorkUnits"
          ],
          properties: {
            closedRoundCount: {
              $ref: "#/$defs/d2_uint64"
            },
            closedWorkUnits: {
              $ref: "#/$defs/d2_uint64"
            },
            openRoundWorkUnits: {
              $ref: "#/$defs/d2_uint64"
            }
          }
        },
        projected: {
          $ref: "#/$defs/d9_projection"
        }
      }
    },
    d11_latestClosure: {
      type: "object",
      additionalProperties: false,
      required: [
        "firstRound",
        "lastRound",
        "roundCount",
        "acceptedAt"
      ],
      properties: {
        firstRound: {
          $ref: "#/$defs/d2_uint64"
        },
        lastRound: {
          $ref: "#/$defs/d2_uint64"
        },
        roundCount: {
          $ref: "#/$defs/d2_uint64"
        },
        acceptedAt: {
          $ref: "#/$defs/d0_timestamp"
        }
      }
    },
    d10_oracle: {
      type: "object",
      additionalProperties: false,
      required: [
        "state",
        "reason",
        "latestAcceptedAt",
        "latestClosure"
      ],
      properties: {
        state: {
          enum: [
            "accepted",
            "stale",
            "blocked",
            "unavailable"
          ]
        },
        reason: {
          enum: [
            null,
            "no_measurement",
            "counter_fault",
            "counter_epoch_unapproved",
            "round_projection_gap",
            "oracle_head_unavailable"
          ]
        },
        latestAcceptedAt: {
          anyOf: [
            {
              $ref: "#/$defs/d0_timestamp"
            },
            {
              type: "null"
            }
          ]
        },
        latestClosure: {
          anyOf: [
            {
              $ref: "#/$defs/d11_latestClosure"
            },
            {
              type: "null"
            }
          ]
        }
      }
    },
    d12_queueUnavailable: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "reason"
      ],
      properties: {
        status: {
          const: "unavailable"
        },
        reason: {
          enum: [
            "oracle_head_unavailable",
            "round_projection_gap",
            "round_ineligible"
          ]
        }
      }
    },
    d14_submission: {
      type: "object",
      additionalProperties: false,
      required: [
        "submissionId",
        "lifecycle",
        "previousSettledThroughRound",
        "settledThroughRound",
        "roundCount",
        "activeRoundCount",
        "expected",
        "transactionHash",
        "createdAt",
        "submittedAt",
        "confirmedAt",
        "terminalAt",
        "changedAt",
        "outcomeCode"
      ],
      properties: {
        submissionId: {
          type: "string",
          format: "uuid"
        },
        lifecycle: {
          enum: [
            "preparing",
            "submitted",
            "retrying",
            "confirmed",
            "reverted",
            "superseded"
          ]
        },
        previousSettledThroughRound: {
          $ref: "#/$defs/d2_uint64"
        },
        settledThroughRound: {
          allOf: [
            {
              $ref: "#/$defs/d2_uint64"
            },
            {
              not: {
                const: "0"
              }
            }
          ]
        },
        roundCount: {
          allOf: [
            {
              $ref: "#/$defs/d2_uint64"
            },
            {
              not: {
                const: "0"
              }
            }
          ]
        },
        activeRoundCount: {
          $ref: "#/$defs/d2_uint64"
        },
        expected: {
          type: "object",
          additionalProperties: false,
          required: [
            "firstCompletedBlock",
            "lastCompletedBlock",
            "completedBlockCount",
            "cumulativeWork",
            "blockHeight",
            "blockProgress",
            "workPerThousandBlocks",
            "cumulativeBlockUnits"
          ],
          properties: {
            firstCompletedBlock: {
              oneOf: [
                {
                  $ref: "#/$defs/d2_uint64"
                },
                {
                  type: "null"
                }
              ]
            },
            lastCompletedBlock: {
              oneOf: [
                {
                  $ref: "#/$defs/d2_uint64"
                },
                {
                  type: "null"
                }
              ]
            },
            completedBlockCount: {
              $ref: "#/$defs/d2_uint64"
            },
            cumulativeWork: {
              $ref: "#/$defs/d2_uint64"
            },
            blockHeight: {
              $ref: "#/$defs/d2_uint64"
            },
            blockProgress: {
              $ref: "#/$defs/d5_blockProgress"
            },
            workPerThousandBlocks: {
              $ref: "#/$defs/d6_workPerThousandBlocks"
            },
            cumulativeBlockUnits: {
              $ref: "#/$defs/d8_blockUnits"
            }
          }
        },
        transactionHash: {
          oneOf: [
            {
              $ref: "#/$defs/d7_hash"
            },
            {
              type: "null"
            }
          ]
        },
        createdAt: {
          $ref: "#/$defs/d0_timestamp"
        },
        submittedAt: {
          oneOf: [
            {
              $ref: "#/$defs/d0_timestamp"
            },
            {
              type: "null"
            }
          ]
        },
        confirmedAt: {
          oneOf: [
            {
              $ref: "#/$defs/d0_timestamp"
            },
            {
              type: "null"
            }
          ]
        },
        terminalAt: {
          oneOf: [
            {
              $ref: "#/$defs/d0_timestamp"
            },
            {
              type: "null"
            }
          ]
        },
        changedAt: {
          $ref: "#/$defs/d0_timestamp"
        },
        outcomeCode: {
          oneOf: [
            {
              enum: [
                "transaction_reverted",
                "authorization_superseded",
                "canonical_external_advance"
              ]
            },
            {
              type: "null"
            }
          ]
        }
      }
    },
    d13_queueAvailable: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "state",
        "settlementEnabled",
        "reporterEnvironmentEnabled",
        "buffered",
        "projected",
        "incidentOpen",
        "blockedReason",
        "lastRun",
        "latestSubmission"
      ],
      properties: {
        status: {
          const: "available"
        },
        state: {
          enum: [
            "disabled",
            "empty",
            "ready",
            "preparing",
            "submitted",
            "retrying",
            "blocked",
            "stale"
          ]
        },
        settlementEnabled: {
          type: "boolean"
        },
        reporterEnvironmentEnabled: {
          oneOf: [
            {
              type: "boolean"
            },
            {
              type: "null"
            }
          ]
        },
        buffered: {
          type: "object",
          additionalProperties: false,
          required: [
            "firstRound",
            "lastRound",
            "roundCount",
            "activeRoundCount",
            "workUnits"
          ],
          properties: {
            firstRound: {
              oneOf: [
                {
                  $ref: "#/$defs/d2_uint64"
                },
                {
                  type: "null"
                }
              ]
            },
            lastRound: {
              oneOf: [
                {
                  $ref: "#/$defs/d2_uint64"
                },
                {
                  type: "null"
                }
              ]
            },
            roundCount: {
              $ref: "#/$defs/d2_uint64"
            },
            activeRoundCount: {
              $ref: "#/$defs/d2_uint64"
            },
            workUnits: {
              $ref: "#/$defs/d2_uint64"
            }
          }
        },
        projected: {
          $ref: "#/$defs/d9_projection"
        },
        incidentOpen: {
          type: "boolean"
        },
        blockedReason: {
          oneOf: [
            {
              enum: [
                "settlement_incident",
                "external_anomalous"
              ]
            },
            {
              type: "null"
            }
          ]
        },
        lastRun: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: [
                "startedAt",
                "finishedAt",
                "result"
              ],
              properties: {
                startedAt: {
                  oneOf: [
                    {
                      $ref: "#/$defs/d0_timestamp"
                    },
                    {
                      type: "null"
                    }
                  ]
                },
                finishedAt: {
                  oneOf: [
                    {
                      $ref: "#/$defs/d0_timestamp"
                    },
                    {
                      type: "null"
                    }
                  ]
                },
                result: {
                  oneOf: [
                    {
                      type: "string",
                      minLength: 1,
                      maxLength: 128
                    },
                    {
                      type: "null"
                    }
                  ]
                }
              }
            },
            {
              type: "null"
            }
          ]
        },
        latestSubmission: {
          oneOf: [
            {
              $ref: "#/$defs/d14_submission"
            },
            {
              type: "null"
            }
          ]
        }
      }
    },
    d15_signer: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "algorithm",
            "keySlot",
            "enrolledAt",
            "lastVerifiedAt"
          ],
          properties: {
            kind: {
              const: "trust-m"
            },
            algorithm: {
              const: "ecdsa-p256-sha256"
            },
            keySlot: {
              enum: [
                "0xE0F1",
                "0xE0F2",
                "0xE0F3"
              ]
            },
            enrolledAt: {
              $ref: "#/$defs/d0_timestamp"
            },
            lastVerifiedAt: {
              oneOf: [
                {
                  $ref: "#/$defs/d0_timestamp"
                },
                {
                  type: "null"
                }
              ]
            },
            lastSignature: {
              oneOf: [
                {
                  type: "string",
                  pattern: "^[A-Za-z0-9+/]{86}==$"
                },
                {
                  type: "null"
                }
              ]
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "algorithm",
            "keySlot",
            "enrolledAt",
            "lastVerifiedAt"
          ],
          properties: {
            kind: {
              const: "software-ecdsa"
            },
            algorithm: {
              const: "ecdsa-p256-sha256"
            },
            keySlot: {
              type: "null"
            },
            enrolledAt: {
              $ref: "#/$defs/d0_timestamp"
            },
            lastVerifiedAt: {
              oneOf: [
                {
                  $ref: "#/$defs/d0_timestamp"
                },
                {
                  type: "null"
                }
              ]
            },
            lastSignature: {
              oneOf: [
                {
                  type: "string",
                  pattern: "^[A-Za-z0-9+/]{86}==$"
                },
                {
                  type: "null"
                }
              ]
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "algorithm",
            "keySlot",
            "enrolledAt",
            "lastVerifiedAt"
          ],
          properties: {
            kind: {
              const: "ed25519"
            },
            algorithm: {
              const: "ed25519"
            },
            keySlot: {
              type: "null"
            },
            enrolledAt: {
              $ref: "#/$defs/d0_timestamp"
            },
            lastVerifiedAt: {
              oneOf: [
                {
                  $ref: "#/$defs/d0_timestamp"
                },
                {
                  type: "null"
                }
              ]
            },
            lastSignature: {
              oneOf: [
                {
                  type: "string",
                  pattern: "^[A-Za-z0-9+/]{86}==$"
                },
                {
                  type: "null"
                }
              ]
            }
          }
        }
      ]
    },
    d17_dateTime: {
      type: "string",
      format: "date-time"
    },
    d16_publicModuleSnapshot: {
      type: "object",
      additionalProperties: false,
      required: [
        "instanceId",
        "moduleType",
        "driverId",
        "moduleVersion",
        "schemaVersion",
        "state",
        "observedAt",
        "provenance",
        "health",
        "data"
      ],
      properties: {
        instanceId: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        moduleType: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        driverId: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        moduleVersion: {
          type: "string",
          pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
        },
        schemaVersion: {
          type: "integer",
          minimum: 1
        },
        state: {
          enum: [
            "disabled",
            "starting",
            "ready",
            "degraded",
            "faulted",
            "stopped"
          ]
        },
        observedAt: {
          $ref: "#/$defs/d17_dateTime"
        },
        provenance: {
          enum: [
            "hardware",
            "simulated",
            "replay",
            "derived"
          ]
        },
        health: {
          type: "object",
          additionalProperties: false,
          required: [
            "checkedAt"
          ],
          properties: {
            message: {
              type: [
                "string",
                "null"
              ],
              maxLength: 512
            },
            code: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            },
            checkedAt: {
              $ref: "#/$defs/d17_dateTime"
            }
          }
        },
        data: {
          type: "object"
        }
      }
    }
  },
  $comment: "Public response structure from source snapshot 2454d346d25e5b9dc48af7e547ce1038b6fdb5cc. See endpoint notes for semantic constraints."
};

// server/telemetry.ts
function allowExtensions(value) {
  if (Array.isArray(value)) return value.map(allowExtensions);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "additionalProperties" ? true : allowExtensions(v)
      ])
    );
  return value;
}
var ajv = new Ajv2020({ strict: false, allErrors: false });
addFormats(ajv);
for (const bits of [64, 96])
  ajv.addFormat(`uint${bits}-decimal`, {
    type: "string",
    validate: (s) => /^(0|[1-9][0-9]*)$/.test(s) && s.length <= 30 && BigInt(s) < 1n << BigInt(bits)
  });
var validate = ajv.compile(allowExtensions(status_default));
var WheelTracker = class {
  baseline = null;
  remainder = 0n;
  sequence = 0;
  tokens = 10;
  lastTokenAt = 0;
  view = {
    state: "connecting",
    text: "Connecting to wheel telemetry",
    observedAt: null,
    bonus: 0
  };
  reset(state = "unavailable", text = "Wheel unavailable \xB7 base recharge continues") {
    this.baseline = null;
    this.remainder = 0n;
    this.view = { state, text, observedAt: null, bonus: 0 };
    return { sequence: ++this.sequence, energy: 0, view: { ...this.view } };
  }
  consume(data, now = Date.now()) {
    const fail = (state2, text2) => this.reset(state2, text2);
    if (!validate(data))
      return fail(
        "unavailable",
        "Wheel schema unavailable \xB7 base recharge continues"
      );
    const s = data, m = s.measurement;
    if (!m)
      return fail("unavailable", "No wheel reading \xB7 base recharge continues");
    if (m.provenance !== "hardware")
      return fail("unavailable", "Non-hardware reading \xB7 no live bonus");
    if (m.coreStatus === "COUNTER_FAULT")
      return fail(
        "unavailable",
        "Wheel counter unavailable \xB7 base recharge continues"
      );
    const observed = Date.parse(m.observedAt), received = Date.parse(m.receivedAt), generated = Date.parse(s.generatedAt);
    if (m.freshness !== "online" || [observed, received, generated].some(
      (t) => !Number.isFinite(t) || now - t > 12e4 || t - now > 5e3
    ) || observed > received + 5e3 || received > generated + 5e3)
      return fail("stale", "Wheel reading stale \xB7 bonus paused");
    const work = BigInt(m.cumulativeWorkUnits), prev = this.baseline;
    const next = {
      installation: s.installationId,
      epoch: m.counterEpoch,
      work,
      observed
    };
    let energy = 0;
    let state = "baseline", text = "Wheel connected \xB7 setting a fresh baseline";
    if (!prev || prev.installation !== next.installation || prev.epoch !== next.epoch) {
      this.remainder = 0n;
      this.baseline = next;
    } else if (work < prev.work || observed < prev.observed) {
      return fail(
        "unavailable",
        "Wheel counter moved backward \xB7 setting a fresh baseline"
      );
    } else if (observed === prev.observed) {
      if (work !== prev.work)
        return fail("unavailable", "Wheel observation mismatch \xB7 bonus paused");
      state = m.coreStatus === "IDLE" || m.rpmMilli === 0 ? "resting" : "baseline";
      text = state === "resting" ? "Hamster resting \xB7 base recharge continues" : "Wheel connected \xB7 awaiting new work";
    } else {
      const delta = work - prev.work;
      this.baseline = next;
      if (m.coreStatus === "IDLE" || m.rpmMilli === 0) {
        this.remainder = 0n;
        state = "resting";
        text = "Hamster resting \xB7 base recharge continues";
      } else if (delta > 0n) {
        const capped = delta > 40n ? 40n : delta;
        const units = capped + this.remainder;
        const desired = Math.min(5, Number(units / 4n));
        this.remainder = units % 4n;
        this.tokens = Math.min(
          10,
          this.tokens + Math.max(0, now - this.lastTokenAt) / 1e3
        );
        energy = Math.min(desired, Math.floor(this.tokens));
        this.tokens -= energy;
        this.lastTokenAt = now;
        state = "active";
        text = "Fresh wheel work \xB7 shared bonus available";
      } else {
        state = "baseline";
        text = "Wheel connected \xB7 awaiting new work";
      }
    }
    this.view = { state, text, observedAt: m.observedAt, bonus: 0 };
    return { sequence: ++this.sequence, energy, view: { ...this.view } };
  }
};
function retryAfterMs(header, now = Date.now()) {
  if (!header) return 0;
  if (/^\d+(?:\.\d+)?$/.test(header)) return Math.max(0, Number(header) * 1e3);
  const time = Date.parse(header);
  return Number.isFinite(time) ? Math.max(0, time - now) : 0;
}
var WheelPoller = class {
  constructor(publish, fetcher = fetch) {
    this.publish = publish;
    this.fetcher = fetcher;
  }
  tracker = new WheelTracker();
  timer = null;
  abort = null;
  failures = 0;
  etag = null;
  cached;
  stopped = true;
  generation = 0;
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
    this.cached = void 0;
    this.publish(this.tracker.reset());
  }
  async poll(generation = this.generation) {
    if (this.stopped || generation !== this.generation) return;
    let delay = 3e3;
    const controller = new AbortController();
    this.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 5e3);
    try {
      const response = await this.fetcher(
        "https://api.squeekchain.com/v1/status",
        {
          headers: this.etag ? { "If-None-Match": this.etag } : {},
          signal: controller.signal
        }
      );
      if (this.stopped || generation !== this.generation) return;
      if (response.status !== 304 && !response.ok) {
        delay = Math.max(
          retryAfterMs(response.headers.get("retry-after")),
          Math.min(12e4, 3e3 * 2 ** Math.min(++this.failures, 6))
        );
        this.etag = null;
        this.cached = void 0;
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
        if (batch.view.state === "unavailable" || batch.view.state === "stale") {
          this.etag = null;
          this.failures++;
          delay = Math.min(12e4, 3e3 * 2 ** Math.min(this.failures, 5));
        } else this.failures = 0;
      }
    } catch {
      if (this.stopped || generation !== this.generation) return;
      this.etag = null;
      this.cached = void 0;
      this.publish(this.tracker.reset());
      delay = Math.min(12e4, 3e3 * 2 ** Math.min(++this.failures, 5));
    } finally {
      clearTimeout(timeout);
      if (!this.stopped && generation === this.generation)
        this.timer = setTimeout(() => void this.poll(generation), delay);
    }
  }
};

// server/rooms.ts
var ROOM_CAP = 3;
var RECONNECT_MS = 3e4;
var EMPTY_ROOM_MS = 6e4;
var MAX_ROOMS = 64;
function parseInput(value) {
  if (!value || typeof value !== "object") return null;
  const v = value;
  if (Object.keys(v).some(
    (k) => !["op", "seq", "x", "z", "attack", "dodge", "ability"].includes(k)
  ))
    return null;
  if (!Number.isSafeInteger(v.seq) || v.seq < 0 || typeof v.x !== "number" || !Number.isFinite(v.x) || Math.abs(v.x) > 1 || typeof v.z !== "number" || !Number.isFinite(v.z) || Math.abs(v.z) > 1)
    return null;
  if (["attack", "dodge", "ability"].some((k) => typeof v[k] !== "boolean"))
    return null;
  return {
    seq: v.seq,
    input: {
      x: v.x,
      z: v.z,
      attack: v.attack,
      dodge: v.dodge,
      ability: v.ability
    }
  };
}
var send = (ws, data) => {
  if (ws?.readyState === WebSocket.OPEN) {
    if (ws.bufferedAmount > 131072) {
      ws.close(1013, "Slow connection");
      return;
    }
    ws.send(JSON.stringify(data));
  }
};
var RoomService = class {
  constructor(now = Date.now, fetcher) {
    this.now = now;
    this.poller = new WheelPoller((batch) => this.applyWheel(batch), fetcher);
  }
  rooms = /* @__PURE__ */ new Map();
  poller;
  tickTimer = null;
  livePolling = false;
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
  applyWheel(batch) {
    for (const r of this.rooms.values()) {
      if (r.game.mode !== "live" || r.lastBatch >= batch.sequence) continue;
      const needsBaseline = r.lastBatch === 0;
      r.lastBatch = batch.sequence;
      const total = r.game.telemetry.bonus;
      r.game.telemetry = { ...batch.view, bonus: total };
      const present = [...r.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN
      );
      if (!needsBaseline && present) addWheelBonus(r.game, batch.energy);
    }
  }
  join(ws, v) {
    const error = (message) => {
      send(ws, { op: "error", message });
      return null;
    };
    if (!["fighter", "guardian", "medic"].includes(String(v.role)))
      return error("Choose Fighter, Guardian or Medic.");
    if (v.mode !== "live" && v.mode !== "practice")
      return error("Choose live or practice energy.");
    if (v.code !== void 0 && (typeof v.code !== "string" || !/^([A-HJ-NP-Z2-9]{5})?$/.test(v.code)))
      return error("Use the five-character room code.");
    if (v.token !== void 0 && (typeof v.token !== "string" || !/^[a-f0-9]{48}$/.test(v.token)))
      return error("Reconnect session expired. Join again.");
    let room = v.code ? this.rooms.get(v.code) : void 0;
    if (v.code && !room)
      return error("That room has closed. Create another room.");
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS)
        return error("The burrow server is full. Try practice.");
      let code = "";
      do {
        code = Array.from(
          randomBytes(5),
          (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]
        ).join("");
      } while (this.rooms.has(code));
      const game = createGame(v.mode, v.role);
      game.actors = game.actors.map(
        (a, i) => makeActor(`bot-initial-${i}`, a.role, i, true)
      );
      room = {
        code,
        game,
        seats: /* @__PURE__ */ new Map(),
        host: "",
        emptyAt: null,
        lastBatch: 0,
        createdAt: this.now()
      };
      this.rooms.set(code, room);
    }
    if (room.game.mode !== v.mode)
      return error(
        "This room uses a different energy mode. Match the host\u2019s mode."
      );
    const returning = v.token ? [...room.seats.values()].find((s) => s.token === v.token) : void 0;
    if (v.token && !returning)
      return error("Reconnect session expired. Join again.");
    if (returning) {
      const wasEmpty = ![...room.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN
      );
      const previous = returning.socket;
      returning.socket = ws;
      if (previous && previous !== ws)
        previous.close(1e3, "Session reconnected");
      returning.input = { ...EMPTY_INPUT };
      returning.pending = { attack: false, dodge: false, ability: false };
      returning.lastInput = this.now();
      returning.disconnectedAt = 0;
      returning.away = false;
      const a = room.game.actors.find((a2) => a2.id === returning.id);
      a.connected = true;
      room.emptyAt = null;
      if (wasEmpty) room.lastBatch = 0;
      send(ws, {
        op: "joined",
        code: room.code,
        id: returning.id,
        token: returning.token,
        host: room.host,
        state: room.game
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
        "This fight has started. Ask the host to replay, or create a room."
      );
    const id = randomBytes(8).toString("hex"), seat = {
      id,
      token: randomBytes(24).toString("hex"),
      socket: ws,
      input: { ...EMPTY_INPUT },
      pending: { attack: false, dodge: false, ability: false },
      lastInput: this.now(),
      lastSeq: -1,
      disconnectedAt: 0,
      away: false
    };
    const matching = room.game.actors.findIndex(
      (a) => a.bot && a.role === v.role
    );
    const index = matching >= 0 ? matching : room.game.actors.findIndex((a) => a.bot);
    const actor = makeActor(id, v.role, index);
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
      state: room.game
    });
    if (room.game.mode === "live") {
      this.livePolling = true;
      this.poller.start();
    }
    return { room, seat };
  }
  input(room, seat, v) {
    const parsed = parseInput(v);
    if (!parsed || parsed.seq <= seat.lastSeq) return;
    seat.input = parsed.input;
    for (const key of ["attack", "dodge", "ability"])
      seat.pending[key] ||= parsed.input[key];
    seat.lastSeq = parsed.seq;
    seat.lastInput = this.now();
  }
  action(room, seat, op) {
    if (op === "away") {
      seat.away = true;
      seat.input = { ...EMPTY_INPUT };
      seat.pending = { attack: false, dodge: false, ability: false };
      seat.lastInput = 0;
      const a = room.game.actors.find((a2) => a2.id === seat.id);
      if (a) a.connected = false;
      return;
    }
    if (op === "back") {
      seat.away = false;
      const a = room.game.actors.find((a2) => a2.id === seat.id);
      if (a) a.connected = true;
      return;
    }
    if (seat.id !== room.host) return;
    if (op === "start") startGame(room.game);
    if (op === "replay" && (room.game.status === "victory" || room.game.status === "defeat")) {
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
  disconnect(room, seat, ws) {
    if (seat.socket !== ws) return;
    seat.socket = null;
    seat.input = { ...EMPTY_INPUT };
    seat.pending = { attack: false, dodge: false, ability: false };
    seat.disconnectedAt = this.now();
    const a = room.game.actors.find((a2) => a2.id === seat.id);
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
              true
            );
        }
      }
      if (!r.seats.has(r.host)) {
        const next = [...r.seats.values()].find((s) => s.socket);
        if (next) r.host = next.id;
      }
      const present = [...r.seats.values()].some(
        (s) => s.socket?.readyState === WebSocket.OPEN
      );
      if (!present) {
        r.emptyAt ??= now;
        if (now - r.emptyAt > EMPTY_ROOM_MS) {
          this.rooms.delete(code);
          continue;
        }
      } else r.emptyAt = null;
      if (now - r.createdAt > 2 * 60 * 60 * 1e3) {
        for (const s of r.seats.values())
          s.socket?.close(1001, "Room lifetime reached");
        this.rooms.delete(code);
        continue;
      }
      if (r.game.mode === "live" && present) liveRooms++;
      if (present) {
        const inputs = {};
        for (const s of r.seats.values()) {
          const actor = r.game.actors.find((a) => a.id === s.id);
          if (actor)
            actor.connected = !!s.socket && !s.away && now - s.lastInput < 2e3;
          inputs[s.id] = now - s.lastInput < 300 ? {
            ...s.input,
            attack: s.input.attack || s.pending.attack,
            dodge: s.input.dodge || s.pending.dodge,
            ability: s.input.ability || s.pending.ability
          } : EMPTY_INPUT;
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
};

// server/index.ts
function createRaidServer(options = {}) {
  const service = new RoomService(Date.now, options.telemetryFetch);
  const dist = resolve("dist");
  const origins = options.origins ?? [];
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: service.rooms.size, cap: 3 }));
      return;
    }
    try {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = resolve(dist, "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(dist + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".md": "text/markdown; charset=utf-8"
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2048,
    perMessageDeflate: false
  });
  const ips = /* @__PURE__ */ new Map();
  const gateTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, v] of ips)
      if (v.connections === 0 && now - v.at > 6e4) ips.delete(ip);
  }, 6e4);
  gateTimer.unref();
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    if (req.url !== "/rooms" || origins.length > 0 && (!origin || !origins.includes(origin))) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const ip = req.socket.remoteAddress || "unknown", now = Date.now();
    let gate = ips.get(ip);
    if (!gate) {
      if (ips.size >= 4096) {
        socket.destroy();
        return;
      }
      gate = { tokens: 12, at: now, connections: 0 };
      ips.set(ip, gate);
    }
    gate.tokens = Math.min(12, gate.tokens + (now - gate.at) / 5e3);
    gate.at = now;
    if (gate.tokens < 1 || gate.connections >= 6) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 5\r\n\r\n");
      socket.destroy();
      return;
    }
    gate.tokens--;
    gate.connections++;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.once("close", () => {
        gate.connections = Math.max(0, gate.connections - 1);
      });
      wss.emit("connection", ws, req);
    });
  });
  wss.on("connection", (ws) => {
    let session = null;
    let tokens = 45, last = Date.now(), alive = true;
    const joinTimeout = setTimeout(() => {
      if (!session) ws.close(1008, "Join a room first");
    }, 1e4);
    ws.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 15e3);
    ws.on("message", (data) => {
      const now = Date.now();
      tokens = Math.min(45, tokens + (now - last) / 1e3 * 30);
      last = now;
      if (--tokens < 0) {
        ws.close(1008, "Message rate exceeded");
        return;
      }
      let v;
      try {
        v = JSON.parse(data.toString());
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      } catch {
        ws.close(1008, "Invalid message");
        return;
      }
      if (!session) {
        if (v.op !== "join") {
          ws.close(1008, "Join first");
          return;
        }
        session = service.join(ws, v);
        if (session) clearTimeout(joinTimeout);
        return;
      }
      if (v.op === "input") service.input(session.room, session.seat, v);
      else if (["start", "replay", "away", "back"].includes(String(v.op)))
        service.action(session.room, session.seat, String(v.op));
    });
    ws.on("close", () => {
      clearTimeout(joinTimeout);
      clearInterval(heartbeat);
      if (session) service.disconnect(session.room, session.seat, ws);
    });
    ws.on("error", () => {
    });
  });
  service.start();
  return {
    server,
    wss,
    service,
    listen: () => new Promise(
      (resolve2) => server.listen(
        options.port ?? 8080,
        options.host ?? "0.0.0.0",
        () => resolve2(server.address().port)
      )
    ),
    close: () => new Promise((resolve2) => {
      clearInterval(gateTimer);
      service.stop();
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close(() => resolve2());
    })
  };
}
if (process.argv[1] && /[/\\](index\.ts|index\.mjs)$/.test(process.argv[1])) {
  const raid = createRaidServer({
    port: Number(process.env.PORT) || 8080,
    host: process.env.HOST || "0.0.0.0",
    origins: process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean)
  });
  raid.listen().then(
    (port) => console.log(
      `Burrow Raid server listening on port ${port}. No persistent storage. Configure ALLOWED_ORIGINS before public hosting.`
    )
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      void raid.close().then(() => process.exit(0));
    });
}
export {
  createRaidServer
};
