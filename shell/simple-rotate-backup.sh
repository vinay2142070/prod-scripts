#!/usr/bin/env bash
# simple-rotate-backup.sh
# Usage: ./simple-rotate-backup.sh [TARGET_DIR] [KEEP_COUNT]
# Defaults: TARGET_DIR="." KEEP_COUNT=7

set -euo pipefail

TARGET_DIR="${1:-.}"
KEEP="${2:-7}"
BACKUP_ROOT="${HOME}/backups"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: target must be an existing directory. Got: '$TARGET_DIR'"
  exit 2
fi

# normalize path to directory
cd "$TARGET_DIR"
ABS_PATH="$(pwd -P)"        # physical path without symlinks
NAME="$(basename "$ABS_PATH")"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${NAME}"

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/${NAME}-${TIMESTAMP}.tar.gz"

echo "Creating backup: $BACKUP_FILE"
# create tar.gz of the target directory (preserve directory name)
tar -czf "$BACKUP_FILE" -C "$(dirname "$ABS_PATH")" "$NAME"

# Rotate: keep only newest $KEEP backups
mapfile -t files < <(ls -1t -- "$BACKUP_DIR"/"$NAME"-*.tar.gz 2>/dev/null || true)

if (( ${#files[@]} > KEEP )); then
  for ((i=KEEP; i<${#files[@]}; i++)); do
    echo "Removing old backup: ${files[i]}"
    rm -- "${files[i]}"
  done
else
  echo "No old backups to remove (keeping $KEEP)."
fi

echo "Done. Backups stored in: $BACKUP_DIR (keeping last $KEEP)."