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

# Run E2E tests (requires built extension)
test-e2e: build
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

# Run TypeScript type checking
typecheck:
    bunx wxt prepare && bunx tsc --noEmit

# Build the extension for Chrome
build:
    bunx wxt build

# Build the extension for Firefox (future)
build-firefox:
    bunx wxt build --browser firefox

# Start dev mode with HMR
dev:
    bunx wxt

# Clean build artifacts and caches
clean:
    rm -rf .output .wxt node_modules/.vite

# Install git pre-commit hook
install-hooks:
    @echo '#!/bin/sh' > .git/hooks/pre-commit
    @echo 'just check' >> .git/hooks/pre-commit
    @chmod +x .git/hooks/pre-commit
    @echo "Pre-commit hook installed."

# Smoke test: load extension and navigate to YouTube
smoke-test *URL:
    bun run tools/smoke-test.ts {{URL}}

# Run model comparison harness (Phase 4+)
model-bench *ARGS:
    @echo "Model bench not yet implemented (Phase 4)"

# Capture YouTube page fixture for testing
fixture-capture URL *NAME:
    bun run tools/fixture-capture.ts "{{URL}}" {{NAME}}

# Bump version, generate release notes, tag, and push (Phase 6+)
bump VERSION:
    @echo "Bump not yet implemented (Phase 6)"

# Re-trigger release workflow for existing version (Phase 6+)
retag VERSION:
    @echo "Retag not yet implemented (Phase 6)"
