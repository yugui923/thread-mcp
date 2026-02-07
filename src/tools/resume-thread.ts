import { z } from "zod";
import type { Conversation, Message } from "../types.js";
import { createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";
import {
  resolveSource,
  resolveStorageDir,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
} from "../config.js";

export const ResumeThreadInputSchema = z.object({
  // Lookup (use one)
  id: z.string().optional().describe("ID of the thread to resume"),
  title: z.string().optional().describe("Find thread by exact title match"),
  titleContains: z
    .string()
    .optional()
    .describe("Find most recent thread with title containing this"),

  // Output format
  format: z
    .enum(["structured", "narrative", "messages"])
    .default("structured")
    .describe(
      "'structured' returns organized context, 'narrative' returns readable summary, 'messages' returns raw messages",
    ),

  // Options
  maxMessages: z
    .number()
    .positive()
    .optional()
    .describe("Limit to last N messages (default: all)"),
  includeSummary: z
    .boolean()
    .default(true)
    .describe("Include thread summary if available"),

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
});

export type ResumeThreadInput = z.infer<typeof ResumeThreadInputSchema>;

function formatNarrative(conversation: Conversation, maxMessages?: number): string {
  const lines: string[] = [];

  lines.push(`# Resuming: ${conversation.metadata.title}`);
  lines.push("");

  if (conversation.metadata.summary) {
    lines.push(`**Summary:** ${conversation.metadata.summary}`);
    lines.push("");
  }

  if (conversation.metadata.tags && conversation.metadata.tags.length > 0) {
    lines.push(`**Topics:** ${conversation.metadata.tags.join(", ")}`);
    lines.push("");
  }

  const messages = maxMessages
    ? conversation.messages.slice(-maxMessages)
    : conversation.messages;

  if (maxMessages && conversation.messages.length > maxMessages) {
    lines.push(
      `*Showing last ${maxMessages} of ${conversation.messages.length} messages*`,
    );
    lines.push("");
  }

  lines.push("## Previous Conversation");
  lines.push("");

  for (const msg of messages) {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    lines.push(`**${role}:** ${msg.content}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("*Continue the conversation from here...*");

  return lines.join("\n");
}

function formatStructured(
  conversation: Conversation,
  maxMessages?: number,
): {
  context: {
    title: string;
    summary?: string;
    tags?: string[];
    sourceApp?: string;
    messageCount: number;
    startedAt: string;
    lastUpdated?: string;
  };
  messages: Message[];
  continuationHint: string;
} {
  const messages = maxMessages
    ? conversation.messages.slice(-maxMessages)
    : conversation.messages;

  // Generate a continuation hint based on the last message
  const lastMessage = messages[messages.length - 1];
  let continuationHint = "Continue the conversation.";

  if (lastMessage) {
    if (lastMessage.role === "user") {
      continuationHint = "The user's last message is awaiting a response.";
    } else if (lastMessage.role === "assistant") {
      continuationHint =
        "The assistant last responded. The user may have follow-up questions.";
    }
  }

  return {
    context: {
      title: conversation.metadata.title,
      summary: conversation.metadata.summary,
      tags: conversation.metadata.tags,
      sourceApp: conversation.metadata.sourceApp,
      messageCount: conversation.messages.length,
      startedAt: conversation.metadata.createdAt,
      lastUpdated: conversation.metadata.updatedAt,
    },
    messages,
    continuationHint,
  };
}

export async function resumeThread(input: ResumeThreadInput) {
  if (!input.id && !input.title && !input.titleContains) {
    throw new Error("One of 'id', 'title', or 'titleContains' must be provided");
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
  let conversation: Conversation | null = null;
  let threadId: string | undefined;

  if (input.id) {
    conversation = await storage.get(input.id);
    threadId = input.id;
  } else {
    const allInfos = await storage.list();

    for (const info of allInfos) {
      const conv = await storage.get(info.id);
      if (!conv) continue;

      if (input.title && conv.metadata.title === input.title) {
        conversation = conv;
        threadId = info.id;
        break;
      }

      if (
        input.titleContains &&
        conv.metadata.title.toLowerCase().includes(input.titleContains.toLowerCase())
      ) {
        // Take the first (most recent) match
        conversation = conv;
        threadId = info.id;
        break;
      }
    }
  }

  if (!conversation) {
    const lookupMethod = input.id
      ? `ID '${input.id}'`
      : input.title
        ? `title '${input.title}'`
        : `title containing '${input.titleContains}'`;

    return {
      found: false,
      error: `Thread not found with ${lookupMethod}`,
      source,
    };
  }

  // Format output based on requested format
  if (input.format === "messages") {
    const messages = input.maxMessages
      ? conversation.messages.slice(-input.maxMessages)
      : conversation.messages;

    return {
      found: true,
      id: threadId,
      title: conversation.metadata.title,
      source,
      format: "messages",
      messages,
      totalMessages: conversation.messages.length,
    };
  }

  if (input.format === "narrative") {
    return {
      found: true,
      id: threadId,
      title: conversation.metadata.title,
      source,
      format: "narrative",
      content: formatNarrative(conversation, input.maxMessages),
      totalMessages: conversation.messages.length,
    };
  }

  // Default: structured
  const structured = formatStructured(conversation, input.maxMessages);

  return {
    found: true,
    id: threadId,
    source,
    format: "structured",
    ...structured,
    totalMessages: conversation.messages.length,
  };
}

export const resumeThreadTool = {
  name: "resume_thread",
  description:
    "Load a saved conversation thread to continue where you left off. " +
    "Returns the conversation context in different formats: " +
    "'structured' (organized data), 'narrative' (readable summary), or 'messages' (raw). " +
    "Use this to pick up previous conversations.",
  inputSchema: ResumeThreadInputSchema,
  handler: resumeThread,
};
