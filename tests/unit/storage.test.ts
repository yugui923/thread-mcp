import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalStorage, createLocalStorage } from "../../src/storage/local.js";
import { RemoteStorage, createRemoteStorage } from "../../src/storage/remote.js";
import type { Conversation, SaveOptions } from "../../src/types.js";

describe("LocalStorage", () => {
  let testDir: string;
  let storage: LocalStorage;

  const sampleConversation: Conversation = {
    id: "local-test-123",
    metadata: {
      title: "Local Storage Test",
      sourceApp: "TestApp",
      createdAt: "2024-01-15T10:00:00.000Z",
      tags: ["test"],
    },
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ],
  };

  const defaultOptions: SaveOptions = {
    format: "markdown",
    includeMetadata: true,
    includeTimestamps: true,
  };

  beforeEach(async () => {
    testDir = join(tmpdir(), `conversation-saver-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    storage = createLocalStorage(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("save", () => {
    it("should save a conversation to a markdown file", async () => {
      const result = await storage.save(sampleConversation, defaultOptions);

      expect(result.id).toBe("local-test-123");
      expect(result.title).toBe("Local Storage Test");
      expect(result.format).toBe("markdown");
      expect(result.filePath).toBeDefined();
      expect(result.filePath).toContain(".md");
      expect(result.savedAt).toBeDefined();

      const content = await readFile(result.filePath!, "utf-8");
      expect(content).toContain("Local Storage Test");
      expect(content).toContain("Hello");
    });

    it("should save a conversation to a JSON file", async () => {
      const options: SaveOptions = { ...defaultOptions, format: "json" };
      const result = await storage.save(sampleConversation, options);

      expect(result.format).toBe("json");
      expect(result.filePath).toContain(".json");

      const content = await readFile(result.filePath!, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe("local-test-123");
    });

    it("should sanitize filenames", async () => {
      const conversation: Conversation = {
        ...sampleConversation,
        id: "sanitize-test",
        metadata: {
          ...sampleConversation.metadata,
          title: "Test: Special/Characters\\Here!",
        },
      };

      const result = await storage.save(conversation, defaultOptions);

      expect(result.filePath).not.toContain(":");
      expect(result.filePath).not.toContain("/Test");
      expect(result.filePath).not.toContain("\\");
      expect(result.filePath).not.toContain("!");
    });

    it("should update index after saving", async () => {
      await storage.save(sampleConversation, defaultOptions);
      const list = await storage.list();

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("local-test-123");
    });
  });

  describe("list", () => {
    it("should return empty array when no conversations saved", async () => {
      const list = await storage.list();
      expect(list).toEqual([]);
    });

    it("should list all saved conversations", async () => {
      const conv1: Conversation = { ...sampleConversation, id: "list-1" };
      const conv2: Conversation = {
        ...sampleConversation,
        id: "list-2",
        metadata: { ...sampleConversation.metadata, title: "Second" },
      };

      await storage.save(conv1, defaultOptions);
      await storage.save(conv2, defaultOptions);

      const list = await storage.list();

      expect(list).toHaveLength(2);
      expect(list.map((c) => c.id).sort()).toEqual(["list-1", "list-2"]);
    });

    it("should sort by savedAt descending", async () => {
      const conv1: Conversation = { ...sampleConversation, id: "first" };
      await storage.save(conv1, defaultOptions);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const conv2: Conversation = { ...sampleConversation, id: "second" };
      await storage.save(conv2, defaultOptions);

      const list = await storage.list();

      expect(list[0].id).toBe("second");
      expect(list[1].id).toBe("first");
    });
  });

  describe("get", () => {
    it("should retrieve a saved conversation", async () => {
      await storage.save(sampleConversation, defaultOptions);
      const retrieved = await storage.get("local-test-123");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("local-test-123");
      expect(retrieved!.metadata.title).toBe("Local Storage Test");
      expect(retrieved!.messages).toHaveLength(2);
    });

    it("should return null for non-existent conversation", async () => {
      const retrieved = await storage.get("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should return null and clean up index if file is missing", async () => {
      await storage.save(sampleConversation, defaultOptions);

      const indexPath = join(testDir, ".conversation-index.json");
      const indexContent = await readFile(indexPath, "utf-8");
      const index = JSON.parse(indexContent);
      const filePath = index[0].filePath;

      await rm(filePath);

      const retrieved = await storage.get("local-test-123");
      expect(retrieved).toBeNull();

      const list = await storage.list();
      expect(list).toHaveLength(0);
    });

    it("should handle JSON format", async () => {
      const options: SaveOptions = { ...defaultOptions, format: "json" };
      await storage.save(sampleConversation, options);
      const retrieved = await storage.get("local-test-123");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.title).toBe("Local Storage Test");
    });
  });

  describe("delete", () => {
    it("should delete a saved conversation", async () => {
      await storage.save(sampleConversation, defaultOptions);
      const deleted = await storage.delete("local-test-123");

      expect(deleted).toBe(true);

      const list = await storage.list();
      expect(list).toHaveLength(0);

      const retrieved = await storage.get("local-test-123");
      expect(retrieved).toBeNull();
    });

    it("should return false for non-existent conversation", async () => {
      const deleted = await storage.delete("non-existent");
      expect(deleted).toBe(false);
    });

    it("should handle missing file gracefully", async () => {
      await storage.save(sampleConversation, defaultOptions);

      const indexPath = join(testDir, ".conversation-index.json");
      const indexContent = await readFile(indexPath, "utf-8");
      const index = JSON.parse(indexContent);
      const filePath = index[0].filePath;

      await rm(filePath);

      const deleted = await storage.delete("local-test-123");
      expect(deleted).toBe(true);
    });
  });

  describe("getFilePath", () => {
    it("should return file path for saved conversation", async () => {
      const result = await storage.save(sampleConversation, defaultOptions);
      const filePath = await storage.getFilePath("local-test-123");

      expect(filePath).toBe(result.filePath);
    });

    it("should return null for non-existent conversation", async () => {
      const filePath = await storage.getFilePath("non-existent");
      expect(filePath).toBeNull();
    });
  });
});

describe("RemoteStorage", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleConversation: Conversation = {
    id: "remote-test-123",
    metadata: {
      title: "Remote Storage Test",
      sourceApp: "TestApp",
      createdAt: "2024-01-15T10:00:00.000Z",
    },
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ],
  };

  const defaultOptions: SaveOptions = {
    format: "markdown",
    includeMetadata: true,
    includeTimestamps: true,
  };

  describe("save", () => {
    it("should POST conversation to remote server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            url: "https://example.com/conversations/remote-test-123",
          }),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.save(sampleConversation, defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/conversations",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );

      expect(result.id).toBe("remote-test-123");
      expect(result.remoteUrl).toBe(
        "https://example.com/conversations/remote-test-123",
      );
    });

    it("should include API key in authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: "https://example.com/test" }),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
        apiKey: "test-api-key",
      });

      await storage.save(sampleConversation, defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });

    it("should include custom headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
        headers: { "X-Custom-Header": "custom-value" },
      });

      await storage.save(sampleConversation, defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom-Header": "custom-value",
          }),
        }),
      );
    });

    it("should throw on failed request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      await expect(storage.save(sampleConversation, defaultOptions)).rejects.toThrow(
        "Failed to save conversation to remote",
      );
    });
  });

  describe("list", () => {
    it("should GET conversations from remote server", async () => {
      const mockConversations = [
        { id: "1", title: "First" },
        { id: "2", title: "Second" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ conversations: mockConversations }),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.list();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/conversations",
        expect.objectContaining({ method: "GET" }),
      );

      expect(result).toEqual(mockConversations);
    });

    it("should throw on failed request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      await expect(storage.list()).rejects.toThrow(
        "Failed to list conversations from remote",
      );
    });
  });

  describe("get", () => {
    it("should GET a specific conversation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ conversation: sampleConversation }),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.get("remote-test-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/conversations/remote-test-123",
        expect.objectContaining({ method: "GET" }),
      );

      expect(result).toEqual(sampleConversation);
    });

    it("should return null for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.get("non-existent");

      expect(result).toBeNull();
    });

    it("should parse content with formatter when content and format provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: JSON.stringify(sampleConversation),
            format: "json",
          }),
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.get("remote-test-123");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("remote-test-123");
    });
  });

  describe("delete", () => {
    it("should DELETE a conversation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.delete("remote-test-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/conversations/remote-test-123",
        expect.objectContaining({ method: "DELETE" }),
      );

      expect(result).toBe(true);
    });

    it("should return false for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      const result = await storage.delete("non-existent");

      expect(result).toBe(false);
    });

    it("should throw on other errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });

      const storage = createRemoteStorage({
        url: "https://example.com/api",
      });

      await expect(storage.delete("test")).rejects.toThrow(
        "Failed to delete conversation from remote",
      );
    });
  });
});
