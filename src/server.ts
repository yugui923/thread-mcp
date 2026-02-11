import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  saveThreadTool,
  findThreadsTool,
  updateThreadTool,
  deleteThreadTool,
  resumeThreadTool,
} from "./tools/index.js";
import { saveThread } from "./tools/save-thread.js";
import { findThreads } from "./tools/find-threads.js";
import { updateThread } from "./tools/update-thread.js";
import { deleteThread } from "./tools/delete-thread.js";
import { resumeThread } from "./tools/resume-thread.js";
import { generateSummary, generateTags } from "./sampling.js";
import { createLocalStorage } from "./storage/local.js";
import { createRemoteStorage } from "./storage/remote.js";
import {
  resolveSource,
  resolveStorageDir,
  resolveRemoteUrl,
  resolveApiKey,
  resolveHeaders,
} from "./config.js";

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodValue);

      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (schema.description) {
      result.description = schema.description;
    }
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    if (schema.description) {
      result.description = schema.description;
    }
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: "boolean" };
    if (schema.description) {
      result.description = schema.description;
    }
    return result;
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodArray) {
    const def = (schema as unknown as { _zod: { def: { element: z.ZodType } } })._zod
      .def;
    return {
      type: "array",
      items: zodToJsonSchema(def.element),
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodRecord) {
    const def = (schema as unknown as { _zod: { def: { valueType: z.ZodType } } })._zod
      .def;
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(def.valueType),
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodOptional) {
    const def = (schema as unknown as { _zod: { def: { innerType: z.ZodType } } })._zod
      .def;
    return zodToJsonSchema(def.innerType);
  }

  if (schema instanceof z.ZodDefault) {
    const def = (
      schema as unknown as {
        _zod: { def: { innerType: z.ZodType; defaultValue: unknown } };
      }
    )._zod.def;
    return {
      ...zodToJsonSchema(def.innerType),
      default: def.defaultValue,
    };
  }

  return { type: "string" };
}

export function createServer(): Server {
  const server = new Server(
    {
      name: "thread-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: saveThreadTool.name,
          description: saveThreadTool.description,
          inputSchema: zodToJsonSchema(saveThreadTool.inputSchema),
        },
        {
          name: findThreadsTool.name,
          description: findThreadsTool.description,
          inputSchema: zodToJsonSchema(findThreadsTool.inputSchema),
        },
        {
          name: updateThreadTool.name,
          description: updateThreadTool.description,
          inputSchema: zodToJsonSchema(updateThreadTool.inputSchema),
        },
        {
          name: deleteThreadTool.name,
          description: deleteThreadTool.description,
          inputSchema: zodToJsonSchema(deleteThreadTool.inputSchema),
        },
        {
          name: resumeThreadTool.name,
          description: resumeThreadTool.description,
          inputSchema: zodToJsonSchema(resumeThreadTool.inputSchema),
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "save_thread": {
          const saveInput = saveThreadTool.inputSchema.parse(args);

          if (saveInput.autoSummarize && !saveInput.summary) {
            try {
              saveInput.summary = await generateSummary(server, saveInput.messages);
            } catch {
              // Sampling unavailable or failed — proceed without summary
            }
          }
          if (saveInput.autoTag && !saveInput.tags?.length) {
            try {
              saveInput.tags = await generateTags(server, saveInput.messages);
            } catch {
              // Sampling unavailable or failed — proceed without tags
            }
          }

          result = await saveThread(saveInput);
          break;
        }

        case "find_threads":
          result = await findThreads(findThreadsTool.inputSchema.parse(args));
          break;

        case "update_thread": {
          const updateInput = updateThreadTool.inputSchema.parse(args);
          const needsSampling =
            (updateInput.autoSummarize && !updateInput.newSummary) ||
            (updateInput.autoTag && !updateInput.newTags?.length);

          if (needsSampling) {
            // Fetch existing thread to combine all messages for sampling
            const source = resolveSource(updateInput.source);
            const storage =
              source === "remote"
                ? createRemoteStorage({
                    url: resolveRemoteUrl(updateInput.remoteUrl)!,
                    apiKey: resolveApiKey(updateInput.apiKey),
                    headers: resolveHeaders(updateInput.headers),
                  })
                : createLocalStorage(resolveStorageDir(updateInput.outputDir));

            let allMessages = updateInput.messages;
            const threadId = updateInput.id;
            if (threadId) {
              const existing = await storage.get(threadId);
              if (existing) {
                allMessages = [...existing.messages, ...updateInput.messages];
              }
            } else if (updateInput.title) {
              const allInfos = await storage.list();
              for (const info of allInfos) {
                const conv = await storage.get(info.id);
                if (conv && conv.metadata.title === updateInput.title) {
                  allMessages = [...conv.messages, ...updateInput.messages];
                  break;
                }
              }
            }

            if (updateInput.autoSummarize && !updateInput.newSummary) {
              try {
                updateInput.newSummary = await generateSummary(server, allMessages);
              } catch {
                // Sampling unavailable or failed — proceed without summary
              }
            }
            if (updateInput.autoTag && !updateInput.newTags?.length) {
              try {
                updateInput.newTags = await generateTags(server, allMessages);
              } catch {
                // Sampling unavailable or failed — proceed without tags
              }
            }
          }

          result = await updateThread(updateInput);
          break;
        }

        case "delete_thread":
          result = await deleteThread(deleteThreadTool.inputSchema.parse(args));
          break;

        case "resume_thread":
          result = await resumeThread(resumeThreadTool.inputSchema.parse(args));
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
