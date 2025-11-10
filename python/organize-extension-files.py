#!/usr/bin/env python3
import sys
from pathlib import Path
import argparse
import shutil

def ensure_unique(dest_path: Path) -> Path:
    if not dest_path.exists():
        return dest_path
    stem = dest_path.stem
    suffix = dest_path.suffix
    i = 1
    while True:
        candidate = dest_path.with_name(f"{stem}_{i}{suffix}")
        if not candidate.exists():
            return candidate
        i += 1

def organize_by_extension(root: Path, target: Path, ignore: set, dry_run: bool = False) -> int:
    root = root.resolve()
    target = target.resolve()
    moved = 0
    if not target.exists():
        if dry_run:
            print(f"[DRY-RUN] would create target directory: {target}")
        else:
            target.mkdir(parents=True, exist_ok=True)

    ignore = {e.lower().lstrip('.') for e in ignore if e.strip()}

    for p in root.rglob('*'):
        if not p.is_file():
            continue
        # Skip processing if the file is inside the target directory
        try:
            if target in p.resolve().parents or p.resolve() == target:
                continue
        except Exception:
            pass

        ext = p.suffix.lower().lstrip('.')
        key = ext if ext != '' else 'no_extension'
        if key in ignore:
            continue

        dest_dir = target / key
        if not dest_dir.exists():
            if dry_run:
                print(f"[DRY-RUN] mkdir -p {dest_dir}")
            else:
                dest_dir.mkdir(parents=True, exist_ok=True)

        dest_path = dest_dir / p.name
        if not dry_run:
            dest_path = ensure_unique(dest_path)
            shutil.move(str(p), str(dest_path))
            print(f"Moved: {p} -> {dest_path}")
        else:
            print(f"[DRY-RUN] {p} -> {dest_path}")

        moved += 1

    return moved

def main():
    parser = argparse.ArgumentParser(description="Organize files by extension into a destination folder.")
    parser.add_argument('--root', '-r', required=True, help='Root directory to organize')
    parser.add_argument('--target', '-t', required=False, help='Destination directory for organized files. Defaults to root/organized')
    parser.add_argument('--ignore', default='', help='Comma-separated list of extensions to ignore (with or without leading dot). Example: .tmp,.log')
    parser.add_argument('--dry-run', action='store_true', help='Dry run: show what would be done without moving files')
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(f"Root directory does not exist: {root}", file=sys.stderr)
        sys.exit(1)

    target = Path(args.target) if args.target else root / 'organized'
    if not target.exists():
        if args.dry_run:
            print(f"[DRY-RUN] would create target directory: {target}")
        else:
            target.mkdir(parents=True, exist_ok=True)

    moved = organize_by_extension(root, target, args.ignore.split(',') if args.ignore else [], args.dry_run)

    print(f"Total files processed: {moved}")

if __name__ == "__main__":
    main()
