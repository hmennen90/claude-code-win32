import { ParsedCommand } from "./parser.js";

/**
 * Commands Git Bash (and common Windows ports) handles natively. These are
 * left untouched in the pass-through path — PowerShell adds nothing.
 */
export const POSIX_SAFE_BINS = new Set<string>([
  "git",
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  "php",
  "composer",
  "python",
  "python3",
  "pip",
  "uv",
  "go",
  "cargo",
  "rustc",
  "java",
  "mvn",
  "gradle",
  "dotnet",
  "docker",
  "kubectl",
  "gh",
  "curl",
  "wget",
  "echo",
  "printf",
  "true",
  "false",
  "test",
  "[",
  "grep",
  "sed",
  "awk",
  "cut",
  "sort",
  "uniq",
  "head",
  "tail",
  "wc",
  "tr",
  "tee",
  "xargs",
  "find",
  "ls",
  "cat",
  "cp",
  "mv",
  "rm",
  "mkdir",
  "rmdir",
  "touch",
  "pwd",
  "cd",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "which",
  "env",
  "export",
  "source",
  ".",
  "whoami",
  // JSON/text tooling Claude reaches for constantly — all ship .exe builds and
  // resolve under Git Bash. Missing entries here used to drag the WHOLE chain
  // into PowerShell, where the MSYS PATH (and therefore the tool) is gone.
  "jq",
  "yq",
  "rg",
  "fd",
  "bat",
  "delta",
  "diff",
  "patch",
  "tar",
  "gzip",
  "gunzip",
  "zip",
  "unzip",
  "base64",
  "md5sum",
  "sha1sum",
  "sha256sum",
  "openssl",
  "ssh",
  "scp",
  "sftp",
  "rsync",
  "make",
  "cmake",
  "ninja",
  "sqlite3",
  "psql",
  "mysql",
  "redis-cli",
  "aws",
  "az",
  "gcloud",
  "terraform",
  "helm",
  "ruby",
  "perl",
  "pytest",
  "date",
  "sleep",
  "seq",
  "stat",
  "ln",
  "du",
  "df",
  "ps",
  "kill",
  "sh",
  "bash",
]);

/**
 * A binary we don't know is assumed to be a normal executable and passed to
 * Git Bash — an allowlist can never be complete, and forcing the unknown case
 * into PowerShell silently changes PATH resolution. The exception is a name
 * that is clearly PowerShell: a Verb-Noun cmdlet or a .ps1 script.
 */
export const looksLikePowerShell = (bin: string): boolean =>
  /^[A-Z][A-Za-z0-9]*-[A-Z][A-Za-z0-9]*$/.test(bin) || /\.ps1$/i.test(bin);

/**
 * Unix-only commands with no meaningful Windows equivalent — translating them
 * would produce wrong behavior (different package catalogs, different service
 * models, different permission models). We deny with a clear hint.
 */
export const UNIX_ONLY_NO_EQUIVALENT = new Set<string>([
  // package managers
  "apt",
  "apt-get",
  "aptitude",
  "yum",
  "dnf",
  "pacman",
  "zypper",
  "emerge",
  "brew",
  "port",
  "snap",
  "flatpak",
  "dpkg",
  "rpm",
  // init / service management
  "systemctl",
  "service",
  "journalctl",
  "initctl",
  "rc-service",
  "launchctl",
  // privilege escalation
  "sudo",
  "doas",
  "su",
  // POSIX permissions
  "chmod",
  "chown",
  "chgrp",
  "setfacl",
  "getfacl",
  // kernel / block devices
  "dmesg",
  "lsblk",
  "blkid",
  "fdisk",
  "parted",
  "mkfs",
  "cryptsetup",
  "losetup",
  // mount
  "mount",
  "umount",
  // networking (Linux-specific)
  "iptables",
  "nft",
  "ufw",
  "firewalld",
  "ss",
  "ifconfig",
  "ip",
  // misc Linux userland
  "modprobe",
  "sysctl",
  "useradd",
  "userdel",
  "usermod",
  "groupadd",
  "groupdel",
  "passwd",
  "crontab",
  "man",
  "apropos",
]);

