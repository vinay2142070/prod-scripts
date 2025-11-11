#!/usr/bin/env bash
# smart-cleanup.sh - Move files older than N days to a recycle folder (safe cleanup)
# Usage: ./smart-cleanup.sh [-d DAYS] [-D "dir1 dir2"] [-n] [-l logfile]
set -eo pipefail

dAYS=7
DRYRUN=0
LOGFILE=""
DIRS="/tmp /var/tmp $HOME/.cache"

print_help() {
  cat <<EOF
Usage: $0 [-d DAYS] [-D "dir1 dir2"] [-n] [-l logfile]
  -d DAYS        Files older than DAYS (default: 7)
  -D "dirs"      Space-separated directories to clean (default: /tmp /var/tmp $HOME/.cache)
  -n             Dry-run (show what would be moved)
  -l logfile     Append actions to logfile
  -h             Show this help
EOF
}

# Parse options
while getopts ":d:D:nl:h" opt; do
  case $opt in
    d) DAYS=$OPTARG ;;
    D) DIRS=$OPTARG ;;
    n) DRYRUN=1 ;;
    l) LOGFILE=$OPTARG ;;
    h) print_help; exit 0 ;;
    \?) echo "Invalid option: -$OPTARG" >&2; print_help; exit 2 ;;
    :) echo "Option -$OPTARG requires an argument." >&2; exit 2 ;;
  esac
done

timestamp() { date +"%Y-%m-%d %H:%M:%S"; }
log() {
  local msg="[$(timestamp)] $*"
  echo "$msg"
  [[ -n "$LOGFILE" ]] && { mkdir -p "$(dirname "$LOGFILE")"; echo "$msg" >> "$LOGFILE"; }
}

RECYCLEROOT="$(date +%Y%m%d-%H%M%S)"
if [[ $EUID -eq 0 ]]; then
  RECYCLE_BASE="/var/tmp/cleanup-${RECYCLEROOT}"
else
  RECYCLE_BASE="$HOME/.local/share/cleanup-${RECYCLEROOT}"
fi

echo "Smart Cleanup - moving files older than $DAYS days"
[[ $DRYRUN -eq 1 ]] && echo "DRY RUN enabled (no files will actually be moved)"
log "Starting cleanup (days=$DAYS) for dirs: $DIRS"

# For each directory, find files/directories older than DAYS and move them preserving path
IFS=$' \t' read -r -a DIR_ARR <<< "$DIRS"
for base in "${DIR_ARR[@]}"; do
  [[ -d "$base" ]] || { log "Skipping non-directory: $base"; continue; }
  # Use find to locate files and directories (non-empty directories will be matched by files inside)
  while IFS= read -r -d '' entry; do
    # compute relative path without leading slash to reconstruct under recycle
    abs=$(realpath -s "$entry")
    rel="${abs#/}"
    dest="$RECYCLE_BASE/$rel"
    if [[ $DRYRUN -eq 1 ]]; then
      log "[DRY] Would move: $abs -> $dest"
    else
      mkdir -p "$(dirname "$dest")"
      if mv -- "$abs" "$dest"; then
        log "Moved: $abs -> $dest"
      else
        log "Failed to move: $abs"
      fi
    fi
  done < <(find "$base" -mindepth 1 -mtime +"$DAYS" -print0 2>/dev/null)
done

if [[ $DRYRUN -eq 0 ]]; then
  log "Cleanup completed. Recycle folder: $RECYCLE_BASE"
  echo "Moved files are in: $RECYCLE_BASE"
else
  log "Dry run complete. No files were moved."
fi
