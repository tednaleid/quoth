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

# Open the fade-horizon palette mockup page in the default browser
mockup:
    open tools/horizon-mockup.html

# Re-extract the feather glyph (U+1FAB6) from Noto Sans Symbols 2 into assets/icon.svg
extract-icon:
    tools/extract-glyph.py --out assets/icon.svg

# Rasterize assets/icon.svg into the five public/icon/*.png sizes via ImageMagick
icons:
    @for size in 16 32 48 96 128; do \
        magick -background none -density 500 assets/icon.svg -resize ${size}x${size} public/icon/${size}.png; \
    done
    @ls -la public/icon/

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

# Download the signed .xpi from the latest GitHub release and open it in Firefox to install
install-release:
    #!/usr/bin/env bash
    set -euo pipefail
    tag=$(gh release list --limit 1 --json tagName --jq '.[0].tagName')
    echo "Installing $tag..."
    dir=$(mktemp -d)
    gh release download "$tag" --pattern '*.xpi' --dir "$dir"
    xpi=$(ls "$dir"/*.xpi)
    echo "Opening $xpi in Firefox..."
    open -a Firefox "$xpi"

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

# Bump version, commit, tag with release notes, and push.
# Usage: just bump 0.1.0 (or just bump for patch increment)
bump version="":
    #!/usr/bin/env bash
    set -euo pipefail
    current=$(jq -r .version package.json)
    if [ -z "{{version}}" ]; then
        IFS='.' read -r major minor patch <<< "$current"
        new="$major.$minor.$((patch + 1))"
    else
        new="{{version}}"
    fi
    echo "Bumping $current -> $new"
    if [ "$current" != "$new" ]; then
        jq --arg v "$new" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
        git add package.json
        git commit -m "Bump version to $new"
    fi
    # Generate release notes from commits since last tag
    prev_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    if [ -n "$prev_tag" ]; then
        log=$(git log "$prev_tag"..HEAD --oneline --no-merges)
    else
        log=$(git log --oneline --no-merges)
    fi
    notes_file=$(mktemp)
    trap 'rm -f "$notes_file"' EXIT
    if command -v claude >/dev/null 2>&1; then
        claude -p "Generate concise release notes for version $new. Commits:\n$log\n\nGuidelines: group related commits, focus on user-facing changes, skip version bumps and CI changes, one line per bullet, past tense, output only a bullet list." > "$notes_file" 2>/dev/null || echo "$log" | sed 's/^[0-9a-f]* /- /' > "$notes_file"
    else
        echo "$log" | sed 's/^[0-9a-f]* /- /' > "$notes_file"
    fi
    echo "Release notes:"
    cat "$notes_file"
    git tag -a "v$new" -F "$notes_file"
    rm -f "$notes_file"
    git push && git push --tags
    echo "v$new released!"

# Delete a GitHub release and re-tag to re-trigger release workflow.
# Preserves the annotated tag message (release notes).
# Usage: just retag 0.1.0
retag version:
    #!/usr/bin/env bash
    set -euo pipefail
    tag="v{{version}}"
    # Save existing tag annotation before deleting
    notes=$(git tag -l --format='%(contents)' "$tag" 2>/dev/null || echo "$tag")
    notes_file=$(mktemp)
    trap 'rm -f "$notes_file"' EXIT
    echo "$notes" > "$notes_file"
    gh release delete "$tag" --yes || true
    git push origin ":refs/tags/$tag" || true
    git tag -d "$tag" || true
    git tag -a "$tag" -F "$notes_file"
    git push && git push --tags
