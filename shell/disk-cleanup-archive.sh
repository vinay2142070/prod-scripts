#!/usr/bin/env bash
# cleanup_disk.sh — move+compress old files until disk usage falls below threshold
# Usage: ./cleanup_disk.sh [-t target_dir] [-p percent_threshold] [-d min_age_days] [-a archive_dir] [-y]
set -euo pipefail

TARGET="."
THRESH=85       # percent
DAYS=30
ARCHIVE="./archive"
ASSUME_NO_PROMPT=0
LOGFILE="./cleanup_disk.log"

usage() {
  cat <<EOF
Usage: $0 [-t target_dir] [-p percent_threshold] [-d min_age_days] [-a archive_dir] [-y]
  -t target directory to monitor (default: .)
  -p percent threshold to reach (default: 85)
  -d move files older than N days (default: 30)
  -a archive directory (default: ./archive)
  -y assume yes (no prompt)
EOF
  exit 1
}

while getopts ":t:p:d:a:y" o; do
  case "${o}" in
    t) TARGET="${OPTARG}" ;;
    p) THRESH="${OPTARG}" ;;
    d) DAYS="${OPTARG}" ;;
    a) ARCHIVE="${OPTARG}" ;;
    y) ASSUME_NO_PROMPT=1 ;;
    *) usage ;;
  esac
done

TARGET="${TARGET%/}"
ARCHIVE="${ARCHIVE%/}"

# Prevent accidental archive inside target (would create loop)
if [[ "$ARCHIVE" == "$TARGET"* ]]; then
  echo "ERROR: archive directory ($ARCHIVE) is inside target ($TARGET). Choose a different archive." >&2
  exit 2
fi

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a "$LOGFILE"
}

get_usage_pct() {
  df -P "$TARGET" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

if [[ $ASSUME_NO_PROMPT -eq 0 ]]; then
  echo "Target: $TARGET"
  echo "Archive: $ARCHIVE"
  echo "Threshold: $THRESH%"
  echo "Files older than: $DAYS days"
  read -r -p "Proceed? [y/N] " ans
  [[ "$ans" =~ ^[Yy] ]] || { echo "Aborted."; exit 0; }
fi

mkdir -p "$ARCHIVE"
log "Starting cleanup for $TARGET, threshold ${THRESH}% (files older than ${DAYS}d will be archived into $ARCHIVE)"

usage_pct=$(get_usage_pct)
log "Current usage: ${usage_pct}%"

while [ "$usage_pct" -ge "$THRESH" ]; do
  log "Usage $usage_pct% >= threshold $THRESH% — searching for candidate files..."
  # List candidate files (size, path), largest first. Exclude archive.
  mapfile -t FILES < <(find "$TARGET" -type f -mtime +"$DAYS" ! -path "$ARCHIVE" ! -path "${ARCHIVE}/*" -printf '%s\t%p\n' 2>/dev/null | sort -nr -k1,1)

  if [ "${#FILES[@]}" -eq 0 ]; then
    log "No files found older than ${DAYS} days to free space. Exiting."
    exit 0
  fi

  freed_any=0
  for entry in "${FILES[@]}"; do
    size=${entry%%$'\t'*}
    path=${entry#*$'\t'}
    # Compute relative path to preserve directory structure
    rel="${path#$TARGET/}"
    dest="$ARCHIVE/$(date +%F)/$rel"
    mkdir -p "$(dirname "$dest")"
    log "Archiving '$path' ($size bytes) -> '$dest'"
    if mv -- "$path" "$dest"; then
      if gzip --best -- "$dest"; then
        freed_any=1
      else
        log "Warning: gzip failed for $dest"
      fi
    else
      log "Warning: mv failed for $path"
    fi
    usage_pct=$(get_usage_pct)
    log "New usage: ${usage_pct}%"
    # Stop early if we already dropped below threshold
    if [ "$usage_pct" -lt "$THRESH" ]; then
      log "Usage is below threshold ($usage_pct% < $THRESH%). Done."
      exit 0
    fi
  done

  if [ "$freed_any" -eq 0 ]; then
    log "No files could be archived (permissions or other issues). Exiting."
    exit 1
  fi

  # Re-evaluate; if still above threshold, loop and find next batch
  usage_pct=$(get_usage_pct)
done

log "Finished: usage ${usage_pct}% is below threshold ${THRESH}%."