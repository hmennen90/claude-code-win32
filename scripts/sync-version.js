#!/usr/bin/env node

/**
 * Syncs the version from package.json to plugin.json and marketplace.json.
 * Run automatically via the `version` npm lifecycle hook.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));

const pluginPath = join(root, ".claude-plugin", "plugin.json");
const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
if (plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n");
  console.log(`Synced plugin.json version to ${pkg.version}`);
}

const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
const marketplace = JSON.parse(readFileSync(marketplacePath, "utf-8"));
let updated = false;
for (const p of marketplace.plugins) {
  if (p.version !== pkg.version) {
    p.version = pkg.version;
    updated = true;
  }
}
if (updated) {
  writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n");
  console.log(`Synced marketplace.json version to ${pkg.version}`);
}
