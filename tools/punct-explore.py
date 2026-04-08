#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["transformers", "torch", "rich", "requests"]
# ///
# ABOUTME: Interactive punctuation model explorer for YouTube transcripts.
# ABOUTME: Downloads transcripts, runs arbitrary HuggingFace token-classification models, streams results.

import argparse
import json
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
SEGMENT_GAP_MS = 2000  # same as the extension's gap threshold


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
    """Fetch transcript from YouTube with word-level timing, locally cached."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{video_id}_timed.json"

    if cache_path.exists():
        data = json.loads(cache_path.read_text())
        console.print(f"[dim]Cached: {data['title']} ({len(data['timed_words'])} words)[/dim]")
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

    timed_words = parse_json3_timed(captions)
    data = {"video_id": video_id, "title": title, "timed_words": timed_words}
    cache_path.write_text(json.dumps(data))
    console.print(f"[dim]Fetched: {title} ({len(timed_words)} words, cached)[/dim]")
    return data


def parse_json3_timed(captions: dict) -> list[dict]:
    """Parse JSON3 captions into timed words: [{text, start_ms, end_ms}, ...]."""
    words = []
    for event in captions.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        t_start = event.get("tStartMs", 0)
        duration = event.get("dDurationMs", 0)
        has_offsets = any(s.get("tOffsetMs") is not None for s in segs)

        if has_offsets:
            for i, seg in enumerate(segs):
                raw = seg.get("utf8", "").strip()
                if not raw:
                    continue
                start = t_start + seg.get("tOffsetMs", 0)
                next_offset = segs[i + 1].get("tOffsetMs", duration) if i + 1 < len(segs) else duration
                end = t_start + next_offset
                for w in raw.split():
                    cleaned = re.sub(r"[.,!?;:'\"\-()\[\]]", "", w).strip()
                    if cleaned:
                        words.append({"text": cleaned.lower(), "start_ms": start, "end_ms": end})
        else:
            full = "".join(s.get("utf8", "") for s in segs)
            split = [w for w in full.split() if w.strip()]
            if not split:
                continue
            word_dur = duration / len(split) if split else 0
            for j, w in enumerate(split):
                cleaned = re.sub(r"[.,!?;:'\"\-()\[\]]", "", w).strip()
                if cleaned:
                    words.append({
                        "text": cleaned.lower(),
                        "start_ms": round(t_start + j * word_dur),
                        "end_ms": round(t_start + (j + 1) * word_dur),
                    })
    return words


def segment_by_gaps(timed_words: list[dict], gap_ms: int = SEGMENT_GAP_MS, max_words: int = 200) -> list[list[dict]]:
    """Group timed words into segments separated by gaps >= gap_ms.

    Segments larger than max_words are split into smaller chunks to stay
    within typical model context windows (~512 tokens). Paragraph breaks
    from gaps are preserved; sub-chunks within a paragraph are seamless.
    Returns a list of (segment, is_paragraph_start) tuples.
    """
    if not timed_words:
        return []

    # First pass: group by timestamp gaps
    paragraphs: list[list[dict]] = []
    current: list[dict] = [timed_words[0]]
    for w in timed_words[1:]:
        if w["start_ms"] - current[-1]["end_ms"] > gap_ms:
            paragraphs.append(current)
            current = []
        current.append(w)
    if current:
        paragraphs.append(current)

    # Second pass: split large paragraphs into model-sized chunks
    # Track which chunks start a new paragraph
    segments: list[list[dict]] = []
    paragraph_starts: list[bool] = []

    for para in paragraphs:
        if len(para) <= max_words:
            segments.append(para)
            paragraph_starts.append(True)
        else:
            for i in range(0, len(para), max_words):
                segments.append(para[i : i + max_words])
                paragraph_starts.append(i == 0)

    return segments, paragraph_starts


def format_time(ms: int) -> str:
    """Format milliseconds as M:SS or H:MM:SS."""
    total_s = ms // 1000
    h, remainder = divmod(total_s, 3600)
    m, s = divmod(remainder, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# --- Model registry ---

KNOWN_MODELS = {
    # --- XLM-RoBERTa family (multilingual) ---
    "oliverguhr-base": {
        "hf_id": "oliverguhr/fullstop-punctuation-multilingual-base",
        "size": "~1.1 GB",
        "caps": "punct",
        "desc": "XLM-RoBERTa base, multilingual. Best punctuation quality on spoken text.",
    },
    "oliverguhr-large": {
        "hf_id": "oliverguhr/fullstop-punctuation-multilang-large",
        "size": "~2.2 GB",
        "caps": "punct",
        "desc": "XLM-RoBERTa large, multilingual. Highest quality, slow/heavy.",
    },
    # --- BERT-based (English) ---
    "felflare": {
        "hf_id": "Felflare/bert-restore-punctuation",
        "size": "~420 MB",
        "caps": "punct+case",
        "desc": "BERT base, English. Punctuation + casing.",
    },
    "kredor": {
        "hf_id": "kredor/punctuate-all",
        "size": "~420 MB",
        "caps": "punct",
        "desc": "BERT base, English. Trained on diverse text.",
    },
    # --- DistilBERT (smaller/faster, English) ---
    "unikei": {
        "hf_id": "unikei/distilbert-base-re-punctuate",
        "size": "~250 MB",
        "caps": "punct+case",
        "desc": "DistilBERT, English. Combined punct+casing labels.",
    },
    "taufiq": {
        "hf_id": "Qishuai/distilbert_punctuator_en",
        "size": "~250 MB",
        "caps": "punct",
        "desc": "DistilBERT, English. Period/comma/question.",
    },
    # --- RoBERTa (English) ---
    "nkjha": {
        "hf_id": "Nkjha/roberta-base-punct-restore",
        "size": "~500 MB",
        "caps": "punct",
        "desc": "RoBERTa base, English. Punctuation restoration.",
    },
    # --- Multilingual BERT ---
    "caribe": {
        "hf_id": "caribe/bert-base-multilingual-cased-punct-restore",
        "size": "~660 MB",
        "caps": "punct+case",
        "desc": "mBERT cased, multilingual. May preserve casing.",
    },
    # --- More DistilBERT ---
    "yvonne": {
        "hf_id": "Yvonne-Li/distilbert-base-uncased-finetuned-punct-restore",
        "size": "~250 MB",
        "caps": "punct",
        "desc": "DistilBERT finetuned for punctuation. Small and fast.",
    },
    # --- DeBERTa ---
    "xashru": {
        "hf_id": "xashru/deberta-v3-base-punct",
        "size": "~700 MB",
        "caps": "punct",
        "desc": "DeBERTa v3 base. Newer architecture, potentially better quality.",
    },
}

DEFAULT_MODELS = ["oliverguhr-base", "felflare", "unikei"]


def resolve_model_id(name: str) -> str:
    if name in KNOWN_MODELS:
        return KNOWN_MODELS[name]["hf_id"]
    return name


def list_models():
    table = Table(title="Known Punctuation Models")
    table.add_column("Name", style="cyan")
    table.add_column("HuggingFace ID", style="green")
    table.add_column("Size", style="yellow")
    table.add_column("Caps", style="magenta")
    table.add_column("Description")

    for name, info in KNOWN_MODELS.items():
        default = " *" if name in DEFAULT_MODELS else ""
        table.add_row(name + default, info["hf_id"], info["size"], info["caps"], info["desc"])

    console.print(table)
    console.print("[dim]* = included in default comparison. 'punct+case' = model predicts casing too.[/dim]")
    console.print("[dim]Pass any HuggingFace model ID directly with -m.[/dim]")


# --- Label detection ---

def detect_label_map(classifier) -> dict[str, str]:
    """Detect the model's label scheme and return a mapping to punctuation chars."""
    labels = set()
    if hasattr(classifier.model, "config") and hasattr(classifier.model.config, "id2label"):
        labels.update(classifier.model.config.id2label.values())

    label_map: dict[str, str] = {}
    casing_info: dict[str, str] = {}  # label -> casing action

    for label in labels:
        # Combined casing+punct labels: "UPPER.", "Upper,", "lower_", "lower?"
        if len(label) > 1 and label[-1] in ".,?!:;-_":
            punct = label[-1] if label[-1] != "_" else ""
            if label[-1] == "-":
                punct = ""
            label_map[label] = punct
            # Extract casing info
            prefix = label[:-1]
            if prefix.isupper():
                casing_info[label] = "UPPER"
            elif prefix[0].isupper():
                casing_info[label] = "Title"
            else:
                casing_info[label] = "lower"
            continue

        # Standard label schemes
        upper = label.upper().replace("B-", "").replace("I-", "")
        if label in ("0", "O") or upper in ("O", "LABEL_0", "NONE"):
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

    return label_map, casing_info


