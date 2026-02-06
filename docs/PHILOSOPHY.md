# Thread MCP Philosophy

This document explains the design philosophy, principles, and decisions behind Thread MCP.

## Table of Contents

- [Core Mission](#core-mission)
- [Design Principles](#design-principles)
- [Why MCP?](#why-mcp)
- [Architectural Decisions](#architectural-decisions)
- [Trade-offs](#trade-offs)
- [Future Direction](#future-direction)

## Core Mission

**Thread MCP exists to make AI conversations persistent and retrievable.**

The problem we solve: AI conversations are ephemeral. When you have a productive session with an AI assistant—debugging a complex issue, brainstorming ideas, or working through a design—that context disappears when the session ends. Thread MCP captures these valuable conversations so they can be:

1. **Referenced later** - Find that conversation where you solved a specific problem
2. **Resumed** - Continue a conversation with full context
3. **Shared** - Export conversations in human-readable formats
4. **Organized** - Tag, search, and manage your conversation history

## Design Principles

### 1. Simplicity Over Features

We prioritize doing a few things well over doing many things poorly.

**What this means in practice:**
- Five core tools, not fifty
- Simple file-based storage by default
- Markdown as the primary format (human-readable)
- No database required for basic usage

**What we explicitly avoid:**
- Complex query languages
- Built-in AI analysis of conversations
- Automatic categorization
- Social features

### 2. User Ownership of Data

Your conversations belong to you, not to a service.

**Implementation:**
- Local-first storage (files on your machine)
- Human-readable formats (Markdown, JSON)
- No lock-in (standard file formats)
- No telemetry or analytics
- No cloud requirement (remote storage is optional)

**File format decisions:**
```markdown
# Why Markdown as default?

1. You can read it without any tool
2. Version control friendly (git diff works)
3. Renders nicely on GitHub, editors, etc.
4. Easy to process with standard tools (grep, sed, awk)
```

### 3. Progressive Complexity

Simple by default, powerful when needed.

**Zero-config experience:**
```bash
# Just works - saves to ~/.thread-mcp/
npx thread-mcp
```

**Full customization available:**
```bash
# Custom storage, format, and remote backup
THREAD_MCP_STORAGE_DIR=/custom/path \
THREAD_MCP_FORMAT=json \
THREAD_MCP_REMOTE_URL=https://api.example.com \
npx thread-mcp
```

### 4. Standards-Based Integration

We build on established standards rather than inventing new ones.

| Need | Our Approach | Alternative We Avoided |
|------|--------------|----------------------|
| AI Integration | MCP Protocol | Custom API |
| Data Format | JSON, Markdown | Proprietary format |
| Schema Validation | Zod (JSON Schema) | Custom validation |
| Configuration | Environment variables | Config file format |
| Publishing | npm + JSR | Single registry |

### 5. Layered Architecture

Each layer has one job and does it well.

```
┌─────────────────────────────────────────┐
│           Protocol Layer                │  ← Speaks MCP
├─────────────────────────────────────────┤
│            Tools Layer                  │  ← Business logic
├─────────────────────────────────────────┤
│          Formatter Layer                │  ← Serialization
├─────────────────────────────────────────┤
│           Storage Layer                 │  ← Persistence
└─────────────────────────────────────────┘
```

Why this matters:
- Easy to add new formatters without touching storage
- Easy to add new storage backends without touching tools
- Easy to test each layer in isolation

## Why MCP?

### The Model Context Protocol

MCP (Model Context Protocol) is Anthropic's open standard for connecting AI assistants to external tools and data sources. We chose MCP because:

1. **Standardization** - One integration works with multiple AI applications
2. **Security** - Clear permission model for tool access
3. **Discoverability** - Tools self-describe their capabilities
4. **Ecosystem** - Growing ecosystem of MCP-compatible tools

### Alternative Approaches Considered

| Approach | Pros | Cons | Why We Didn't Choose |
|----------|------|------|---------------------|
| REST API | Universal | Requires custom integration per client | Not AI-native |
| Browser Extension | Easy install | Limited to browser-based AI | Not universal |
| IDE Plugin | Deep integration | Platform-specific | Too narrow |
| **MCP Server** | Standard, AI-native | Newer protocol | ✓ Chose this |

## Architectural Decisions

### Decision 1: Zod-First Schema Design

**What:** All data validation uses Zod schemas, which generate TypeScript types and JSON Schema.

**Why:**
```typescript
// Single source of truth
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
});

// TypeScript type derived automatically
export type Message = z.infer<typeof MessageSchema>;

// JSON Schema for MCP protocol generated at runtime
const jsonSchema = zodToJsonSchema(MessageSchema);
```

**Benefits:**
- No type/runtime validation drift
- Self-documenting schemas
- MCP protocol compatibility built-in

### Decision 2: File-Based Index

**What:** Conversation metadata stored in `.conversation-index.json` alongside conversation files.

**Why not a database?**
- Zero dependencies
- Works on any system with a filesystem
- Portable (copy the directory, copy the data)
- Human-inspectable

**Trade-off acknowledged:** Not suitable for millions of conversations. That's okay—our target is personal/team use, not enterprise scale.

### Decision 3: Configuration Precedence

**What:** Three-tier precedence: tool parameter > environment variable > default.

```
Tool Call Parameter     (highest priority)
       ↓
Environment Variable
       ↓
Hardcoded Default       (lowest priority)
```

**Why this order?**
- Tool parameters allow per-call customization
- Environment variables allow per-deployment configuration
- Defaults ensure it "just works"

**Example:**
```typescript
// If tool call specifies format="json", use that
// Else if THREAD_MCP_FORMAT=json, use that
// Else use "markdown"
const format = resolveFormat(input.format);
```

### Decision 4: Dual Registry Publishing

**What:** Published to both npm and JSR.

| Registry | Audience | What's Published |
|----------|----------|-----------------|
| npm | Node.js users | Compiled JavaScript |
| JSR | Deno/modern TS | Source TypeScript |

**Why both?**
- npm has the largest audience
- JSR provides better TypeScript experience
- Different import patterns serve different needs

### Decision 5: No External Dependencies (Runtime)

**What:** Only two runtime dependencies: `@modelcontextprotocol/sdk` and `zod`.

**Why minimize dependencies?**
- Faster installation
- Smaller attack surface
- Fewer breaking changes
- Easier maintenance

**What we avoided:**
- ORMs (use filesystem directly)
- HTTP clients (use native fetch)
- Date libraries (use native Date)
- Logging frameworks (use console)

## Trade-offs

Every design decision involves trade-offs. Here's what we consciously chose:

### Simplicity vs Features

**Chose:** Simplicity

```
┌──────────────────────────────────────────────────────────┐
│  FEATURES WE HAVE          │  FEATURES WE DON'T HAVE    │
├────────────────────────────┼─────────────────────────────┤
│  ✓ Save conversations      │  ✗ Full-text search        │
│  ✓ Basic search by tags    │  ✗ AI-powered search       │
│  ✓ Resume conversations    │  ✗ Conversation branching  │
│  ✓ Markdown/JSON export    │  ✗ Multiple export formats │
│  ✓ Local + remote storage  │  ✗ Cloud sync              │
└────────────────────────────┴─────────────────────────────┘
```

### Performance vs Portability

**Chose:** Portability

- JSON index file vs SQLite database
- File-per-conversation vs single data file
- No caching layer vs in-memory cache

For typical personal use (hundreds to low thousands of conversations), this works well. For larger scale, users can implement custom storage backends.

### Type Safety vs Flexibility

**Chose:** Type Safety

- Strict TypeScript compilation
- Zod runtime validation
- Explicit schemas for all data structures

This catches errors early but means less flexibility for edge cases.

### Convention vs Configuration

**Chose:** Convention with optional configuration

```bash
# Convention (zero config)
~/.thread-mcp/                     # Default storage
*.md                               # Default format

# Configuration (when needed)
THREAD_MCP_STORAGE_DIR=/custom
THREAD_MCP_FORMAT=json
```

## Future Direction

### What We Will Do

1. **Improve search** - Better filtering, sorting, and relevance scoring
2. **Add formatters** - YAML, structured Markdown variants
3. **Enhance remote storage** - More auth methods, retry logic
4. **Better tooling** - CLI for direct interaction

### What We Won't Do

1. **Build a UI** - Other tools do this better
2. **Add AI features** - Keep the tool focused
3. **Create a cloud service** - Users own their data
4. **Break backwards compatibility** - Existing conversations must remain readable

### Contribution Philosophy

We welcome contributions that:
- Fix bugs
- Improve documentation
- Add formatters or storage backends
- Enhance existing tools

We're cautious about contributions that:
- Add new tools (discuss in an issue first)
- Add dependencies
- Change data formats
- Require external services

## Summary

Thread MCP is built on these core beliefs:

1. **Conversations have value** - They deserve to be preserved
2. **Users own their data** - Local-first, standard formats
3. **Simple tools compose** - Do one thing well
4. **Standards matter** - Build on MCP, JSON, Markdown
5. **Complexity should be optional** - Progressive enhancement

We'd rather be a reliable, simple tool that does its job well than a feature-rich platform that tries to do everything.

---

*"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."*
— Antoine de Saint-Exupéry
