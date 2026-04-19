import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PSEdition } from "./types.js";

const CACHE_PATH = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "claude-code-win32.state.json",
);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheFile {
  ts: number;
  edition: PSEdition;
}

const readCache = (): PSEdition | null => {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed: CacheFile = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_TTL_MS) return parsed.edition;
  } catch {
    /* ignore */
  }
  return null;
};

const writeCache = (edition: PSEdition): void => {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const data: CacheFile = { ts: Date.now(), edition };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
  } catch {
    /* best-effort */
  }
};

const probe = (exe: "pwsh" | "powershell"): number | null => {
  const res = spawnSync(
    `${exe}.exe`,
    ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.Major"],
    { encoding: "utf8", timeout: 5000, windowsHide: true },
  );
  if (res.status !== 0) return null;
  const n = parseInt(String(res.stdout).trim(), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Detect the best available PowerShell edition. Prefers pwsh (7+), falls back
 * to the bundled powershell.exe (typically 5.1 on Windows). Result is cached
 * for 24h under ~/.claude/plugins/.
 */
export const detectPowerShell = (): PSEdition => {
  const cached = readCache();
  if (cached) return cached;

  const pwshMajor = probe("pwsh");
  if (pwshMajor !== null) {
    const edition: PSEdition = { exe: "pwsh", major: pwshMajor };
    writeCache(edition);
    return edition;
  }

  const psMajor = probe("powershell");
  if (psMajor !== null) {
    const edition: PSEdition = { exe: "powershell", major: psMajor };
    writeCache(edition);
    return edition;
  }

  // Assume the worst: Windows PowerShell 5.1 is always present on Windows 10+.
  return { exe: "powershell", major: 5 };
};
