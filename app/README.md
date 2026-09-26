# BPCD e‑Portfolio

ระบบแฟ้มสะสมงานอิเล็กทรอนิกส์ — สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา สอศ.
Web app: **Node.js (Express) + PostgreSQL** สร้างตามต้นแบบ `project/BPCD e-Portfolio v2.dc.html`

## ความต้องการ

- Node.js 20.6 ขึ้นไป (ทดสอบกับ v24)
- PostgreSQL 13 ขึ้นไป ที่ **ฐานข้อมูลเป็น UTF8** (จำเป็นสำหรับภาษาไทย)

## เริ่มใช้งาน

### 1. เตรียม PostgreSQL

**แบบ Docker (ง่ายที่สุด)** — เปิด Docker Desktop แล้วรัน

```bash
docker compose up -d
```

**แบบติดตั้ง PostgreSQL เอง** — สร้างผู้ใช้และฐานข้อมูล (ใน psql หรือ pgAdmin)

```sql
CREATE USER bpcd WITH PASSWORD 'bpcd_pass';
CREATE DATABASE bpcd_eportfolio OWNER bpcd
  ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
```

> บน Windows ถ้าไม่ระบุ `ENCODING 'UTF8'` ฐานข้อมูลอาจถูกสร้างเป็น WIN1252/WIN874 ซึ่งเก็บภาษาไทยไม่ได้ — ระบบจะตรวจและแจ้งเตือนตอนเริ่มทำงาน

### 2. ตั้งค่าและรัน

```bash
cp .env.example .env      # แก้ DATABASE_URL และ SESSION_SECRET ตามจริง
npm install
npm start                 # หรือ npm run dev (restart อัตโนมัติเมื่อแก้โค้ด)
```

เปิด http://localhost:3000

ครั้งแรกระบบจะสร้างตารางและข้อมูลตัวอย่างให้อัตโนมัติ:

| ชื่อผู้ใช้ | บทบาท | รหัสผ่าน |
| --- | --- | --- |
| `admin` | ผู้ดูแลระบบ (มีข้อมูลตัวอย่างครบ) | ค่า `SEED_PASSWORD` ใน `.env` (ค่าเริ่มต้น `changeme123`) |
| `staff` | บุคลากร | เหมือนกัน |

**เปลี่ยนรหัสผ่านทันทีหลังเข้าระบบ** (คลิกวงกลมชื่อมุมขวาบน → เปลี่ยนรหัสผ่าน)

## การรันประจำวัน (หลังตั้งค่าครั้งแรกแล้ว)

**เริ่มระบบ**

```bash
docker compose up -d   # เปิด PostgreSQL (ถ้ายังไม่ได้เปิด)
npm start               # รันเซิร์ฟเวอร์ครั้งเดียว
# หรือ
npm run dev             # โหมดพัฒนา, restart อัตโนมัติเมื่อแก้โค้ด
```

เปิด http://localhost:3000

**หยุดระบบ**

- กด `Ctrl+C` ในหน้าต่างเทอร์มินัลที่รัน `npm start` / `npm run dev` เพื่อหยุดเซิร์ฟเวอร์
- หยุด PostgreSQL (ถ้าต้องการ): `docker compose stop` (ข้อมูลยังอยู่, เปิดใหม่ด้วย `docker compose up -d`) หรือ `docker compose down` (ลบ container แต่ข้อมูลยังอยู่ใน volume `pgdata`) — **ห้ามใช้ `docker compose down -v`** เพราะจะลบข้อมูลทั้งหมดถาวร

