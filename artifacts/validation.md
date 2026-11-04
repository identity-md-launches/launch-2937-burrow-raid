# Worker validation

**Implementation checked; full brief incomplete because independent agent review could not run.** This report is the worker's own evidence, not independent certification, Genesis approval or a badge. The required review remains open, as recorded in [independent-review.md](independent-review.md). Persistent public co-op hosting is not provisioned and is explicitly disclosed. Static publication is handled after the job; no public URL was verified here.

Validation ran on 2026-11-03–04. Runtime: Node 22.23.3, TypeScript 5.9.3, Vite 7.3.7, React 19.3.1, Three.js 0.180.0 and Playwright 1.64.1, with the exact dependency resolution in the lockfile. Production checks served `dist/` at a `/preview/` subpath. No development-server result is substituted for the production export.

## Commands and actual results

| Check | Result | Durable evidence |
| --- | --- | --- |
| `npm run typecheck` | Exit 0; frontend, shared simulation, server, TypeScript tests and TypeScript scripts checked | Source plus `tsconfig.json` |
| `npm test` and final JSON-report run | Exit 0; **45 passed, 0 failed**, across 3 test files | [unit-results.json](unit-results.json) |
| `npm run test:balance` | Exit 0; 12 simulated runs, 6 active-role wins and 6 idle-player time-limit defeats | [balance.json](balance.json) |
| `npm run build` | Exit 0; production `dist/` and compiled `server-build/index.mjs` emitted after the final app change | Included export and server bundle |
| `npm run test:browser` | Exit 0; **23 passed, 0 failed**, plus 1 explicitly unperformed WebKit runtime check | [browser-results.json](browser-results.json) |
| Pinned `taste.mjs --out test/scratch/taste` | Exit 0; **16/16 passed** at 320, 390, 1440 and reduced motion | [taste-results.json](taste-results.json) |
| `npm run check:live` | Exit 0; real hardware baseline, then resting readings; **zero bonus energy awarded** | [telemetry-live-check.json](telemetry-live-check.json) |
| `node scripts/licenses.mjs` | Exit 0; all production dependency and font notices collected | `public/licenses.txt`, copied to `dist/` |
| `node scripts/check-bundle.mjs` | Final inventory checked against 8,388,608 bytes | [bundle-size.json](bundle-size.json) |

Browser commands used the test browser installation outside the submission via `PLAYWRIGHT_BROWSERS_PATH`. The supplied browser MCP could not launch because its Chrome distribution was absent. Standalone Playwright Chromium with SwiftShader successfully performed the rendered checks. All test servers and browser sessions were closed by their bounded foreground programs.

The final browser run recorded **zero uncaught page errors, zero console errors and zero failed local runtime resources** in normal checked pages. Its separate initial-WebGL-failure case intentionally denies graphics creation, then restores it and verifies the retry. The real API was not used as a synthetic activity feed in browser tests; the room server's controlled test fetch is explicitly unavailable.

## Interaction coverage

- Role selection for all three classes; Fighter keyboard combat, Guardian ability and Medic touch combat. Native keyboard focus, dialog trapping/return, Escape dismissal and inline connection validation.
- Keyboard movement, held attack, quick dodge/skill presses, cooldown feedback, pause, a stable paused HUD, resume and home navigation. Short actions are also latched server-side across input packets.
- Real Chrome touch events drive the movement pad, held attack, dodge and skill. Touch was emulated, not performed on a physical phone.
- Viewports: 320×812, 390×844, 768×1024 and 1440×900 for the lobby; 390×844 portrait combat and 844×390 landscape combat. Horizontal overflow checks passed. Party health and action controls remain separate in landscape.
- At **390×844**, the main action's measured box is **x=24, y=646.39, width=342, height=50**. The 3D product and start action both appear on the first screen. The final probe found all 9 measured controls at least 44px, no horizontal scroll, no overlapping/clipped text, and 20 words of first-screen prose.
- Pause on visibility loss and explicit resume were tested with an emulated visibility event. Window blur clears inputs in source and was exercised through browser page focus changes. Reduced-motion media and its field-guide control were checked; no endless CSS animation remained under reduced motion.
- Two real browser clients joined one three-seat room. Tests verified shared boss telegraphs, movement through authoritative server state, host/guest permissions, the same reconnect seat after a forced socket loss, and online pause with continuing simulation and bot coverage.
- Browser victory, replay, defeat and restart screens were exercised by setting health **in the test harness's authoritative server**, not with a shipped client hook. Natural wins and time-limit losses are separately tested by the fixed-step simulation. The synchronization test extends one server-generated warning window so sequential browser assertions inspect the same attack.
- Initial WebGL creation failure disables the play action and displays a recovery message. Restoring context creation and retrying succeeds. Forced context loss also shows the recovery UI and successfully retries.
- Optional audio toggling and context startup were tested. Source resets audio event tracking for a fresh replay. Actual speaker output and musical/auditory quality were not listened to or certified.

