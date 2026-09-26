#!/usr/bin/env bash
# =============================================================================
# BPCD e-Portfolio — auto deploy (ดึงโค้ดจาก git แล้วอัปเดตอัตโนมัติ)
# ถูกเรียกโดย systemd timer "<APP_NAME>-update.timer" (ติดตั้งโดย install.sh ขั้นที่ 7)
#
#   bash auto-update.sh           # ตรวจ origin/<branch> ถ้ามี commit ใหม่ -> deploy
#   bash auto-update.sh --force   # deploy ใหม่แม้ไม่มี commit ใหม่
#
# ขั้นตอน: git fetch -> rsync ไป APP_DIR -> npm ci (ถ้า lockfile เปลี่ยน)
#          -> restart service -> health check -> ถ้าไม่ผ่าน rollback ไป commit เดิม
# ไม่แตะ .env และ uploads/
# =============================================================================
set -euo pipefail

APP_NAME="${APP_NAME:-bpcd-eportfolio}"
APP_DIR="${APP_DIR:-/opt/bpcd-eportfolio}"
APP_USER="${APP_USER:-bpcd}"
APP_PORT="${APP_PORT:-3000}"
SRC_REPO="${SRC_REPO:-/opt/$APP_NAME-src}"   # git clone ของ repo
BRANCH="${BRANCH:-main}"
FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1

log() { echo "[auto-update] $*"; }

exec 9>"/run/$APP_NAME-update.lock"
flock -n 9 || { log "มีการ deploy ทำงานอยู่แล้ว — ข้าม"; exit 0; }

cd "$SRC_REPO"
git fetch --quiet origin "$BRANCH"
OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse "origin/$BRANCH")"
if [ "$OLD" = "$NEW" ] && [ "$FORCE" = 0 ]; then exit 0; fi

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

deploy() {  # deploy <commit>
  git reset --quiet --hard "$1"
  local lock_changed=1
  [ -f "$APP_DIR/package-lock.json" ] && cmp -s app/package-lock.json "$APP_DIR/package-lock.json" && lock_changed=0
  rsync -a --delete --exclude node_modules/ --exclude uploads/ --exclude .env app/ "$APP_DIR"/
  if [ "$lock_changed" = 1 ] || [ ! -d "$APP_DIR/node_modules" ]; then
    (cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
  fi
  chown -R root:root "$APP_DIR"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR/uploads"
  [ -f "$APP_DIR/.env" ] && { chown root:"$APP_USER" "$APP_DIR/.env"; chmod 640 "$APP_DIR/.env"; }
  systemctl restart "$APP_NAME"
}

log "deploy ${OLD:0:7} -> ${NEW:0:7}: $(git log -1 --format=%s "$NEW")"
deploy "$NEW"
if healthy; then
  log "สำเร็จ — แอปทำงานที่ ${NEW:0:7}"
  exit 0
fi

log "health check ไม่ผ่าน — rollback ไป ${OLD:0:7}"
journalctl -u "$APP_NAME" -n 20 --no-pager -o cat | sed 's/^/  | /' || true
deploy "$OLD"
healthy && log "rollback สำเร็จ" || log "rollback แล้วแต่แอปยังไม่ทำงาน — ตรวจ: journalctl -u $APP_NAME"
exit 1
