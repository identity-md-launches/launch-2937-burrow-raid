import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const path = resolve(
      "dist",
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(resolve("dist") + "/")) throw new Error();
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(path));
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
  const p = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await p.goto(`http://127.0.0.1:${server.address().port}/`);
  await p.evaluate(() => document.fonts.ready);
  await p.locator("canvas").waitFor();
  await p.addStyleTag({
    content:
      ".app{height:630px;min-height:630px;grid-template-rows:78px 1fr 32px}main{min-height:520px}.header{padding-block:16px}.lobby-panel{padding-block:10px;transform:scale(.83);transform-origin:top left}.scene-shell{inset:-25px -50px -35px 160px}.boss-intro{bottom:13%}.scene-note,.footer{display:none}",
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: "public/social.png" });
  console.log(
    "Generated public/social.png, 1200×630, from the original rendered game.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
