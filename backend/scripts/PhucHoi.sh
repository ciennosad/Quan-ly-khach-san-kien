#!/usr/bin/env bash
# Khôi phục database từ 1 file .sql đã sao lưu.
# Cách dùng: bash scripts/PhucHoi.sh backups/backup_xxxx.sql
set -e
cd "$(dirname "$0")/.."
export $(grep -v '^#' .env | xargs)
if [ -z "$1" ]; then echo "Vui lòng chỉ ra file backup, vd: bash scripts/PhucHoi.sh backups/backup_xxxx.sql"; exit 1; fi
psql "$DATABASE_URL" -f "$1"
echo "Đã khôi phục xong từ: $1"