ถ้าลืม PID หรือรันเซิร์ฟเวอร์แบบ background แล้วหาหน้าต่างเทอร์มินัลไม่เจอ (Windows PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess -Unique
Stop-Process -Id <PID> -Force
```

## ติดตั้งบน Production (Debian 13 / TurnKey Linux Node.js)

คัดลอกซอร์สโค้ดขึ้นเซิร์ฟเวอร์ (เช่น `git clone`) แล้วรันด้วย root:

```bash
bash app/deploy/install.sh --check   # ตรวจอย่างเดียว บอกว่าขาดอะไรและติดตั้งอย่างไร
bash app/deploy/install.sh           # ติดตั้ง/อัปเดตแบบถามทีละขั้น (รันซ้ำได้)
```

สคริปต์ตรวจและช่วยติดตั้ง Node.js ≥ 20.6, PostgreSQL (สร้างฐานข้อมูล UTF8), คัดลอกแอปไป `/opt/bpcd-eportfolio`, สร้าง `.env` ด้วยค่าสุ่ม, systemd service `bpcd-eportfolio`, ตั้ง/รีเซ็ตรหัสผ่าน admin และ nginx reverse proxy — ไม่เขียนทับ `.env` และ `uploads/` เดิม

## ติดตั้งบน Production (Debian 13 / TurnKey Linux Node.js)

คัดลอกซอร์สโค้ดขึ้นเซิร์ฟเวอร์ (เช่น `git clone`) แล้วรันด้วย root:

```bash
bash app/deploy/install.sh --check   # ตรวจอย่างเดียว บอกว่าขาดอะไรและติดตั้งอย่างไร
bash app/deploy/install.sh           # ติดตั้ง/อัปเดตแบบถามทีละขั้น (รันซ้ำได้)
```

สคริปต์ตรวจและช่วยติดตั้ง Node.js ≥ 20.6, PostgreSQL (สร้างฐานข้อมูล UTF8), คัดลอกแอปไป `/opt/bpcd-eportfolio`, สร้าง `.env` ด้วยค่าสุ่ม, systemd service `bpcd-eportfolio`, ตั้ง/รีเซ็ตรหัสผ่าน admin และ nginx reverse proxy — ไม่เขียนทับ `.env` และ `uploads/` เดิม

### Auto deploy

ตอบ "y" ที่ขั้นที่ 7 ของ `install.sh` เพื่อเปิด auto deploy: เซิร์ฟเวอร์จะตรวจ branch `main` บน GitHub ทุก 2 นาที ถ้ามี commit ใหม่จะคัดลอกโค้ด ติดตั้ง dependencies (ถ้าเปลี่ยน) และรีสตาร์ทแอปเอง ถ้าแอปไม่ขึ้นจะ rollback กลับเวอร์ชันเดิมอัตโนมัติ (เซิร์ฟเวอร์ไม่ต้องเปิดพอร์ตรับจาก GitHub)

```bash
systemctl start bpcd-eportfolio-update         # deploy ทันทีไม่ต้องรอ
journalctl -u bpcd-eportfolio-update -n 30     # ดูประวัติการ deploy
systemctl disable --now bpcd-eportfolio-update.timer   # ปิด auto deploy
```

## ความสามารถ

- **แดชบอร์ด** — สถิติผลงาน/หลักฐาน/KPI/สมรรถนะ, เส้นทางข้อมูล 9 ขั้น, ข้อสังเกต, ความครบถ้วนของแฟ้ม (คำนวณจากข้อมูลจริง)
- **ผลงานและโครงการ** — เพิ่ม/แก้ไข/ลบ, กรองตามประเภท, ค้นหา; ผู้ดูแลระบบเปลี่ยนสถานะรับรองได้
- **หลักฐาน** — อัปโหลดไฟล์ (ลากวาง, สูงสุด 50 MB/ไฟล์) หรือเพิ่มลิงก์, เชื่อมโยงกับผลงาน; ผู้ดูแลระบบกด "ยืนยันตรวจแล้ว"
- **KPI และสมรรถนะ** — คะแนนถ่วงน้ำหนัก, gap เทียบระดับคาดหวัง
- **หน้าแสดง Portfolio** — หน้าสำหรับนำเสนอ/พิมพ์เป็น PDF (ปุ่มเครื่องพิมพ์)
- **ผู้ช่วย AI**
  - *สัมภาษณ์* 8 คำถาม (ไม่ใช้ AI/token) พิมพ์หรือพูดภาษาไทย (Web Speech API — Chrome/Edge) → บันทึกเข้าแฟ้มได้ทันที
  - *เรียบเรียงด้วย AI* และ *ถาม‑ตอบ* — เรียกผ่านเซิร์ฟเวอร์ (OpenAI‑compatible: OpenRouter, Google AI Studio, Ollama/LM Studio ฯลฯ)
- **ตั้งค่าผู้ช่วย AI** (ผู้ดูแลระบบ) — API Key เข้ารหัส AES‑256‑GCM ในฐานข้อมูล ไม่ส่งไปที่เบราว์เซอร์
- **จัดการผู้ใช้** (ผู้ดูแลระบบ) — เพิ่มบัญชีบุคลากร
- Audit log ทุกการแก้ไขในตาราง `audit_log`

## โครงสร้าง

```
server.js          Express API + session (เก็บใน PostgreSQL) + อัปโหลดไฟล์ + AI proxy
db/schema.sql      ตาราง users, works, evidence, kpis, competencies, settings, audit_log
db/seed.js         ข้อมูลตัวอย่างจากต้นแบบ
db/init.js         npm run db:init — สร้างตาราง/seed โดยไม่ต้องเปิดเซิร์ฟเวอร์
public/            หน้าเว็บ (HTML/CSS/JS ล้วน ไม่ต้อง build)
uploads/           ไฟล์หลักฐานที่อัปโหลด (ให้ backup คู่กับฐานข้อมูล)
```

## ความปลอดภัย

- **Login** — จำกัด 20 ครั้ง/15 นาที ต่อ IP (`express-rate-limit`) และล็อกบัญชีชั่วคราว 15 นาที หลังใส่รหัสผ่านผิดติดต่อกัน 5 ครั้ง (นับแยกต่อบัญชี เก็บใน `users.failed_attempts` / `locked_until`)
- **CSRF** — ทุก request ที่แก้ไขข้อมูล (POST/PUT/DELETE ใต้ `/api`) ต้องแนบ header `X-CSRF-Token` ให้ตรงกับ token ที่ผูกกับ session (ขอผ่าน `GET /api/csrf`); ฝั่งเว็บจัดการให้อัตโนมัติอยู่แล้ว
- **อัปโหลดไฟล์** — นอกจากเช็คนามสกุลไฟล์แล้ว ระบบยังตรวจ "magic bytes" ของเนื้อไฟล์จริง (pdf/docx/xlsx/jpg/png/gif/webp/mp4/mov) เพื่อกันไฟล์ปลอมนามสกุล ไฟล์ที่ไม่ตรงจะถูกลบทิ้งทันทีและปฏิเสธคำขอ
- `COOKIE_SECURE=true` ใน `.env` เมื่อวางหลัง HTTPS reverse proxy จริง (production) — cookie จะส่งผ่าน HTTPS เท่านั้น (ตั้งเป็น `false` ตอน dev บน `http://localhost`)

## ข้อควรทราบ

- `SESSION_SECRET` ใช้ทั้งเซ็น session, เข้ารหัส API Key และ sign CSRF token — ถ้าเปลี่ยนค่า ต้องกรอก API Key ใหม่ และผู้ใช้ทุกคนจะหลุดจาก session เดิม
- KPI และสมรรถนะของผู้ใช้ใหม่ตั้งต้นจากชุดตัวอย่าง ยังไม่มีหน้าจอแก้ไข (แก้ในตาราง `kpis`, `competencies`)
- ถ้าใช้งานจริงผ่านอินเทอร์เน็ต ควรวางหลัง HTTPS reverse proxy และตั้ง `COOKIE_SECURE=true`
