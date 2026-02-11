import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

interface Message {
  role: string;
  content: string;
}

function formatConversation(messages: Message[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find(
      (block: unknown) =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text",
    );
    if (textBlock && "text" in textBlock) return String(textBlock.text);
  }
  if (
    typeof content === "object" &&
    content !== null &&
    "type" in content &&
    "text" in content
  ) {
    return String((content as { text: string }).text);
  }
  return "";
}

export async function generateSummary(
  server: Server,
  messages: Message[],
): Promise<string> {
  const conversation = formatConversation(messages);

  const response = await server.createMessage({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Summarize the following conversation in 1-2 concise sentences. ` +
            `Return only the summary text, nothing else.\n\n${conversation}`,
        },
      },
    ],
    maxTokens: 150,
    modelPreferences: {
      costPriority: 1,
    },
  });

  const text = extractText(response.content).trim();
  if (!text) {
    throw new Error("Sampling returned empty summary");
  }
  return text;
}

export async function generateTags(
  server: Server,
  messages: Message[],
): Promise<string[]> {
  const conversation = formatConversation(messages);

  const response = await server.createMessage({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Analyze the following conversation and generate 3-5 short, relevant tags for categorization. ` +
            `Return ONLY a JSON array of lowercase strings, e.g. ["python", "debugging", "async"]. ` +
            `No other text.\n\n${conversation}`,
        },
      },
    ],
    maxTokens: 100,
    modelPreferences: {
      costPriority: 1,
    },
  });

  const text = extractText(response.content).trim();
  if (!text) {
    throw new Error("Sampling returned empty tags response");
  }

  // Try to parse as JSON array
  const jsonMatch = text.match(/\[.*\]/s);
  if (jsonMatch) {
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed as string[];
    }
  }

  // Fallback: split comma-separated values
  return text
    .replace(/[[\]"']/g, "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}
