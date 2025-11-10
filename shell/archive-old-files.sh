#!/usr/bin/env bash
# archive-cleanup.sh
# Archives files older than a given number of days into target/archives/YYYYMMDD (gzip)
# and removes archive folders older than a retention period.
set -euo pipefail
IFS=$'\n\t'

TARGET="${1:-./logs}"       # default target directory
OLDER="${2:-7}"             # default: archive files older than 7 days
DELETE_AFTER="${3:-30}"     # default: delete archive dirs older than 30 days

if [ ! -d "$TARGET" ]; then
  echo "Target directory does not exist: $TARGET"
  exit 1
fi

ARCHIVE_ROOT="$TARGET/archives"
TODAY="$(date +%Y%m%d)"
ARCHIVE_DIR="$ARCHIVE_ROOT/$TODAY"

mkdir -p "$ARCHIVE_DIR"

# Find regular files older than $OLDER days, skip already-archived dirs and .gz files.
find "$TARGET" -mindepth 1 -type f -mtime +"$OLDER" ! -path "$ARCHIVE_ROOT/*" ! -name '*.gz' -print0 \
| while IFS= read -r -d '' file; do
  # Preserve relative path under the archive dir to avoid name collisions.
  rel="${file#$TARGET/}"
  dest_dir="$ARCHIVE_DIR/$(dirname "$rel")"
  mkdir -p "$dest_dir"
  gzip -9 -c "$file" > "$dest_dir/$(basename "$rel").gz"
  echo "Archived: $file -> $dest_dir/$(basename "$rel").gz"
  rm -f "$file"
done

# Remove archive directories older than $DELETE_AFTER days
find "$ARCHIVE_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$DELETE_AFTER" -print0 \
| while IFS= read -r -d '' olddir; do
  echo "Removing old archive: $olddir"
  rm -rf "$olddir"
done

echo "Archive cleanup complete. Today's archive: $ARCHIVE_DIR"