# --- Model inference ---

def load_model(hf_id: str):
    """Load a token-classification pipeline, return (classifier, load_time)."""
    from transformers import pipeline as hf_pipeline

    console.print(f"  [dim]Loading {hf_id}...[/dim]", end="")
    load_start = time.time()
    try:
        classifier = hf_pipeline("token-classification", model=hf_id, aggregation_strategy="none")
    except Exception as e:
        console.print(f" [red]FAILED: {e}[/red]")
        return None, 0
    load_time = time.time() - load_start
    console.print(f" [dim]{load_time:.1f}s[/dim]")
    return classifier, load_time


def process_segment(classifier, label_map: dict, casing_info: dict, words: list[str]) -> list[str]:
    """Run inference on a single segment's words, return formatted words."""
    text = " ".join(words)
    try:
        preds = classifier(text)
    except Exception as e:
        console.print(f"  [red]Inference error: {e}[/red]")
        return list(words)

    has_offsets = preds and "start" in preds[0] and preds[0]["start"] is not None

    # Build word spans
    word_spans = []
    pos = 0
    for w in words:
        idx = text.index(w, pos)
        word_spans.append((idx, idx + len(w)))
        pos = idx + len(w)

    output_words = []
    after_period = True  # capitalize first word

    if has_offsets:
        for w_idx, (w_start, w_end) in enumerate(word_spans):
            last_label = ""
            for pred in preds:
                if pred["start"] < w_end and pred["end"] > w_start:
                    last_label = pred["entity"]

            punct = label_map.get(last_label, "")
            word = words[w_idx]

            # Apply casing if model provides it
            if last_label in casing_info:
                case_action = casing_info[last_label]
                if case_action == "UPPER":
                    word = word.upper()
                elif case_action == "Title":
                    word = word[0].upper() + word[1:] if word else word
                # "lower" = keep as-is (already lowercase)
            elif after_period:
                word = word[0].upper() + word[1:] if word else word

            if word == "i":
                word = "I"

            after_period = punct in (".", "?", "!")
            output_words.append(word + punct)
    else:
        # Fallback: sequential matching
        pred_idx = 0
        for word in words:
            last_label = ""
            if pred_idx < len(preds):
                last_label = preds[pred_idx]["entity"]
                pred_idx += 1
                while pred_idx < len(preds) and preds[pred_idx]["word"].startswith("##"):
                    last_label = preds[pred_idx]["entity"]
                    pred_idx += 1

            punct = label_map.get(last_label, "")
            w = word
            if last_label in casing_info:
                case_action = casing_info[last_label]
                if case_action == "UPPER":
                    w = w.upper()
                elif case_action == "Title":
                    w = w[0].upper() + w[1:] if w else w
            elif after_period:
                w = w[0].upper() + w[1:] if w else w

            if w == "i":
                w = "I"

            after_period = punct in (".", "?", "!")
            output_words.append(w + punct)

    return output_words