## Fight balance

The active pilot is deterministic avoidance AI operating a normal player seat and requesting available abilities. The two bot allies retain their reduced damage and energy rules. These are regression results, not human playtest scores or difficulty approval.

| Role | Practice, active | Live, active with no wheel bonus | Idle pilot, both modes |
| --- | --- | --- | --- |
| Fighter | Victory at 74.15s | Victory at 82.65s | Defeat at 180s |
| Guardian | Victory at 114.85s | Victory at 120.15s | Defeat at 180s |
| Medic | Victory at 117.05s | Victory at 119.65s | Defeat at 180s |

Core combat therefore does not depend on real hamster activity. Perfect avoidance in this harness leaves the active party healthy; this does not establish that an untrained human will win. The first iteration's idle-player wins were removed by tuning boss health to 3,600 and reducing bot basic/skill damage. Basic attacks and dodge stay free.

## Telemetry and service validation

Controlled tests cover BigInt values beyond JavaScript's safe-integer range, uint bounds, fractional work, duplicate snapshots, capped jumps, installation/epoch changes, timestamp regression, counter regression, reused observation timestamps, future/stale readings, malformed/unsupported schemas, null measurements, non-hardware provenance, counter faults and sleeping. A regressed reading discards the baseline; the next valid head cannot re-award old work. Recovery after errors/reconnect starts from a fresh baseline.

Retry tests use fake time to verify numeric and HTTP-date Retry-After, backoff, conditional 304 freshness and stop/restart generations without a duplicate poll loop. Room tests verify positive credit once per room with two real sockets, duplicate batch rejection, no offline banking, new/returned empty-room baselines, reconnect, stale-input bot coverage, host handover, expiry/cleanup, a three-player cap, malformed movement/score rejection and message-flood closure.

The real read-only API check at 2026-11-03T23:45:39.755Z accepted the published v1 schema and observed a resting hamster after its first baseline. It awarded zero. **No positive live wheel delta was observed in this short real-source check.** Positive-delta integration is verified with controlled fixtures and the authoritative room service. Nothing simulates live activity in the product. Telemetry is not confirmed settlement or issuance.

