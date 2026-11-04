import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
await mkdir("test/scratch/screenshots", { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    ).replace(/^\/preview\//, "");
    const path = resolve("dist", p || "index.html");
    if (!path.startsWith(resolve("dist") + "/")) throw new Error();
    const body = await readFile(path);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test/scratch/screenshots/desktop.png" });
  console.log(
    JSON.stringify({
      width: 1440,
      errors,
      bodyWidth: await page.evaluate(() => document.body.scrollWidth),
      canvas: await page.locator("canvas").count(),
      webglError: await page.getByText("The burrow needs WebGL").count(),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "test/scratch/screenshots/mobile.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      width: 390,
      bodyWidth: await page.evaluate(() => document.body.scrollWidth),
      action: await page
        .getByRole("button", { name: "Enter the burrow" })
        .boundingBox(),
    }),
  );
  await page.getByRole("button", { name: "Enter the burrow" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test/scratch/screenshots/fight.png" });
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
