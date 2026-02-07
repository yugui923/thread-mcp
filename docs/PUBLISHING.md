# Publishing Guide

This document explains how Thread MCP is published to package registries and how to release new versions.

## Table of Contents

- [Package Registries](#package-registries)
- [npm Publishing](#npm-publishing)
- [JSR Publishing](#jsr-publishing)
- [Version Management](#version-management)
- [Release Workflow](#release-workflow)
- [CI/CD Considerations](#cicd-considerations)

## Package Registries

Thread MCP is published to two package registries:

| Registry | Package Name | URL |
|----------|-------------|-----|
| **npm** | `thread-mcp` | https://www.npmjs.com/package/thread-mcp |
| **JSR** | `@yug/thread-mcp` | https://jsr.io/@yug/thread-mcp |

### Why Two Registries?

- **npm**: The standard Node.js package registry. Most users will install via npm.
- **JSR**: Anthropic's recommended registry for Deno and modern TypeScript. Provides better TypeScript-first experience with direct source publishing.

## npm Publishing

### Configuration (`package.json`)

```json
{
  "name": "thread-mcp",
  "version": "1.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "thread-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

#### Key Fields

| Field | Purpose |
|-------|---------|
| `name` | Package name on npm |
| `version` | Semantic version (must be unique per publish) |
| `main` | Entry point for CommonJS/Node.js |
| `types` | TypeScript declaration file |
| `bin` | CLI command registration |
| `files` | Files included in published package |
| `prepublishOnly` | Build step before publishing |

### What Gets Published

The npm package includes only:

```
thread-mcp/
├── dist/           # Compiled JavaScript + declaration files
│   ├── index.js
│   ├── index.d.ts
│   ├── server.js
│   ├── server.d.ts
│   └── ...
├── README.md
└── LICENSE
```

Source TypeScript files (`src/`) are **not** published to npm.

### Publishing Steps

```bash
# 1. Ensure you're logged in
npm login

# 2. Verify package contents
npm pack --dry-run

# 3. Publish to npm
npm publish

# For scoped packages (if applicable)
npm publish --access public
```

### Build Process

The `prepublishOnly` script ensures the package is built before publishing:

```bash
npm run build
# Runs: tsc
# Output: dist/ directory with compiled JS and .d.ts files
```

## JSR Publishing

### Configuration (`jsr.json`)

```json
{
  "name": "@yug/thread-mcp",
  "version": "1.1.0",
  "exports": {
    ".": "./src/server.ts",
    "./types": "./src/types.ts",
    "./tools": "./src/tools/index.ts",
    "./formatters": "./src/formatters/index.ts",
    "./storage": "./src/storage/index.ts"
  },
  "publish": {
    "include": ["src/**/*.ts", "README.md", "LICENSE"]
  }
}
```

#### Key Differences from npm

| Aspect | npm | JSR |
|--------|-----|-----|
| Package name | `thread-mcp` | `@yug/thread-mcp` (scoped) |
| Published files | Compiled JS | Source TypeScript |
| Entry points | Single main + types | Multiple named exports |
| Build required | Yes (`dist/`) | No (publishes source) |

### Export Mapping

JSR allows fine-grained imports:

```typescript
// Main server
import { createServer } from "@yug/thread-mcp";

// Just types
import type { Conversation, Message } from "@yug/thread-mcp/types";

// Just tools
import { saveThread, findThreads } from "@yug/thread-mcp/tools";

// Just formatters
import { markdownFormatter } from "@yug/thread-mcp/formatters";

// Just storage
import { LocalStorage, RemoteStorage } from "@yug/thread-mcp/storage";
```

### Publishing Steps

```bash
# 1. Install JSR CLI (if not installed)
npx jsr

# 2. Login to JSR
npx jsr login

# 3. Publish to JSR
npx jsr publish

# Or with specific options
npx jsr publish --allow-dirty
```

### What Gets Published

The JSR package includes:

```
@yug/thread-mcp/
├── src/
│   ├── server.ts
│   ├── config.ts
│   ├── types.ts
│   ├── tools/
│   ├── formatters/
│   └── storage/
├── README.md
└── LICENSE
```

Source TypeScript is published directly - no build step required!

## Version Management

### Semantic Versioning

We follow [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH
  │     │     └── Bug fixes, no API changes
  │     └──────── New features, backwards compatible
  └────────────── Breaking changes
```

### Version Files

Versions must be synchronized across:

1. `package.json` - npm version
2. `jsr.json` - JSR version

Both should always match.

### Updating Versions

```bash
# Patch release (1.1.0 → 1.1.1)
npm version patch

# Minor release (1.1.0 → 1.2.0)
npm version minor

# Major release (1.1.0 → 2.0.0)
npm version major
```

**Note**: `npm version` only updates `package.json`. You must manually update `jsr.json` to match.

## Release Workflow

### Step-by-Step Release Process

```bash
# 1. Ensure all tests pass
npm test

# 2. Ensure code is formatted and linted
npm run format
npm run lint
npm run typecheck

# 3. Update version in both files
# Edit package.json: "version": "X.Y.Z"
# Edit jsr.json: "version": "X.Y.Z"

# 4. Commit version bump
git add package.json jsr.json
git commit -m "Bump version to X.Y.Z"

# 5. Create git tag
git tag -a vX.Y.Z -m "Release vX.Y.Z - Brief description"

# 6. Push to remote
git push && git push origin vX.Y.Z

# 7. Publish to npm
npm publish

# 8. Publish to JSR
npx jsr publish
```

### Example Release

```bash
# Release v1.2.0 with new feature
npm test
npm run format && npm run lint && npm run typecheck

# Update versions
sed -i 's/"version": "1.1.0"/"version": "1.2.0"/' package.json
sed -i 's/"version": "1.1.0"/"version": "1.2.0"/' jsr.json

# Commit and tag
git add package.json jsr.json
git commit -m "Bump version to 1.2.0"
git tag -a v1.2.0 -m "Release v1.2.0 - Add new feature X"
git push && git push origin v1.2.0

# Publish
npm publish
npx jsr publish
```

## CI/CD Automation

Thread MCP uses GitHub Actions for automated publishing with two workflows:

### Workflow Overview

| Trigger | Action | Version | npm Tag |
|---------|--------|---------|---------|
| Push to `main` | Publish dev version | `X.Y.Z-dev.{sha}` | `dev` |
| Push tag `v*` | Publish release | `X.Y.Z` | `latest` |

### Dev Builds (Continuous)

Every push to `main` automatically publishes a dev version:

```bash
# Install dev version
npm install thread-mcp@dev

# Or specific dev version
npm install thread-mcp@1.1.0-dev.abc1234
```

Dev versions:
- Use format: `{base-version}-dev.{short-sha}` (e.g., `1.1.0-dev.2ae15c2`)
- Published with npm tag `dev` (doesn't affect `latest`)
- Published to JSR as prerelease versions
- Useful for testing unreleased changes

### Release Builds (Tagged)

When you push a version tag, the workflow publishes to production:

```bash
# Create and push a release
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

The workflow:
1. Verifies tag version matches `package.json` version
2. Runs full test suite
3. Publishes to npm with `latest` tag
4. Publishes to JSR

### GitHub Actions Configuration

The publish workflow (`.github/workflows/publish.yml`):

```yaml
name: Publish

on:
  push:
    branches: [main]
    tags:
      - "v*"

jobs:
  test:
    # Runs typecheck, lint, format check, and tests

  publish-dev:
    if: github.ref == 'refs/heads/main'
    needs: test
    # Generates dev version and publishes with --tag dev

  publish-release:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: test
    # Verifies version and publishes to latest
```

### Required Secrets

| Secret | Required For | How to Obtain |
|--------|--------------|---------------|
| `NPM_TOKEN` | npm publishing | npmjs.com → Account → Access Tokens → Generate (Automation type) |
| `JSR_TOKEN` | JSR publishing | jsr.io → Account Settings → Access Tokens → Create |

Add both secrets to your repository:
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `NPM_TOKEN` and `JSR_TOKEN`

### Pre-publish Checklist

Before any release:

- [ ] All tests pass (`npm test`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] No lint errors (`npm run lint`)
- [ ] Types check (`npm run typecheck`)
- [ ] Version updated in `package.json`
- [ ] Version updated in `jsr.json`
- [ ] CHANGELOG updated (if maintained)
- [ ] Git tag created and pushed

## Troubleshooting

### npm Issues

```bash
# Check what would be published
npm pack --dry-run

# View package contents after pack
tar -tzf thread-mcp-1.1.0.tgz

# Verify you're publishing to correct registry
npm config get registry
```

### JSR Issues

```bash
# Validate jsr.json
npx jsr check

# Dry run publish
npx jsr publish --dry-run

# See verbose output
npx jsr publish --verbose
```

### Version Conflicts

If you get "version already exists":

1. Check if version was already published
2. Bump to next version
3. Re-publish

```bash
npm view thread-mcp versions  # See all published versions
```
