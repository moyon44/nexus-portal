#!/bin/bash

# Backup script for Portail database
# Saves to backups/ next to this script, keeping 30 days

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)/backups"
DB_USER="portail"
DB_NAME="portail_db"
DB_CONTAINER="nexus-portal-db"
BACKUP_FILE="$BACKUP_DIR/portail_backup_$(date +%Y%m%d_%H%M%S).sql"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting Portail database backup..."

# Dump the database
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] ✓ Backup successful: $BACKUP_FILE"
    ls -lh "$BACKUP_FILE"

    # Compress the backup
    gzip "$BACKUP_FILE"
    echo "[$(date)] ✓ Compressed: ${BACKUP_FILE}.gz"

    # Delete old backups (older than 30 days)
    echo "[$(date)] Cleaning old backups (older than $RETENTION_DAYS days)..."
    find "$BACKUP_DIR" -name "portail_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

    echo "[$(date)] Backup completed successfully!"
else
    echo "[$(date)] ✗ Backup failed!"
    exit 1
fi
