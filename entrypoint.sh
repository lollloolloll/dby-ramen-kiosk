#!/bin/bash
set -e

# root로 실행되는 부분
mkdir -p /app/data /app/public/uploads/promotion /app/public/uploads/consent
chown -R nextjs:nodejs /app/data /app/public/uploads
chmod -R 777 /app/public/uploads

DB_FILE="/app/data/local.db"

if [ ! -f "$DB_FILE" ] || [ ! -s "$DB_FILE" ]; then
  echo "Creating database..."
  sqlite3 "$DB_FILE" "VACUUM;"
fi

chmod -R 777 /app/data

# ===== BEGIN 일회성 마이그레이션: 아동 인원 버킷 추가 (2026-10) =====
# 운영 DB에는 이미 1달치 방문 기록이 쌓여 있어서 drizzle-kit push에 맡기면
# "테이블을 비워야 한다"고 요구한다. 그래서 컬럼만 먼저 무손실로 추가해 두고
# push가 할 일이 없게 만든다.
#
# - 멱등(idempotent): 이미 적용됐으면 아무 것도 하지 않는다
# - 무손실: ALTER TABLE ADD COLUMN만 사용 (테이블 재생성/삭제 없음)
# - DEFAULT 0 이 기존 행을 자동으로 채운다 (아동 집계 이전 방문 = 0명)
# - NOT NULL을 걸지 않는다: drizzle/schema.ts의 nullable 정의와 일치시켜
#   이후 push가 차이를 발견하지 않도록 한다
#
# 배포 후 이 블록은 삭제해도 된다 (END 마커까지).
migrate_add_child_headcount() {
  # 테이블이 아직 없는 신규 DB라면 push가 컬럼까지 같이 만들어 준다
  if ! sqlite3 "$DB_FILE" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='visit_sessions';" | grep -q 1; then
    echo "[migrate] visit_sessions 테이블 없음 — 신규 DB이므로 건너뜀"
    return 0
  fi

  local existing
  existing=$(sqlite3 "$DB_FILE" "SELECT name FROM pragma_table_info('visit_sessions');")

  if echo "$existing" | grep -qx "child_male" && echo "$existing" | grep -qx "child_female"; then
    echo "[migrate] 아동 컬럼 이미 존재 — 건너뜀"
    return 0
  fi

  local rows
  rows=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM visit_sessions;")
  echo "[migrate] 아동 컬럼 추가 시작 (visit_sessions ${rows}건)"

  # 변경 전 백업 — 문제가 생기면 이 파일로 되돌릴 수 있다
  local backup="/app/data/backup-before-child-headcount-$(date +%Y%m%d-%H%M%S).db"
  sqlite3 "$DB_FILE" ".backup '$backup'"
  echo "[migrate] 백업 생성: $backup"

  echo "$existing" | grep -qx "child_male" ||     sqlite3 "$DB_FILE" "ALTER TABLE visit_sessions ADD COLUMN child_male integer DEFAULT 0;"
  echo "$existing" | grep -qx "child_female" ||     sqlite3 "$DB_FILE" "ALTER TABLE visit_sessions ADD COLUMN child_female integer DEFAULT 0;"

  # 검증 1) 행수 보존
  local rows_after
  rows_after=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM visit_sessions;")
  if [ "$rows" != "$rows_after" ]; then
    echo "[migrate] !! 행수가 바뀜 ($rows -> $rows_after). 백업: $backup"
    exit 1
  fi

  # 검증 2) 총인원 = 버킷 합계 가 깨진 행이 없는지 (기존 데이터 정합성)
  local broken
  broken=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM visit_sessions WHERE total_count <> COALESCE(child_male,0)+COALESCE(child_female,0)+youth_male+youth_female+adult_male+adult_female;")
  echo "[migrate] 완료 — ${rows_after}건 보존, 총인원 불일치 ${broken}건"
  if [ "$broken" != "0" ]; then
    echo "[migrate] 참고: 불일치 행은 이번 변경 때문이 아니라 기존 데이터 문제입니다(앱 동작엔 영향 없음)."
  fi
}
migrate_add_child_headcount
# ===== END 일회성 마이그레이션: 아동 인원 버킷 추가 (2026-10) =====

echo "Running migrations using Drizzle Kit..."
export DATABASE_URL="file:/app/data/local.db"
npm run db:push

echo "Tables in database:"
sqlite3 "$DB_FILE" ".tables"

echo "Starting Next.js..."
exec gosu nextjs node server.js