/**
 * Human-readable hints for denied commands — told to Claude via the deny reason
 * so it can choose the Windows-native alternative on its next turn.
 */
export const DENY_HINTS: Record<string, string> = {
  "apt": "Windows has no equivalent package catalog. Use 'winget', 'choco', or 'scoop' (different package names).",
  "apt-get": "Use 'winget install <pkg>' or 'choco install <pkg>'.",
  "aptitude": "Use 'winget' or 'choco'.",
  "yum": "Use 'winget install <pkg>' or 'choco install <pkg>'.",
  "dnf": "Use 'winget' or 'choco'.",
  "pacman": "Use 'winget' or 'scoop'.",
  "zypper": "Use 'winget' or 'choco'.",
  "emerge": "Use 'winget' or 'choco'.",
  "brew": "Use 'winget', 'choco', or 'scoop' — different catalog, names may differ.",
  "port": "Use 'winget' or 'choco'.",
  "snap": "No Windows equivalent — use 'winget' or 'choco'.",
  "flatpak": "No Windows equivalent — use 'winget' or 'choco'.",
  "dpkg": "Windows has no .deb format. Use 'winget' / 'choco' or .msi/.exe installers.",
  "rpm": "Windows has no .rpm format. Use 'winget' / 'choco' or .msi/.exe installers.",

  "systemctl": "Use 'Get-Service' / 'Start-Service' / 'Stop-Service' / 'Restart-Service' or 'sc.exe'. Service names differ from systemd units.",
  "service": "Use 'Get-Service <name>' / 'Start-Service <name>'.",
  "journalctl": "Use 'Get-WinEvent -LogName System' or 'Get-EventLog'.",
  "initctl": "systemd/upstart — no Windows equivalent. Use 'Get-Service' / 'sc.exe'.",
  "rc-service": "OpenRC-specific — use 'Get-Service' / 'Start-Service' on Windows.",
  "launchctl": "macOS-specific — use 'schtasks.exe' or Task Scheduler on Windows.",

  "sudo": "Relaunch terminal as Administrator, or wrap the inner command in 'Start-Process -Verb RunAs'.",
  "doas": "No direct equivalent. Relaunch as Administrator.",
  "su": "Use 'runas /user:<name>' or 'Start-Process -Credential'.",

  "chmod": "Windows uses ACLs, not POSIX modes. Use 'icacls' or 'Set-Acl'.",
  "chown": "Use 'icacls /setowner <user>' or 'Set-Acl'.",
  "chgrp": "Windows has no POSIX groups — use 'icacls' to adjust group/user ACL entries.",
  "setfacl": "Use 'icacls /grant' or 'Set-Acl'.",
  "getfacl": "Use 'icacls <path>' or 'Get-Acl <path>'.",

  "dmesg": "Use 'Get-WinEvent -LogName System -MaxEvents 100'.",
  "lsblk": "Use 'Get-Disk' / 'Get-Volume' / 'Get-Partition'.",
  "blkid": "Use 'Get-Volume' / 'Get-Partition'.",
  "fdisk": "Use 'diskpart.exe' or 'New-Partition' / 'Get-Partition'.",
  "parted": "Use 'diskpart.exe' or Storage Spaces cmdlets.",
  "mkfs": "Use 'Format-Volume'.",
  "cryptsetup": "Use BitLocker cmdlets: 'Enable-BitLocker' etc.",
  "losetup": "Use 'Mount-DiskImage' for .vhd/.iso loopback.",

  "mount": "Use 'New-PSDrive -PSProvider FileSystem' or 'mountvol.exe'.",
  "umount": "Use 'Remove-PSDrive' or 'mountvol /D'.",

  "iptables": "Use 'New-NetFirewallRule' / 'Get-NetFirewallRule' / 'Set-NetFirewallRule'.",
  "nft": "Use 'New-NetFirewallRule' etc.",
  "ufw": "Use 'Set-NetFirewallProfile' / 'New-NetFirewallRule'.",
  "firewalld": "Use 'New-NetFirewallRule' etc.",
  "ss": "Use 'Get-NetTCPConnection' / 'Get-NetUDPEndpoint'.",
  "ifconfig": "Use 'Get-NetIPAddress' / 'Get-NetAdapter' or 'ipconfig.exe'.",
  "ip": "Use 'Get-NetIPAddress' / 'Get-NetRoute' / 'Get-NetAdapter'.",

  "modprobe": "Windows has no loadable kernel modules — use driver management: 'Get-WindowsDriver'.",
  "sysctl": "Use registry or 'Set-ItemProperty HKLM:\\…'.",
  "useradd": "Use 'New-LocalUser'.",
  "userdel": "Use 'Remove-LocalUser'.",
  "usermod": "Use 'Set-LocalUser' / 'Add-LocalGroupMember'.",
  "groupadd": "Use 'New-LocalGroup'.",
  "groupdel": "Use 'Remove-LocalGroup'.",
  "passwd": "Use 'Set-LocalUser -Password (Read-Host -AsSecureString)'.",
  "crontab": "Use 'schtasks.exe' or 'Register-ScheduledTask'.",
  "man": "Use 'Get-Help <cmdlet> -Full' for PS cmdlets, or '<exe> --help'.",
  "apropos": "Use 'Get-Command *<term>*' or 'Get-Help *<term>*'.",
};

