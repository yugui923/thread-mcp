import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveThread, SaveThreadInputSchema } from "../../src/tools/save-thread.js";
import { findThreads, FindThreadsInputSchema } from "../../src/tools/find-threads.js";
import {
  updateThread,
  UpdateThreadInputSchema,
} from "../../src/tools/update-thread.js";
import {
  deleteThread,
  DeleteThreadInputSchema,
} from "../../src/tools/delete-thread.js";
import {
  resumeThread,
  ResumeThreadInputSchema,
} from "../../src/tools/resume-thread.js";

describe("Tool Input Schemas", () => {
  describe("SaveThreadInputSchema", () => {
    it("should validate correct input", () => {
      const input = {
        title: "Test Thread",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" },
        ],
      };

      const result = SaveThreadInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should apply default values", () => {
      const input = {
        title: "Test",
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = SaveThreadInputSchema.parse(input);
      // destination and format are now optional (defaults from env vars)
      expect(result.destination).toBeUndefined();
      expect(result.format).toBeUndefined();
      // These still have schema defaults
      expect(result.includeMetadata).toBe(true);
      expect(result.includeTimestamps).toBe(true);
    });

    it("should accept remote destination with URL", () => {
      const input = {
        title: "Test",
        messages: [{ role: "user", content: "Hello" }],
        destination: "remote",
        remoteUrl: "https://example.com/api",
      };

      const result = SaveThreadInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("FindThreadsInputSchema", () => {
    it("should validate empty input for listing all", () => {
      const result = FindThreadsInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should apply default values", () => {
      const result = FindThreadsInputSchema.parse({});
      // source is now optional (defaults from env vars)
      expect(result.source).toBeUndefined();
      // These still have schema defaults
      expect(result.includeContent).toBe(false);
      expect(result.includeRelevanceInfo).toBe(true);
      expect(result.limit).toBe(10);
    });

    it("should accept ID lookup", () => {
      const result = FindThreadsInputSchema.parse({ id: "test-123" });
      expect(result.id).toBe("test-123");
    });

    it("should accept search query", () => {
      const result = FindThreadsInputSchema.parse({
        query: "Python debugging",
        tags: ["code"],
        includeContent: true,
      });
      expect(result.query).toBe("Python debugging");
    });
  });

  describe("UpdateThreadInputSchema", () => {
    it("should validate update by ID", () => {
      const input = {
        id: "test-123",
        messages: [{ role: "user", content: "New message" }],
      };

      const result = UpdateThreadInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should validate update by title", () => {
      const input = {
        title: "My Thread",
        messages: [{ role: "user", content: "New message" }],
      };

      const result = UpdateThreadInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should apply default mode as append", () => {
      const result = UpdateThreadInputSchema.parse({
        id: "test",
        messages: [],
      });
      expect(result.mode).toBe("append");
      expect(result.deduplicate).toBe(true);
    });
  });

  describe("DeleteThreadInputSchema", () => {
    it("should validate delete by ID", () => {
      const result = DeleteThreadInputSchema.safeParse({ id: "test-123" });
      expect(result.success).toBe(true);
    });

    it("should validate delete by title", () => {
      const result = DeleteThreadInputSchema.safeParse({ title: "My Thread" });
      expect(result.success).toBe(true);
    });
  });

  describe("ResumeThreadInputSchema", () => {
    it("should validate resume by ID", () => {
      const result = ResumeThreadInputSchema.safeParse({ id: "test-123" });
      expect(result.success).toBe(true);
    });

    it("should validate resume by titleContains", () => {
      const result = ResumeThreadInputSchema.safeParse({ titleContains: "Python" });
      expect(result.success).toBe(true);
    });

    it("should apply default format", () => {
      const result = ResumeThreadInputSchema.parse({ id: "test" });
      expect(result.format).toBe("structured");
      expect(result.includeSummary).toBe(true);
    });
  });
});

describe("Tool Handlers", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `thread-tools-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("saveThread", () => {
    it("should save a thread locally", async () => {
      const result = await saveThread({
        title: "Test Save",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
        destination: "local",
        format: "markdown",
        outputDir: testDir,
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.title).toBe("Test Save");
      expect(result.destination).toBe("local");
      expect(result.format).toBe("markdown");
      expect(result.messageCount).toBe(2);
    });

    it("should save in JSON format", async () => {
      const result = await saveThread({
        title: "JSON Test",
        messages: [{ role: "user", content: "Test" }],
        destination: "local",
        format: "json",
        outputDir: testDir,
        includeMetadata: true,
        includeTimestamps: true,
      });

      expect(result.format).toBe("json");
    });

    it("should require remoteUrl for remote destination", async () => {
      await expect(
        saveThread({
          title: "Remote Test",
          messages: [{ role: "user", content: "Test" }],
          destination: "remote",
          format: "markdown",
          includeMetadata: true,
          includeTimestamps: true,
        }),
      ).rejects.toThrow("Remote URL is required");
    });
  });

  describe("findThreads", () => {
    beforeEach(async () => {
      // Create test threads
      await saveThread({
        title: "Python Debugging",
        messages: [
          { role: "user", content: "Help me debug this Python code" },
          { role: "assistant", content: "Let me help you" },
        ],
        tags: ["python", "debugging"],
        sourceApp: "Claude",
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      await saveThread({
        title: "JavaScript Tutorial",
        messages: [{ role: "user", content: "Explain async/await" }],
        tags: ["javascript"],
        sourceApp: "Claude",
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });
    });

    it("should list all threads", async () => {
      const result = await findThreads({
        outputDir: testDir,
      });

      expect(result.totalResults).toBe(2);
      expect(result.threads).toHaveLength(2);
    });

    it("should find by ID", async () => {
      const list = await findThreads({ outputDir: testDir });
      const threadId = list.threads[0].id;

      const result = await findThreads({
        id: threadId,
        outputDir: testDir,
      });

      expect(result.found).toBe(true);
      expect(result.thread).toBeDefined();
    });

    it("should search by query", async () => {
      const result = await findThreads({
        query: "Python",
        outputDir: testDir,
      });

      expect(result.totalResults).toBe(1);
      expect(result.threads[0].title).toBe("Python Debugging");
    });

    it("should filter by tags", async () => {
      const result = await findThreads({
        tags: ["debugging"],
        outputDir: testDir,
      });

      expect(result.totalResults).toBe(1);
      expect(result.threads[0].title).toBe("Python Debugging");
    });

    it("should include content when requested", async () => {
      const result = await findThreads({
        includeContent: true,
        outputDir: testDir,
      });

      expect(result.threads[0].content).toBeDefined();
      expect(result.threads[0].content!.messages.length).toBeGreaterThan(0);
    });

    it("should return not found for invalid ID", async () => {
      const result = await findThreads({
        id: "non-existent-id",
        outputDir: testDir,
      });

      expect(result.found).toBe(false);
    });
  });

  describe("updateThread", () => {
    it("should append messages by ID", async () => {
      const saved = await saveThread({
        title: "Update Test",
        messages: [{ role: "user", content: "Hello" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await updateThread({
        id: saved.id,
        messages: [
          { role: "assistant", content: "Hi!" },
          { role: "user", content: "How are you?" },
        ],
        mode: "append",
        outputDir: testDir,
        deduplicate: true,
      });

      expect(result.success).toBe(true);
      expect(result.messageCount).toBe(3);
      expect(result.messagesAdded).toBe(2);
    });

    it("should find and update by title", async () => {
      await saveThread({
        title: "Title Lookup Test",
        messages: [{ role: "user", content: "Original" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await updateThread({
        title: "Title Lookup Test",
        messages: [{ role: "assistant", content: "Response" }],
        mode: "append",
        outputDir: testDir,
        deduplicate: true,
      });

      expect(result.success).toBe(true);
      expect(result.messageCount).toBe(2);
    });

    it("should deduplicate messages", async () => {
      const saved = await saveThread({
        title: "Dedup Test",
        messages: [{ role: "user", content: "Hello" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await updateThread({
        id: saved.id,
        messages: [
          { role: "user", content: "Hello" }, // duplicate
          { role: "assistant", content: "New response" },
        ],
        mode: "append",
        deduplicate: true,
        outputDir: testDir,
      });

      expect(result.messageCount).toBe(2); // 1 original + 1 new (duplicate skipped)
      expect(result.messagesAdded).toBe(1);
    });

    it("should replace messages in replace mode", async () => {
      const saved = await saveThread({
        title: "Replace Test",
        messages: [
          { role: "user", content: "Old 1" },
          { role: "assistant", content: "Old 2" },
        ],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await updateThread({
        id: saved.id,
        messages: [{ role: "user", content: "New single message" }],
        mode: "replace",
        outputDir: testDir,
        deduplicate: true,
      });

      expect(result.messageCount).toBe(1);
      expect(result.mode).toBe("replace");
    });

    it("should update metadata", async () => {
      const saved = await saveThread({
        title: "Original Title",
        messages: [{ role: "user", content: "Test" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await updateThread({
        id: saved.id,
        messages: [],
        newTitle: "New Title",
        newTags: ["new-tag"],
        newSummary: "New summary",
        outputDir: testDir,
        deduplicate: true,
      });

      expect(result.success).toBe(true);
      expect(result.title).toBe("New Title");
    });

    it("should return error for non-existent thread", async () => {
      const result = await updateThread({
        id: "non-existent",
        messages: [{ role: "user", content: "Test" }],
        outputDir: testDir,
        deduplicate: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should require id or title", async () => {
      await expect(
        updateThread({
          messages: [{ role: "user", content: "Test" }],
          outputDir: testDir,
          deduplicate: true,
        }),
      ).rejects.toThrow("Either 'id' or 'title' must be provided");
    });
  });

  describe("deleteThread", () => {
    it("should delete by ID", async () => {
      const saved = await saveThread({
        title: "Delete Test",
        messages: [{ role: "user", content: "Delete me" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await deleteThread({
        id: saved.id,
        outputDir: testDir,
      });

      expect(result.deleted).toBe(true);
      expect(result.title).toBe("Delete Test");

      // Verify deleted
      const find = await findThreads({ id: saved.id, outputDir: testDir });
      expect(find.found).toBe(false);
    });

    it("should delete by title", async () => {
      await saveThread({
        title: "Delete By Title",
        messages: [{ role: "user", content: "Test" }],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });

      const result = await deleteThread({
        title: "Delete By Title",
        outputDir: testDir,
      });

      expect(result.deleted).toBe(true);
    });

    it("should return false for non-existent", async () => {
      const result = await deleteThread({
        id: "non-existent",
        outputDir: testDir,
      });

      expect(result.deleted).toBe(false);
    });

    it("should require id or title", async () => {
      await expect(deleteThread({ outputDir: testDir })).rejects.toThrow(
        "Either 'id' or 'title' must be provided",
      );
    });
  });

  describe("resumeThread", () => {
    beforeEach(async () => {
      await saveThread({
        title: "Resume Test Thread",
        messages: [
          { role: "user", content: "What is Python?" },
          { role: "assistant", content: "Python is a programming language." },
          { role: "user", content: "Tell me more" },
        ],
        summary: "Discussion about Python",
        tags: ["python", "programming"],
        outputDir: testDir,
        destination: "local",
        format: "markdown",
        includeMetadata: true,
        includeTimestamps: true,
      });
    });

    it("should resume by title", async () => {
      const result = await resumeThread({
        title: "Resume Test Thread",
        outputDir: testDir,
      });

      expect(result.found).toBe(true);
      expect(result.format).toBe("structured");
      expect(result.context).toBeDefined();
      expect(result.messages).toHaveLength(3);
    });

    it("should resume by titleContains", async () => {
      const result = await resumeThread({
        titleContains: "Resume Test",
        outputDir: testDir,
      });

      expect(result.found).toBe(true);
    });

    it("should return narrative format", async () => {
      const result = await resumeThread({
        title: "Resume Test Thread",
        format: "narrative",
        outputDir: testDir,
      });

      expect(result.found).toBe(true);
      expect(result.format).toBe("narrative");
      expect(result.content).toContain("Resuming:");
      expect(result.content).toContain("Python is a programming language");
    });

    it("should return messages format", async () => {
      const result = await resumeThread({
        title: "Resume Test Thread",
        format: "messages",
        outputDir: testDir,
      });

      expect(result.found).toBe(true);
      expect(result.format).toBe("messages");
      expect(result.messages).toHaveLength(3);
    });

    it("should limit messages", async () => {
      const result = await resumeThread({
        title: "Resume Test Thread",
        maxMessages: 2,
        format: "messages",
        outputDir: testDir,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.totalMessages).toBe(3);
    });

    it("should return not found for invalid lookup", async () => {
      const result = await resumeThread({
        title: "Non Existent",
        outputDir: testDir,
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should require a lookup method", async () => {
      await expect(resumeThread({ outputDir: testDir })).rejects.toThrow(
        "One of 'id', 'title', or 'titleContains' must be provided",
      );
    });
  });
});

describe("Remote Storage", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should save thread to remote", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: "https://example.com/threads/123" }),
    });

    const result = await saveThread({
      title: "Remote Test",
      messages: [{ role: "user", content: "Hello" }],
      destination: "remote",
      remoteUrl: "https://example.com/api",
      format: "markdown",
      includeMetadata: true,
      includeTimestamps: true,
    });

    expect(result.success).toBe(true);
    expect(result.destination).toBe("remote");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/conversations",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
