# Thread MCP

An MCP (Model Context Protocol) server for saving AI conversation threads to local files or remote servers. This tool enables you to preserve, update, search, and resume your conversations with AI applications like Claude, ChatGPT, and others.

## Features

- **Unified Saving**: Store conversations locally (Markdown/JSON) or remotely via REST API
- **Smart Search**: Find threads by ID, title, tags, or full-text search with relevance scoring
- **Easy Updates**: Append messages by ID or title - no need to track IDs manually
- **Resume Conversations**: Load previous threads with context optimized for AI continuation
- **Rich Metadata**: Include timestamps, tags, summaries, and source application info

## Installation

```bash
npm install thread-mcp
```

Or install from source:

```bash
git clone https://github.com/your-username/thread-mcp.git
cd thread-mcp
npm install
npm run build
```

## Usage

### Configure with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "thread-mcp": {
      "command": "npx",
      "args": ["thread-mcp"]
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "thread-mcp": {
      "command": "node",
      "args": ["/path/to/thread-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

### `save_thread`

Save a new conversation thread to local storage or a remote server.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `title` | string | Yes | - | Title for the thread |
| `messages` | array | Yes | - | Array of messages with `role` and `content` |
| `destination` | string | No | `"local"` | Where to save: `"local"` or `"remote"` |
| `format` | string | No | `"markdown"` | Output format: `"markdown"` or `"json"` |
| `sourceApp` | string | No | - | Name of the AI application |
| `tags` | string[] | No | - | Tags for categorization |
| `summary` | string | No | - | Summary of the conversation |
| `outputDir` | string | No | `~/.thread-mcp` | Custom directory for local storage |
| `remoteUrl` | string | Conditional | - | Required when destination is `"remote"` |
| `apiKey` | string | No | - | API key for remote authentication |
| `headers` | object | No | - | Additional HTTP headers for remote |

**Example:**

```json
{
  "title": "Code Review Discussion",
  "messages": [
    { "role": "user", "content": "Can you review this Python function?" },
    { "role": "assistant", "content": "Sure! Here are my suggestions..." }
  ],
  "sourceApp": "Claude",
  "tags": ["code-review", "python"],
  "format": "markdown"
}
```

---

### `find_threads`

Find saved threads by ID, title, search query, or list all threads. Supports filtering and relevance scoring.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | No | - | Get a specific thread by ID (returns full details) |
| `title` | string | No | - | Find thread by exact title match |
| `query` | string | No | - | Search in titles, summaries, and content |
| `tags` | string[] | No | - | Filter by tags (must have ALL specified) |
| `sourceApp` | string | No | - | Filter by source application |
| `dateFrom` | string | No | - | Filter by creation date (ISO format) |
| `dateTo` | string | No | - | Filter by creation date (ISO format) |
| `includeMessages` | boolean | No | `false` | Include full message content |
| `limit` | number | No | `50` | Maximum results to return |
| `source` | string | No | `"local"` | Source: `"local"` or `"remote"` |
| `outputDir` | string | No | `~/.thread-mcp` | Directory for local storage |
| `remoteUrl` | string | Conditional | - | Required when source is `"remote"` |

**Examples:**

List all threads:
```json
{
  "source": "local"
}
```

Find by ID:
```json
{
  "id": "abc123-def456"
}
```

Search with filters:
```json
{
  "query": "Python debugging",
  "tags": ["code"],
  "includeMessages": true,
  "limit": 5
}
```

**Response includes relevance metadata:**

```json
{
  "totalResults": 3,
  "threads": [
    {
      "id": "abc123",
      "title": "Python Debugging Session",
      "summary": "Discussion about debugging techniques",
      "tags": ["python", "debugging"],
      "messageCount": 12,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "relevance": {
        "score": 85,
        "matchedFields": ["title", "content"],
        "topicHints": ["python", "debugging", "error handling"]
      }
    }
  ]
}
```

---

### `update_thread`

Update an existing thread by appending new messages. Find thread by ID or title.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | Conditional | - | Thread ID (use this OR title) |
| `title` | string | Conditional | - | Find thread by exact title (use this OR id) |
| `messages` | array | Yes | - | New messages to add |
| `mode` | string | No | `"append"` | `"append"` to add messages, `"replace"` to overwrite |
| `deduplicateMessages` | boolean | No | `true` | Skip duplicate messages |
| `newTitle` | string | No | - | Update the thread title |
| `tags` | string[] | No | - | Update tags |
| `summary` | string | No | - | Update summary |
| `source` | string | No | `"local"` | Source: `"local"` or `"remote"` |
| `outputDir` | string | No | `~/.thread-mcp` | Directory for local storage |
| `remoteUrl` | string | Conditional | - | Required when source is `"remote"` |

**Example - Append by title:**

```json
{
  "title": "Code Review Discussion",
  "messages": [
    { "role": "user", "content": "What about error handling?" },
    { "role": "assistant", "content": "Good point! You should..." }
  ]
}
```

**Example - Update by ID with new metadata:**

```json
{
  "id": "abc123-def456",
  "messages": [
    { "role": "user", "content": "Follow-up question..." }
  ],
  "tags": ["code-review", "python", "error-handling"],
  "summary": "Extended discussion including error handling"
}
```

---

### `delete_thread`

Delete a saved thread by ID or title.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | Conditional | - | Thread ID (use this OR title) |
| `title` | string | Conditional | - | Find thread by exact title (use this OR id) |
| `source` | string | No | `"local"` | Source: `"local"` or `"remote"` |
| `outputDir` | string | No | `~/.thread-mcp` | Directory for local storage |
| `remoteUrl` | string | Conditional | - | Required when source is `"remote"` |

**Examples:**

```json
{
  "id": "abc123-def456"
}
```

```json
{
  "title": "Old Discussion to Remove"
}
```

---

### `resume_thread`

Load a saved thread to continue the conversation. Returns context optimized for AI continuation.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | Conditional | - | Thread ID |
| `title` | string | Conditional | - | Find by exact title match |
| `titleContains` | string | Conditional | - | Find most recent thread with title containing this |
| `format` | string | No | `"structured"` | Output format (see below) |
| `maxMessages` | number | No | all | Limit to last N messages |
| `includeSummary` | boolean | No | `true` | Include thread summary |
| `source` | string | No | `"local"` | Source: `"local"` or `"remote"` |
| `outputDir` | string | No | `~/.thread-mcp` | Directory for local storage |
| `remoteUrl` | string | Conditional | - | Required when source is `"remote"` |

**Output Formats:**

- `"structured"` - Organized context with metadata, messages, and continuation hints
- `"narrative"` - Human-readable summary suitable for context injection
- `"messages"` - Raw message array only

**Example - Resume by title:**

```json
{
  "title": "Code Review Discussion",
  "format": "structured",
  "maxMessages": 10
}
```

**Structured Response:**

```json
{
  "found": true,
  "id": "abc123",
  "format": "structured",
  "context": {
    "title": "Code Review Discussion",
    "summary": "Discussion about Python best practices",
    "tags": ["code-review", "python"],
    "messageCount": 15,
    "startedAt": "2024-01-15T10:00:00.000Z"
  },
  "messages": [...],
  "continuationHint": "The assistant last responded. The user may have follow-up questions.",
  "totalMessages": 15
}
```

## Typical Workflow

1. **Save a new thread** after an important conversation:
   ```json
   { "title": "Project Planning", "messages": [...], "tags": ["planning"] }
   ```

2. **Continue later** - find and resume:
   ```json
   { "title": "Project Planning" }  // resume_thread
   ```

3. **Add new messages** as the conversation continues:
   ```json
   { "title": "Project Planning", "messages": [new messages...] }  // update_thread
   ```

4. **Search across threads** to find relevant context:
   ```json
   { "query": "database schema", "tags": ["planning"] }  // find_threads
   ```

## Output Formats

### Markdown

Produces a human-readable Markdown file with YAML frontmatter:

```markdown
---
id: abc123-def456
title: "Code Review Discussion"
created_at: 2024-01-15T10:00:00.000Z
source_app: Claude
tags: ["code-review", "python"]
---

# Code Review Discussion

> A discussion about Python best practices

## Conversation

### User _(1/15/2024, 10:00:00 AM)_

Can you review this Python function?

### Assistant _(1/15/2024, 10:00:05 AM)_

Sure! Here are my suggestions...
```

### JSON

Produces a structured JSON file:

```json
{
  "id": "abc123-def456",
  "metadata": {
    "title": "Code Review Discussion",
    "sourceApp": "Claude",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "tags": ["code-review", "python"]
  },
  "messages": [
    {
      "role": "user",
      "content": "Can you review this Python function?",
      "timestamp": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

## Remote Server API

When using remote storage, your server should implement these endpoints:

### `POST /conversations`

Create a new conversation.

**Request Body:**

```json
{
  "id": "string",
  "title": "string",
  "content": "string (formatted content)",
  "format": "markdown | json",
  "metadata": { ... }
}
```

**Response:**

```json
{
  "url": "https://your-server.com/conversations/id"
}
```

### `GET /conversations`

List all conversations.

### `GET /conversations/:id`

Get a specific conversation.

### `PUT /conversations/:id`

Update a conversation (for update_thread).

### `DELETE /conversations/:id`

Delete a conversation.

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

### Development Server

```bash
npm run dev
```

### Linting & Formatting

```bash
npm run lint            # ESLint
npm run format          # Prettier format
npm run format:check    # Check formatting
npm run typecheck       # TypeScript type checking
```

## Project Structure

```
thread-mcp/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server setup
│   ├── types.ts           # TypeScript types & Zod schemas
│   ├── tools/             # MCP tool implementations
│   │   ├── save-thread.ts    # Save new threads
│   │   ├── find-threads.ts   # Search/list/get threads
│   │   ├── update-thread.ts  # Update existing threads
│   │   ├── delete-thread.ts  # Delete threads
│   │   └── resume-thread.ts  # Load threads for continuation
│   ├── formatters/        # Output formatters
│   │   ├── markdown.ts
│   │   └── json.ts
│   └── storage/           # Storage providers
│       ├── local.ts
│       └── remote.ts
├── tests/
│   ├── unit/              # Unit tests
│   └── e2e/               # End-to-end tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## License

GPL-3.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request
