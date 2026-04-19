/**
 * Bash command classifier.
 *
 * We don't attempt a real parser — the hook must stay fast and must never
 * corrupt commands it doesn't understand. Instead we extract the leading
 * simple commands and flag anything that hints at shell features we'd rather
 * let bash handle untouched.
 */

const SHELL_METACHARS = /[|&;<>`$(){}]/;
const REDIRECT = /(?:^|\s)(?:<|>|>>|2>|2>&1|&>|<<<|<<)/;

export interface ParsedCommand {
  original: string;
  /** Binary/command name of the first simple command (`git log --oneline` → `git`). */
  leadingBin: string;
  /** Full first-segment before any `|`, `&&`, `||`, `;`. */
  leadingSegment: string;
  /** True if the command contains shell features (pipes, subshells, redirects, expansions). */
  hasShellFeatures: boolean;
  /** Distinct binaries detected across segments (best-effort, whitespace-split). */
  binaries: string[];
}

const splitTopLevel = (cmd: string): string[] => {
  const segments: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const next = cmd[i + 1];
    if (!inDouble && c === "'") inSingle = !inSingle;
    else if (!inSingle && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (c === "(") parenDepth++;
      else if (c === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (parenDepth === 0) {
        if (c === "|" && next !== "|") {
          segments.push(buf);
          buf = "";
          continue;
        }
        if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
          segments.push(buf);
          buf = "";
          i++;
          continue;
        }
        if (c === ";") {
          segments.push(buf);
          buf = "";
          continue;
        }
      }
    }
    buf += c;
  }
  if (buf.trim()) segments.push(buf);
  return segments.map((s) => s.trim()).filter(Boolean);
};

const firstToken = (segment: string): string => {
  const match = segment.match(/^\s*([^\s'"(]+)/);
  return match?.[1] ?? "";
};

export const parseCommand = (command: string): ParsedCommand => {
  const segments = splitTopLevel(command);
  const leadingSegment = segments[0] ?? command.trim();
  const leadingBin = firstToken(leadingSegment);
  const binaries = Array.from(new Set(segments.map(firstToken).filter(Boolean)));
  const hasShellFeatures = SHELL_METACHARS.test(command) || REDIRECT.test(command);
  return {
    original: command,
    leadingBin,
    leadingSegment,
    hasShellFeatures,
    binaries,
  };
};
