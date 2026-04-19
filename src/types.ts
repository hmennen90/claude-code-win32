export interface BashToolInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
}

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name: string;
  tool_input: BashToolInput;
}

export interface PreToolUseOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision?: "allow" | "ask" | "deny" | "defer";
    permissionDecisionReason?: string;
    updatedInput?: Partial<BashToolInput>;
  };
}

export type TranspileKind = "pass" | "rewrite" | "deny";

export interface TranspileResult {
  kind: TranspileKind;
  command?: string;
  reason: string;
  offenders?: string[];
  warnings?: string[];
}

export interface TranspileConfig {
  enabled: boolean;
  assumeGitBash: boolean;
  extraPosixSafe: string[];
  extraForcePowerShell: string[];
  extraDeny: string[];
  /** If true, route even pass-through-eligible chains through PowerShell. Default false. */
  preferPowerShell: boolean;
}

export interface PSEdition {
  exe: "pwsh" | "powershell";
  major: number;
}