# --- Output ---

def print_streaming_result(
    model_name: str,
    hf_id: str,
    segments: list[list[dict]],
    paragraph_starts: list[bool],
    formatted_segments: list[list[str]],
    load_time: float,
    inference_time: float,
    total_words: int,
    n_paragraphs: int,
    full: bool = False,
):
    """Print formatted transcript with paragraph breaks."""
    info = f"Load: {load_time:.1f}s | Inference: {inference_time:.1f}s | {inference_time * 1000 / max(total_words, 1):.2f}ms/word | {n_paragraphs} paragraphs"

    output = Text()
    output.append(info + "\n\n", style="dim")

    word_limit = total_words if full else 200
    words_shown = 0

    for seg_idx, (raw_seg, fmt_seg) in enumerate(zip(segments, formatted_segments)):
        if words_shown >= word_limit:
            output.append(f"\n... ({total_words - words_shown} more words, use --full to see all)", style="dim")
            break

        # Show timestamp at paragraph starts, indent continuations
        if paragraph_starts[seg_idx]:
            if seg_idx > 0:
                output.append("\n")  # blank line between paragraphs
            timestamp = format_time(raw_seg[0]["start_ms"])
            output.append(f"[{timestamp}] ", style="dim")
        # Insert paragraph breaks before ">>" speaker change markers
        first_word = True
        for word in fmt_seg:
            if word.startswith(">>"):
                output.append("\n\n")
            elif not first_word:
                output.append(" ")
            output.append(word)
            first_word = False
        output.append(" ")
        words_shown += len(fmt_seg)

    output.append("\n")
    console.print(Panel(output, title=f"[cyan]{model_name}[/cyan] [dim]({hf_id})[/dim]", border_style="blue"))


