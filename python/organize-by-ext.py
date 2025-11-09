#!/usr/bin/env python3
import argparse
from pathlib import Path
import shutil

EXT_CATEGORIES = {
    'Images': {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff'},
    'Archives': {'.zip', '.tar', '.gz', '.bz2', '.rar', '.7z'},
    'Documents': {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'},
    'Audio': {'.mp3', '.wav', '.aac', '.flac', '.ogg'},
    'Video': {'.mp4', '.mkv', '.avi', '.mov', '.webm'},
    'Code': {'.py', '.js', '.java', '.c', '.cpp', '.cs', '.rb', '.go', '.ts', '.sh', '.html', '.css'},
}

def categorize(ext: str) -> str:
    ext = ext.lower()
    for cat, exts in EXT_CATEGORIES.items():
        if ext in exts:
            return cat
    return 'Other'

def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    base = path.stem
    suffix = path.suffix
    i = 1
    while True:
        candidate = path.with_name(f"{base}_{i}{suffix}")
        if not candidate.exists():
            return candidate
        i += 1

def main():
    parser = argparse.ArgumentParser(description="Organize files in a directory into subfolders by file type (extension).")
    parser.add_argument('path', nargs='?', default='.', help="Directory to organize (default: current directory)")
    parser.add_argument('--dest', default=None, help="Base destination directory. If omitted, organizes inside the source directory.")
    parser.add_argument('--dry-run', action='store_true', help="Show what would be done without moving/copying files.")
    parser.add_argument('--move', action='store_true', help="Move files instead of copying.")
    args = parser.parse_args()

    base = Path(args.path).resolve()
    dest_base = Path(args.dest).resolve() if args.dest else base
    if not base.exists() or not base.is_dir():
        raise SystemExit(f"Error: {base} is not a directory.")

    for file in base.rglob('*'):
        if file.is_file():
            cat = categorize(file.suffix)
            target_dir = dest_base / cat
            target_dir.mkdir(parents=True, exist_ok=True)
            dest_path = target_dir / file.name
            dest_path = unique_path(dest_path)

            if args.dry_run:
                print(f"[DRY-RUN] {file} -> {dest_path}")
            else:
                if args.move:
                    shutil.move(str(file), str(dest_path))
                else:
                    shutil.copy2(str(file), str(dest_path))

if __name__ == '__main__':
    main()
