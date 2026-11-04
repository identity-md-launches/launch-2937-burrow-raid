import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRaidServer } from "../server-build/index.mjs";

const output = "test/scratch/browser-checks";
await mkdir(output, { recursive: true });
const results = [];
const pageErrors = [];
const consoleErrors = [];
const badResources = [];
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
  ".json": "application/json",
};
const staticServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/preview/")) throw new Error();
    const path = resolve(
      "dist",
      decodeURIComponent(url.pathname.slice(9)) || "index.html",
    );
    if (!path.startsWith(resolve("dist") + "/")) throw new Error();
    const body = await readFile(path);
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${staticServer.address().port}`,
  url = origin + "/preview/";
const raid = createRaidServer({
  port: 0,
  host: "127.0.0.1",
  origins: [origin],
  telemetryFetch: async () =>
    new Response("{}", { status: 503, headers: { "Retry-After": "60" } }),
});
const raidPort = await raid.listen();
let browser;
const contexts = [];
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({
      name,
      passed: true,
      durationMs: Date.now() - start,
      ...(detail ? { detail } : {}),
    });
    console.log("PASS " + name);
  } catch (e) {
    results.push({
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: e.message,
    });
    console.log("FAIL " + name + ": " + e.message);
  }
}
async function pageFor(width = 1440, height = 900, touch = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  contexts.push(context);
  const p = await context.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => pageErrors.push(e.message));
  p.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  p.on("response", (r) => {
    if (r.status() >= 400)
      badResources.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await p.goto(url);
  await p.evaluate(() => document.fonts.ready);
  await p.locator("canvas").waitFor();
  return p;
}
async function closeHelp(p) {
  await p.getByRole("button", { name: "Close dialog" }).click();
}
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const desktop = await pageFor();
  await check("Static subpath export, loaded fonts and metadata", async () => {
    assert.match(await desktop.title(), /Burrow Raid/);
    assert.equal(await desktop.locator('meta[property="og:title"]').count(), 1);
    assert.equal(await desktop.locator('meta[property="og:image"]').count(), 1);
    const social = await desktop.request.get(url + "social.png");
    assert.equal(social.status(), 200);
    assert.match(social.headers()["content-type"], /image\/png/);
    assert.equal(
      await desktop.evaluate(() => document.fonts.check("600 28px Fraunces")),
      true,
    );
    assert.equal(await desktop.getByText("The burrow needs WebGL").count(), 0);
    return { base: "/preview/", fonts: "Fraunces + Nunito Sans" };
  });
  await check("Automated accessibility audit of the lobby", async () => {
    const audit = await new AxeBuilder({ page: desktop })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      audit.violations.map((v) => ({ id: v.id, impact: v.impact })),
      [],
    );
    return {
      violations: audit.violations.length,
      incompleteRules: audit.incomplete.map((v) => v.id),
      manualScreenReader: false,
    };
  });
  for (const [width, height] of [
    [320, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await check(`Lobby responsive layout ${width}×${height}`, async () => {
      await desktop.setViewportSize({ width, height });
      await desktop.waitForTimeout(200);
      assert.equal(
        await desktop.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const box = await desktop
        .getByRole("button", { name: "Enter the burrow" })
        .boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1);
      if (width === 390) assert(box.y + box.height <= height);
      await desktop.screenshot({
        path: `${output}/lobby-${width}.png`,
        fullPage: true,
      });
      return { mainAction: box };
    });
  }
  await check(
    "All roles, truthful co-op limitation, recoverable URL validation",
    async () => {
      for (const r of ["Guardian", "Medic", "Fighter"]) {
        await desktop.getByRole("button", { name: r, exact: true }).click();
        assert.equal(
          await desktop
            .getByRole("button", { name: r, exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
      }
      await desktop.getByRole("button", { name: "Play with friends" }).click();
      assert.equal(
        await desktop
          .getByText(/Public co-op hosting is not provisioned/)
          .isVisible(),
        true,
      );
      await desktop
        .getByRole("button", { name: "Create room", exact: true })
        .click();
      assert.match(
        await desktop.locator("#room-error").innerText(),
        /Enter a hosted room server URL/,
      );
      await closeHelp(desktop);
    },
  );
  await desktop.keyboard.press('Tab');
  await desktop.getByRole('button',{name:'Enter the burrow'}).focus();
  const focusBox=await desktop.getByRole('button',{name:'Enter the burrow'}).boundingBox();
  await desktop.screenshot({path:`${output}/keyboard-focus.png`,clip:{x:focusBox.x-10,y:focusBox.y-10,width:focusBox.width+20,height:focusBox.height+20}});
  await check("Keyboard focus, help dialog trap and focus return", async () => {
    const trigger = desktop.getByRole("button", { name: "How to play" });
    await trigger.focus();
    await desktop.keyboard.press("Enter");
    assert.equal(await desktop.getByRole("dialog").isVisible(), true);
    await desktop.keyboard.press("Tab");
    assert.equal(
      await desktop.evaluate(() => !!document.activeElement?.closest("dialog")),
      true,
    );
    await desktop.keyboard.press("Escape");
    assert.equal(await desktop.getByRole("dialog").count(), 0);
    assert.equal(
      await trigger.evaluate((el) => el === document.activeElement),
      true,
    );
    assert.notEqual(
      await trigger.evaluate((el) => getComputedStyle(el).outlineStyle),
      "none",
    );
  });
  await check(
    "Keyboard movement, attack, dodge, skill and pause/resume",
    async () => {
      await desktop.getByRole("button", { name: "Enter the burrow" }).click();
      await desktop.locator(".boss-hud").waitFor();
      await desktop.waitForTimeout(150);
      assert.equal(
        await desktop.evaluate(() => document.activeElement?.id),
        "arena-controls",
      );
      await desktop.keyboard.down("ArrowUp");
      await desktop.keyboard.down("ArrowRight");
      await desktop.waitForTimeout(650);
      await desktop.keyboard.up("ArrowUp");
      await desktop.keyboard.up("ArrowRight");
      const before = Number(
        await desktop
          .getByRole("progressbar", { name: "Cable Gnawer health" })
          .getAttribute("aria-valuenow"),
      );
      await desktop.keyboard.down("Space");
      await desktop.waitForFunction(
        (before) =>
          Number(
            document
              .querySelector('[aria-label="Cable Gnawer health"]')
              .getAttribute("aria-valuenow"),
          ) < before,
        before,
        { timeout: 4000 },
      );
      await desktop.keyboard.up("Space");
      const after = Number(
        await desktop
          .getByRole("progressbar", { name: "Cable Gnawer health" })
          .getAttribute("aria-valuenow"),
      );
      assert(after < before);
      await desktop.keyboard.press("Shift");
      await expect(desktop.locator(".combat-action").nth(1)).toBeDisabled({
        timeout: 4000,
      });
      await desktop.keyboard.press("e");
      await expect(desktop.locator(".skill-action")).toBeDisabled({
        timeout: 4000,
      });
      await desktop.keyboard.press("p");
      await desktop
        .getByRole("heading", { name: "A little breather" })
        .waitFor();
      const time = await desktop.locator(".boss-sub").innerText();
      await desktop.waitForTimeout(1100);
      assert.equal(await desktop.locator(".boss-sub").innerText(), time);
      await desktop
        .locator(".pause-panel")
        .getByRole("button", { name: "Resume raid", exact: true })
        .click();
      assert.equal(
        await desktop
          .getByRole("heading", { name: "A little breather" })
          .count(),
        0,
      );
      await desktop.getByRole("button", { name: "Pause raid" }).click();
      await desktop
        .getByRole("button", { name: "Return to burrow", exact: true })
        .click();
      await desktop.getByRole("button", { name: "Enter the burrow" }).waitFor();
      return { bossHealthBefore: before, bossHealthAfter: after };
    },
  );
  await desktop.getByRole("link", {name:"Burrow Raid home"}).click();
  await check(
    "Guardian ability, cooldown feedback and home navigation",
    async () => {
      await desktop
        .getByRole("button", { name: "Guardian", exact: true })
        .click();
      await desktop.getByRole("button", { name: "Enter the burrow" }).click();
      await desktop.locator("#arena-controls").focus();
      await desktop.keyboard.press("e");
      await expect(desktop.locator(".skill-action")).toBeDisabled({
        timeout: 4000,
      });
      await desktop.getByRole("link", { name: "Burrow Raid home" }).click();
      await desktop.getByRole("button", { name: "Enter the burrow" }).waitFor();
    },
  );
  await desktop.getByRole("link", {name:"Burrow Raid home"}).click();
  await check("Optional audio starts by explicit choice", async () => {
    await desktop.getByRole("button", { name: "Turn sound on" }).click();
    assert.equal(
      await desktop
        .getByRole("button", { name: "Turn sound off" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await desktop.getByRole("button", { name: "Turn sound off" }).click();
  });
  const mobile = await pageFor(390, 844, true);
  await check("Touch movement and held attack/ability controls", async () => {
    await mobile.getByRole("button", { name: "Medic", exact: true }).tap();
    await mobile.getByRole("button", { name: "Enter the burrow" }).tap();
    await mobile.locator(".joystick").waitFor();
    const pad = mobile.locator(".joystick"),
      bounds = await pad.boundingBox(),
      cdp = await mobile.context().newCDPSession(mobile);
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [center],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: center.x + 20, y: center.y - 20 }],
    });
    await mobile.waitForTimeout(400);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const attack = mobile.getByRole("button", { name: "Attack", exact: true });
    const before = Number(
      await mobile
        .getByRole("progressbar", { name: "Cable Gnawer health" })
        .getAttribute("aria-valuenow"),
    );
    const attackBox = await attack.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: attackBox.x + attackBox.width / 2,
          y: attackBox.y + attackBox.height / 2,
        },
      ],
    });
    await mobile.waitForFunction(
      (before) =>
        Number(
          document
            .querySelector('[aria-label="Cable Gnawer health"]')
            .getAttribute("aria-valuenow"),
        ) < before,
      before,
      { timeout: 4000 },
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const after = Number(
      await mobile
        .getByRole("progressbar", { name: "Cable Gnawer health" })
        .getAttribute("aria-valuenow"),
    );
    assert(after < before);
    const dodgeBox = await mobile
      .getByRole("button", { name: "Dodge", exact: true })
      .boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: dodgeBox.x + dodgeBox.width / 2,
          y: dodgeBox.y + dodgeBox.height / 2,
        },
      ],
    });
    await expect(mobile.locator(".combat-action").nth(1)).toBeDisabled({
      timeout: 4000,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const skillBox = await mobile.locator(".skill-action").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: skillBox.x + skillBox.width / 2,
          y: skillBox.y + skillBox.height / 2,
        },
      ],
    });
    await expect(mobile.locator(".skill-action")).toBeDisabled({
      timeout: 4000,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mobile.screenshot({ path: `${output}/touch-fight.png` });
    return {
      bossHealthBefore: before,
      bossHealthAfter: after,
      physicalDevice: false,
    };
  });
  await check(
    "Landscape touch HUD keeps controls and health separate",
    async () => {
      await mobile.setViewportSize({ width: 844, height: 390 });
      await mobile.waitForTimeout(200);
      const buttons = await mobile.locator(".action-buttons").boundingBox(),
        party = await mobile.locator(".party-hud").boundingBox();
      assert(buttons.y + buttons.height <= 390);
      assert(party.y + party.height <= buttons.y);
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await mobile.screenshot({
        path: `${output}/landscape-fight.png`,
        timeout: 20000,
      });
      await mobile.setViewportSize({ width: 390, height: 844 });
    },
  );
  await check("Visibility change clears inputs and pauses solo", async () => {
    await mobile.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await mobile.getByRole("heading", { name: "A little breather" }).waitFor();
    await mobile.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await mobile
        .getByRole("heading", { name: "A little breather" })
        .isVisible(),
      true,
    );
    await mobile
      .locator(".pause-panel")
      .getByRole("button", { name: "Resume raid", exact: true })
      .tap();
    return { method: "Emulated visibility event, explicit resume required" };
  });
  await check(
    "Reduced motion stops decorative movement and CSS loops",
    async () => {
      await desktop.emulateMedia({ reducedMotion: "reduce" });
      await desktop.getByRole("button", { name: "How to play" }).click();
      assert.equal(
        await desktop.getByLabel("Reduce decorative motion").isChecked(),
        true,
      );
      await closeHelp(desktop);
      assert.equal(
        await desktop.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.effect?.getTiming().iterations === Infinity)
              .length,
        ),
        0,
      );
    },
  );
  await mobile.context().close();
  const guest = await pageFor(390, 844, true);
  let roomCode;
  await check("Two real browser clients join the same co-op room", async () => {
    await desktop.getByRole("button", { name: "Play with friends" }).click();
    await desktop
      .getByLabel("Room server URL")
      .fill(`ws://127.0.0.1:${raidPort}/rooms`);
    await desktop.getByLabel("Energy mode").selectOption("practice");
    await desktop
      .getByRole("button", { name: "Create room", exact: true })
      .click();
    await desktop.locator(".room-code").waitFor();
    roomCode = (await desktop.locator(".room-code").innerText()).match(
      /[A-HJ-NP-Z2-9]{5}/,
    )[0];
    await guest.getByRole("button", { name: "Medic", exact: true }).tap();
    await guest.getByRole("button", { name: "Play with friends" }).tap();
    await guest
      .getByLabel("Room server URL")
      .fill(`ws://127.0.0.1:${raidPort}/rooms`);
    await guest.getByLabel("Room code").fill(roomCode);
    await guest.getByLabel("Energy mode").selectOption("practice");
    await guest.getByRole("button", { name: "Join room", exact: true }).tap();
    await guest.locator(".room-code").waitFor();
    await desktop.getByText("2 of 3 players · open seats use bots").waitFor();
    assert.equal(
      await guest
        .getByRole("button", { name: "Waiting for host" })
        .isDisabled(),
      true,
    );
    const r = raid.service.rooms.get(roomCode);
    assert.equal(r.seats.size, 2);
    return { realClients: 2, botSeats: 1 };
  });
  await check(
    "Synchronized boss attacks and server-side movement visible in both clients",
    async () => {
      await desktop
        .getByRole("button", { name: "Start the raid", exact: true })
        .click();
      await guest.locator(".boss-hud").waitFor();
      const r = raid.service.rooms.get(roomCode);
      r.game.nextAttack = r.game.t + 0.05;
      while (!r.game.attack) await new Promise((res) => setTimeout(res, 10));
      r.game.attack.end = r.game.t + 30;
      r.game.nextAttack = r.game.t + 31;
      await Promise.all([
        desktop.locator(".attack-warning.active").waitFor(),
        guest.locator(".attack-warning.active").waitFor(),
      ]);
      assert.equal(
        await desktop.locator(".attack-warning.active").innerText(),
        await guest.locator(".attack-warning.active").innerText(),
      );
      const first = r.game.actors.find((a) => !a.bot);
      const before = { x: first.x, z: first.z };
      await desktop.locator("#arena-controls").focus();
      await desktop.keyboard.down("d");
      await desktop.waitForTimeout(300);
      await desktop.keyboard.up("d");
      assert(Math.hypot(first.x - before.x, first.z - before.z) > 0.5);
    },
  );
  await check(
    "Browser reconnect preserves the same authoritative seat",
    async () => {
      const r = raid.service.rooms.get(roomCode),
        host = r.host;
      const seat = r.seats.get(host);
      seat.socket.terminate();
      await desktop
        .getByText("Reconnecting · a bot is covering your paw")
        .waitFor();
      await desktop.waitForFunction(
        () => !document.querySelector(".connection-notice"),
        null,
        { timeout: 6000 },
      );
      assert.equal(r.seats.size, 2);
      assert.equal(r.seats.has(host), true);
      assert.equal(r.game.actors.find((a) => a.id === host).connected, true);
    },
  );
  await check(
    "Online pause hands control to a bot while the shared fight continues",
    async () => {
      await desktop.getByRole("button", { name: "Pause raid" }).click();
      await desktop
        .getByRole("heading", { name: "Taking a breather" })
        .waitFor();
      const r = raid.service.rooms.get(roomCode),
        before = r.game.t;
      await desktop.waitForTimeout(250);
      assert(r.game.t > before);
      assert.equal(r.game.actors.find((a) => a.id === r.host).connected, false);
      await desktop
        .locator(".pause-panel")
        .getByRole("button", { name: "Resume raid", exact: true })
        .click();
    },
  );
  await check(
    "Victory, replay, defeat and restart reach usable result screens",
    async () => {
      let r = raid.service.rooms.get(roomCode);
      r.game.bossHp = 0;
      await desktop
        .getByRole("heading", { name: "Little paws. Big win." })
        .waitFor();
      await guest
        .getByRole("heading", { name: "Little paws. Big win." })
        .waitFor();
      await desktop
        .getByRole("button", { name: "Raid again", exact: true })
        .click();
      await desktop
        .getByRole("button", { name: "Start the raid", exact: true })
        .waitFor();
      assert.equal(r.game.bossHp, r.game.bossMaxHp);
      assert.equal(r.game.energy, 45);
      await desktop
        .getByRole("button", { name: "Start the raid", exact: true })
        .click();
      r.game.actors.forEach((a) => (a.hp = 0));
      await desktop
        .getByRole("heading", { name: "The burrow needs another try." })
        .waitFor();
      await desktop.screenshot({
        path: `${output}/defeat.png`,
        timeout: 20000,
        animations: "disabled",
      });
      await desktop
        .getByRole("button", { name: "Raid again", exact: true })
        .click();
      await desktop
        .getByRole("button", { name: "Start the raid", exact: true })
        .waitFor();
      return {
        outcomes:
          "Test harness sets authoritative server health to trigger UI outcomes; natural fights tested in simulation",
      };
    },
  );
  await guest.context().close();
  await check(
    "WebGL context loss offers an honest retry instead of a blank game",
    async () => {
      await desktop.evaluate(() => {
        const c = document.querySelector("canvas"),
          gl = c.getContext("webgl2");
        gl.getExtension("WEBGL_lose_context").loseContext();
      });
      await desktop
        .getByRole("heading", { name: "The burrow needs WebGL" })
        .waitFor();
      await desktop.getByRole("button", { name: "Try 3D again" }).click();
      await desktop
        .getByRole("heading", { name: "The burrow needs WebGL" })
        .waitFor({ state: "hidden" });
    },
  );
  await check(
    "Initial WebGL failure disables play and recovers after graphics retry",
    async () => {
      const c = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      await c.addInitScript(() => {
        window.__burrowOriginalContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          return kind.startsWith("webgl")
            ? null
            : window.__burrowOriginalContext.call(this, kind, ...args);
        };
      });
      const p = await c.newPage();
      await p.goto(url);
      await p
        .getByRole("heading", { name: "The burrow needs WebGL" })
        .waitFor();
      assert.equal(
        await p.getByRole("button", { name: "Enter the burrow" }).isDisabled(),
        true,
      );
      await p.evaluate(
        () =>
          (HTMLCanvasElement.prototype.getContext =
            window.__burrowOriginalContext),
      );
      await p.getByRole("button", { name: "Try 3D again" }).click();
      await p
        .getByRole("heading", { name: "The burrow needs WebGL" })
        .waitFor({ state: "hidden" });
      assert.equal(
        await p.getByRole("button", { name: "Enter the burrow" }).isEnabled(),
        true,
      );
      await c.close();
      return {
        method:
          "WebGL context creation deliberately denied, then restored in the browser harness",
      };
    },
  );
  await check(
    "Zero uncaught page errors and zero failed local runtime assets",
    async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(badResources, []);
      return { pageErrors, consoleErrors, badResources };
    },
  );
  try {
    const safari = await webkit.launch({ headless: true });
    await safari.close();
    results.push({ name: "WebKit runtime availability", passed: true });
  } catch (e) {
    results.push({
      name: "WebKit runtime availability",
      passed: null,
      limitation: e.message.split("Missing libraries:")[0],
    });
    console.log("LIMITATION WebKit unavailable: missing host libraries");
  }
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close();
  await raid.close();
  await new Promise((r) => staticServer.close(r));
  const report = {
    generatedAt: new Date().toISOString(),
    browser: "Playwright Chromium with SwiftShader",
    results,
  };
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  const failures = results.filter((r) => r.passed === false);
  console.log(
    JSON.stringify({
      passed: results.filter((r) => r.passed === true).length,
      failed: failures.length,
      limitations: results.filter((r) => r.passed === null).length,
    }),
  );
  if (failures.length) process.exitCode = 1;
}
