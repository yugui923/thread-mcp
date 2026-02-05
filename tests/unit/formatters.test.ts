import { describe, it, expect } from "vitest";
import { markdownFormatter } from "../../src/formatters/markdown.js";
import { jsonFormatter } from "../../src/formatters/json.js";
import { getFormatter } from "../../src/formatters/index.js";
import type { Conversation, SaveOptions } from "../../src/types.js";

describe("Markdown Formatter", () => {
  const sampleConversation: Conversation = {
    id: "test-123",
    metadata: {
      title: "Test Conversation",
      sourceApp: "Claude",
      createdAt: "2024-01-15T10:00:00.000Z",
      tags: ["test", "example"],
      summary: "A test conversation for unit testing",
    },
    messages: [
      {
        role: "user",
        content: "Hello, how are you?",
        timestamp: "2024-01-15T10:00:00.000Z",
      },
      {
        role: "assistant",
        content: "I'm doing well, thank you for asking!",
        timestamp: "2024-01-15T10:00:05.000Z",
      },
    ],
  };

  const defaultOptions: SaveOptions = {
    format: "markdown",
    includeMetadata: true,
    includeTimestamps: true,
  };

  it("should have .md extension", () => {
    expect(markdownFormatter.extension).toBe(".md");
  });

  it("should format a conversation with full metadata", () => {
    const output = markdownFormatter.format(sampleConversation, defaultOptions);

    expect(output).toContain("---");
    expect(output).toContain('title: "Test Conversation"');
    expect(output).toContain("id: test-123");
    expect(output).toContain("source_app: Claude");
    expect(output).toContain('tags: ["test", "example"]');
    expect(output).toContain("# Test Conversation");
    expect(output).toContain("> A test conversation for unit testing");
    expect(output).toContain("### User");
    expect(output).toContain("Hello, how are you?");
    expect(output).toContain("### Assistant");
    expect(output).toContain("I'm doing well, thank you for asking!");
  });

  it("should format without metadata when disabled", () => {
    const options: SaveOptions = { ...defaultOptions, includeMetadata: false };
    const output = markdownFormatter.format(sampleConversation, options);

    expect(output).not.toContain("---");
    expect(output).not.toContain("id: test-123");
    expect(output).toContain("# Test Conversation");
    expect(output).toContain("### User");
  });

  it("should format without timestamps when disabled", () => {
    const options: SaveOptions = { ...defaultOptions, includeTimestamps: false };
    const output = markdownFormatter.format(sampleConversation, options);

    expect(output).toContain("### User");
    expect(output).not.toMatch(/### User\s+_\(/);
  });

  it("should include timestamps when enabled", () => {
    const output = markdownFormatter.format(sampleConversation, defaultOptions);

    expect(output).toMatch(/### User\s+_\(/);
  });

  it("should parse a formatted conversation", () => {
    const output = markdownFormatter.format(sampleConversation, defaultOptions);
    const parsed = markdownFormatter.parse(output);

    expect(parsed.id).toBe("test-123");
    expect(parsed.metadata.title).toBe("Test Conversation");
    expect(parsed.metadata.sourceApp).toBe("Claude");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages[0].content).toBe("Hello, how are you?");
    expect(parsed.messages[1].role).toBe("assistant");
  });

  it("should handle conversation without optional fields", () => {
    const minimalConversation: Conversation = {
      id: "minimal-123",
      metadata: {
        title: "Minimal",
        createdAt: "2024-01-15T10:00:00.000Z",
      },
      messages: [{ role: "user", content: "Hi" }],
    };

    const output = markdownFormatter.format(minimalConversation, defaultOptions);

    expect(output).toContain("# Minimal");
    expect(output).toContain("### User");
    expect(output).toContain("Hi");
    expect(output).not.toContain("source_app:");
    expect(output).not.toContain("tags:");
  });

  it("should handle system messages", () => {
    const conversationWithSystem: Conversation = {
      id: "system-123",
      metadata: {
        title: "System Test",
        createdAt: "2024-01-15T10:00:00.000Z",
      },
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    const output = markdownFormatter.format(conversationWithSystem, defaultOptions);

    expect(output).toContain("### System");
    expect(output).toContain("You are a helpful assistant.");
  });

  it("should parse markdown without frontmatter", () => {
    const markdown = `# My Conversation

## Conversation

### User

Hello there!

### Assistant

Hi! How can I help?`;

    const parsed = markdownFormatter.parse(markdown);

    expect(parsed.metadata.title).toBe("My Conversation");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages[0].content).toBe("Hello there!");
  });
});

describe("JSON Formatter", () => {
  const sampleConversation: Conversation = {
    id: "test-456",
    metadata: {
      title: "JSON Test",
      sourceApp: "ChatGPT",
      createdAt: "2024-01-15T12:00:00.000Z",
      tags: ["json", "test"],
    },
    messages: [
      {
        role: "user",
        content: "Test message",
        timestamp: "2024-01-15T12:00:00.000Z",
      },
      {
        role: "assistant",
        content: "Test response",
        timestamp: "2024-01-15T12:00:01.000Z",
      },
    ],
  };

  const defaultOptions: SaveOptions = {
    format: "json",
    includeMetadata: true,
    includeTimestamps: true,
  };

  it("should have .json extension", () => {
    expect(jsonFormatter.extension).toBe(".json");
  });

  it("should format a conversation as valid JSON", () => {
    const output = jsonFormatter.format(sampleConversation, defaultOptions);

    expect(() => JSON.parse(output)).not.toThrow();

    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("test-456");
    expect(parsed.metadata.title).toBe("JSON Test");
    expect(parsed.messages).toHaveLength(2);
  });

  it("should exclude metadata when disabled", () => {
    const options: SaveOptions = { ...defaultOptions, includeMetadata: false };
    const output = jsonFormatter.format(sampleConversation, options);
    const parsed = JSON.parse(output);

    expect(parsed.id).toBe("test-456");
    expect(parsed.metadata).toBeUndefined();
    expect(parsed.messages).toBeDefined();
  });

  it("should exclude timestamps when disabled", () => {
    const options: SaveOptions = { ...defaultOptions, includeTimestamps: false };
    const output = jsonFormatter.format(sampleConversation, options);
    const parsed = JSON.parse(output);

    expect(parsed.messages[0].timestamp).toBeUndefined();
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages[0].content).toBe("Test message");
  });

  it("should parse formatted JSON back to conversation", () => {
    const output = jsonFormatter.format(sampleConversation, defaultOptions);
    const parsed = jsonFormatter.parse(output);

    expect(parsed.id).toBe("test-456");
    expect(parsed.metadata.title).toBe("JSON Test");
    expect(parsed.metadata.sourceApp).toBe("ChatGPT");
    expect(parsed.messages).toHaveLength(2);
  });

  it("should throw on invalid JSON", () => {
    expect(() => jsonFormatter.parse("not valid json")).toThrow();
  });

  it("should throw on missing required fields", () => {
    expect(() => jsonFormatter.parse('{"messages": []}')).toThrow();
  });

  it("should produce pretty-printed JSON", () => {
    const output = jsonFormatter.format(sampleConversation, defaultOptions);

    expect(output).toContain("\n");
    expect(output).toContain("  ");
  });
});

describe("getFormatter", () => {
  it("should return markdown formatter for 'markdown'", () => {
    const formatter = getFormatter("markdown");
    expect(formatter.extension).toBe(".md");
  });

  it("should return json formatter for 'json'", () => {
    const formatter = getFormatter("json");
    expect(formatter.extension).toBe(".json");
  });
});
