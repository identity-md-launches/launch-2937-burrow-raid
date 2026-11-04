# Brief coverage

| Requirement | Delivery status / evidence |
| --- | --- |
| “finished original 3D browser game” | Implemented in `src/scene.ts`, `shared/game.ts`, `src/App.tsx`; real WebGL scene and working game, not a garden/tracker/dashboard. Screenshots and browser interactions retained. Subjective final customer approval is pending. |
| “one polished arena, one boss” | Rootbound Hollow and Cable Gnawer; original procedural geometry, mushroom lanterns, roots, moss and brass. |
| “Fighter/Guardian/Medic roles” | Three selectable classes, different health/ranges/skills; all tested and balanced. |
| “telegraphed attacks, movement, dodging, role abilities, health, shared energy” | Implemented with circle/ring/stripe warnings, server-side collision/range/cooldown validation and responsive HUD. |
| “victory/defeat and replay” | Simulation outcomes and authoritative browser result/restart checks pass. |
| “Keyboard and touch … sound … reduced-motion … onboarding” | Implemented and checked in Chromium; physical devices, actual audio output and WebKit remain unverified. |
| “genuine multiplayer … small player cap … solo bot fallback” | Three-seat WebSocket server tested with two real browser clients; bots always labelled. Immediate solo practice remains available. |
| “server-authoritative … synchronized … reconnect … cleanup … rate limits” | Implemented in `server/`; integration tests cover authority, ownership, shared attacks, reconnect, expiry and abuse cases. |
| “If persistent backend hosting cannot be delivered … report … explicitly” | Disclosed in game, README and architecture. No persistent public backend purchased or provisioned. |
| “current schemas … real positive wheel-work deltas … on the server … once per room” | Published v1 schema stored; BigInt tracker and room deduplication implemented. Real API check observed resting and zero bonus; controlled tests verify positive-delta paths. |
| “freshness/observedAt … baseline … Retry-After … backoff” | Validated and regression-tested, including resets, duplicate/out-of-order values, cached 304 age and poll-generation races. |
| “Sleeping pauses bonus … Basic combat stays available” | Rest shows no bonus; 45 initial energy, 1/s base recharge, free attacks/dodges explicitly documented as game rules. |
| “practice … simulated energy; never invent live activity” | Default practice uses labelled +2/s simulated recharge; no live API feed in the browser and no invented positive sample. |
| “Distinguish telemetry from confirmed settlement” | Explicit in the field guide, README and architecture. No settlement/issuance or token reward is claimed. |
| “No wagering … wallet … approvals … signatures … transactions … contracts … private keys” | No such application feature, dependency or action is included. Server seat credentials are ephemeral game-session tokens, not wallet keys. |
| “original/generated or appropriately licensed art … licenses” | Original procedural art/sound/mark; local licensed fonts and Lucide icons; all production dependency notices retained. |
| “Require independent agent review before delivery” | **Unmet.** Separate reviewer failed before starting; exact error and open gate documented. No approval claimed. |
| “public working site” | Complete relative-path `dist/` provided for assignment publication. No public URL was available to verify during this run. |
| “dist/index.html … assets … source and lockfile” | Present and validated at `/preview/`; no dependency cache/vendor registry/submodule included. |
| “production build, typecheck … interaction validation” | Exit 0; 45 unit/integration tests, 23 browser checks, 16/16 design probe. See validation for limits. |
| “Better Interface … six domains … findings” | Applied during build; consolidated coverage and applicable fixes recorded in validation. |
| “first screen at 390 … main action … metadata” | Actual measured start action at y=646.39, height 50 in 390×844; title/favicon/description/OG title/real OG PNG present. |
| “DESIGN.md … final source” | Root document describes implemented tokens, fonts, components, responsive behavior and review limits. |
| “README … install, preview and rebuild” | Included with exact commands, co-op operation, hosting limits and attribution. |
| “8 MiB … no dependency/cache directories … explicit ignore budget” | Nested exclusions and explicit path budgets included; exact final inventory in `bundle-size.json`. |
| “IMD job/project attribution … Genesis description” | Included in game credits, README and `GENESIS.md`. |
| “first job … customer's Genesis-verified regular wallet” | Prerequisite documented; payment/eligibility not verified and no wallet action attempted. |
| “Do not submit to Genesis until … reviewed” | No submission made; customer review and independent-review gate remain outstanding. |

These are worker-reported coverage statements. The configured path/byte verifier does not independently certify behavior.
