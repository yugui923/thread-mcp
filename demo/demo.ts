/**
 * Demo script for thread-mcp — connects via MCP SDK and walks through
 * the full save / find / resume / update / delete workflow.
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

function header(label: string) {
  console.log();
  console.log(
    `${BOLD}${CYAN}━━━ ${label} ${"━".repeat(Math.max(0, 60 - label.length))}${RESET}`,
  );
  console.log();
}

function step(msg: string) {
  console.log(`  ${GREEN}▸${RESET} ${msg}`);
}

function info(label: string, value: string) {
  console.log(`    ${DIM}${label}:${RESET} ${value}`);
}

function json(obj: unknown) {
  const text = JSON.stringify(obj, null, 2);
  for (const line of text.split("\n")) {
    console.log(`    ${DIM}${line}${RESET}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Create a temp directory so the demo is self-contained
  const demoDir = join(tmpdir(), `thread-mcp-demo-${Date.now()}`);
  await mkdir(demoDir, { recursive: true });

  console.log();
  console.log(
    `${BOLD}${MAGENTA}  ╔══════════════════════════════════════════╗${RESET}`,
  );
  console.log(
    `${BOLD}${MAGENTA}  ║        thread-mcp  —  Live Demo          ║${RESET}`,
  );
  console.log(
    `${BOLD}${MAGENTA}  ╚══════════════════════════════════════════╝${RESET}`,
  );
  console.log();
  console.log(`  ${DIM}Save, search, resume & manage AI conversation threads${RESET}`);
  console.log(`  ${DIM}Output dir: ${demoDir}${RESET}`);

  // ── Connect ────────────────────────────────────────────────────────────────

  header("1 · Connect to MCP server");

  step("Spawning server via stdio transport…");

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
  step(`${GREEN}Connected!${RESET}`);

  const { tools } = await client.listTools();
  step(`Available tools (${tools.length}):`);
  for (const tool of tools) {
    console.log(
      `    ${YELLOW}${tool.name}${RESET}  ${DIM}— ${tool.description?.slice(0, 70)}…${RESET}`,
    );
  }

  await sleep(500);

  // ── Save thread #1 (markdown) ──────────────────────────────────────────────

  header("2 · Save a thread (markdown)");

  step("Saving a coding conversation…");

  const save1 = parseResult(
    await client.callTool({
      name: "save_thread",
      arguments: {
        title: "Fix React useEffect cleanup",
        messages: [
          {
            role: "user",
            content:
              "I have a memory leak in my React component. The useEffect cleanup isn't running when the component unmounts.",
          },
          {
            role: "assistant",
            content:
              "This is a common issue! Make sure you're returning a cleanup function from useEffect. Here's the pattern:\n\n```tsx\nuseEffect(() => {\n  const controller = new AbortController();\n  fetchData(controller.signal);\n  return () => controller.abort();\n}, []);\n```\n\nThe cleanup function runs when the component unmounts or before the effect re-runs.",
          },
          {
            role: "user",
            content: "That fixed it! The AbortController pattern is really clean.",
          },
        ],
        tags: ["react", "hooks", "debugging"],
        summary: "Debugging a useEffect memory leak with AbortController cleanup",
        sourceApp: "Claude Code",
        format: "markdown",
        outputDir: demoDir,
      },
    }),
  );

  info("ID", save1.id);
  info("Format", save1.format);
  info("Messages", String(save1.messageCount));
  info("File", save1.filePath);

  await sleep(500);

  // ── Save thread #2 (JSON) ──────────────────────────────────────────────────

  header("3 · Save another thread (JSON)");

  step("Saving a Python conversation…");

  const save2 = parseResult(
    await client.callTool({
      name: "save_thread",
      arguments: {
        title: "Python async patterns",
        messages: [
          {
            role: "user",
            content:
              "What's the difference between asyncio.gather and asyncio.TaskGroup?",
          },
          {
            role: "assistant",
            content:
              "TaskGroup (Python 3.11+) is the modern approach. Unlike gather(), it cancels all tasks if any task raises an exception, preventing fire-and-forget failures. Use TaskGroup for structured concurrency.",
          },
        ],
        tags: ["python", "async", "concurrency"],
        summary: "Comparing asyncio.gather vs TaskGroup for structured concurrency",
        sourceApp: "Claude Code",
        format: "json",
        outputDir: demoDir,
      },
    }),
  );

  info("ID", save2.id);
  info("Format", save2.format);
  info("Messages", String(save2.messageCount));
  info("File", save2.filePath);

  await sleep(500);

  // ── Find threads ───────────────────────────────────────────────────────────

  header("4 · Find threads");

  step("Searching for threads about debugging…");

  const found = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: {
        query: "debugging",
        includeRelevanceInfo: true,
        outputDir: demoDir,
      },
    }),
  );

  info("Results found", String(found.totalResults));
  for (const thread of found.threads) {
    console.log();
    console.log(`    ${BOLD}${WHITE}${thread.title}${RESET}`);
    info("  Tags", (thread.tags || []).join(", "));
    if (thread.relevance) {
      info(
        "  Relevance",
        `score ${thread.relevance.score}, matched: ${thread.relevance.matchedFields.join(", ")}`,
      );
    }
  }

  await sleep(500);

  step("Listing all threads…");

  const all = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: { outputDir: demoDir },
    }),
  );

  info("Total threads", String(all.totalResults));
  for (const thread of all.threads) {
    console.log(
      `    ${BLUE}•${RESET} ${thread.title}  ${DIM}(${thread.sourceApp || "unknown"})${RESET}`,
    );
  }

  await sleep(500);

  // ── Resume a thread ────────────────────────────────────────────────────────

  header("5 · Resume a thread");

  step("Resuming the React thread (narrative format)…");

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

  info("Found", String(resumed.found));
  info("Format", resumed.format);
  console.log();
  // Print the narrative content with indentation
  for (const line of resumed.content.split("\n").slice(0, 20)) {
    console.log(`    ${DIM}${line}${RESET}`);
  }

  await sleep(500);

  // ── Update a thread ────────────────────────────────────────────────────────

  header("6 · Update a thread (append messages)");

  step("Appending a follow-up to the React thread…");

  const updated = parseResult(
    await client.callTool({
      name: "update_thread",
      arguments: {
        id: save1.id,
        messages: [
          {
            role: "user",
            content:
              "One more question — should I use useCallback for the fetch function?",
          },
          {
            role: "assistant",
            content:
              "Only if you pass the function as a prop or include it in another hook's dependency array. Otherwise the AbortController pattern alone is sufficient.",
          },
        ],
        newTags: ["react", "hooks", "debugging", "performance"],
        outputDir: demoDir,
      },
    }),
  );

  info("Mode", updated.mode);
  info("Messages added", String(updated.messagesAdded));
  info("Total messages", String(updated.messageCount));

  // Verify the updated tags by fetching the thread
  const afterUpdate = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: { id: save1.id, outputDir: demoDir },
    }),
  );
  info("Updated tags", (afterUpdate.thread.tags || []).join(", "));

  await sleep(500);

  // ── Delete a thread ────────────────────────────────────────────────────────

  header("7 · Delete a thread");

  step("Deleting the Python thread…");

  const deleted = parseResult(
    await client.callTool({
      name: "delete_thread",
      arguments: {
        id: save2.id,
        outputDir: demoDir,
      },
    }),
  );

  info("Deleted", String(deleted.deleted));
  info("Title", deleted.title);

  step("Confirming deletion…");

  const confirm = parseResult(
    await client.callTool({
      name: "find_threads",
      arguments: { outputDir: demoDir },
    }),
  );

  info("Remaining threads", String(confirm.totalResults));

  await sleep(500);

  // ── Show saved file on disk ────────────────────────────────────────────────

  header("8 · Saved markdown file on disk");

  step(`Reading ${save1.filePath}…`);
  console.log();

  const fileContent = await readFile(save1.filePath, "utf-8");
  for (const line of fileContent.split("\n")) {
    console.log(`  ${DIM}│${RESET} ${line}`);
  }

  // ── Cleanup & exit ─────────────────────────────────────────────────────────

  console.log();
  console.log(
    `${BOLD}${GREEN}  ✓ Demo complete!${RESET}  ${DIM}All tools demonstrated successfully.${RESET}`,
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
