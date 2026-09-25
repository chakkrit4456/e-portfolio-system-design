#!/usr/bin/env bash
# =============================================================================
# BPCD e-Portfolio — สคริปต์ติดตั้งบน production server
# ทดสอบสำหรับ: Debian 13 (trixie) / TurnKey Linux Node.js appliance
#
# วิธีใช้ (รันด้วย root จากโฟลเดอร์ใดก็ได้ในซอร์สโค้ด):
#   bash app/deploy/install.sh            # ติดตั้ง/อัปเดตแบบถามทีละขั้น
#   bash app/deploy/install.sh --check    # ตรวจสอบอย่างเดียว ไม่แก้ไขอะไร
#   bash app/deploy/install.sh --yes      # ตอบ "ใช่" ทุกคำถาม (ใช้ค่าเริ่มต้น)
#
# สิ่งที่สคริปต์ทำ (ทุกขั้นถามก่อนและรันซ้ำได้อย่างปลอดภัย):
#   1. ตรวจ OS และแพ็คเกจพื้นฐาน (curl, rsync, openssl, ...)
#   2. ตรวจ Node.js >= 20.6 และ npm
#   3. ตรวจ/ติดตั้ง PostgreSQL และสร้างผู้ใช้+ฐานข้อมูล UTF8
#   4. คัดลอกโค้ดไป APP_DIR, ติดตั้ง dependencies, สร้าง .env (ไม่ทับของเดิม)
#   5. สร้าง systemd service และเริ่มระบบ, ตั้ง/รีเซ็ตรหัสผ่าน admin
#   6. ตั้ง nginx reverse proxy (+ แนะนำ HTTPS)
# =============================================================================
set -euo pipefail

# ---------- ค่าที่ปรับได้ (override ด้วย environment variable) ----------
APP_NAME="${APP_NAME:-bpcd-eportfolio}"
APP_DIR="${APP_DIR:-/opt/bpcd-eportfolio}"
APP_USER="${APP_USER:-bpcd}"
APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-bpcd_eportfolio}"
DB_USER="${DB_USER:-bpcd}"
NODE_MIN="20.6.0"
BASE_PKGS=(curl ca-certificates rsync openssl gnupg)

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # โฟลเดอร์ app/
CHECK_ONLY=0
ASSUME_YES=0
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "ไม่รู้จักตัวเลือก: $a" >&2; exit 2 ;;
  esac
done

# ---------- helpers ----------
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; B=$'\e[1;36m'; N=$'\e[0m'; else G= Y= R= B= N=; fi
ok()   { echo "  ${G}[OK]${N}   $*"; }
warn() { echo "  ${Y}[!!]${N}   $*"; }
bad()  { echo "  ${R}[ขาด]${N} $*"; }
info() { echo "         $*"; }
step() { echo; echo "${B}== $* ==${N}"; }
die()  { echo "${R}ผิดพลาด:${N} $*" >&2; exit 1; }
PROBLEMS=0
problem() { bad "$*"; PROBLEMS=$((PROBLEMS + 1)); }

