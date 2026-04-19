#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { detectPowerShell } from "./shell-detect.js";
import { transpile } from "./transpile.js";
import { HookInput, PreToolUseOutput } from "./types.js";

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const emit = (out: PreToolUseOutput | null): void => {
  if (out) process.stdout.write(JSON.stringify(out));
  process.exit(0);
};

const main = async (): Promise<void> => {
  if (process.platform !== "win32") {
    emit(null);
    return;
  }

  const cfg = loadConfig();
  if (!cfg.enabled) {
    emit(null);
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    emit(null);
    return;
  }

  let payload: HookInput;
  try {
    payload = JSON.parse(raw);
  } catch {
    emit(null);
    return;
  }

  if (payload.tool_name !== "Bash" || !payload.tool_input?.command) {
    emit(null);
    return;
  }

  const ps = detectPowerShell();
  const verdict = transpile(payload.tool_input.command, cfg, ps);

  if (verdict.kind === "pass") {
    emit({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `win32-transpile: pass (${verdict.reason})`,
      },
    });
    return;
  }

  if (verdict.kind === "deny") {
    emit({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: verdict.reason,
      },
    });
    return;
  }

  // kind === "rewrite"
  const reasonParts = [verdict.reason];
  if (verdict.warnings?.length) {
    reasonParts.push(`WARN: ${verdict.warnings.join("; ")}`);
  }

  const prevDescription = payload.tool_input.description;
  const nextDescription = prevDescription
    ? `${prevDescription} [win32-transpile:rewrite]`
    : `[win32-transpile:rewrite]`;

  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: reasonParts.join(" | "),
      updatedInput: {
        command: verdict.command,
        description: nextDescription,
      },
    },
  });
};

main().catch(() => {
  // Never block the user on internal error: fall silent and let the original command run.
  process.exit(0);
});
