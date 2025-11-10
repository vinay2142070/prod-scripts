#!/usr/bin/env python3
"""
downloads_organizer.py

Usage:
  python downloads_organizer.py            # organize ~/Downloads -> ~/Organized/Downloads
  python downloads_organizer.py --dry-run  # show what would happen
  python downloads_organizer.py --min-age 3  # only move files older than 3 days
"""

import argparse
import hashlib
import shutil
from pathlib import Path
from datetime import datetime, timedelta

# Simple extension -> category mapping
EXT_MAP = {
    "Images": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp", ".heic"},
    "Videos": {".mp4", ".mkv", ".mov", ".avi", ".webm"},
    "Audio": {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"},
    "Documents": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv"},
    "Archives": {".zip", ".tar", ".gz", ".tgz", ".rar", ".7z"},
    "Code": {".py", ".js", ".ts", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".sh"},
}

DEFAULT_SOURCE = Path.home() / "Downloads"
DEFAULT_DEST = Path.home() / "Organized" / "Downloads"

BUF_SIZE = 65536  # 64KB


def parse_args():
    p = argparse.ArgumentParser(description="Organize Downloads into categorized folders.")
    p.add_argument("--source", "-s", type=Path, default=DEFAULT_SOURCE, help="Source directory (default: ~/Downloads)")
    p.add_argument("--dest", "-d", type=Path, default=DEFAULT_DEST, help="Destination root (default: ~/Organized/Downloads)")
    p.add_argument("--dry-run", action="store_true", help="Print actions without moving files")
    p.add_argument("--min-age", type=int, default=0, help="Only move files older than N days (default: 0)")
    return p.parse_args()


def category_for(suffix: str) -> str:
    suffix = suffix.lower()
    for cat, exts in EXT_MAP.items():
        if suffix in exts:
            return cat
    return "Others"


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(BUF_SIZE)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def unique_target_path(target_dir: Path, filename: str) -> Path:
    target = target_dir / filename
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    i = 1
    while True:
        candidate = target_dir / f"{stem}-{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def main():
    args = parse_args()
    src = args.source.expanduser().resolve()
    dest = args.dest.expanduser().resolve()

    if not src.exists() or not src.is_dir():
        print(f"Source directory does not exist: {src}")
        return

    dest.mkdir(parents=True, exist_ok=True)
    cutoff = datetime.now() - timedelta(days=args.min_age) if args.min_age > 0 else None

    seen_hashes = {}  # checksum -> Path (first seen)
    moved = 0
    skipped = 0

    print(f"{'DRY-RUN: ' if args.dry_run else ''}Organizing '{src}' -> '{dest}'")
    for entry in src.iterdir():
        if entry.is_dir():
            # skip directories (keeps process simple and safe)
            skipped += 1
            continue
        if entry.is_symlink():
            skipped += 1
            continue

        mtime = datetime.fromtimestamp(entry.stat().st_mtime)
        if cutoff and mtime > cutoff:
            # file is newer than min-age threshold
            skipped += 1
            continue

        cat = category_for(entry.suffix)
        target_dir = dest / cat
        target_dir.mkdir(parents=True, exist_ok=True)

        try:
            file_hash = sha256_of_file(entry)
        except Exception as e:
            print(f"Failed to hash {entry.name}: {e}")
            skipped += 1
            continue

        if file_hash in seen_hashes:
            # duplicate found
            dup_dir = dest / "Duplicates"
            dup_dir.mkdir(parents=True, exist_ok=True)
            target = unique_target_path(dup_dir, entry.name)
            action = "DRY-MOVE" if args.dry_run else "MOVE (duplicate)"
            print(f"{action}: {entry.name} -> {target.relative_to(dest)} (duplicate of {seen_hashes[file_hash].name})")
        else:
            target = unique_target_path(target_dir, entry.name)
            action = "DRY-MOVE" if args.dry_run else "MOVE"
            print(f"{action}: {entry.name} -> {target.relative_to(dest)}")

        if not args.dry_run:
            try:
                shutil.move(str(entry), str(target))
                moved += 1
                if file_hash not in seen_hashes:
                    seen_hashes[file_hash] = target
            except Exception as e:
                print(f"Failed to move {entry.name}: {e}")
                skipped += 1

    print(f"\nDone. Moved: {moved}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
