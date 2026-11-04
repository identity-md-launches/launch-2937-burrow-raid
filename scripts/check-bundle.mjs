import { readdir, readFile, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
const limit = 8388608,
  report = "artifacts/bundle-size.json";
const roots = [
  "src",
  "shared",
  "server",
  "scripts",
  "tests",
  "public",
  "dist",
  "server-build",
  "artifacts",
];
const files = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "index.html",
  "README.md",
  "DESIGN.md",
  "LICENSE",
];
const groups = {};
let base = 0,
  count = 0;
async function countFile(path, group) {
  if (path === report) return;
  const s = await lstat(path);
  if (s.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
  if (s.isDirectory()) {
    for (const name of await readdir(path)) {
      if (
        ["node_modules", ".cache", ".vite", ".npm", ".git"].includes(name) ||
        name.endsWith(".tgz")
      )
        throw new Error(
          `Dependency or packaging artifact in delivery: ${join(path, name)}`,
        );
      await countFile(join(path, name), group);
    }
    return;
  }
  base += s.size;
  groups[group] = (groups[group] || 0) + s.size;
  count++;
}
for (const root of roots) await countFile(root, root);
for (const file of files) await countFile(file, "root files");
const ignores = await readFile(".gitignore", "utf8");
for (const pattern of [
  "**/node_modules/",
  "**/.cache/",
  "**/.vite/",
  "test/scratch/",
])
  if (!ignores.includes(pattern))
    throw new Error(`Missing nested exclusion: ${pattern}`);
let size = 0,
  json = "";
for (let i = 0; i < 5; i++) {
  json =
    JSON.stringify(
      {
        limitBytes: limit,
        totalBytes: base + size,
        remainingBytes: limit - base - size,
        fileCount: count + 1,
        groups: { ...groups, artifacts: (groups.artifacts || 0) + size },
        includesThisReport: true,
        dependencyArchives: 0,
        submodules: 0,
      },
      null,
      2,
    ) + "\n";
  size = Buffer.byteLength(json);
}
await writeFile(report, json);
console.log(json);
if (base + size > limit) process.exitCode = 1;
