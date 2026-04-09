# ABOUTME: Build, test, and development commands for the Quoth browser extension.
# ABOUTME: All commands should be run through these recipes, not directly via bun/npx.

# Default recipe: show available commands
default:
    @just --list

# Run all checks: tests, linting, typecheck, format check
check: test lint typecheck fmt-check

# Run unit tests (optionally pass a file pattern, e.g. just test message-handler)
test *ARGS:
    bunx vitest run {{ARGS}}

# Run unit tests in watch mode
test-watch *ARGS:
    bunx vitest {{ARGS}}

# Run E2E tests (Chromium-based, requires Chrome build)
test-e2e:
    just build chrome
    bunx playwright test

# Run linter (optionally pass specific files, e.g. just lint src/core/types.ts)
lint *ARGS:
    {{ if ARGS == "" { "bunx eslint src/ tests/" } else { "bunx eslint " + ARGS } }}

# Run formatter (optionally pass specific files, e.g. just fmt src/core/types.ts)
fmt *ARGS:
    {{ if ARGS == "" { 'bunx prettier --write "src/**/*.{ts,svelte,html,css}" "tests/**/*.ts"' } else { "bunx prettier --write " + ARGS } }}

# Check formatting without modifying files
fmt-check *ARGS:
    {{ if ARGS == "" { 'bunx prettier --check "src/**/*.{ts,svelte,html,css}" "tests/**/*.ts"' } else { "bunx prettier --check " + ARGS } }}

# Run TypeScript type checking (optionally pass tsc flags, e.g. just typecheck --listFiles)
typecheck *ARGS:
    bunx wxt prepare && bunx tsc --noEmit {{ARGS}}

# Build the extension (default: firefox, or specify: just build chrome)
build BROWSER="firefox":
    bunx wxt build --browser {{BROWSER}}

# Start dev mode with HMR (default: firefox, optionally open a URL: just dev firefox 'https://youtube.com/watch?v=...')
# Note: URL with ? or & must be quoted in the shell
dev BROWSER="firefox" URL="":
    QUOTH_START_URL={{URL}} bunx wxt --browser {{BROWSER}}

# Start dev mode for popout tab (right-click extension icon -> "Open in new tab")
dev-popout BROWSER="firefox" URL="":
    QUOTH_START_URL={{URL}} bunx wxt --browser {{BROWSER}}

# Clean build artifacts and caches (also clears dev browser profiles)
clean:
    rm -rf .output .wxt node_modules/.vite

# Clean just the dev browser profiles (keeps build output; clears cookies, consent, cached state)
clean-profiles:
    rm -rf .wxt/profiles

# Install git pre-commit hook
install-hooks:
    @echo '#!/bin/sh' > .git/hooks/pre-commit
    @echo 'just check' >> .git/hooks/pre-commit
    @chmod +x .git/hooks/pre-commit
    @echo "Pre-commit hook installed."

# Smoke test: load extension and verify transcript flow (default: chrome, or: just smoke-test firefox)
smoke-test BROWSER="chrome" *URL:
    just build {{ if BROWSER == "chrome" { "chrome" } else { "" } }}
    bun run tools/smoke-test-{{BROWSER}}.ts {{URL}}

# Debug Firefox extension: load built extension, navigate to YouTube, log all console output
debug-firefox *URL:
    just build
    bun run tools/debug-firefox.ts {{URL}}

# Download a YouTube transcript (URL or video ID, saves to .llm/ by default)
transcript *ARGS:
    bun run tools/transcript.ts {{ARGS}}

# Explore punctuation models interactively on YouTube transcripts
punct-explore *ARGS:
    ./tools/punct-explore.py {{ARGS}}

# Run model comparison harness against transcript fixtures
model-bench *ARGS:
    bun run tools/model-bench/bench.ts {{ARGS}}

# Capture YouTube page fixture for testing
fixture-capture URL *NAME:
    bun run tools/fixture-capture.ts "{{URL}}" {{NAME}}

# Build, sign, and install the Firefox extension (requires WEB_EXT_API_KEY and WEB_EXT_API_SECRET)
install-firefox:
    just build firefox
    bunx web-ext sign --source-dir .output/firefox-mv2 --artifacts-dir .output --channel unlisted
    @echo "Opening signed .xpi in Firefox..."
    @open .output/*.xpi

# Zip both browsers for release
zip:
    bunx wxt zip
    bunx wxt zip -b firefox

# Push AMO credentials from local env to GitHub repository secrets
setup-github-secrets:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
        echo "Error: WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set in your environment"
        exit 1
    fi
    gh secret set WEB_EXT_API_KEY --body "$WEB_EXT_API_KEY"
    gh secret set WEB_EXT_API_SECRET --body "$WEB_EXT_API_SECRET"
    echo "GitHub secrets set successfully."

# Tag a release: bumps package.json version, commits, tags, and pushes
release VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    # Update version in package.json
    bun -e "const pkg = require('./package.json'); pkg.version = '{{VERSION}}'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')"
    git add package.json
    git commit -m "Release v{{VERSION}}"
    git tag "v{{VERSION}}"
    git push && git push --tags
