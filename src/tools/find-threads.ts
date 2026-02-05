import { z } from "zod";
import type { Conversation, SavedConversationInfo } from "../types.js";
import { getDefaultLocalStorage, createLocalStorage } from "../storage/local.js";
import { createRemoteStorage } from "../storage/remote.js";

export const FindThreadsInputSchema = z.object({
  // Lookup methods (use one)
  id: z.string().optional().describe("Get a specific thread by ID"),
  title: z.string().optional().describe("Find thread by exact title match"),
  titleContains: z.string().optional().describe("Find threads with title containing this text"),
  query: z.string().optional().describe("Search query (matches title, summary, and content)"),

  // Filters
  tags: z.array(z.string()).optional().describe("Filter by tags (must have ALL specified tags)"),
  sourceApp: z.string().optional().describe("Filter by source application"),
  dateFrom: z.string().optional().describe("Filter threads created after this date (ISO format)"),
  dateTo: z.string().optional().describe("Filter threads created before this date (ISO format)"),

  // Output options
  includeContent: z
    .boolean()
    .default(false)
    .describe("Include full message content in results"),
  includeRelevanceInfo: z
    .boolean()
    .default(true)
    .describe("Include relevance scores and metadata"),
  limit: z.number().positive().default(10).describe("Maximum results to return"),

  // Source
  source: z
    .enum(["local", "remote"])
    .default("local")
    .describe("Source to search"),
  outputDir: z.string().optional().describe("Custom directory for local storage"),
  remoteUrl: z.string().url().optional().describe("Remote server URL (required if source is 'remote')"),
  apiKey: z.string().optional().describe("API key for remote"),
  headers: z.record(z.string()).optional().describe("Additional headers for remote"),
});

export type FindThreadsInput = z.infer<typeof FindThreadsInputSchema>;

interface ThreadResult {
  id: string;
  title: string;
  sourceApp?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  summary?: string;
  filePath?: string;
  remoteUrl?: string;
  format: "markdown" | "json";
  relevance?: {
    score: number;
    matchedFields: string[];
    messageCount: number;
    wordCount: number;
    topicHints: string[];
    ageInDays: number;
  };
  content?: {
    messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      timestamp?: string;
    }>;
  };
}

function extractTopicHints(conversation: Conversation): string[] {
  const hints: string[] = [];

  if (conversation.metadata.tags) {
    hints.push(...conversation.metadata.tags);
  }

  const titleWords = conversation.metadata.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  hints.push(...titleWords.slice(0, 5));

  const allContent = conversation.messages.map((m) => m.content).join(" ");
  if (
    allContent.includes("```") ||
    allContent.includes("function ") ||
    allContent.includes("class ")
  ) {
    hints.push("code");
  }
  if (
    allContent.includes("error") ||
    allContent.includes("bug") ||
    allContent.includes("fix")
  ) {
    hints.push("debugging");
  }

  return [...new Set(hints)].slice(0, 10);
}

function calculateWordCount(conversation: Conversation): number {
  return conversation.messages.reduce((count, msg) => {
    return count + msg.content.split(/\s+/).length;
  }, 0);
}

function calculateRelevance(
  conversation: Conversation,
  info: SavedConversationInfo,
  query?: string,
  titleContains?: string,
): { score: number; matchedFields: string[] } {
  let score = 50; // Base score
  const matchedFields: string[] = [];

  const searchTerm = query || titleContains;
  if (searchTerm) {
    const termLower = searchTerm.toLowerCase();
    const titleLower = conversation.metadata.title.toLowerCase();

    if (titleLower.includes(termLower)) {
      score += 30;
      matchedFields.push("title");
    }

    if (conversation.metadata.summary?.toLowerCase().includes(termLower)) {
      score += 20;
      matchedFields.push("summary");
    }

    if (query) {
      for (const msg of conversation.messages) {
        if (msg.content.toLowerCase().includes(termLower)) {
          score += 10;
          matchedFields.push("content");
          break;
        }
      }
    }

    if (conversation.metadata.tags?.some((t) => t.toLowerCase().includes(termLower))) {
      score += 15;
      matchedFields.push("tags");
    }
  }

  // Recency bonus
  const ageInDays = (Date.now() - new Date(info.savedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7) score += 10;
  else if (ageInDays < 30) score += 5;

  return { score, matchedFields: [...new Set(matchedFields)] };
}

function matchesFilters(
  conversation: Conversation,
  input: FindThreadsInput,
): boolean {
  // Title exact match
  if (input.title && conversation.metadata.title !== input.title) {
    return false;
  }

  // Title contains
  if (
    input.titleContains &&
    !conversation.metadata.title.toLowerCase().includes(input.titleContains.toLowerCase())
  ) {
    return false;
  }

  // Date filters
  if (input.dateFrom && new Date(conversation.metadata.createdAt) < new Date(input.dateFrom)) {
    return false;
  }
  if (input.dateTo && new Date(conversation.metadata.createdAt) > new Date(input.dateTo)) {
    return false;
  }

  // Source app
  if (input.sourceApp && conversation.metadata.sourceApp !== input.sourceApp) {
    return false;
  }

  // Tags (must have ALL)
  if (input.tags && input.tags.length > 0) {
    if (!conversation.metadata.tags) return false;
    const hasAllTags = input.tags.every((t) =>
      conversation.metadata.tags!.some((ct) => ct.toLowerCase() === t.toLowerCase()),
    );
    if (!hasAllTags) return false;
  }

  // Query search (in title, summary, content)
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const inTitle = conversation.metadata.title.toLowerCase().includes(queryLower);
    const inSummary = conversation.metadata.summary?.toLowerCase().includes(queryLower);
    const inContent = conversation.messages.some((m) =>
      m.content.toLowerCase().includes(queryLower),
    );
    if (!inTitle && !inSummary && !inContent) return false;
  }

  return true;
}

