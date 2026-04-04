# Building a client-side YouTube transcript formatter extension

**WXT + Svelte 5 + Transformers.js v4 form the optimal stack for a Firefox-first browser extension that formats YouTube transcripts using in-browser ML models.** This combination delivers the smallest bundles, best developer experience, and broadest cross-browser compatibility. The entire transcript formatting pipeline — punctuation restoration, paragraph segmentation, and heading generation — can run client-side using ~70MB of cached models for core features, scaling to ~420MB with LLM-powered section headings. YouTube's undocumented Innertube API provides reliable access to caption data with word-level timing, no API key required.

---

## Extension framework: WXT is the clear winner

**WXT (Web Extension Toolkit)** at https://wxt.dev/ is the leading cross-browser extension framework in 2025-2026. Built on Vite, it is framework-agnostic and supports MV2 and MV3 from a single codebase. Its file-based entrypoint system auto-generates `manifest.json`, and it produces bundles **43% smaller** than Plasmo (~400KB vs ~800KB typical output). WXT provides first-class Firefox support including MV2 output, dev mode with HMR, and automated publishing workflows. Version 0.20.20 is current as of early 2026.

The alternatives are worth understanding but less suitable. **Plasmo** (https://docs.plasmo.com/) is React-first and uses the Parcel bundler, which is 2-3x slower than Vite. Community reports indicate the main author is no longer actively developing it. **CRXJS** (https://crxjs.dev/vite-plugin) is a Vite plugin rather than a full framework — excellent content script HMR but no built-in storage, messaging, or i18n wrappers. **Bedframe** (https://bedframe.dev/) ships with testing, linting, and CI/CD out of the box and supports 7 browsers, but has a smaller community.

For the UI layer, **Svelte 5** is ideal for extensions. At **~1.85KB gzipped** runtime, it produces the smallest practical bundles through compile-time optimization. Built-in scoped styles prevent content script style leakage — critical when injecting UI into YouTube pages. **Solid.js** (~3.9KB) wins on raw runtime performance with fine-grained signals and no virtual DOM. **Preact** (~4KB) makes sense only if React ecosystem compatibility is essential. React itself at 40KB+ is too heavy for extension development.

For build tooling, WXT abstracts Vite configuration entirely. Vite uses esbuild for development (10-100x faster than webpack) and Rollup for production builds with excellent tree-shaking. No separate build tool configuration is needed.

### Manifest V3 versus V2 across browsers

The WebExtensions API is a cross-browser standard maintained through the W3C WebExtensions Community Group. Firefox uses the `browser.*` namespace with native promise support; Chrome uses `chrome.*` with callback-based APIs and expanding promise support.

**Manifest V3** replaces persistent background scripts with service workers, replaces blocking `webRequest` with `declarativeNetRequest`, enforces stricter content security policies, and prohibits remote code execution. The critical divergences across browsers:

- **Firefox still supports MV2** with no deprecation timeline. Mozilla has explicitly committed to at least 12 months notice before any changes. Firefox MV3 supports **event pages** (DOM-based background scripts), not just service workers. Firefox retains **blocking webRequest** in MV3.
- **Chrome deprecated MV2 mid-2025** and requires MV3 for new submissions. Service workers are mandatory and auto-suspend after ~30 seconds of inactivity.
- **Safari requires MV3** and uses non-persistent background pages. It lacks both `sidebar_action` and blocking `webRequest`.

A Firefox-first strategy is advantageous because Firefox offers the richest extension API, the `browser.*` promise-based namespace is the standard that Chrome is converging toward, and WXT handles the cross-browser manifest generation automatically.

### Sidebar implementation varies by browser

**Firefox** provides a native `sidebar_action` API — a panel on the left side of the browser window, declared in the manifest with `"sidebar_action": { "default_panel": "sidebar.html" }`. The `browser.sidebarAction` API controls open/close/toggle behavior. Each window gets its own instance.

**Chrome 114+** introduced the **Side Panel API** (`chrome.sidePanel`), requiring the `"sidePanel"` permission. The manifest uses `"side_panel": { "default_path": "sidebar.html" }`. Side panels persist across tab navigation and can be site-specific. Chrome 140 (2025) added layout detection for left/right positioning. The APIs are **completely incompatible** with Firefox's `sidebar_action`.

**Safari has no native sidebar API.** The cross-browser fallback is **content script UI injection** — injecting custom HTML/CSS/JS into the page using Shadow DOM for style isolation. WXT provides `createContentScriptUi()` helpers for this. For YouTube specifically, injecting a panel below or beside the video player is a viable approach that works on all browsers.

The recommended strategy: use Firefox's native `sidebar_action` for Firefox, Chrome's `sidePanel` for Chrome, and content script injection with Shadow DOM as the universal fallback and for Safari.

---

## YouTube serves captions through a proprietary timedtext system

YouTube uses a **proprietary timedtext system** served through its undocumented `/api/timedtext` endpoint. The internal format is **SRV3**, based on TTML (Timed Text Markup Language) with YouTube-specific extensions. The system supports multiple output formats via a `fmt` parameter: `srv1`, `srv2`, `srv3` (native), `json3` (structured JSON), `vtt` (WebVTT), and `ttml`.

**JSON3 is the most useful format** for extension development. It returns an `events` array where each event contains `tStartMs` (start time in milliseconds), `dDurationMs` (duration), and a `segs` array with individual word segments. Auto-generated captions include **word-level timing** via `tOffsetMs` offsets within each segment, plus ASR confidence scores (`acAsrConf`, 0-255). Manually uploaded captions provide only segment-level timing without word-level breakdown.

```json
{
  "events": [{
    "tStartMs": 1040,
    "dDurationMs": 3360,
    "segs": [
      {"utf8": "welcome"},
      {"tOffsetMs": 320, "utf8": " to"},
      {"tOffsetMs": 560, "utf8": " super"},
      {"tOffsetMs": 799, "utf8": " mario"}
    ]
  }]
}
```

### Caption extraction: Innertube parsing is the industry standard

Four methods exist for accessing YouTube captions from a browser extension, but only one is practical for a general-purpose tool.

**Method 1 — Innertube/ytInitialPlayerResponse parsing** is the industry standard. Parse `ytInitialPlayerResponse` from the page HTML or POST to the Innertube player API (`/youtubei/v1/player`), extract caption track URLs from `.captions.playerCaptionsTracklistRenderer.captionTracks`, then fetch with `&fmt=json3`. This requires no API key, works for any public video, and returns the richest data format. This is how Glasp, Tactiq, and most successful transcript extensions work. A content script has same-origin access to YouTube, making the fetch straightforward.

**Method 2 — Network interception** via `webRequest` API can capture timedtext requests but is limited in MV3 (Chrome removed blocking webRequest, and reading response bodies is restricted). Useful as a fallback.

**Method 3 — YouTube Data API v3** requires OAuth 2.0 (not just an API key) for caption downloads, can **only download captions for videos you own**, cannot access auto-generated captions, and costs 50 quota units per `captions.list` call against a 10,000 units/day limit. **Not suitable for a general-purpose extension.**

**Method 4 — DOM scraping** of YouTube's transcript UI is fragile and slow, requiring UI interaction.

An important reliability note: YouTube made changes around June 2025 that broke some older caption-fetching approaches. The current reliable method uses the Innertube API to get fresh `baseUrl` values for caption tracks. Libraries like `youtube-caption-extractor` have adapted with dual extraction methods and fallback strategies.

### Key libraries for caption handling

For caption extraction, **youtube-transcript** (npm, v1.3.0, 89 dependents) and **youtube-caption-extractor** (npm, v1.9.1) both implement the Innertube approach. However, since the extraction pattern is only ~20 lines of code, implementing it directly in the content script avoids unnecessary dependencies.

For text alignment — mapping punctuated/reformatted text back to original timestamps — **jsdiff** (npm `diff` package, v8.0.4, **8,475 dependents**) is the clear choice. Its `diffWords()` method implements the Myers diff algorithm and produces `{value, added, removed}` change objects. The alignment strategy: concatenate original timed segments preserving word boundaries, run `diffWords` against the reformatted text, walk the diff results tracking position in the original, and inherit timestamps from matched words for any inserted punctuation or paragraph breaks.

For caption format parsing (WebVTT, SRT), **subtitle.js** (npm `subtitle`, v4.2.2) provides stream-based parsing and format conversion. For YouTube's JSON3 format specifically, the `events` array can be parsed directly without a library.

The W3C WebVTT specification lives at https://www.w3.org/TR/webvtt1/. The HTML5 TextTrack API (documented at MDN: https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API) provides programmatic caption control through `video.textTracks` and the `cuechange` event.

---

## In-browser ML inference has crossed the production threshold

The convergence of **WebGPU reaching all major browsers** (November 2025), mature ONNX Runtime Web, and **Transformers.js v4** (released February 9, 2026) means real ML workloads now run entirely client-side with production-viable performance.

### Transformers.js v4 is the recommended framework

**Transformers.js v4** (`@huggingface/transformers` on npm) is the JavaScript equivalent of Python's `transformers` library, running pretrained models via ONNX Runtime. The v4 release features a complete C++ rewrite of the WebGPU runtime (collaboration with Microsoft's ONNX Runtime team), delivering **4x speedup for BERT models**, support for models up to **20 billion parameters**, **500+ supported models**, and **53% smaller bundle sizes**. It supports WASM (CPU, broad compatibility), WebGPU (GPU-accelerated), and WebGL (fallback) backends.

