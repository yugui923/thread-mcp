import { homedir } from "node:os";
import { join } from "node:path";

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

export function resolveStorageDir(toolParam: string | undefined): string {
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

export function resolveRemoteUrl(toolParam: string | undefined): string | undefined {
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
