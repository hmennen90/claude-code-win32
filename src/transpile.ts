import { parseChain, renderPowerShellChain, ChainOp } from "./chain.js";
import { parseCommand } from "./parser.js";
import { translateMsysPaths } from "./paths.js";
import {
  POSIX_SAFE_BINS,
  UNIX_ONLY_NO_EQUIVALENT,
  denyHint,
  tryRewriteSingle,
} from "./rewriters.js";
import { PSEdition, TranspileConfig, TranspileResult } from "./types.js";

type SegmentClass =
  | { kind: "passthrough"; bin: string; segment: string }
  | { kind: "rewrite"; bin: string; ps: string; segment: string }
  | { kind: "deny"; bin: string; segment: string; hint: string };

const classify = (segment: string, cfg: TranspileConfig): SegmentClass => {
  const parsed = parseCommand(segment);
  const bin = parsed.leadingBin;

  if (cfg.extraDeny.includes(bin) || UNIX_ONLY_NO_EQUIVALENT.has(bin)) {
    return { kind: "deny", bin, segment, hint: denyHint(bin) };
  }

  const ps = tryRewriteSingle(parsed);
  if (ps) return { kind: "rewrite", bin, ps, segment };

  return { kind: "passthrough", bin, segment };
};

const encodePowerShell = (psCommand: string, exe: "pwsh" | "powershell"): string => {
  const prefixed = `$ProgressPreference='SilentlyContinue';${psCommand}`;
  const encoded = Buffer.from(prefixed, "utf16le").toString("base64");
  return `${exe}.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
};

const binIsGitBashSafe = (bin: string, cfg: TranspileConfig): boolean => {
  if (cfg.extraForcePowerShell.includes(bin)) return false;
  if (cfg.extraPosixSafe.includes(bin)) return true;
  return POSIX_SAFE_BINS.has(bin);
};

export const transpile = (
  command: string,
  cfg: TranspileConfig,
  ps: PSEdition,
): TranspileResult => {
  const nodes = parseChain(command);
  if (nodes.length === 0) {
    return { kind: "pass", reason: "empty command" };
  }

  const classes = nodes.map((n) => classify(n.segment, cfg));
  const ops: (ChainOp | undefined)[] = nodes.map((n) => n.opAfter);

  // Deny gate 1: any segment is a Unix-only command without a Windows equivalent.
  const denied = classes.filter((c): c is Extract<SegmentClass, { kind: "deny" }> => c.kind === "deny");
  if (denied.length > 0) {
    const offenders = Array.from(new Set(denied.map((d) => d.bin)));
    const hints = Array.from(new Set(denied.map((d) => `'${d.bin}': ${d.hint}`)));
    return {
      kind: "deny",
      reason: `win32-transpile: command contains Unix-only tool(s) with no Windows equivalent: ${offenders.join(", ")}. ${hints.join(" ")}`,
      offenders,
    };
  }

  // Deny gate 2: &&/|| on PS 5.1 (parse-error in Windows PowerShell).
  const hasChainOp = ops.some((o) => o === "&&" || o === "||");
  if (hasChainOp && ps.major < 7) {
    const used = Array.from(new Set(ops.filter((o): o is "&&" | "||" => o === "&&" || o === "||")));
    return {
      kind: "deny",
      reason:
        `win32-transpile: pipeline chain operators ${used.join(" / ")} require PowerShell 7+. Detected: ${ps.exe} v${ps.major}. ` +
        `Install PowerShell 7 from https://aka.ms/powershell, or rewrite the chain using '; if ($LASTEXITCODE -eq 0) { ... }' style manually.`,
      offenders: used,
    };
  }

  // Pass-through fast path: every segment Git-Bash-safe, no rewrite needed, and user hasn't forced PS.
  const allGitBashSafe = classes.every(
    (c) => c.kind === "passthrough" && binIsGitBashSafe(c.bin, cfg),
  );
  if (cfg.assumeGitBash && !cfg.preferPowerShell && allGitBashSafe) {
    const bins = classes.map((c) => c.bin).join(", ");
    return { kind: "pass", reason: `all segments POSIX-safe under Git Bash: ${bins}` };
  }

  // Strategy A: per-segment PS chain. Translate MSYS drive prefixes
  // (/c/... → C:/...) since PowerShell doesn't understand the Git-Bash form.
  const psSegments = classes.map((c) => {
    const text = c.kind === "rewrite" ? c.ps : c.segment;
    return translateMsysPaths(text);
  });

  const psCommand = renderPowerShellChain(psSegments, ops, ps.major);
  const finalCommand = encodePowerShell(psCommand, ps.exe);

  const warnings: string[] = [];
  const rewrittenCount = classes.filter((c) => c.kind === "rewrite").length;
  const summary =
    rewrittenCount > 0
      ? `Strategy A via ${ps.exe} v${ps.major}: rewrote ${rewrittenCount}/${classes.length} segments`
      : `routed via ${ps.exe} v${ps.major}`;

  return {
    kind: "rewrite",
    command: finalCommand,
    reason: `win32-transpile: ${summary}`,
    warnings,
  };
};
