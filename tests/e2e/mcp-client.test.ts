/**
 * Comprehensive E2E tests using the official MCP SDK Client with Stdio Transport
 *
 * Tests all features of all 5 tools provided by thread-mcp:
 * - save_thread: Save conversations with various options
 * - find_threads: Search and filter threads
 * - update_thread: Modify existing threads
 * - delete_thread: Remove threads
 * - resume_thread: Load threads for continuation
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Helper to parse tool result
function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  const textContent = result.content.find((c) => c.type === "text");
  return JSON.parse(textContent?.text || "{}");
}

describe("MCP Server E2E Tests (Stdio Transport)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeAll(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `mcp-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });

    // Spawn the actual MCP server process
    transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      cwd: process.cwd(),
      stderr: "pipe",
    });

    client = new Client(
      { name: "e2e-test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await rm(testDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Tool Discovery
  // ============================================================================

  describe("Tool Discovery", () => {
    it("should list all 5 tools with correct names", async () => {
      const result = await client.listTools();

      expect(result.tools).toHaveLength(5);

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("save_thread");
      expect(toolNames).toContain("find_threads");
      expect(toolNames).toContain("update_thread");
      expect(toolNames).toContain("delete_thread");
      expect(toolNames).toContain("resume_thread");
    });

    it("should have descriptions and input schemas for all tools", async () => {
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(20);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });

  // ============================================================================
  // save_thread Tool
  // ============================================================================

  describe("save_thread", () => {
    afterEach(async () => {
      // Clean up threads created in tests
      const list = await client.callTool({
        name: "find_threads",
        arguments: { outputDir: testDir, limit: 100 },
      });
      const threads = parseResult(list).threads || [];
      for (const thread of threads) {
        await client.callTool({
          name: "delete_thread",
          arguments: { id: thread.id, outputDir: testDir },
        });
      }
    });

    describe("Basic Functionality", () => {
      it("should save a thread with title and messages", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Basic Thread",
            messages: [
              { role: "user", content: "Hello" },
              { role: "assistant", content: "Hi there!" },
            ],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.title).toBe("Basic Thread");
        expect(parsed.messageCount).toBe(2);
        expect(parsed.id).toBeDefined();
        expect(parsed.destination).toBe("local");
        expect(parsed.filePath).toContain(testDir);
      });

      it("should support all message roles: user, assistant, system", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "All Roles Thread",
            messages: [
              { role: "system", content: "You are a helpful assistant" },
              { role: "user", content: "What is 2+2?" },
              { role: "assistant", content: "2+2 equals 4" },
            ],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(3);
      });
    });

    describe("Format Options", () => {
      it("should save in markdown format", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Markdown Thread",
            messages: [{ role: "user", content: "Test" }],
            format: "markdown",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.format).toBe("markdown");
        expect(parsed.filePath).toMatch(/\.md$/);
      });

      it("should save in JSON format", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "JSON Thread",
            messages: [{ role: "user", content: "Test" }],
            format: "json",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.format).toBe("json");
        expect(parsed.filePath).toMatch(/\.json$/);
      });
    });

    describe("Metadata Options", () => {
      it("should save with sourceApp metadata", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Claude Chat",
            messages: [{ role: "user", content: "Hello" }],
            sourceApp: "Claude",
            outputDir: testDir,
          },
        });

        expect(parseResult(result).success).toBe(true);

        // Verify by finding the thread
        const found = await client.callTool({
          name: "find_threads",
          arguments: { title: "Claude Chat", outputDir: testDir },
        });
        expect(parseResult(found).threads[0].sourceApp).toBe("Claude");
      });

      it("should save with tags", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Tagged Thread",
            messages: [{ role: "user", content: "Hello" }],
            tags: ["typescript", "testing", "mcp"],
            outputDir: testDir,
          },
        });

        expect(parseResult(result).success).toBe(true);

        const found = await client.callTool({
          name: "find_threads",
          arguments: { title: "Tagged Thread", outputDir: testDir },
        });
        expect(parseResult(found).threads[0].tags).toEqual([
          "typescript",
          "testing",
          "mcp",
        ]);
      });

      it("should save with summary", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Summarized Thread",
            messages: [{ role: "user", content: "Complex discussion" }],
            summary: "A discussion about software architecture patterns",
            outputDir: testDir,
          },
        });

        expect(parseResult(result).success).toBe(true);

        const found = await client.callTool({
          name: "find_threads",
          arguments: { title: "Summarized Thread", outputDir: testDir },
        });
        expect(parseResult(found).threads[0].summary).toBe(
          "A discussion about software architecture patterns",
        );
      });

      it("should save with message timestamps", async () => {
        const timestamp = new Date().toISOString();
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Timestamped Thread",
            messages: [
              { role: "user", content: "Hello", timestamp },
              { role: "assistant", content: "Hi", timestamp },
            ],
            outputDir: testDir,
          },
        });

        expect(parseResult(result).success).toBe(true);
      });

      it("should save with all metadata combined", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Full Metadata Thread",
            messages: [
              { role: "system", content: "System prompt" },
              { role: "user", content: "User question" },
              { role: "assistant", content: "Assistant answer" },
            ],
            sourceApp: "Claude Code",
            tags: ["coding", "refactoring"],
            summary: "Code refactoring discussion",
            format: "json",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.format).toBe("json");
        expect(parsed.messageCount).toBe(3);
      });
    });

    describe("Error Handling", () => {
      it("should reject invalid message roles", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Invalid Role",
            messages: [{ role: "invalid_role", content: "Test" }],
            outputDir: testDir,
          },
        });

        expect(result.isError).toBe(true);
      });

      it("should handle empty messages array", async () => {
        const result = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Empty Messages",
            messages: [],
            outputDir: testDir,
          },
        });

        // Empty messages array is allowed - thread is saved with 0 messages
        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(0);
      });
    });
  });

  // ============================================================================
  // find_threads Tool
  // ============================================================================

  describe("find_threads", () => {
    // Setup test data
    beforeEach(async () => {
      // Create several threads with different properties
      await client.callTool({
        name: "save_thread",
        arguments: {
          title: "TypeScript Tutorial",
          messages: [
            { role: "user", content: "Explain TypeScript generics" },
            {
              role: "assistant",
              content: "Generics allow you to write reusable code...",
            },
          ],
          tags: ["typescript", "tutorial", "programming"],
          sourceApp: "Claude",
          summary: "Learning about TypeScript generics",
          outputDir: testDir,
        },
      });

      await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Python Debugging",
          messages: [
            { role: "user", content: "I have a bug in my Python code" },
            { role: "assistant", content: "Let me help you debug that..." },
          ],
          tags: ["python", "debugging", "programming"],
          sourceApp: "ChatGPT",
          summary: "Debugging a Python script",
          outputDir: testDir,
        },
      });

      await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Recipe Discussion",
          messages: [
            { role: "user", content: "What's a good pasta recipe?" },
            { role: "assistant", content: "Here's a simple carbonara recipe..." },
          ],
          tags: ["cooking", "recipes"],
          sourceApp: "Claude",
          outputDir: testDir,
        },
      });
    });

    afterEach(async () => {
      // Clean up all threads
      const list = await client.callTool({
        name: "find_threads",
        arguments: { outputDir: testDir, limit: 100 },
      });
      const threads = parseResult(list).threads || [];
      for (const thread of threads) {
        await client.callTool({
          name: "delete_thread",
          arguments: { id: thread.id, outputDir: testDir },
        });
      }
    });

    describe("Listing", () => {
      it("should list all threads", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(3);
        expect(parsed.threads).toHaveLength(3);
      });

      it("should respect limit parameter", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { outputDir: testDir, limit: 2 },
        });

        const parsed = parseResult(result);
        expect(parsed.threads).toHaveLength(2);
      });
    });

    describe("Finding by ID", () => {
      it("should find a thread by ID", async () => {
        // First get the list to get an ID
        const list = await client.callTool({
          name: "find_threads",
          arguments: { outputDir: testDir },
        });
        const threadId = parseResult(list).threads[0].id;

        // Find by ID
        const result = await client.callTool({
          name: "find_threads",
          arguments: { id: threadId, outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(true);
        expect(parsed.thread).toBeDefined();
        expect(parsed.thread.id).toBe(threadId);
      });

      it("should return not found for non-existent ID", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { id: "non-existent-id", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(false);
      });
    });

    describe("Finding by Title", () => {
      it("should find by exact title match", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { title: "TypeScript Tutorial", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(1);
        expect(parsed.threads[0].title).toBe("TypeScript Tutorial");
      });

      it("should find by titleContains (case insensitive)", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { titleContains: "typescript", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(1);
        expect(parsed.threads[0].title).toBe("TypeScript Tutorial");
      });
    });

    describe("Query Search", () => {
      it("should search in title", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { query: "Tutorial", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBeGreaterThanOrEqual(1);
      });

      it("should search in content", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { query: "generics", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(1);
        expect(parsed.threads[0].title).toBe("TypeScript Tutorial");
      });

      it("should search in summary", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { query: "Debugging", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBeGreaterThanOrEqual(1);
      });
    });

    describe("Filtering", () => {
      it("should filter by tags (must have ALL)", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: {
            tags: ["programming", "typescript"],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(1);
        expect(parsed.threads[0].title).toBe("TypeScript Tutorial");
      });

      it("should filter by sourceApp", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { sourceApp: "ChatGPT", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(1);
        expect(parsed.threads[0].title).toBe("Python Debugging");
      });

      it("should return empty when no tags match", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { tags: ["nonexistent"], outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.totalResults).toBe(0);
      });
    });

    describe("Output Options", () => {
      it("should include content when requested", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: {
            title: "TypeScript Tutorial",
            includeContent: true,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.threads[0].content).toBeDefined();
        expect(parsed.threads[0].content.messages).toHaveLength(2);
      });

      it("should include relevance info by default", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: { query: "TypeScript", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.threads[0].relevance).toBeDefined();
        expect(parsed.threads[0].relevance.score).toBeDefined();
        expect(parsed.threads[0].relevance.matchedFields).toBeDefined();
      });

      it("should omit relevance info when disabled", async () => {
        const result = await client.callTool({
          name: "find_threads",
          arguments: {
            query: "TypeScript",
            includeRelevanceInfo: false,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.threads[0].relevance).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // update_thread Tool
  // ============================================================================

  describe("update_thread", () => {
    let savedThreadId: string;
    let savedThreadTitle: string;

    beforeEach(async () => {
      const result = await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Thread to Update",
          messages: [
            { role: "user", content: "Original message 1" },
            { role: "assistant", content: "Original message 2" },
          ],
          tags: ["original"],
          summary: "Original summary",
          format: "markdown",
          outputDir: testDir,
        },
      });

      const parsed = parseResult(result);
      savedThreadId = parsed.id;
      savedThreadTitle = parsed.title;
    });

    afterEach(async () => {
      // Clean up
      const list = await client.callTool({
        name: "find_threads",
        arguments: { outputDir: testDir, limit: 100 },
      });
      const threads = parseResult(list).threads || [];
      for (const thread of threads) {
        await client.callTool({
          name: "delete_thread",
          arguments: { id: thread.id, outputDir: testDir },
        });
      }
    });

    describe("Finding Thread", () => {
      it("should update thread found by ID", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "New message" }],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.id).toBe(savedThreadId);
      });

      it("should update thread found by title", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            title: savedThreadTitle,
            messages: [{ role: "user", content: "New message" }],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.title).toBe(savedThreadTitle);
      });

      it("should return error for non-existent title", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            title: "Non-existent Thread",
            messages: [{ role: "user", content: "New message" }],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("not found");
      });
    });

    describe("Append Mode", () => {
      it("should append messages by default", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [
              { role: "user", content: "Follow-up question" },
              { role: "assistant", content: "Follow-up answer" },
            ],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(4); // 2 original + 2 new
        expect(parsed.messagesAdded).toBe(2);
        expect(parsed.mode).toBe("append");
      });

      it("should deduplicate by default when appending", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [
              { role: "user", content: "Original message 1" }, // Duplicate
              { role: "user", content: "New unique message" },
            ],
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(3); // 2 original + 1 new (duplicate skipped)
        expect(parsed.messagesAdded).toBe(1);
      });

      it("should not deduplicate when disabled", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [
              { role: "user", content: "Original message 1" }, // Duplicate
            ],
            deduplicate: false,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(3); // 2 original + 1 duplicate
      });
    });

    describe("Replace Mode", () => {
      it("should replace all messages in replace mode", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "Completely new message" }],
            mode: "replace",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.messageCount).toBe(1);
        expect(parsed.mode).toBe("replace");
      });
    });

    describe("Metadata Updates", () => {
      it("should update title", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "Placeholder" }],
            newTitle: "Updated Thread Title",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.success).toBe(true);
        expect(parsed.title).toBe("Updated Thread Title");
      });

      it("should update tags", async () => {
        await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "Placeholder" }],
            newTags: ["updated", "new-tags"],
            outputDir: testDir,
          },
        });

        // Verify tags were updated
        const found = await client.callTool({
          name: "find_threads",
          arguments: { id: savedThreadId, outputDir: testDir },
        });

        expect(parseResult(found).thread.tags).toEqual(["updated", "new-tags"]);
      });

      it("should update summary", async () => {
        await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "Placeholder" }],
            newSummary: "This is the updated summary",
            outputDir: testDir,
          },
        });

        // Verify summary was updated
        const found = await client.callTool({
          name: "find_threads",
          arguments: { id: savedThreadId, outputDir: testDir },
        });

        expect(parseResult(found).thread.summary).toBe("This is the updated summary");
      });
    });

    describe("Format Handling", () => {
      it("should preserve original format when not specified", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "New message" }],
            outputDir: testDir,
          },
        });

        expect(parseResult(result).format).toBe("markdown");
      });

      it("should change format when specified", async () => {
        const result = await client.callTool({
          name: "update_thread",
          arguments: {
            id: savedThreadId,
            messages: [{ role: "user", content: "New message" }],
            format: "json",
            outputDir: testDir,
          },
        });

        expect(parseResult(result).format).toBe("json");
      });
    });
  });

  // ============================================================================
  // delete_thread Tool
  // ============================================================================

  describe("delete_thread", () => {
    describe("Delete by ID", () => {
      it("should delete a thread by ID", async () => {
        // Create a thread
        const saveResult = await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Thread to Delete by ID",
            messages: [{ role: "user", content: "Delete me" }],
            outputDir: testDir,
          },
        });
        const threadId = parseResult(saveResult).id;

        // Delete it
        const result = await client.callTool({
          name: "delete_thread",
          arguments: { id: threadId, outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.deleted).toBe(true);
        expect(parsed.id).toBe(threadId);
        expect(parsed.title).toBe("Thread to Delete by ID");

        // Verify it's gone
        const found = await client.callTool({
          name: "find_threads",
          arguments: { id: threadId, outputDir: testDir },
        });
        expect(parseResult(found).found).toBe(false);
      });

      it("should return deleted=false for non-existent ID", async () => {
        const result = await client.callTool({
          name: "delete_thread",
          arguments: { id: "non-existent-id", outputDir: testDir },
        });

        expect(parseResult(result).deleted).toBe(false);
      });
    });

    describe("Delete by Title", () => {
      it("should delete a thread by exact title", async () => {
        // Create a thread
        await client.callTool({
          name: "save_thread",
          arguments: {
            title: "Thread to Delete by Title",
            messages: [{ role: "user", content: "Delete me" }],
            outputDir: testDir,
          },
        });

        // Delete by title
        const result = await client.callTool({
          name: "delete_thread",
          arguments: { title: "Thread to Delete by Title", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.deleted).toBe(true);
        expect(parsed.title).toBe("Thread to Delete by Title");
      });

      it("should return error for non-existent title", async () => {
        const result = await client.callTool({
          name: "delete_thread",
          arguments: { title: "Non-existent Title", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.deleted).toBe(false);
        expect(parsed.error).toContain("not found");
      });
    });

    describe("Error Handling", () => {
      it("should require either id or title", async () => {
        const result = await client.callTool({
          name: "delete_thread",
          arguments: { outputDir: testDir },
        });

        expect(result.isError).toBe(true);
      });
    });
  });

  // ============================================================================
  // resume_thread Tool
  // ============================================================================

  describe("resume_thread", () => {
    let savedThreadId: string;

    beforeEach(async () => {
      const result = await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Resume Test Thread",
          messages: [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: "What is the meaning of life?" },
            { role: "assistant", content: "The meaning of life is subjective..." },
            { role: "user", content: "Can you elaborate?" },
            { role: "assistant", content: "Certainly! Many philosophers..." },
          ],
          tags: ["philosophy", "discussion"],
          summary: "Deep philosophical discussion",
          sourceApp: "Claude",
          outputDir: testDir,
        },
      });

      savedThreadId = parseResult(result).id;

      // Create another thread for titleContains tests
      await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Another Philosophy Thread",
          messages: [{ role: "user", content: "What is consciousness?" }],
          outputDir: testDir,
        },
      });
    });

    afterEach(async () => {
      // Clean up
      const list = await client.callTool({
        name: "find_threads",
        arguments: { outputDir: testDir, limit: 100 },
      });
      const threads = parseResult(list).threads || [];
      for (const thread of threads) {
        await client.callTool({
          name: "delete_thread",
          arguments: { id: thread.id, outputDir: testDir },
        });
      }
    });

    describe("Finding Thread", () => {
      it("should find by ID", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { id: savedThreadId, outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(true);
        expect(parsed.id).toBe(savedThreadId);
      });

      it("should find by exact title", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { title: "Resume Test Thread", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(true);
        // For structured format (default), title is in context.title
        expect(parsed.context.title).toBe("Resume Test Thread");
      });

      it("should find by titleContains", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { titleContains: "Resume", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(true);
        // For structured format (default), title is in context.title
        expect(parsed.context.title).toContain("Resume");
      });

      it("should return not found for non-existent thread", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { title: "Non-existent Thread", outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.found).toBe(false);
        expect(parsed.error).toBeDefined();
      });
    });

    describe("Format: structured (default)", () => {
      it("should return structured context by default", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { id: savedThreadId, outputDir: testDir },
        });

        const parsed = parseResult(result);
        expect(parsed.format).toBe("structured");
        expect(parsed.context).toBeDefined();
        expect(parsed.context.title).toBe("Resume Test Thread");
        expect(parsed.context.summary).toBe("Deep philosophical discussion");
        expect(parsed.context.tags).toEqual(["philosophy", "discussion"]);
        expect(parsed.context.sourceApp).toBe("Claude");
        expect(parsed.context.messageCount).toBe(5);
        expect(parsed.messages).toHaveLength(5);
        expect(parsed.continuationHint).toBeDefined();
      });

      it("should provide appropriate continuation hint based on last message", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { id: savedThreadId, outputDir: testDir },
        });

        const parsed = parseResult(result);
        // Last message is from assistant
        expect(parsed.continuationHint).toContain("follow-up");
      });
    });

    describe("Format: narrative", () => {
      it("should return narrative format when requested", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: {
            id: savedThreadId,
            format: "narrative",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.format).toBe("narrative");
        expect(parsed.content).toBeDefined();
        expect(parsed.content).toContain("# Resuming:");
        expect(parsed.content).toContain("Resume Test Thread");
        expect(parsed.content).toContain("**Summary:**");
        expect(parsed.content).toContain("**Topics:**");
        expect(parsed.content).toContain("## Previous Conversation");
      });
    });

    describe("Format: messages", () => {
      it("should return raw messages when requested", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: {
            id: savedThreadId,
            format: "messages",
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.format).toBe("messages");
        expect(parsed.messages).toHaveLength(5);
        expect(parsed.messages[0].role).toBe("system");
        expect(parsed.totalMessages).toBe(5);
      });
    });

    describe("maxMessages Option", () => {
      it("should limit messages in structured format", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: {
            id: savedThreadId,
            format: "structured",
            maxMessages: 2,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.messages).toHaveLength(2);
        expect(parsed.totalMessages).toBe(5);
        // Should be the last 2 messages
        expect(parsed.messages[0].role).toBe("user");
        expect(parsed.messages[1].role).toBe("assistant");
      });

      it("should limit messages in narrative format", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: {
            id: savedThreadId,
            format: "narrative",
            maxMessages: 2,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.content).toContain("Showing last 2 of 5 messages");
      });

      it("should limit messages in messages format", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: {
            id: savedThreadId,
            format: "messages",
            maxMessages: 3,
            outputDir: testDir,
          },
        });

        const parsed = parseResult(result);
        expect(parsed.messages).toHaveLength(3);
        expect(parsed.totalMessages).toBe(5);
      });
    });

    describe("Error Handling", () => {
      it("should require one of id, title, or titleContains", async () => {
        const result = await client.callTool({
          name: "resume_thread",
          arguments: { outputDir: testDir },
        });

        expect(result.isError).toBe(true);
      });
    });
  });

  // ============================================================================
  // Integration: Full Workflow Tests
  // ============================================================================

  describe("Full Workflow Integration", () => {
    afterEach(async () => {
      // Clean up
      const list = await client.callTool({
        name: "find_threads",
        arguments: { outputDir: testDir, limit: 100 },
      });
      const threads = parseResult(list).threads || [];
      for (const thread of threads) {
        await client.callTool({
          name: "delete_thread",
          arguments: { id: thread.id, outputDir: testDir },
        });
      }
    });

    it("should handle complete conversation lifecycle", async () => {
      // 1. Save initial conversation
      const saveResult = await client.callTool({
        name: "save_thread",
        arguments: {
          title: "Lifecycle Test",
          messages: [
            { role: "user", content: "Start of conversation" },
            { role: "assistant", content: "Beginning acknowledged" },
          ],
          tags: ["test"],
          summary: "Testing full lifecycle",
          sourceApp: "Test Suite",
          outputDir: testDir,
        },
      });

      const saved = parseResult(saveResult);
      expect(saved.success).toBe(true);
      const threadId = saved.id;

      // 2. Find the thread
      const findResult = await client.callTool({
        name: "find_threads",
        arguments: { query: "Lifecycle", includeContent: true, outputDir: testDir },
      });

      const found = parseResult(findResult);
      expect(found.totalResults).toBe(1);
      expect(found.threads[0].content.messages).toHaveLength(2);

      // 3. Update with more messages
      const updateResult = await client.callTool({
        name: "update_thread",
        arguments: {
          id: threadId,
          messages: [
            { role: "user", content: "Follow-up question" },
            { role: "assistant", content: "Follow-up answer" },
          ],
          outputDir: testDir,
        },
      });

      const updated = parseResult(updateResult);
      expect(updated.messageCount).toBe(4);

      // 4. Resume the conversation
      const resumeResult = await client.callTool({
        name: "resume_thread",
        arguments: { id: threadId, outputDir: testDir },
      });

      const resumed = parseResult(resumeResult);
      expect(resumed.found).toBe(true);
      expect(resumed.messages).toHaveLength(4);
      expect(resumed.context.summary).toBe("Testing full lifecycle");

      // 5. Update metadata
      const metadataResult = await client.callTool({
        name: "update_thread",
        arguments: {
          id: threadId,
          messages: [],
          mode: "append",
          newTitle: "Updated Lifecycle Test",
          newTags: ["test", "updated"],
          newSummary: "Updated summary after modifications",
          outputDir: testDir,
        },
      });

      expect(parseResult(metadataResult).title).toBe("Updated Lifecycle Test");

      // 6. Verify all changes
      const verifyResult = await client.callTool({
        name: "find_threads",
        arguments: { id: threadId, includeContent: true, outputDir: testDir },
      });

      const verified = parseResult(verifyResult);
      expect(verified.thread.title).toBe("Updated Lifecycle Test");
      expect(verified.thread.tags).toContain("updated");
      expect(verified.thread.summary).toBe("Updated summary after modifications");

      // 7. Delete the thread
      const deleteResult = await client.callTool({
        name: "delete_thread",
        arguments: { id: threadId, outputDir: testDir },
      });

      expect(parseResult(deleteResult).deleted).toBe(true);

      // 8. Confirm deletion
      const confirmResult = await client.callTool({
        name: "find_threads",
        arguments: { id: threadId, outputDir: testDir },
      });

      expect(parseResult(confirmResult).found).toBe(false);
    });

    it("should handle multiple concurrent threads", async () => {
      // Create multiple threads
      const titles = ["Thread A", "Thread B", "Thread C"];

      for (const title of titles) {
        await client.callTool({
          name: "save_thread",
          arguments: {
            title,
            messages: [{ role: "user", content: `Content for ${title}` }],
            tags: ["concurrent"],
            outputDir: testDir,
          },
        });
      }

      // Verify all exist
      const listResult = await client.callTool({
        name: "find_threads",
        arguments: { tags: ["concurrent"], outputDir: testDir },
      });

      expect(parseResult(listResult).totalResults).toBe(3);

      // Update all of them
      const threads = parseResult(listResult).threads;
      for (const thread of threads) {
        await client.callTool({
          name: "update_thread",
          arguments: {
            id: thread.id,
            messages: [{ role: "assistant", content: `Response for ${thread.title}` }],
            outputDir: testDir,
          },
        });
      }

      // Verify updates
      for (const thread of threads) {
        const found = await client.callTool({
          name: "find_threads",
          arguments: { id: thread.id, includeContent: true, outputDir: testDir },
        });

        expect(parseResult(found).thread.content.messages).toHaveLength(2);
      }
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe("Error Handling", () => {
    it("should return error for unknown tool", async () => {
      const result = await client.callTool({
        name: "unknown_tool",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const parsed = parseResult(result);
      expect(parsed.error).toContain("Unknown tool");
    });
  });
});
