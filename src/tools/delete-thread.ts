import { z } from "zod";
import { createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";
import {
  resolveSource,
  resolveStorageDir,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
} from "../config.js";

export const DeleteThreadInputSchema = z.object({
  // Lookup (use one)
  id: z.string().optional().describe("ID of the thread to delete"),
  title: z.string().optional().describe("Find and delete thread by exact title match"),

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
    .record(z.string())
    .optional()
    .describe("Additional headers for remote (merged with THREAD_MCP_REMOTE_HEADERS)"),
});

export type DeleteThreadInput = z.infer<typeof DeleteThreadInputSchema>;

export async function deleteThread(input: DeleteThreadInput) {
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

  // Find thread by title if needed
  let threadId = input.id;
  let threadTitle = input.title;

  if (!threadId && input.title) {
    const allInfos = await storage.list();
    for (const info of allInfos) {
      const conv = await storage.get(info.id);
      if (conv && conv.metadata.title === input.title) {
        threadId = info.id;
        threadTitle = conv.metadata.title;
        break;
      }
    }
    if (!threadId) {
      return {
        deleted: false,
        error: `Thread with title '${input.title}' not found`,
        source,
      };
    }
  }

  // Get title for response if we only have ID
  if (threadId && !threadTitle) {
    const conv = await storage.get(threadId);
    threadTitle = conv?.metadata.title;
  }

  const deleted = await storage.delete(threadId!);

  return {
    deleted,
    id: threadId,
    title: threadTitle,
    source,
  };
}

export const deleteThreadTool = {
  name: "delete_thread",
  description:
    "Delete a saved conversation thread. Can find by ID or exact title match.",
  inputSchema: DeleteThreadInputSchema,
  handler: deleteThread,
};
