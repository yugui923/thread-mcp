import { z } from "zod";
import type { Conversation, SaveOptions } from "../types.js";
import { OutputFormatSchema } from "../types.js";
import { getDefaultLocalStorage, createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";

export const SaveThreadInputSchema = z.object({
  title: z.string().describe("Title for the thread"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
        timestamp: z.string().optional(),
      }),
    )
    .describe("Array of messages in the thread"),
  destination: z
    .enum(["local", "remote"])
    .default("local")
    .describe("Where to save: 'local' for filesystem, 'remote' for server"),
  format: OutputFormatSchema.default("markdown").describe(
    "Output format: 'markdown' or 'json'",
  ),
  sourceApp: z
    .string()
    .optional()
    .describe("Name of the AI application (e.g., 'Claude', 'ChatGPT')"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  summary: z.string().optional().describe("Summary of the thread"),

  // Local options
  outputDir: z
    .string()
    .optional()
    .describe("Custom output directory for local storage (defaults to ~/.thread-mcp)"),

  // Remote options
  remoteUrl: z
    .string()
    .url()
    .optional()
    .describe("Base URL of the remote server (required if destination is 'remote')"),
  apiKey: z.string().optional().describe("API key for remote authentication"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Additional headers for remote requests"),

  // Output options
  includeMetadata: z
    .boolean()
    .default(true)
    .describe("Whether to include metadata in the output"),
  includeTimestamps: z
    .boolean()
    .default(true)
    .describe("Whether to include timestamps for each message"),
});

export type SaveThreadInput = z.infer<typeof SaveThreadInputSchema>;

export async function saveThread(input: SaveThreadInput) {
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    metadata: {
      title: input.title,
      sourceApp: input.sourceApp,
      createdAt: new Date().toISOString(),
      tags: input.tags,
      summary: input.summary,
    },
    messages: input.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    })),
  };

  const options: SaveOptions = {
    format: input.format,
    includeMetadata: input.includeMetadata,
    includeTimestamps: input.includeTimestamps,
  };

  if (input.destination === "remote") {
    if (!input.remoteUrl) {
      throw new Error("remoteUrl is required when destination is 'remote'");
    }

    const storage = createRemoteStorage({
      url: input.remoteUrl,
      apiKey: input.apiKey,
      headers: input.headers,
    });

    const result = await storage.save(conversation, options);

    return {
      success: true,
      id: result.id,
      title: result.title,
      destination: "remote",
      remoteUrl: result.remoteUrl,
      format: result.format,
      savedAt: result.savedAt,
      messageCount: conversation.messages.length,
    };
  }

  // Local storage
  const storage = input.outputDir
    ? createLocalStorage(input.outputDir)
    : getDefaultLocalStorage();

  const result = await storage.save(conversation, options);

  return {
    success: true,
    id: result.id,
    title: result.title,
    destination: "local",
    filePath: result.filePath,
    format: result.format,
    savedAt: result.savedAt,
    messageCount: conversation.messages.length,
  };
}

export const saveThreadTool = {
  name: "save_thread",
  description:
    "Save a conversation thread to local storage or a remote server. " +
    "Supports Markdown and JSON formats with rich metadata including tags, summary, and timestamps.",
  inputSchema: SaveThreadInputSchema,
  handler: saveThread,
};
