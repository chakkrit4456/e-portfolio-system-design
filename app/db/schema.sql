CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  position      TEXT,
  level         TEXT,
  group_name    TEXT,
  supervisor    TEXT,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS duties TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT; -- ชื่อไฟล์รูปถ่ายใน uploads/

CREATE TABLE IF NOT EXISTS works (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'โครงการ',
  ref        TEXT,
  period     TEXT,
  result     TEXT,
  kpi        TEXT,
  summary    TEXT,
  status     TEXT NOT NULL DEFAULT 'รอตรวจสอบ',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id    INT REFERENCES works(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'PDF',
  url        TEXT,
  file_name  TEXT,
  ev_date    TEXT,
  status     TEXT NOT NULL DEFAULT 'รอตรวจสอบ',
  checker    TEXT NOT NULL DEFAULT '—',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpis (
  id      SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  source  TEXT,
  weight  NUMERIC NOT NULL,
  target  TEXT,
  actual  TEXT,
  pct     NUMERIC NOT NULL DEFAULT 0,
  score   NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS competencies (
  id       SERIAL PRIMARY KEY,
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grp      TEXT NOT NULL,
  name     TEXT NOT NULL,
  expected INT NOT NULL,
  actual   INT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action  TEXT NOT NULL,
  detail  TEXT,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS works_user_idx    ON works(user_id);
CREATE INDEX IF NOT EXISTS evidence_user_idx ON evidence(user_id);

-- KPI แบบตัวเลข: target_value/actual_value/unit ใช้คำนวณ pct/score (target/actual TEXT เป็นค่าที่แสดงผล)
-- auto/certified_only เลิกใช้แล้ว: ผลงานของ KPI ให้ผู้ดูแลกรอกเอง (work_kpis เป็นข้อมูลอ้างอิงเท่านั้น)
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS target_value NUMERIC;
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS actual_value NUMERIC;
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS certified_only BOOLEAN NOT NULL DEFAULT false;
UPDATE kpis SET auto = false, certified_only = false WHERE auto OR certified_only; -- เก็บค่าที่นับได้ล่าสุดไว้เป็นค่าตั้งต้น
UPDATE kpis SET target_value = substring(replace(target, ',', '') from '[0-9]+(?:\.[0-9]+)?')::numeric,
                actual_value = COALESCE(substring(replace(actual, ',', '') from '[0-9]+(?:\.[0-9]+)?')::numeric, 0),
                unit = NULLIF(trim(regexp_replace(target, '[0-9.,]+', '')), '')
 WHERE target_value IS NULL AND target ~ '[0-9]';

CREATE TABLE IF NOT EXISTS work_kpis (
  work_id INT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  kpi_id  INT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  value   NUMERIC NOT NULL DEFAULT 1,
  PRIMARY KEY (work_id, kpi_id)
);
CREATE INDEX IF NOT EXISTS work_kpis_kpi_idx ON work_kpis(kpi_id);
CREATE INDEX IF NOT EXISTS kpis_user_idx ON kpis(user_id);

-- รอบการประเมิน: KPI/สมรรถนะแยกตามรอบ (period_id ที่ยังว่างถูกผูกกับรอบปัจจุบันตอนเริ่มระบบ — ensurePeriods ใน server.js)
CREATE TABLE IF NOT EXISTS periods (
  id          SERIAL PRIMARY KEY,
  fiscal_year INT  NOT NULL,
  round       TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL
);
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS period_id INT REFERENCES periods(id);
ALTER TABLE competencies ADD COLUMN IF NOT EXISTS period_id INT REFERENCES periods(id);
CREATE INDEX IF NOT EXISTS kpis_period_idx ON kpis(user_id, period_id);
CREATE INDEX IF NOT EXISTS competencies_period_idx ON competencies(user_id, period_id);

-- ผลงาน/หลักฐานแยกตามรอบ (หลักฐานอยู่รอบเดียวกับผลงานที่เชื่อม) — ค่าว่างถูกเติมตอนเริ่มระบบ (ensurePeriods)
ALTER TABLE works ADD COLUMN IF NOT EXISTS period_id INT REFERENCES periods(id);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS period_id INT REFERENCES periods(id);
CREATE INDEX IF NOT EXISTS works_period_idx ON works(user_id, period_id);
CREATE INDEX IF NOT EXISTS evidence_period_idx ON evidence(user_id, period_id);
