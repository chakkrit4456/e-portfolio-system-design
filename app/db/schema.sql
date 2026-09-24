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
