import type {
  Conversation,
  SavedConversationInfo,
  SaveOptions,
  RemoteConfig,
  StorageProvider,
} from "../types.js";
import { getFormatter } from "../formatters/index.js";

export interface RemoteStorageOptions {
  config: RemoteConfig;
}

export class RemoteStorage implements StorageProvider {
  private config: RemoteConfig;

  constructor(options: RemoteStorageOptions) {
    this.config = options.config;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  async save(
    conversation: Conversation,
    options: SaveOptions,
  ): Promise<SavedConversationInfo> {
    const formatter = getFormatter(options.format);
    const content = formatter.format(conversation, options);

    const response = await fetch(`${this.config.url}/conversations`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        id: conversation.id,
        title: conversation.metadata.title,
        content,
        format: options.format,
        metadata: conversation.metadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Failed to save conversation to remote: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result = (await response.json()) as { url?: string };

    return {
      id: conversation.id,
      title: conversation.metadata.title,
      remoteUrl:
        result.url ||
        `${this.config.url}/conversations/${encodeURIComponent(conversation.id)}`,
      format: options.format,
      savedAt: new Date().toISOString(),
      sourceApp: conversation.metadata.sourceApp,
    };
  }

  async list(): Promise<SavedConversationInfo[]> {
    const response = await fetch(`${this.config.url}/conversations`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list conversations from remote: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      conversations?: SavedConversationInfo[];
    };
    return result.conversations || [];
  }

  async get(id: string): Promise<Conversation | null> {
    const response = await fetch(
      `${this.config.url}/conversations/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to get conversation from remote: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      content?: string;
      format?: "markdown" | "json";
      conversation?: Conversation;
    };

    if (result.content && result.format) {
      const formatter = getFormatter(result.format);
      return formatter.parse(result.content);
    }

    return result.conversation || null;
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(
      `${this.config.url}/conversations/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
    );

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to delete conversation from remote: ${response.status} ${response.statusText}`,
      );
    }

    return true;
  }
}

export function createRemoteStorage(config: RemoteConfig): RemoteStorage {
  return new RemoteStorage({ config });
}
