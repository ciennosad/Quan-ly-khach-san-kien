#!/usr/bin/env bash
# Sao lưu toàn bộ database ra 1 file .sql có gắn ngày giờ.
# Cách dùng: bash scripts/SaoLuu.sh   (chạy trong thư mục backend, đã có .env)
set -e
cd "$(dirname "$0")/.."
export $(grep -v '^#' .env | xargs)
mkdir -p backups
FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" -f "$FILE"
echo "Đã sao lưu vào: $FILE"
