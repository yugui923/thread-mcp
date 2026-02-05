import { describe, it, expect } from "vitest";
import {
  MessageSchema,
  ConversationSchema,
  ConversationMetadataSchema,
  OutputFormatSchema,
  SaveOptionsSchema,
  RemoteConfigSchema,
  SavedConversationInfoSchema,
} from "../../src/types.js";

describe("Type Schemas", () => {
  describe("MessageSchema", () => {
    it("should validate a valid message", () => {
      const message = {
        role: "user",
        content: "Hello, world!",
      };

      const result = MessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should validate message with timestamp", () => {
      const message = {
        role: "assistant",
        content: "Hello!",
        timestamp: "2024-01-15T10:00:00.000Z",
      };

      const result = MessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should accept all valid roles", () => {
      for (const role of ["user", "assistant", "system"]) {
        const result = MessageSchema.safeParse({ role, content: "test" });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid roles", () => {
      const result = MessageSchema.safeParse({ role: "invalid", content: "test" });
      expect(result.success).toBe(false);
    });

    it("should reject invalid timestamp format", () => {
      const result = MessageSchema.safeParse({
        role: "user",
        content: "test",
        timestamp: "not-a-date",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ConversationMetadataSchema", () => {
    it("should validate minimal metadata", () => {
      const metadata = {
        title: "Test",
        createdAt: "2024-01-15T10:00:00.000Z",
      };

      const result = ConversationMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should validate full metadata", () => {
      const metadata = {
        title: "Full Test",
        sourceApp: "Claude",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-01-15T11:00:00.000Z",
        tags: ["test", "example"],
        summary: "A test conversation",
      };

      const result = ConversationMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should reject missing required fields", () => {
      const result = ConversationMetadataSchema.safeParse({ title: "Test" });
      expect(result.success).toBe(false);
    });
  });

  describe("ConversationSchema", () => {
    it("should validate a complete conversation", () => {
      const conversation = {
        id: "test-123",
        metadata: {
          title: "Test Conversation",
          createdAt: "2024-01-15T10:00:00.000Z",
        },
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      };

      const result = ConversationSchema.safeParse(conversation);
      expect(result.success).toBe(true);
    });

    it("should reject conversation without messages", () => {
      const result = ConversationSchema.safeParse({
        id: "test",
        metadata: {
          title: "Test",
          createdAt: "2024-01-15T10:00:00.000Z",
        },
      });
      expect(result.success).toBe(false);
    });

    it("should accept empty messages array", () => {
      const conversation = {
        id: "test",
        metadata: {
          title: "Test",
          createdAt: "2024-01-15T10:00:00.000Z",
        },
        messages: [],
      };

      const result = ConversationSchema.safeParse(conversation);
      expect(result.success).toBe(true);
    });
  });

  describe("OutputFormatSchema", () => {
    it("should accept markdown", () => {
      const result = OutputFormatSchema.safeParse("markdown");
      expect(result.success).toBe(true);
    });

    it("should accept json", () => {
      const result = OutputFormatSchema.safeParse("json");
      expect(result.success).toBe(true);
    });

    it("should reject invalid formats", () => {
      const result = OutputFormatSchema.safeParse("xml");
      expect(result.success).toBe(false);
    });
  });

  describe("SaveOptionsSchema", () => {
    it("should apply default values", () => {
      const result = SaveOptionsSchema.parse({});

      expect(result.format).toBe("markdown");
      expect(result.includeMetadata).toBe(true);
      expect(result.includeTimestamps).toBe(true);
    });

    it("should accept custom values", () => {
      const options = {
        format: "json",
        includeMetadata: false,
        includeTimestamps: false,
      };

      const result = SaveOptionsSchema.parse(options);

      expect(result.format).toBe("json");
      expect(result.includeMetadata).toBe(false);
      expect(result.includeTimestamps).toBe(false);
    });
  });

  describe("RemoteConfigSchema", () => {
    it("should validate minimal config", () => {
      const config = {
        url: "https://example.com/api",
      };

      const result = RemoteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate full config", () => {
      const config = {
        url: "https://example.com/api",
        apiKey: "secret-key",
        headers: {
          "X-Custom": "value",
        },
      };

      const result = RemoteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject invalid URL", () => {
      const result = RemoteConfigSchema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });
  });

  describe("SavedConversationInfoSchema", () => {
    it("should validate local save info", () => {
      const info = {
        id: "test-123",
        title: "Test",
        filePath: "/path/to/file.md",
        format: "markdown",
        savedAt: "2024-01-15T10:00:00.000Z",
      };

      const result = SavedConversationInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it("should validate remote save info", () => {
      const info = {
        id: "test-123",
        title: "Test",
        remoteUrl: "https://example.com/conversations/123",
        format: "json",
        savedAt: "2024-01-15T10:00:00.000Z",
      };

      const result = SavedConversationInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it("should include optional sourceApp", () => {
      const info = {
        id: "test-123",
        title: "Test",
        filePath: "/path/to/file.md",
        format: "markdown",
        savedAt: "2024-01-15T10:00:00.000Z",
        sourceApp: "Claude",
      };

      const result = SavedConversationInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
      expect(result.data?.sourceApp).toBe("Claude");
    });
  });
});
