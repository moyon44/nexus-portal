#!/bin/bash

# Restore script for Portail database
# Usage: ./restore-portail.sh <backup-file.sql.gz>

BACKUP_FILE="${1:-}"
DB_USER="portail"
DB_NAME="portail_db"
DB_CONTAINER="nexus-portal-db"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh $(dirname "$0")/backups/ | tail -10
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite your current database!"
read -p "Continue? (yes/no): " response
if [ "$response" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "Restoring from: $BACKUP_FILE"

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    TEMP_FILE="/tmp/restore_$(date +%s).sql"
    echo "Decompressing..."
    zcat "$BACKUP_FILE" > "$TEMP_FILE"
    RESTORE_FILE="$TEMP_FILE"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Drop and recreate database
echo "Dropping existing database..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "Creating new database..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

# Restore the backup
echo "Restoring data..."
cat "$RESTORE_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "✓ Restore completed successfully!"
else
    echo "✗ Restore failed!"
    exit 1
fi

# Clean up temp file
if [ -n "$TEMP_FILE" ]; then
    rm "$TEMP_FILE"
fi
