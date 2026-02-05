import { z } from "zod";
import { getDefaultLocalStorage, createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";

export const DeleteThreadInputSchema = z.object({
  // Lookup (use one)
  id: z.string().optional().describe("ID of the thread to delete"),
  title: z.string().optional().describe("Find and delete thread by exact title match"),

  // Source
  source: z
    .enum(["local", "remote"])
    .default("local")
    .describe("Source where thread is stored"),
  outputDir: z.string().optional().describe("Custom directory for local storage"),
  remoteUrl: z.string().url().optional().describe("Remote server URL"),
  apiKey: z.string().optional().describe("API key for remote"),
  headers: z.record(z.string()).optional().describe("Additional headers for remote"),
});

export type DeleteThreadInput = z.infer<typeof DeleteThreadInputSchema>;

export async function deleteThread(input: DeleteThreadInput) {
  if (!input.id && !input.title) {
    throw new Error("Either 'id' or 'title' must be provided to identify the thread");
  }

  if (input.source === "remote" && !input.remoteUrl) {
    throw new Error("remoteUrl is required when source is 'remote'");
  }

  const storage =
    input.source === "remote"
      ? createRemoteStorage({
          url: input.remoteUrl!,
          apiKey: input.apiKey,
          headers: input.headers,
        })
      : input.outputDir
        ? createLocalStorage(input.outputDir)
        : getDefaultLocalStorage();

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
        source: input.source,
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
    source: input.source,
  };
}

export const deleteThreadTool = {
  name: "delete_thread",
  description:
    "Delete a saved conversation thread. Can find by ID or exact title match.",
  inputSchema: DeleteThreadInputSchema,
  handler: deleteThread,
};
