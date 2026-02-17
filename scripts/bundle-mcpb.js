#!/usr/bin/env node

/**
 * Bundle thread-mcp as an MCPB (MCP Bundle) for Anthropic Directory submission.
 *
 * Produces thread-mcp.mcpb (a zip archive) containing:
 *   dist/          - compiled JS
 *   node_modules/  - production dependencies only
 *   manifest.json  - MCPB manifest
 *   package.json   - package metadata
 *   README.md      - documentation
 *   LICENSE         - license file
 */

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const STAGE = join(ROOT, ".mcpb-stage");
const OUTPUT = join(ROOT, "thread-mcp.mcpb");

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function clean() {
  if (existsSync(STAGE)) rmSync(STAGE, { recursive: true, force: true });
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { force: true });
}

// 1. Clean previous artifacts
console.log("Cleaning previous artifacts...");
clean();

// 2. Create staging directory
console.log("Creating staging directory...");
mkdirSync(STAGE, { recursive: true });

// 3. Copy required files
const filesToCopy = ["manifest.json", "package.json", "README.md", "LICENSE"];
for (const file of filesToCopy) {
  const src = join(ROOT, file);
  if (!existsSync(src)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
  cpSync(src, join(STAGE, file));
}

// 4. Copy dist directory
const distSrc = join(ROOT, "dist");
if (!existsSync(distSrc)) {
  console.error("dist/ not found. Run 'npm run build' first.");
  process.exit(1);
}
cpSync(distSrc, join(STAGE, "dist"), { recursive: true });

// 5. Install production-only dependencies in staging
console.log("Installing production dependencies...");
run("npm install --omit=dev --ignore-scripts", { cwd: STAGE });

// 6. Create the .mcpb zip archive
console.log("Creating thread-mcp.mcpb...");
run(`zip -r "${OUTPUT}" .`, { cwd: STAGE });

// 7. Clean up staging directory
console.log("Cleaning up staging directory...");
rmSync(STAGE, { recursive: true, force: true });

console.log(`\nBundle created: thread-mcp.mcpb`);
