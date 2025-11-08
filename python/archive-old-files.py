#!/usr/bin/env python3
import argparse
import os
import time
import shutil

def parse_args():
    p = argparse.ArgumentParser(description="Archive old, large files from a directory into an archive destination.")
    p.add_argument("--root", required=True, help="Root directory to scan")
    p.add_argument("--dest", required=True, help="Archive destination directory (outside the root)")
    p.add_argument("--min-size", type=float, default=100.0, help="Minimum file size in MB to archive (default 100)")
    p.add_argument("--older-days", type=int, default=30, help="Files modified more than X days ago (default 30)")
    p.add_argument("--exts", default=".log,.tmp,.bak,.iso,.zip", help="Comma-separated list of extensions to consider (including dot), e.g. .log,.tmp")
    p.add_argument("--execute", action="store_true", help="Actually move files. By default, runs in dry-run mode.")
    p.add_argument("--verbose", action="store_true", help="Verbose output")
    return p.parse_args()

def is_match(ext, allowed):
    return ext.lower() in allowed

def main():
    args = parse_args()
    root = os.path.abspath(args.root)
    dest = os.path.abspath(args.dest)

    # safety: ensure dest not inside root
    if dest.startswith(root.rstrip(os.sep) + os.sep):
        raise SystemExit("Destination must be outside the root to avoid recursive moves.")

    if not os.path.isdir(root):
        raise SystemExit(f"Root directory does not exist: {root}")
    os.makedirs(dest, exist_ok=True)

    ext_set = set(e.strip().lower() for e in args.exts.split(",") if e.strip())
    min_bytes = max(0, int(args.min_size * 1024 * 1024))
    older_seconds = args.older_days * 86400

    moved = 0
    skipped = 0
    errors = 0

    now = time.time()

    def unique_path(path):
        base, ext = os.path.splitext(path)
        candidate = path
        i = 1
        while os.path.exists(candidate):
            candidate = f"{base}_{i}{ext}"
            i += 1
        return candidate

    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            ext = os.path.splitext(fname)[1].lower()
            if not is_match(ext, ext_set):
                if args.verbose:
                    print(f"Skipping (not in ext list): {fpath}")
                continue
            try:
                st = os.stat(fpath)
            except OSError:
                if args.verbose:
                    print(f"Skipping (stat failed): {fpath}")
                skipped += 1
                continue
            size = st.st_size
            mtime = st.st_mtime
            if size < min_bytes:
                if args.verbose:
                    print(f"Skipping (small): {fpath} ({size/1_048_576:.2f} MB)")
                skipped += 1
                continue
            if (now - mtime) < older_seconds:
                if args.verbose:
                    print(f"Skipping (not old enough): {fpath}")
                skipped += 1
                continue

            rel = os.path.relpath(fpath, root)
            dest_path = os.path.join(dest, rel)
            dest_dir = os.path.dirname(dest_path)
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = unique_path(dest_path)

            if args.execute:
                try:
                    shutil.move(fpath, dest_path)
                    if args.verbose:
                        print(f"Moved: {fpath} -> {dest_path}")
                    moved += 1
                except Exception as e:
                    if args.verbose:
                        print(f"Error moving {fpath}: {e}")
                    errors += 1
            else:
                print(f"[DRY-RUN] would move: {fpath} -> {dest_path}")

    print(f"Summary: moved={moved}, skipped={skipped}, errors={errors}")

if __name__ == "__main__":
    main()
