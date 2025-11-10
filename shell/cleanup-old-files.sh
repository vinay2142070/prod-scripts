#!/usr/bin/env bash
# cleanup-old.sh — find files older than N days, optionally archive and/or delete them
# Usage: ./cleanup-old.sh [-d DAYS] [-o ARCHIVE_DIR] [-f] [-v] [paths...]
# Defaults: DAYS=30, dry-run (no deletion) unless -f is passed.

set -euo pipefail

DAYS=30
ARCHIVE_DIR=""
FORCE=false
VERBOSE=false
LOG_FILE="${HOME:-.}/.local/share/cleanup-old.log"

usage() {
  cat <<EOF
Usage: $0 [-d DAYS] [-o ARCHIVE_DIR] [-f] [-v] [paths...]
  -d DAYS        Files older than DAYS (default: 30)
  -o DIR         Create a .tar.gz archive of found files in DIR before deleting
  -f             Force: actually delete files (default is dry-run)
  -v             Verbose output
If no paths are given, current directory (.) is used.
EOF
  exit 1
}

# parse options
while getopts ":d:o:fv" opt; do
  case "$opt" in
    d) DAYS="$OPTARG" ;;
    o) ARCHIVE_DIR="$OPTARG" ;;
    f) FORCE=true ;;
    v) VERBOSE=true ;;
    *) usage ;;
  esac
done
shift $((OPTIND-1))
PATHS=("$@")
if [ "${#PATHS[@]}" -eq 0 ]; then
  PATHS=(.)
fi

log() {
  echo "[$(date --iso-8601=seconds)] $*" >> "$LOG_FILE"
  $VERBOSE && echo "$@"
}

# build find arguments safely
FIND_ARGS=()
for p in "${PATHS[@]}"; do
  FIND_ARGS+=("$p")
done

# count matched files (robust for filenames with newlines)
count=0
while IFS= read -r -d '' _file; do
  count=$((count+1))
done < <(find "${FIND_ARGS[@]}" -type f -mtime +"$DAYS" -print0)

if [ "$count" -eq 0 ]; then
  echo "No files older than $DAYS days found in: ${PATHS[*]}"
  exit 0
fi

echo "Found $count file(s) older than $DAYS days in: ${PATHS[*]}"
log "Found $count file(s) older than $DAYS days in: ${PATHS[*]}"

# optional archive
if [ -n "$ARCHIVE_DIR" ]; then
  mkdir -p "$ARCHIVE_DIR"
  ts=$(date +%Y%m%d-%H%M%S)
  ARCHIVE_PATH="$ARCHIVE_DIR/cleanup-$ts.tar.gz"
  echo "Preparing archive: $ARCHIVE_PATH"
  log "Preparing archive: $ARCHIVE_PATH (dry-run=$(! $FORCE && echo true || echo false))"

  if [ "$FORCE" = false ]; then
    echo "Dry-run: would create archive containing the matched files."
    # Show a sampling of matching files
    echo "Sample matches:"
    find "${FIND_ARGS[@]}" -type f -mtime +"$DAYS" -print | sed -n '1,20p'
  else
    # Use process substitution + GNU tar to safely handle any filenames (including newlines)
    tar --null -T <(find "${FIND_ARGS[@]}" -type f -mtime +"$DAYS" -print0) -czf "$ARCHIVE_PATH"
    echo "Archived to: $ARCHIVE_PATH"
    log "Archived to: $ARCHIVE_PATH"
  fi
fi

# deletion step
if [ "$FORCE" = false ]; then
  echo "Dry-run: no files will be deleted. Rerun with -f to delete."
  log "Dry-run ended (no deletion)."
  exit 0
fi

echo "Deleting matched files..."
log "Deleting matched files..."
# delete safely handling special filenames
find "${FIND_ARGS[@]}" -type f -mtime +"$DAYS" -print0 | xargs -0 --no-run-if-empty rm -v --
log "Deletion completed."

exit 0
