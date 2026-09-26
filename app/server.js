const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { pool, migrate, audit } = require('./db');
const seed = require('./db/seed');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-please-change';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const WORK_TYPES = ['โครงการ', 'งานประจำ', 'วิชาการ', 'ยุทธศาสตร์', 'บริการ', 'เร่งด่วน'];
const WORK_STATUSES = ['รอตรวจสอบ', 'กำลังดำเนินการ', 'รอหลักฐาน', 'รับรองแล้ว'];
const EV_STATUSES = ['รอตรวจสอบ', 'ตรวจแล้ว'];

// ---------- API key encryption (AES-256-GCM, key derived from SESSION_SECRET) ----------
const ENC_KEY = crypto.createHash('sha256').update('ai-key:' + SECRET).digest();
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}
function decrypt(blob) {
  if (!blob) return '';
  if (!blob.startsWith('enc:')) return blob;
  try {
    const raw = Buffer.from(blob.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

async function getAi() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='ai'");
  const v = rows[0] ? rows[0].value : {};
  return { provider: 'openrouter', baseUrl: '', model: '', ...v, apiKey: decrypt(v.apiKey) };
}
function aiReady(a) {
  return !!(a.baseUrl && a.model && (a.apiKey || a.provider === 'local'));
}
async function callLLM(messages) {
  const a = await getAi();
  if (!aiReady(a)) throw new Error('ผู้ดูแลระบบยังไม่ได้เปิดการเชื่อมต่อ AI');
  const headers = { 'Content-Type': 'application/json' };
  if (a.apiKey) headers.Authorization = 'Bearer ' + a.apiKey;
  if (a.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost';
    headers['X-Title'] = 'BPCD e-Portfolio';
  }
  let r;
  try {
    r = await fetch(a.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: a.model, messages, temperature: 0.4 }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (e) {
    const why = e.name === 'TimeoutError' ? 'หมดเวลารอ 60 วินาที' : (e.cause && e.cause.code) || e.message;
    throw new Error('ติดต่อ AI endpoint ไม่ได้ (' + why + ')');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status);
  return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
}

// ---------- App ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: 8 * 3600 * 1000 }
  })
);

// ---------- CSRF (synchronizer token, tied to server-side session) ----------
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  next();
});
app.get('/api/csrf', (req, res) => res.json({ token: req.session.csrfToken }));
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('X-CSRF-Token');
  if (!token || token !== req.session.csrfToken) {
    if (COOKIE_SECURE && !req.secure) {
      console.warn('CSRF failed: COOKIE_SECURE=true but request is not HTTPS — use https:// or set COOKIE_SECURE=false');
      return res.status(403).json({ error: 'ระบบตั้งค่าให้ใช้ HTTPS เท่านั้น กรุณาเข้าผ่าน https://', csrf: false });
    }
    return res.status(403).json({ error: 'คำขอไม่ถูกต้อง (CSRF) กรุณาโหลดหน้าใหม่', csrf: true });
  }
  next();
});

// ---------- Login rate limiting (per-IP, on top of per-account lockout below) ----------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }
});

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  next();
}
function admin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ' });
  next();
}
const uid = req => req.session.user.id;
const isAdmin = req => req.session.user.role === 'admin';

// ---------- Auth ----------
app.post('/api/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [String(username || '').trim()]);
  const u = rows[0];

  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
    return res.status(423).json({ error: `บัญชีถูกล็อกชั่วคราวจากการเข้าสู่ระบบผิดหลายครั้ง กรุณาลองใหม่ในอีก ${mins} นาที` });
  }

  const ok = u && (await bcrypt.compare(String(password || ''), u.password_hash));
  if (!u || !ok) {
    if (u) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await pool.query('UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3', [attempts, lock, u.id]);
      if (lock) audit(u.id, 'account_locked');
    }
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  await pool.query('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [u.id]);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'session error' });
    req.session.user = { id: u.id, role: u.role, name: u.name };
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    audit(u.id, 'login');
    res.json({ ok: true, csrfToken: req.session.csrfToken });
  });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/password', auth, wrap(async (req, res) => {
  const { current, next: nw } = req.body || {};
  if (!nw || String(nw).length < 8) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [uid(req)]);
  if (!(await bcrypt.compare(String(current || ''), rows[0].password_hash))) return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(nw), 10), uid(req)]);
  audit(uid(req), 'change_password');
  res.json({ ok: true });
}));

