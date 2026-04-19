import { TranspileConfig } from "./types.js";

const parseBool = (v: string | undefined, fallback: boolean): boolean => {
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
};

const parseList = (v: string | undefined): string[] =>
  (v ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): TranspileConfig => ({
  enabled: parseBool(env.WIN32_TRANSPILE, true),
  assumeGitBash: parseBool(env.WIN32_TRANSPILE_ASSUME_GIT_BASH, true),
  extraPosixSafe: parseList(env.WIN32_TRANSPILE_POSIX_SAFE),
  extraForcePowerShell: parseList(env.WIN32_TRANSPILE_FORCE_PS),
  extraDeny: parseList(env.WIN32_TRANSPILE_DENY),
  preferPowerShell: parseBool(env.WIN32_TRANSPILE_PREFER_PS, false),
});
