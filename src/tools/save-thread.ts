import { z } from "zod";
import type { Conversation, SaveOptions } from "../types.js";
import { createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";
import {
  resolveFormat,
  resolveSource,
  resolveStorageDir,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
} from "../config.js";

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
    .optional()
    .describe(
      "Where to save: 'local' for filesystem, 'remote' for server (default from THREAD_MCP_DEFAULT_SOURCE)",
    ),
  format: z
    .enum(["markdown", "json"])
    .optional()
    .describe("Output format: 'markdown' or 'json' (default from THREAD_MCP_FORMAT)"),
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
    .describe("Custom output directory (default from THREAD_MCP_STORAGE_DIR)"),

  // Remote options
  remoteUrl: z
    .string()
    .url()
    .optional()
    .describe("Base URL of the remote server (default from THREAD_MCP_REMOTE_URL)"),
  apiKey: z
    .string()
    .optional()
    .describe("API key for remote authentication (default from THREAD_MCP_API_KEY)"),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Additional headers for remote requests (merged with THREAD_MCP_REMOTE_HEADERS)",
    ),

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
  const destination = resolveSource(input.destination);
  const format = resolveFormat(input.format);

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
    format,
    includeMetadata: input.includeMetadata,
    includeTimestamps: input.includeTimestamps,
  };

  if (destination === "remote") {
    const remoteUrl = resolveRemoteUrl(input.remoteUrl);
    if (!remoteUrl) {
      throw new Error(
        "Remote URL is required when destination is 'remote'. " +
          "Set THREAD_MCP_REMOTE_URL or provide remoteUrl parameter.",
      );
    }

    const storage = createRemoteStorage({
      url: remoteUrl,
      apiKey: resolveApiKey(input.apiKey),
      headers: resolveHeaders(input.headers),
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
  const storageDir = resolveStorageDir(input.outputDir);
  const storage = createLocalStorage(storageDir);

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
