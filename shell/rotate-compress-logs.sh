#!/usr/bin/env bash
# rotate-compress-logs.sh
# Usage: ./rotate-compress-logs.sh [DIR=./logs] [OLDER_THAN_DAYS=7] [RETENTION_DAYS=30] [--dry-run]
set -euo pipefail

DIR="${1:-./logs}"
OLDER_DAYS="${2:-7}"
RETENTION_DAYS="${3:-30}"
DRY_RUN=false
if [[ "${4:-}" == "--dry-run" ]] || [[ "${5:-}" == "--dry-run" ]]; then DRY_RUN=true; fi

mkdir -p "$DIR"

# If directory is empty, create demo logs so the script is runnable as-is
if [[ -z "$(find "$DIR" -maxdepth 1 -type f -print -quit)" ]]; then
  echo "No files in $DIR — creating demo log files."
  printf "line1\nline2\n" > "$DIR/app.log"
  printf "old log\n" > "$DIR/old.log"
  # set old.log mtime to 10 days ago for demo
  touch -d "10 days ago" "$DIR/old.log" || touch -t "$(date -d '10 days ago' +%Y%m%d%H%M)" "$DIR/old.log" 2>/dev/null || true
fi

echo "Directory: $DIR"
echo "Archiving files older than $OLDER_DAYS days; removing archives older than $RETENTION_DAYS days."
$DRY_RUN && echo "(DRY RUN mode — no changes will be made)"

# Find regular files (non-recursive) not already gzipped and older than threshold
while IFS= read -r -d '' file; do
  # skip .gz files just in case
  if [[ "$file" == *.gz ]]; then
    continue
  fi

  ts="$(date +%Y%m%d%H%M%S)"
  base="$(basename "$file")"
  archive="$DIR/${base}.${ts}.gz"

  if $DRY_RUN; then
    echo "[DRY] Would: gzip -c \"$file\" > \"$archive\" && truncate -s 0 \"$file\""
  else
    echo "Archiving: $file -> $archive"
    # create compressed snapshot of current contents, then truncate original
    if gzip -c --best "$file" > "$archive"; then
      # truncate file so writers can continue writing to same path
      : > "$file"
    else
      echo "Failed to compress $file" >&2
    fi
  fi
done < <(find "$DIR" -maxdepth 1 -type f -mtime +"$OLDER_DAYS" -print0)

# Prune old archives
if $DRY_RUN; then
  echo "[DRY] Would: find \"$DIR\" -maxdepth 1 -type f -name '*.gz' -mtime +$RETENTION_DAYS -print"
else
  echo "Pruning archives older than $RETENTION_DAYS days..."
  find "$DIR" -maxdepth 1 -type f -name '*.gz' -mtime +"$RETENTION_DAYS" -print -delete || true
fi

echo "Done."