Key pipelines for this project: `token-classification` (punctuation restoration), `feature-extraction` (sentence embeddings for paragraph segmentation), `summarization` and `text-generation` (heading generation). Models are cached via the browser's **Cache API** by default — subsequent loads are near-instant. Running inference in Web Workers is officially recommended with extensive examples. Documentation: https://huggingface.co/docs/transformers.js/en/index. Browser extension guide: https://huggingface.co/docs/transformers.js/en/tutorials/browser-extension.

**WebLLM** (https://webllm.mlc.ai/) by MLC is the alternative for running generative LLMs specifically. It uses Apache TVM to compile models into optimized WebGPU kernels, retaining **~80% of native GPU performance**. It provides an OpenAI-compatible API and supports Web Workers, service workers, and Chrome extension contexts. Best for: running SmolLM2 or Qwen models for heading generation if Transformers.js text-generation proves insufficient.

**ONNX Runtime Web** (https://onnxruntime.ai/) is the underlying engine that Transformers.js uses. Direct usage provides more control but requires more setup. WebGPU gives **3.8x-19x speedup** over WASM depending on model type.

### The punctuation model pipeline

Three processing stages form the transcript formatting pipeline, with specific model recommendations for each:

**Stage 1 — Punctuation, true-casing, and sentence boundary detection.** The **`1-800-BAD-CODE/punctuation_fullstop_truecase_english`** model handles all three tasks in a single pass. It is a 6-layer Transformer with 512 dimensions and SentencePiece 32k vocabulary, available as a **~45MB native ONNX** file (no conversion needed). Quality benchmarks show **F1 ~97% for punctuation, ~99.5% for true-casing, and ~96% for sentence boundary detection**. An int8 quantized version is even smaller. An alternative ultra-lightweight option is the **sherpa-onnx Edge-Punct-Casing** model at just **7.1MB int8**, with 30ms inference per sentence. The HuggingFace page: https://huggingface.co/1-800-BAD-CODE/punctuation_fullstop_truecase_english.

**Stage 2 — Paragraph segmentation** requires no dedicated model. The recommended approach combines **timestamp gap analysis** (pauses >2 seconds in YouTube transcript data indicate topic shifts) with **embedding-based similarity detection** using `all-MiniLM-L6-v2` (~23MB quantized via Transformers.js `feature-extraction` pipeline). Compute cosine similarity between consecutive sentences and detect drops as paragraph boundaries — the TextTiling algorithm. This is well-documented at https://www.assemblyai.com/blog/text-segmentation-approaches-datasets-and-evaluation-metrics.

**Stage 3 — Section heading generation** is the heaviest task. Options ranked by size/quality tradeoff:

- **Xenova/t5-small** (~120MB q8) via Transformers.js `summarization` pipeline — fast on WASM, lower quality
- **Qwen2.5-0.5B-Instruct** (~350MB q4) via Transformers.js `text-generation` — good quality, works with WebGPU
- **SmolLM2-1.7B-Instruct** (~925MB q4f16) via WebLLM — best quality, requires WebGPU, 10-20 tok/s

| Task | Recommended model | Size | Quality | Speed (WASM) |
|------|-------------------|------|---------|--------------|
| Punctuation + casing + SBD | 1-800-BAD-CODE/pcs_en | ~45MB | F1 ~97% | ~100ms/sentence |
| Sentence embeddings | all-MiniLM-L6-v2 | ~23MB q8 | Excellent | ~50ms/sentence |
| Heading generation | Qwen2.5-0.5B q4 | ~350MB | Good | ~5-15 tok/s |

### WebGPU, WASM, and model caching

**WebGPU browser support as of April 2026**: Chrome/Edge 113+ (stable on Windows, macOS, ChromeOS, Android 121+), Safari 26.0+ (stable on macOS Tahoe, iOS 26, iPadOS 26), and Firefox 141+ (stable on Windows, 145+ on macOS ARM64, Linux in progress). Approximately **70% desktop coverage**.

The strategy: detect WebGPU availability and use it when present; fall back to WASM for universal compatibility. WASM is adequate for small encoder models like punctuation restoration (~100ms/sentence). WebGPU is essential for LLM generation tasks.

For **model caching**, Chrome's official guidance recommends the **Cache API** as the primary storage mechanism — it handles HTTP responses natively, works from main thread and workers, requires no serialization overhead, and is what Transformers.js uses by default. Storage quotas are generous: Chrome allows up to ~2GB+ per origin, Firefox ~50% of free disk, Safari ~1GB per origin. With the `"unlimitedStorage"` permission, extensions can use `chrome.storage.local` without limits.

**Web Workers are essential** for production use — running models on the main thread freezes the UI. Transformers.js provides official Web Worker patterns. SharedArrayBuffer (needed for WASM multi-threading) requires Cross-Origin headers, but browser extensions can bypass this restriction. For Chrome MV3, service workers cannot access WebGPU, so **offscreen documents** (`chrome.offscreen.createDocument()`) are required for GPU-accelerated inference. A working example: https://github.com/tantara/transformers.js-chrome.

**Firefox is developing an experimental ML API** (`browser.trial.ml`) that ships an internal inference runtime using Transformers.js + ONNX, with model files stored in IndexedDB and **shared across origins**. Currently Nightly-only, this could eliminate per-extension model downloads in the future. Details: https://blog.mozilla.org/en/firefox/firefox-ai/running-inference-in-web-extensions/.

---

## Extension architecture follows a hub-and-spoke pattern

The idiomatic browser extension architecture consists of isolated contexts communicating exclusively through message passing. The **background script** (service worker in MV3) serves as the central event handler and router. **Content scripts** run in an isolated world within web pages with DOM access but no access to page JavaScript globals. **Sidebar/side panel** pages and **popup** pages run in the extension context.

For this project, the recommended architecture:

1. **Content script** (runs on YouTube pages): Extracts caption data via Innertube parsing, observes video playback state for auto-scroll, injects UI if using content script UI approach, handles click-to-jump-to-timestamp interactions
2. **Background script/service worker**: Routes messages between content script and sidebar, manages extension lifecycle, handles install/update events
3. **Sidebar/side panel** (or content script UI): Displays formatted transcript, handles search, manages markdown export
4. **ML inference worker**: Dedicated Web Worker for running Transformers.js models. On Chrome, hosted inside an offscreen document for WebGPU access. On Firefox, spawned directly from the extension page or content script

### Message passing patterns

**One-time messages** use `chrome.runtime.sendMessage` (content → background/sidebar) and `chrome.tabs.sendMessage` (background/sidebar → content script). For async responses, the listener must `return true` to keep the message channel open.

**Long-lived connections** via `chrome.runtime.connect` create persistent port channels — ideal for streaming formatted transcript chunks back from the ML worker as they're processed.

**Storage as event bus**: Writing to `chrome.storage.local` and listening on `chrome.storage.onChanged` provides cross-context reactive updates. WXT's built-in storage wrapper (`wxt/utils/storage`) adds type-safe reactive bindings with `storage.defineItem()` and `.watch()`.

For ML inference specifically, the best pattern varies by browser. On Chrome, use an **offscreen document** hosting a Web Worker with Transformers.js — this provides a persistent context with full WebGPU access, isolated from the service worker's 30-second suspension lifecycle. On Firefox, a Web Worker spawned from the sidebar or a hidden extension page works well since Firefox's event pages have DOM access and don't aggressively suspend. On Safari, use a hidden extension page approach.

---

## Cross-platform strategy: Firefox first, then Chrome, then Safari

### Firefox for Android is the only viable mobile extension path

Firefox for Android has supported an **open extension ecosystem** since December 2023. Any extension listed on AMO and marked as Android-compatible can be installed. Development uses `web-ext run -t firefox-android` with adb remote debugging. Mozilla recommends MV2 for Android extensions due to known MV3 parity gaps. Not all desktop APIs are available (e.g., bookmarks API). Documentation: https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/.

**Chrome on Android does not support extensions** — no official timeline or plans exist as of 2026. Third-party Chromium browsers like Kiwi Browser offer limited extension support but are not first-party.

**Safari on iOS/iPadOS** has supported Web Extensions since iOS 15 (2021). Extensions are distributed through the App Store and can be shared across Mac/iPhone/iPad via iCloud sync (iOS 16+). Limitations include no `windows.create` on iOS, non-persistent background pages required, and users must manually enable extensions in Settings → Safari → Extensions (more friction than desktop).

### Safari development no longer requires Xcode

As of September 2025, Apple allows uploading a ZIP file of the extension directly to App Store Connect via the Safari web extension packager, which auto-converts and packages it for TestFlight testing and App Store distribution. This eliminates the Xcode requirement for packaging. The Apple Developer Program ($99/year) is still required. The traditional path using `xcrun safari-web-extension-converter` to create an Xcode project remains available for developers who want native messaging between the extension and a Swift host app. Documentation: https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect.

Safari supports WebExtensions APIs but with gaps: no `sidebar_action`, limited `webRequest`, and some `tabs` API methods missing. The content script UI injection approach works as the universal fallback.

---

## Testing pyramid: unit tests, then E2E, then manual verification

The testing strategy follows a pyramid structure with maximum coverage at the unit level.

**Unit testing** uses **Vitest with WXT's first-class integration**. The `WxtVitest()` plugin auto-mocks browser APIs using `@webext-core/fake-browser`, which provides an in-memory implementation of browser storage, messaging, and other APIs rather than simple mocks. Pure logic functions (transcript parsing, formatting, message routing) are tested with zero browser API dependencies. Content script DOM testing uses the `jsdom` environment with fixture HTML mimicking YouTube's DOM structure.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
export default defineConfig({ plugins: [WxtVitest()] });
```

**E2E testing** uses **Playwright for Chromium** extensions. Playwright supports loading unpacked extensions via `chromium.launchPersistentContext()` with `--load-extension` args, including headless mode. It cannot load Firefox extensions natively. Documentation: https://playwright.dev/docs/chrome-extensions.

**Firefox development testing** uses **Mozilla's web-ext tool** (https://github.com/mozilla/web-ext, v8.x). `web-ext run` launches Firefox with the extension temporarily loaded and auto-reloads on file changes. `web-ext lint` validates the manifest and source. `web-ext build` packages for submission. `web-ext sign` signs and optionally publishes to AMO via API v5.

**AI-assisted testing** via the **Playwright MCP server** allows Claude to interact with a running extension through browser automation. Setup: `claude mcp add playwright npx @playwright/mcp@latest`. The MCP server supports Chromium, Firefox, and WebKit using accessibility snapshots. For extension testing specifically, the MCP Bridge Chrome extension connects to an existing browser with the extension loaded. Documentation: https://playwright.dev/docs/getting-started-mcp.

---

## Build, distribution, and publishing

**Justfiles** (https://just.systems/man/en/) provide cross-platform command running for local development. A justfile for this project would include recipes for `dev-firefox` (web-ext run), `dev-chrome` (load unpacked), `build-firefox`/`build-chrome` (WXT build per target), `test` (vitest run), `lint` (web-ext lint), and `package` (create distributable archives).

**GitHub Actions automate release publishing.** Key actions: `kewisch/action-web-ext@v1` for Firefox signing, `mnao305/chrome-extension-upload@v6` for Chrome Web Store, and `PlasmoHQ/bpp@v3` for multi-browser publishing. Trigger on release creation to build, sign, and upload to all stores. Attach `.xpi` (Firefox), `.zip` (Chrome), and source archives to the GitHub release.

### Store comparison at a glance

| Store | Fee | Review time | Key requirement |
|-------|-----|-------------|-----------------|
| Firefox AMO | Free | Hours to days | Source code required if bundled |
| Chrome Web Store | $5 one-time | 1-3 business days | MV3 mandatory, privacy policy |
| Safari App Store | $99/year | 1-7 days | Apple Developer Program membership |

Firefox AMO developer hub: https://addons.mozilla.org/developers/. Chrome Web Store dashboard: https://chrome.google.com/webstore/devconsole. Safari extensions portal: https://developer.apple.com/safari/extensions/.

---

## Recommended phased implementation

**Phase 1 (MVP, ~70MB total models)**: Punctuation restoration via `1-800-BAD-CODE/punctuation_fullstop_truecase_english` running in a Web Worker with WASM backend. Rule-based paragraph breaks using timestamp gaps and sentence count heuristics. Auto-scrolling transcript display in Firefox sidebar. Click-to-jump-to-timestamp. Works on all browsers, 3-8 second processing time for a full transcript.

**Phase 2 (Enhanced, ~95MB)**: Add embedding-based paragraph segmentation using `all-MiniLM-L6-v2`. Add WebGPU acceleration for users with compatible hardware. Chrome side panel support. Search within transcript. Markdown export.

**Phase 3 (Full features, ~420MB)**: LLM-based section heading generation via `Qwen2.5-0.5B-Instruct` (q4 quantized) or `SmolLM2-360M` via WebLLM. Offered as optional "enhanced formatting" requiring separate model download. WebGPU strongly recommended for acceptable heading generation speed. Safari support via content script UI and App Store Connect packaging.

### Feasibility is high but memory-constrained

Minimum hardware for Phases 1-2: any modern device with 4GB RAM. WASM backend works everywhere. Phase 3 with LLM headings: 8GB RAM recommended with a WebGPU-capable GPU. First-time model download is 10-30 seconds on broadband for core models, cached for all subsequent uses. Processing a full transcript takes 3-8 seconds for punctuation and paragraph segmentation, extending to 10-60 seconds with heading generation.

Browser extension-specific constraints: Chrome MV3 service workers suspend after ~30 seconds (use offscreen documents for inference), all WASM/ONNX files must be bundled locally or loaded from extension storage (no remote code execution in MV3), and `wasm-unsafe-eval` may need to be added to the content security policy. The `"unlimitedStorage"` permission enables large model caching.

### Key documentation links

- **WXT Framework**: https://wxt.dev/
- **Mozilla WebExtensions**: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- **Chrome Extensions MV3**: https://developer.chrome.com/docs/extensions
- **Safari Web Extensions**: https://developer.apple.com/documentation/safariservices/safari-web-extensions
- **Chrome Side Panel API**: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- **Firefox sidebar_action API**: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction
- **Transformers.js v4**: https://huggingface.co/docs/transformers.js/en/index
- **WebLLM**: https://webllm.mlc.ai/docs/
- **ONNX Runtime Web**: https://onnxruntime.ai/docs/tutorials/web/
- **W3C WebVTT Spec**: https://www.w3.org/TR/webvtt1/
- **YouTube Data API Captions**: https://developers.google.com/youtube/v3/docs/captions
- **Playwright Extension Testing**: https://playwright.dev/docs/chrome-extensions
- **web-ext Tool**: https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
- **Firefox Extension Workshop**: https://extensionworkshop.com/
- **just Command Runner**: https://just.systems/man/en/
- **1-800-BAD-CODE Punctuation Model**: https://huggingface.co/1-800-BAD-CODE/punctuation_fullstop_truecase_english
- **Firefox ML API for Extensions**: https://blog.mozilla.org/en/firefox/firefox-ai/running-inference-in-web-extensions/
- **Safari App Store Connect Packaging**: https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect