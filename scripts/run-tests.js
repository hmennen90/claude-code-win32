#!/usr/bin/env node

/**
 * Runs the compiled test files under dist/test.
 *
 * Neither a shell glob (`dist/test/*.test.js`) nor a bare directory argument
 * works everywhere: cmd.exe does not expand globs, so the glob form breaks on
 * the Windows runners, and `node --test dist/test` is only accepted by Node 20 —
 * 22 and 24 try to load the directory as a module. Listing the files here works
 * on every supported version and platform.
 */

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "dist", "test");

const files = readdirSync(testDir)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => join(testDir, f));

if (files.length === 0) {
  console.error(`No compiled tests found in ${testDir} — did 'tsc' run?`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
