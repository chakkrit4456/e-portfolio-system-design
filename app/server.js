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
const security = require('./security');

const PORT = process.env.PORT || 3000;
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
const IS_PROD = process.env.NODE_ENV === 'production' || COOKIE_SECURE;
// SESSION_SECRET signs sessions/CSRF and encrypts the stored AI key — refuse weak/placeholder values in production
const SECRET = (() => {
  const s = process.env.SESSION_SECRET || '';
  if (s.length >= 32 && !/change-me|dev-secret/i.test(s)) return s;
  if (IS_PROD) {
    console.error('SESSION_SECRET ไม่ได้ตั้งหรืออ่อนเกินไป (ต้องยาว ≥ 32 ตัวอักษรและไม่ใช่ค่าตัวอย่าง) — สุ่มใหม่ด้วย: openssl rand -hex 48');
    process.exit(1);
  }
  if (s) { console.warn('คำเตือน: SESSION_SECRET อ่อนเกินไป — ใช้ได้เฉพาะตอนพัฒนาเท่านั้น'); return s; }
  // Dev without SESSION_SECRET: random secret kept in a git-ignored file (no hardcoded fallback in source)
  const f = path.join(__dirname, '.dev-secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* create below */ }
  const gen = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, gen, { mode: 0o600 });
  console.warn('คำเตือน: ไม่ได้ตั้ง SESSION_SECRET — สร้างค่าสุ่มไว้ที่ .dev-secret (ใช้ได้เฉพาะตอนพัฒนาเท่านั้น)');
  return gen;
})();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Resolve a stored upload name to a path that can never leave UPLOAD_DIR
function uploadPath(name) {
  const p = path.join(UPLOAD_DIR, path.basename(String(name)));
  if (path.dirname(p) !== UPLOAD_DIR) throw new Error('invalid file name');
  return p;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const WORK_TYPES = ['โครงการ', 'งานประจำ', 'วิชาการ', 'ยุทธศาสตร์', 'บริการ', 'เร่งด่วน'];
const WORK_STATUSES = ['รอตรวจสอบ', 'กำลังดำเนินการ', 'รอหลักฐาน', 'รับรองแล้ว'];
const EV_STATUSES = ['รอตรวจสอบ', 'ตรวจแล้ว'];

// ---------- API key encryption (AES-256-GCM) ----------
// AI_ENC_KEY (if set) is used so rotating SESSION_SECRET doesn't lose the stored key; the SESSION_SECRET-derived
// key stays as a fallback for decrypting values saved before AI_ENC_KEY existed (re-encrypted on next save).
const deriveKey = k => crypto.createHash('sha256').update('ai-key:' + k).digest();
const DEC_KEYS = [process.env.AI_ENC_KEY && deriveKey(process.env.AI_ENC_KEY), deriveKey(SECRET)].filter(Boolean);
const ENC_KEY = DEC_KEYS[0];
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
  const raw = Buffer.from(blob.slice(4), 'base64');
  for (const key of DEC_KEYS) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    } catch { /* try next key */ }
  }
  return '';
}

