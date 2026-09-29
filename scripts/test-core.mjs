import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const tests = (await readdir("tests", { recursive: true }))
  .filter((file) => file.endsWith(".test.ts"))
  .sort();
if (!tests.length) throw new Error("No tests found in tests/**/*.test.ts");

await build({
  entryPoints: tests.map((file) => join("tests", file)),
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  outbase: "tests",
  outdir: "work/tests",
  outExtension: { ".js": ".cjs" },
});
const result = spawnSync(
  process.execPath,
  ["--test", ...tests.map((file) => join("work/tests", file.replace(/\.ts$/, ".cjs")))],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
