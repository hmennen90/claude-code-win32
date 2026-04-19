import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../transpile.js";
import { loadConfig } from "../config.js";
import { PSEdition } from "../types.js";

const cfg = loadConfig({} as NodeJS.ProcessEnv);
const ps7: PSEdition = { exe: "pwsh", major: 7 };
const ps51: PSEdition = { exe: "powershell", major: 5 };

const decodeEncodedCommand = (fullCmd: string): string => {
  const m = fullCmd.match(/-EncodedCommand\s+(\S+)/);
  if (!m) throw new Error(`no -EncodedCommand in: ${fullCmd}`);
  return Buffer.from(m[1], "base64").toString("utf16le");
};

describe("transpile — pass-through", () => {
  it("leaves git commands untouched", () => {
    const v = transpile("git status", cfg, ps7);
    assert.equal(v.kind, "pass");
  });

  it("leaves POSIX-safe pipelines untouched", () => {
    const v = transpile("cat package.json | grep version | head -n 1", cfg, ps7);
    assert.equal(v.kind, "pass");
  });

  it("leaves chained developer tools alone", () => {
    const v = transpile("git pull && npm ci && npm test", cfg, ps7);
    assert.equal(v.kind, "pass");
  });

  it("leaves trailing background ops untouched when safe", () => {
    const v = transpile("npm run dev &", cfg, ps7);
    assert.equal(v.kind, "pass");
  });

  it("treats `&` inside `2>&1` as redirect, not chain op, on PS 5.1", () => {
    const v = transpile("npm run build 2>&1 | tail", cfg, ps51);
    assert.equal(v.kind, "pass");
  });

  it("treats leading `&>` merge redirect as redirect, not chain op", () => {
    const v = transpile("npm run build &>build.log", cfg, ps51);
    assert.equal(v.kind, "pass");
  });
});

describe("transpile — deny for Unix-only-no-equivalent", () => {
  it("denies apt and names offender with hint", () => {
    const v = transpile("apt update && apt install nginx", cfg, ps7);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.deepEqual(v.offenders, ["apt"]);
    assert.match(v.reason, /winget|choco/i);
  });

  it("denies systemctl with Get-Service hint", () => {
    const v = transpile("systemctl restart nginx", cfg, ps7);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.match(v.reason, /Get-Service|sc\.exe/);
  });

  it("denies sudo with runas hint", () => {
    const v = transpile("sudo apt update", cfg, ps7);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.match(v.reason, /Administrator|RunAs/i);
  });

  it("denies chmod pointing at icacls", () => {
    const v = transpile("chmod 755 script.sh", cfg, ps7);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.match(v.reason, /icacls|Set-Acl/);
  });

  it("denies mixed chain with one Unix-only segment", () => {
    const v = transpile("git status | grep foo && systemctl reload nginx", cfg, ps7);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.deepEqual(v.offenders, ["systemctl"]);
  });

  it("honors extraDeny override", () => {
    const custom = { ...cfg, extraDeny: ["git"] };
    const v = transpile("git status", custom, ps7);
    assert.equal(v.kind, "deny");
  });
});

describe("transpile — PS 5.1 chain-op gate", () => {
  it("denies && on PS 5.1 with download link", () => {
    const v = transpile("git pull && npm ci", cfg, ps51);
    assert.equal(v.kind, "deny");
    if (v.kind !== "deny") return;
    assert.match(v.reason, /PowerShell 7|aka\.ms\/powershell/);
    assert.ok(v.offenders?.includes("&&"));
  });

  it("denies || on PS 5.1", () => {
    // Force PS routing so this isn't satisfied by pass-through.
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("test -f README.md || echo missing", custom, ps51);
    assert.equal(v.kind, "deny");
  });

  it("allows && on PS 7", () => {
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("git pull && npm ci", custom, ps7);
    assert.equal(v.kind, "rewrite");
    if (v.kind !== "rewrite") return;
    const decoded = decodeEncodedCommand(v.command!);
    assert.match(decoded, /&&/);
  });

  it("allows pipes on PS 5.1 (no chain-op parse issue)", () => {
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("cat a | grep b", custom, ps51);
    assert.notEqual(v.kind, "deny");
  });
});

describe("transpile — Strategy A per-segment rewrite", () => {
  it("rewrites standalone xdg-open via Start-Process", () => {
    const v = transpile("xdg-open https://example.com", cfg, ps7);
    assert.equal(v.kind, "rewrite");
    if (v.kind !== "rewrite") return;
    const decoded = decodeEncodedCommand(v.command!);
    assert.match(decoded, /Start-Process/);
    assert.match(decoded, /example\.com/);
  });

  it("rewrites a segment inside a chain while passing external .exes through", () => {
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("xdg-open https://a.com ; git status", custom, ps7);
    assert.equal(v.kind, "rewrite");
    if (v.kind !== "rewrite") return;
    const decoded = decodeEncodedCommand(v.command!);
    assert.match(decoded, /Start-Process/);
    assert.match(decoded, /git status/);
    assert.match(decoded, /;/);
  });

  it("wraps trailing & as Start-Job", () => {
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("npm run dev &", custom, ps7);
    assert.equal(v.kind, "rewrite");
    if (v.kind !== "rewrite") return;
    const decoded = decodeEncodedCommand(v.command!);
    assert.match(decoded, /Start-Job/);
  });

  it("routes via pwsh when preferPowerShell is set, even if all safe", () => {
    const custom = { ...cfg, preferPowerShell: true };
    const v = transpile("git status", custom, ps7);
    assert.equal(v.kind, "rewrite");
    if (v.kind !== "rewrite") return;
    assert.match(v.command!, /pwsh\.exe/);
  });
});

describe("transpile — config toggles", () => {
  it("respects extraPosixSafe", () => {
    const custom = { ...cfg, extraPosixSafe: ["mytool"] };
    const v = transpile("mytool --run", custom, ps7);
    assert.equal(v.kind, "pass");
  });

  it("respects extraForcePowerShell", () => {
    const custom = { ...cfg, extraForcePowerShell: ["git"] };
    const v = transpile("git status", custom, ps7);
    assert.equal(v.kind, "rewrite");
  });
});
