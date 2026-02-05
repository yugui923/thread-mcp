import type { Conversation, Formatter, SaveOptions, Message } from "../types.js";

function formatMessage(message: Message, includeTimestamps: boolean): string {
  const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  const timestamp =
    includeTimestamps && message.timestamp
      ? ` _(${new Date(message.timestamp).toLocaleString()})_`
      : "";

  return `### ${roleLabel}${timestamp}\n\n${message.content}\n`;
}

function formatMetadata(conversation: Conversation): string {
  const { metadata } = conversation;
  const lines: string[] = [
    "---",
    `id: ${conversation.id}`,
    `title: "${metadata.title}"`,
    `created_at: ${metadata.createdAt}`,
  ];

  if (metadata.updatedAt) {
    lines.push(`updated_at: ${metadata.updatedAt}`);
  }

  if (metadata.sourceApp) {
    lines.push(`source_app: ${metadata.sourceApp}`);
  }

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`tags: [${metadata.tags.map((t) => `"${t}"`).join(", ")}]`);
  }

  lines.push("---\n");

  return lines.join("\n");
}

function parseMetadata(
  frontmatter: string,
): { id: string; metadata: Conversation["metadata"] } | null {
  const lines = frontmatter.split("\n").filter((l) => l.trim());
  const data: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  if (!data.id || !data.title || !data.created_at) {
    return null;
  }

  let tags: string[] | undefined;
  if (data.tags) {
    const tagsMatch = data.tags.match(/\[(.+)\]/);
    if (tagsMatch) {
      tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/^"|"$/g, ""));
    }
  }

  return {
    id: data.id,
    metadata: {
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      sourceApp: data.source_app,
      tags,
    },
  };
}

function parseMessages(content: string): Message[] {
  const messages: Message[] = [];
  const messageRegex =
    /### (User|Assistant|System)(?:\s+_\((.+?)\)_)?\s*\n\n([\s\S]*?)(?=\n### |$)/gi;

  let match;
  while ((match = messageRegex.exec(content)) !== null) {
    const role = match[1].toLowerCase() as Message["role"];
    const timestampStr = match[2];
    const messageContent = match[3].trim();

    const message: Message = {
      role,
      content: messageContent,
    };

    if (timestampStr) {
      try {
        const date = new Date(timestampStr);
        if (!isNaN(date.getTime())) {
          message.timestamp = date.toISOString();
        }
      } catch {
        // Ignore invalid timestamps
      }
    }

    messages.push(message);
  }

  return messages;
}

export const markdownFormatter: Formatter = {
  extension: ".md",

  format(conversation: Conversation, options: SaveOptions): string {
    const parts: string[] = [];

    if (options.includeMetadata) {
      parts.push(formatMetadata(conversation));
    }

    parts.push(`# ${conversation.metadata.title}\n`);

    if (conversation.metadata.summary) {
      parts.push(`> ${conversation.metadata.summary}\n`);
    }

    parts.push("## Conversation\n");

    for (const message of conversation.messages) {
      parts.push(formatMessage(message, options.includeTimestamps));
    }

    return parts.join("\n");
  },

  parse(content: string): Conversation {
    let id: string = crypto.randomUUID();
    let metadata: Conversation["metadata"] = {
      title: "Untitled Conversation",
      createdAt: new Date().toISOString(),
    };

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const parsed = parseMetadata(frontmatterMatch[1]);
      if (parsed) {
        id = parsed.id as string;
        metadata = parsed.metadata;
      }
      content = content.slice(frontmatterMatch[0].length);
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch && metadata.title === "Untitled Conversation") {
      metadata.title = titleMatch[1].trim();
    }

    const summaryMatch = content.match(/^>\s+(.+)$/m);
    if (summaryMatch) {
      metadata.summary = summaryMatch[1].trim();
    }

    const messages = parseMessages(content);

    return { id, metadata, messages };
  },
};
