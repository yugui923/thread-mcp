/**
 * Demo script for thread-mcp — connects via MCP SDK and walks through
 * the full save / find / resume / update / delete workflow.
 *
 * Uses realistic pacing to simulate an LLM calling tools.
 *
 * Usage:
 *   npm run build && node --import tsx demo/demo.ts
 */

import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Colours ──────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const WHITE = "\x1b[37m";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  const textContent = result.content.find((c) => c.type === "text");
  return JSON.parse(textContent?.text || "{}");
}

function header(step: number, label: string) {
  console.log();
  console.log(
    `${BOLD}${CYAN}━━━ Step ${step}: ${label} ${"━".repeat(Math.max(0, 52 - label.length))}${RESET}`,
  );
  console.log();
}

function log(msg: string) {
  console.log(`  ${GREEN}▸${RESET} ${msg}`);
}

function info(label: string, value: string) {
  console.log(`    ${DIM}${label}:${RESET} ${value}`);
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulate LLM "thinking" before calling a tool
async function thinking(action: string) {
  process.stdout.write(`  ${DIM}⏳ ${action}${RESET}`);
  await pause(1000);
  process.stdout.write("\r\x1b[2K"); // clear line
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const demoDir = join(tmpdir(), `thread-mcp-demo-${Date.now()}`);
  await mkdir(demoDir, { recursive: true });

  console.log();
  console.log(
    `${BOLD}${MAGENTA}  ┌──────────────────────────────────────────────┐${RESET}`,
  );
  console.log(
    `${BOLD}${MAGENTA}  │           thread-mcp  ·  Live Demo           │${RESET}`,
  );
  console.log(
    `${BOLD}${MAGENTA}  │  Save, search, resume & manage AI threads    │${RESET}`,
  );
  console.log(
    `${BOLD}${MAGENTA}  └──────────────────────────────────────────────┘${RESET}`,
  );

  await pause(4000);

  // ── 1. Connect ─────────────────────────────────────────────────────────────

  header(1, "Connect to MCP server");

  log("Spawning server via stdio transport…");
  await pause(600);

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client(
    { name: "thread-mcp-demo", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  log(`${GREEN}Connected!${RESET}`);
  await pause(400);

  const { tools } = await client.listTools();
  log(`Server exposes ${BOLD}${tools.length} tools${RESET}:`);
  for (const tool of tools) {
    console.log(`    ${YELLOW}${tool.name}${RESET}`);
  }

  await pause(4000);

  // ── 2. save_thread ─────────────────────────────────────────────────────────

  header(2, "save_thread");

  log("Saving a React debugging conversation (markdown)…");
  await thinking("Calling save_thread…");

  const save1 = parseResult(
    await client.callTool({
      name: "save_thread",
      arguments: {
        title: "Fix useEffect memory leak",
        messages: [
          {
            role: "user",
            content:
              "My React app leaks memory. The WebSocket connection stays open after navigating away from the dashboard page.",
          },
          {
            role: "assistant",
            content:
              "You need to close the WebSocket in a useEffect cleanup function:\n\n```tsx\nuseEffect(() => {\n  const ws = new WebSocket(url);\n  ws.onmessage = handleMessage;\n  return () => ws.close();  // cleanup on unmount\n}, [url]);\n```\n\nThis ensures the connection closes when the component unmounts or when `url` changes.",
          },
          {
            role: "user",
            content: "That fixed it — no more leaked connections. Thanks!",
          },
        ],
        tags: ["react", "hooks", "websocket", "debugging"],
        summary: "Fixed a WebSocket memory leak by adding useEffect cleanup",
        sourceApp: "Claude Code",
        format: "markdown",
        outputDir: demoDir,
      },
    }),
  );

  log(`${GREEN}Saved!${RESET}`);
  info("Title", `"${save1.title}"`);
  info("Format", save1.format);
  info("Messages", String(save1.messageCount));
  info("Tags", "react, hooks, websocket, debugging");

  await pause(4000);

  log("Saving a Python async conversation (JSON)…");
  await thinking("Calling save_thread…");

  const save2 = parseResult(
    await client.callTool({
      name: "save_thread",
      arguments: {
        title: "Database connection pooling in FastAPI",
        messages: [
          {
            role: "user",
            content:
              "My FastAPI app creates a new DB connection for every request and it's slow under load. How do I add connection pooling?",
          },
          {
            role: "assistant",
            content:
              "Use SQLAlchemy's async engine with a connection pool. Set pool_size and max_overflow in create_async_engine(), then use a dependency to yield sessions from the pool.",
          },
        ],
        tags: ["python", "fastapi", "database", "performance"],
        summary: "Setting up SQLAlchemy connection pooling in FastAPI",
        sourceApp: "Claude Code",
        format: "json",
        outputDir: demoDir,
      },
    }),
  );

  log(`${GREEN}Saved!${RESET}`);
  info("Title", `"${save2.title}"`);
  info("Format", save2.format);

  await pause(4000);

  // ── 3. find_threads ────────────────────────────────────────────────────────

  header(3, "find_threads");

  log('Searching for "memory leak"…');
  await thinking("Calling find_threads…");

  const found = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: {
        query: "memory leak",
        includeRelevanceInfo: true,
        outputDir: demoDir,
      },
    }),
  );

  log(`Found ${BOLD}${found.totalResults}${RESET} result(s):`);
  for (const thread of found.threads) {
    console.log();
    console.log(`    ${BOLD}${WHITE}${thread.title}${RESET}`);
    info("  Tags", (thread.tags || []).join(", "));
    if (thread.relevance) {
      info(
        "  Relevance",
        `score ${thread.relevance.score}, matched: [${thread.relevance.matchedFields.join(", ")}]`,
      );
    }
  }

  await pause(4000);

  log("Listing all saved threads…");
  await thinking("Calling find_threads…");

  const all = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: { outputDir: demoDir },
    }),
  );

  log(`${BOLD}${all.totalResults}${RESET} threads on disk:`);
  for (const thread of all.threads) {
    console.log(
      `    ${BLUE}•${RESET} ${thread.title}  ${DIM}[${thread.format}]${RESET}`,
    );
  }

  await pause(4000);

  // ── 4. resume_thread ───────────────────────────────────────────────────────

  header(4, "resume_thread");

  log("Resuming the React thread to continue the conversation…");
  await thinking("Calling resume_thread…");

  const resumed = parseResult(
    await client.callTool({
      name: "resume_thread",
      arguments: {
        id: save1.id,
        format: "narrative",
        outputDir: demoDir,
      },
    }),
  );

  log(`Thread loaded (${BOLD}${resumed.format}${RESET} format):`);
  console.log();
  for (const line of resumed.content.split("\n").slice(0, 18)) {
    console.log(`    ${DIM}${line}${RESET}`);
  }
  console.log(`    ${DIM}…${RESET}`);

  await pause(5000);

  // ── 5. update_thread ───────────────────────────────────────────────────────

  header(5, "update_thread");

  log("Appending a follow-up exchange to the React thread…");
  await thinking("Calling update_thread…");

  const updated = parseResult(
    await client.callTool({
      name: "update_thread",
      arguments: {
        id: save1.id,
        messages: [
          {
            role: "user",
            content: "Should I also wrap the handler in useCallback?",
          },
          {
            role: "assistant",
            content:
              "Only if you pass it as a dependency to another hook. For this pattern, the cleanup is what matters most.",
          },
        ],
        newTags: ["react", "hooks", "websocket", "debugging", "performance"],
        outputDir: demoDir,
      },
    }),
  );

  log(`${GREEN}Updated!${RESET}`);
  info("Mode", updated.mode);
  info("Messages added", String(updated.messagesAdded));
  info("Total messages now", String(updated.messageCount));

  await pause(4000);

  // ── 6. delete_thread ───────────────────────────────────────────────────────

  header(6, "delete_thread");

  log("Deleting the FastAPI thread…");
  await thinking("Calling delete_thread…");

  const deleted = parseResult(
    await client.callTool({
      name: "delete_thread",
      arguments: {
        id: save2.id,
        outputDir: demoDir,
      },
    }),
  );

  log(`${GREEN}Deleted!${RESET}  "${deleted.title}"`);
  await pause(1000);

  log("Confirming deletion…");
  await pause(1000);
  const confirm = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: { outputDir: demoDir },
    }),
  );
  info("Remaining threads", String(confirm.totalResults));

  await pause(3000);

  // ── 7. Show the file on disk ───────────────────────────────────────────────

  header(7, "Saved file on disk");

  log(`Reading the markdown file…`);
  await pause(1000);
  console.log();

  const fileContent = await readFile(save1.filePath, "utf-8");
  for (const line of fileContent.split("\n")) {
    console.log(`  ${DIM}│${RESET} ${line}`);
  }

  await pause(3000);

  // ── Done ───────────────────────────────────────────────────────────────────

  console.log();
  console.log(
    `${BOLD}${GREEN}  ✓ Demo complete!${RESET}  ${DIM}All 5 tools demonstrated.${RESET}`,
  );
  console.log();

  await client.close();
  await rm(demoDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error(`${RED}Demo failed:${RESET}`, err);
  process.exit(1);
});
