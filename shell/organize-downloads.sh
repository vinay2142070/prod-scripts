#!/usr/bin/env bash
# organize_downloads.sh — Organize files in a directory by type
# Usage: ./organize_downloads.sh [target_dir] [--dry-run]
set -euo pipefail

TARGET="${1:-$HOME/Downloads}"
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
  esac
done

category_for() {
  local ext="$1"
  ext="${ext,,}"  # lowercase (bash 4+)
  case "$ext" in
    jpg|jpeg|png|gif|bmp|tiff|webp) echo "Images" ;;
    mp4|mkv|mov|avi|webm|flv) echo "Videos" ;;
    mp3|wav|flac|aac) echo "Audio" ;;
    pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|odt) echo "Documents" ;;
    zip|tar|gz|tgz|bz2|7z|rar) echo "Archives" ;;
    py|js|go|rs|java|c|cpp|sh|ps1|rb|php|ts) echo "Code" ;;
    svg|ico|eps) echo "Graphics" ;;
    *) echo "Others" ;;
  esac
}

unique_dest() {
  local destdir="$1" base="$2"
  local name ext candidate i
  if [ ! -e "$destdir/$base" ]; then
    printf '%s\n' "$destdir/$base"
    return
  fi
  # split name/ext
  if [[ "$base" == *.* ]]; then
    name="${base%.*}"; ext=".${base##*.}"
  else
    name="$base"; ext=""
  fi
  i=1
  while :; do
    candidate="$destdir/${name}_$i$ext"
    [ ! -e "$candidate" ] && { printf '%s\n' "$candidate"; return; }
    i=$((i+1))
  done
}

if [ ! -d "$TARGET" ]; then
  echo "Target directory does not exist: $TARGET" >&2
  exit 2
fi

shopt -s nullglob
for path in "$TARGET"/*; do
  [ -f "$path" ] || continue
  base="$(basename -- "$path")"
  # extract extension (no dot -> empty)
  if [[ "$base" == *.* ]]; then
    ext="${base##*.}"
  else
    ext=""
  fi
  cat="$(category_for "$ext")"
  destdir="$TARGET/$cat"
  mkdir -p "$destdir"
  dest="$(unique_dest "$destdir" "$base")"
  if [ "$DRY_RUN" = true ]; then
    printf "Would move: %s -> %s\n" "$path" "$dest"
  else
    mv -n -- "$path" "$dest" && printf "Moved: %s -> %s\n" "$path" "$dest"
  fi
done
