#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyobjc-framework-Quartz"]
# ///
# ABOUTME: OS-level helper for store screenshots: list windows, capture one by owner, click, and drag.
# ABOUTME: Uses Quartz window info, macOS screencapture, and CGEvent mouse input (needs Screen Recording + Accessibility).

import json
import subprocess
import sys
import time

import Quartz


def windows(owner_filter: str) -> list[dict]:
    infos = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID,
    )
    out = []
    for w in infos:
        owner = w.get("kCGWindowOwnerName", "")
        bounds = w.get("kCGWindowBounds", {})
        if owner_filter.lower() not in owner.lower() or bounds.get("Width", 0) < 200:
            continue
        out.append(
            {
                "id": w["kCGWindowNumber"],
                "pid": w.get("kCGWindowOwnerPID", 0),
                "owner": owner,
                "name": w.get("kCGWindowName", ""),
                "x": int(bounds["X"]),
                "y": int(bounds["Y"]),
                "width": int(bounds["Width"]),
                "height": int(bounds["Height"]),
            }
        )
    return out


def mouse(kind, x: float, y: float, button=Quartz.kCGMouseButtonLeft) -> None:
    event = Quartz.CGEventCreateMouseEvent(None, kind, (x, y), button)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)


def click(x: float, y: float) -> None:
    mouse(Quartz.kCGEventMouseMoved, x, y)
    time.sleep(0.05)
    mouse(Quartz.kCGEventLeftMouseDown, x, y)
    time.sleep(0.05)
    mouse(Quartz.kCGEventLeftMouseUp, x, y)


def drag(x1: float, y1: float, x2: float, y2: float, steps: int = 20) -> None:
    mouse(Quartz.kCGEventMouseMoved, x1, y1)
    time.sleep(0.1)
    mouse(Quartz.kCGEventLeftMouseDown, x1, y1)
    for i in range(1, steps + 1):
        t = i / steps
        mouse(Quartz.kCGEventLeftMouseDragged, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
        time.sleep(0.02)
    mouse(Quartz.kCGEventLeftMouseUp, x2, y2)


def main(argv: list[str]) -> int:
    cmd, args = argv[0], argv[1:]
    if cmd == "list":
        print(json.dumps(windows(args[0] if args else "")))
    elif cmd == "capture":
        owner, out = args
        found = windows(owner)
        if not found:
            print(f"no window for owner containing {owner!r}", file=sys.stderr)
            return 1
        r = subprocess.run(["screencapture", "-x", "-o", "-l", str(found[0]["id"]), out])
        return r.returncode
    elif cmd == "click":
        click(float(args[0]), float(args[1]))
    elif cmd == "drag":
        drag(float(args[0]), float(args[1]), float(args[2]), float(args[3]))
    else:
        print("usage: capture-window.py list [owner] | capture <owner> <out.png> | click x y | drag x1 y1 x2 y2", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
