import {
  type Conversation,
  type Formatter,
  type SaveOptions,
  ConversationSchema,
} from "../types.js";

export const jsonFormatter: Formatter = {
  extension: ".json",

  format(conversation: Conversation, options: SaveOptions): string {
    const output: Record<string, unknown> = {
      id: conversation.id,
    };

    if (options.includeMetadata) {
      output.metadata = conversation.metadata;
    }

    output.messages = conversation.messages.map((msg) => {
      if (!options.includeTimestamps) {
        const { timestamp: _timestamp, ...rest } = msg;
        return rest;
      }
      return msg;
    });

    return JSON.stringify(output, null, 2);
  },

  parse(content: string): Conversation {
    const data = JSON.parse(content);
    return ConversationSchema.parse(data);
  },
};
