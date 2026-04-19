/**
 * Translate MSYS/Git-Bash drive prefixes to Windows drive-letter form.
 *
 * `/c/Users/foo` → `C:/Users/foo`
 *
 * Only the leading `/x/` segment is rewritten; remaining forward slashes
 * are left intact (PowerShell accepts `C:/path/with/fwd/slashes`).
 *
 * Boundaries — translate when the `/` is preceded by:
 *   - start-of-string
 *   - separator: whitespace, `|`, `&`, `;`, `=`, `(`, `,`, `"`, `<`, `>`
 *   - a packed flag whose token starts with `-` (e.g. `-I/c/include`,
 *     `-Wl,/c/lib`, `-isystem/c/sys`).
 *
 * URLs (`https://…`), UNC paths (`//server/share`), and `file:///c/…`
 * are skipped because the preceding char is `:` or `/`.
 *
 * Single-quoted substrings are skipped entirely — bash preserves them
 * literally, so the user clearly wants no substitution.
 */
const SEPARATOR = /[\s|&;=(,"<>]/;

const isPackedFlagBoundary = (out: string): boolean => {
  let j = out.length - 1;
  while (j >= 0 && !SEPARATOR.test(out[j])) j--;
  const token = out.slice(j + 1);
  return token.startsWith("-");
};

export const translateMsysPaths = (s: string): string => {
  let out = "";
  let inSingle = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === "'") {
      inSingle = !inSingle;
      out += c;
      i++;
      continue;
    }

    if (inSingle) {
      out += c;
      i++;
      continue;
    }

    if (
      c === "/" &&
      i + 2 < s.length &&
      /[a-zA-Z]/.test(s[i + 1]) &&
      s[i + 2] === "/"
    ) {
      const prev = i === 0 ? "" : s[i - 1];
      const atSeparator = prev === "" || SEPARATOR.test(prev);
      if (atSeparator || isPackedFlagBoundary(out)) {
        out += s[i + 1].toUpperCase() + ":/";
        i += 3;
        continue;
      }
    }

    out += c;
    i++;
  }

  return out;
};
