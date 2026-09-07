# claude-code-win32

> **Claude Code Plugin** that makes the `Bash` tool work cleanly on Windows. POSIX-safe commands pass straight through to Git Bash; Unix idioms get rewritten to their PowerShell equivalents; MSYS drive paths (`/c/…`) become `C:/…` when routed to PS; Unix-only commands are denied with a specific hint pointing Claude at the Windows-native alternative.

[![npm](https://img.shields.io/npm/v/claude-code-win32)](https://www.npmjs.com/package/claude-code-win32)
[![license](https://img.shields.io/npm/l/claude-code-win32)](LICENSE)

On macOS and Linux the hook checks `process.platform` first and no-ops immediately — the original Bash command runs unchanged. Safe to install on any host.

## What You Get

- **No more "bash: command not found" on Windows** — Claude's `Bash` calls just work.
- **Zero-overhead fast path** — POSIX-safe commands (`git`, `npm`, `grep`, `sed`, `jq`, …) stay in Git Bash; PowerShell startup is only paid when needed. Unknown binaries stay there too — Git Bash sees more `PATH` than PowerShell does.
- **Targeted PS rewrites** — `xdg-open`, `pbcopy`, `uname`, `df`, `free`, and friends map to clean PowerShell equivalents.
- **MSYS drive-path translation** — `/c/Users/foo` → `C:/Users/foo` when the segment is routed to PS. URL-safe, packed-flag-aware (`-I/c/include` works), quote-aware.
- **Smart denial with hints** — `sudo`, `systemctl`, `apt`, `chmod`, etc. don't silently fail; Claude is told what to use instead (`Start-Process -Verb RunAs`, `Get-Service`, `winget`, `icacls`, …).
- **PS 5.1 ↔ PS 7 aware** — `&&`/`||` are used natively on PS 7, denied on PS 5.1 with a pointer to `https://aka.ms/powershell`.
- **Silent on errors** — internal transpiler bugs never block Claude; the original command runs.

## Install

### As a Claude Code plugin

From the Claude Code REPL:

```
/plugin marketplace add hmennen90/claude-code-win32
/plugin install claude-code-win32@claude-code-win32
/reload-plugins
```

Or against a local checkout (development):

```
/plugin marketplace add /absolute/path/to/claude-code-win32
/plugin install claude-code-win32@claude-code-win32
```

### From npm

```bash
npm install claude-code-win32
```

After install:

- **Library use** — `import { transpile } from "claude-code-win32"` (also `claude-code-win32/paths`, `claude-code-win32/chain`).
- **Standalone hook binary** — `claude-code-win32-hook` is on the `bin` path. Wire it into your own `hooks.json` directly if you prefer that to a Claude Code marketplace install.

## How it works

Registers a `PreToolUse` hook on the `Bash` tool. For each command:

1. **Platform gate** — `process.platform !== "win32"` → no-op.
2. **Shell detection** — probes for `pwsh` (PS 7+), falls back to `powershell.exe` (5.1). Cached 24h under `~/.claude/plugins/claude-code-win32.state.json`.
3. **Chain parse** — quote- and paren-aware split at `|`, `&&`, `||`, `;`, `&`. Redirect tokens (`2>&1`, `1>&2`, `&>file`, `&>>file`) are recognised and **not** misclassified as chain operators.
4. **Per-segment classification**:
   - **passthrough** — external `.exe` / POSIX allowlist (git, node, npm, docker, grep, sed, awk, jq, rg, …). **An unknown binary also passes through**: the allowlist can never be complete, and Git Bash resolves both the Windows `PATH` and the MSYS `/usr/bin` tree, while PowerShell only sees the former. Only PowerShell-shaped names (`Verb-Noun` cmdlets, `*.ps1`) are routed to PS.
   - **rewrite** — known Unix idiom with a clean PowerShell equivalent (`xdg-open`, `pbcopy`, `whoami`, `uname`, `df`, `free`, …)
   - **deny** — Unix-only with no Windows equivalent (package managers, `systemctl`, `sudo`, `chmod`, `dmesg`, `iptables`, …)
5. **Deny gates**:
   - Any segment is Unix-only → deny with a per-command hint pointing Claude at the Windows-native alternative.
   - `&&` / `||` present AND detected shell is PS 5.1 → deny with `https://aka.ms/powershell` install link.
6. **Pass fast-path** — all segments Git-Bash-safe (allowlisted or unknown), no rewrite needed, `preferPowerShell=false` → allow unchanged (avoids PS 100–500 ms startup).
7. **MSYS path translation** — for segments routed to PowerShell, leading `/c/`, `/d/`, … prefixes are rewritten to `C:/`, `D:/`, …. Boundary-aware: URLs (`https://…`), UNC paths (`//server/share`), `file:///c/…`, and single-quoted literals are left intact. Packed compiler flags like `-I/c/include`, `-Wl,/c/lib`, `-isystem/c/sys` are recognised and translated.
8. **Strategy A rewrite** — rebuild the chain in PowerShell syntax (`&&`/`||` native on PS 7; trailing `&` → `Start-Job`), prepend `$ProgressPreference='SilentlyContinue';` to suppress CLIXML progress noise on PS 5.1, wrap in `<exe>.exe -NoProfile -NonInteractive -EncodedCommand <base64>`.

## Configuration (env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `WIN32_TRANSPILE` | `1` | Master switch. |
| `WIN32_TRANSPILE_ASSUME_GIT_BASH` | `1` | If `1`, POSIX-safe segments pass through. |
| `WIN32_TRANSPILE_PREFER_PS` | `0` | If `1`, route *everything* via PowerShell (no Git Bash fast-path). |
| `WIN32_TRANSPILE_POSIX_SAFE` | — | Extra binaries to treat as passthrough. |
| `WIN32_TRANSPILE_FORCE_PS` | — | Extra binaries to always route via PowerShell. |
| `WIN32_TRANSPILE_DENY` | — | Extra binaries to deny outright. |

## Develop

```bash
git clone https://github.com/hmennen90/claude-code-win32
cd claude-code-win32
npm install
npm run build
npm test
```

CI runs the suite on Node 20/22/24 across ubuntu-latest **and** windows-latest, and
checks that `package.json`, `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` carry the same version.

### Cutting a release

```bash
npm version <patch|minor|major>   # bumps package.json, syncs plugin/marketplace, tags, pushes
```

The `v*.*.*` tag triggers `.github/workflows/release.yml`: it builds and tests on
Linux and Windows, verifies the tag matches `package.json`, creates the GitHub
release with generated notes, and publishes to npm with provenance. The npm step is
skipped (not failed) when no `NPM_TOKEN` secret is configured.

## Status

**v0.1.0** — initial release. 40 unit tests, live verified on PS 5.1 (Windows 11).

Known limitation: nested commands under `xargs foo` are classified on the outer binary only. `sudo` is on the deny-list, so the most common case is already covered.

### Troubleshooting

**`jq: command not found` (or any tool that works in Git Bash but not through the hook).**
Fixed in v0.1.2. Before that, any binary missing from the POSIX allowlist pulled the
*entire* chain into PowerShell — including the `grep`/`sed`/`cat` segments around it.
PowerShell does not see the MSYS `/usr/bin` tree, so a perfectly installed `jq` reported
as missing. Unknown binaries now stay in Git Bash. If a tool is genuinely not installed,
install it on the Windows `PATH` (`winget install jqlang.jq`, `scoop install jq`).
