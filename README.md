# Burrow Raid

A finished playable 3D hamster boss battle in one miniature, mushroom-lit arena. Choose Fighter, Guardian or Medic, dodge the Cable Gnawer, and defend the burrow. The default game is **practice with two labelled bot companions and simulated bonus recharge**.

The static production export is included in `dist/`, alongside complete source, lockfile, tests and the compiled co-op server. It works at a static hosting subpath with relative asset URLs. Publication of this export is handled by the assignment's publishing pipeline; no public URL was available to verify in this run.

**Public co-op backend hosting is not provisioned.** Genuine three-player WebSocket rooms are implemented and tested locally with two browser clients. The game clearly discloses the hosting limit and accepts a trusted owner-hosted room server URL. Bots are always labelled. No paid services were acquired.

**The required independent agent review remains incomplete.** The separate reviewer runtime failed before a model turn with a read-only filesystem initialization error. See [the exact result](artifacts/independent-review.md). Worker test results are self-validation and carry no independent approval.

## Install, play and rebuild

Use Node.js 22.12 or later; validation used Node 22.23.3.

```sh
npm ci
npm run dev
```

Vite prints the frontend development URL. To rebuild and preview the included production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`build` produces `dist/` and `server-build/index.mjs`. `preview` serves the static game, with immediate solo practice. Retain `dist/` in the submission: the static publisher does not rebuild it. All fonts, graphics code, icon assets and the share image are local; no CDN or wallet is needed to play practice. WebGL 2 is required; an explicit failure message and retry are provided.

## Play co-op locally

```sh
npm ci
npm run build
npm run server
```

Open `http://localhost:8080`. Choose a role, open **Play with friends**, and enter `ws://localhost:8080/rooms`. Leave the room code empty to create a room; share its five-character code with another local browser. Both players must choose the same energy mode. The host starts the raid. Open seats use bots, which deal reduced damage. Practice energy also works in server-authoritative rooms.

For another device, host behind TLS and use its actual `wss://` URL; plain WebSockets are accepted by the frontend only for localhost development. `HOST` and `PORT` configure the process. `ALLOWED_ORIGINS` is a comma-separated list of exact permitted frontend origins; set it on a public deployment. An empty list is the local-development default. There are no required secrets, private keys or wallet credentials. `/health` reports process health and room count; `/rooms` is the WebSocket path.

The public `public/config.json` setting `roomServer` defaults to `null`. An owner can set it to their actual WebSocket endpoint and rebuild to prefill the room panel. This is a public address, never a place for a credential. The form remains usable without a configured server, and reports connection errors with a practice fallback.

The static export cannot run Node or maintain rooms. A continuously running Node process and TLS proxy are separate hosting requirements. No account, deployment, domain, uptime or persistence is supplied or claimed. The server stores rooms only in memory; process restarts lose them. Reconnect works within the same open page for 30 seconds. A page reload loses its in-memory reconnect token. See [architecture and operating limits](artifacts/architecture.md).

## Fight rules

- The Cable Gnawer has 3,600 health. Win before 180 simulation seconds; lose if every paw falls or time runs out. It attacks faster below half health.
- Move with WASD or arrows, or drag the touch pad. Hold Space or Attack for free basic attacks. Shift or Dodge gives 0.42 seconds of protection with a three-second cooldown. E or the role button uses an ability. Short presses are queued across simulation and network ticks.
- Fighter: 110 health, 13-damage close attacks, 80-damage Acorn burst for 18 shared energy (7s cooldown).
- Guardian: 150 health, 10-damage close attacks, a 55-point nearby party shield for 16 energy (8s cooldown, 6s duration).
- Medic: 100 health, 9-damage ranged attacks, nearby 40-health healing and revival for 20 energy (8s cooldown).
- Fallen paws return at 40% health after 12 seconds if an ally remains standing. A Medic can revive them sooner. Bots help with avoidance and reduced damage; the tested idle-player runs lose on time.
- Each raid starts with **45 shared energy**. Basic combat and dodging never consume it. Every mode recharges **1 energy per second as a game rule**. Practice adds **2 simulated energy per second**, for 3 total, without reading live activity.
- Live rooms add only verified positive hardware telemetry deltas: 4 new work units per energy, at most 5 per sample, with a 10-energy burst bucket refilling at 1 energy per second. Excess is discarded, not banked. The pool is capped at 100. One delta is applied once per room, regardless of player count. New/returned empty rooms baseline before a bonus.
- Resting, stale, unavailable, simulated, replayed or invalid measurements never create a live bonus. Let the hamster rest; base recharge and all basic combat continue. Telemetry is **not confirmed settlement**, token issuance or a reward.

