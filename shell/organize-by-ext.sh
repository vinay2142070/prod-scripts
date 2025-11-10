#!/usr/bin/env bash
# organize_by_ext.sh — move files in a directory into subfolders by extension
# Usage: ./organize_by_ext.sh [-n] [-d DEST_DIR] [SOURCE_DIR]
#  -n : dry-run (show actions, don't move)
#  -d : destination base directory (defaults to SOURCE_DIR/organized_by_ext)
set -euo pipefail
IFS=$'\n\t'

DRY_RUN=0
DEST_BASE=""
while getopts ":nd:" opt; do
  case $opt in
    n) DRY_RUN=1 ;;
    d) DEST_BASE="$OPTARG" ;;
    \?) echo "Invalid option: -$OPTARG" >&2; exit 2 ;;
    :) echo "Option -$OPTARG requires an argument." >&2; exit 2 ;;
  esac
done
shift $((OPTIND -1))

SRC_DIR="${1:-.}"
SRC_DIR:"$(cd "$SRC_DIR" && pwd)"
script_name="$(basename "$0")"
DEST_BASE="${DEST_BASE:-$SRC_DIR/organized_by_ext}"

echo "Source: $SRC_DIR"
echo "Destination base: $DEST_BASE"
[[ $DRY_RUN -eq 1 ]] && echo "(dry-run mode)"

mkdir -p "$DEST_BASE"

find "$SRC_DIR" -maxdepth 1 -type f -print0 | while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  # skip the script itself if it's in the same directory
  if [[ "$name" == "$script_name" ]]; then
    continue
  fi

  ext="${name##*.}"
  if [[ "$name" == "$ext" ]]; then
    ext="no_ext"
    extpart=""
    base="$name"
  else
    ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
    extpart=".$ext"
    base="${name%.*}"
  fi

  target_dir="$DEST_BASE/$ext"
  mkdir -p "$target_dir"

  dest="$target_dir/$name"
  if [[ -e "$dest" ]]; then
    i=1
    # find a unique filename by appending -1, -2, ...
    while [[ -e "$target_dir/${base}-$i${extpart}" ]]; do
      ((i++))
    done
    dest="$target_dir/${base}-$i${extpart}"
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "Would move: '$file' -> '$dest'"
  else
    mv -- "$file" "$dest"
    echo "Moved: '$file' -> '$dest'"
  fi
done
