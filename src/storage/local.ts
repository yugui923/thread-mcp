import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  Conversation,
  SavedConversationInfo,
  SaveOptions,
  StorageProvider,
} from "../types.js";
import { getFormatter } from "../formatters/index.js";

export interface LocalStorageOptions {
  baseDir: string;
}

export class LocalStorage implements StorageProvider {
  private baseDir: string;
  private indexPath: string;
  private index: Map<string, SavedConversationInfo> = new Map();
  private initialized = false;

  constructor(options: LocalStorageOptions) {
    this.baseDir = options.baseDir;
    this.indexPath = join(this.baseDir, ".conversation-index.json");
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  private async loadIndex(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDir();

    try {
      const content = await readFile(this.indexPath, "utf-8");
      const entries: SavedConversationInfo[] = JSON.parse(content);
      this.index = new Map(entries.map((e) => [e.id, e]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.index = new Map();
    }

    this.initialized = true;
  }

  private async saveIndex(): Promise<void> {
    const entries = Array.from(this.index.values());
    await writeFile(this.indexPath, JSON.stringify(entries, null, 2), "utf-8");
  }

  private sanitizeFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  async save(
    conversation: Conversation,
    options: SaveOptions,
  ): Promise<SavedConversationInfo> {
    await this.loadIndex();

    const formatter = getFormatter(options.format);
    const content = formatter.format(conversation, options);

    const filename = `${this.sanitizeFilename(conversation.metadata.title)}-${conversation.id.slice(0, 8)}${formatter.extension}`;
    const filePath = join(this.baseDir, filename);

    await writeFile(filePath, content, "utf-8");

    const info: SavedConversationInfo = {
      id: conversation.id,
      title: conversation.metadata.title,
      filePath,
      format: options.format,
      savedAt: new Date().toISOString(),
      sourceApp: conversation.metadata.sourceApp,
    };

    this.index.set(conversation.id, info);
    await this.saveIndex();

    return info;
  }

  async list(): Promise<SavedConversationInfo[]> {
    await this.loadIndex();
    return Array.from(this.index.values()).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  }

  async get(id: string): Promise<Conversation | null> {
    await this.loadIndex();

    const info = this.index.get(id);
    if (!info || !info.filePath) {
      return null;
    }

    try {
      const content = await readFile(info.filePath, "utf-8");
      const formatter = getFormatter(info.format);
      return formatter.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.index.delete(id);
        await this.saveIndex();
        return null;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.loadIndex();

    const info = this.index.get(id);
    if (!info) {
      return false;
    }

    if (info.filePath) {
      try {
        await unlink(info.filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }

    this.index.delete(id);
    await this.saveIndex();

    return true;
  }

  async getFilePath(id: string): Promise<string | null> {
    await this.loadIndex();
    const info = this.index.get(id);
    return info?.filePath ?? null;
  }
}

let defaultStorage: LocalStorage | null = null;

export function getDefaultLocalStorage(): LocalStorage {
  if (!defaultStorage) {
    const baseDir =
      process.env.THREAD_MCP_STORAGE_DIR || join(homedir(), ".thread-mcp");
    defaultStorage = new LocalStorage({ baseDir });
  }
  return defaultStorage;
}

export function createLocalStorage(baseDir: string): LocalStorage {
  return new LocalStorage({ baseDir });
}
