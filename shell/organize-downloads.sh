#!/usr/bin/env bash
# organize-downloads.sh
# Move files from a downloads directory into categorized folders by date,
# deduplicate identical files (by SHA256), and avoid name collisions.
# Usage: ./organize-downloads.sh [-n|--dry-run] [-d|--dir DIR]

set -euo pipefail

# Defaults
DOWNLOADS="${HOME}/Downloads"
DRY_RUN=0

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift;;
    -d|--dir) DOWNLOADS="$2"; shift 2;;
    -h|--help) echo "Usage: $0 [-n|--dry-run] [-d|--dir DIR]"; exit 0;;
    *) echo "Unknown arg: $1"; echo "Usage: $0 [-n|--dry-run] [-d|--dir DIR]"; exit 1;;
  esac
done

# Choose checksum tool (shasum is common on macOS; sha256sum on many Linuxes)
if command -v shasum >/dev/null 2>&1; then
  SHASUM="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHASUM="sha256sum"
else
  echo "No SHA256 checksum tool found (shasum or sha256sum required)"; exit 1
fi

declare -A EXT_CATEGORY=(
  [jpg]=Images [jpeg]=Images [png]=Images [gif]=Images [webp]=Images [bmp]=Images [heic]=Images
  [pdf]=Documents [doc]=Documents [docx]=Documents [ppt]=Documents [pptx]=Documents [xls]=Documents [xlsx]=Documents [txt]=Documents [md]=Documents
  [zip]=Archives [tar]=Archives [gz]=Archives [bz2]=Archives [7z]=Archives [rar]=Archives
  [mp4]=Videos [mkv]=Videos [mov]=Videos [avi]=Videos [wmv]=Videos
  [mp3]=Audio [wav]=Audio [ogg]=Audio [flac]=Audio
  [py]=Code [js]=Code [html]=Code [css]=Code [go]=Code [rs]=Code [java]=Code [c]=Code [cpp]=Code [sh]=Code
)

log() { printf '%b\n' "$*"; }
do_move() {
  if [[ $DRY_RUN -eq 1 ]]; then
    log "DRY-RUN: mv -- \"$1\" \"$2\""
  else
    mv -- "$1" "$2"
  fi
}


do_rm() {
  if [[ $DRY_RUN -eq 1 ]]; then
    log "DRY-RUN: rm -- \"$1\""
  else
    rm -- "$1"
  fi
}

# Process files (only top-level files)
shopt -s nullglob
while IFS= read -r -d '' file; do
  # skip directories and hidden files
  base="$(basename "$file")"
  [[ "$base" == .* ]] && continue
  [[ -f "$file" ]] || continue

  ext="${base##*.}"
  ext_lc="${ext,,}"
  category="${EXT_CATEGORY[$ext_lc]:-Others}"

  date_dir="$(date -r "$file" +%F 2>/dev/null || date +%F)"
  target_dir="$DOWNLOADS/$category/$date_dir"
  mkdir -p "$target_dir"

  # target path
  target="$target_dir/$base"

  # If target exists, check checksum
  if [[ -e "$target" ]]; then
    src_sum="$($SHASUM < "$file" | awk '{print $1}')"
    tgt_sum="$($SHASUM < "$target" | awk '{print $1}')"
    if [[ "$src_sum" == "$tgt_sum" ]]; then
      log "Duplicate found, removing source: $base -> $category/$date_dir (identical)"
      do_rm "$file"
      continue
    else
      # find a non-conflicting name: name (1).ext, (2), ...
      name="${base%.*}"
      i=1
      while :; do
        newbase="${name} (${i}).${ext}"
        newtarget="$target_dir/$newbase"
        if [[ ! -e "$newtarget" ]]; then
          target="$newtarget"
          break
        fi
        ((i++))
      done
      log "Name collision: renaming to $newbase"
    fi
  fi

  log "Moving: $base -> ${target#$DOWNLOADS/}"
  do_move "$file" "$target"

done < <(find "$DOWNLOADS" -maxdepth 1 -type f -print0)

log "Done."