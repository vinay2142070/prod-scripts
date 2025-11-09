#!/usr/bin/env python3
"""
Cleanup old files utility.

- Deletes files older than N days in a directory recursively.
- Supports filtering by extension.
- Dry-run by default. Use --execute to actually remove.
"""

import argparse
import sys
import time
from pathlib import Path

def find_old_files(root: Path, days: int, ext_filters=None):
    cutoff = time.time() - days * 86400
    old_files = []
    exts = set(e.lower() for e in ext_filters) if ext_filters else None

    for p in root.rglob('*'):
        if p.is_file() and not p.is_symlink():
            if exts is None or p.suffix.lower() in exts:
                try:
                    mtime = p.stat().st_mtime
                except OSError:
                    continue
                if mtime < cutoff:
                    old_files.append(p)
    return old_files

def main():
    parser = argparse.ArgumentParser(description="Cleanup old files older than N days.")
    parser.add_argument('dir', help='Target directory to clean')
    parser.add_argument('--days', type=int, default=7,
                        help='Delete files older than this many days (default: 7)')
    parser.add_argument('--ext', nargs='*', help='Extensions to include, e.g. .log .txt')
    parser.add_argument('--execute', action='store_true',
                        help='Actually delete files (default is dry-run)')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Increase output verbosity')
    args = parser.parse_args()

    root = Path(args.dir).resolve()
    if not root.exists() or not root.is_dir():
        print(f"Error: '{root}' is not a valid directory.", file=sys.stderr)
        sys.exit(1)

    old_files = find_old_files(root, args.days, args.ext)
    if not old_files:
        print("No files found to delete.")
        return 0

    action = "delete" if args.execute else "list (dry-run)"
    print(f"Found {len(old_files)} file(s) to {action}:")
    for p in sorted(old_files):
        try:
            mtime = time.ctime(p.stat().st_mtime)
        except OSError:
            mtime = "unavailable"
        print(f"- {p}  (mtime: {mtime})")

    if not args.execute:
        print("\nDry-run complete. Re-run with --execute to perform deletion.")
        return 0

    # Execute deletion
    for p in old_files:
        try:
            p.unlink()
            if args.verbose:
                print(f"Deleted: {p}")
        except OSError as e:
            print(f"Error deleting {p}: {e}", file=sys.stderr)

    print("Cleanup complete.")
    return 0

if __name__ == '__main__':
    sys.exit(main())