async function getAi() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='ai'");
  const v = rows[0] ? rows[0].value : {};
  return { provider: 'openrouter', baseUrl: '', model: '', ...v, apiKey: decrypt(v.apiKey) };
}
function aiReady(a) {
  return !!(a.baseUrl && a.model && (a.apiKey || a.provider === 'local'));
}
// SSRF guard for the admin-configured AI endpoint: http(s) only; cloud-metadata/link-local always blocked;
// loopback/private networks only for the "Local LLM" provider, and every other provider must use https.
const net = require('net');
function ipBlocked(ip, allowPrivate) {
  if (net.isIPv6(ip) && /^::ffff:/i.test(ip)) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || (a === 169 && b === 254) || a >= 224) return true; // unspecified, link-local/metadata, multicast
    const priv = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    return priv && !allowPrivate;
  }
  const v = ip.toLowerCase();
  if (v === '::' || /^fe[89ab]/.test(v) || /^ff/.test(v)) return true;
  return (v === '::1' || /^f[cd]/.test(v)) && !allowPrivate;
}
// Pin the connection to addresses validated at connect time — the DNS check and the actual connect use the
// same lookup, so DNS rebinding between check and fetch (TOCTOU) can't reach a blocked address.
function guardedLookup(allowPrivate) {
  return (hostname, opts, cb) => {
    require('dns').lookup(hostname, { ...opts, all: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length || addrs.some(x => ipBlocked(x.address, allowPrivate))) {
        return cb(Object.assign(new Error('ปลายทางเป็นเครือข่ายภายในที่ไม่อนุญาต'), { code: 'EBLOCKED' }));
      }
      if (opts && opts.all) cb(null, addrs);
      else cb(null, addrs[0].address, addrs[0].family);
    });
  };
}
// Minimal fetch replacement over http(s).request using the guarded lookup; redirects are never followed.
function aiFetch(a, urlStr, { method = 'GET', headers = {}, body, timeout = 60000 } = {}) {
  const url = new URL(urlStr);
  const mod = url.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method, headers, lookup: guardedLookup(a.provider === 'local'), timeout }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > 10 * 1024 * 1024) return req.destroy(new Error('ข้อมูลตอบกลับใหญ่เกินไป'));
        chunks.push(c);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => JSON.parse(text) });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    req.on('error', e => reject(e.name === 'TimeoutError' ? e : Object.assign(new Error(e.message), { cause: e })));
    if (body) req.write(body);
    req.end();
  });
}
async function checkAiUrl(a) {
  let url;
  try { url = new URL(a.baseUrl); } catch { throw new Error('Base URL ไม่ถูกต้อง'); }
  const local = a.provider === 'local';
  if (!(url.protocol === 'https:' || (local && url.protocol === 'http:'))) throw new Error('Base URL ต้องเป็น https:// (http:// ใช้ได้เฉพาะ Local LLM)');
  const addrs = await require('dns').promises.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true })
    .catch(() => { throw new Error('หา DNS ของ ' + url.hostname + ' ไม่พบ'); });
  if (addrs.some(x => ipBlocked(x.address, local))) throw new Error('Base URL ชี้ไปยังเครือข่ายภายในที่ไม่อนุญาต (ใช้ได้เฉพาะผู้ให้บริการ Local LLM)');
  return url;
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
  await checkAiUrl(a);
  let r;
  try {
    r = await aiFetch(a, a.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: a.model, messages, temperature: 0.4 }),
      timeout: 60000
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
app.disable('x-powered-by');
// เวอร์ชันของไฟล์หน้าเว็บ — client เทียบกับ header นี้เพื่อรู้ว่ามี deploy ใหม่และต้องรีเฟรช
const APP_VERSION = crypto.createHash('sha1')
  .update(['app.js', 'styles.css', 'index.html'].map(f => fs.readFileSync(path.join(__dirname, 'public', f))).join(''))
  .digest('hex').slice(0, 12);
