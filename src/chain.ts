/**
 * Split a bash command line into chain nodes at top-level operators.
 * Quote-aware, paren-aware (subshells are kept intact in a segment).
 *
 * Example: `a | b && c` → [
 *   { segment: "a", opAfter: "|" },
 *   { segment: "b", opAfter: "&&" },
 *   { segment: "c" }
 * ]
 */
export type ChainOp = "|" | "&&" | "||" | ";" | "&";

export interface ChainNode {
  segment: string;
  opAfter?: ChainOp;
}

export const parseChain = (command: string): ChainNode[] => {
  const nodes: ChainNode[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;

  const flush = (op?: ChainOp): void => {
    const seg = buf.trim();
    if (seg) nodes.push({ segment: seg, opAfter: op });
    else if (nodes.length > 0) nodes[nodes.length - 1].opAfter = op ?? nodes[nodes.length - 1].opAfter;
    buf = "";
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];

    if (!inDouble && c === "'") {
      inSingle = !inSingle;
      buf += c;
      continue;
    }
    if (!inSingle && c === '"') {
      inDouble = !inDouble;
      buf += c;
      continue;
    }
    if (inSingle || inDouble) {
      buf += c;
      continue;
    }

    if (c === "(") {
      parenDepth++;
      buf += c;
      continue;
    }
    if (c === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      buf += c;
      continue;
    }

    if (parenDepth === 0) {
      if (c === "&" && next === "&") {
        flush("&&");
        i++;
        continue;
      }
      if (c === "|" && next === "|") {
        flush("||");
        i++;
        continue;
      }
      if (c === "|") {
        flush("|");
        continue;
      }
      if (c === ";") {
        flush(";");
        continue;
      }
      if (c === "&" && next !== "&") {
        // Skip `&` that is part of a redirect: `2>&1`, `1>&2`, `&>file`, `&>>file`.
        const prev = buf.length > 0 ? buf[buf.length - 1] : "";
        const isFdDup = prev === ">" || prev === "<";
        const isMergeRedirect = next === ">";
        if (!isFdDup && !isMergeRedirect) {
          flush("&");
          continue;
        }
      }
    }

    buf += c;
  }

  flush(undefined);
  return nodes;
};

/**
 * Render a sequence of (already-transpiled) segments back into a single
 * PowerShell command line, using operators appropriate for the target PS
 * edition.
 *
 * Assumption: `&&`/`||` are only passed here if psMajor >= 7. The caller
 * rejects those combos earlier for PS 5.1 with a deny verdict.
 */
export const renderPowerShellChain = (
  segments: string[],
  ops: (ChainOp | undefined)[],
  psMajor: number,
): string => {
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const op = ops[i];

    if (op === "&") {
      // Trailing background: wrap preceding segment in Start-Job.
      parts.push(`Start-Job -ScriptBlock { ${seg} } | Out-Null`);
      if (i < segments.length - 1) parts.push(";");
      continue;
    }

    parts.push(seg);

    if (op === "|") parts.push("|");
    else if (op === ";") parts.push(";");
    else if (op === "&&") {
      // PS 7+ native; PS 5.1 path is deny'd upstream.
      parts.push(psMajor >= 7 ? "&&" : ";");
    } else if (op === "||") {
      parts.push(psMajor >= 7 ? "||" : ";");
    }
  }
  return parts.join(" ");
};