export const denyHint = (bin: string): string =>
  DENY_HINTS[bin] ?? "No Windows equivalent — Claude should use a Windows-native approach.";

/** Single-command rewriters: Unix idiom → exact PowerShell equivalent. */
export type SingleRewriter = (segment: string) => string | null;

const asPsArg = (s: string): string => `'${s.replace(/'/g, "''")}'`;

const tokenize = (segment: string): string[] => {
  const tokens: string[] = [];
  let buf = "";
  let quote: "'" | '"' | null = null;
  for (const c of segment) {
    if (quote) {
      if (c === quote) quote = null;
      else buf += c;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (/\s/.test(c)) {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
    } else {
      buf += c;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
};

export const SINGLE_REWRITERS: Record<string, SingleRewriter> = {
  open: (seg) => {
    const [, ...rest] = tokenize(seg);
    if (!rest.length) return null;
    return `Invoke-Item ${rest.map(asPsArg).join(" ")}`;
  },
  "xdg-open": (seg) => {
    const [, ...rest] = tokenize(seg);
    if (!rest.length) return null;
    return `Start-Process ${rest.map(asPsArg).join(" ")}`;
  },
  pbcopy: () => `Set-Clipboard`,
  pbpaste: () => `Get-Clipboard`,
  clear: () => `Clear-Host`,
  reset: () => `Clear-Host`,
  hostname: () => `[System.Net.Dns]::GetHostName()`,
  uname: (seg) => {
    const args = tokenize(seg).slice(1);
    if (args.length === 0 || args.includes("-s")) return `'Windows_NT'`;
    if (args.includes("-m")) return `$env:PROCESSOR_ARCHITECTURE`;
    if (args.includes("-a"))
      return `"$(Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption) $env:PROCESSOR_ARCHITECTURE"`;
    return null;
  },
  df: () => `Get-PSDrive -PSProvider FileSystem | Format-Table -AutoSize`,
  free: () =>
    `Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory`,
};

export const tryRewriteSingle = (parsed: ParsedCommand): string | null => {
  if (parsed.hasShellFeatures) return null;
  const rewriter = SINGLE_REWRITERS[parsed.leadingBin];
  if (!rewriter) return null;
  return rewriter(parsed.leadingSegment);
};
