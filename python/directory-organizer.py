#!/usr/bin/env python3
import argparse
from pathlib import Path
import shutil

def categorize(ext: str) -> str:
    mapping = {
        'Images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
        'Video': ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'],
        'Audio': ['.mp3', '.wav', '.aac', '.flac', '.ogg'],
        'Documents': ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
        'Archives': ['.zip', '.tar', '.gz', '.bz2', '.rar', '.7z'],
        'Code': ['.py', '.js', '.java', '.c', '.cpp', '.ts', '.css', '.html', '.sh'],
    }
    for category, exts in mapping.items():
        if ext.lower() in exts:
            return category
    return 'Other'

def safe_move(src: Path, dest_dir: Path):
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / src.name
    if dest_path.exists():
        base = src.stem
        suffix = src.suffix
        idx = 1
        while True:
            new_name = f"{base}_{idx}{suffix}"
            new_dest = dest_dir / new_name
            if not new_dest.exists():
                dest_path = new_dest
                break
            idx += 1
    shutil.move(str(src), str(dest_path))

def organize(source: Path, dest_root: Path, dry_run: bool = False):
    for item in source.iterdir():
        if item.is_dir():
            continue
        if item.name.startswith('.'):
            continue
        category = categorize(item.suffix)
        dest_dir = dest_root / category
        if dry_run:
            print(f"Would move: {item} -> {dest_dir / item.name}")
        else:
            safe_move(item, dest_dir)

def main():
    parser = argparse.ArgumentParser(
        description="Organize files in a directory into category folders by file extension."
    )
    parser.add_argument("source", help="Source directory to organize")
    parser.add_argument("destination", nargs='?', default=None, help="Destination root directory (default: <source>/Organized)")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without moving files")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    if not source.exists() or not source.is_dir():
        parser.error("Source must be an existing directory.")
    dest_root = Path(args.destination).resolve() if args.destination else source / "Organized"

    organize(source, dest_root, dry_run=args.dry_run)

if __name__ == "__main__":
    main()
