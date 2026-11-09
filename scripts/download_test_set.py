"""Assemble the real-photo test set: copy the bundled photos and download the rest from
their original sources, checking each download against its recorded hash.

    uv run scripts/download_test_set.py --out data/real_test

Labels are in test_set/labels.json, keyed by file name. Re-running skips finished files.
"""

import argparse
import hashlib
import json
import shutil
import urllib.request
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "test_set"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def derive(data: bytes, src: dict) -> bytes | None:
    """Apply the resize and crop that were used when the photo was labeled."""
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    img = cv2.resize(img, tuple(src["resize"]), interpolation=cv2.INTER_AREA)
    if "crop" in src:
        x, y, w, h = src["crop"]
        img = img[y : y + h, x : x + w]
    ext = "." + src["file"].rsplit(".", 1)[1]
    params = [cv2.IMWRITE_JPEG_QUALITY, 95] if ext != ".png" else []
    return cv2.imencode(ext, img, params)[1].tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("data/real_test"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    for own in sorted((ROOT / "own").iterdir()):
        shutil.copy2(own, args.out / own.name)

    failed, done = [], 0
    for src in json.load(open(ROOT / "sources.json")):
        dest = args.out / src["file"]
        if dest.exists():
            done += 1
            continue
        try:
            data = fetch(src["url"])
        except OSError as e:
            failed.append(f"{src['file']}: {e}")
            continue
        if hashlib.sha256(data).hexdigest() != src["sha256"]:
            failed.append(f"{src['file']}: the image at {src['url']} has changed")
            continue
        if "resize" in src:
            data = derive(data, src)
        dest.write_bytes(data)
        done += 1

    n_own = len(list((ROOT / "own").iterdir()))
    print(f"{n_own} bundled + {done} downloaded photos in {args.out}")
    for line in failed:
        print(f"FAILED: {line}")


if __name__ == "__main__":
    main()
