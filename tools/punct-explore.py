#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["transformers", "torch", "rich", "requests"]
# ///
# ABOUTME: Interactive punctuation model explorer for YouTube transcripts.
# ABOUTME: Downloads transcripts, runs arbitrary HuggingFace token-classification models, streams results.

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

console = Console()

# --- Transcript fetching and caching ---

CACHE_DIR = Path(".cache/transcripts")
INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)"


def extract_video_id(input_str: str) -> str:
    """Extract video ID from URL or bare ID."""
    m = re.search(r"[?&]v=([^&]+)", input_str)
    if m:
        return m.group(1)
    m = re.match(r"^[a-zA-Z0-9_-]{11}$", input_str)
    if m:
        return m.group(0)
    raise ValueError(f"Cannot extract video ID from: {input_str}")


def fetch_transcript(video_id: str) -> dict:
    """Fetch transcript from YouTube, with local caching."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{video_id}.json"

    if cache_path.exists():
        data = json.loads(cache_path.read_text())
        console.print(f"[dim]Cached transcript: {data['title']} ({data['word_count']} words)[/dim]")
        return data

    console.print(f"[dim]Fetching transcript for {video_id}...[/dim]")
    resp = requests.post(
        INNERTUBE_URL,
        headers={"Content-Type": "application/json", "User-Agent": ANDROID_UA},
        json={"context": {"client": {"clientName": "ANDROID", "clientVersion": "20.10.38"}}, "videoId": video_id},
    )
    player = resp.json()
    title = player.get("videoDetails", {}).get("title", video_id)

    tracks = player.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
    en_track = next((t for t in tracks if t["languageCode"] == "en"), None)
    if not en_track:
        langs = ", ".join(t["languageCode"] for t in tracks) or "none"
        raise ValueError(f"No English captions. Available: {langs}")

    caption_url = en_track["baseUrl"]
    caption_url = re.sub(r"fmt=[^&]*", "fmt=json3", caption_url) if "fmt=" in caption_url else caption_url + "&fmt=json3"
    captions = requests.get(caption_url, headers={"User-Agent": ANDROID_UA}).json()

    words = parse_json3(captions)
    data = {"video_id": video_id, "title": title, "word_count": len(words), "words": words}
    cache_path.write_text(json.dumps(data))
    console.print(f"[dim]Fetched: {title} ({len(words)} words, cached)[/dim]")
    return data


def parse_json3(captions: dict) -> list[str]:
    """Parse JSON3 captions into a flat word list."""
    words = []
    for event in captions.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        for seg in segs:
            text = seg.get("utf8", "").strip()
            if text:
                # Split multi-word segments
                for w in text.split():
                    # Strip existing punctuation for clean model input
                    cleaned = re.sub(r"[.,!?;:'\"\-()\[\]]", "", w).strip()
                    if cleaned:
                        words.append(cleaned.lower())
    return words


# --- Model registry ---

KNOWN_MODELS = {
    # --- XLM-RoBERTa family (multilingual, oliverguhr) ---
    "oliverguhr-base": {
        "hf_id": "oliverguhr/fullstop-punctuation-multilingual-base",
        "size": "~1.1 GB",
        "desc": "XLM-RoBERTa base, multilingual, good on spoken text. Punctuation only.",
    },
    "oliverguhr-large": {
        "hf_id": "oliverguhr/fullstop-punctuation-multilang-large",
        "size": "~2.2 GB",
        "desc": "XLM-RoBERTa large, best quality but slow/heavy. Punctuation only.",
    },
    # --- BERT-based (English) ---
    "felflare": {
        "hf_id": "Felflare/bert-restore-punctuation",
        "size": "~420 MB",
        "desc": "BERT base, English. Punctuation + some casing.",
    },
    "kredor": {
        "hf_id": "kredor/punctuate-all",
        "size": "~420 MB",
        "desc": "BERT base, English. Trained on diverse text.",
    },
    # --- DistilBERT (smaller/faster) ---
    "unikei": {
        "hf_id": "unikei/distilbert-base-re-punctuate",
        "size": "~250 MB",
        "desc": "DistilBERT, smaller and faster. English punctuation.",
    },
    "taufiq": {
        "hf_id": "Qishuai/distilbert_punctuator_en",
        "size": "~250 MB",
        "desc": "DistilBERT, English. Period/comma/question.",
    },
    # --- RoBERTa ---
    "nkjha": {
        "hf_id": "Nkjha/roberta-base-punct-restore",
        "size": "~500 MB",
        "desc": "RoBERTa base, English. Punctuation restoration.",
    },
    # --- Smaller / specialized ---
    "caribe": {
        "hf_id": "caribe/bert-base-multilingual-cased-punct-restore",
        "size": "~660 MB",
        "desc": "mBERT cased, multilingual. May preserve some casing.",
    },
    "yvonne": {
        "hf_id": "Yvonne-Li/distilbert-base-uncased-finetuned-punct-restore",
        "size": "~250 MB",
        "desc": "DistilBERT finetuned for punctuation. Small and fast.",
    },
    # --- DeBERTa (newer architecture, often better quality) ---
    "xashru": {
        "hf_id": "xashru/deberta-v3-base-punct",
        "size": "~700 MB",
        "desc": "DeBERTa v3 base. Newer architecture, potentially better quality.",
    },
}

DEFAULT_MODELS = ["oliverguhr-base", "felflare", "unikei"]


def resolve_model_id(name: str) -> str:
    """Resolve a short name to a HuggingFace model ID, or pass through as-is."""
    if name in KNOWN_MODELS:
        return KNOWN_MODELS[name]["hf_id"]
    return name


def list_models():
    """Print the known model registry."""
    table = Table(title="Known Punctuation Models")
    table.add_column("Name", style="cyan")
    table.add_column("HuggingFace ID", style="green")
    table.add_column("Size", style="yellow")
    table.add_column("Description")

    for name, info in KNOWN_MODELS.items():
        default = " *" if name in DEFAULT_MODELS else ""
        table.add_row(name + default, info["hf_id"], info["size"], info["desc"])

    console.print(table)
    console.print("[dim]* = included in default comparison. Pass any HuggingFace model ID directly too.[/dim]")


# --- Model inference ---

def run_model(hf_id: str, words: list[str], chunk_size: int = 300) -> tuple[str, float, float]:
    """Run a token-classification model on words, return (formatted_text, load_time, inference_time)."""
    from transformers import pipeline as hf_pipeline, AutoTokenizer

    console.print(f"  [dim]Loading {hf_id}...[/dim]", end="")
    load_start = time.time()
    try:
        classifier = hf_pipeline("token-classification", model=hf_id, aggregation_strategy="none")
    except Exception as e:
        console.print(f" [red]FAILED: {e}[/red]")
        return "", 0, 0
    load_time = time.time() - load_start
    console.print(f" [dim]{load_time:.1f}s[/dim]")

    # Chunk words to stay under model's max sequence length
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i : i + chunk_size]))

    # Map entity labels to punctuation
    # Different models use different label schemes
    label_map = detect_label_map(classifier, chunks[0] if chunks else "hello world")
    if label_map:
        mapped = {k: v for k, v in label_map.items() if v}
        console.print(f"  [dim]Labels: {mapped or '(all mapped to no-punct)'}[/dim]")

    inference_start = time.time()
    all_output_words = []

    for chunk_idx, chunk in enumerate(chunks):
        try:
            preds = classifier(chunk)
        except Exception as e:
            console.print(f"  [red]Inference error on chunk {chunk_idx}: {e}[/red]")
            all_output_words.extend(chunk.split())
            continue

        # Build a map from character position to punctuation label.
        # Each prediction has start/end char offsets -- use the label of the
        # last subtoken that overlaps each word's span.
        # Map predictions to words using character offsets
        chunk_words = chunk.split()

        # Build word character spans
        word_spans = []
        pos = 0
        for w in chunk_words:
            idx = chunk.index(w, pos)
            word_spans.append((idx, idx + len(w)))
            pos = idx + len(w)

        # Debug: show first few predictions on first chunk
        if chunk_idx == 0 and preds:
            first = preds[0]
            has_offsets = "start" in first and first["start"] is not None
            if not has_offsets:
                console.print(f"  [yellow]Warning: predictions lack char offsets, falling back to sequential matching[/yellow]")
            pass

        # Check if predictions have character offsets
        has_offsets = preds and "start" in preds[0] and preds[0]["start"] is not None

        if has_offsets:
            for w_idx, (w_start, w_end) in enumerate(word_spans):
                last_label = ""
                for pred in preds:
                    if pred["start"] < w_end and pred["end"] > w_start:
                        last_label = pred["entity"]
                punct = label_map.get(last_label, "")
                all_output_words.append(chunk_words[w_idx] + punct)
        else:
            # Fallback: sequential matching (one or more subtokens per word)
            pred_idx = 0
            for word in chunk_words:
                last_label = ""
                if pred_idx < len(preds):
                    last_label = preds[pred_idx]["entity"]
                    pred_idx += 1
                    # Consume continuation subtokens (## prefix for BERT-like)
                    while pred_idx < len(preds) and preds[pred_idx]["word"].startswith("##"):
                        last_label = preds[pred_idx]["entity"]
                        pred_idx += 1
                punct = label_map.get(last_label, "")
                all_output_words.append(word + punct)

        # Stream progress
        pct = (chunk_idx + 1) * 100 // len(chunks)
        sys.stdout.write(f"\r  Inference: {pct}% ({chunk_idx + 1}/{len(chunks)} chunks)")
        sys.stdout.flush()

    inference_time = time.time() - inference_start
    sys.stdout.write(f"\r  Inference: {inference_time:.1f}s ({len(words)} words, {inference_time * 1000 / len(words):.2f}ms/word)\n")
    sys.stdout.flush()

    return " ".join(all_output_words), load_time, inference_time


def detect_label_map(classifier, sample_text: str) -> dict[str, str]:
    """Detect what label scheme a model uses and return a mapping to punctuation chars."""
    # Run on a longer sample to see all possible labels
    try:
        sample = sample_text + " this is a question right and this is another sentence that should end"
        preds = classifier(sample)
        labels = set(p["entity"] for p in preds)
    except Exception:
        labels = set()

    # Also check model config for id2label if available
    if hasattr(classifier.model, "config") and hasattr(classifier.model.config, "id2label"):
        labels.update(classifier.model.config.id2label.values())

    console.print(f"  [dim]Raw labels from model: {sorted(labels)}[/dim]")

    # Common label schemes across punctuation models:
    # Scheme 1 (oliverguhr): "0", ".", ",", "?", "!", "-"
    # Scheme 2 (felflare): "LABEL_0" (O), "LABEL_1" (.), "LABEL_2" (,), "LABEL_3" (?), "LABEL_4" (!)
    # Scheme 3: "O", "PERIOD", "COMMA", "QUESTION"
    # Scheme 4: BIO format "B-PERIOD", "I-PERIOD", "B-COMMA", etc.

    label_map: dict[str, str] = {}

    for label in labels:
        # Handle combined casing+punct labels like "UPPER.", "Upper,", "lower_", "lower?"
        # Extract just the punctuation suffix
        punct_char = label[-1] if label and label[-1] in ".,?!:;-_" else None
        if punct_char == "_":
            punct_char = None  # underscore means no punctuation

        if punct_char:
            label_map[label] = punct_char if punct_char != "-" else ""
            continue

        # Standard label schemes
        upper = label.upper().replace("B-", "").replace("I-", "")
        if label in ("0", "O") or upper == "O" or upper == "LABEL_0" or upper == "NONE":
            label_map[label] = ""
        elif label == "." or "PERIOD" in upper or upper == "LABEL_1" or "FULLSTOP" in upper:
            label_map[label] = "."
        elif label == "," or "COMMA" in upper or upper == "LABEL_2":
            label_map[label] = ","
        elif label == "?" or "QUESTION" in upper or upper == "LABEL_3":
            label_map[label] = "?"
        elif label == "!" or "EXCLAM" in upper or upper == "LABEL_4":
            label_map[label] = "!"
        elif label == ":" or "COLON" in upper:
            label_map[label] = ":"
        elif label == ";" or "SEMI" in upper:
            label_map[label] = ";"
        else:
            label_map[label] = ""

    return label_map


# --- Output formatting ---

def print_result(model_name: str, hf_id: str, words: list[str], output: str, load_time: float, inference_time: float):
    """Print a formatted result panel."""
    raw_sample = " ".join(words[:80])
    out_sample = " ".join(output.split()[:80])

    info = f"Load: {load_time:.1f}s | Inference: {inference_time:.1f}s | {inference_time * 1000 / max(len(words), 1):.2f}ms/word"

    panel_content = Text()
    panel_content.append(info + "\n\n", style="dim")
    panel_content.append("RAW: ", style="bold dim")
    panel_content.append(raw_sample + "\n\n", style="dim")
    panel_content.append("OUT: ", style="bold green")
    panel_content.append(out_sample)

    console.print(Panel(panel_content, title=f"[cyan]{model_name}[/cyan] [dim]({hf_id})[/dim]", border_style="blue"))


# --- Main ---

def main():
    parser = argparse.ArgumentParser(
        description="Explore punctuation models on YouTube transcripts.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  just punct-explore list
  just punct-explore dQw4w9WgXcQ
  just punct-explore 'https://youtube.com/watch?v=XYZ' -m oliverguhr-base
  just punct-explore XYZ -m oliverguhr/fullstop-punctuation-multilang-large
  just punct-explore XYZ --full""",
    )
    parser.add_argument("input", nargs="?", help="YouTube URL, video ID, or 'list' to show models")
    parser.add_argument("-m", "--model", action="append", help="Model name or HuggingFace ID (repeatable). Default: run 3 models.")
    parser.add_argument("--full", action="store_true", help="Show full output (not just first 80 words)")
    parser.add_argument("--chunk-size", type=int, default=300, help="Words per inference chunk (default: 300)")

    args = parser.parse_args()

    if not args.input or args.input == "list":
        list_models()
        return

    # Fetch/cache transcript
    video_id = extract_video_id(args.input)
    transcript = fetch_transcript(video_id)
    words = transcript["words"]

    console.print(f"\n[bold]{transcript['title']}[/bold]")
    console.print(f"[dim]{len(words)} words[/dim]\n")

    # Determine which models to run
    model_names = args.model or DEFAULT_MODELS

    for name in model_names:
        hf_id = resolve_model_id(name)
        display_name = name if name in KNOWN_MODELS else hf_id

        output, load_time, inference_time = run_model(hf_id, words, args.chunk_size)
        if not output:
            continue

        if args.full:
            console.print(Panel(output, title=f"[cyan]{display_name}[/cyan]", border_style="blue"))
        else:
            print_result(display_name, hf_id, words, output, load_time, inference_time)

        console.print()


if __name__ == "__main__":
    main()
