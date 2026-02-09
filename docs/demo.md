# Demo Recording

The demo GIF in the README is generated from a TypeScript script that connects to the MCP server via stdio and demonstrates all 5 tools.

## Run the demo locally

```bash
npm run build
node --import tsx demo/demo.ts
```

## Record the GIF

Requires [VHS](https://github.com/charmbracelet/vhs) and Chromium.

```bash
# In a container or CI environment, set VHS_NO_SANDBOX
VHS_NO_SANDBOX=true vhs demo/demo.tape
```

The output is written to `demo/demo.gif`.

## Files

- `demo/demo.ts` — Demo script (connects via MCP SDK, calls each tool with realistic pacing)
- `demo/demo.tape` — VHS tape file (terminal size, theme, timing)
- `demo/demo.gif` — Generated output