# --- Main ---

def main():
    parser = argparse.ArgumentParser(
        description="Explore punctuation models on YouTube transcripts.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  just punct-explore list                            # show all known models
  just punct-explore dQw4w9WgXcQ                     # run 3 default models
  just punct-explore XYZ -m oliverguhr-base          # run one model
  just punct-explore XYZ -m felflare -m unikei       # compare two models
  just punct-explore XYZ --all                       # run ALL known models
  just punct-explore XYZ --full                      # show full transcript
  just punct-explore XYZ --gap 3000                  # 3s paragraph gap""",
    )
    parser.add_argument("input", nargs="?", help="YouTube URL, video ID, or 'list' to show models")
    parser.add_argument("-m", "--model", action="append", help="Model name or HuggingFace ID (repeatable)")
    parser.add_argument("--all", action="store_true", help="Run all known models")
    parser.add_argument("--full", action="store_true", help="Show full transcript output")
    parser.add_argument("--gap", type=int, default=SEGMENT_GAP_MS, help=f"Paragraph gap threshold in ms (default: {SEGMENT_GAP_MS})")

    args = parser.parse_args()

    if not args.input or args.input == "list":
        list_models()
        return

    # Fetch/cache transcript
    video_id = extract_video_id(args.input)
    transcript = fetch_transcript(video_id)
    timed_words = transcript["timed_words"]

    # Segment by timestamp gaps, sub-chunk for model context windows
    segments, paragraph_starts = segment_by_gaps(timed_words, args.gap)
    total_words = sum(len(s) for s in segments)
    n_paragraphs = sum(paragraph_starts)
    seg_sizes = [len(s) for s in segments]

    console.print(f"\n[bold]{transcript['title']}[/bold]")
    console.print(f"[dim]{total_words} words, {n_paragraphs} paragraphs, {len(segments)} chunks (gap >= {args.gap}ms, max 200 words/chunk)[/dim]")
    console.print(f"[dim]Chunk sizes: min={min(seg_sizes)}, max={max(seg_sizes)}, median={sorted(seg_sizes)[len(seg_sizes)//2]}[/dim]\n")

    # Run models
    if args.all:
        model_names = list(KNOWN_MODELS.keys())
    else:
        model_names = args.model or DEFAULT_MODELS

    for name in model_names:
        hf_id = resolve_model_id(name)
        display_name = name if name in KNOWN_MODELS else hf_id

        classifier, load_time = load_model(hf_id)
        if not classifier:
            continue

        label_map, casing_info = detect_label_map(classifier)
        punct_labels = {k: v for k, v in label_map.items() if v}
        has_casing = bool(casing_info)
        console.print(f"  [dim]Punct labels: {punct_labels}[/dim]")
        if has_casing:
            console.print(f"  [dim]Casing: yes ({len(casing_info)} labels)[/dim]")

        # Process each segment individually -- streams progress
        inference_start = time.time()
        formatted_segments = []
        for seg_idx, seg in enumerate(segments):
            seg_words = [w["text"] for w in seg]
            fmt_words = process_segment(classifier, label_map, casing_info, seg_words)
            formatted_segments.append(fmt_words)

            pct = (seg_idx + 1) * 100 // len(segments)
            sys.stdout.write(f"\r  Inference: {pct}% ({seg_idx + 1}/{len(segments)} segments)")
            sys.stdout.flush()

        inference_time = time.time() - inference_start
        sys.stdout.write(f"\r  Inference: {inference_time:.1f}s ({total_words} words, {inference_time * 1000 / total_words:.2f}ms/word)      \n")
        sys.stdout.flush()

        print_streaming_result(
            display_name, hf_id, segments, paragraph_starts, formatted_segments,
            load_time, inference_time, total_words, n_paragraphs, args.full,
        )
        console.print()


if __name__ == "__main__":
    main()
