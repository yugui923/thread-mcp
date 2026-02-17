import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type OutputFormat = "markdown" | "json";
export type StorageSource = "local" | "remote";

export interface ServerConfig {
  storageDir: string;
  format: OutputFormat;
  defaultSource: StorageSource;
  remoteUrl: string | undefined;
  apiKey: string | undefined;
  remoteHeaders: Record<string, string>;
}

const DEFAULTS: ServerConfig = {
  storageDir: join(homedir(), ".thread-mcp"),
  format: "markdown",
  defaultSource: "local",
  remoteUrl: undefined,
  apiKey: undefined,
  remoteHeaders: {},
};

function parseHeaders(headersJson: string | undefined): Record<string, string> {
  if (!headersJson) return {};
  try {
    const parsed = JSON.parse(headersJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseFormat(format: string | undefined): OutputFormat {
  if (format === "json") return "json";
  return "markdown";
}

function parseSource(source: string | undefined): StorageSource {
  if (source === "remote") return "remote";
  return "local";
}

let cachedConfig: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {
    storageDir: process.env.THREAD_MCP_STORAGE_DIR || DEFAULTS.storageDir,
    format: parseFormat(process.env.THREAD_MCP_FORMAT),
    defaultSource: parseSource(process.env.THREAD_MCP_DEFAULT_SOURCE),
    remoteUrl: process.env.THREAD_MCP_REMOTE_URL || DEFAULTS.remoteUrl,
    apiKey: process.env.THREAD_MCP_API_KEY || DEFAULTS.apiKey,
    remoteHeaders: parseHeaders(process.env.THREAD_MCP_REMOTE_HEADERS),
  };

  return cachedConfig;
}

const BLOCKED_DIR_PREFIXES = [
  "/etc",
  "/var",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/usr/lib",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/proc",
  "/sys",
  "/dev",
  "/boot",
  "/lib",
  "/lib64",
];

const BLOCKED_PATH_SEGMENTS = [".ssh", ".gnupg", ".aws", ".config/systemd"];

export function validateStorageDir(dir: string): void {
  const resolved = resolve(dir);

  for (const prefix of BLOCKED_DIR_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(prefix + "/")) {
      throw new Error(`Storage directory '${dir}' is not allowed: system directory`);
    }
  }

  for (const segment of BLOCKED_PATH_SEGMENTS) {
    if (resolved.includes("/" + segment + "/") || resolved.endsWith("/" + segment)) {
      throw new Error(`Storage directory '${dir}' is not allowed: sensitive directory`);
    }
  }
}

export function resolveStorageDir(toolParam: string | undefined): string {
  if (toolParam !== undefined) {
    validateStorageDir(toolParam);
  }
  return toolParam ?? getServerConfig().storageDir;
}

export function resolveFormat(toolParam: string | undefined): OutputFormat {
  if (toolParam === "markdown" || toolParam === "json") {
    return toolParam;
  }
  return getServerConfig().format;
}

export function resolveSource(toolParam: string | undefined): StorageSource {
  if (toolParam === "local" || toolParam === "remote") {
    return toolParam;
  }
  return getServerConfig().defaultSource;
}

const PRIVATE_IPV4_RANGES = [
  { prefix: "127.", mask: null },
  { prefix: "10.", mask: null },
  { prefix: "0.", mask: null },
  { prefix: "169.254.", mask: null },
  { prefix: "192.168.", mask: null },
];

function isPrivateIPv4(hostname: string): boolean {
  if (hostname === "0.0.0.0") return true;
  for (const range of PRIVATE_IPV4_RANGES) {
    if (hostname.startsWith(range.prefix)) return true;
  }
  // 172.16.0.0/12 — 172.16.x.x through 172.31.x.x
  if (hostname.startsWith("172.")) {
    const second = parseInt(hostname.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

const BLOCKED_HOSTNAMES = ["localhost", "metadata.google.internal"];

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.includes(hostname)) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return false;
}

const BLOCKED_IPV6 = ["::1", "::", "fe80::"];

function isPrivateIPv6(hostname: string): boolean {
  // Strip brackets for IPv6 literals in URLs
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_IPV6.includes(bare)) return true;
  if (bare.startsWith("fe80:")) return true;
  return false;
}

export function validateRemoteUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid remote URL: '${url}'`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid remote URL scheme '${parsed.protocol}' — only http: and https: are allowed`,
    );
  }

  const hostname = parsed.hostname;

  if (isPrivateIPv4(hostname)) {
    throw new Error(`Remote URL '${url}' points to a private/reserved IP address`);
  }

  if (isPrivateIPv6(hostname)) {
    throw new Error(`Remote URL '${url}' points to a private/reserved IP address`);
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`Remote URL '${url}' points to a blocked hostname`);
  }
}

export function resolveRemoteUrl(toolParam: string | undefined): string | undefined {
  if (toolParam !== undefined) {
    validateRemoteUrl(toolParam);
  }
  return toolParam ?? getServerConfig().remoteUrl;
}

export function resolveApiKey(toolParam: string | undefined): string | undefined {
  return toolParam ?? getServerConfig().apiKey;
}

export function resolveHeaders(
  toolParam: Record<string, string> | undefined,
): Record<string, string> {
  const envHeaders = getServerConfig().remoteHeaders;
  if (!toolParam) return envHeaders;
  // Tool params override env headers (merge with tool taking precedence)
  return { ...envHeaders, ...toolParam };
}

// For testing: reset cached config
export function resetConfigCache(): void {
  cachedConfig = null;
}
