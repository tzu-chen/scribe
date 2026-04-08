#!/usr/bin/env bash
# Daily backup of scribe.db using SQLite's .backup command (WAL-safe).
# Keeps the last 7 backups, removing older ones.

set -euo pipefail

DB_PATH="/home/tzuchen/Codes/scribe/data/scribe.db"
BACKUP_DIR="/home/tzuchen/Codes/scribe/data/backups"
KEEP=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/scribe_${TIMESTAMP}.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove old backups beyond KEEP count
ls -1t "$BACKUP_DIR"/scribe_*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --
echo "Retained latest $KEEP backups."
