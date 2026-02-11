import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../../src/server.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

describe("MCP Server", () => {
  let server: Server;
  let testDir: string;

  beforeEach(async () => {
    server = createServer();
    testDir = join(tmpdir(), `mcp-server-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("ListTools", () => {
    it("should list all 5 tools", async () => {
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/list");

      const response = await handler!({ method: "tools/list", params: {} }, {});

      expect(response.tools).toBeDefined();
      expect(response.tools.length).toBe(5);

      const toolNames = response.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("save_thread");
      expect(toolNames).toContain("find_threads");
      expect(toolNames).toContain("update_thread");
      expect(toolNames).toContain("delete_thread");
      expect(toolNames).toContain("resume_thread");
    });

    it("should have descriptions for all tools", async () => {
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/list");

      const response = await handler!({ method: "tools/list", params: {} }, {});

      for (const tool of response.tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe("CallTool", () => {
    const getHandler = () =>
      (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

    describe("save_thread", () => {
      it("should save a thread", async () => {
        const handler = getHandler();

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Test Thread",
                messages: [
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.success).toBe(true);
        expect(result.title).toBe("Test Thread");
        expect(result.messageCount).toBe(2);
      });

      it("should handle validation errors", async () => {
        const handler = getHandler();

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Test",
                messages: [{ role: "invalid", content: "Test" }],
              },
            },
          },
          {},
        );

        expect(response.isError).toBe(true);
      });
    });

    describe("find_threads", () => {
      beforeEach(async () => {
        const handler = getHandler();
        await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Find Test 1",
                messages: [{ role: "user", content: "First thread" }],
                tags: ["test"],
                outputDir: testDir,
              },
            },
          },
          {},
        );
        await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Find Test 2",
                messages: [{ role: "user", content: "Second thread" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );
      });

      it("should list all threads", async () => {
        const handler = getHandler();

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "find_threads",
              arguments: { outputDir: testDir },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.totalResults).toBe(2);
      });

      it("should find by ID", async () => {
        const handler = getHandler();

        // Get list first
        const listResponse = await handler!(
          {
            method: "tools/call",
            params: {
              name: "find_threads",
              arguments: { outputDir: testDir },
            },
          },
          {},
        );
        const list = JSON.parse(listResponse.content[0].text);
        const threadId = list.threads[0].id;

        // Find by ID
        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "find_threads",
              arguments: { id: threadId, outputDir: testDir },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.found).toBe(true);
        expect(result.thread).toBeDefined();
      });

      it("should search by query", async () => {
        const handler = getHandler();

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "find_threads",
              arguments: { query: "First", outputDir: testDir },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.totalResults).toBe(1);
      });
    });

    describe("update_thread", () => {
      it("should update a thread by ID", async () => {
        const handler = getHandler();

        // Save first
        const saveResponse = await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Update Test",
                messages: [{ role: "user", content: "Original" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );
        const saved = JSON.parse(saveResponse.content[0].text);

        // Update
        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "update_thread",
              arguments: {
                id: saved.id,
                messages: [{ role: "assistant", content: "Response" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.success).toBe(true);
        expect(result.messageCount).toBe(2);
      });

      it("should update by title", async () => {
        const handler = getHandler();

        await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Title Update Test",
                messages: [{ role: "user", content: "Original" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "update_thread",
              arguments: {
                title: "Title Update Test",
                messages: [{ role: "assistant", content: "New message" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.success).toBe(true);
      });
    });

    describe("delete_thread", () => {
      it("should delete a thread", async () => {
        const handler = getHandler();

        const saveResponse = await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Delete Test",
                messages: [{ role: "user", content: "Delete me" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );
        const saved = JSON.parse(saveResponse.content[0].text);

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "delete_thread",
              arguments: { id: saved.id, outputDir: testDir },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.deleted).toBe(true);
      });
    });

    describe("resume_thread", () => {
      it("should resume a thread", async () => {
        const handler = getHandler();

        await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Resume Test",
                messages: [
                  { role: "user", content: "Question" },
                  { role: "assistant", content: "Answer" },
                ],
                summary: "A test conversation",
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "resume_thread",
              arguments: {
                title: "Resume Test",
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.found).toBe(true);
        expect(result.context).toBeDefined();
        expect(result.messages).toHaveLength(2);
      });

      it("should return narrative format", async () => {
        const handler = getHandler();

        await handler!(
          {
            method: "tools/call",
            params: {
              name: "save_thread",
              arguments: {
                title: "Narrative Test",
                messages: [{ role: "user", content: "Hello" }],
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const response = await handler!(
          {
            method: "tools/call",
            params: {
              name: "resume_thread",
              arguments: {
                title: "Narrative Test",
                format: "narrative",
                outputDir: testDir,
              },
            },
          },
          {},
        );

        const result = JSON.parse(response.content[0].text);
        expect(result.format).toBe("narrative");
        expect(result.content).toContain("Resuming:");
      });
    });

    describe("Unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const handler = getHandler();

        const response = await handler!(
          {
            method: "tools/call",
            params: { name: "unknown_tool", arguments: {} },
          },
          {},
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Unknown tool");
      });
    });
  });

  describe("Full Workflow", () => {
    it("should support save, find, update, resume, delete workflow", async () => {
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      // 1. Save
      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Full Workflow Test",
              messages: [
                { role: "user", content: "What is TypeScript?" },
                {
                  role: "assistant",
                  content: "TypeScript is a typed superset of JavaScript.",
                },
              ],
              tags: ["typescript", "programming"],
              summary: "Discussion about TypeScript",
              outputDir: testDir,
            },
          },
        },
        {},
      );
      const saved = JSON.parse(saveResponse.content[0].text);
      expect(saved.success).toBe(true);

      // 2. Find
      const findResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "find_threads",
            arguments: { query: "TypeScript", outputDir: testDir },
          },
        },
        {},
      );
      const found = JSON.parse(findResponse.content[0].text);
      expect(found.totalResults).toBe(1);

      // 3. Update
      const updateResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "update_thread",
            arguments: {
              id: saved.id,
              messages: [
                { role: "user", content: "Tell me more" },
                { role: "assistant", content: "It adds static typing..." },
              ],
              outputDir: testDir,
            },
          },
        },
        {},
      );
      const updated = JSON.parse(updateResponse.content[0].text);
      expect(updated.success).toBe(true);
      expect(updated.messageCount).toBe(4);

      // 4. Resume
      const resumeResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "resume_thread",
            arguments: {
              title: "Full Workflow Test",
              outputDir: testDir,
            },
          },
        },
        {},
      );
      const resumed = JSON.parse(resumeResponse.content[0].text);
      expect(resumed.found).toBe(true);
      expect(resumed.messages).toHaveLength(4);

      // 5. Delete
      const deleteResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "delete_thread",
            arguments: { id: saved.id, outputDir: testDir },
          },
        },
        {},
      );
      const deleted = JSON.parse(deleteResponse.content[0].text);
      expect(deleted.deleted).toBe(true);

      // 6. Verify deleted
      const verifyResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "find_threads",
            arguments: { outputDir: testDir },
          },
        },
        {},
      );
      const verify = JSON.parse(verifyResponse.content[0].text);
      expect(verify.totalResults).toBe(0);
    });
  });

  describe("Sampling Integration", () => {
    function mockServerSampling(srv: Server) {
      (srv as unknown as { createMessage: unknown }).createMessage = vi
        .fn()
        .mockImplementation(
          async (params: { messages: Array<{ content: { text: string } }> }) => {
            const prompt = params.messages[0]?.content?.text ?? "";
            if (prompt.includes("Summarize")) {
              return {
                role: "assistant",
                content: {
                  type: "text",
                  text: "Auto-generated summary of the conversation.",
                },
                model: "mock-model",
              };
            }
            if (prompt.includes("tags")) {
              return {
                role: "assistant",
                content: { type: "text", text: '["coding", "help"]' },
                model: "mock-model",
              };
            }
            return {
              role: "assistant",
              content: { type: "text", text: "Unknown prompt" },
              model: "mock-model",
            };
          },
        );
    }

    it("should auto-generate summary on save when autoSummarize is true", async () => {
      mockServerSampling(server);
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Auto Summary Test",
              messages: [
                { role: "user", content: "Hello" },
                { role: "assistant", content: "Hi there!" },
              ],
              autoSummarize: true,
              outputDir: testDir,
            },
          },
        },
        {},
      );

      const saved = JSON.parse(saveResponse.content[0].text);
      expect(saved.success).toBe(true);

      // Verify the summary was saved by resuming the thread
      const resumeResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "resume_thread",
            arguments: { id: saved.id, outputDir: testDir },
          },
        },
        {},
      );
      const resumed = JSON.parse(resumeResponse.content[0].text);
      expect(resumed.context.summary).toBe(
        "Auto-generated summary of the conversation.",
      );
    });

    it("should auto-generate tags on save when autoTag is true", async () => {
      mockServerSampling(server);
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Auto Tag Test",
              messages: [{ role: "user", content: "Help me code" }],
              autoTag: true,
              outputDir: testDir,
            },
          },
        },
        {},
      );

      const saved = JSON.parse(saveResponse.content[0].text);
      expect(saved.success).toBe(true);

      const resumeResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "resume_thread",
            arguments: { id: saved.id, outputDir: testDir },
          },
        },
        {},
      );
      const resumed = JSON.parse(resumeResponse.content[0].text);
      expect(resumed.context.tags).toEqual(["coding", "help"]);
    });

    it("should skip auto-summary when summary is already provided", async () => {
      mockServerSampling(server);
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Manual Summary Test",
              messages: [{ role: "user", content: "Hello" }],
              summary: "My manual summary",
              autoSummarize: true,
              outputDir: testDir,
            },
          },
        },
        {},
      );

      const saved = JSON.parse(saveResponse.content[0].text);
      expect(saved.success).toBe(true);

      const resumeResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "resume_thread",
            arguments: { id: saved.id, outputDir: testDir },
          },
        },
        {},
      );
      const resumed = JSON.parse(resumeResponse.content[0].text);
      expect(resumed.context.summary).toBe("My manual summary");
    });

    it("should gracefully handle sampling failure on save", async () => {
      // Mock createMessage to throw (simulating client without sampling support)
      (server as unknown as { createMessage: unknown }).createMessage = vi
        .fn()
        .mockRejectedValue(new Error("Sampling not supported"));

      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Sampling Fail Test",
              messages: [{ role: "user", content: "Hello" }],
              autoSummarize: true,
              autoTag: true,
              outputDir: testDir,
            },
          },
        },
        {},
      );

      const saved = JSON.parse(saveResponse.content[0].text);
      // Should still succeed, just without auto-generated summary/tags
      expect(saved.success).toBe(true);
      expect(saved.title).toBe("Sampling Fail Test");
    });

    it("should auto-generate summary on update with all messages", async () => {
      mockServerSampling(server);
      const handler = (
        server as unknown as {
          _requestHandlers: Map<string, (...args: unknown[]) => unknown>;
        }
      )._requestHandlers.get("tools/call");

      // Save initial thread
      const saveResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "save_thread",
            arguments: {
              title: "Update Sampling Test",
              messages: [{ role: "user", content: "First message" }],
              outputDir: testDir,
            },
          },
        },
        {},
      );
      const saved = JSON.parse(saveResponse.content[0].text);

      // Update with autoSummarize
      const updateResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "update_thread",
            arguments: {
              id: saved.id,
              messages: [{ role: "assistant", content: "Response message" }],
              autoSummarize: true,
              autoTag: true,
              outputDir: testDir,
            },
          },
        },
        {},
      );

      const updated = JSON.parse(updateResponse.content[0].text);
      expect(updated.success).toBe(true);

      // Verify sampling was called (createMessage should have been called for summary and tags)
      expect(
        (server as unknown as { createMessage: ReturnType<typeof vi.fn> })
          .createMessage,
      ).toHaveBeenCalled();

      // Verify the generated summary/tags were saved
      const resumeResponse = await handler!(
        {
          method: "tools/call",
          params: {
            name: "resume_thread",
            arguments: { id: updated.id, outputDir: testDir },
          },
        },
        {},
      );
      const resumed = JSON.parse(resumeResponse.content[0].text);
      expect(resumed.context.summary).toBe(
        "Auto-generated summary of the conversation.",
      );
      expect(resumed.context.tags).toEqual(["coding", "help"]);
    });
  });
});