export async function findThreads(input: FindThreadsInput) {
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

  // If looking up by ID, return single result
  if (input.id) {
    const conversation = await storage.get(input.id);
    if (!conversation) {
      return {
        found: false,
        id: input.id,
        source: input.source,
      };
    }

    const list = await storage.list();
    const info = list.find((i) => i.id === input.id);

    const result: ThreadResult = {
      id: conversation.id,
      title: conversation.metadata.title,
      sourceApp: conversation.metadata.sourceApp,
      createdAt: conversation.metadata.createdAt,
      updatedAt: conversation.metadata.updatedAt,
      tags: conversation.metadata.tags,
      summary: conversation.metadata.summary,
      filePath: info?.filePath,
      remoteUrl: info?.remoteUrl,
      format: info?.format || "markdown",
    };

    if (input.includeContent) {
      result.content = { messages: conversation.messages };
    }

    if (input.includeRelevanceInfo && info) {
      const ageInDays = (Date.now() - new Date(info.savedAt).getTime()) / (1000 * 60 * 60 * 24);
      result.relevance = {
        score: 100,
        matchedFields: ["id"],
        messageCount: conversation.messages.length,
        wordCount: calculateWordCount(conversation),
        topicHints: extractTopicHints(conversation),
        ageInDays: Math.round(ageInDays),
      };
    }

    return {
      found: true,
      source: input.source,
      thread: result,
    };
  }

  // Search/list mode
  const allInfos = await storage.list();
  const results: ThreadResult[] = [];

  for (const info of allInfos) {
    if (results.length >= input.limit) break;

    const conversation = await storage.get(info.id);
    if (!conversation) continue;

    if (!matchesFilters(conversation, input)) continue;

    const { score, matchedFields } = calculateRelevance(
      conversation,
      info,
      input.query,
      input.titleContains,
    );

    const ageInDays = (Date.now() - new Date(info.savedAt).getTime()) / (1000 * 60 * 60 * 24);

    const result: ThreadResult = {
      id: info.id,
      title: conversation.metadata.title,
      sourceApp: conversation.metadata.sourceApp,
      createdAt: conversation.metadata.createdAt,
      updatedAt: conversation.metadata.updatedAt,
      tags: conversation.metadata.tags,
      summary: conversation.metadata.summary,
      filePath: info.filePath,
      remoteUrl: info.remoteUrl,
      format: info.format,
    };

    if (input.includeRelevanceInfo) {
      result.relevance = {
        score,
        matchedFields,
        messageCount: conversation.messages.length,
        wordCount: calculateWordCount(conversation),
        topicHints: extractTopicHints(conversation),
        ageInDays: Math.round(ageInDays),
      };
    }

    if (input.includeContent) {
      result.content = { messages: conversation.messages };
    }

    results.push(result);
  }

  // Sort by relevance
  if (input.includeRelevanceInfo) {
    results.sort((a, b) => (b.relevance?.score || 0) - (a.relevance?.score || 0));
  }

  return {
    source: input.source,
    totalResults: results.length,
    filters: {
      query: input.query,
      title: input.title,
      titleContains: input.titleContains,
      tags: input.tags,
      sourceApp: input.sourceApp,
      dateRange:
        input.dateFrom || input.dateTo
          ? { from: input.dateFrom, to: input.dateTo }
          : undefined,
    },
    threads: results,
  };
}

export const findThreadsTool = {
  name: "find_threads",
  description:
    "Find saved conversation threads. Can get by ID, search by title, or query content. " +
    "Supports filtering by tags, source app, and date range. " +
    "Use includeContent=true to load full conversations.",
  inputSchema: FindThreadsInputSchema,
  handler: findThreads,
};
