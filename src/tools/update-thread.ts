import { z } from "zod";
import type { Conversation, SaveOptions, Message } from "../types.js";
import { createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";
import {
  resolveSource,
  resolveStorageDir,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
} from "../config.js";

export const UpdateThreadInputSchema = z.object({
  // Lookup (use one)
  id: z.string().optional().describe("ID of the thread to update"),
  title: z.string().optional().describe("Find thread by exact title match"),

  // Messages to add/replace
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
        timestamp: z.string().optional(),
      }),
    )
    .describe("Messages to append or replace with"),

  mode: z
    .enum(["append", "replace"])
    .default("append")
    .describe("'append' adds to existing messages, 'replace' overwrites all"),

  deduplicate: z
    .boolean()
    .default(true)
    .describe("When appending, skip messages that already exist (by role+content)"),

  // Metadata updates (optional)
  newTitle: z.string().optional().describe("New title for the thread"),
  newTags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  newSummary: z.string().optional().describe("New summary"),

  // Auto-generation options (require MCP sampling support)
  autoSummarize: z
    .boolean()
    .default(false)
    .describe(
      "Automatically generate a summary from all messages (existing + new) using the client's LLM via MCP sampling. " +
        "Requires the client to support the MCP sampling capability (createMessage). " +
        "Adds latency due to an LLM round-trip. Ignored if 'newSummary' is already provided. " +
        "If your client does not support sampling, keep this false and provide newSummary directly.",
    ),
  autoTag: z
    .boolean()
    .default(false)
    .describe(
      "Automatically generate tags from all messages (existing + new) using the client's LLM via MCP sampling. " +
        "Requires the client to support the MCP sampling capability (createMessage). " +
        "Adds latency due to an LLM round-trip. Ignored if 'newTags' are already provided. " +
        "If your client does not support sampling, keep this false and provide newTags directly.",
    ),

  // Source - no default, falls back to env var
  source: z
    .enum(["local", "remote"])
    .optional()
    .describe("Source where thread is stored (default from THREAD_MCP_DEFAULT_SOURCE)"),
  outputDir: z
    .string()
    .optional()
    .describe(
      "Custom directory for local storage (default from THREAD_MCP_STORAGE_DIR)",
    ),
  remoteUrl: z
    .string()
    .url()
    .optional()
    .describe("Remote server URL (default from THREAD_MCP_REMOTE_URL)"),
  apiKey: z
    .string()
    .optional()
    .describe("API key for remote (default from THREAD_MCP_API_KEY)"),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional headers for remote (merged with THREAD_MCP_REMOTE_HEADERS)"),

  format: z
    .enum(["markdown", "json"])
    .optional()
    .describe(
      "Output format (keeps existing if not set, or default from THREAD_MCP_FORMAT)",
    ),
});

export type UpdateThreadInput = z.infer<typeof UpdateThreadInputSchema>;

function messagesEqual(a: Message, b: Message): boolean {
  return a.role === b.role && a.content === b.content;
}

function deduplicateMessages(existing: Message[], incoming: Message[]): Message[] {
  const newMessages: Message[] = [];

  for (const msg of incoming) {
    const isDuplicate = existing.some((e) => messagesEqual(e, msg));
    if (!isDuplicate) {
      newMessages.push(msg);
    }
  }

  return newMessages;
}

export async function updateThread(input: UpdateThreadInput) {
  if (!input.id && !input.title) {
    throw new Error("Either 'id' or 'title' must be provided to identify the thread");
  }

  const source = resolveSource(input.source);

  if (source === "remote") {
    const remoteUrl = resolveRemoteUrl(input.remoteUrl);
    if (!remoteUrl) {
      throw new Error(
        "Remote URL is required when source is 'remote'. " +
          "Set THREAD_MCP_REMOTE_URL or provide remoteUrl parameter.",
      );
    }
  }

  const storage =
    source === "remote"
      ? createRemoteStorage({
          url: resolveRemoteUrl(input.remoteUrl)!,
          apiKey: resolveApiKey(input.apiKey),
          headers: resolveHeaders(input.headers),
        })
      : createLocalStorage(resolveStorageDir(input.outputDir));

  // Find the thread
  let threadId = input.id;
  let existingInfo;

  if (!threadId && input.title) {
    const allInfos = await storage.list();
    for (const info of allInfos) {
      const conv = await storage.get(info.id);
      if (conv && conv.metadata.title === input.title) {
        threadId = info.id;
        existingInfo = info;
        break;
      }
    }
    if (!threadId) {
      return {
        success: false,
        error: `Thread with title '${input.title}' not found`,
        source,
      };
    }
  }

  const existing = await storage.get(threadId!);
  if (!existing) {
    return {
      success: false,
      error: `Thread with ID '${threadId}' not found`,
      id: threadId,
      source,
    };
  }

  // Get format from existing info if not provided
  if (!existingInfo) {
    const allInfos = await storage.list();
    existingInfo = allInfos.find((i) => i.id === threadId);
  }
  const originalFormat = existingInfo?.format || "markdown";

  // Build updated messages
  let updatedMessages: Message[];
  if (input.mode === "replace") {
    updatedMessages = input.messages;
  } else {
    const messagesToAdd = input.deduplicate
      ? deduplicateMessages(existing.messages, input.messages)
      : input.messages;
    updatedMessages = [...existing.messages, ...messagesToAdd];
  }

  // Build updated conversation
  const updated: Conversation = {
    id: existing.id,
    metadata: {
      ...existing.metadata,
      title: input.newTitle ?? existing.metadata.title,
      tags: input.newTags ?? existing.metadata.tags,
      summary: input.newSummary ?? existing.metadata.summary,
      updatedAt: new Date().toISOString(),
    },
    messages: updatedMessages,
  };

  // Use provided format, or keep original, falling back to env var if neither
  const format = input.format ?? originalFormat;

  const options: SaveOptions = {
    format,
    includeMetadata: true,
    includeTimestamps: true,
  };

  // Delete old and save updated
  await storage.delete(existing.id);
  const result = await storage.save(updated, options);

  const messagesAdded =
    input.mode === "append"
      ? updatedMessages.length - existing.messages.length
      : updatedMessages.length;

  return {
    success: true,
    id: result.id,
    title: updated.metadata.title,
    source,
    filePath: result.filePath,
    remoteUrl: result.remoteUrl,
    format: result.format,
    savedAt: result.savedAt,
    messageCount: updatedMessages.length,
    messagesAdded,
    mode: input.mode,
  };
}

export const updateThreadTool = {
  name: "update_thread",
  description:
    "Update an existing conversation thread. Can find by ID or title. " +
    "Use 'append' mode to add new messages (with automatic deduplication). " +
    "Use 'replace' mode to overwrite all messages. Can also update title, tags, and summary. " +
    "Supports optional auto-summarization and auto-tagging via MCP sampling " +
    "(requires client sampling support — adds latency from an LLM round-trip).",
  inputSchema: UpdateThreadInputSchema,
  handler: updateThread,
};
