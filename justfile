# ABOUTME: Build, test, and development commands for the Quoth browser extension.
# ABOUTME: All commands should be run through these recipes, not directly via bun/npx.

# Default recipe: show available commands
default:
    @just --list

# Run all checks: tests, linting, typecheck, format check
check: deps test lint typecheck fmt-check

# Ensure bun and node_modules are present; install deps if missing.
deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v bun >/dev/null 2>&1; then
        echo "Error: bun is not installed. Install via: curl -fsSL https://bun.sh/install | bash" >&2
        exit 1
    fi
    if [ ! -d node_modules ] || [ bun.lock -nt node_modules ]; then
        echo "Installing dependencies..."
        bun install --frozen-lockfile
    fi

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

# Start dev mode with HMR. Defaults: firefox, no URL, 1280x800 window.
# URL with ? or & must be quoted in the shell.
# Chrome honors window size at launch; Firefox is resized post-launch via osascript
# (needs Accessibility permission; resize manually if it doesn't take).
dev BROWSER="firefox" URL="" WIDTH="1280" HEIGHT="800":
    #!/usr/bin/env bash
    set -euo pipefail
    width="{{WIDTH}}"
    height="{{HEIGHT}}"
    if [ "{{BROWSER}}" = "firefox" ]; then
        QUOTH_START_URL="{{URL}}" bunx wxt --browser firefox &
        wxt_pid=$!
        (
            sleep 8
            osascript \
                -e 'tell application "Firefox" to activate' \
                -e "tell application \"System Events\" to tell process \"Firefox\" to set position of front window to {0, 0}" \
                -e "tell application \"System Events\" to tell process \"Firefox\" to set size of front window to {$width, $height}" \
                2>/dev/null \
              || echo "(Firefox resize via osascript needs Accessibility permission; resize manually if needed.)"
        ) &
        wait $wxt_pid
    else
        QUOTH_START_URL="{{URL}}" QUOTH_WINDOW_WIDTH="$width" QUOTH_WINDOW_HEIGHT="$height" bunx wxt --browser {{BROWSER}}
    fi

# Start dev mode for popout tab (right-click extension icon -> "Open in new tab")
dev-popout BROWSER="firefox" URL="" WIDTH="1280" HEIGHT="800":
    just dev {{BROWSER}} {{URL}} {{WIDTH}} {{HEIGHT}}

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

# Resize assets/icon.png (the 128x128 source) into the five public/icon/*.png sizes.
# 128 is copied verbatim; smaller sizes use Lanczos downscaling.
icons:
    @cp assets/icon.png public/icon/128.png
    @for size in 16 32 48 96; do \
        magick assets/icon.png -filter Lanczos -resize ${size}x${size} public/icon/${size}.png; \
    done
    @magick identify public/icon/*.png

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

# Run the OAuth loopback flow to obtain a Chrome Web Store refresh token.
# Requires CHROME_CLIENT_ID and CHROME_CLIENT_SECRET (from Google Cloud Console OAuth Desktop client).
chrome-store-refresh-token:
    bun run tools/get-cws-refresh-token.ts

# Push Chrome Web Store API credentials from env to GitHub repository secrets.
# Requires CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN.
setup-chrome-secrets:
    #!/usr/bin/env bash
    set -euo pipefail
    for var in CHROME_EXTENSION_ID CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN; do
        if [ -z "${!var:-}" ]; then
            echo "Error: $var must be set in your environment"
            exit 1
        fi
    done
    gh secret set CHROME_EXTENSION_ID --body "$CHROME_EXTENSION_ID"
    gh secret set CHROME_CLIENT_ID --body "$CHROME_CLIENT_ID"
    gh secret set CHROME_CLIENT_SECRET --body "$CHROME_CLIENT_SECRET"
    gh secret set CHROME_REFRESH_TOKEN --body "$CHROME_REFRESH_TOKEN"
    echo "Chrome Web Store secrets set successfully."

# Build Chrome extension and capture store-quality screenshots into assets/store/screenshots/.
# Optional URL arg overrides the default transcript-rich video.
screenshots *URL:
    just build chrome
    bun run tools/screenshot-chrome.ts {{URL}}

# Resize every PNG in assets/store/screenshots/ to exactly 1280x800 (Chrome Web Store strict).
# Use after taking manual screenshots on a HiDPI display (capture comes out 2560x1600).
normalize-screenshots:
    #!/usr/bin/env bash
    set -euo pipefail
    cd assets/store/screenshots
    shopt -s nullglob
    files=(*.png)
    if [ ${#files[@]} -eq 0 ]; then
        echo "No PNGs in assets/store/screenshots/"
        exit 0
    fi
    for f in "${files[@]}"; do
        echo "Normalizing $f..."
        magick "$f" -resize 1280x800^ -gravity center -extent 1280x800 "$f"
    done
    magick identify "${files[@]}"

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