P or Escape pauses practice. Hiding the page or losing focus clears inputs and pauses it. Online rooms continue; a bot covers an away, stalled or disconnected player. Resume explicitly. Sound starts only after opting in. Reduced-motion preferences disable decorative motion; essential movement and attack timing remain visible. Help, rules, credits and motion controls are in the top-right field guide.

## Validation and assets

```sh
npm run typecheck
npm test
npm run test:balance
npx playwright install chromium webkit
npm run test:browser
```

Browser binaries can be installed outside the repository by setting `PLAYWRIGHT_BROWSERS_PATH`. The browser test starts and closes its own static subpath preview and co-op server. No externally hosted backend or live wheel is needed for deterministic tests.

Actual results: **45 unit/integration tests**, **23 Chromium interaction checks**, and **16/16 design probe checks** passed. Full results are recorded in [artifacts/validation.md](artifacts/validation.md), with machine-readable evidence and screenshots. The balance suite verifies all three roles in both modes with zero real wheel bonus. The bounded real API check observed a hardware baseline and a resting hamster, with zero bonus awarded; positive-delta behavior is covered by controlled tests, not invented live activity. WebKit could not launch because required system libraries were missing. Physical devices, native screen readers and native browser zoom were not tested.

```sh
npm run check:live
npm run assets:social
node scripts/licenses.mjs
npm run build
node scripts/check-bundle.mjs
```

`check:live` makes a bounded, read-only check of the real public API and writes its actual observations. `assets:social` captures the original rendered scene to `public/social.png`; rebuild afterward to copy it into `dist/`. `licenses.mjs` collects all production dependency and font notices. The bundle check counts source, static export, compiled server, documentation and artifacts against the 8 MiB limit, rejecting dependency/cache archives inside delivery paths. Dependency installations, browser downloads and test scratch files are excluded at every nesting level; nothing is vendored as an npm registry.

The pinned review command used is:

```sh
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The assignment removes pinned inputs and `test/scratch/` before submission. Durable evidence is retained in `artifacts/`. [DESIGN.md](DESIGN.md) describes the final implemented interface, not a proposed design.

## Attribution and Genesis review

Built for the Squeekchain Genesis Code lane through the **IdentityMD contributor network**.

- Project: `7e402e1f-52ae-4d91-a0ff-0b907f03ed74`
- Job: `5374bf4d-e3de-4564-a911-de1e5e91f11d`

Original procedural hamster models, Cable Gnawer, arena, foliage, mushrooms, root arches, hamster mark, favicon and synthesized game sounds are included in source. Runtime libraries and fonts retain the notices in [public/licenses.txt](public/licenses.txt); original code is MIT licensed. The API schema is from [Squeekchain's published status schema](https://docs.squeekchain.com/assets/api/status.json), read with the [current API documentation](https://docs.squeekchain.com/developers/api/) on 2026-11-03.

Better Interface design guidance is adapted from Jakub Krehel (MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`); documentation guidance from Paul Bakaus's Impeccable (Apache-2.0, `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Their full supplied license notices are retained in `artifacts/interface-guidance-license.txt`.

The first job must be paid by the customer's **Genesis-verified regular wallet**. This game does not verify payment or wallet eligibility and includes no wallet connection, signatures, approvals, transactions, contracts, wagering or token prizes. No badges or approval are claimed. **Nothing has been submitted to Genesis.** Customer review and the outstanding independent review are required before submission. A concise proposed description is in [artifacts/GENESIS.md](artifacts/GENESIS.md).
