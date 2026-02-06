import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveThread } from "../../src/tools/save-thread.js";
import { findThreads } from "../../src/tools/find-threads.js";
import { updateThread } from "../../src/tools/update-thread.js";
import { deleteThread } from "../../src/tools/delete-thread.js";
import { resumeThread } from "../../src/tools/resume-thread.js";
import { resetConfigCache } from "../../src/config.js";

describe("Environment Variable Configuration Integration", () => {
  const originalEnv = process.env;
  let testDir: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    resetConfigCache();
    testDir = join(tmpdir(), `thread-env-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    process.env = originalEnv;
    resetConfigCache();
    await rm(testDir, { recursive: true, force: true });
  });

  describe("THREAD_MCP_STORAGE_DIR", () => {
    it("should use env var storage dir when outputDir not provided", async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      resetConfigCache();

      const result = await saveThread({
        title: "Env Storage Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain(testDir);
    });

    it("should prefer outputDir param over env var", async () => {
      const altDir = join(tmpdir(), `thread-alt-${Date.now()}`);
      await mkdir(altDir, { recursive: true });

      try {
        process.env.THREAD_MCP_STORAGE_DIR = testDir;
        resetConfigCache();

        const result = await saveThread({
          title: "Override Storage Test",
          messages: [{ role: "user", content: "Hello" }],
          outputDir: altDir,
          includeMetadata: true,
          includeTimestamps: true,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toContain(altDir);
        expect(result.filePath).not.toContain(testDir);
      } finally {
        await rm(altDir, { recursive: true, force: true });
      }
    });
  });

  describe("THREAD_MCP_FORMAT", () => {
    it("should use env var format when not provided", async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_FORMAT = "json";
      resetConfigCache();

      const result = await saveThread({
        title: "Env Format Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe("json");
      expect(result.filePath).toContain(".json");
    });

    it("should prefer format param over env var", async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_FORMAT = "json";
      resetConfigCache();

      const result = await saveThread({
        title: "Override Format Test",
        messages: [{ role: "user", content: "Hello" }],
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe("markdown");
      expect(result.filePath).toContain(".md");
    });
  });

  describe("THREAD_MCP_DEFAULT_SOURCE", () => {
    it("should use env var source when not provided (local)", async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_DEFAULT_SOURCE = "local";
      resetConfigCache();

      const result = await saveThread({
        title: "Env Source Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.destination).toBe("local");
    });

    it("should require remoteUrl when source is remote via env", async () => {
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
      resetConfigCache();

      await expect(
        saveThread({
          title: "Remote Without URL",
          messages: [{ role: "user", content: "Hello" }],
          includeMetadata: true,
          includeTimestamps: true,
        }),
      ).rejects.toThrow("Remote URL is required");
    });

    it("should prefer destination param over env var", async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
      resetConfigCache();

      // Override to local should work without remoteUrl
      const result = await saveThread({
        title: "Override Source Test",
        messages: [{ role: "user", content: "Hello" }],
        destination: "local",
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.destination).toBe("local");
    });
  });

  describe("find_threads with env config", () => {
    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      resetConfigCache();

      await saveThread({
        title: "Search Test Thread",
        messages: [{ role: "user", content: "Searchable content" }],
        tags: ["test"],
        includeMetadata: true,
        includeTimestamps: true,
      });
    });

    it("should find threads using env var storage dir", async () => {
      const result = await findThreads({});

      expect(result.totalResults).toBe(1);
      expect(result.threads[0].title).toBe("Search Test Thread");
    });

    it("should search in env var storage dir", async () => {
      const result = await findThreads({ query: "Searchable" });

      expect(result.totalResults).toBe(1);
    });
  });

  describe("update_thread with env config", () => {
    let savedId: string;

    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      resetConfigCache();

      const result = await saveThread({
        title: "Update Env Test",
        messages: [{ role: "user", content: "Original" }],
        includeMetadata: true,
        includeTimestamps: true,
      });
      savedId = result.id;
    });

    it("should update thread using env var storage dir", async () => {
      const result = await updateThread({
        id: savedId,
        messages: [{ role: "assistant", content: "Response" }],
        deduplicate: true,
      });

      expect(result.success).toBe(true);
      expect(result.messageCount).toBe(2);
    });
  });

  describe("delete_thread with env config", () => {
    let savedId: string;

    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      resetConfigCache();

      const result = await saveThread({
        title: "Delete Env Test",
        messages: [{ role: "user", content: "Delete me" }],
        includeMetadata: true,
        includeTimestamps: true,
      });
      savedId = result.id;
    });

    it("should delete thread using env var storage dir", async () => {
      const result = await deleteThread({ id: savedId });

      expect(result.deleted).toBe(true);
    });
  });

  describe("resume_thread with env config", () => {
    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      resetConfigCache();

      await saveThread({
        title: "Resume Env Test",
        messages: [
          { role: "user", content: "Question" },
          { role: "assistant", content: "Answer" },
        ],
        summary: "Test summary",
        includeMetadata: true,
        includeTimestamps: true,
      });
    });

    it("should resume thread using env var storage dir", async () => {
      const result = await resumeThread({ title: "Resume Env Test" });

      expect(result.found).toBe(true);
      expect(result.messages).toHaveLength(2);
    });
  });

  describe("All tools respect THREAD_MCP_FORMAT for new saves", () => {
    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_FORMAT = "json";
      resetConfigCache();
    });

    it("save_thread uses env format", async () => {
      const result = await saveThread({
        title: "JSON Format Test",
        messages: [{ role: "user", content: "Test" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.format).toBe("json");
    });
  });

  describe("Full workflow with env vars only", () => {
    beforeEach(async () => {
      process.env.THREAD_MCP_STORAGE_DIR = testDir;
      process.env.THREAD_MCP_FORMAT = "markdown";
      process.env.THREAD_MCP_DEFAULT_SOURCE = "local";
      resetConfigCache();
    });

    it("should complete full workflow without any explicit params", async () => {
      // 1. Save - only required params
      const saved = await saveThread({
        title: "Minimal Params Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });
      expect(saved.success).toBe(true);
      expect(saved.format).toBe("markdown");
      expect(saved.destination).toBe("local");

      // 2. Find - no params needed
      const found = await findThreads({});
      expect(found.totalResults).toBe(1);
      expect(found.source).toBe("local");

      // 3. Update - only required params
      const updated = await updateThread({
        id: saved.id,
        messages: [{ role: "assistant", content: "Hi" }],
        deduplicate: true,
      });
      expect(updated.success).toBe(true);
      expect(updated.source).toBe("local");

      // 4. Resume - only required params
      const resumed = await resumeThread({ id: saved.id });
      expect(resumed.found).toBe(true);
      expect(resumed.source).toBe("local");

      // 5. Delete - only required params
      const deleted = await deleteThread({ id: saved.id });
      expect(deleted.deleted).toBe(true);
      expect(deleted.source).toBe("local");
    });
  });
});

describe("Remote Configuration with Env Vars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  it("should use THREAD_MCP_REMOTE_URL for remote operations", async () => {
    process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
    process.env.THREAD_MCP_REMOTE_URL = "https://api.example.com";
    resetConfigCache();

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://api.example.com/threads/123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const result = await saveThread({
        title: "Remote Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.destination).toBe("remote");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/conversations",
        expect.any(Object),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should use THREAD_MCP_API_KEY in remote requests", async () => {
    process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
    process.env.THREAD_MCP_REMOTE_URL = "https://api.example.com";
    process.env.THREAD_MCP_API_KEY = "secret-api-key";
    resetConfigCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://api.example.com/threads/123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await saveThread({
        title: "API Key Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer secret-api-key",
          }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should use THREAD_MCP_REMOTE_HEADERS in remote requests", async () => {
    process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
    process.env.THREAD_MCP_REMOTE_URL = "https://api.example.com";
    process.env.THREAD_MCP_REMOTE_HEADERS = '{"X-Custom-Header": "custom-value"}';
    resetConfigCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://api.example.com/threads/123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await saveThread({
        title: "Headers Test",
        messages: [{ role: "user", content: "Hello" }],
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom-Header": "custom-value",
          }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should merge tool headers with env headers (tool wins)", async () => {
    process.env.THREAD_MCP_DEFAULT_SOURCE = "remote";
    process.env.THREAD_MCP_REMOTE_URL = "https://api.example.com";
    process.env.THREAD_MCP_REMOTE_HEADERS = '{"X-Env": "env", "X-Shared": "env-value"}';
    resetConfigCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://api.example.com/threads/123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      await saveThread({
        title: "Merged Headers Test",
        messages: [{ role: "user", content: "Hello" }],
        headers: { "X-Tool": "tool", "X-Shared": "tool-value" },
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Env": "env",
            "X-Tool": "tool",
            "X-Shared": "tool-value", // Tool value wins
          }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Import vi for mocking
import { vi } from "vitest";