// Security headers (minimal helmet equivalent, no extra dependency)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  if (COOKIE_SECURE) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use('/api', (req, res, next) => { res.set('X-App-Version', APP_VERSION); next(); });
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

  // Same response whether the user exists, is throttled, or the password is wrong (no username enumeration)
  const LOGIN_FAIL = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (หากผิดหลายครั้ง ระบบจะหน่วงเวลาชั่วครู่ กรุณารอแล้วลองใหม่)';
  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    return res.status(401).json({ error: LOGIN_FAIL });
  }

  const ok = u && (await bcrypt.compare(String(password || ''), u.password_hash));
  if (!u || !ok) {
    if (u) {
      const attempts = u.failed_attempts + 1;
      // Progressive delay (30s, 1m, 2m … capped at LOCKOUT_MS) rather than a long hard lock others could abuse
      const lock = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + Math.min(LOCKOUT_MS, 30000 * 2 ** Math.min(attempts - MAX_LOGIN_ATTEMPTS, 10))) : null;
      await pool.query('UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3', [attempts, lock, u.id]);
      if (lock) audit(u.id, 'account_locked');
    }
    return res.status(401).json({ error: LOGIN_FAIL });
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
// .doc/.xls must be OLE2 files; .csv must look like plain text (no binary, no HTML/SVG markup).
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
    case '.doc':
    case '.xls': return starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2 compound file
    case '.csv': { // plain text only: no binary bytes, no markup/script
      if (buf.includes(0)) return false;
      const head = buf.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
      return !/^</.test(head) && !/<(script|html|svg|iframe|body|object)\b/.test(head);
    }
    default: return false;
  }
}
async function verifyUploadedFiles(files) {
  for (const f of files) {
    const ext = path.extname(f.filename).toLowerCase();
    const fd = fs.openSync(uploadPath(f.filename), 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (!contentMatchesExt(ext, buf.subarray(0, n))) {
      for (const rm of files) fs.unlink(uploadPath(rm.filename), () => {});
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
  if (rows[0].file_name) fs.unlink(uploadPath(rows[0].file_name), () => {});
  audit(uid(req), 'evidence_delete', req.params.id);
  res.json({ ok: true });
}));

app.get('/files/:id', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT name,file_name FROM evidence WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  if (!rows[0] || !rows[0].file_name) return res.status(404).send('Not found');
  // Only types with a verified signature are shown inline; .doc/.xls/.csv (unchecked content) are forced to download
  const inline = /.(pdf|jpe?g|png|gif|webp|mp4|mov)$/i.test(rows[0].file_name);
  res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(rows[0].name));
  res.sendFile(uploadPath(rows[0].file_name));
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
  if (next.baseUrl) {
    try { await checkAiUrl(next); } catch (e) { return res.status(400).json({ error: e.message }); }
  }
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

// ตรวจความพร้อมของสิ่งที่ต้องใช้เชื่อมต่อ AI (ไม่เรียกโมเดล ไม่เสีย token)
app.get('/api/ai/check', admin, wrap(async (req, res) => {
  const items = [];
  const add = (name, ok, detail, fix) => items.push({ name, ok, detail, fix: ok ? '' : fix || '' });
  const nodeOk = ver => { const [a, b] = process.versions.node.split('.').map(Number); return a > ver[0] || (a === ver[0] && b >= ver[1]); };

  add('Node.js ≥ 20.6', nodeOk([20, 6]), 'v' + process.versions.node, 'อัปเกรด Node.js เป็น 20.6 ขึ้นไป (แนะนำ 22 LTS)');
  add('fetch / AbortSignal.timeout ในตัว', typeof fetch === 'function' && typeof AbortSignal.timeout === 'function',
    typeof fetch === 'function' ? 'มี' : 'ไม่มี', 'ต้องใช้ Node.js 18 ขึ้นไป');
  add('OpenSSL / TLS', !!process.versions.openssl, 'OpenSSL ' + (process.versions.openssl || '-'), 'ติดตั้ง Node.js รุ่นที่มี OpenSSL');

  const pkg = require('./package.json');
  const missing = Object.keys(pkg.dependencies || {}).filter(d => { try { require.resolve(d); return false; } catch (e) { return true; } });
  add('แพ็กเกจ npm (' + Object.keys(pkg.dependencies || {}).length + ' รายการ)', !missing.length,
    missing.length ? 'ขาด: ' + missing.join(', ') : 'ครบ', 'รันในโฟลเดอร์แอป: npm ci --omit=dev แล้วรีสตาร์ทบริการ');

  const a = await getAi();
  let key = true;
  try { const { rows } = await pool.query("SELECT value FROM settings WHERE key='ai'"); key = !(rows[0] && rows[0].value.apiKey && !a.apiKey); } catch (e) { /* ignore */ }
  add('ตั้งค่า Base URL และ Model', !!(a.baseUrl && a.model), a.baseUrl ? a.baseUrl + ' · ' + (a.model || '(ไม่มี model)') : 'ยังไม่ได้ตั้ง', 'กรอก Base URL และ Model แล้วกดบันทึก');
  add('API Key', a.provider === 'local' || !!a.apiKey, a.apiKey ? 'บันทึกไว้แล้ว (…' + a.apiKey.slice(-4) + ')' : a.provider === 'local' ? 'ไม่จำเป็นสำหรับ Local LLM' : key ? 'ยังไม่ได้ใส่' : 'ถอดรหัสไม่ได้',
    key ? 'ใส่ API Key แล้วกดบันทึก' : 'SESSION_SECRET เปลี่ยนไป — ใส่ API Key ใหม่แล้วกดบันทึก');

  if (a.baseUrl) {
    let url;
    try { url = new URL(a.baseUrl); } catch (e) { /* invalid */ }
    add('รูปแบบ Base URL', !!url && /^https?:$/.test(url.protocol), a.baseUrl, 'ต้องขึ้นต้นด้วย http:// หรือ https://');
    if (url) {
      try {
        const { address } = await require('dns').promises.lookup(url.hostname);
        add('DNS: ' + url.hostname, true, address);
        try {
          const headers = a.apiKey ? { Authorization: 'Bearer ' + a.apiKey } : {};
          await checkAiUrl(a);
          const r = await aiFetch(a, a.baseUrl.replace(/\/$/, '') + '/models', { headers, timeout: 10000 });
          add('เชื่อมต่อ HTTPS ถึง endpoint', true, 'ตอบกลับ HTTP ' + r.status);
          if (r.status === 401 || r.status === 403) add('API Key ใช้ได้', false, 'HTTP ' + r.status, 'API Key ไม่ถูกต้องหรือหมดอายุ — สร้าง key ใหม่ที่ผู้ให้บริการ');
          else if (r.ok && a.model) {
            const j = await r.json().catch(() => ({}));
            const ids = Array.isArray(j.data) ? j.data.map(m => m.id) : [];
            if (ids.length) add('มี model "' + a.model + '"', ids.includes(a.model), ids.includes(a.model) ? 'พบใน endpoint' : 'ไม่พบใน ' + ids.length + ' model', 'ตรวจชื่อ model ให้ตรงกับของผู้ให้บริการ');
          }
        } catch (e) {
          const why = e.name === 'TimeoutError' ? 'หมดเวลา 10 วินาที' : (e.cause && (e.cause.code || e.cause.message)) || e.message;
          add('เชื่อมต่อ HTTPS ถึง endpoint', false, why,
            /CERT|SSL|TLS/i.test(why) ? 'ใบรับรอง SSL: apt-get install -y ca-certificates แล้วรีสตาร์ทบริการ' : 'ตรวจ firewall/proxy ของเซิร์ฟเวอร์ให้ออก internet พอร์ต 443 ได้');
        }
      } catch (e) {
        add('DNS: ' + url.hostname, false, e.code || e.message, 'เซิร์ฟเวอร์หาชื่อโดเมนไม่เจอ — ตรวจ /etc/resolv.conf หรือการเชื่อมต่อ internet');
      }
    }
  }
  res.json({ ok: items.every(i => i.ok), items });
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
  'ห้ามใส่รหัสผ่าน (ระบบสุ่มให้) ห้ามแต่งข้อมูลที่ไม่ได้บอก ถ้าข้อมูลไม่พอ (เช่นไม่มีชื่อ) ให้ถามก่อนโดยไม่ใส่บล็อก. ' +
  'สำคัญ: คุณเพิ่มผู้ใช้เองไม่ได้ ห้ามตอบว่า "เพิ่มแล้ว/เรียบร้อยแล้ว" — ระบบจะแสดงปุ่มให้ผู้ดูแลกดยืนยันจากบล็อกนี้เท่านั้น';
const ADD_USER_RE = /(เพิ่ม|สร้าง|ลงทะเบียน|เปิดบัญชี).{0,20}(ผู้ใช้|บัญชี|user|สมาชิก|บุคลากร)|add\s*user|create\s*user/i;
const AI_USERS_JSON_ONLY = 'แปลงคำขอเพิ่มผู้ใช้ล่าสุดในบทสนทนาเป็น JSON อย่างเดียว ไม่มีข้อความอื่น รูปแบบ: ' +
  '{"type":"create_users","users":[{"username":"","name":"","position":"","level":"","group_name":"","role":"staff"}]} ' +
  'name = ชื่อ-นามสกุลตามที่ระบุ (ใส่คำนำหน้าถ้ามี), username = ถอดชื่อจริงเป็นอักษรอังกฤษตัวเล็ก เช่น chakkrit.s (3–32 ตัว a-z 0-9 . _ -), ' +
  'ช่องที่ไม่ได้ระบุให้เป็น "" ห้ามแต่ง. ถ้าไม่มีชื่อบุคคลเลย ตอบ {"type":"none"}';

function extractUserAction(out) {
  // โมเดลบางตัวใช้ ```json หรือไม่มี fence — รับทุกแบบที่มี "create_users"
  const m = [...out.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].find(x => x[1].includes('create_users')) ||
    out.match(/(\{[\s\S]*"create_users"[\s\S]*\})/);
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
    let { text, action } = isAdmin(req) ? extractUserAction(out) : { text: out, action: null };
    // โมเดลบางตัวตอบว่า "เพิ่มแล้ว" โดยไม่ส่งบล็อก — ถ้าคำสั่งล่าสุดเป็นการเพิ่มผู้ใช้ ให้ขอ JSON อย่างเดียวอีกรอบ
    const last = hist.length && hist[hist.length - 1].role === 'user' ? hist[hist.length - 1].content : '';
    if (isAdmin(req) && !action && ADD_USER_RE.test(last)) {
      const json = await callLLM([{ role: 'system', content: AI_USERS_JSON_ONLY }, ...hist.slice(-4)]).catch(() => '');
      const r = extractUserAction(json || '');
      if (r.action) action = r.action;
      else text = 'ยังไม่ได้เพิ่มผู้ใช้ครับ — ระบุชื่อ-นามสกุลของผู้ใช้ที่ต้องการเพิ่ม (และชื่อผู้ใช้ภาษาอังกฤษ ถ้ามี) แล้วลองใหม่อีกครั้ง';
    }
    if (action) {
      text = 'รายชื่อที่จะเพิ่ม (ยังไม่ได้บันทึก):\n' +
        action.users.map((u, n) => (n + 1) + '. ' + u.name + ' — ชื่อผู้ใช้: ' + u.username + (u.role === 'admin' ? ' (ผู้ดูแลระบบ)' : '')).join('\n') +
        '\n\nกด “ยืนยันเพิ่มผู้ใช้” ด้านล่างเพื่อบันทึก (ถ้าไม่เห็นปุ่ม ให้กด Ctrl+F5 แล้วสั่งใหม่)';
    }
    res.json({ text: text || '(ไม่มีคำตอบ)', action });
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
    `SELECT u.id,u.username,u.name,u.position,u.level,u.group_name,u.supervisor,u.duties,u.role,
            (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked,
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

// Log a user out everywhere (after role change, password reset or deletion)
async function killSessions(userId) {
  await pool.query("DELETE FROM session WHERE (sess->'user'->>'id')::int = $1", [userId]).catch(() => {});
}
async function adminCount(exceptId) {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE role='admin' AND id<>$1", [exceptId]);
  return rows[0].n;
}

app.put('/api/users/:id', admin, wrap(async (req, res) => {
  const id = +req.params.id;
  const b = req.body || {};
  const { rows: cur } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
  const u = cur[0];
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const username = String(b.username ?? u.username).trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ 3–32 ตัว (a-z 0-9 . _ -)' });
  const name = String(b.name ?? u.name).trim();
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อ-สกุล' });
  const role = b.role === 'admin' || b.role === 'staff' ? b.role : u.role;
  if (u.role === 'admin' && role !== 'admin') {
    if (id === uid(req)) return res.status(400).json({ error: 'ไม่สามารถลดสิทธิ์ผู้ดูแลระบบของตัวเองได้' });
    if (!(await adminCount(id))) return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' });
  }
  const password = String(b.password || '');
  if (password && password.length < 8) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
  const s = v => (v == null ? null : String(v).trim() || null);
  const pick = k => (k in b ? s(b[k]) : u[k]);
  try {
    await pool.query(
      `UPDATE users SET username=$1,name=$2,position=$3,level=$4,group_name=$5,supervisor=$6,duties=$7,role=$8,
         password_hash=COALESCE($9,password_hash),
         failed_attempts=CASE WHEN $10 THEN 0 ELSE failed_attempts END,
         locked_until=CASE WHEN $10 THEN NULL ELSE locked_until END
       WHERE id=$11`,
      [username, name, pick('position'), pick('level'), pick('group_name'), pick('supervisor'), pick('duties'), role,
        password ? await bcrypt.hash(password, 10) : null, !!b.unlock || !!password, id]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    throw e;
  }
  if (role !== u.role || password) await killSessions(id);
  if (id === uid(req)) req.session.user.name = name;
  audit(uid(req), 'user_update', username + (role !== u.role ? ' role=' + role : '') + (password ? ' password_reset' : ''));
  res.json({ ok: true });
}));

app.delete('/api/users/:id', admin, wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === uid(req)) return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  const { rows } = await pool.query('SELECT username,role FROM users WHERE id=$1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (rows[0].role === 'admin' && !(await adminCount(id))) return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' });
  const { rows: files } = await pool.query('SELECT file_name FROM evidence WHERE user_id=$1 AND file_name IS NOT NULL', [id]);
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
  for (const f of files) fs.unlink(uploadPath(f.file_name), () => {});
  await killSessions(id);
  audit(uid(req), 'user_delete', rows[0].username);
  res.json({ ok: true });
}));

// ---------- Admin: security scan (Snyk + DeepSeek + Claude) ----------
app.get('/api/security', admin, wrap(async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='security_scan'");
  res.json({ running: security.isRunning(), categories: security.CATEGORIES, result: rows[0] ? rows[0].value : null });
}));

app.post('/api/security/scan', admin, wrap(async (req, res) => {
  if (!security.isRunning()) {
    audit(uid(req), 'security_scan');
    // ใช้เวลาหลายนาที — รันเบื้องหลัง แล้วให้หน้าเว็บถาม GET /api/security ซ้ำจนเสร็จ
    security.runScan(result => pool.query(
      `INSERT INTO settings(key,value) VALUES('security_scan',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [JSON.stringify(result)]
    )).catch(e => console.error('security scan failed:', e));
  }
  res.json({ running: true });
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