# ask "คำถาม" [Y|N]  -> return 0 ถ้าตอบใช่
ask() {
  local def="${2:-Y}" ans
  [ "$CHECK_ONLY" = 1 ] && return 1
  [ "$ASSUME_YES" = 1 ] && { [ "$def" = Y ]; return; }
  local hint="[Y/n]"; [ "$def" = N ] && hint="[y/N]"
  read -r -p "  ?  $1 $hint " ans || true
  ans="${ans:-$def}"
  [[ "$ans" =~ ^[Yyใ] ]]
}
# prompt "คำถาม" "ค่าเริ่มต้น" -> echo คำตอบ
prompt() {
  local ans
  if [ "$ASSUME_YES" = 1 ] || [ "$CHECK_ONLY" = 1 ]; then echo "$2"; return; fi
  read -r -p "  ?  $1 [$2] " ans || true
  echo "${ans:-$2}"
}
have() { command -v "$1" >/dev/null 2>&1; }
pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "install ok installed"; }
ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
as_pg() { runuser -u postgres -- "$@"; }
APT_UPDATED=0
apt_install() {
  [ "$APT_UPDATED" = 1 ] || { apt-get update; APT_UPDATED=1; }
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

# ---------- 0. สิทธิ์และระบบปฏิบัติการ ----------
step "0. ตรวจสอบระบบ"
if [ "$(id -u)" -ne 0 ]; then
  if [ "$CHECK_ONLY" = 1 ]; then warn "ไม่ได้รันด้วย root — บางรายการอาจตรวจไม่ได้"
  else die "ต้องรันด้วย root:  sudo bash $0   (หรือ login เป็น root บน TurnKey)"; fi
fi
[ -f "$SRC_DIR/server.js" ] && [ -f "$SRC_DIR/package.json" ] || die "ไม่พบซอร์สโค้ดที่ $SRC_DIR (สคริปต์ต้องอยู่ใน app/deploy/)"
ok "ซอร์สโค้ด: $SRC_DIR"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  if [ "${ID:-}" = debian ] && [ "${VERSION_ID:-}" = 13 ]; then ok "ระบบปฏิบัติการ: $PRETTY_NAME"
  else warn "ระบบปฏิบัติการ: ${PRETTY_NAME:-unknown} — สคริปต์นี้ออกแบบสำหรับ Debian 13 อาจต้องปรับบางขั้น"; fi
fi
[ -f /etc/turnkey_version ] && ok "TurnKey: $(cat /etc/turnkey_version)"
have systemctl || die "ไม่พบ systemd"

# ---------- 1. แพ็คเกจพื้นฐาน ----------
step "1. แพ็คเกจพื้นฐาน"
missing=()
for p in "${BASE_PKGS[@]}"; do
  if pkg_installed "$p"; then ok "$p"; else problem "$p ยังไม่ได้ติดตั้ง"; missing+=("$p"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  info "วิธีติดตั้ง:  apt-get update && apt-get install -y ${missing[*]}"
  if ask "ติดตั้ง ${missing[*]} ตอนนี้?"; then apt_install "${missing[@]}"; PROBLEMS=$((PROBLEMS - ${#missing[@]})); fi
fi

# ---------- 2. Node.js ----------
step "2. Node.js (ต้องการ >= $NODE_MIN)"
node_ok=0
if have node; then
  nv="$(node -v | sed 's/^v//')"
  if ver_ge "$nv" "$NODE_MIN"; then ok "node v$nv ($(command -v node))"; node_ok=1
  else problem "node v$nv เก่าเกินไป"; fi
else
  problem "ไม่พบ node"
fi
if [ "$node_ok" = 0 ]; then
  info "วิธีติดตั้ง (Debian 13 มี Node.js 20.19 ใน repo หลัก):  apt-get install -y nodejs npm"
  info "หรือเวอร์ชันใหม่กว่าจาก NodeSource: https://github.com/nodesource/distributions"
  if ask "ติดตั้ง nodejs + npm จาก Debian repo ตอนนี้?"; then
    apt_install nodejs npm
    ver_ge "$(node -v | sed 's/^v//')" "$NODE_MIN" || die "node ที่ติดตั้งยังเก่ากว่า $NODE_MIN — ตรวจว่ามี node ตัวอื่นใน PATH (which -a node)"
    ok "node $(node -v)"; node_ok=1; PROBLEMS=$((PROBLEMS - 1))
  fi
fi
if have npm; then ok "npm $(npm -v)"
else
  problem "ไม่พบ npm"; info "วิธีติดตั้ง:  apt-get install -y npm"
  if ask "ติดตั้ง npm ตอนนี้?"; then apt_install npm; PROBLEMS=$((PROBLEMS - 1)); fi
fi
if have pm2 && pm2 jlist 2>/dev/null | grep -q '"name"'; then
  warn "พบแอปที่รันด้วย pm2 อยู่ (TurnKey มีแอปตัวอย่าง) — ตรวจด้วย 'pm2 list' ว่าไม่ได้ใช้พอร์ต $APP_PORT"
fi

# ---------- 3. PostgreSQL ----------
step "3. PostgreSQL"
pg_ok=0
if have psql && systemctl list-unit-files postgresql.service >/dev/null 2>&1 && pkg_installed postgresql; then
  ok "ติดตั้งแล้ว: $(psql --version)"
  if systemctl is-active --quiet postgresql; then ok "postgresql service กำลังทำงาน"; pg_ok=1
  else
    problem "postgresql ติดตั้งแล้วแต่ไม่ได้ทำงาน"; info "วิธีแก้:  systemctl enable --now postgresql"
    if ask "เปิด postgresql ตอนนี้?"; then systemctl enable --now postgresql; pg_ok=1; PROBLEMS=$((PROBLEMS - 1)); fi
  fi
else
  problem "ยังไม่ได้ติดตั้ง PostgreSQL server"
  info "วิธีติดตั้ง:  apt-get install -y postgresql   (Debian 13 = PostgreSQL 17)"
  if ask "ติดตั้ง PostgreSQL ตอนนี้?"; then
    apt_install postgresql; systemctl enable --now postgresql; pg_ok=1; PROBLEMS=$((PROBLEMS - 1))
  fi
fi

DB_PASS=""
if [ "$pg_ok" = 1 ] && [ "$(id -u)" -eq 0 ]; then
  role_exists="$(as_pg psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || true)"
  db_enc="$(as_pg psql -tAc "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname='$DB_NAME'" || true)"
  if [ "$role_exists" = 1 ]; then ok "มีผู้ใช้ฐานข้อมูล '$DB_USER' แล้ว"
  else
    problem "ยังไม่มีผู้ใช้ฐานข้อมูล '$DB_USER'"
    if ask "สร้างผู้ใช้ '$DB_USER' พร้อมรหัสผ่านสุ่ม?"; then
      DB_PASS="$(openssl rand -hex 24)"
      as_pg psql -v ON_ERROR_STOP=1 -qc "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASS'"
      ok "สร้างผู้ใช้ '$DB_USER' แล้ว"; PROBLEMS=$((PROBLEMS - 1))
    fi
  fi
  if [ -z "$db_enc" ]; then
    problem "ยังไม่มีฐานข้อมูล '$DB_NAME'"
    if ask "สร้างฐานข้อมูล '$DB_NAME' (UTF8)?"; then
      as_pg psql -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"
      ok "สร้างฐานข้อมูล '$DB_NAME' แล้ว"; PROBLEMS=$((PROBLEMS - 1))
    fi
  elif [ "$db_enc" = UTF8 ]; then ok "ฐานข้อมูล '$DB_NAME' ใช้ UTF8"
  else
    problem "ฐานข้อมูล '$DB_NAME' ใช้ $db_enc — เก็บภาษาไทยไม่ได้ (แอปจะไม่ยอมเริ่มทำงาน)"
    info "ต้องสำรองข้อมูล แล้ว DROP และสร้างใหม่ด้วย ENCODING 'UTF8' TEMPLATE template0"
    ntab="$(as_pg psql -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'" || echo 0)"
    info "ตารางในฐานข้อมูลเดิม: $ntab ตาราง"
    if ask "สำรองข้อมูลแล้วสร้างฐานข้อมูล '$DB_NAME' ใหม่เป็น UTF8 ตอนนี้?"; then
      BK="/root/${DB_NAME}-${db_enc}-$(date +%Y%m%d-%H%M%S).sql"
      as_pg pg_dump --no-owner "$DB_NAME" > "$BK"
      ok "สำรองไว้ที่ $BK"
      systemctl stop "$APP_NAME" 2>/dev/null || true
      as_pg psql -v ON_ERROR_STOP=1 -qc "DROP DATABASE \"$DB_NAME\" WITH (FORCE)"
      as_pg psql -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"
      ok "สร้างฐานข้อมูล '$DB_NAME' ใหม่เป็น UTF8 แล้ว"
      if [ "$ntab" != 0 ]; then
        # ข้อความใน SQL_ASCII คือ byte ดิบที่แอปส่งไปเป็น UTF-8 จึงนำเข้าเป็น UTF8 ได้ตรงๆ
        if (echo "SET client_encoding='UTF8'; SET ROLE \"$DB_USER\";"; sed '/^SET client_encoding/d' "$BK") \
             | as_pg psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" >/dev/null; then
          ok "นำข้อมูลเดิมกลับเข้าแล้ว"
        else
          warn "นำข้อมูลเดิมกลับไม่สำเร็จ — ฐานข้อมูลว่าง แอปจะสร้างตาราง/ข้อมูลตัวอย่างใหม่ (ข้อมูลเดิมยังอยู่ใน $BK)"
          as_pg psql -qc "DROP DATABASE \"$DB_NAME\" WITH (FORCE)"
          as_pg psql -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"
        fi
      fi
      PROBLEMS=$((PROBLEMS - 1))
    fi
  fi
fi

# ---------- 4. โค้ดแอป + .env ----------
step "4. ติดตั้งแอปที่ $APP_DIR"
if id "$APP_USER" >/dev/null 2>&1; then ok "ผู้ใช้ระบบ '$APP_USER'"
else
  problem "ยังไม่มีผู้ใช้ระบบ '$APP_USER' สำหรับรันแอป"
  if ask "สร้างผู้ใช้ระบบ '$APP_USER'?"; then
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"; PROBLEMS=$((PROBLEMS - 1))
  fi
fi

[ -d "$APP_DIR" ] && ok "มีโฟลเดอร์ $APP_DIR แล้ว (จะอัปเดตโค้ด ไม่แตะ .env และ uploads/)" || warn "ยังไม่มี $APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ] && ask "คัดลอกโค้ดจาก $SRC_DIR ไป $APP_DIR และติดตั้ง dependencies?"; then
  mkdir -p "$APP_DIR"
  rsync -a --delete --exclude node_modules/ --exclude uploads/ --exclude .env "$SRC_DIR"/ "$APP_DIR"/
  mkdir -p "$APP_DIR/uploads"
  (cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
  chown -R root:root "$APP_DIR"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR/uploads"
  chmod 750 "$APP_DIR/uploads"
  ok "ติดตั้งโค้ดแล้ว"
fi

ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  ok "มี $ENV_FILE แล้ว (ไม่เขียนทับ)"
  if [ "$CHECK_ONLY" = 0 ] && id "$APP_USER" >/dev/null 2>&1; then
    chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
    ok "ตั้งสิทธิ์ .env ให้ '$APP_USER' อ่านได้ (root:$APP_USER 640)"
  fi
  grep -q 'change-me' "$ENV_FILE" && problem "SESSION_SECRET ใน .env ยังเป็นค่าตัวอย่าง — ให้สุ่มใหม่: openssl rand -hex 48"
  [ -n "$DB_PASS" ] && warn "สร้างรหัสผ่านฐานข้อมูลใหม่: $DB_PASS — แก้ DATABASE_URL ใน .env ให้ตรง"
elif [ -d "$APP_DIR" ]; then
  problem "ยังไม่มี $ENV_FILE"
  if ask "สร้าง .env (SESSION_SECRET และรหัสผ่านเริ่มต้นแบบสุ่ม)?"; then
    if [ -z "$DB_PASS" ]; then
      DB_PASS="$(openssl rand -hex 24)"
      [ "$pg_ok" = 1 ] && as_pg psql -qc "ALTER ROLE \"$DB_USER\" PASSWORD '$DB_PASS'"
    fi
    SEED_PASS="$(openssl rand -base64 12 | tr -d '/+=')"
    use_https=false; ask "ติดตั้ง SSL (https://) เสร็จแล้วหรือยัง? (ถ้ายัง ตอบ n แล้วค่อยตั้ง COOKIE_SECURE=true ภายหลัง)" N && use_https=true
    umask 077
    cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
SESSION_SECRET=$(openssl rand -hex 48)
PORT=$APP_PORT
SEED_PASSWORD=$SEED_PASS
COOKIE_SECURE=$use_https
EOF
    chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
    ok "สร้าง .env แล้ว"; PROBLEMS=$((PROBLEMS - 1))
    echo
    echo "  ${Y}>>> บันทึกไว้: รหัสผ่านเริ่มต้นของผู้ใช้ admin และ staff = ${SEED_PASS}${N}"
    echo "  ${Y}>>> เปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก${N}"
    [ "$use_https" = true ] && warn "COOKIE_SECURE=true: ต้องเข้าผ่าน https:// เท่านั้น ไม่เช่นนั้นจะ login ไม่ได้"
  fi
fi

# ---------- 5. systemd service ----------
step "5. systemd service ($APP_NAME)"
UNIT="/etc/systemd/system/$APP_NAME.service"
if ss -ltnp 2>/dev/null | grep -q ":$APP_PORT " && ! systemctl is-active --quiet "$APP_NAME"; then
  problem "พอร์ต $APP_PORT ถูกใช้โดยโปรแกรมอื่น:"; ss -ltnp | grep ":$APP_PORT " | sed 's/^/         /'
  info "หยุดโปรแกรมนั้น (เช่น 'pm2 delete all') หรือตั้ง APP_PORT=xxxx แล้วรันสคริปต์ใหม่"
fi
if [ -f "$UNIT" ]; then ok "มี $UNIT แล้ว"
else
  problem "ยังไม่มี systemd service"
  if ask "สร้าง service และตั้งให้เริ่มอัตโนมัติเมื่อบูต?"; then
    cat > "$UNIT" <<EOF
[Unit]
Description=BPCD e-Portfolio
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) --env-file-if-exists=.env server.js
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR/uploads
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload; systemctl enable "$APP_NAME"; PROBLEMS=$((PROBLEMS - 1))
  fi
fi
if [ -f "$UNIT" ] && [ "$CHECK_ONLY" = 0 ] && ask "(เริ่ม/รีสตาร์ท) $APP_NAME ตอนนี้?"; then
  systemctl restart "$APP_NAME"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null && break; sleep 1
  done
fi
if systemctl is-active --quiet "$APP_NAME" && curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null; then
  ok "แอปตอบสนองที่ http://127.0.0.1:$APP_PORT"
elif [ -f "$UNIT" ]; then
  problem "แอปยังไม่ทำงาน — ดู log:  journalctl -u $APP_NAME -n 50 --no-pager"
  if [ -f "$ENV_FILE" ] && ! runuser -u "$APP_USER" -- test -r "$ENV_FILE"; then
    info "สาเหตุ: ผู้ใช้ '$APP_USER' อ่าน $ENV_FILE ไม่ได้ — แก้:  chown root:$APP_USER $ENV_FILE && chmod 640 $ENV_FILE"
  fi
  dburl="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$dburl" ] && have psql && ! psql "$dburl" -tAc 'SELECT 1' >/dev/null 2>&1; then
    info "สาเหตุ: เชื่อมต่อฐานข้อมูลด้วย DATABASE_URL ใน .env ไม่ได้ (รหัสผ่าน/ชื่อผู้ใช้ไม่ตรง?)"
    info "แก้: ตั้งรหัสผ่านใหม่ให้ตรงกับ .env:  runuser -u postgres -- psql -c \"ALTER ROLE $DB_USER PASSWORD '<รหัสใน .env>'\""
  fi
  echo "  ---- log ล่าสุด ----"
  journalctl -u "$APP_NAME" -n 15 --no-pager -o cat 2>/dev/null | sed 's/^/  | /' || true
fi

if grep -qE "^COOKIE_SECURE=true" "$ENV_FILE" 2>/dev/null && ! grep -rqs "listen.*443" /etc/nginx/sites-enabled/; then
  problem "COOKIE_SECURE=true แต่ nginx ยังไม่มี HTTPS — login จะขึ้น error CSRF"
  info "แก้: ตั้ง SSL ให้เสร็จ หรือแก้ COOKIE_SECURE=false ใน $ENV_FILE แล้ว systemctl restart $APP_NAME"
fi

# ---------- 5b. รหัสผ่านผู้ดูแลระบบ ----------
step "5b. รหัสผ่านผู้ดูแลระบบ (admin)"
admin_exists=""
if [ "$pg_ok" = 1 ] && [ "$(id -u)" -eq 0 ]; then
  admin_exists="$(as_pg psql -d "$DB_NAME" -tAc "SELECT 1 FROM users WHERE username='admin'" 2>/dev/null || true)"
fi
if [ "$admin_exists" != 1 ]; then
  warn "ยังไม่มีบัญชี admin (แอปจะสร้างให้เมื่อเริ่มทำงานสำเร็จครั้งแรก) — รันสคริปต์นี้อีกครั้งเพื่อตั้งรหัสผ่าน"
elif [ ! -d "$APP_DIR/node_modules/bcryptjs" ]; then
  warn "ไม่พบ $APP_DIR/node_modules/bcryptjs — ติดตั้งแอป (ขั้นที่ 4) ก่อนตั้งรหัสผ่าน"
else
  ok "มีบัญชี admin แล้ว"
  if [ "$ASSUME_YES" = 0 ] && ask "ตั้ง/เปลี่ยนรหัสผ่าน admin ตอนนี้? (ปลดล็อกบัญชีด้วย)" N; then
    while :; do
      read -r -s -p "  ?  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร): " P1; echo
      read -r -s -p "  ?  ยืนยันรหัสผ่านอีกครั้ง: " P2; echo
      if [ "${#P1}" -lt 8 ]; then warn "สั้นเกินไป"; elif [ "$P1" != "$P2" ]; then warn "รหัสผ่านไม่ตรงกัน"; else break; fi
    done
    HASH="$(cd "$APP_DIR" && NEWPW="$P1" node -e "process.stdout.write(require('bcryptjs').hashSync(process.env.NEWPW,10))")"
    unset P1 P2
    echo "UPDATE users SET password_hash=:'h', failed_attempts=0, locked_until=NULL WHERE username='admin';" \
      | as_pg psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -v h="$HASH" >/dev/null
    ok "ตั้งรหัสผ่าน admin ใหม่แล้ว"
  fi
fi

# ---------- 6. nginx reverse proxy ----------
step "6. nginx reverse proxy"
NGX_SITE="/etc/nginx/sites-available/$APP_NAME"
if ! have nginx; then
  problem "ไม่พบ nginx"; info "วิธีติดตั้ง:  apt-get install -y nginx"
  if ask "ติดตั้ง nginx ตอนนี้?"; then apt_install nginx; PROBLEMS=$((PROBLEMS - 1)); fi
else ok "nginx $(nginx -v 2>&1 | sed 's/.*\///')"; fi
if have nginx; then
  if [ -f "$NGX_SITE" ]; then ok "มี $NGX_SITE แล้ว"
  else
    problem "ยังไม่ได้ตั้ง reverse proxy"
    if ask "สร้าง nginx site สำหรับแอป?"; then
      DOMAIN="$(prompt "ชื่อโดเมน (หรือ _ ถ้าใช้ IP)" "_")"
      cat > "$NGX_SITE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN;

    # อัปโหลดได้สูงสุด 20 ไฟล์ x 50 MB ต่อครั้ง
    client_max_body_size 1100m;
    proxy_read_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
      others="$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -vx "$APP_NAME" || true)"
      if [ -n "$others" ]; then
        warn "มี site อื่นเปิดอยู่ (เช่น site เริ่มต้นของ TurnKey): $(echo $others)"
        if ask "ปิด site เหล่านั้นเพื่อไม่ให้ชน default_server? (ไฟล์ยังอยู่ใน sites-available)"; then
          for s in $others; do rm -f "/etc/nginx/sites-enabled/$s"; done
        else
          sed -i 's/ default_server//' "$NGX_SITE"
        fi
      fi
      ln -sf "$NGX_SITE" "/etc/nginx/sites-enabled/$APP_NAME"
      if nginx -t; then systemctl reload nginx; ok "เปิดใช้ reverse proxy แล้ว"; PROBLEMS=$((PROBLEMS - 1))
      else problem "nginx -t ไม่ผ่าน — แก้ $NGX_SITE แล้วรัน: nginx -t && systemctl reload nginx"; fi
    fi
  fi
fi

# ---------- สรุป ----------
step "สรุป"
if [ "$PROBLEMS" -le 0 ]; then
  ok "ทุกขั้นตอนเรียบร้อย"
else
  warn "ยังเหลือ $PROBLEMS รายการที่ต้องแก้ (ดู [ขาด] ด้านบน) แล้วรันสคริปต์นี้อีกครั้ง"
fi
cat <<EOF

  ขั้นต่อไปที่แนะนำ:
   - HTTPS: บน TurnKey ใช้  confconsole → Lets Encrypt  หรือ  apt-get install -y certbot python3-certbot-nginx && certbot --nginx
     แล้วตั้ง COOKIE_SECURE=true ใน $ENV_FILE และ  systemctl restart $APP_NAME
   - Firewall: เปิดเฉพาะพอร์ต 22/80/443 (ไม่ต้องเปิด $APP_PORT และ 5432 สู่ภายนอก)
   - Backup: pg_dump $DB_NAME  และโฟลเดอร์ $APP_DIR/uploads  (ต้อง backup คู่กัน)
   - อัปเดตโค้ด: git pull แล้วรัน  bash app/deploy/install.sh  ซ้ำ (ไม่ทับ .env / uploads)
   - คำสั่งที่ใช้บ่อย:  systemctl status $APP_NAME  |  journalctl -u $APP_NAME -f
EOF
[ "$PROBLEMS" -le 0 ]
