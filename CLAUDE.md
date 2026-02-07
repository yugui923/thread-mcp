# CLAUDE.md - Development Guide

This file contains development conventions and instructions for working on the Thread MCP project.

## Project Overview

This is an MCP (Model Context Protocol) server built with TypeScript that enables saving AI conversations to local files or remote servers.

## Tech Stack

- **Language**: TypeScript 5.7+
- **Runtime**: Node.js 22+
- **Package Manager**: npm
- **Testing**: Vitest
- **Formatting**: Prettier
- **Linting**: ESLint
- **Schema Validation**: Zod
- **MCP SDK**: @modelcontextprotocol/sdk

## Commands

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test                  # Run all tests once
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# Code quality
npm run lint              # Run ESLint
npm run format            # Format with Prettier
npm run format:check      # Check formatting
npm run typecheck         # TypeScript type checking

# Clean build artifacts
npm run clean
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── server.ts             # MCP server setup and request handlers
├── types.ts              # TypeScript types and Zod schemas
├── tools/                # MCP tool implementations
│   ├── index.ts          # Tool exports
│   ├── save-local.ts     # Save to local filesystem
│   ├── save-remote.ts    # Save to remote server
│   ├── list.ts           # List saved conversations
│   ├── get.ts            # Retrieve a conversation
│   └── delete.ts         # Delete a conversation
├── formatters/           # Output format handlers
│   ├── index.ts          # Formatter exports
│   ├── markdown.ts       # Markdown formatter
│   └── json.ts           # JSON formatter
└── storage/              # Storage providers
    ├── index.ts          # Storage exports
    ├── local.ts          # Local filesystem storage
    └── remote.ts         # Remote HTTP storage

tests/
├── unit/                 # Unit tests
│   ├── formatters.test.ts
│   ├── storage.test.ts
│   ├── tools.test.ts
│   └── types.test.ts
└── e2e/                  # End-to-end tests
    └── server.test.ts
```

## Coding Conventions

### TypeScript

- Use strict mode (`"strict": true` in tsconfig)
- Prefer `type` imports for types-only imports
- Use Zod schemas for runtime validation
- Export types alongside their schemas

### Naming

- `camelCase` for functions and variables
- `PascalCase` for types, interfaces, and classes
- `kebab-case` for filenames
- Suffix schemas with `Schema` (e.g., `MessageSchema`)
- Suffix tool definitions with `Tool` (e.g., `saveLocalTool`)

### File Organization

- One main export per file
- Index files for directory exports
- Co-locate types with their implementations when small
- Separate types.ts for shared types

### Error Handling

- Use Zod for input validation (throws on invalid input)
- Return structured error responses from tools
- Let storage providers throw on I/O errors
- Catch and wrap errors at the server handler level

### Testing

- Unit tests for pure functions (formatters, schemas)
- Integration tests for storage providers
- E2E tests for the full MCP server
- Use `vitest` globals (`describe`, `it`, `expect`)
- Mock external dependencies (fetch, filesystem for some tests)

## Adding a New Tool

1. Create a new file in `src/tools/`:

```typescript
import { z } from "zod";

export const MyToolInputSchema = z.object({
  // Define input parameters
});

export type MyToolInput = z.infer<typeof MyToolInputSchema>;

export async function myTool(input: MyToolInput) {
  // Implementation
  return { success: true /* ... */ };
}

export const myToolTool = {
  name: "my_tool",
  description: "Description of what this tool does",
  inputSchema: MyToolInputSchema,
  handler: myTool,
};
```

2. Export from `src/tools/index.ts`

3. Add to `src/server.ts`:
   - Add to `ListToolsRequestSchema` handler
   - Add case to `CallToolRequestSchema` handler

4. Write tests in `tests/unit/tools.test.ts`

## Adding a New Formatter

1. Create a new file in `src/formatters/`:

```typescript
import type { Conversation, Formatter, SaveOptions } from "../types.js";

export const myFormatter: Formatter = {
  extension: ".ext",

  format(conversation: Conversation, options: SaveOptions): string {
    // Format conversation to string
  },

  parse(content: string): Conversation {
    // Parse string back to conversation
  },
};
```

2. Export from `src/formatters/index.ts`

3. Add to `getFormatter` function

4. Add format option to `OutputFormatSchema` in `types.ts`

5. Write tests in `tests/unit/formatters.test.ts`

## MCP Protocol Notes

- Tools receive arguments as `Record<string, unknown>`
- Always validate with Zod before using
- Return `{ content: [{ type: "text", text: string }] }` from handlers
- Set `isError: true` on error responses
- Use JSON.stringify for structured responses

## Common Patterns

### Validating Tool Input

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const input = MyToolInputSchema.parse(request.params.arguments);
    const result = await myTool(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
});
```

### Storage Provider Pattern

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

## Git Workflow

- Create feature branches from `main`
- Write descriptive commit messages
- Before each commit, run tests, lint, format checks, and security audit:
  ```bash
  npm test && npm run lint && npm run format:check && npm audit --audit-level=high
  ```
- Fix any issues before committing (use `npm run format` to auto-fix formatting)
