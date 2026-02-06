import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getServerConfig,
  resolveStorageDir,
  resolveFormat,
  resolveSource,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
  resetConfigCache,
} from "../../src/config.js";

describe("Config Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env and cache before each test
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  describe("getServerConfig", () => {
    it("should return default values when no env vars set", () => {
      delete process.env.THREAD_MCP_STORAGE_DIR;
      delete process.env.THREAD_MCP_FORMAT;
      delete process.env.THREAD_MCP_DEFAULT_SOURCE;
      delete process.env.THREAD_MCP_REMOTE_URL;
      delete process.env.THREAD_MCP_API_KEY;
      delete process.env.THREAD_MCP_REMOTE_HEADERS;

      const config = getServerConfig();

      expect(config.storageDir).toBe(join(homedir(), ".thread-mcp"));
      expect(config.format).toBe("markdown");
      expect(config.defaultSource).toBe("local");
      expect(config.remoteUrl).toBeUndefined();
      expect(config.apiKey).toBeUndefined();
      expect(config.remoteHeaders).toEqual({});
    });

    it("should read THREAD_MCP_STORAGE_DIR from env", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/custom/path";

      const config = getServerConfig();

      expect(config.storageDir).toBe("/custom/path");
    });

    it("should read THREAD_MCP_FORMAT from env", () => {
      process.env.THREAD_MCP_FORMAT = "json";

      const config = getServerConfig();

      expect(config.format).toBe("json");
    });

    it("should default to markdown for invalid format", () => {
      process.env.THREAD_MCP_FORMAT = "invalid";

      const config = getServerConfig();

      expect(config.format).toBe("markdown");
    });

    it("should read THREAD_MCP_DEFAULT_SOURCE from env", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";

      const config = getServerConfig();

      expect(config.defaultSource).toBe("remote");
    });

    it("should default to local for invalid source", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "invalid";

      const config = getServerConfig();

      expect(config.defaultSource).toBe("local");
    });

    it("should read THREAD_MCP_REMOTE_URL from env", () => {
      process.env.THREAD_MCP_REMOTE_URL = "https://api.example.com";

      const config = getServerConfig();

      expect(config.remoteUrl).toBe("https://api.example.com");
    });

    it("should read THREAD_MCP_API_KEY from env", () => {
      process.env.THREAD_MCP_API_KEY = "secret-key-123";

      const config = getServerConfig();

      expect(config.apiKey).toBe("secret-key-123");
    });

    it("should parse THREAD_MCP_REMOTE_HEADERS as JSON", () => {
      process.env.THREAD_MCP_REMOTE_HEADERS =
        '{"Authorization": "Bearer token", "X-Custom": "value"}';

      const config = getServerConfig();

      expect(config.remoteHeaders).toEqual({
        Authorization: "Bearer token",
        "X-Custom": "value",
      });
    });

    it("should return empty object for invalid JSON headers", () => {
      process.env.THREAD_MCP_REMOTE_HEADERS = "not valid json";

      const config = getServerConfig();

      expect(config.remoteHeaders).toEqual({});
    });

    it("should return empty object for non-object JSON headers", () => {
      process.env.THREAD_MCP_REMOTE_HEADERS = '["array", "not", "object"]';

      const config = getServerConfig();

      expect(config.remoteHeaders).toEqual({});
    });

    it("should cache config on subsequent calls", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/first/path";

      const config1 = getServerConfig();
      expect(config1.storageDir).toBe("/first/path");

      // Change env var (should not affect cached value)
      process.env.THREAD_MCP_STORAGE_DIR = "/second/path";

      const config2 = getServerConfig();
      expect(config2.storageDir).toBe("/first/path"); // Still cached value
    });

    it("should return fresh config after cache reset", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/first/path";
      getServerConfig();

      process.env.THREAD_MCP_STORAGE_DIR = "/second/path";
      resetConfigCache();

      const config = getServerConfig();
      expect(config.storageDir).toBe("/second/path");
    });
  });

  describe("resolveStorageDir", () => {
    it("should return tool param when provided", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/env/path";

      const result = resolveStorageDir("/tool/path");

      expect(result).toBe("/tool/path");
    });

    it("should return env var when tool param is undefined", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/env/path";

      const result = resolveStorageDir(undefined);

      expect(result).toBe("/env/path");
    });

    it("should return default when both are undefined", () => {
      delete process.env.THREAD_MCP_STORAGE_DIR;

      const result = resolveStorageDir(undefined);

      expect(result).toBe(join(homedir(), ".thread-mcp"));
    });
  });

  describe("resolveFormat", () => {
    it("should return tool param when valid", () => {
      process.env.THREAD_MCP_FORMAT = "json";

      const result = resolveFormat("markdown");

      expect(result).toBe("markdown");
    });

    it("should return env var when tool param is undefined", () => {
      process.env.THREAD_MCP_FORMAT = "json";

      const result = resolveFormat(undefined);

      expect(result).toBe("json");
    });

    it("should return default when both are undefined", () => {
      delete process.env.THREAD_MCP_FORMAT;

      const result = resolveFormat(undefined);

      expect(result).toBe("markdown");
    });

    it("should ignore invalid tool param values", () => {
      process.env.THREAD_MCP_FORMAT = "json";

      const result = resolveFormat("invalid" as any);

      expect(result).toBe("json");
    });
  });

  describe("resolveSource", () => {
    it("should return tool param when valid", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "local";

      const result = resolveSource("remote");

      expect(result).toBe("remote");
    });

    it("should return env var when tool param is undefined", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";

      const result = resolveSource(undefined);

      expect(result).toBe("remote");
    });

    it("should return default when both are undefined", () => {
      delete process.env.THREAD_MCP_DEFAULT_SOURCE;

      const result = resolveSource(undefined);

      expect(result).toBe("local");
    });

    it("should ignore invalid tool param values", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";

      const result = resolveSource("invalid" as any);

      expect(result).toBe("remote");
    });
  });

  describe("resolveRemoteUrl", () => {
    it("should return tool param when provided", () => {
      process.env.THREAD_MCP_REMOTE_URL = "https://env.example.com";

      const result = resolveRemoteUrl("https://tool.example.com");

      expect(result).toBe("https://tool.example.com");
    });

    it("should return env var when tool param is undefined", () => {
      process.env.THREAD_MCP_REMOTE_URL = "https://env.example.com";

      const result = resolveRemoteUrl(undefined);

      expect(result).toBe("https://env.example.com");
    });

    it("should return undefined when both are undefined", () => {
      delete process.env.THREAD_MCP_REMOTE_URL;

      const result = resolveRemoteUrl(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe("resolveApiKey", () => {
    it("should return tool param when provided", () => {
      process.env.THREAD_MCP_API_KEY = "env-key";

      const result = resolveApiKey("tool-key");

      expect(result).toBe("tool-key");
    });

    it("should return env var when tool param is undefined", () => {
      process.env.THREAD_MCP_API_KEY = "env-key";

      const result = resolveApiKey(undefined);

      expect(result).toBe("env-key");
    });

    it("should return undefined when both are undefined", () => {
      delete process.env.THREAD_MCP_API_KEY;

      const result = resolveApiKey(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe("resolveHeaders", () => {
    it("should return tool headers when env is empty", () => {
      delete process.env.THREAD_MCP_REMOTE_HEADERS;

      const result = resolveHeaders({ "X-Tool": "value" });

      expect(result).toEqual({ "X-Tool": "value" });
    });

    it("should return env headers when tool is undefined", () => {
      process.env.THREAD_MCP_REMOTE_HEADERS = '{"X-Env": "value"}';
      resetConfigCache();

      const result = resolveHeaders(undefined);

      expect(result).toEqual({ "X-Env": "value" });
    });

    it("should merge headers with tool taking precedence", () => {
      process.env.THREAD_MCP_REMOTE_HEADERS =
        '{"X-Env": "env-value", "X-Shared": "env"}';
      resetConfigCache();

      const result = resolveHeaders({ "X-Tool": "tool-value", "X-Shared": "tool" });

      expect(result).toEqual({
        "X-Env": "env-value",
        "X-Tool": "tool-value",
        "X-Shared": "tool", // Tool takes precedence
      });
    });

    it("should return empty object when both are empty/undefined", () => {
      delete process.env.THREAD_MCP_REMOTE_HEADERS;

      const result = resolveHeaders(undefined);

      expect(result).toEqual({});
    });
  });
});

describe("Config Precedence", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  describe("Three-tier precedence: tool param > env var > default", () => {
    it("storageDir: tool param wins", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/env";
      expect(resolveStorageDir("/tool")).toBe("/tool");
    });

    it("storageDir: env var wins over default", () => {
      process.env.THREAD_MCP_STORAGE_DIR = "/env";
      expect(resolveStorageDir(undefined)).toBe("/env");
    });

    it("storageDir: default when nothing set", () => {
      delete process.env.THREAD_MCP_STORAGE_DIR;
      expect(resolveStorageDir(undefined)).toBe(join(homedir(), ".thread-mcp"));
    });

    it("format: tool param wins", () => {
      process.env.THREAD_MCP_FORMAT = "json";
      expect(resolveFormat("markdown")).toBe("markdown");
    });

    it("format: env var wins over default", () => {
      process.env.THREAD_MCP_FORMAT = "json";
      expect(resolveFormat(undefined)).toBe("json");
    });

    it("format: default when nothing set", () => {
      delete process.env.THREAD_MCP_FORMAT;
      expect(resolveFormat(undefined)).toBe("markdown");
    });

    it("source: tool param wins", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
      expect(resolveSource("local")).toBe("local");
    });

    it("source: env var wins over default", () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
      expect(resolveSource(undefined)).toBe("remote");
    });

    it("source: default when nothing set", () => {
      delete process.env.THREAD_MCP_DEFAULT_SOURCE;
      expect(resolveSource(undefined)).toBe("local");
    });

    it("remoteUrl: tool param wins", () => {
      process.env.THREAD_MCP_REMOTE_URL = "https://env.com";
      expect(resolveRemoteUrl("https://tool.com")).toBe("https://tool.com");
    });

    it("remoteUrl: env var wins over undefined", () => {
      process.env.THREAD_MCP_REMOTE_URL = "https://env.com";
      expect(resolveRemoteUrl(undefined)).toBe("https://env.com");
    });

    it("remoteUrl: undefined when nothing set", () => {
      delete process.env.THREAD_MCP_REMOTE_URL;
      expect(resolveRemoteUrl(undefined)).toBeUndefined();
    });

    it("apiKey: tool param wins", () => {
      process.env.THREAD_MCP_API_KEY = "env-key";
      expect(resolveApiKey("tool-key")).toBe("tool-key");
    });

    it("apiKey: env var wins over undefined", () => {
      process.env.THREAD_MCP_API_KEY = "env-key";
      expect(resolveApiKey(undefined)).toBe("env-key");
    });

    it("apiKey: undefined when nothing set", () => {
      delete process.env.THREAD_MCP_API_KEY;
      expect(resolveApiKey(undefined)).toBeUndefined();
    });
  });
});