Schema source: [official status schema](https://docs.squeekchain.com/assets/api/status.json), read with the [current API documentation](https://docs.squeekchain.com/developers/api/) on 2026-11-03. Stored schema SHA-256: `8f1fd930bf46625f60c869d0f25e1118f186ba853a7f43c14b566748336a7df3`.

## Better Interface: six-domain review

The pinned workflow and core principles in accessibility, layout, writing, typography, colors and UI were read and applied during construction. Applicable findings were corrected in the actual game. The design critic was also read; its review-only file restrictions did not override the assignment's explicit build-and-fix authorization. The wallet guide was read and is **not applicable** because the brief expressly forbids wallet infrastructure.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility — Checked | Native buttons/fields/dialogs, accessible control and progress names, keyboard path, focus return, visible primary-action focus screenshot, text alongside warning colors, motion controls. Axe lobby audit: 0 violations for WCAG A/AA tags. | Axe reports color-contrast as incomplete where backgrounds are complex. No native screen-reader session or full nonvisual combat test. |
| Layout — Checked | First-screen 390 action measured; 320–1440 reflow, short landscape, screenshots and probe. No measured horizontal overflow, text collision or clipping. | Native 200% zoom, physical safe-area/notch behavior and RTL mirroring unperformed. English LTR is the implemented locale. |
| Writing — Checked | Exact role effects/costs, concise start screen, recoverable connection errors, labelled bots/practice and explicit backend limit. Rest and telemetry/settlement distinctions are stated. | No localization testing. Payment, eligibility and public uptime are not asserted. |
| Typography — Checked | Six sizes, two loaded font families, three weights; numeric stability; 16px form inputs; real wrapping inspected on phone and desktop. | Browser-native zoom/text enlargement and alternative-script fonts unperformed. |
| Colors — Checked with limits | All probe-measured solid text pairs passed; declared solid pairs are calculated in [contrast.json](contrast.json). Button pair is 7.67:1, primary text on forest 12.49:1. | The probe explicitly leaves **26 canvas/gradient-backed text boxes unmeasured**. These were viewed, but no numerical contrast claim is made for them. No color-vision device simulation performed. |
| UI — Checked | Selected, hover/source, focus, active, disabled/cooldown, connecting/error, pause/result/retry states; original 3D scene, restrained motion and no decorative motion under reduced motion. | Physical-device GPU/audio behavior and the browser Animations panel at 10% speed unperformed. No stable frame-rate or full accessibility compliance claim. |

### Findings, fixes and rechecks

Source references point to the final implementation. Prior defects describe observed tests/screens or explicit source omissions, not a new independent verdict.

| Severity / domain | Source | Finding and implemented correction | Recheck |
| --- | --- | --- | --- |
| High / game authenticity | `server/rooms.ts:157` | Room initialization left the local placeholder human in a network room. Begin with bot seats and replace one for each real join; matching-role bots are preferred. | Socket tests and two-browser room counts now show 2 real players and 1 labelled bot. |
| High / controls | `src/App.tsx:177`, `server/rooms.ts:259` | A short action could begin and end between simulation ticks. Queue discrete actions until consumed, including across network packets; retain server cooldowns. | Quick keyboard presses, real emulated touch and packet-burst regression pass. |
| High / layout | `src/style.css:1401` | The initial phone layout left a large blank area beneath the menu. Replace visual top offset plus footer offset with in-flow top padding and normal footer flow. | Final phone screenshot and 390 action measurement pass. |
| High / reduced motion | `src/scene.ts:714` | Resizing cleared WebGL while the idle reduced-motion frame cache skipped a redraw. Invalidate frame/tick cache when resizing. | Final mobile/desktop resize screenshots and rendered share image show the arena. |
| High / telemetry | `server/telemetry.ts:125` | Installing an older counter/time as baseline could count previously seen work again after the head returned. Discard that baseline and baseline the next valid sample. | Regression fixture checks zero credit after reset, then exactly one new energy. |
| Medium / telemetry lifecycle | `server/telemetry.ts:189`, `server/rooms.ts:181` | A stopped poll could complete late; the last player returning also needed to restart polling. Add generations, restart on reconnect, room baselines and no empty-room credit. | Fake-time poll-loop and real socket reconnect/baseline tests pass. |
| Medium / balance | `shared/game.ts:180`, `shared/game.ts:360` | Early bots could win while the human idled. Increase boss health and reduce assistance damage. | All active roles win and all idle pilot runs time out in the recorded balance matrix. |
| Medium / writing | `src/App.tsx:630` | The first probe counted four punctuated slogan lines, and armor-breaking copy implied an absent mechanic. Replace role copy with concrete effects, such as “Deal 80 damage at close range.” | Final slogans check passes; all 16 probe checks pass. |
| Low / accessibility | `src/style.css:127`, `src/style.css:1365` | Several initial utility targets were 40–42px. Raise brand/settings/footer touch hit areas to 44px. | Final probe: 0 measured controls below 44px; visible focus captured. |
| Medium / pause state | `src/App.tsx:191` | The paused panel could initially show a prior HUD snapshot, followed by one display catch-up. Snapshot current practice state when pausing. | Browser health/time display stays stable while paused. |
| Low / replay audio | `src/App.tsx:445` | Source retained a prior run's audio event number when a replay reset effect IDs. Reset event tracking on a lower fresh ID. | Typecheck/build and browser audio lifecycle pass; actual replay audibility remains unperformed. |

## Retained screenshots

- [Phone first screen](screenshots/phone-lobby.png)
- [Desktop first screen](screenshots/desktop-lobby.png)
- [Phone combat and cooldown feedback](screenshots/phone-fight.png)
- [Landscape combat](screenshots/landscape-fight.png)
- [Visible keyboard focus on the main action](screenshots/keyboard-focus.png)

The images were captured from the actual production export and inspected. Probe screenshots were also inspected before retaining the smaller set above. The first-screen game is a live WebGL scene, not a background image. The social PNG is an original rendered capture.

## Remaining limits and completion status

1. **Required independent agent review is unperformed.** Two attempts returned `failed to initialize in-process app-server client: Read-only file system (os error 30)` with exit 1 before a reviewer turn. No independent findings or approval exist.
2. **No persistent public co-op server or public URL was provisioned/verified.** Local genuine multiplayer is tested. Static publication follows the assignment pipeline; backend hosting requires an operator and is clearly disclosed. No paid service was acquired.
3. **WebKit could not run** because required system libraries were missing. Chromium touch emulation is not an iPhone/Safari or physical-device test. The other unperformed checks are listed in domain coverage above.
4. Browser result screens use explicit authoritative test-harness outcome triggers; complete natural fights are validated by simulation, not a full human browser playthrough. The single-process server has not been public-load tested, and room state/reconnect credentials do not survive a process/page restart.
5. The required customer wallet payment, Genesis eligibility and customer review have not been verified. No Genesis submission, wallet interaction, badge or approval has occurred.

The usable game, full source, tests, documentation and complete static export are delivered for review. **The full request cannot be marked complete while the independent-review gate remains open.** No requester-only missing value is being invented, and no approval question is needed to report the runtime failure.
