#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def safe_dest(target_dir: Path, fname: str) -> Path:
    dest = target_dir / fname
    if not dest.exists():
        return dest
    stem = dest.stem
    ext = dest.suffix
    i = 1
    while True:
        new_name = f"{stem}_{i}{ext}"
        candidate = target_dir / new_name
        if not candidate.exists():
            return candidate
        i += 1

def organize(src: Path, dst: Path, action: str = 'move', dry_run: bool = True):
    if not src.exists():
        print(f"Source directory does not exist: {src}")
        return
    if not dst.exists():
        dst.mkdir(parents=True, exist_ok=True)
    for p in src.rglob('*'):
        if p.is_file():
            ext = p.suffix.lower().lstrip('.')
            category = ext if ext else 'no_ext'
            target_dir = dst / category
            ensure_dir(target_dir)
            dest = safe_dest(target_dir, p.name)
            if dry_run:
                print(f"[DRY-RUN] {action.upper()} '{p}' -> '{dest}'")
            else:
                if action == 'move':
                    shutil.move(str(p), str(dest))
                else:
                    shutil.copy2(str(p), str(dest))

def main():
    parser = argparse.ArgumentParser(description="Organize files by extension into subfolders.")
    parser.add_argument('--src', required=True, help="Source directory to organize")
    parser.add_argument('--dst', required=True, help="Destination base directory for organized files")
    parser.add_argument('--action', choices=['move', 'copy'], default='move', help="Move or copy files (default: move)")
    parser.add_argument('--execute', action='store_true', help="Execute the operation; default is dry-run")
    args = parser.parse_args()

    dry_run = not args.execute
    organize(Path(args.src), Path(args.dst), action=args.action, dry_run=dry_run)

if __name__ == '__main__':
    main()