// ---------- Portfolio data (everything the UI needs for the current user) ----------
app.get('/api/portfolio', auth, wrap(async (req, res) => {
  const id = uid(req);
  const [u, works, ev, kpis, comps, ai] = await Promise.all([
    pool.query('SELECT id,username,name,position,level,group_name,supervisor,role,duties FROM users WHERE id=$1', [id]),
    pool.query(
      `SELECT w.*, (SELECT count(*)::int FROM evidence e WHERE e.work_id=w.id) AS ev
       FROM works w WHERE w.user_id=$1 ORDER BY w.created_at DESC, w.id DESC`, [id]),
    pool.query('SELECT id,work_id,name,kind,url,file_name,ev_date,status,checker FROM evidence WHERE user_id=$1 ORDER BY id', [id]),
    pool.query('SELECT id,name,source,weight::float,target,actual,pct::float,score::float FROM kpis WHERE user_id=$1 ORDER BY id', [id]),
    pool.query('SELECT id,grp,name,expected,actual FROM competencies WHERE user_id=$1 ORDER BY id', [id]),
    getAi()
  ]);
  if (!u.rows[0]) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json({
    user: u.rows[0],
    works: works.rows,
    evidence: ev.rows.map(e => ({ ...e, hasFile: !!e.file_name, file_name: undefined })),
    kpis: kpis.rows,
    comps: comps.rows,
    ai: { ready: aiReady(ai), provider: ai.provider, model: ai.model }
  });
}));

app.put('/api/profile', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อ-สกุล' });
  const s = v => (v == null ? null : String(v).trim() || null);
  await pool.query(
    'UPDATE users SET name=$1,position=$2,level=$3,group_name=$4,supervisor=$5,duties=$6 WHERE id=$7',
    [name, s(b.position), s(b.level), s(b.group_name), s(b.supervisor), s(b.duties), uid(req)]
  );
  req.session.user.name = name;
  audit(uid(req), 'profile_update');
  res.json({ ok: true });
}));

// ---------- Works ----------
function workFields(b) {
  return {
    title: String(b.title || '').trim(),
    type: WORK_TYPES.includes(b.type) ? b.type : 'โครงการ',
    ref: b.ref || null,
    period: b.period || null,
    result: b.result || null,
    kpi: b.kpi || null,
    summary: b.summary || null
  };
}

app.post('/api/works', auth, wrap(async (req, res) => {
  const f = workFields(req.body || {});
  if (!f.title) return res.status(400).json({ error: 'กรุณาระบุชื่องาน' });
  const { rows } = await pool.query(
    `INSERT INTO works(user_id,title,type,ref,period,result,kpi,summary,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'รอตรวจสอบ') RETURNING *`,
    [uid(req), f.title, f.type, f.ref, f.period, f.result, f.kpi, f.summary]
  );
  audit(uid(req), 'work_create', f.title);
  res.json(rows[0]);
}));

app.put('/api/works/:id', auth, wrap(async (req, res) => {
  const f = workFields(req.body || {});
  if (!f.title) return res.status(400).json({ error: 'กรุณาระบุชื่องาน' });
  const status = isAdmin(req) && WORK_STATUSES.includes(req.body.status) ? req.body.status : null;
  const { rows } = await pool.query(
    `UPDATE works SET title=$1,type=$2,ref=$3,period=$4,result=$5,kpi=$6,summary=$7,status=COALESCE($8,status)
     WHERE id=$9 AND user_id=$10 RETURNING *`,
    [f.title, f.type, f.ref, f.period, f.result, f.kpi, f.summary, status, req.params.id, uid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผลงาน' });
  audit(uid(req), 'work_update', req.params.id);
  res.json(rows[0]);
}));

app.delete('/api/works/:id', auth, wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM works WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  if (!r.rowCount) return res.status(404).json({ error: 'ไม่พบผลงาน' });
  audit(uid(req), 'work_delete', req.params.id);
  res.json({ ok: true });
}));

