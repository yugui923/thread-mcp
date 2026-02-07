import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.string().datetime().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationMetadataSchema = z.object({
  title: z.string(),
  sourceApp: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
});
export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  metadata: ConversationMetadataSchema,
  messages: z.array(MessageSchema),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const OutputFormatSchema = z.enum(["markdown", "json"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const SaveOptionsSchema = z.object({
  format: OutputFormatSchema.default("markdown"),
  includeMetadata: z.boolean().default(true),
  includeTimestamps: z.boolean().default(true),
});
export type SaveOptions = z.infer<typeof SaveOptionsSchema>;

export const RemoteConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export const SavedConversationInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  filePath: z.string().optional(),
  remoteUrl: z.string().optional(),
  format: OutputFormatSchema,
  savedAt: z.string().datetime(),
  sourceApp: z.string().optional(),
});
export type SavedConversationInfo = z.infer<typeof SavedConversationInfoSchema>;

export interface StorageProvider {
  save(
    conversation: Conversation,
    options: SaveOptions,
  ): Promise<SavedConversationInfo>;
  list(): Promise<SavedConversationInfo[]>;
  get(id: string): Promise<Conversation | null>;
  delete(id: string): Promise<boolean>;
}

export interface Formatter {
  format(conversation: Conversation, options: SaveOptions): string;
  parse(content: string): Conversation;
  extension: string;
}
