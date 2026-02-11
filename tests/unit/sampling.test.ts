import { describe, it, expect, vi } from "vitest";
import { generateSummary, generateTags } from "../../src/sampling.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

function createMockServer(responseText: string): Server {
  return {
    createMessage: vi.fn().mockResolvedValue({
      role: "assistant",
      content: { type: "text", text: responseText },
      model: "mock-model",
    }),
  } as unknown as Server;
}

function createFailingServer(error: string): Server {
  return {
    createMessage: vi.fn().mockRejectedValue(new Error(error)),
  } as unknown as Server;
}

const sampleMessages = [
  { role: "user", content: "How do I sort a list in Python?" },
  {
    role: "assistant",
    content: "You can use the sorted() function or list.sort() method.",
  },
];

describe("generateSummary", () => {
  it("should return summary text from sampling response", async () => {
    const server = createMockServer("A discussion about sorting lists in Python.");
    const result = await generateSummary(server, sampleMessages);

    expect(result).toBe("A discussion about sorting lists in Python.");
    expect(server.createMessage).toHaveBeenCalledOnce();
    expect(server.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 150,
        modelPreferences: { costPriority: 1 },
      }),
    );
  });

  it("should handle array content blocks", async () => {
    const server = {
      createMessage: vi.fn().mockResolvedValue({
        role: "assistant",
        content: [{ type: "text", text: "Summary from array content." }],
        model: "mock-model",
      }),
    } as unknown as Server;

    const result = await generateSummary(server, sampleMessages);
    expect(result).toBe("Summary from array content.");
  });

  it("should throw on empty response", async () => {
    const server = createMockServer("   ");
    await expect(generateSummary(server, sampleMessages)).rejects.toThrow(
      "Sampling returned empty summary",
    );
  });

  it("should propagate errors from createMessage", async () => {
    const server = createFailingServer("Sampling not supported");
    await expect(generateSummary(server, sampleMessages)).rejects.toThrow(
      "Sampling not supported",
    );
  });
});

describe("generateTags", () => {
  it("should parse JSON array response", async () => {
    const server = createMockServer('["python", "sorting", "lists"]');
    const result = await generateTags(server, sampleMessages);

    expect(result).toEqual(["python", "sorting", "lists"]);
    expect(server.createMessage).toHaveBeenCalledOnce();
    expect(server.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 100,
        modelPreferences: { costPriority: 1 },
      }),
    );
  });

  it("should extract JSON array from surrounding text", async () => {
    const server = createMockServer(
      'Here are the tags: ["python", "sorting", "beginner"]',
    );
    const result = await generateTags(server, sampleMessages);
    expect(result).toEqual(["python", "sorting", "beginner"]);
  });

  it("should fall back to comma-separated parsing", async () => {
    const server = createMockServer("python, sorting, lists");
    const result = await generateTags(server, sampleMessages);
    expect(result).toEqual(["python", "sorting", "lists"]);
  });

  it("should throw on empty response", async () => {
    const server = createMockServer("   ");
    await expect(generateTags(server, sampleMessages)).rejects.toThrow(
      "Sampling returned empty tags response",
    );
  });

  it("should propagate errors from createMessage", async () => {
    const server = createFailingServer("Sampling not supported");
    await expect(generateTags(server, sampleMessages)).rejects.toThrow(
      "Sampling not supported",
    );
  });
});