// ---------- Evidence ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|docx?|xlsx?|csv|jpe?g|png|gif|webp|mp4|mov)$/i.test(file.originalname);
    cb(ok ? null : new Error('ไม่รองรับไฟล์ประเภทนี้'), ok);
  }
});
function kindOf(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'PDF';
  if (/\.docx?$/.test(ext)) return 'DOCX';
  if (/\.(xlsx?|csv)$/.test(ext)) return 'XLSX';
  if (/\.(jpe?g|png|gif|webp)$/.test(ext)) return 'ภาพ';
  if (/\.(mp4|mov)$/.test(ext)) return 'วิดีโอ';
  return 'PDF';
}
// Real file-content check (magic bytes) so a renamed .exe etc. can't slip past the extension filter.
// .csv/.doc/.xls (legacy) have no reliable universal signature, so they're allowed through on extension alone.
function contentMatchesExt(ext, buf) {
  const starts = sig => sig.every((b, i) => buf[i] === b);
  switch (ext) {
    case '.pdf': return starts([0x25, 0x50, 0x44, 0x46]); // %PDF
    case '.docx':
    case '.xlsx': return starts([0x50, 0x4b, 0x03, 0x04]); // ZIP (OOXML container)
    case '.jpg':
    case '.jpeg': return starts([0xff, 0xd8, 0xff]);
    case '.png': return starts([0x89, 0x50, 0x4e, 0x47]);
    case '.gif': return starts([0x47, 0x49, 0x46, 0x38]); // GIF8
    case '.webp': return starts([0x52, 0x49, 0x46, 0x46]) && buf.slice(8, 12).toString('ascii') === 'WEBP'; // RIFF....WEBP
    case '.mp4':
    case '.mov': return buf.slice(4, 8).toString('ascii') === 'ftyp';
    default: return true; // .doc, .xls, .csv — no reliable signature to check
  }
}
async function verifyUploadedFiles(files) {
  for (const f of files) {
    const ext = path.extname(f.filename).toLowerCase();
    const fd = fs.openSync(f.path, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (!contentMatchesExt(ext, buf)) {
      for (const rm of files) fs.unlink(rm.path, () => {});
      throw new Error('ไฟล์ "' + f.originalname + '" มีเนื้อหาไม่ตรงกับนามสกุลไฟล์');
    }
  }
}
// Browsers send UTF-8 filenames that busboy decodes as latin1; undo that unless it's already correct.
function utf8Name(n) {
  const fixed = Buffer.from(n, 'latin1').toString('utf8');
  return /[^\u0000-ÿ]/.test(n) || fixed.includes('�') ? n : fixed;
}
const thaiDate = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

async function ownWork(req, workId) {
  if (!workId) return null;
  const { rows } = await pool.query('SELECT id FROM works WHERE id=$1 AND user_id=$2', [workId, uid(req)]);
  return rows[0] ? rows[0].id : null;
}

app.post('/api/evidence', auth, upload.array('files', 20), wrap(async (req, res) => {
  if (req.files && req.files.length) await verifyUploadedFiles(req.files);
  const workId = await ownWork(req, req.body.work_id);
  const out = [];
  for (const f of req.files || []) {
    const name = utf8Name(f.originalname);
    const { rows } = await pool.query(
      `INSERT INTO evidence(user_id,work_id,name,kind,file_name,ev_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [uid(req), workId, name, kindOf(name), f.filename, thaiDate()]
    );
    out.push(rows[0].id);
  }
  const url = String(req.body.url || '').trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' });
    const { rows } = await pool.query(
      `INSERT INTO evidence(user_id,work_id,name,kind,url,ev_date) VALUES($1,$2,$3,'URL',$4,$5) RETURNING id`,
      [uid(req), workId, String(req.body.name || '').trim() || url, url, thaiDate()]
    );
    out.push(rows[0].id);
  }
  if (!out.length) return res.status(400).json({ error: 'กรุณาเลือกไฟล์หรือระบุลิงก์' });
  audit(uid(req), 'evidence_add', out.join(','));
  res.json({ ids: out });
}));

app.put('/api/evidence/:id', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const workId = await ownWork(req, b.work_id);
  const status = isAdmin(req) && EV_STATUSES.includes(b.status) ? b.status : null;
  const checker = status === 'ตรวจแล้ว' ? req.session.user.name : null;
  const { rows } = await pool.query(
    `UPDATE evidence SET work_id=$1, status=COALESCE($2,status), checker=COALESCE($3,checker)
     WHERE id=$4 AND user_id=$5 RETURNING id`,
    [workId, status, checker, req.params.id, uid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบหลักฐาน' });
  audit(uid(req), 'evidence_update', req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/evidence/:id', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM evidence WHERE id=$1 AND user_id=$2 RETURNING file_name', [req.params.id, uid(req)]);
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบหลักฐาน' });
  if (rows[0].file_name) fs.unlink(path.join(UPLOAD_DIR, rows[0].file_name), () => {});
  audit(uid(req), 'evidence_delete', req.params.id);
  res.json({ ok: true });
}));

app.get('/files/:id', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT name,file_name FROM evidence WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  if (!rows[0] || !rows[0].file_name) return res.status(404).send('Not found');
  res.setHeader('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(rows[0].name));
  res.sendFile(path.join(UPLOAD_DIR, path.basename(rows[0].file_name)));
}));

// ---------- AI ----------
app.get('/api/settings/ai', admin, wrap(async (req, res) => {
  const a = await getAi();
  res.json({ provider: a.provider, baseUrl: a.baseUrl, model: a.model, hasKey: !!a.apiKey });
}));

app.put('/api/settings/ai', admin, wrap(async (req, res) => {
  const cur = await getAi();
  const b = req.body || {};
  const next = {
    provider: String(b.provider || cur.provider),
    baseUrl: String(b.baseUrl ?? cur.baseUrl).trim(),
    model: String(b.model ?? cur.model).trim(),
    // apiKey: undefined = keep, '' = clear, string = replace
    apiKey: encrypt(b.apiKey === undefined ? cur.apiKey : String(b.apiKey).trim())
  };
  await pool.query(
    `INSERT INTO settings(key,value) VALUES('ai',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify(next)]
  );
  audit(uid(req), 'ai_settings_update', next.provider + ' ' + next.model);
  res.json({ ok: true });
}));

app.post('/api/ai/test', admin, wrap(async (req, res) => {
  try {
    const out = await callLLM([{ role: 'user', content: 'ตอบคำว่า OK เท่านั้น' }]);
    res.json({ ok: true, text: out.slice(0, 30) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
}));

async function portfolioContext(id) {
  const [u, w, k] = await Promise.all([
    pool.query('SELECT name,position,level FROM users WHERE id=$1', [id]),
    pool.query('SELECT title,status FROM works WHERE user_id=$1 ORDER BY id', [id]),
    pool.query('SELECT name,actual,target FROM kpis WHERE user_id=$1 ORDER BY id', [id])
  ]);
  const p = u.rows[0] || {};
  return 'ข้อมูลแฟ้ม: ผู้จัดทำ ' + p.name + ' ' + (p.position || '') + (p.level || '') + ' ปีงบ 2569. ผลงาน: ' +
    w.rows.map(x => x.title + ' [' + x.status + ']').join('; ') + '. KPI: ' +
    k.rows.map(x => x.name + ' ' + x.actual + '/' + x.target).join('; ');
}

// ผู้ดูแลระบบสั่งเพิ่มผู้ใช้ผ่านแชทได้: AI เสนอรายชื่อเป็นบล็อก ```action``` แล้วผู้ดูแลกดยืนยันเอง
// (การสร้างจริงผ่าน POST /api/users ซึ่งตรวจสิทธิ์ admin อีกครั้ง — AI ไม่ได้สร้างบัญชีเอง)
const AI_ADMIN_USERS = ' ผู้ใช้ปัจจุบันเป็นผู้ดูแลระบบ: ถ้าขอให้เพิ่ม/สร้างผู้ใช้ ให้ตอบสั้นๆ แล้วต่อท้ายด้วยบล็อก\n' +
  '```action\n{"type":"create_users","users":[{"username":"somchai.j","name":"นายสมชาย ใจดี","position":"ครู","level":"ชำนาญการ","group_name":"","role":"staff"}]}\n```\n' +
  'username เป็นอักษรอังกฤษตัวเล็ก/ตัวเลข/. _ - 3–32 ตัว (ถ้าไม่ได้ระบุ ให้ถอดจากชื่อจริงเป็นภาษาอังกฤษ), role เป็น staff เว้นแต่สั่งให้เป็น admin, ' +
  'ห้ามใส่รหัสผ่าน (ระบบสุ่มให้) ห้ามแต่งข้อมูลที่ไม่ได้บอก ถ้าข้อมูลไม่พอ (เช่นไม่มีชื่อ) ให้ถามก่อนโดยไม่ใส่บล็อก';

function extractUserAction(out) {
  const m = out.match(/```action\s*([\s\S]*?)```/);
  if (!m) return { text: out.trim(), action: null };
  const text = out.replace(m[0], '').trim();
  try {
    const a = JSON.parse(m[1]);
    const s = v => String(v || '').trim().slice(0, 200);
    const users = (Array.isArray(a.users) ? a.users : []).slice(0, 50).map(u => ({
      username: s(u.username).toLowerCase(), name: s(u.name), position: s(u.position), level: s(u.level),
      group_name: s(u.group_name), role: u.role === 'admin' ? 'admin' : 'staff'
    })).filter(u => u.username && u.name);
    return { text, action: a.type === 'create_users' && users.length ? { type: 'create_users', users } : null };
  } catch (e) {
    return { text, action: null };
  }
}

app.post('/api/ai/chat', auth, wrap(async (req, res) => {
  const hist = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .slice(-10)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text || '').slice(0, 4000) }));
  try {
    const system = 'คุณคือผู้ช่วย AI ของระบบแฟ้มสะสมงานอิเล็กทรอนิกส์ สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา สอศ. ' +
      'ตอบภาษาไทยสุภาพ กระชับ ถูกต้องตามแบบราชการ ไม่ตัดสินผลประเมินแทนผู้ประเมิน. ' + (await portfolioContext(uid(req))) +
      (isAdmin(req) ? AI_ADMIN_USERS : '');
    const out = (await callLLM([{ role: 'system', content: system }, ...hist])) || '';
    const { text, action } = isAdmin(req) ? extractUserAction(out) : { text: out, action: null };
    res.json({ text: text || (action ? 'ตรวจสอบรายชื่อด้านล่าง แล้วกด “ยืนยันเพิ่มผู้ใช้”' : '(ไม่มีคำตอบ)'), action });
  } catch (e) {
    res.status(422).json({ error: e.message || 'AI ตอบกลับผิดพลาด' });
  }
}));

app.post('/api/ai/polish', auth, wrap(async (req, res) => {
  const data = String(req.body.data || '').slice(0, 6000);
  try {
    const text = await callLLM([
      { role: 'system', content: 'เรียบเรียงข้อมูลผลการปฏิบัติงานเป็นย่อหน้าภาษาไทยแบบราชการสำหรับแฟ้มสะสมงาน ไม่เกิน 120 คำ ห้ามแต่งข้อมูลเพิ่ม' },
      { role: 'user', content: data }
    ]);
    res.json({ text });
  } catch (e) {
    res.status(422).json({ error: e.message || 'AI ตอบกลับผิดพลาด' });
  }
}));

// ---------- Admin: users ----------
app.get('/api/users', admin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.name,u.position,u.level,u.group_name,u.role,
            (SELECT count(*)::int FROM works w WHERE w.user_id=u.id) AS works
     FROM users u ORDER BY u.id`
  );
  res.json(rows);
}));

app.post('/api/users', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ 3–32 ตัว (a-z 0-9 . _ -)' });
  // ไม่ส่งรหัสผ่านมา (เช่นเพิ่มผ่านผู้ช่วย AI) -> สุ่มให้และส่งกลับครั้งเดียว
  const generated = b.generatePassword ? crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) : null;
  if (generated) b.password = generated;
  if (!b.name || !b.password || String(b.password).length < 8) return res.status(400).json({ error: 'กรุณาระบุชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users(username,password_hash,name,position,level,group_name,supervisor,role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [username, await bcrypt.hash(String(b.password), 10), b.name, b.position || null, b.level || null,
        b.group_name || null, b.supervisor || null, b.role === 'admin' ? 'admin' : 'staff']
    );
    await seed.seedUserData(client, rows[0].id, false);
    await client.query('COMMIT');
    audit(uid(req), 'user_create', username);
    res.json({ id: rows[0].id, password: generated || undefined });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- Errors / SPA fallback ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /ไม่รองรับไฟล์|เนื้อหาไม่ตรงกับนามสกุล/.test(err.message)) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 50 MB' : err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

(async () => {
  await migrate();
  if (await seed(pool)) console.log('Seeded demo data — users: admin / staff (password = SEED_PASSWORD)');
  app.listen(PORT, () => console.log('BPCD e-Portfolio running at http://localhost:' + PORT));
})().catch(e => {
  console.error('Startup failed:', e.message);
  console.error('ตรวจสอบว่า PostgreSQL ทำงานอยู่ และ DATABASE_URL ใน .env ถูกต้อง');
  process.exit(1);
});
