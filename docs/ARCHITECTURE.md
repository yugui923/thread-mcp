# Thread MCP Architecture

This document provides a comprehensive overview of the Thread MCP server architecture, explaining how the components work together and the design decisions behind them.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Type System](#type-system)
- [Configuration System](#configuration-system)
- [Extension Points](#extension-points)

## Overview

Thread MCP is built as a **Model Context Protocol (MCP) server** that enables AI applications to save, search, update, and resume conversation threads. The architecture follows a layered design with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Protocol Layer                      │
│                        (server.ts)                           │
├─────────────────────────────────────────────────────────────┤
│                        Tools Layer                           │
│   save-thread │ find-threads │ update │ delete │ resume     │
├─────────────────────────────────────────────────────────────┤
│                     Business Logic                           │
│              (validation, search, formatting)                │
├──────────────────────────┬──────────────────────────────────┤
│     Storage Layer        │        Formatter Layer           │
│   local.ts │ remote.ts   │   markdown.ts │ json.ts          │
├──────────────────────────┴──────────────────────────────────┤
│                    Configuration Layer                       │
│                       (config.ts)                            │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── index.ts              # CLI entry point - bootstraps the server
├── server.ts             # MCP server setup and request routing
├── config.ts             # Environment-based configuration management
├── types.ts              # Shared TypeScript types and Zod schemas
│
├── tools/                # MCP tool implementations
│   ├── index.ts          # Re-exports all tools
│   ├── save-thread.ts    # Save new conversations
│   ├── find-threads.ts   # Search and list conversations
│   ├── update-thread.ts  # Append/replace messages
│   ├── delete-thread.ts  # Remove conversations
│   └── resume-thread.ts  # Load for continuation
│
├── formatters/           # Output format handlers
│   ├── index.ts          # Formatter registry
│   ├── markdown.ts       # Human-readable Markdown format
│   └── json.ts           # Machine-readable JSON format
│
└── storage/              # Storage backend implementations
    ├── index.ts          # Storage exports
    ├── local.ts          # Local filesystem storage
    └── remote.ts         # HTTP REST API storage
```

## Core Components

### 1. Entry Point (`index.ts`)

The entry point is minimal - it bootstraps the server and handles top-level errors:

```typescript
#!/usr/bin/env node
import { runServer } from "./server.js";

runServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
```

### 2. MCP Server (`server.ts`)

The server is the heart of the application. It:

1. **Creates the MCP Server instance** with name and version metadata
2. **Registers tool handlers** via `setRequestHandler`
3. **Converts Zod schemas to JSON Schema** for MCP protocol compatibility
4. **Routes tool calls** to appropriate handler functions
5. **Handles errors** uniformly across all tools

Key architectural decisions:

- **Zod-first schema design**: All input validation uses Zod schemas, which are then converted to JSON Schema at runtime
- **Centralized error handling**: All tool errors are caught and returned in a consistent format
- **Stateless design**: The server doesn't hold conversation state; each request is independent

```typescript
// Schema conversion flow
ZodSchema → zodToJsonSchema() → JSON Schema → MCP Protocol

// Request handling flow
MCP Request → Parse with Zod → Execute Handler → JSON Response
```

### 3. Tools Layer (`tools/`)

Each tool follows a consistent pattern:

```typescript
// 1. Define input schema with Zod
export const MyToolInputSchema = z.object({
  // parameters with descriptions
});

// 2. Implement handler function
export async function myTool(input: MyToolInput) {
  // Business logic
  return {
    /* result */
  };
}

// 3. Export tool definition
export const myToolTool = {
  name: "my_tool",
  description: "What this tool does",
  inputSchema: MyToolInputSchema,
  handler: myTool,
};
```

#### Tool Responsibilities

| Tool            | Primary Responsibility                                            |
| --------------- | ----------------------------------------------------------------- |
| `save_thread`   | Create new conversation, generate ID, persist to storage          |
| `find_threads`  | Search, filter, and retrieve conversations with relevance scoring |
| `update_thread` | Append messages, deduplicate, update metadata                     |
| `delete_thread` | Remove conversation from storage                                  |
| `resume_thread` | Load conversation with context optimized for AI continuation      |

### 4. Storage Layer (`storage/`)

The storage layer implements the **Repository Pattern** through the `StorageProvider` interface:

```typescript
interface StorageProvider {
  save(
    conversation: Conversation,
    options: SaveOptions,
  ): Promise<SavedConversationInfo>;
  list(): Promise<SavedConversationInfo[]>;
  get(id: string): Promise<Conversation | null>;
  delete(id: string): Promise<boolean>;
}
```

#### Local Storage (`local.ts`)

- **Index-based retrieval**: Maintains a `.conversation-index.json` file for fast lookups
- **Lazy initialization**: Index is loaded on first operation
- **Filename sanitization**: Titles are converted to safe filenames
- **Format-aware**: Delegates formatting to the Formatter layer

```
~/.thread-mcp/
├── .conversation-index.json    # Metadata index
├── my-conversation-abc123.md   # Markdown file
└── another-thread-def456.json  # JSON file
```

#### Remote Storage (`remote.ts`)

- **REST API client**: Implements standard CRUD operations
- **Authentication**: Supports Bearer token and custom headers
- **Format passthrough**: Sends formatted content to server

### 5. Formatter Layer (`formatters/`)

Formatters handle bidirectional conversion between `Conversation` objects and their serialized forms:

```typescript
interface Formatter {
  extension: string; // File extension (e.g., ".md")
  format(conversation: Conversation, options: SaveOptions): string;
  parse(content: string): Conversation;
}
```

#### Markdown Formatter

Produces human-readable files with YAML frontmatter:

```markdown
---
id: abc123
title: "My Conversation"
created_at: 2024-01-15T10:00:00.000Z
tags: ["coding", "python"]
---

# My Conversation

> A discussion about Python

## Conversation

### User _(1/15/2024, 10:00:00 AM)_

Hello!

### Assistant _(1/15/2024, 10:00:05 AM)_

Hi there!
```

#### JSON Formatter

Produces machine-readable structured data:

```json
{
  "id": "abc123",
  "metadata": {
    "title": "My Conversation",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "tags": ["coding", "python"]
  },
  "messages": [
    { "role": "user", "content": "Hello!", "timestamp": "..." },
    { "role": "assistant", "content": "Hi there!", "timestamp": "..." }
  ]
}
```

### 6. Configuration Layer (`config.ts`)

The configuration system provides a three-tier precedence hierarchy:

```
1. Tool call parameter (highest priority)
       ↓
2. Environment variable
       ↓
3. Hardcoded default (lowest priority)
```

This is implemented through `resolve*` functions:

```typescript
export function resolveFormat(toolParam: string | undefined): OutputFormat {
  if (toolParam === "markdown" || toolParam === "json") {
    return toolParam; // Tool param wins
  }
  return getServerConfig().format; // Fall back to env/default
}
```

## Data Flow

### Save Thread Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  MCP Client  │────▶│  save_thread │────▶│  Formatter   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   Storage    │◀────│   Content    │
                     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  File/Remote │
                     └──────────────┘
```

1. Client sends `save_thread` request with title, messages, and options
2. Tool validates input with Zod schema
3. Configuration resolves format and storage location
4. Formatter converts `Conversation` to string content
5. Storage provider persists content and updates index
6. Response returns with ID, path, and metadata

### Search Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  MCP Client  │────▶│ find_threads │────▶│   Storage    │
└──────────────┘     └──────────────┘     │    .list()   │
                            │             └──────────────┘
                            ▼                     │
                     ┌──────────────┐             │
                     │   Filters    │◀────────────┘
                     │  & Scoring   │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Results    │
                     └──────────────┘
```

## Type System

The type system uses Zod for runtime validation with TypeScript inference:

```typescript
// Schema definition
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
});

// Type inference
export type Message = z.infer<typeof MessageSchema>;
```

### Core Types

| Type                    | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `Message`               | Single conversation message with role and content |
| `Conversation`          | Complete thread with ID, metadata, and messages   |
| `ConversationMetadata`  | Title, timestamps, tags, summary, source app      |
| `SaveOptions`           | Format and output preferences                     |
| `SavedConversationInfo` | Lightweight info for listings (no content)        |
| `StorageProvider`       | Interface for storage backends                    |
| `Formatter`             | Interface for serialization formats               |

## Configuration System

### Environment Variables

| Variable                    | Default         | Description          |
| --------------------------- | --------------- | -------------------- |
| `THREAD_MCP_STORAGE_DIR`    | `~/.thread-mcp` | Storage directory    |
| `THREAD_MCP_FORMAT`         | `markdown`      | Output format        |
| `THREAD_MCP_DEFAULT_SOURCE` | `local`         | Storage backend      |
| `THREAD_MCP_REMOTE_URL`     | -               | Remote server URL    |
| `THREAD_MCP_API_KEY`        | -               | Authentication key   |
| `THREAD_MCP_REMOTE_HEADERS` | `{}`            | JSON-encoded headers |

### Configuration Caching

Configuration is cached after first read for performance:

```typescript
let cachedConfig: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    /* read from env */
  };
  return cachedConfig;
}
```

## Extension Points

### Adding a New Tool

1. Create `src/tools/my-tool.ts` with schema and handler
2. Export from `src/tools/index.ts`
3. Register in `src/server.ts` (ListTools and CallTool handlers)
4. Add tests in `tests/unit/tools.test.ts`

### Adding a New Formatter

1. Create `src/formatters/my-format.ts` implementing `Formatter`
2. Export from `src/formatters/index.ts`
3. Add to `getFormatter()` switch statement
4. Update `OutputFormatSchema` in `types.ts`

### Adding a New Storage Backend

1. Create `src/storage/my-storage.ts` implementing `StorageProvider`
2. Export from `src/storage/index.ts`
3. Add factory function (e.g., `createMyStorage()`)
4. Wire up in tool handlers

## Testing Architecture

```
tests/
├── unit/                 # Isolated component tests
│   ├── config.test.ts    # Configuration system
│   ├── formatters.test.ts
│   ├── storage.test.ts
│   ├── tools.test.ts
│   └── types.test.ts
├── integration/          # Component integration tests
│   └── env-config.test.ts
└── e2e/                  # Full server tests
    └── server.test.ts
```

- **Unit tests**: Test individual functions in isolation
- **Integration tests**: Test component interactions (e.g., tools + config)
- **E2E tests**: Test full MCP request/response cycle
